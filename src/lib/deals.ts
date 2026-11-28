import { supabase } from './supabase';

// Deals: shops list deals in the dashboard (Deals in the sidebar) and the
// public page stampfix.app/deals shows them. See the deals migration.

export type DealType = 'percent' | 'amount' | 'free' | 'bogo' | 'other';
export type DealState = 'live' | 'scheduled' | 'paused' | 'ended' | 'hidden';
export type DealCurrency = 'CAD' | 'EUR' | 'USD';

/** Business types, the same list as "Made for your shop" (labels in industries.*). */
export const DEAL_CATEGORIES = [
  'cafe', 'restaurant', 'bakery', 'iceCream', 'snackBar', 'pizzeria', 'bar', 'florist',
  'nailStudio', 'hairdresser', 'barbershop', 'tattoo', 'gym', 'retail', 'doner', 'bubbleTea',
  'foodTruck', 'lashBrow', 'spa', 'carWash', 'dogGrooming', 'dryCleaner', 'yoga', 'other',
] as const;
export type DealCategory = (typeof DEAL_CATEGORIES)[number];
export const DEAL_TYPES: DealType[] = ['percent', 'amount', 'free', 'bogo', 'other'];

export interface DealBusiness {
  name: string;
  logo_image: string | null;
  logo_text: string | null;
  color: string | null;
  text_color: string | null;
  link: string;
}

export interface Deal {
  id: string;
  title: string;
  deal_type: DealType;
  value: number | null;
  currency: DealCurrency | null;
  description: string | null;
  code: string | null;
  terms: string | null;
  category: DealCategory;
  city: string;
  country: string | null;
  starts_at: string;
  ends_at: string;
  days: number[];
  start_minute: number | null;
  end_minute: number | null;
  timezone: string;
  live_now: boolean;
  location: { id: string; name: string; address: string | null } | null;
  business: DealBusiness;
  // Public list only: where the deal is (its branch, or the shop's branch
  // nearest the visitor) and, when the visitor shared their location, how far.
  place?: { name: string; address: string | null; lat: number | null; lng: number | null } | null;
  distance_km?: number | null;
  // Owner and admin only
  status?: 'active' | 'paused';
  state?: DealState;
  hidden?: boolean;
  hidden_reason?: string | null;
  location_id?: string | null;
  created_at?: string;
  updated_at?: string;
  campaign_id?: string;
}

/** What the form sends. Empty strings mean "not set". */
export interface DealDraft {
  id?: string;
  title: string;
  deal_type: DealType;
  value: string;
  currency: DealCurrency;
  description: string;
  code: string;
  terms: string;
  category: DealCategory | '';
  city: string;
  location_id: string;
  starts_at: string; // local "YYYY-MM-DDTHH:mm"
  ends_at: string;
  days: number[]; // empty = every day
  hours: boolean;
  start_time: string; // "HH:mm"
  end_time: string;
  status: 'active' | 'paused';
}

export type DealWhen = 'all' | 'now' | 'week' | 'upcoming';
export type DealSort = 'ending' | 'newest' | 'starting' | 'nearest';

export interface DealFilters {
  total: number;
  countries: { country: string; n: number }[];
  cities: { city: string; country: string | null; n: number }[];
  categories: { key: DealCategory; n: number }[];
  types: { key: DealType; n: number }[];
}

// ---- Owner -------------------------------------------------------------------

export async function listMyDeals(campaignId: string): Promise<Deal[]> {
  const { data, error } = await supabase.rpc('my_deals', { p_campaign: campaignId });
  if (error) throw error;
  return (data ?? []) as Deal[];
}

const toMinutes = (hhmm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v >= 0 && v <= 1440 ? v : null;
};
/** "YYYY-MM-DDTHH:mm" in the browser's time zone, as an ISO string. */
const localToIso = (v: string): string | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export function browserTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

export async function saveDeal(campaignId: string, d: DealDraft): Promise<Deal> {
  const start = d.hours ? toMinutes(d.start_time) : null;
  let end = d.hours ? toMinutes(d.end_time) : null;
  if (end === 0) end = 1440; // "until midnight"
  const body = {
    id: d.id ?? '',
    title: d.title.trim(),
    deal_type: d.deal_type,
    value: d.deal_type === 'percent' || d.deal_type === 'amount' ? d.value.replace(',', '.').trim() : '',
    currency: d.deal_type === 'amount' ? d.currency : '',
    description: d.description.trim(),
    code: d.code.trim(),
    terms: d.terms.trim(),
    category: d.category,
    city: d.city.trim(),
    location_id: d.location_id,
    starts_at: localToIso(d.starts_at) ?? '',
    ends_at: localToIso(d.ends_at) ?? '',
    days: d.days,
    start_minute: start ?? '',
    end_minute: end ?? '',
    timezone: browserTimeZone(),
    status: d.status,
  };
  const { data, error } = await supabase.rpc('save_deal', { p_campaign: campaignId, p_deal: body });
  if (error) throw error;
  return data as Deal;
}

export async function setDealStatus(id: string, status: 'active' | 'paused'): Promise<Deal> {
  const { data, error } = await supabase.rpc('set_deal_status', { p_id: id, p_status: status });
  if (error) throw error;
  return data as Deal;
}

export async function deleteDeal(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_deal', { p_id: id });
  if (error) throw error;
}

/** The field a save error is about (deal_title, deal_value, ...), or null. */
export function dealErrorCode(e: unknown): string | null {
  const m = String((e as { message?: string } | null)?.message ?? '');
  const hit = /deal_[a-z_]+/.exec(m);
  return hit ? hit[0] : null;
}

// ---- Public ------------------------------------------------------------------

export async function listPublicDeals(f: {
  country?: string | null; city?: string | null; category?: string | null; type?: string | null;
  when?: DealWhen; search?: string; sort?: DealSort; limit?: number; offset?: number;
  /** The visitor's location, only when they tapped "Near me". Used for this answer only. */
  near?: { lat: number; lng: number } | null; radiusKm?: number | null; id?: string | null;
}): Promise<{ total: number; deals: Deal[] }> {
  const args: Record<string, unknown> = {
    p_country: f.country || null, p_city: f.city || null, p_category: f.category || null, p_type: f.type || null,
    p_when: f.when ?? 'all', p_search: f.search?.trim() || null, p_sort: f.sort ?? 'ending',
    p_limit: f.limit ?? 24, p_offset: f.offset ?? 0,
  };
  // Only sent when used, so the call also works before the "near me" SQL is run.
  if (f.near) { args.p_lat = f.near.lat; args.p_lng = f.near.lng; if (f.radiusKm) args.p_radius_km = f.radiusKm; }
  if (f.id) args.p_id = f.id;
  const { data, error } = await supabase.rpc('public_deals', args);
  if (error) throw error;
  const r = (data ?? {}) as { total?: number; deals?: Deal[] };
  return { total: r.total ?? 0, deals: r.deals ?? [] };
}

export async function getDealFilters(): Promise<DealFilters> {
  const { data, error } = await supabase.rpc('public_deal_filters');
  if (error) throw error;
  const r = (data ?? {}) as Partial<DealFilters>;
  return { total: r.total ?? 0, countries: r.countries ?? [], cities: r.cities ?? [], categories: r.categories ?? [], types: r.types ?? [] };
}

// ---- Admin -------------------------------------------------------------------

export async function adminListDeals(view: 'all' | 'live' | 'hidden', search: string): Promise<Deal[]> {
  const { data, error } = await supabase.rpc('admin_deals', { p_view: view, p_search: search.trim() || null, p_limit: 300 });
  if (error) throw error;
  return (data ?? []) as Deal[];
}

export async function adminSetDealHidden(id: string, hidden: boolean, reason: string | null): Promise<Deal> {
  const { data, error } = await supabase.rpc('admin_set_deal_hidden', { p_id: id, p_hidden: hidden, p_reason: reason });
  if (error) throw error;
  return data as Deal;
}

// ---- Display helpers -----------------------------------------------------------

const CURRENCY_LOCALE: Record<DealCurrency, string> = { CAD: 'en-CA', EUR: 'de-DE', USD: 'en-US' };

/** The headline badge: "20% off", "CA$10 off", "Free", "2 for 1", or null for "other". */
export function dealBadge(d: Pick<Deal, 'deal_type' | 'value' | 'currency'>, t: (k: string, o: Record<string, unknown>) => string): string | null {
  const v = d.value == null ? null : Number(d.value);
  switch (d.deal_type) {
    case 'percent': return v == null ? null : t('deals.badge.percent', { defaultValue: '{{v}}% off', v: Number.isInteger(v) ? v : v.toFixed(1) });
    case 'amount': {
      if (v == null) return null;
      const cur = d.currency ?? 'CAD';
      const money = new Intl.NumberFormat(CURRENCY_LOCALE[cur], { style: 'currency', currency: cur, maximumFractionDigits: Number.isInteger(v) ? 0 : 2 }).format(v);
      return t('deals.badge.amount', { defaultValue: '{{v}} off', v: money });
    }
    case 'free': return t('deals.badge.free', { defaultValue: 'Free' });
    case 'bogo': return t('deals.badge.bogo', { defaultValue: '2 for 1' });
    default: return null;
  }
}

export function minutesToTime(m: number | null): string {
  if (m == null) return '';
  const mm = m % 1440;
  return `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`;
}

/** "Mon, Wed, Fri" style list in the page language (ISO weekdays 1-7). */
export function daysLabel(days: number[], lang: string): string {
  const fmt = new Intl.DateTimeFormat(lang, { weekday: 'short' });
  // 2024-01-01 was a Monday.
  return [...days].sort((a, b) => a - b).map((d) => fmt.format(new Date(Date.UTC(2024, 0, d, 12)))).join(', ');
}

/** The start and end dates, short ("1 Dec", "24 Dec"); the year only when it isn't this year. */
export function dateRange(startIso: string, endIso: string, lang: string): { from: string; to: string } {
  const s = new Date(startIso), e = new Date(endIso);
  const sameYear = s.getFullYear() === e.getFullYear() && s.getFullYear() === new Date().getFullYear();
  const fmt = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
  return { from: fmt.format(s), to: fmt.format(e) };
}

/** A local "YYYY-MM-DDTHH:mm" for <input type="datetime-local">. */
export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** A best guess at the city in a free-text address ("1 Main St, Vancouver, BC V5K 0A1" gives "Vancouver"). */
/** Google Maps directions to the deal's place (address, else coordinates, else business and city). */
export function directionsUrl(d: Pick<Deal, 'place' | 'location' | 'business' | 'city'>): string {
  const p = d.place;
  const dest = p?.address ? `${d.business.name}, ${p.address}`
    : p?.lat != null && p?.lng != null ? `${p.lat},${p.lng}`
    : d.location?.address ? `${d.business.name}, ${d.location.address}`
    : `${d.business.name}, ${d.city}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
}

/** "350 m", "4.2 km", "12 km". */
export function distanceLabel(km: number | null | undefined, lang: string): string | null {
  if (km == null || !Number.isFinite(Number(km))) return null;
  const n = Number(km);
  const fmt = (v: number, max: number) => v.toLocaleString(lang, { maximumFractionDigits: max });
  if (n < 1) return `${fmt(Math.max(50, Math.round((n * 1000) / 50) * 50), 0)} m`;
  return `${fmt(n, n < 10 ? 1 : 0)} km`;
}

export function cityFromAddress(address: string | null | undefined): string {
  if (!address) return '';
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return '';
  // "10115 Berlin" (German style: postcode first) or "Vancouver".
  const cand = parts[1].replace(/^\d{4,5}\s+/, '').replace(/\s+[A-Z]{2}\s*[A-Z0-9 ]*$/, '').trim();
  return /\d/.test(cand) ? '' : cand;
}

// ---- Examples for an empty deals page ----------------------------------------------

/**
 * Example deals from made-up businesses, shown (labelled "Example") on the
 * deals page only while no real deal is listed. Never stored anywhere.
 */
export function sampleDeals(t: (k: string, o: Record<string, unknown>) => string): Deal[] {
  const day = 86400e3;
  const at = (d: number) => new Date(Date.now() + d * day).toISOString();
  const mk = (n: number, d: Partial<Deal> & Pick<Deal, 'deal_type' | 'category' | 'city'>, biz: { name: string; color: string; text?: string }, title: string, desc: string | null, terms: string | null = null): Deal => ({
    id: `example-${n}`, value: null, currency: null, code: null, country: null, starts_at: at(-2), ends_at: at(21), days: [], start_minute: null, end_minute: null,
    timezone: 'UTC', location: null, ...d,
    // "On now" only for examples with no day or hour limits, so the label is never wrong.
    live_now: d.live_now ?? !((d.days?.length ?? 0) > 0 || d.start_minute != null),
    title: t(`deals.sample.s${n}.title`, { defaultValue: title }),
    description: desc ? t(`deals.sample.s${n}.desc`, { defaultValue: desc }) : null,
    terms: terms ? t(`deals.sample.s${n}.terms`, { defaultValue: terms }) : null,
    business: { name: biz.name, logo_image: null, logo_text: null, color: biz.color, text_color: biz.text ?? '#FFFFFF', link: '#' },
  });
  return [
    mk(1, { deal_type: 'bogo', category: 'cafe', city: 'Vancouver', days: [1, 2, 3, 4, 5], start_minute: 840, end_minute: 1020 },
      { name: 'Morning Bloom Café', color: '#7C2D12' }, '2 for 1 on all lattes', 'Bring a friend in the afternoon: two lattes for the price of one.'),
    mk(2, { deal_type: 'percent', value: 20, category: 'hairdresser', city: 'Toronto', code: 'WELCOME20' },
      { name: 'Glow Studio', color: '#BE185D' }, '20% off your first cut', null, 'New clients only.'),
    mk(3, { deal_type: 'free', category: 'gym', city: 'Berlin', starts_at: at(2), ends_at: at(30), live_now: false },
      { name: 'Kraftwerk Gym', color: '#111318', text: '#FCFF54' }, 'Free trial class', 'Try any class this month, no sign-up needed.'),
    mk(4, { deal_type: 'amount', value: 10, currency: 'CAD', category: 'carWash', city: 'Calgary', days: [1, 2, 3, 4] },
      { name: 'Shine Car Wash', color: '#1132F5' }, 'Weekday full detail special', 'Inside and out, Monday to Thursday.'),
    mk(5, { deal_type: 'free', category: 'bakery', city: 'Hamburg', start_minute: 420, end_minute: 600 },
      { name: 'Backstube Elbe', color: '#B45309' }, 'Free croissant with any coffee', 'Every morning until 10.'),
    mk(6, { deal_type: 'percent', value: 15, category: 'nailStudio', city: 'Vancouver', code: 'HAPPY15', days: [2, 3, 4], start_minute: 600, end_minute: 780 },
      { name: 'Polished Nails', color: '#7C3AED' }, 'Happy hour: 15% off manicures', null, 'Show the code when you book.'),
  ];
}
