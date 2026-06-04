import { supabase } from '../lib/supabase';

/**
 * Admin service — wrappers for platform-admin RPCs.
 *
 * Every function calls a SECURITY DEFINER Postgres function that checks
 * is_platform_admin() before returning data. If the caller isn't an
 * admin, the RPCs return null/empty and these wrappers surface a clean
 * "Not authorized" error.
 *
 * Don't bypass this layer with raw .from() queries — that's how data
 * leaks happen. All admin reads/writes go through these named RPCs.
 */

export interface PlatformStats {
  merchants_total: number;
  merchants_free: number;
  merchants_pro: number;
  cards_active: number;
  cards_blocked: number;
  activities_24h: number;
  activities_7d: number;
  new_merchants_7d: number;
  campaigns_total: number;
  locations_total: number;
  mrr_eur_cents: number;
  mrr_cad_cents: number;
  mrr_other_cents: number;
}

export interface MerchantRow {
  id: string;
  email: string;
  business_name: string;
  country: string | null;
  plan: 'free' | 'pro';
  is_platform_admin: boolean;
  created_at: string;
  card_count: number;
  recent_activity_count: number;
}

export interface SuspiciousRow {
  campaign_id: string;
  business_name: string;
  stamps_last_hour: number;
  first_stamp: string;
  last_stamp: string;
}

export interface ActivityRow {
  id: string;
  type: 'JOIN' | 'STAMP' | 'REDEEM' | 'BLOCK' | 'UNBLOCK';
  campaign_id: string;
  business_name: string;
  customer_name: string;
  created_at: string;
  location_name: string | null;
}

/** Returns whether the current user has the platform-admin flag. */
export async function checkIsAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_platform_admin');
  if (error) {
    console.warn('[admin] check failed:', error);
    return false;
  }
  return data === true;
}

export async function fetchPlatformStats(): Promise<PlatformStats | null> {
  const { data, error } = await supabase.rpc('admin_platform_stats');
  if (error) throw error;
  return data as PlatformStats | null;
}

export async function listMerchants(searchTerm?: string, limit = 50): Promise<MerchantRow[]> {
  const { data, error } = await supabase.rpc('admin_list_merchants', {
    search_term: searchTerm ?? null,
    limit_to: limit,
  });
  if (error) throw error;
  return (data ?? []) as MerchantRow[];
}

export async function fetchSuspicious(): Promise<SuspiciousRow[]> {
  const { data, error } = await supabase.rpc('admin_suspicious_stamping');
  if (error) throw error;
  return (data ?? []) as SuspiciousRow[];
}

export async function fetchAdminRecentActivity(limit = 30): Promise<ActivityRow[]> {
  const { data, error } = await supabase.rpc('admin_recent_activity', { limit_to: limit });
  if (error) throw error;
  return (data ?? []) as ActivityRow[];
}

export async function setMerchantPlan(merchantId: string, plan: 'free' | 'pro'): Promise<void> {
  const { error } = await supabase.rpc('admin_set_merchant_plan', {
    merchant_id_in: merchantId,
    new_plan: plan,
  });
  if (error) throw error;
}
