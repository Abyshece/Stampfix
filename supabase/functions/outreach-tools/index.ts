// supabase/functions/outreach-tools/index.ts
//
// Admin tools for Outreach (platform admins only):
//   { action: 'geocode', q }                     -> places matching a name, anywhere in the world
//   { action: 'find', place, category, radius_km, include_chains }
//                                                -> shops of that kind around the place (OpenStreetMap)
//   { action: 'scan', sites: [{ id, website }] } -> the email address and Instagram account each
//                                                   shop publishes on its own website
// Nothing is saved here; the admin panel saves what the admin keeps.
//
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY (always set by Supabase)
// Deploy:  supabase functions deploy outreach-tools

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import {
  CATEGORIES, overpassQuery, parseOverpass, guessTimezone, extractContacts, pickEmail, isPublicUrl, cleanWebsite,
  type Place,
} from './lib.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
// Identifies us to OpenStreetMap's free services, as their usage rules ask.
const UA = 'Stampfix-Outreach/1.0 (+https://stampfix.app; hello@stampfix.app)';
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
  const rows = await res.json() as Array<{ display_name: string; lat: string; lon: string; type?: string; address?: Record<string, string> }>;
  return rows.map((r) => {
    const a = r.address ?? {};
    const country = (a.country_code ?? '').toUpperCase();
    const lat = Number(r.lat), lon = Number(r.lon);
    const region = a.state ?? a.province ?? a.region ?? a.state_district ?? null;
    return {
      label: r.display_name,
      lat, lon, country, region,
      city: a.city ?? a.town ?? a.village ?? a.municipality ?? a.suburb ?? a.county ?? null,
      timezone: country ? guessTimezone(country, region, lon) : null,
    };
  }).filter((p) => /^[A-Z]{2}$/.test(p.country) && Number.isFinite(p.lat) && Number.isFinite(p.lon));
}

async function find(body: { place?: Place & { lat: number; lon: number }; category?: string; radius_km?: number; include_chains?: boolean }) {
  const p = body.place;
  const category = String(body.category ?? '');
  if (!p || !CATEGORIES[category] || !/^[A-Z]{2}$/.test(String(p.country ?? ''))) throw new Error('bad_request');
  const query = overpassQuery(category, Number(p.lat), Number(p.lon), Number(body.radius_km ?? 5));
  let lastError = 'unavailable';
  for (const endpoint of OVERPASS) {
    try {
      const res = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
      }, 60000);
      if (!res.ok) { lastError = `map_${res.status}`; continue; }
      const data = await res.json();
      const place: Place = { city: p.city ?? null, region: p.region ?? null, country: p.country, timezone: p.timezone ?? null };
      const shops = parseOverpass(data, category, place);
      const chains = shops.filter((s) => s.chain).length;
      return { shops: body.include_chains ? shops : shops.filter((s) => !s.chain), chains_hidden: body.include_chains ? 0 : chains };
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'unavailable';
    }
  }
  throw new Error(`map_busy:${lastError}`);
}

async function readPage(url: string): Promise<string | null> {
  // Redirects are followed by hand (at most 3) so each hop is checked to be a public address.
  let res: Response | null = null;
  let at = url;
  for (let hop = 0; hop < 4; hop++) {
    if (!isPublicUrl(at)) return null;
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
  if (!res || !res.ok || !(res.headers.get('content-type') ?? '').includes('html')) return null;
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
  return new TextDecoder().decode(all);
}

async function scanOne(site: { id: string; website: string }) {
  const website = cleanWebsite(site.website);
  if (!website) return { id: site.id, email: null, email_source: null, instagram: null, error: 'no_website' };
  try {
    const home = await readPage(website);
    if (home === null) return { id: site.id, email: null, email_source: null, instagram: null, error: 'unreachable' };
    const first = extractContacts(home, website);
    let email = pickEmail(first.emails, website);
    let source = email ? website : null;
    let instagram = first.instagram[0] ?? null;
    // No address on the home page: try the contact page.
    for (const link of email ? [] : first.contactLinks.slice(0, 2)) {
      const page = await readPage(link).catch(() => null);
      if (!page) continue;
      const more = extractContacts(page, link);
      email = pickEmail(more.emails, website);
      instagram = instagram ?? more.instagram[0] ?? null;
      if (email) { source = link; break; }
    }
    return { id: site.id, email, email_source: source, instagram, error: null };
  } catch (e) {
    return { id: site.id, email: null, email_source: null, instagram: null, error: e instanceof Error && e.name === 'AbortError' ? 'timeout' : 'unreachable' };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  try {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Not authenticated' }, 401);
    const { data: isAdmin } = await userClient.rpc('is_platform_admin');
    if (isAdmin !== true) return json({ error: 'Forbidden' }, 403);

    const body = await req.json().catch(() => ({}));
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
    return json({ error: msg }, msg.startsWith('map_busy') ? 503 : msg === 'bad_request' || msg === 'unknown_category' || msg === 'bad_place' ? 400 : 500);
  }
});
