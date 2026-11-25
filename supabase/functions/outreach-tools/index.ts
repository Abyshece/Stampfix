// supabase/functions/outreach-tools/index.ts
//
// Admin tools for Outreach (platform admins only):
//   { action: 'status' }                         -> { places_key }: is the Geoapify key set?
//   { action: 'find', place, category, radius_km, include_chains }
//                                                -> shops of that kind around the place, from
//                                                   Geoapify (OpenStreetMap data on reliable servers)
//   { action: 'geocode', q }                     -> places matching a name (a fallback: the panel
//                                                   asks Photon from the admin's browser first)
//   { action: 'scan', sites: [{ id, website }] } -> the email address and Instagram account each
//                                                   shop publishes on its own website
//   { action: 'ai_test' }                        -> one small Gemini search, to check the key
//   { action: 'ai_tick' }                        -> the AI email finder: searches the next few
//                                                   shops in line (also called every minute by
//                                                   the database, with the x-outreach-secret header)
// Find and scan save nothing; the admin panel saves what the admin keeps.
// Without a Geoapify key, 'find' answers "no_places_key" at once and the
// panel uses the free Overpass servers from the admin's browser instead.
//
// The AI email finder asks Gemini (Google's AI) with Google Search
// where each shop publishes its email address, then reads those pages itself:
// an address is only used when a page shows it next to the shop's name (or
// it's on the shop's own website) and its domain receives email. The rest
// waits for a person. See supabase/migrations/20261129000000_outreach_ai.sql.
//
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (always set by Supabase);
//          GEOAPIFY_API_KEY (free at geoapify.com, 3,000 searches a day);
//          GEMINI_API_KEY (aistudio.google.com/apikey; Google Search needs billing on its
//          project, first 5,000 searches a month free); GEMINI_MODEL (optional)
// Deploy:  supabase functions deploy outreach-tools --no-verify-jwt   (it checks callers itself)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  CATEGORIES, geoapifyUrl, parseGeoapify, placesFromNominatim, extractContacts, pickEmail, isPublicUrl, cleanWebsite,
  type Place,
} from './lib.ts';
import {
  buildPrompt, geminiRequest, geminiUrl, modelChain, readGeminiReply, parseAnswer, classifyGeminiError, decide,
  emailsOnPage, nameOnPage, domainMatchesName, siteOf, hostOf, isWalledUrl, isFreeMail, mxFromDoh,
  type AiLead, type AiAnswer, type CheckedPage, type GeminiErrorKind, type GeminiReply,
} from './ai.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GEOAPIFY_KEY = (Deno.env.get('GEOAPIFY_API_KEY') ?? '').trim();
const GEMINI_KEY = (Deno.env.get('GEMINI_API_KEY') ?? '').trim();
const MODELS = modelChain(Deno.env.get('GEMINI_MODEL'));
// Supabase's runtime keeps a function running for work started with waitUntil.
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;
// Identifies us to OpenStreetMap's free services, as their usage rules ask.
const UA = 'Stampfix-Outreach/1.0 (+https://stampfix.app; hello@stampfix.app)';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-outreach-secret',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function geocode(q: string) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&q=${encodeURIComponent(q)}`;
  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } }, 15000);
  if (!res.ok) throw new Error(`geocode_${res.status}`);
  return placesFromNominatim(await res.json());
}

async function find(body: { place?: Place & { lat: number; lon: number }; category?: string; radius_km?: number; include_chains?: boolean }) {
  const p = body.place;
  const category = String(body.category ?? '');
  if (!p || !CATEGORIES[category] || !/^[A-Z]{2}$/.test(String(p.country ?? ''))) throw new Error('bad_request');
  if (!GEOAPIFY_KEY) throw new Error('no_places_key');
  const url = geoapifyUrl(category, Number(p.lat), Number(p.lon), Number(body.radius_km ?? 5), GEOAPIFY_KEY);
  const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 30000);
  // 401/403: wrong key; 429: today's free searches used up.
  if (!res.ok) throw new Error(`places_${res.status}`);
  const place: Place = { city: p.city ?? null, region: p.region ?? null, country: p.country, timezone: p.timezone ?? null };
  const shops = parseGeoapify(await res.json(), category, place);
  const chains = shops.filter((s) => s.chain).length;
  return {
    shops: body.include_chains ? shops : shops.filter((s) => !s.chain),
    chains_hidden: body.include_chains ? 0 : chains,
    source: 'geoapify',
  };
}

/**
 * A web page's HTML and its final address, or null. Redirects are followed
 * by hand (at most 3) so each hop is checked: public addresses only, and
 * none of the sites in skip (pages behind a login wall).
 */
async function readPage(url: string, skip?: (url: string) => boolean): Promise<{ html: string; url: string } | null> {
  let res: Response | null = null;
  let at = url;
  for (let hop = 0; hop < 4; hop++) {
    if (!isPublicUrl(at) || skip?.(at)) return null;
    res = await fetchWithTimeout(at, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'manual',
    }, 8000);
    const next = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (!next) break;
    try { await res.body?.cancel(); } catch { /* nothing to drop */ }
    at = new URL(next, at).toString();
    res = null;
  }
  if (!res || !res.ok || !(res.headers.get('content-type') ?? '').includes('html')) {
    try { await res?.body?.cancel(); } catch { /* nothing to drop */ }
    return null;
  }
  // Only the first ~1 MB: contact details are never further down than that.
  const reader = res.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < 1_000_000) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    size += value.length;
  }
  try { await reader.cancel(); } catch { /* already closed */ }
  const all = new Uint8Array(size);
  let pos = 0;
  for (const c of chunks) { all.set(c, pos); pos += c.length; }
  return { html: new TextDecoder().decode(all), url: at };
}

async function scanOne(site: { id: string; website: string }) {
  const website = cleanWebsite(site.website);
  if (!website) return { id: site.id, email: null, email_source: null, instagram: null, error: 'no_website' };
  try {
    const page = await readPage(website);
    if (page === null) return { id: site.id, email: null, email_source: null, instagram: null, error: 'unreachable' };
    // Links are read from where the site actually is (it may have moved to a new address).
    const first = extractContacts(page.html, page.url);
    let email = pickEmail(first.emails, website);
    let source = email ? page.url : null;
    let instagram = first.instagram[0] ?? null;
    // No address on the home page: try the contact page.
    for (const link of email ? [] : first.contactLinks.slice(0, 2)) {
      const next = await readPage(link).catch(() => null);
      if (!next) continue;
      const more = extractContacts(next.html, next.url);
      email = pickEmail(more.emails, website);
      instagram = instagram ?? more.instagram[0] ?? null;
      if (email) { source = next.url; break; }
    }
    return { id: site.id, email, email_source: source, instagram, error: null };
  } catch (e) {
    return { id: site.id, email: null, email_source: null, instagram: null, error: e instanceof Error && e.name === 'AbortError' ? 'timeout' : 'unreachable' };
  }
}

// ---- The AI email finder ------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
type Db = any;
type GeminiError = { kind: GeminiErrorKind; message: string; retrySec: number | null };

/** One Gemini request with Google Search, trying the next model when one can't be used or is used up today. */
async function askGemini(prompt: string, skipModels: Set<string>): Promise<{ reply: GeminiReply; model: string } | { error: GeminiError }> {
  let last: GeminiError | null = null;
  let daily = false;
  for (const model of MODELS) {
    if (skipModels.has(model)) continue;
    let res: Response;
    try {
      res = await fetchWithTimeout(geminiUrl(model), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
        body: JSON.stringify(geminiRequest(prompt, model)),
      }, 45000);
    } catch (e) {
      return { error: { kind: 'busy', message: e instanceof Error && e.name === 'AbortError' ? 'timeout' : 'network', retrySec: null } };
    }
    if (res.ok) {
      try { return { reply: readGeminiReply(await res.json()), model }; } catch { return { error: { kind: 'server', message: 'unreadable reply', retrySec: null } }; }
    }
    const err = classifyGeminiError(res.status, await res.text().catch(() => ''));
    console.warn('[outreach-tools] gemini', model, res.status, err.kind, err.message.slice(0, 160));
    if (err.kind === 'model' || err.kind === 'daily') {
      skipModels.add(model);
      daily = daily || err.kind === 'daily';
      last = err;
      continue;
    }
    return { error: err };
  }
  if (daily) return { error: { kind: 'daily', message: last?.message ?? '', retrySec: null } };
  return { error: last ?? { kind: 'model', message: 'no model', retrySec: null } };
}

const mxCache = new Map<string, 'ok' | 'none' | 'unknown'>();
/** Does the address's domain receive email (a mail server in DNS)? Asked over HTTPS. */
async function mxOf(email: string): Promise<'ok' | 'none' | 'unknown'> {
  const domain = email.split('@')[1] ?? '';
  if (!domain || isFreeMail(email)) return 'ok';
  const cached = mxCache.get(domain);
  if (cached) return cached;
  const ask = async (type: 'MX' | 'A') => {
    try {
      const res = await fetchWithTimeout(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`,
        { headers: { Accept: 'application/dns-json' } }, 5000);
      return res.ok ? mxFromDoh(await res.json(), type) : 'unknown';
    } catch { return 'unknown'; }
  };
  let r = await ask('MX');
  // No mail server listed: mail still goes to the domain's own address, if it has one.
  if (r === 'none') r = (await ask('A')) === 'ok' ? 'ok' : 'none';
  mxCache.set(domain, r);
  return r;
}

/** A website's home page and up to two contact pages, as checked pages. */
async function readSite(url: string, name: string, own: boolean | 'guess', deadline: number): Promise<{ pages: CheckedPage[]; instagram: string[]; reached: boolean; own: boolean }> {
  const start = cleanWebsite(url);
  const home = start && Date.now() < deadline ? await readPage(start, isWalledUrl).catch(() => null) : null;
  if (!home) return { pages: [], instagram: [], reached: false, own: false };
  const first = extractContacts(home.html, home.url);
  const namesShop = nameOnPage(home.html, name);
  const isOwn = own === 'guess' ? namesShop || domainMatchesName(home.url, name) : own;
  const pages: CheckedPage[] = [{ url: home.url, emails: emailsOnPage(home.html, home.url), namesShop, ownSite: isOwn }];
  const instagram = [...first.instagram];
  for (const link of first.contactLinks.slice(0, 2)) {
    if (Date.now() > deadline) break;
    const page = await readPage(link, isWalledUrl).catch(() => null);
    if (!page) continue;
    pages.push({ url: page.url, emails: emailsOnPage(page.html, page.url), namesShop: namesShop || nameOnPage(page.html, name), ownSite: isOwn });
    instagram.push(...extractContacts(page.html, page.url).instagram);
  }
  return { pages, instagram, reached: true, own: isOwn };
}

type LeadResult = {
  save: Record<string, unknown>;
  // Stop searching (and pause for this many minutes; null = until Google's free searches come back).
  stop?: { minutes: number | null; error: string };
};

const STOP_TEXT: Record<GeminiErrorKind, (m: string) => { minutes: number | null; error: string }> = {
  bad_key: () => ({ minutes: 60, error: 'Google doesn\'t accept the Gemini key. Check GEMINI_API_KEY in Supabase (Edge Functions, Secrets), then press Resume.' }),
  billing: () => ({ minutes: 60, error: 'Google Search in Gemini needs billing turned on for the key\'s Google project (aistudio.google.com, Billing). The first 5,000 searches a month are free. Then press Resume.' }),
  no_access: (m) => ({ minutes: 60, error: `Google refused the request: ${m}`.slice(0, 300) }),
  model: (m) => ({ minutes: 60, error: `No Gemini model could search Google: ${m}`.slice(0, 300) }),
  bad_request: (m) => ({ minutes: 60, error: `Google refused the request: ${m}`.slice(0, 300) }),
  daily: () => ({ minutes: null, error: 'Google\'s daily limit is reached. It carries on by itself after midnight Pacific time.' }),
  minute: () => ({ minutes: 1, error: 'Google asked to slow down. It carries on in a minute.' }),
  busy: () => ({ minutes: 3, error: 'Google\'s AI is busy right now. It tries again in a few minutes.' }),
  server: () => ({ minutes: 3, error: 'Google\'s AI had an error. It tries again in a few minutes.' }),
};

/** Looks for one shop's email address. */
async function searchLead(lead: AiLead, skipModels: Set<string>, deadline: number): Promise<LeadResult> {
  const pages: CheckedPage[] = [];
  const instagram: string[] = [];
  let websiteChecked = false;
  let newWebsite: string | null = null;
  const read = new Set<string>();
  const finish = async (answer: AiAnswer | null, extra: Record<string, unknown>): Promise<LeadResult> => {
    const site = lead.website ?? newWebsite;
    const candidates = [answer?.email, ...pages.filter((p) => p.ownSite).flatMap((p) => p.emails)].filter((e): e is string => !!e);
    const mx = new Map<string, 'ok' | 'none' | 'unknown'>();
    for (const e of [...new Set(candidates)].slice(0, 6)) mx.set(e, await mxOf(e));
    const d = decide(answer, pages, site, (e) => mx.get(e) ?? 'unknown');
    // Instagram: one the shop's own pages link to; the AI's only if a page shows it too.
    const handles = [...new Set(instagram.map((h) => h.toLowerCase()))];
    const ig = (answer?.instagram && handles.includes(answer.instagram.toLowerCase()) ? answer.instagram : null) ?? instagram[0] ?? null;
    return { save: { outcome: d.outcome, email: d.email, source: d.source, note: d.note, website: newWebsite, website_checked: websiteChecked, instagram: ig, ...extra } };
  };

  // 1. A website nobody has read yet: read it first (no AI needed if the address is there).
  if (lead.website && !lead.website_checked) {
    const own = await readSite(lead.website, lead.business_name, true, deadline);
    websiteChecked = true;
    own.pages.forEach((p) => read.add(p.url));
    pages.push(...own.pages);
    instagram.push(...own.instagram);
    if (own.pages.some((p) => p.emails.length)) {
      const r = await finish(null, {});
      if (r.save.outcome === 'found') return r;
    }
  }

  // 2. Ask Gemini, with Google Search.
  if (!GEMINI_KEY) return { save: { outcome: 'requeue' }, stop: { minutes: 60, error: 'GEMINI_API_KEY isn\'t set in Supabase (Edge Functions, Secrets).' } };
  const asked = await askGemini(buildPrompt(lead), skipModels);
  if ('error' in asked) {
    const stop = STOP_TEXT[asked.error.kind](asked.error.message);
    if (asked.error.kind === 'minute' && asked.error.retrySec) stop.minutes = Math.min(10, Math.max(1, Math.ceil(asked.error.retrySec / 60)));
    // Google's own error on this one request counts as a try; anything else isn't the shop's fault.
    return { save: asked.error.kind === 'server' ? { outcome: 'retry', note: 'Google\'s AI had an error.' } : { outcome: 'requeue' }, stop };
  }
  const { reply } = asked;
  const search = reply.queries[0] ?? null;
  if (reply.blocked || !reply.text) return finish({ email: null, email_page: null, website: null, instagram: null, note: 'The AI gave no answer.' }, { search });
  const answer = parseAnswer(reply.text) ?? { email: null, email_page: null, website: null, instagram: null, note: 'The AI\'s answer couldn\'t be read.' };

  // 3. The website the AI found, if the shop had none (or it's a different one).
  if (answer.website && Date.now() < deadline && (!lead.website || siteOf(hostOf(answer.website)) !== siteOf(hostOf(lead.website)))) {
    const s = await readSite(answer.website, lead.business_name, lead.website ? false : 'guess', deadline);
    s.pages.forEach((p) => read.add(p.url));
    pages.push(...s.pages);
    if (s.own) instagram.push(...s.instagram);
    if (s.reached && s.own && !lead.website) { newWebsite = answer.website; websiteChecked = true; }
  }

  // 4. The pages the AI says show the address, and the pages Google gave it.
  const confirmed = () => !!answer.email && pages.some((p) => p.emails.includes(answer.email!) && (p.ownSite || p.namesShop));
  if (answer.email && !confirmed()) {
    const ownSite = siteOf(hostOf(lead.website ?? newWebsite ?? ''));
    const urls = [answer.email_page, ...reply.sources.map((x) => x.uri)]
      .filter((u): u is string => !!u && !isWalledUrl(u) && !read.has(u)).slice(0, 5);
    let opened = 0;
    for (const u of [...new Set(urls)]) {
      if (opened >= 3 || Date.now() > deadline) break;
      const page = await readPage(u, isWalledUrl).catch(() => null);
      if (!page || read.has(page.url)) continue;
      opened++;
      read.add(page.url);
      const isOwn = !!ownSite && siteOf(hostOf(page.url)) === ownSite;
      pages.push({ url: page.url, emails: emailsOnPage(page.html, page.url), namesShop: nameOnPage(page.html, lead.business_name), ownSite: isOwn });
      if (isOwn) instagram.push(...extractContacts(page.html, page.url).instagram);
      if (confirmed()) break;
    }
  }
  return finish(answer, { search });
}

/** Searches the next few shops in line, for about a minute at most. */
async function aiTick(db: Db): Promise<{ searched: number; stopped: string | null }> {
  const end = Date.now() + 50_000;
  const skipModels = new Set<string>();
  let searched = 0;
  // About 4 shops a minute keeps within Gemini's free requests per minute.
  while (searched < 4 && Date.now() < end - 20_000) {
    const { data: claim, error } = await db.rpc('outreach_ai_claim');
    if (error) throw new Error(error.message);
    if (claim?.status !== 'work' || !claim.lead) break;
    const lead = claim.lead as AiLead;
    let r: LeadResult;
    try {
      r = await searchLead(lead, skipModels, Date.now() + 40_000);
    } catch (e) {
      console.error('[outreach-tools] ai search', lead.id, e instanceof Error ? e.message : e);
      r = { save: { outcome: 'retry', note: 'Something went wrong during the search.' } };
    }
    const saved = await db.rpc('outreach_ai_save', { p_id: lead.id, p: r.save });
    if (saved.error) throw new Error(saved.error.message);
    searched++;
    if (r.stop) {
      await db.rpc('outreach_ai_pause', { p_minutes: r.stop.minutes, p_error: r.stop.error });
      return { searched, stopped: r.stop.error };
    }
  }
  return { searched, stopped: null };
}

/** One small search, so the admin can see that the key works. */
async function aiTest(): Promise<Record<string, unknown>> {
  if (!GEMINI_KEY) return { ok: false, error: 'GEMINI_API_KEY isn\'t set in Supabase (Edge Functions, Secrets).' };
  const asked = await askGemini('Use Google Search: what is the official website of the Vancouver Art Gallery? Answer with only the URL.', new Set());
  if ('error' in asked) return { ok: false, kind: asked.error.kind, error: STOP_TEXT[asked.error.kind](asked.error.message).error };
  return { ok: true, model: asked.model, searched_google: asked.reply.queries.length > 0 || asked.reply.sources.length > 0, answer: asked.reply.text.slice(0, 200) };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // The database's job every minute: the secret header, for the AI email finder only.
    const secret = req.headers.get('x-outreach-secret')?.trim() ?? '';
    if (secret) {
      const { data: okSecret } = await service.rpc('outreach_secret_ok', { p_secret: secret });
      if (okSecret !== true || body.action !== 'ai_tick') return json({ error: 'Forbidden' }, 403);
    } else {
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return json({ error: 'Not authenticated' }, 401);
      const { data: isAdmin } = await userClient.rpc('is_platform_admin');
      if (isAdmin !== true) return json({ error: 'Forbidden' }, 403);
    }

    if (body.action === 'ai_tick') {
      const job = aiTick(service).catch((e) => {
        console.error('[outreach-tools] ai_tick', e instanceof Error ? e.message : e);
        return { searched: 0, stopped: 'error' };
      });
      // Answer at once and keep working in the background, so the caller never waits or times out.
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
        EdgeRuntime.waitUntil(job);
        return json({ started: true });
      }
      return json(await job);
    }
    if (body.action === 'ai_test') return json(await aiTest());
    if (body.action === 'status') return json({ places_key: !!GEOAPIFY_KEY, ai_key: !!GEMINI_KEY });
    if (body.action === 'geocode') {
      const q = String(body.q ?? '').trim().slice(0, 200);
      if (q.length < 2) return json({ places: [] });
      return json({ places: await geocode(q) });
    }
    if (body.action === 'find') return json(await find(body));
    if (body.action === 'scan') {
      const sites = (Array.isArray(body.sites) ? body.sites : []).slice(0, 6)
        .filter((s: { id?: unknown; website?: unknown }) => typeof s?.id === 'string' && typeof s?.website === 'string');
      return json({ results: await Promise.all(sites.map(scanOne)) });
    }
    return json({ error: 'unknown_action' }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error';
    console.error('[outreach-tools]', msg);
    const status = /^(map_busy|places_)/.test(msg) ? 503
      : ['bad_request', 'unknown_category', 'bad_place', 'no_places_key'].includes(msg) ? 400 : 500;
    return json({ error: msg }, status);
  }
});
