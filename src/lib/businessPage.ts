import { supabase } from './supabase';

// The Business page: one page, and one QR code, per shop.
//   stampfix.app/v/<slug>            the shop's page
//   stampfix.app/v/<slug>?l=<id>     at one branch (shops with several)
//   stampfix.app/v/<slug>?t=4        at table 4 (opens ordering from there)
// The old join (/?campaign=), stamp (/stamp?campaign=) and order (/order/)
// links keep working; the page only links into them.

/** The shop's own view of its page (owner only). */
export interface MyBusinessPage {
  slug: string;
  about: string | null;
  /** The code at the till that guests type to collect a stamp from the page. */
  counterCode: string | null;
}

/** What a guest's phone gets for a page address. */
export interface PublicBusinessPage {
  campaignId: string;
  merchantId: string;
  slug: string;
  businessName: string;
  offerTitle: string | null;
  maxStamps: number | null;
  logoImage: string | null;
  logoMode: string | null;
  customIcon: string | null;
  primaryColor: string | null;
  cardColor: string | null;
  cardTextColor: string | null;
  about: string | null;
  links: Record<string, string>;
  approved: boolean;
  available: boolean;
  selfServe: boolean;
  orderingOpen: boolean;
  locations: { id: string; name: string }[];
}

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
export const ABOUT_MAX = 300;

/** True when a typed address is one the database accepts. */
export function validSlug(s: string): boolean {
  return SLUG_RE.test(s) && !s.includes('--');
}

/** The link a QR code for the page opens. */
export function businessPageUrl(
  slug: string,
  opts: { locationId?: string | null; table?: string | null } = {},
  origin = typeof window !== 'undefined' ? window.location.origin : 'https://stampfix.app',
): string {
  const q = new URLSearchParams();
  if (opts.locationId) q.set('l', opts.locationId);
  if (opts.table) q.set('t', opts.table);
  const s = q.toString();
  return `${origin}/v/${slug}${s ? `?${s}` : ''}`;
}

/** The shop's page, made on first use. Throws when the database isn't set up. */
export async function getMyBusinessPage(campaignId: string): Promise<MyBusinessPage> {
  const { data, error } = await supabase.rpc('my_business_page', { p_campaign: campaignId });
  if (error) throw error;
  const d = data as { slug: string; about: string | null; counter_code: string | null };
  return { slug: d.slug, about: d.about, counterCode: d.counter_code };
}

export type SavePageError = 'bad_slug' | 'slug_taken' | 'about_too_long' | 'too_many_changes' | 'no_page' | 'network';

export async function saveBusinessPage(campaignId: string, slug: string, about: string | null):
  Promise<{ ok: true; page: MyBusinessPage } | { ok: false; error: SavePageError }> {
  const { data, error } = await supabase.rpc('save_business_page', { p_campaign: campaignId, p_slug: slug, p_about: about ?? '' });
  if (error) return { ok: false, error: 'network' };
  const d = data as { ok: boolean; error?: SavePageError; slug?: string; about?: string | null; counter_code?: string | null };
  if (!d?.ok) return { ok: false, error: d?.error ?? 'network' };
  return { ok: true, page: { slug: d.slug!, about: d.about ?? null, counterCode: d.counter_code ?? null } };
}

export type CounterCodeError = 'bad_code' | 'same_as_cashier_code' | 'no_page' | 'network';

/** A chosen code, or a new random one when `code` is empty. */
export async function setCounterCode(campaignId: string, code?: string | null):
  Promise<{ ok: true; code: string } | { ok: false; error: CounterCodeError }> {
  const { data, error } = await supabase.rpc('set_counter_code', { p_campaign: campaignId, p_code: code || null });
  if (error) return { ok: false, error: 'network' };
  const d = data as { ok: boolean; error?: CounterCodeError; counter_code?: string };
  if (!d?.ok) return { ok: false, error: d?.error ?? 'network' };
  return { ok: true, code: d.counter_code! };
}

/** The page for an address, or null when there is none. Throws on network errors. */
export async function getPublicBusinessPage(slug: string): Promise<PublicBusinessPage | null> {
  const { data, error } = await supabase.rpc('business_page', { p_slug: slug });
  if (error) throw error;
  if (!data) return null;
  const d = data as Record<string, unknown>;
  const links = (d.links && typeof d.links === 'object' ? d.links : {}) as Record<string, unknown>;
  return {
    campaignId: String(d.campaign_id),
    merchantId: String(d.merchant_id),
    slug: String(d.slug),
    businessName: String(d.business_name ?? ''),
    offerTitle: (d.offer_title as string | null) ?? null,
    maxStamps: typeof d.max_stamps === 'number' ? d.max_stamps : null,
    logoImage: (d.logo_image as string | null) ?? null,
    logoMode: (d.logo_mode as string | null) ?? null,
    customIcon: (d.custom_icon as string | null) ?? null,
    primaryColor: (d.primary_color as string | null) ?? null,
    cardColor: (d.card_color as string | null) ?? null,
    cardTextColor: (d.card_text_color as string | null) ?? null,
    about: (d.about as string | null) ?? null,
    links: Object.fromEntries(Object.entries(links).filter(([, v]) => typeof v === 'string' && v.trim() !== '')) as Record<string, string>,
    approved: d.approved === true,
    available: d.available !== false,
    selfServe: d.self_serve === true,
    orderingOpen: d.ordering_open === true,
    locations: Array.isArray(d.locations) ? (d.locations as { id: string; name: string }[]) : [],
  };
}
