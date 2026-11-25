// Pure helpers for the AI email finder in outreach-tools (no Deno APIs, so
// they can be tested with Node): the question for Gemini, reading its answer
// and its errors, and checking an address against the web pages it was
// published on. See supabase/migrations/20261129000000_outreach_ai.sql.

import { cleanInstagram, cleanWebsite, extractContacts, isPublicUrl, isUsableEmail } from './lib.ts';

export type AiLead = {
  id: string; business_name: string; category: string | null; category_key: string | null;
  city: string | null; region: string | null; country: string; address: string | null; phone: string | null;
  website: string | null; website_checked: boolean; instagram: string | null; attempt: number;
};

export type AiAnswer = {
  email: string | null; email_page: string | null; website: string | null; instagram: string | null; note: string | null;
};

// ---- The question ------------------------------------------------------------------------

function countryName(code: string): string {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase()) ?? code; } catch { return code; }
}

export function buildPrompt(l: AiLead): string {
  const where = [l.address, l.city, l.region, countryName(l.country)]
    .flatMap((x) => (x ?? '').split(',')).map((x) => x.trim()).filter(Boolean)
    // "123 Main St, Vancouver, Vancouver" -> each part once.
    .filter((x, i, all) => all.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i).join(', ');
  return [
    'Use Google Search to find the public contact email address of this local business.',
    '',
    `Business name: ${l.business_name}`,
    l.category ? `Kind of business: ${l.category}` : null,
    `Location: ${where}`,
    l.phone ? `Phone: ${l.phone}` : null,
    `Website: ${l.website ?? 'not known'}`,
    '',
    'Look at its own website (contact and about pages), its Google Business listing, its Facebook and Instagram pages and local directories.',
    '',
    'Rules:',
    '- Only give an email address you actually saw published for this exact business (same name, same city). Never guess, complete or make up an address, for example from the website\'s domain.',
    '- Not the address of a different business with a similar name, a head office of a chain, a booking or delivery platform, or a directory.',
    '- If you find no address, use null. No answer is fine; a wrong address is not.',
    '',
    'Answer with only this JSON object and no other text:',
    '{"email": "the address, or null", "email_page": "the full URL of the page where you saw the address, or null", "website": "the business\'s own website, or null", "instagram": "its Instagram username without @, or null", "note": "one short sentence: where you found the address, or why there is none"}',
  ].filter((x) => x !== null).join('\n');
}

export function geminiRequest(prompt: string, model: string): Record<string, unknown> {
  return {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: {
      temperature: 0,
      // A little thinking helps tell the right shop from namesakes; 2.5 models only.
      ...(/^gemini-2\.5-/.test(model) ? { thinkingConfig: { thinkingBudget: 1024 } } : {}),
    },
  };
}

export const geminiUrl = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

/** The models to try, best first: GEMINI_MODEL if set, then the two with free Google Search. */
export function modelChain(envModel: string | null | undefined): string[] {
  const chain = [(envModel ?? '').trim(), 'gemini-2.5-flash', 'gemini-2.5-flash-lite'].filter((m) => /^[a-z0-9.-]{3,60}$/i.test(m));
  return [...new Set(chain)];
}

// ---- Gemini's reply ----------------------------------------------------------------------

export type GeminiReply = { text: string; sources: Array<{ uri: string; title: string }>; queries: string[]; blocked: string | null };

export function readGeminiReply(json: unknown): GeminiReply {
  const j = (json ?? {}) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: unknown; thought?: unknown }> };
      finishReason?: string;
      groundingMetadata?: { webSearchQueries?: unknown[]; groundingChunks?: Array<{ web?: { uri?: unknown; title?: unknown } }> };
    }>;
    promptFeedback?: { blockReason?: string };
  };
  const c = j.candidates?.[0];
  const text = (c?.content?.parts ?? [])
    .filter((p) => typeof p.text === 'string' && p.thought !== true).map((p) => p.text as string).join('').trim();
  const sources: Array<{ uri: string; title: string }> = [];
  for (const ch of c?.groundingMetadata?.groundingChunks ?? []) {
    const uri = typeof ch.web?.uri === 'string' ? ch.web.uri : '';
    if (/^https?:\/\//.test(uri)) sources.push({ uri, title: typeof ch.web?.title === 'string' ? ch.web.title : '' });
  }
  const queries = (c?.groundingMetadata?.webSearchQueries ?? []).filter((x): x is string => typeof x === 'string' && !!x.trim());
  const blocked = j.promptFeedback?.blockReason ?? (c && !text && c.finishReason && c.finishReason !== 'STOP' ? c.finishReason : null) ?? (!c ? 'NO_ANSWER' : null);
  return { text, sources, queries, blocked };
}

export function cleanEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const e = raw.trim().replace(/^mailto:/i, '').replace(/[<>()"'\s]/g, '').replace(/\.$/, '').toLowerCase();
  if (!e || e === 'null' || e.length > 254 || !isUsableEmail(e)) return null;
  // Placeholders an AI sometimes writes instead of null.
  const [local, domain] = e.split('@');
  if (['example', 'test', 'invalid', 'localhost'].includes(domain.split('.').pop() ?? '')) return null;
  if (/^(email|name|your-?email|address)$/.test(local) || /^(domain|business|website|yourbusiness|company)\./.test(domain)) return null;
  return e;
}

const cleanUrl = (raw: unknown): string | null => {
  if (typeof raw !== 'string' || !/^https?:\/\//i.test(raw.trim())) return null;
  try {
    const u = new URL(raw.trim());
    return isPublicUrl(u.toString()) ? u.toString().slice(0, 500) : null;
  } catch { return null; }
};

// What an AI writes instead of null.
const NOTHING = /^(null|none|n\/?a|unknown|not found|-)?$/i;

/** The JSON in the AI's answer, checked field by field. Null when there's no readable answer. */
export function parseAnswer(text: string): AiAnswer | null {
  const t = text.replace(/```(?:json)?/gi, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  let o: Record<string, unknown> | null = null;
  if (start >= 0 && end > start) {
    try { o = JSON.parse(t.slice(start, end + 1)); } catch { o = null; }
  }
  if (!o || typeof o !== 'object') {
    // Not JSON after all: an answer that names exactly one address still counts.
    const found = [...new Set((t.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []).map((e) => e.toLowerCase()))];
    if (found.length !== 1) return null;
    return { email: cleanEmail(found[0]), email_page: null, website: null, instagram: null, note: null };
  }
  const site = typeof o.website === 'string' ? cleanWebsite(o.website) : null;
  return {
    email: cleanEmail(o.email),
    email_page: cleanUrl(o.email_page),
    website: site && isPublicUrl(site) && !isDirectoryUrl(site) ? site : null,
    instagram: typeof o.instagram === 'string' && !NOTHING.test(o.instagram.trim()) ? cleanInstagram(o.instagram) : null,
    note: typeof o.note === 'string' && o.note.trim() ? o.note.trim().replace(/\s+/g, ' ').slice(0, 300) : null,
  };
}

// ---- Gemini's errors ---------------------------------------------------------------------

export type GeminiErrorKind =
  | 'bad_key'      // the key is wrong or expired: fix GEMINI_API_KEY
  | 'no_access'    // the key may not use this (blocked, region, project)
  | 'model'        // this model can't be used (or can't search Google): try the next one
  | 'daily'        // today's free requests for this model are used up
  | 'minute'       // too many requests this minute
  | 'busy'         // Google is overloaded or slow: later
  | 'server'       // an error on Google's side for this request
  | 'bad_request'; // anything else Google refused

export function classifyGeminiError(status: number, body: string): { kind: GeminiErrorKind; message: string; retrySec: number | null } {
  let message = body.slice(0, 300);
  let detail = body;
  try {
    const j = JSON.parse(body) as { error?: { message?: string; status?: string; details?: unknown } };
    if (j.error?.message) message = j.error.message.slice(0, 300);
    detail = JSON.stringify(j.error ?? j);
  } catch { /* not JSON */ }
  const delay = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(detail);
  const retrySec = delay ? Math.ceil(Number(delay[1])) : null;
  const all = `${message} ${detail}`;
  if (status === 401 || /API[_ ]key (not valid|expired|invalid)|API_KEY_INVALID|API key not found/i.test(all)) return { kind: 'bad_key', message, retrySec };
  if (status === 403) return { kind: 'no_access', message, retrySec };
  if (status === 404 || (status === 400 && /\bmodels?\b|grounding|google_search/i.test(message))) return { kind: 'model', message, retrySec };
  if (status === 429) return { kind: /PerDay|per day|daily|quota_exceeded/i.test(all) ? 'daily' : 'minute', message, retrySec };
  if (status === 500) return { kind: 'server', message, retrySec };
  if (status === 408 || status >= 500) return { kind: 'busy', message, retrySec };
  return { kind: 'bad_request', message, retrySec };
}

// ---- Checking an address -----------------------------------------------------------------

// Two-part endings, so "shop.co.uk" isn't taken for the same site as "other.co.uk".
const SECOND_LEVEL = /^(co|com|net|org|gov|edu|ac|or|ne|go|gob|nom|ltd|plc|biz|info)$/;

/** "www.shop.co.uk" -> "shop.co.uk", "mail.beanthere.ca" -> "beanthere.ca". */
export function siteOf(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, '').replace(/\.$/, '').split('.');
  if (parts.length >= 3 && SECOND_LEVEL.test(parts[parts.length - 2]) && parts[parts.length - 1].length === 2) return parts.slice(-3).join('.');
  return parts.slice(-2).join('.');
}
export function hostOf(url: string | null | undefined): string {
  try { return url ? new URL(url).hostname.toLowerCase().replace(/^www\./, '') : ''; } catch { return ''; }
}

// Pages servers can't read (they show a login wall), so they aren't fetched.
const WALLED = /(^|\.)(facebook\.com|fb\.com|fb\.me|instagram\.com|tiktok\.com|x\.com|twitter\.com|linkedin\.com|threads\.net|pinterest\.[a-z.]+|youtube\.com)$/;
// Directories, maps and platforms: they list shops but aren't a shop's own website.
const DIRECTORY = /(^|\.)(yelp\.[a-z.]+|tripadvisor\.[a-z.]+|google\.[a-z.]+|goo\.gl|foursquare\.com|opentable\.[a-z.]+|ubereats\.com|doordash\.com|skipthedishes\.com|grubhub\.com|zomato\.com|yellowpages\.[a-z.]+|yp\.ca|canada411\.ca|411\.ca|bbb\.org|mapquest\.com|waze\.com|apple\.com|bing\.com|linktr\.ee|toasttab\.com|clover\.com|ritual\.co|fantuan\.ca|wanderlog\.com|restaurantguru\.com|happycow\.net|wikipedia\.org|vertexaisearch\.cloud\.google\.com)$/;

export const isWalledUrl = (url: string) => WALLED.test(hostOf(url));
export const isDirectoryUrl = (url: string) => WALLED.test(hostOf(url)) || DIRECTORY.test(hostOf(url));

// Big free mail services: an address there can belong to any shop.
const FREE_MAIL = new Set(['gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.ca', 'outlook.com', 'live.com', 'live.ca', 'msn.com',
  'yahoo.com', 'yahoo.ca', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'shaw.ca', 'telus.net',
  'rogers.com', 'sympatico.ca', 'bell.net', 'gmx.com', 'gmx.de', 'web.de', 'hotmail.co.uk', 'yahoo.co.uk', 'btinternet.com']);
export const isFreeMail = (email: string) => FREE_MAIL.has(email.split('@')[1] ?? '');

function pageText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&apos;|&#39;|&rsquo;|&lsquo;/gi, "'");
}

const simplify = (s: string) => ` ${s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()} `;

// Words in many shop names: they don't tell two shops apart.
const GENERIC = new Set(['the', 'and', 'cafe', 'caffe', 'coffee', 'coffeehouse', 'espresso', 'bar', 'tea', 'teahouse', 'house', 'shop',
  'kitchen', 'bakery', 'restaurant', 'bistro', 'eatery', 'co', 'company', 'ltd', 'inc', 'llc', 'corp', 'roasters', 'roastery',
  'studio', 'salon', 'spa', 'des', 'les', 'del', 'der', 'die', 'das', 'von', 'van', 'cafes', 'deli', 'place', 'lounge']);

/** Does the page name this shop? Every telling word of the name, or the whole name. */
export function nameOnPage(html: string, name: string): boolean {
  const page = simplify(pageText(html));
  const n = simplify(name);
  if (n.trim().length < 2) return false;
  if (page.includes(n)) return true;
  const words = n.trim().split(' ').filter((w) => w.length >= 3 && !GENERIC.has(w));
  return words.length > 0 && words.every((w) => page.includes(` ${w} `));
}

/** Email addresses on a page, also written as "name [at] shop [dot] ca". */
export function emailsOnPage(html: string, url: string): string[] {
  const found = new Set(extractContacts(html, url).emails);
  const text = pageText(html)
    .replace(/\s*[[({]\s*at\s*[\])}]\s*|\s+at\s+(?=[a-z0-9-]+\s*[[({]?\s*dot)/gi, '@')
    .replace(/\s*[[({]\s*dot\s*[\])}]\s*|\s+dot\s+/gi, '.');
  for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
    const e = m[0].toLowerCase();
    if (isUsableEmail(e)) found.add(e);
  }
  return [...found];
}

export type CheckedPage = { url: string; emails: string[]; namesShop: boolean; ownSite: boolean };

export type Decision = {
  outcome: 'found' | 'suggested' | 'not_found';
  email: string | null;
  source: string | null;
  note: string;
};

const short = (url: string) => {
  try { const u = new URL(url); return (u.hostname.replace(/^www\./, '') + (u.pathname === '/' ? '' : u.pathname)).slice(0, 80); } catch { return url.slice(0, 80); }
};

/**
 * What to do with the AI's answer, given the pages that could be read.
 * "found" (used, and queued if switched on) only when the address is on the
 * shop's own website, or on a page that also names the shop; and, unless
 * it's a free mail address, its domain matches the shop's website when that
 * is known. Anything else the AI says waits for a person ("suggested").
 */
export function decide(answer: AiAnswer | null, pages: CheckedPage[], website: string | null, mx: (email: string) => 'ok' | 'none' | 'unknown'): Decision {
  const site = website ? siteOf(hostOf(website)) : '';
  const fitsSite = (email: string) => isFreeMail(email) || !site || siteOf(email.split('@')[1]) === site;

  // 1. The AI's address, seen on a page that is the shop's or names it.
  const aiRaw = answer?.email ?? null;
  const dead = aiRaw !== null && mx(aiRaw) === 'none';
  const ai = dead ? null : aiRaw;
  if (ai) {
    const seen = pages.find((p) => p.emails.includes(ai) && (p.ownSite || p.namesShop));
    if (seen && (seen.ownSite || fitsSite(ai))) {
      return { outcome: 'found', email: ai, source: seen.url, note: `Seen on ${short(seen.url)}` };
    }
  }
  // 2. An address on the shop's own website (the AI pointed us to it).
  // (Only addresses on the shop's domain or a free mail service: not the web designer's.)
  const own = pages.filter((p) => p.ownSite).flatMap((p) => p.emails.map((e) => ({ e, url: p.url }))).filter((x) => fitsSite(x.e));
  const ownPick = own.find((x) => site && siteOf(x.e.split('@')[1]) === site) ?? own.find((x) => /^(info|hello|hi|contact|owner|team|office|mail)@/.test(x.e)) ?? own[0];
  if (ownPick && mx(ownPick.e) !== 'none') {
    return { outcome: 'found', email: ownPick.e, source: ownPick.url, note: `On their website: ${short(ownPick.url)}` };
  }
  // 3. The AI's address that no readable page confirms: a person decides.
  if (ai) {
    const where = answer?.email_page ? short(answer.email_page) : null;
    const seenElsewhere = pages.find((p) => p.emails.includes(ai));
    const note = seenElsewhere && !fitsSite(ai)
      ? `On ${short(seenElsewhere.url)}, but it isn't on the shop's own domain (${site}).`
      : seenElsewhere
        ? `On ${short(seenElsewhere.url)}, but that page doesn't name the shop.`
        : where
          ? `The AI saw it on ${where}, but that page couldn't be checked.`
          : 'The AI found it, but no page we could open shows it.';
    return { outcome: 'suggested', email: ai, source: answer?.email_page ?? seenElsewhere?.url ?? null, note };
  }
  if (dead) return { outcome: 'not_found', email: null, source: null, note: `The AI found ${aiRaw}, but that domain doesn't receive email.` };
  return { outcome: 'not_found', email: null, source: null, note: answer?.note ?? 'No public email address found.' };
}

// ---- Does the domain receive email? (DNS over HTTPS) ---------------------------------------

/** Reads a DNS-over-HTTPS JSON answer: 'ok' with a mail server, 'none' when the domain has none. */
export function mxFromDoh(json: unknown, type: 'MX' | 'A'): 'ok' | 'none' | 'unknown' {
  const j = json as { Status?: number; Answer?: Array<{ type?: number; data?: string }> } | null;
  if (!j || typeof j.Status !== 'number') return 'unknown';
  if (j.Status === 3) return 'none'; // no such domain
  if (j.Status !== 0) return 'unknown';
  const want = type === 'MX' ? 15 : 1;
  const rows = (j.Answer ?? []).filter((a) => a.type === want);
  if (type === 'MX' && rows.length && rows.every((a) => /^0\s+\.?$/.test((a.data ?? '').trim()))) return 'none'; // "null MX": no email
  return rows.length ? 'ok' : 'none';
}

/** Does the web address look like this shop's own (beanthere.ca for "Bean There Café")? */
export function domainMatchesName(url: string, name: string): boolean {
  const label = siteOf(hostOf(url)).split('.')[0].replace(/[^a-z0-9]/g, '');
  if (!label) return false;
  const words = simplify(name).trim().split(' ').filter((w) => w.length >= 3 && !GENERIC.has(w));
  if (!words.length) return false;
  return label.includes(words.join('')) || words.some((w) => w.length >= 4 && label.includes(w));
}
