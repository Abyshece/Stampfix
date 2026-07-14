import { supabase } from '../lib/supabase';

export interface KPIBuckets {
  signups_today: number;
  signups_yesterday: number;
  signups_7d: number;
  signups_30d: number;
  customers_today: number;
  customers_7d: number;
  customers_30d: number;
  activities_today: number;
  activities_7d: number;
  activities_30d: number;
  rewards_today: number;
  rewards_7d: number;
  rewards_30d: number;
  open_tickets: number;
  new_contact_messages: number;
  signups_sparkline: Array<{ date: string; count: number }>;
}

/** Shape returned by admin_kpi_range. Each metric has total / prev / daily. */
export interface RangedKPIs {
  range_days: number;
  signups: KPIBlock;
  customers: KPIBlock;
  activity: KPIBlock;
  rewards: KPIBlock;
  open_tickets: number;
  new_contact_messages: number;
}

export interface KPIBlock {
  total: number;
  prev: number;
  daily: Array<{ date: string; count: number }>;
}

export type MerchantStatus = 'active' | 'frozen' | 'blocked' | 'deleted';

export interface MerchantRow {
  id: string;
  merchant_code: string;
  email: string;
  business_name: string;
  registered_company_name: string | null;
  country: string | null;
  plan: 'free' | 'pro';
  status: MerchantStatus;
  is_platform_admin: boolean;
  created_at: string;
  card_count: number;
  recent_activity_count: number;
  last_login_at: string | null;
  first_activity_at: string | null;
  plan_started_at: string | null;
  estimated_mrr_cents: number;
  estimated_total_cents: number;
  admin_notes: string | null;
  phone: string | null;
}

export interface CustomerCardDetail {
  card_id: string;
  merchant_name: string;
  campaign_offer: string | null;
  current_offer: string;
  current_stamps: number;
  max_stamps: number | null;
  rewards_redeemed: number;
  joined_at: string;
  deletion_pending: boolean;
}

export interface CustomerRow {
  customer_id: string;
  customer_code: string;
  customer_name: string;
  email: string;
  active_since: string;
  cards_in_wallet: number;
  total_stamps: number;
  total_rewards_redeemed: number;
  last_stamp_at: string | null;
  last_stamp_merchant: string | null;
  last_login_at: string | null;
  merchants_list: string;
  any_deletion_pending: boolean;
  cards_detail: CustomerCardDetail[];
  phone: string | null;
}

export interface TicketRow {
  id: string;
  source_type: 'merchant' | 'customer';
  merchant_id: string | null;
  merchant_code: string | null;
  merchant_email: string | null;
  customer_email: string | null;
  customer_name: string | null;
  related_business_name: string | null;
  category: string;
  subject: string;
  body: string;
  status: 'open' | 'in_progress' | 'resolved' | 'dismissed';
  admin_notes: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  inquiry_type: string;
  business_name: string | null;
  message: string;
  status: 'new' | 'replied' | 'archived';
  admin_notes: string | null;
  created_at: string;
}

/**
 * View-only admins can open the panel and read everything, but every mutating
 * admin action is blocked here — the single point all admin writes funnel
 * through. Pairs with the DB is_platform_admin flag (which grants read access).
 */
const READ_ONLY_ADMINS = new Set<string>(['ai4miketomar@gmail.com']);

async function assertNotReadOnly(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const email = (data.session?.user?.email ?? '').toLowerCase();
  if (READ_ONLY_ADMINS.has(email)) {
    throw new Error('You have view-only admin access \u2014 this action is disabled.');
  }
}

export function isReadOnlyAdminEmail(email: string | null | undefined): boolean {
  return READ_ONLY_ADMINS.has((email ?? '').toLowerCase());
}

export async function checkIsAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_platform_admin');
  if (error) { console.warn('[admin]', error); return false; }
  return data === true;
}

export interface StripeMrr {
  mrr_cents: number;
  currency: string;
  active_subscriptions: number;
}

/**
 * Exact current MRR straight from Stripe (active + trialing subscriptions,
 * monthly-normalised, discounts applied). This is the revenue source of truth:
 * comped merchants and discounts are excluded, unlike the plan-based per-merchant
 * estimate. Admin-only edge function.
 */
export async function fetchStripeMrr(): Promise<StripeMrr | null> {
  const { data, error } = await supabase.functions.invoke('get-stripe-mrr');
  if (error) { console.warn('[admin] stripe mrr', error); return null; }
  return data as StripeMrr;
}

export async function fetchKPIs(): Promise<KPIBuckets | null> {
  const { data, error } = await supabase.rpc('admin_kpi_buckets');
  if (error) throw error;
  return data as KPIBuckets | null;
}

export async function fetchRangedKPIs(fromDate: Date, toDate: Date): Promise<RangedKPIs | null> {
  const { data, error } = await supabase.rpc('admin_kpi_range', {
    from_date: fromDate.toISOString(),
    to_date: toDate.toISOString(),
  });
  if (error) throw error;
  return data as RangedKPIs | null;
}

/** Resolve signup phones (stored in auth user metadata) for a set of auth
 *  user ids and write them onto the rows in place. Best-effort: on failure
 *  the rows simply keep phone = null. */
async function attachPhones(
  rows: Array<{ phone?: string | null }>,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const { data, error } = await supabase.rpc('admin_user_phones', { ids });
  if (error) { console.warn('[admin] phone lookup failed', error); return; }
  const map = new Map<string, string | null>(
    ((data ?? []) as Array<{ id: string; phone: string | null }>).map((p) => [p.id, p.phone]),
  );
  rows.forEach((row, i) => { row.phone = map.get(ids[i]) ?? null; });
}

export async function listMerchants(searchTerm?: string, limit = 100): Promise<MerchantRow[]> {
  const { data, error } = await supabase.rpc('admin_list_merchants', {
    search_term: searchTerm ?? null,
    limit_to: limit,
  });
  if (error) throw error;
  const rows = (data ?? []) as MerchantRow[];
  await attachPhones(rows, rows.map((r) => r.id));
  return rows;
}

export async function listCustomers(
  searchTerm?: string,
  merchantId?: string | null,
  limit = 100,
): Promise<CustomerRow[]> {
  const { data, error } = await supabase.rpc('admin_list_customers', {
    search_term: searchTerm ?? null,
    merchant_filter: merchantId ?? null,
    limit_to: limit,
  });
  if (error) throw error;
  const rows = (data ?? []) as CustomerRow[];
  await attachPhones(rows, rows.map((r) => r.customer_id));
  return rows;
}

export async function listTickets(
  sourceFilter?: 'merchant' | 'customer' | null,
  statusFilter?: 'open' | 'in_progress' | 'resolved' | 'dismissed' | null,
  limit = 100,
): Promise<TicketRow[]> {
  const { data, error } = await supabase.rpc('admin_list_tickets', {
    source_filter: sourceFilter ?? null,
    status_filter: statusFilter ?? null,
    limit_to: limit,
  });
  if (error) throw error;
  return (data ?? []) as TicketRow[];
}

export async function setMerchantStatus(merchantId: string, status: MerchantStatus): Promise<void> {
  await assertNotReadOnly();
  const { error } = await supabase.rpc('admin_set_merchant_status', {
    merchant_id_in: merchantId,
    new_status: status,
  });
  if (error) throw error;
}

export async function setMerchantPlan(merchantId: string, plan: 'free' | 'pro'): Promise<void> {
  await assertNotReadOnly();
  const { error } = await supabase.rpc('admin_set_merchant_plan', {
    merchant_id_in: merchantId,
    new_plan: plan,
  });
  if (error) throw error;
}

export async function setMerchantNotes(merchantId: string, notes: string): Promise<void> {
  await assertNotReadOnly();
  const { error } = await supabase.rpc('admin_set_merchant_notes', {
    merchant_id_in: merchantId,
    notes,
  });
  if (error) throw error;
}

export async function setTicketStatus(
  ticketId: string,
  status: 'open' | 'in_progress' | 'resolved' | 'dismissed',
  notes?: string,
): Promise<void> {
  await assertNotReadOnly();
  const { error } = await supabase.rpc('admin_set_ticket_status', {
    ticket_id_in: ticketId,
    new_status: status,
    notes: notes ?? null,
  });
  if (error) throw error;
}

export async function listContactMessages(statusFilter?: string | null, limit = 100): Promise<ContactMessage[]> {
  const { data, error } = await supabase.rpc('admin_list_contact_messages', {
    status_filter: statusFilter ?? null,
    limit_to: limit,
  });
  if (error) throw error;
  return (data ?? []) as ContactMessage[];
}

export async function setContactMessageStatus(messageId: string, status: 'new' | 'replied' | 'archived'): Promise<void> {
  await assertNotReadOnly();
  const { error } = await supabase.rpc('admin_set_contact_message_status', {
    message_id: messageId,
    new_status: status,
  });
  if (error) throw error;
}

export async function submitContactMessage(input: {
  name: string;
  email: string;
  inquiryType: 'merchant_inquiry' | 'customer_inquiry' | 'partnership' | 'other';
  businessName?: string;
  message: string;
}): Promise<void> {
  const { error } = await supabase.from('contact_messages').insert({
    name: input.name.trim(),
    email: input.email.trim(),
    inquiry_type: input.inquiryType,
    business_name: input.businessName?.trim() ?? null,
    message: input.message.trim(),
  });
  if (error) throw error;
}

export async function submitTicket(input: {
  sourceType: 'merchant' | 'customer';
  merchantId?: string | null;
  customerEmail?: string | null;
  customerName?: string | null;
  relatedMerchantId?: string | null;
  relatedCampaignId?: string | null;
  category: string;
  subject: string;
  body: string;
}): Promise<void> {
  const { error } = await supabase.from('support_tickets').insert({
    source_type: input.sourceType,
    merchant_id: input.merchantId ?? null,
    customer_email: input.customerEmail ?? null,
    customer_name: input.customerName ?? null,
    related_merchant_id: input.relatedMerchantId ?? null,
    related_campaign_id: input.relatedCampaignId ?? null,
    category: input.category,
    subject: input.subject.trim(),
    body: input.body.trim(),
  });
  if (error) throw error;
}

// =====================================================================
// Promo banners
// =====================================================================

export interface PromoBanner {
  id: string;
  headline: string;
  subtext: string | null;
  coupon_code: string | null;
  discount_percent: number | null;
  cta_url: string | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  variant: 'red' | 'blue' | 'green' | 'amber';
  created_at: string;
  updated_at: string;
}

/** Admin-only: list ALL banners regardless of active state. */
export async function adminListPromoBanners(): Promise<PromoBanner[]> {
  const { data, error } = await supabase.rpc('admin_list_promo_banners');
  if (error) throw error;
  return (data ?? []) as PromoBanner[];
}

/** Public: list currently-visible banners (active + within date window). */
export async function listActivePromoBanners(): Promise<PromoBanner[]> {
  // RLS does the filtering server-side; we just need active=true rows.
  const { data, error } = await supabase
    .from('promo_banners')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    // Non-fatal; landing page works without banners
    console.warn('[promo] could not load banners', error);
    return [];
  }
  return (data ?? []) as PromoBanner[];
}

export async function upsertPromoBanner(input: {
  id?: string | null;
  headline: string;
  subtext?: string | null;
  coupon_code?: string | null;
  discount_percent?: number | null;
  cta_url?: string | null;
  is_active: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
  variant: 'red' | 'blue' | 'green' | 'amber';
}): Promise<string> {
  await assertNotReadOnly();
  const { data, error } = await supabase.rpc('admin_upsert_promo_banner', {
    banner_id: input.id ?? null,
    headline_in: input.headline,
    subtext_in: input.subtext ?? null,
    coupon_code_in: input.coupon_code ?? null,
    discount_percent_in: input.discount_percent ?? null,
    cta_url_in: input.cta_url ?? null,
    is_active_in: input.is_active,
    starts_at_in: input.starts_at ?? null,
    ends_at_in: input.ends_at ?? null,
    variant_in: input.variant,
  });
  if (error) throw error;
  return data as string;
}

export async function deletePromoBanner(id: string): Promise<void> {
  await assertNotReadOnly();
  const { error } = await supabase.rpc('admin_delete_promo_banner', { banner_id: id });
  if (error) throw error;
}

// ---- Logs (admin monitoring tab) ----
export interface ActivityLogRow {
  created_at: string;
  type: string;
  customer_name: string | null;
  source: string | null;
  campaign_id: string | null;
  business_name: string | null;
}
export interface WalletErrorRow {
  created: string;
  status_code: number | null;
  detail: string | null;
}
export interface SignupRow {
  created_at: string;
  business_name: string | null;
  email: string | null;
  plan: string;
}
export interface JobRunRow {
  jobname: string | null;
  status: string | null;
  return_message: string | null;
  start_time: string;
}

export async function fetchActivityLog(limit = 150, type?: string | null): Promise<ActivityLogRow[]> {
  const { data, error } = await supabase.rpc('admin_activity_log', { p_limit: limit, p_type: type ?? null });
  if (error) throw error;
  return (data as ActivityLogRow[]) ?? [];
}
export async function fetchWalletErrors(limit = 100): Promise<WalletErrorRow[]> {
  const { data, error } = await supabase.rpc('admin_wallet_errors', { p_limit: limit });
  if (error) throw error;
  return (data as WalletErrorRow[]) ?? [];
}
export async function fetchRecentSignups(limit = 100): Promise<SignupRow[]> {
  const { data, error } = await supabase.rpc('admin_recent_signups', { p_limit: limit });
  if (error) throw error;
  return (data as SignupRow[]) ?? [];
}
export async function fetchJobRuns(limit = 50): Promise<JobRunRow[]> {
  const { data, error } = await supabase.rpc('admin_job_runs', { p_limit: limit });
  if (error) throw error;
  return (data as JobRunRow[]) ?? [];
}
