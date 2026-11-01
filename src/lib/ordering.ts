import { supabase } from './supabase';

// Add-on: digital menu + table ordering (Pro). Guests scan a table QR, order
// from their phone and pay at the counter; the shop works orders in the
// dashboard (new -> accepted -> ready -> completed, or rejected).
//
// The shop edits its menu and settings through RLS (owner only). Guests only
// use the public_menu / place_order / order_status RPCs, which check that
// ordering is on and price the order on the server.

export interface OrderingSettings {
  enabled: boolean;
  /** Table labels the shop prints QR codes for. */
  tables: string[];
  /** Shown at the top of the menu, e.g. "Kitchen closes at 9 pm". */
  note: string | null;
}

export interface MenuCategory { id: string; name: string; position: number }

export interface MenuItem {
  id: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  price: number;
  available: boolean;
  position: number;
}

export type OrderStatus = 'new' | 'accepted' | 'ready' | 'completed' | 'rejected';

export interface OrderLine { name: string; quantity: number; price: number }

export interface Order {
  id: string;
  number: number;
  status: OrderStatus;
  tableLabel: string | null;
  customerName: string | null;
  note: string | null;
  rejectReason: string | null;
  total: number;
  locationId: string | null;
  createdAt: string;
  items: OrderLine[];
}

export const MAX_TABLES = 200;

// ---- Settings -----------------------------------------------------------------

export async function getOrderingSettings(campaignId: string): Promise<OrderingSettings> {
  const { data, error } = await supabase
    .from('ordering_settings')
    .select('enabled, tables, note')
    .eq('campaign_id', campaignId)
    .maybeSingle();
  if (error) throw error;
  const r = data as { enabled: boolean; tables: string[] | null; note: string | null } | null;
  return { enabled: r?.enabled ?? false, tables: r?.tables ?? [], note: r?.note ?? null };
}

export async function saveOrderingSettings(campaignId: string, s: OrderingSettings): Promise<void> {
  const { error } = await supabase.from('ordering_settings').upsert({
    campaign_id: campaignId,
    enabled: s.enabled,
    tables: s.tables,
    note: s.note && s.note.trim() ? s.note.trim().slice(0, 200) : null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

// ---- Menu (owner) ----------------------------------------------------------------

type CategoryRow = { id: string; name: string; position: number };
type ItemRow = {
  id: string; category_id: string | null; name: string; description: string | null;
  price: number | string; available: boolean; position: number;
};
const toItem = (r: ItemRow): MenuItem => ({
  id: r.id, categoryId: r.category_id, name: r.name, description: r.description,
  price: Number(r.price), available: r.available, position: r.position,
});

export async function listMenu(campaignId: string): Promise<{ categories: MenuCategory[]; items: MenuItem[] }> {
  const [cats, items] = await Promise.all([
    supabase.from('menu_categories').select('id, name, position').eq('campaign_id', campaignId)
      .order('position').order('created_at'),
    supabase.from('menu_items').select('id, category_id, name, description, price, available, position')
      .eq('campaign_id', campaignId).order('position').order('created_at'),
  ]);
  if (cats.error) throw cats.error;
  if (items.error) throw items.error;
  return {
    categories: ((cats.data as CategoryRow[] | null) ?? []).map((c) => ({ id: c.id, name: c.name, position: c.position })),
    items: ((items.data as ItemRow[] | null) ?? []).map(toItem),
  };
}

export async function createCategory(campaignId: string, name: string, position: number): Promise<void> {
  const { error } = await supabase.from('menu_categories').insert({ campaign_id: campaignId, name: name.trim(), position });
  if (error) throw error;
}

export async function updateCategory(id: string, patch: { name?: string; position?: number }): Promise<void> {
  const { error } = await supabase.from('menu_categories').update({
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.position !== undefined ? { position: patch.position } : {}),
  }).eq('id', id);
  if (error) throw error;
}

/** Items in the category stay on the menu, without a category. */
export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from('menu_categories').delete().eq('id', id);
  if (error) throw error;
}

export interface ItemInput {
  name: string; description: string | null; price: number; categoryId: string | null; available: boolean;
}

export async function createItem(campaignId: string, input: ItemInput, position: number): Promise<void> {
  const { error } = await supabase.from('menu_items').insert({
    campaign_id: campaignId, category_id: input.categoryId, name: input.name.trim(),
    description: input.description?.trim() || null, price: input.price, available: input.available, position,
  });
  if (error) throw error;
}

export async function updateItem(id: string, patch: Partial<ItemInput> & { position?: number }): Promise<void> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.description !== undefined) row.description = patch.description?.trim() || null;
  if (patch.price !== undefined) row.price = patch.price;
  if (patch.categoryId !== undefined) row.category_id = patch.categoryId;
  if (patch.available !== undefined) row.available = patch.available;
  if (patch.position !== undefined) row.position = patch.position;
  const { error } = await supabase.from('menu_items').update(row).eq('id', id);
  if (error) throw error;
}

/** Past orders keep their own copy of the item's name and price. */
export async function deleteItem(id: string): Promise<void> {
  const { error } = await supabase.from('menu_items').delete().eq('id', id);
  if (error) throw error;
}

// ---- Orders (owner) --------------------------------------------------------------

type OrderRow = {
  id: string; order_number: number; status: OrderStatus; table_label: string | null; customer_name: string | null;
  note: string | null; reject_reason: string | null; total: number | string; location_id: string | null; created_at: string;
  order_items: Array<{ name: string; quantity: number; price: number | string }> | null;
};

/** Open orders plus the ones finished in the last 12 hours, newest first. */
export async function listOrders(campaignId: string): Promise<Order[]> {
  const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('orders')
    .select('id, order_number, status, table_label, customer_name, note, reject_reason, total, location_id, created_at, order_items(name, quantity, price)')
    .eq('campaign_id', campaignId)
    .or(`status.in.(new,accepted,ready),created_at.gte."${since}"`)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return ((data as OrderRow[] | null) ?? []).map((r) => ({
    id: r.id, number: r.order_number, status: r.status, tableLabel: r.table_label, customerName: r.customer_name,
    note: r.note, rejectReason: r.reject_reason, total: Number(r.total), locationId: r.location_id, createdAt: r.created_at,
    items: (r.order_items ?? []).map((i) => ({ name: i.name, quantity: i.quantity, price: Number(i.price) })),
  }));
}

/** How many orders are waiting to be accepted (for the menu badge). */
export async function countNewOrders(campaignId: string): Promise<number> {
  const { count, error } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('status', 'new');
  if (error) throw error;
  return count ?? 0;
}

export async function setOrderStatus(orderId: string, status: OrderStatus, reason?: string): Promise<void> {
  const { error } = await supabase.rpc('set_order_status', { p_order: orderId, p_status: status, p_reason: reason ?? null });
  if (error) throw error;
}

// ---- Guest ---------------------------------------------------------------------

export interface PublicMenu {
  businessName: string;
  logoImage: string | null;
  primaryColor: string | null;
  country: string | null;
  open: boolean;
  note: string | null;
  categories: Array<{ id: string; name: string }>;
  items: Array<{ id: string; categoryId: string | null; name: string; description: string | null; price: number }>;
}

/** The shop's menu for guests; null when the shop doesn't exist. */
export async function fetchPublicMenu(campaignId: string): Promise<PublicMenu | null> {
  const { data, error } = await supabase.rpc('public_menu', { p_campaign: campaignId });
  if (error) throw error;
  if (!data) return null;
  const d = data as {
    business_name: string; logo_image: string | null; primary_color: string | null; country: string | null;
    open: boolean; note: string | null; categories: Array<{ id: string; name: string }> | null;
    items: Array<{ id: string; category_id: string | null; name: string; description: string | null; price: number | string }> | null;
  };
  return {
    businessName: d.business_name, logoImage: d.logo_image, primaryColor: d.primary_color, country: d.country,
    open: d.open === true, note: d.note, categories: d.categories ?? [],
    items: (d.items ?? []).map((i) => ({ id: i.id, categoryId: i.category_id, name: i.name, description: i.description, price: Number(i.price) })),
  };
}

export type PlaceOrderError = 'ordering_closed' | 'too_many_orders' | 'item_unavailable' | 'invalid_items' | 'unknown';

export async function placeOrder(p: {
  campaignId: string; table: string | null; locationId: string | null; name: string; note: string;
  items: Array<{ id: string; qty: number }>;
}): Promise<{ token: string; number: number; total: number }> {
  const { data, error } = await supabase.rpc('place_order', {
    p_campaign: p.campaignId, p_table: p.table, p_location: p.locationId,
    p_name: p.name, p_note: p.note, p_items: p.items,
  });
  if (error) {
    const known: PlaceOrderError[] = ['ordering_closed', 'too_many_orders', 'item_unavailable', 'invalid_items'];
    const code = known.find((k) => error.message?.includes(k)) ?? 'unknown';
    throw Object.assign(new Error(code), { code });
  }
  const d = data as { token: string; number: number; total: number | string };
  return { token: d.token, number: d.number, total: Number(d.total) };
}

export interface GuestOrderStatus {
  number: number;
  status: OrderStatus;
  rejectReason: string | null;
  table: string | null;
  total: number;
  createdAt: string;
  businessName: string;
  country: string | null;
  items: OrderLine[];
}

export async function fetchOrderStatus(token: string): Promise<GuestOrderStatus | null> {
  const { data, error } = await supabase.rpc('order_status', { p_token: token });
  if (error) throw error;
  if (!data) return null;
  const d = data as {
    number: number; status: OrderStatus; reject_reason: string | null; table: string | null; total: number | string;
    created_at: string; business_name: string; country: string | null;
    items: Array<{ name: string; quantity: number; price: number | string }> | null;
  };
  return {
    number: d.number, status: d.status, rejectReason: d.reject_reason, table: d.table, total: Number(d.total),
    createdAt: d.created_at, businessName: d.business_name, country: d.country,
    items: (d.items ?? []).map((i) => ({ name: i.name, quantity: i.quantity, price: Number(i.price) })),
  };
}

/** True for "4" or "12b" (shown as "Table 4"); false for names like "Terrace 1" (shown as they are). */
export function isTableNumber(label: string): boolean {
  return /^\d{1,4}[a-zA-Z]?$/.test(label.trim());
}

/** The link a table QR code opens. */
export function orderUrl(campaignId: string, table: string | null, locationId: string | null, origin = window.location.origin): string {
  const q = new URLSearchParams();
  if (table) q.set('table', table);
  if (locationId) q.set('loc', locationId);
  const s = q.toString();
  return `${origin}/order/${campaignId}${s ? `?${s}` : ''}`;
}

/** The currency symbol for a shop's country. */
export function menuCurrency(country: string | null | undefined): string {
  return country === 'DE' ? '€' : 'CA$';
}

/** Currency symbol and number formatting for a shop's country. */
export function menuMoney(country: string | null | undefined, lang: string): (n: number) => string {
  const symbol = menuCurrency(country);
  const locale = lang.startsWith('de') ? 'de-DE' : 'en-CA';
  return (n: number) => symbol + n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---- Menu uploads (shop -> Stampfix) ------------------------------------------------
// Shops send photos or a PDF of their menu; Stampfix adds the items for them.
// Files go to the private menu-uploads bucket, in a folder per shop.

export type MenuUploadStatus = 'new' | 'in_progress' | 'done' | 'needs_info';
export interface MenuUploadFile { path: string; name: string; type: string | null; size: number | null }
export interface MenuUpload {
  id: string;
  status: MenuUploadStatus;
  note: string | null;
  adminNote: string | null;
  createdAt: string;
  files: MenuUploadFile[];
}

export const MENU_UPLOAD_MAX_FILES = 15;
export const MENU_UPLOAD_MAX_BYTES = 15 * 1024 * 1024;
const MENU_UPLOAD_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  heic: 'image/heic', heif: 'image/heif', pdf: 'application/pdf',
};

/** The file's type, from the browser or (when it doesn't know, e.g. HEIC on Windows) the extension. Null when not allowed. */
export function menuFileType(file: { name: string; type: string }): string | null {
  const allowed = Object.values(MENU_UPLOAD_TYPES);
  if (file.type && allowed.includes(file.type)) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return MENU_UPLOAD_TYPES[ext] ?? null;
}

/** Browsers can show these inline; HEIC and PDF open in a new tab instead. */
export function isPreviewableImage(type: string | null | undefined): boolean {
  return type === 'image/jpeg' || type === 'image/png' || type === 'image/webp';
}

export async function listMenuUploads(campaignId: string): Promise<MenuUpload[]> {
  const { data, error } = await supabase
    .from('menu_uploads')
    .select('id, status, note, admin_note, created_at, files')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  return ((data as Array<{ id: string; status: MenuUploadStatus; note: string | null; admin_note: string | null; created_at: string; files: MenuUploadFile[] | null }> | null) ?? [])
    .map((r) => ({ id: r.id, status: r.status, note: r.note, adminNote: r.admin_note, createdAt: r.created_at, files: r.files ?? [] }));
}

export type MenuUploadError = 'too_many_uploads' | 'invalid_files' | 'unknown';

/** Uploads the files into the shop's folder, then sends them to Stampfix in one go. */
export async function uploadMenu(campaignId: string, files: File[], note: string, onProgress?: (done: number, total: number) => void): Promise<void> {
  const batch = (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : String(Date.now());
  const sent: Array<{ path: string; name: string }> = [];
  for (const [i, f] of files.entries()) {
    const safe = f.name.normalize('NFKD').replace(/[^\w.-]+/g, '_').replace(/^_+/, '').slice(-80) || `file-${i + 1}`;
    const path = `${campaignId}/${batch}/${i + 1}-${safe}`;
    const { error } = await supabase.storage.from('menu-uploads').upload(path, f, { contentType: menuFileType(f) ?? undefined, upsert: false });
    if (error) throw Object.assign(new Error('unknown'), { code: 'unknown' as MenuUploadError });
    sent.push({ path, name: f.name.slice(0, 120) });
    onProgress?.(i + 1, files.length);
  }
  const { error } = await supabase.rpc('submit_menu_upload', { p_campaign: campaignId, p_files: sent, p_note: note.trim() || null });
  if (error) {
    const code: MenuUploadError = error.message?.includes('too_many_uploads') ? 'too_many_uploads' : error.message?.includes('invalid_files') ? 'invalid_files' : 'unknown';
    throw Object.assign(new Error(code), { code });
  }
}

/** Short-lived links to view uploaded menu files (the bucket is private). */
export async function menuFileUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage.from('menu-uploads').createSignedUrls(paths, 60 * 60);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}

// ---- Admin -----------------------------------------------------------------------

export interface AdminMenuUpload extends MenuUpload {
  campaignId: string;
  businessName: string;
  country: string | null;
  plan: string;
  ownerEmail: string | null;
  reviewedAt: string | null;
  menuItems: number;
}

export async function adminListMenuUploads(): Promise<AdminMenuUpload[]> {
  const { data, error } = await supabase.rpc('admin_menu_uploads', { p_status: null });
  if (error) throw error;
  return ((data as Array<Record<string, unknown>> | null) ?? []).map((r) => ({
    id: r.id as string, status: r.status as MenuUploadStatus, note: (r.note as string | null) ?? null,
    adminNote: (r.admin_note as string | null) ?? null, createdAt: r.created_at as string,
    files: (r.files as MenuUploadFile[] | null) ?? [], campaignId: r.campaign_id as string,
    businessName: (r.business_name as string) ?? '', country: (r.country as string | null) ?? null,
    plan: (r.plan as string) ?? 'free', ownerEmail: (r.owner_email as string | null) ?? null,
    reviewedAt: (r.reviewed_at as string | null) ?? null, menuItems: Number(r.menu_items ?? 0),
  }));
}

export async function adminSetMenuUpload(id: string, status: MenuUploadStatus, adminNote?: string): Promise<void> {
  const { error } = await supabase.rpc('admin_set_menu_upload', { p_id: id, p_status: status, p_admin_note: adminNote ?? null });
  if (error) throw error;
}
