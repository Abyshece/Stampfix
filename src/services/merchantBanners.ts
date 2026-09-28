import { supabase } from '../lib/supabase';
import { isReadOnlyAdminEmail } from './admin';

/** Dashboard pages a banner's button can open (the merchant dashboard's tabs). */
export const BANNER_TABS = [
  ['OFFERS', 'Campaigns'],
  ['CUSTOMERS', 'Customers'],
  ['ANALYTICS', 'Insights'],
  ['SHARE', 'Share & Promote'],
  ['PREVIEW', 'Preview Card'],
  ['STAFF', 'Staff'],
  ['ACTIVITY', 'Activity'],
  ['VALUE', 'Payback'],
  ['SETTINGS', 'Settings'],
  ['HELP', 'Get help'],
] as const;
export type BannerTab = (typeof BANNER_TABS)[number][0];

export type BannerVariant = 'red' | 'blue' | 'green' | 'amber';

/** What the merchant dashboard needs to show one banner. */
export interface DashboardBanner {
  id: string;
  headline: string;
  body: string | null;
  headline_de: string | null;
  body_de: string | null;
  cta_label: string | null;
  cta_label_de: string | null;
  cta_tab: BannerTab | null;
  cta_url: string | null;
  variant: BannerVariant;
}

/** A banner as the admin edits it, with its numbers. */
export interface MerchantBanner extends DashboardBanner {
  audience: 'all' | 'free' | 'pro';
  min_customers: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
  clicked_count: number;
  closed_count: number;
  /** Merchants it would show to right now (plan + customer count). */
  eligible_count: number;
}

export type MerchantBannerInput = Omit<MerchantBanner, 'id' | 'created_at' | 'updated_at' | 'clicked_count' | 'closed_count' | 'eligible_count'>;

// ---- merchant dashboard ----

/** Banners the signed-in merchant should see now (newest first). */
export async function listMyDashboardBanners(): Promise<DashboardBanner[]> {
  const { data, error } = await supabase.rpc('my_dashboard_banners');
  if (error) throw error;
  return (data ?? []) as DashboardBanner[];
}

/** Closes a banner for this merchant for good. clicked = they used its button. */
export async function dismissDashboardBanner(id: string, clicked: boolean): Promise<void> {
  const { error } = await supabase.rpc('dismiss_dashboard_banner', { p_banner: id, p_clicked: clicked });
  if (error) throw error;
}

// ---- admin ----

async function assertWritable(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (isReadOnlyAdminEmail(data.session?.user?.email)) {
    throw new Error('You have view-only admin access — this action is disabled.');
  }
}

export async function adminListMerchantBanners(): Promise<MerchantBanner[]> {
  const { data, error } = await supabase.rpc('admin_list_merchant_banners');
  if (error) throw error;
  return (data ?? []) as MerchantBanner[];
}

export async function adminSaveMerchantBanner(id: string | null, input: MerchantBannerInput): Promise<string> {
  await assertWritable();
  const { data, error } = await supabase.rpc('admin_upsert_merchant_banner', { p_id: id, p_data: input });
  if (error) throw error;
  return data as string;
}

export async function adminDeleteMerchantBanner(id: string): Promise<void> {
  await assertWritable();
  const { error } = await supabase.rpc('admin_delete_merchant_banner', { p_id: id });
  if (error) throw error;
}
