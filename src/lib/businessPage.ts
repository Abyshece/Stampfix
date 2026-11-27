import { supabase } from './supabase';

// The Business page: one page, and one QR code, per shop.
//   stampfix.app/v/<slug>            the shop's page
//   stampfix.app/v/<slug>?l=<id>     at one branch (shops with several)
//   stampfix.app/v/<slug>?t=4        at table 4 (opens ordering from there)
// The old join (/?campaign=), stamp (/stamp?campaign=) and order (/order/)
// links keep working; the page only links into them.

export type PageBackground = 'cream' | 'white' | 'stone' | 'dark';
export type PageHeading = 'serif' | 'sans';
export const PAGE_BACKGROUNDS: PageBackground[] = ['cream', 'white', 'stone', 'dark'];

/** The page's look (Pro). A null accent means "the card's colour". */
export interface PageLook {
  accentColor: string | null;
  background: PageBackground;
  headingStyle: PageHeading;
}
export const DEFAULT_LOOK: PageLook = { accentColor: null, background: 'cream', headingStyle: 'serif' };

/** A story as guests get it: ready-to-use web addresses for the files. */
export interface PageStory {
  id: string;
  kind: 'video' | 'photo';
  mediaUrl: string;
  posterUrl: string;
  label: string | null;
  durationMs: number | null;
  hasSound: boolean;
}

/** The shop's own view of its page (owner only). */
export interface MyBusinessPage {
  slug: string;
  about: string | null;
  /** The code at the till that guests type to collect a stamp from the page. */
  counterCode: string | null;
  /** Missing until the second Business page database update has run. */
  look?: PageLook;
  extras?: PageExtras;
}

/** Wi-Fi details and the feedback and game switches (every plan). */
export interface PageExtras {
  wifiSsid: string | null;
  wifiPassword: string | null;
  feedbackOn: boolean;
  gameOn: boolean;
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
  /** Pro shops' own look; null means the standard look. */
  look: PageLook | null;
  /** Pro shops' stories, in the shop's order (none otherwise). */
  stories: PageStory[];
  /** The shop's guest Wi-Fi (password null for an open network). */
  wifi: { ssid: string; password: string | null } | null;
  feedbackOn: boolean;
  gameOn: boolean;
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
  const d = data as Record<string, unknown>;
  return {
    slug: String(d.slug), about: (d.about as string | null) ?? null, counterCode: (d.counter_code as string | null) ?? null,
    look: 'background' in d ? parseLook(d) ?? undefined : undefined,
    extras: 'feedback_enabled' in d ? parseExtras(d) : undefined,
  };
}

function parseExtras(d: Record<string, unknown>): PageExtras {
  return {
    wifiSsid: typeof d.wifi_ssid === 'string' && d.wifi_ssid ? d.wifi_ssid : null,
    wifiPassword: typeof d.wifi_password === 'string' && d.wifi_password ? d.wifi_password : null,
    feedbackOn: d.feedback_enabled !== false,
    gameOn: d.game_enabled !== false,
  };
}

function parseLook(d: unknown): PageLook | null {
  if (!d || typeof d !== 'object') return null;
  const o = d as Record<string, unknown>;
  const accent = typeof o.accent_color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(o.accent_color) ? o.accent_color : null;
  const background = PAGE_BACKGROUNDS.includes(o.background as PageBackground) ? o.background as PageBackground : 'cream';
  return { accentColor: accent, background, headingStyle: o.heading_style === 'sans' ? 'sans' : 'serif' };
}

/** The public web address of a file in the stories bucket. */
export function storyFileUrl(path: string): string {
  return supabase.storage.from('page-stories').getPublicUrl(path).data.publicUrl;
}

function parseStories(v: unknown): PageStory[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x): PageStory[] => {
    const o = (x ?? {}) as Record<string, unknown>;
    if (typeof o.id !== 'string' || typeof o.media_path !== 'string' || typeof o.poster_path !== 'string') return [];
    if (o.kind !== 'video' && o.kind !== 'photo') return [];
    return [{
      id: o.id, kind: o.kind, mediaUrl: storyFileUrl(o.media_path), posterUrl: storyFileUrl(o.poster_path),
      label: typeof o.label === 'string' && o.label.trim() ? o.label : null,
      durationMs: typeof o.duration_ms === 'number' ? o.duration_ms : null,
      hasSound: o.kind === 'video' && o.has_sound === true,
    }];
  }).slice(0, 10);
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
    look: parseLook(d.look),
    stories: parseStories(d.stories),
    wifi: parseWifi(d.wifi),
    // Both stay off until the database knows about them.
    feedbackOn: d.feedback_on === true,
    gameOn: d.game_on === true,
  };
}

function parseWifi(v: unknown): PublicBusinessPage['wifi'] {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.ssid !== 'string' || !o.ssid.trim()) return null;
  return { ssid: o.ssid, password: typeof o.password === 'string' && o.password ? o.password : null };
}

// ---- The look (Pro) ----------------------------------------------------------

export type SaveLookError = 'pro_only' | 'bad_colour' | 'bad_background' | 'bad_heading' | 'no_page' | 'network';

export async function savePageLook(campaignId: string, look: PageLook):
  Promise<{ ok: true; look: PageLook } | { ok: false; error: SaveLookError }> {
  const { data, error } = await supabase.rpc('save_page_look', {
    p_campaign: campaignId, p_accent: look.accentColor, p_background: look.background, p_heading: look.headingStyle,
  });
  if (error) return { ok: false, error: 'network' };
  const d = data as { ok: boolean; error?: SaveLookError } & Record<string, unknown>;
  if (!d?.ok) return { ok: false, error: d?.error ?? 'network' };
  return { ok: true, look: parseLook(d) ?? DEFAULT_LOOK };
}

// ---- Wi-Fi, feedback and game switches (every plan) ----------------------------

export type SaveExtrasError = 'bad_ssid' | 'bad_password' | 'no_page' | 'network';

export async function savePageExtras(campaignId: string, x: PageExtras):
  Promise<{ ok: true; extras: PageExtras } | { ok: false; error: SaveExtrasError }> {
  const { data, error } = await supabase.rpc('save_page_extras', {
    p_campaign: campaignId, p_wifi_ssid: x.wifiSsid ?? '', p_wifi_password: x.wifiPassword ?? '',
    p_feedback: x.feedbackOn, p_game: x.gameOn,
  });
  if (error) return { ok: false, error: 'network' };
  const d = data as { ok: boolean; error?: SaveExtrasError } & Record<string, unknown>;
  if (!d?.ok) return { ok: false, error: d?.error ?? 'network' };
  return { ok: true, extras: parseExtras(d) };
}

// ---- Feedback ----------------------------------------------------------------------

export type FeedbackError = 'bad_rating' | 'too_long' | 'off' | 'too_many' | 'network';
export const FEEDBACK_MAX = 500;

/** A random id for this phone, so one phone can't send feedback all day. */
function deviceId(): string | null {
  try {
    let id = localStorage.getItem('sf_device');
    if (!id) {
      id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem('sf_device', id);
    }
    return id;
  } catch {
    return null;
  }
}

/** A guest's anonymous feedback (no sign-in). */
export async function submitPageFeedback(campaignId: string, rating: number, message: string,
  opts: { locationId?: string | null; table?: string | null } = {}): Promise<{ ok: true } | { ok: false; error: FeedbackError }> {
  const { data, error } = await supabase.rpc('submit_page_feedback', {
    p_campaign: campaignId, p_rating: rating, p_message: message.trim() || null,
    p_location: opts.locationId ?? null, p_table: opts.table ?? null, p_device: deviceId(),
  });
  if (error) return { ok: false, error: 'network' };
  const d = data as { ok: boolean; error?: FeedbackError };
  if (!d?.ok) return { ok: false, error: d?.error ?? 'network' };
  return { ok: true };
}

export interface PageFeedback {
  id: string;
  rating: number;
  message: string | null;
  table: string | null;
  locationName: string | null;
  createdAt: string;
  read: boolean;
}

export async function getMyPageFeedback(campaignId: string): Promise<PageFeedback[]> {
  const { data, error } = await supabase.rpc('my_page_feedback', { p_campaign: campaignId });
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((x: Record<string, unknown>) => ({
    id: String(x.id), rating: Number(x.rating), message: (x.message as string | null) ?? null,
    table: (x.table_label as string | null) ?? null, locationName: (x.location_name as string | null) ?? null,
    createdAt: String(x.created_at), read: !!x.read_at,
  }));
}

/** Unread feedback for the badge; 0 when it can't be checked. */
export async function countUnreadFeedback(campaignId: string): Promise<number> {
  const { data, error } = await supabase.rpc('page_feedback_unread', { p_campaign: campaignId });
  if (error || typeof data !== 'number') return 0;
  return data;
}

export async function markFeedbackRead(campaignId: string): Promise<boolean> {
  const { error } = await supabase.rpc('mark_page_feedback_read', { p_campaign: campaignId });
  return !error;
}

export async function deleteFeedback(id: string): Promise<boolean> {
  const { error } = await supabase.rpc('delete_page_feedback', { p_id: id });
  return !error;
}

// ---- Stories (Pro), for the shop ----------------------------------------------------

export const STORIES_MAX = 10;
export const STORY_LABEL_MAX = 30;

export interface MyPageStory extends PageStory {
  hidden: boolean;
  mediaPath: string;
  posterPath: string;
}

export async function getMyPageStories(campaignId: string): Promise<MyPageStory[]> {
  const { data, error } = await supabase.rpc('my_page_stories', { p_campaign: campaignId });
  if (error) throw error;
  return (Array.isArray(data) ? data : []).flatMap((x: Record<string, unknown>): MyPageStory[] => {
    const [s] = parseStories([x]);
    if (!s) return [];
    return [{ ...s, hidden: x.hidden === true, mediaPath: String(x.media_path), posterPath: String(x.poster_path) }];
  });
}

export type AddStoryError = 'pro_only' | 'too_many' | 'bad_kind' | 'label_too_long' | 'bad_duration' | 'bad_files' | 'upload' | 'network';

/** Uploads the two files into the shop's folder and adds the story. Cleans up the files when it fails. */
export async function addPageStory(campaignId: string, input: {
  kind: 'video' | 'photo'; media: Blob; mediaType: string; poster: Blob; label: string | null; durationMs: number | null; hasSound: boolean;
}): Promise<{ ok: true; id: string } | { ok: false; error: AddStoryError }> {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}${Math.random().toString(36).slice(2)}`;
  const mediaPath = `${campaignId}/${id}.${input.kind === 'video' ? 'mp4' : 'jpg'}`;
  const posterPath = `${campaignId}/${id}-still.jpg`;
  const bucket = supabase.storage.from('page-stories');
  const up1 = await bucket.upload(mediaPath, input.media, { contentType: input.mediaType, cacheControl: '31536000', upsert: false });
  if (up1.error) return { ok: false, error: 'upload' };
  const up2 = await bucket.upload(posterPath, input.poster, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
  if (up2.error) { await bucket.remove([mediaPath]); return { ok: false, error: 'upload' }; }
  const { data, error } = await supabase.rpc('add_page_story', {
    p_campaign: campaignId, p_kind: input.kind, p_media_path: mediaPath, p_poster_path: posterPath,
    p_label: input.label, p_duration_ms: input.durationMs, p_has_sound: input.hasSound,
  });
  const d = data as { ok: boolean; error?: AddStoryError; id?: string } | null;
  if (error || !d?.ok) {
    await bucket.remove([mediaPath, posterPath]);
    return { ok: false, error: error ? 'network' : d?.error ?? 'network' };
  }
  return { ok: true, id: d.id! };
}

export async function updatePageStory(id: string, label: string | null, hidden: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc('update_page_story', { p_story: id, p_label: label, p_hidden: hidden });
  return !error && (data as { ok?: boolean } | null)?.ok === true;
}

export async function reorderPageStories(campaignId: string, ids: string[]): Promise<boolean> {
  const { error } = await supabase.rpc('reorder_page_stories', { p_campaign: campaignId, p_ids: ids });
  return !error;
}

/** Deletes the story, then its two files (owner, or a Stampfix admin). */
export async function deletePageStory(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('delete_page_story', { p_story: id });
  if (error) return false;
  const d = data as { media_path?: string; poster_path?: string } | null;
  const paths = [d?.media_path, d?.poster_path].filter((x): x is string => !!x);
  if (paths.length) await supabase.storage.from('page-stories').remove(paths);
  return true;
}

// ---- Stories, for Stampfix admins (moderation) ----------------------------------------

export interface AdminPageStory extends MyPageStory {
  campaignId: string;
  businessName: string;
  slug: string | null;
  createdAt: string;
}

export async function adminListPageStories(): Promise<AdminPageStory[]> {
  const { data, error } = await supabase.rpc('admin_page_stories');
  if (error) throw error;
  return (Array.isArray(data) ? data : []).flatMap((x: Record<string, unknown>): AdminPageStory[] => {
    const [s] = parseStories([x]);
    if (!s) return [];
    return [{
      ...s, hidden: x.hidden === true, mediaPath: String(x.media_path), posterPath: String(x.poster_path),
      campaignId: String(x.campaign_id), businessName: String(x.business_name ?? ''), slug: (x.slug as string | null) ?? null,
      createdAt: String(x.created_at),
    }];
  });
}
