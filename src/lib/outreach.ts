import { supabase } from './supabase';
// Shared with the outreach-tools function: the same map query, parsing and time-zone guess.
import {
  guessTimezone, overpassQuery, parseOverpass, placesFromPhoton, placesFromNominatim,
  overpassCitiesQuery, parseOverpassCities, type CountryCity,
} from '../../supabase/functions/outreach-tools/lib';
export type { CountryCity };

// Admin > Outreach: find shops anywhere, email them through Resend (queued
// and sent within limits by the outreach-send function) or message them on
// Instagram by hand. See supabase/migrations/20261125000000_outreach.sql.

export type EmailStatus = 'new' | 'queued' | 'sent' | 'followup_queued' | 'followed_up' | 'replied'
  | 'not_interested' | 'bounced' | 'complained' | 'unsubscribed' | 'skipped';
export type IgStatus = 'new' | 'sent' | 'replied' | 'not_interested' | 'skipped';
export type BlockReason = 'no_email' | 'opted_out' | 'has_account' | 'customer_domain' | 'consent_country' | 'french_required';

export interface Lead {
  id: string;
  business_name: string;
  category_key: string | null;
  category: string | null;
  city: string | null;
  country: string;
  region: string | null;
  timezone: string | null;
  lat: number | null;
  lon: number | null;
  address: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  email_source: string | null;
  instagram: string | null;
  first_line: string | null;
  notes: string | null;
  email_status: EmailStatus;
  ig_status: IgStatus;
  email_sent_at: string | null;
  ig_sent_at: string | null;
  website_checked_at: string | null;
  created_at: string;
  ig_message: string;
  blocked: BlockReason | null;
  followup_due: boolean;
  last_error: string | null;
  // The Queued list only: when it was queued, and whether its shop is inside
  // its sending hours right now (the list comes in sending order).
  queued_at?: string | null;
  in_hours?: boolean;
  // AI email finder (see the outreach_ai migration).
  ai_status?: AiStatus | null;
  ai_email?: string | null;
  ai_source?: string | null;
  ai_note?: string | null;
  ai_search?: string | null;
  ai_attempts?: number;
  ai_checked_at?: string | null;
}

export type AiStatus = 'queued' | 'working' | 'found' | 'suggested' | 'not_found' | 'failed';

export interface OutreachSettings {
  paused: boolean;
  pause_reason: 'bounces' | 'complaint' | null;
  daily_cap: number;
  window_start: number;
  window_end: number;
  weekdays_only: boolean;
  followup_days: number;
  from_name: string;
  default_first_line: string;
  subject_tpl: string;
  body_tpl: string;
  followup_subject_tpl: string;
  followup_tpl: string;
  footer: string;
  ig_tpl: string;
  ig_account: string | null;
  ig_daily_limit: number;
  ai_auto_queue?: boolean;
}

export interface OutreachState {
  settings: OutreachSettings;
  leads: number;
  with_email: number;
  with_instagram: number;
  unchecked: number;
  email: Partial<Record<EmailStatus, number>>;
  ig: Partial<Record<IgStatus, number>>;
  sent_24h: number;
  queued: number;
  followups_due: number;
  ig_24h: number;
  bounced: number;
  complained: number;
  sent_total: number;
}

export type LeadView = 'all' | 'unchecked' | 'email_ready' | 'email_queued' | 'email_sent' | 'email_followup'
  | 'email_replied' | 'email_stopped' | 'ig_ready' | 'ig_sent' | 'ig_replied' | 'ig_stopped';

/** The 23 kinds of shop on the landing page (labels come from industries.* translations). */
export const INDUSTRIES: Array<{ key: string; icon: string }> = [
  { key: 'cafe', icon: '☕' }, { key: 'restaurant', icon: '🍽️' }, { key: 'bakery', icon: '🥐' },
  { key: 'iceCream', icon: '🍦' }, { key: 'snackBar', icon: '🌮' }, { key: 'pizzeria', icon: '🍕' },
  { key: 'bar', icon: '🍸' }, { key: 'florist', icon: '🌸' }, { key: 'nailStudio', icon: '💅' },
  { key: 'hairdresser', icon: '✂️' }, { key: 'barbershop', icon: '💈' }, { key: 'tattoo', icon: '🎨' },
  { key: 'gym', icon: '💪' }, { key: 'retail', icon: '🛍️' }, { key: 'doner', icon: '🥙' },
  { key: 'bubbleTea', icon: '🧋' }, { key: 'foodTruck', icon: '🚚' }, { key: 'lashBrow', icon: '👁️' },
  { key: 'spa', icon: '💆' }, { key: 'carWash', icon: '🚗' }, { key: 'dogGrooming', icon: '🐶' },
  { key: 'dryCleaner', icon: '👔' }, { key: 'yoga', icon: '🧘' },
];

export const BLOCK_LABEL: Record<BlockReason, string> = {
  no_email: 'No email address',
  opted_out: 'Opted out',
  has_account: 'Already has a Stampfix account',
  customer_domain: 'Same company as an existing shop',
  consent_country: 'Email off: this country needs consent first',
  french_required: 'Email off: Quebec needs French',
};

/** Countries where email is off (cold email to businesses needs consent first), as the database decides. */
export const CONSENT_COUNTRIES = new Set(['DE', 'AT', 'IT', 'DK', 'PL']);

/** Minutes between two emails: the sending hours shared out over the daily
 *  limit (same rule as outreach_send_gap_minutes in the database). */
export function sendGapMinutes(cap: number, start: number, end: number): number {
  const minutes = Math.max(1, (end ?? 24) - (start ?? 0)) * 60;
  return Math.max(1, Math.floor(minutes / Math.max(1, cap || 1)));
}
export function emailOffReason(country: string, region: string | null): BlockReason | null {
  if (CONSENT_COUNTRIES.has(country.toUpperCase())) return 'consent_country';
  if (country.toUpperCase() === 'CA' && /^(qc|qu[eé]bec)$/i.test((region ?? '').trim())) return 'french_required';
  return null;
}

export function countryName(code: string): string {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase()) ?? code; } catch { return code; }
}

const rpc = async <T>(fn: string, args?: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
};

/** Runs an action of an outreach function; the error says what went wrong. */
async function call<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let msg = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try { msg = ((await ctx.json()) as { error?: string }).error ?? msg; } catch { /* keep the generic one */ }
    }
    throw new Error(msg);
  }
  return data as T;
}

export const getOutreachState = () => rpc<OutreachState>('admin_outreach_state');
export const listLeads = (view: LeadView, search = '', limit = 300) =>
  rpc<Lead[]>('admin_outreach_leads', { p_view: view, p_search: search || null, p_limit: limit });
export const previewEmail = (id: string, kind: 'first' | 'followup' = 'first') =>
  rpc<{ to: string | null; from_name: string; subject: string; body: string; blocked: BlockReason | null }>('admin_outreach_preview', { p_id: id, p_kind: kind });
export const addLeads = (rows: NewLead[]) =>
  rpc<{ added: number; duplicates: number; invalid: number }>('admin_outreach_add_leads', { p_leads: rows });
export const saveScans = (results: ScanResult[]) => rpc<{ found: number }>('admin_outreach_save_scans', { p_results: results });
export const updateLead = (id: string, patch: Partial<Pick<Lead, 'first_line' | 'email' | 'instagram' | 'notes'>> & { email_status?: EmailStatus; ig_status?: IgStatus }) =>
  rpc<Lead>('admin_outreach_update_lead', { p_id: id, p_patch: patch });
export const deleteLead = (id: string) => rpc<void>('admin_outreach_delete_lead', { p_id: id });
export const queueEmails = (ids: string[], kind: 'first' | 'followup' = 'first') =>
  rpc<{ queued: number; skipped: Array<{ id: string; business: string; reason: string }> }>('admin_outreach_queue', { p_ids: ids, p_kind: kind });
export const cancelQueued = (ids: string[]) => rpc<{ cancelled: number }>('admin_outreach_cancel', { p_ids: ids });
export const saveOutreachSettings = (patch: Partial<OutreachSettings>) => rpc<OutreachSettings>('admin_outreach_save_settings', { p: patch });

export interface Place { label: string; lat: number; lon: number; country: string; region: string | null; city: string | null; timezone: string | null }
export interface FoundShop {
  osm_ref: string; business_name: string; category_key: string; category: string;
  city: string | null; region: string | null; country: string; timezone: string | null;
  lat: number | null; lon: number | null; address: string | null; website: string | null;
  phone: string | null; email: string | null; email_source: string | null; instagram: string | null; chain: boolean;
}
export type NewLead = Partial<Omit<FoundShop, 'chain'>> & { business_name: string; country: string };
export interface ScanResult { id: string; email: string | null; email_source: string | null; instagram: string | null; error?: string | null }

// The map services are asked from the admin's own browser: OpenStreetMap's
// free services refuse shared cloud servers (Supabase got "403"), but allow
// a person's browser. The outreach-tools function is only the fallback.
const PHOTON = 'https://photon.komoot.io/api/';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

async function getJson(url: string, init: RequestInit = {}, ms = 15000, signal?: AbortSignal): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  const stop = () => ctl.abort();
  signal?.addEventListener('abort', stop);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal });
    if (!res.ok) throw new Error(`map_${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
  }
}

/** Place suggestions while typing (Photon: OpenStreetMap's search-as-you-type service). */
export async function suggestPlaces(q: string, signal?: AbortSignal): Promise<Place[]> {
  const url = `${PHOTON}?q=${encodeURIComponent(q)}&limit=8&lang=en&osm_tag=place`;
  return placesFromPhoton(await getJson(url, {}, 10000, signal));
}

/** A full place search (the Search button): Photon, then Nominatim, then the server. */
export async function findPlaces(q: string): Promise<Place[]> {
  try {
    const list = await suggestPlaces(q);
    if (list.length) return list;
  } catch { /* try the next one */ }
  try {
    return placesFromNominatim(await getJson(`${NOMINATIM}?format=jsonv2&addressdetails=1&limit=8&accept-language=en&q=${encodeURIComponent(q)}`));
  } catch { /* try the server */ }
  try {
    return (await call<{ places: Place[] }>('outreach-tools', { action: 'geocode', q })).places;
  } catch {
    throw new Error('map_busy');
  }
}

export type ShopSource = 'geoapify' | 'overpass';

/** Are the Geoapify key (reliable shop search) and the Gemini key (AI email finder) set on the server? */
export const getSearchStatus = () => call<{ places_key: boolean; ai_key?: boolean }>('outreach-tools', { action: 'status' });

/**
 * Shops of one kind around a place. First Geoapify, through the
 * outreach-tools function (reliable; needs its key). Without a key, or if it
 * fails, the free OpenStreetMap (Overpass) servers, asked from this browser.
 */
export async function findShops(place: Place, category: string, radiusKm: number, includeChains: boolean): Promise<{ shops: FoundShop[]; chains_hidden: number; source: ShopSource }> {
  let serverError = '';
  try {
    const r = await call<{ shops: FoundShop[]; chains_hidden: number }>('outreach-tools',
      { action: 'find', place, category, radius_km: radiusKm, include_chains: includeChains });
    return { ...r, source: 'geoapify' };
  } catch (e) {
    serverError = e instanceof Error ? e.message : String(e);
  }
  const query = overpassQuery(category, place.lat, place.lon, radiusKm);
  for (const endpoint of OVERPASS) {
    try {
      const data = await getJson(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: 'data=' + encodeURIComponent(query),
      }, 30000);
      const shops = parseOverpass(data as Parameters<typeof parseOverpass>[0], category,
        { city: place.city, region: place.region, country: place.country, timezone: place.timezone });
      const chains = shops.filter((s) => s.chain).length;
      return { shops: includeChains ? shops : shops.filter((s) => !s.chain), chains_hidden: includeChains ? 0 : chains, source: 'overpass' };
    } catch { /* next map server */ }
  }
  // Say what to fix: a missing or wrong key, used-up searches, or just busy servers.
  if (/no_places_key|places_40[13]|places_429/.test(serverError)) throw new Error(serverError.match(/no_places_key|places_40[13]|places_429/)![0]);
  throw new Error('map_busy');
}

// ---- All cities of a country (Areas) -----------------------------------------------

const CITY_CACHE_DAYS = 7;
const cityMemo = new Map<string, CountryCity[]>();

/**
 * Every city and town of a country, biggest first: from Geoapify through the
 * outreach-tools function, else the free OpenStreetMap servers from this
 * browser. Kept on this device for a week (the list hardly changes).
 */
export async function getCountryCities(country: string): Promise<CountryCity[]> {
  const cc = country.toUpperCase();
  const memo = cityMemo.get(cc);
  if (memo) return memo;
  const key = `stampfix_cities_${cc}`;
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null') as { at: number; cities: CountryCity[] } | null;
    if (saved && Date.now() - saved.at < CITY_CACHE_DAYS * 86_400_000 && Array.isArray(saved.cities) && saved.cities.length) {
      cityMemo.set(cc, saved.cities);
      return saved.cities;
    }
  } catch { /* no storage */ }
  let cities: CountryCity[] | null = null;
  try {
    cities = (await call<{ cities: CountryCity[] }>('outreach-tools', { action: 'cities', country: cc })).cities;
  } catch { /* try the free servers */ }
  if (!cities?.length) {
    for (const endpoint of OVERPASS) {
      try {
        const data = await getJson(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body: 'data=' + encodeURIComponent(overpassCitiesQuery(cc)),
        }, 60000);
        cities = parseOverpassCities(data);
        if (cities.length) break;
      } catch { /* next map server */ }
    }
  }
  if (!cities?.length) throw new Error('map_busy');
  cityMemo.set(cc, cities);
  try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), cities })); } catch { /* full or private: fine */ }
  return cities;
}

/** A city from that list as a place for Find shops. */
export function cityAsPlace(c: CountryCity, country: string): Place {
  return {
    // Each part once: "Osaka, Japan", not "Osaka, Osaka, Japan".
    label: [...new Map([c.name, c.region, countryName(country)].filter((x): x is string => !!x).map((x) => [x.toLowerCase(), x])).values()].join(', '),
    lat: c.lat, lon: c.lon, country: country.toUpperCase(), region: c.region, city: c.name,
    timezone: guessTimezone(country, c.region, c.lon),
  };
}

export const scanWebsites = (sites: Array<{ id: string; website: string }>) =>
  call<{ results: ScanResult[] }>('outreach-tools', { action: 'scan', sites }).then((r) => r.results);
export const sendTestEmail = (leadId: string, kind: 'first' | 'followup' = 'first') =>
  call<{ ok: boolean; to: string }>('outreach-send', { mode: 'test', lead_id: leadId, kind });
export const sendNextNow = () =>
  call<{ status: 'sent' | 'failed' | 'paused' | 'cap' | 'idle'; error?: string }>('outreach-send', { mode: 'tick' });

// ---- AI email finder ----------------------------------------------------------------

export interface AiState {
  auto_queue: boolean;
  /** Set while searches wait (Google's daily limit reached, or a problem to fix). */
  paused_until: string | null;
  last_error: string | null;
  /** Shops without an address that may be emailed. */
  no_email: number;
  not_searched: number;
  waiting: number;
  working: number;
  found: number;
  /** Found ones that are queued or already emailed. */
  found_queued: number;
  suggested: number;
  not_found: number;
  searched_24h: number;
  /** Shops without an address in countries where email is off (not searched). */
  email_off: number;
}
export type AiView = 'not_searched' | 'waiting' | 'found' | 'suggested' | 'not_found';

export const getAiState = () => rpc<AiState>('admin_outreach_ai_state');
export const listAiLeads = (view: AiView) => rpc<Lead[]>('admin_outreach_ai_leads', { p_view: view, p_limit: 500 });
/** Puts shops in line: every one not searched yet, or the given ones (to search again). */
export const startAiSearch = (ids?: string[]) => rpc<{ queued: number }>('admin_outreach_ai_start', { p_ids: ids?.length ? ids : null });
export const cancelAiSearch = () => rpc<{ cancelled: number }>('admin_outreach_ai_cancel');
/** "Use it": saves the address (the AI's, or one typed instead) and queues the first email if asked. */
export const acceptAiEmail = (id: string, email: string | null, queue: boolean) =>
  rpc<{ queued: boolean; reason: string | null }>('admin_outreach_ai_accept', { p_id: id, p_email: email, p_queue: queue });
export const rejectAiEmail = (id: string) => rpc<void>('admin_outreach_ai_reject', { p_id: id });
export const saveAiSettings = (patch: { auto_queue?: boolean; resume?: boolean }) =>
  rpc<AiState>('admin_outreach_ai_settings', { p_auto_queue: patch.auto_queue ?? null, p_resume: patch.resume ?? false });
/** Starts searching straight away instead of within the minute (the database starts it anyway). */
export const runAiNow = () => call<{ started?: boolean; searched?: number }>('outreach-tools', { action: 'ai_tick' });
export const testAi = () => call<{ ok: boolean; model?: string; searched_google?: boolean; answer?: string; error?: string }>('outreach-tools', { action: 'ai_test' });
export const googleSearchUrl = (l: Pick<Lead, 'business_name' | 'city' | 'ai_search'>) =>
  `https://www.google.com/search?q=${encodeURIComponent(l.ai_search || [`"${l.business_name}"`, l.city, 'email'].filter(Boolean).join(' '))}`;

// ---- Areas: where you've reached out --------------------------------------------------

export interface CoverageRow {
  country: string;
  /** The city in lower case: rows of one city share it. */
  city_key: string;
  city: string | null;
  region: string | null;
  /** The kind of shop (landing page key like "cafe"), or the category text for imported shops, or "other". */
  category_key: string;
  category: string | null;
  shops: number;
  with_email: number;
  queued: number;
  emailed: number;
  ig_messaged: number;
  /** Emailed or messaged on Instagram, each shop once. */
  reached: number;
  replied: number;
  not_interested: number;
  ai_searched: number;
  last_contact: string | null;
  first_added: string;
  last_added: string;
}
export const getCoverage = () => rpc<CoverageRow[]>('admin_outreach_coverage');

/** Public: the unsubscribe link in outreach emails. */
export async function stopOutreachEmails(token: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('outreach_unsubscribe', { p_token: token });
  if (error) throw error;
  return data === true;
}

// ---- Links -----------------------------------------------------------------------

export const igProfileUrl = (handle: string) => `https://www.instagram.com/${encodeURIComponent(handle)}/`;
/** Opens a direct-message chat with the account (Instagram's own short link). */
export const igChatUrl = (handle: string) => `https://ig.me/m/${encodeURIComponent(handle)}`;
export const IG_HOME = 'https://www.instagram.com/';
export const IG_INBOX = 'https://www.instagram.com/direct/inbox/';
export function mapsUrl(l: { business_name: string; address?: string | null; city?: string | null; lat?: number | null; lon?: number | null }): string {
  const q = [l.business_name, l.address || l.city].filter(Boolean).join(', ');
  const near = l.lat != null && l.lon != null ? `&center=${l.lat},${l.lon}` : '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}${near}`;
}

// ---- Instagram: the Stampfix Phone, or a window ---------------------------------------
//
// Instagram can't be shown inside a website: it sends "X-Frame-Options: DENY",
// and its login cookies (no SameSite, so Lax) are never sent to Instagram
// embedded in another site. Chrome does treat a site shown in an extension's own
// page as if you had opened it yourself. So the small "Stampfix Phone"
// extension (browser-extension/stampfix-phone) shows Instagram, logged in, in
// Chrome's side panel at the right edge of this same window. It marks this page
// when installed and takes "show this Instagram page" requests through window
// messages; the click that sends one also opens the panel.
//
// Without it, each link opens a phone-sized window at the right edge of the
// screen (Instagram's opener policy cuts such a window off from this page, so
// it can't be reused).

export const PHONE_DOWNLOAD = '/stampfix-phone.zip';
/** The newest Stampfix Phone (browser-extension/stampfix-phone/manifest.json). */
export const PHONE_VERSION = '1.2.0';
export type PhoneAnswer = { ok: boolean; panel: boolean };

/** Is the Stampfix Phone extension installed (it marks the page as it loads)? */
export const phoneInstalled = (): boolean => typeof document !== 'undefined' && !!document.documentElement.dataset.stampfixPhone;

/** Is the installed Stampfix Phone older than the newest one? */
export function phoneOutdated(): boolean {
  const have = (typeof document !== 'undefined' && document.documentElement.dataset.stampfixPhone) || '';
  if (!have) return false;
  const a = have.split('.').map((n) => parseInt(n, 10) || 0), b = PHONE_VERSION.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
  return false;
}

/**
 * Shows an Instagram page on the Stampfix Phone; with text, the phone (1.2+)
 * types it into the chat's message box (it never sends). panel: whether the
 * phone is showing.
 */
export function openInPhone(url: string, text?: string): Promise<PhoneAnswer> {
  return new Promise((resolve) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const done = (r: PhoneAnswer) => { window.removeEventListener('message', onMessage); clearTimeout(timer); resolve(r); };
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { type?: string; id?: string; ok?: boolean; panel?: boolean } | null;
      if (e.source === window && d?.type === 'stampfix-phone:opened' && d.id === id) done({ ok: !!d.ok, panel: !!d.panel });
    };
    window.addEventListener('message', onMessage);
    const timer = setTimeout(() => done({ ok: false, panel: false }), 4000);
    window.postMessage({ type: 'stampfix-phone:open', url, id, ...(text ? { text } : {}) }, window.location.origin);
  });
}

/** Without the phone: a phone-sized window at the right edge of the screen. */
export function openInstagramWindow(url: string): void {
  const w = 440;
  const h = Math.min(940, window.screen.availHeight || 900);
  const left = Math.max(0, (window.screen.availWidth || 1440) - w - 10);
  const win = window.open('', '_blank', `popup=yes,width=${w},height=${h},left=${left},top=0`);
  if (!win) { window.open(url, '_blank', 'noopener'); return; }
  try { win.opener = null; } catch { /* nothing to cut */ }
  win.location.href = url;
  win.focus();
}

// ---- Pasted lists ----------------------------------------------------------------

/** Splits CSV text (commas or tabs, quotes allowed) into rows. */
export function parseCsv(text: string): string[][] {
  const delim = (text.split('\n')[0] ?? '').includes('\t') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(cell.trim()); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim()); cell = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

const HEADER_ALIASES: Record<string, keyof NewLead> = {
  name: 'business_name', business: 'business_name', business_name: 'business_name', shop: 'business_name', company: 'business_name',
  email: 'email', 'e-mail': 'email', mail: 'email',
  website: 'website', url: 'website', site: 'website', web: 'website',
  instagram: 'instagram', ig: 'instagram', insta: 'instagram',
  city: 'city', town: 'city',
  country: 'country',
  region: 'region', state: 'region', province: 'region',
  category: 'category', type: 'category',
  phone: 'phone', telephone: 'phone',
  address: 'address',
  timezone: 'timezone', time_zone: 'timezone',
};

/**
 * Turns a pasted list into shops. The first row must name the columns
 * (name, email, website, instagram, city, country, region, category, phone,
 * address, timezone); a row without a country gets defaultCountry, and one
 * without a time zone gets the usual one for its country and region.
 */
export function leadsFromCsv(text: string, defaultCountry: string): { leads: NewLead[]; problems: string[] } {
  const rows = parseCsv(text);
  const problems: string[] = [];
  if (rows.length < 2) return { leads: [], problems: ['Paste a header row and at least one shop.'] };
  const cols = rows[0].map((h) => HEADER_ALIASES[h.toLowerCase().replace(/\s+/g, '_')] ?? null);
  if (!cols.includes('business_name')) return { leads: [], problems: ['The first row needs a "name" column.'] };
  const leads: NewLead[] = [];
  rows.slice(1).forEach((r, i) => {
    const o: Record<string, string> = {};
    cols.forEach((c, j) => { if (c && r[j]) o[c] = r[j]; });
    if (!o.business_name) { problems.push(`Row ${i + 2}: no name`); return; }
    const country = (o.country || defaultCountry || '').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) { problems.push(`Row ${i + 2}: country must be a 2-letter code like CA`); return; }
    const timezone = o.timezone || guessTimezone(country, o.region ?? null, country === 'US' ? -80 : 0);
    leads.push({ ...o, country, timezone, email_source: o.email ? 'added from a list' : null } as NewLead);
  });
  return { leads, problems };
}
