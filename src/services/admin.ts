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
  country: string | null;
  plan: 'free' | 'pro';
  status: MerchantStatus;
  is_platform_admin: boolean;
  created_at: string;
  card_count: number;
  recent_activity_count: number;
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

export async function checkIsAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_platform_admin');
  if (error) { console.warn('[admin]', error); return false; }
  return data === true;
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

export async function listMerchants(searchTerm?: string, limit = 100): Promise<MerchantRow[]> {
  const { data, error } = await supabase.rpc('admin_list_merchants', {
    search_term: searchTerm ?? null,
    limit_to: limit,
  });
  if (error) throw error;
  return (data ?? []) as MerchantRow[];
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
  return (data ?? []) as CustomerRow[];
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
  const { error } = await supabase.rpc('admin_set_merchant_status', {
    merchant_id_in: merchantId,
    new_status: status,
  });
  if (error) throw error;
}

export async function setMerchantPlan(merchantId: string, plan: 'free' | 'pro'): Promise<void> {
  const { error } = await supabase.rpc('admin_set_merchant_plan', {
    merchant_id_in: merchantId,
    new_plan: plan,
  });
  if (error) throw error;
}

export async function setTicketStatus(
  ticketId: string,
  status: 'open' | 'in_progress' | 'resolved' | 'dismissed',
  notes?: string,
): Promise<void> {
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
