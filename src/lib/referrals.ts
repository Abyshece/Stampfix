import { supabase } from './supabase';

// Referrals ("give a month, get a month"). A shop shares
// stampfix.app/r/CODE; whoever signs up through it is recorded as invited
// by that shop, and when they make their first Pro payment both shops get
// one month of Pro free (see the referrals migration and referral-credit).

const KEY = 'stampfix_ref';
const KEEP_DAYS = 30;
const CODE_RE = /^[A-Z2-9]{6}$/;

export const cleanCode = (raw: string | null | undefined): string | null => {
  const c = (raw ?? '').trim().toUpperCase();
  return CODE_RE.test(c) ? c : null;
};

/**
 * Reads a referral code from /r/CODE or ?ref=CODE, remembers it for 30 days
 * on this device and tidies the address bar (/r/CODE goes to the sign-up
 * form). Call once, before the app reads the URL.
 */
export function captureReferralFromUrl(): void {
  try {
    const path = window.location.pathname.match(/^\/r\/([A-Za-z0-9]{6})\/?$/);
    const params = new URLSearchParams(window.location.search);
    const code = cleanCode(path?.[1] ?? params.get('ref'));
    if (code) localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }));
    if (path) {
      window.history.replaceState({}, '', '/?signup=1');
    } else if (params.has('ref')) {
      params.delete('ref');
      const q = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (q ? `?${q}` : '') + window.location.hash);
    }
  } catch { /* private mode or no storage: the link simply doesn't count */ }
}

/** The remembered code, if it's from the last 30 days. */
export function storedReferralCode(): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { code?: string; at?: number } | null;
    if (!v || typeof v.at !== 'number' || Date.now() - v.at > KEEP_DAYS * 86_400_000) return null;
    return cleanCode(v.code);
  } catch { return null; }
}

export function forgetReferralCode(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export const referralLink = (code: string) => `https://stampfix.app/r/${code}`;

/** The inviting shop's name, or null. */
export async function lookupReferral(code: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('referral_lookup', { p_code: code });
  if (error) return null;
  return typeof data === 'string' && data.trim() ? data : null;
}

// ---- The shop's own referral --------------------------------------------------------

export interface MyReferral {
  code: string;
  /** Only Pro shops (paying or comped) can invite. */
  can_invite: boolean;
  invited_by: { name: string; status: 'signed_up' | 'flagged' | 'rewarded' } | null;
  friends: Array<{ name: string; status: 'joined' | 'rewarded' | 'rejected'; joined_at: string }>;
  months_credited: number;
  months_waiting: number;
}

export async function getMyReferral(): Promise<MyReferral> {
  const { data, error } = await supabase.rpc('my_referral');
  if (error) throw new Error(error.message);
  return data as MyReferral;
}

// ---- Admin --------------------------------------------------------------------------

export type ReferralStatus = 'signed_up' | 'flagged' | 'rewarded' | 'rejected';
export interface ReferralReward {
  role: 'referrer' | 'referred';
  status: 'pending' | 'credited' | 'capped' | 'cancelled';
  amount_cents: number | null;
  currency: string | null;
  credited_at: string | null;
  error: string | null;
  has_customer: boolean | null;
}
export interface ReferralRow {
  id: string; status: ReferralStatus; reason: string | null; source: 'link' | 'admin'; code: string;
  created_at: string; paid_at: string | null; paid_invoice: string | null;
  referrer_id: string | null; referrer_name: string | null; referrer_email: string | null; referrer_code: string | null; referrer_plan: string | null;
  referred_id: string; referred_name: string | null; referred_email: string | null; referred_code: string | null; referred_plan: string | null;
  rewards: ReferralReward[];
}

export async function adminListReferrals(): Promise<ReferralRow[]> {
  const { data, error } = await supabase.rpc('admin_referrals_list', { p_limit: 500 });
  if (error) throw new Error(error.message);
  return (data ?? []) as ReferralRow[];
}
export async function adminApproveReferral(id: string): Promise<void> {
  const { error } = await supabase.rpc('admin_referral_approve', { p_id: id });
  if (error) throw new Error(error.message);
}
export async function adminRejectReferral(id: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('admin_referral_reject', { p_id: id, p_reason: reason || null });
  if (error) throw new Error(error.message);
}
export async function adminLinkReferral(code: string, referredEmail: string): Promise<void> {
  const { error } = await supabase.rpc('admin_referral_link', { p_code: code, p_referred_email: referredEmail });
  if (error) throw new Error(error.message);
}
/** Puts waiting months on Stripe now (also retries ones that failed). */
export async function adminCreditReferrals(): Promise<{ credited: number; failed: Array<{ id: string; error: string }> }> {
  const { data, error } = await supabase.functions.invoke('referral-credit', { body: { force: true } });
  if (error) {
    let msg = error.message;
    const ctx = (error as { context?: unknown }).context;
    if (ctx instanceof Response) {
      try { msg = ((await ctx.json()) as { error?: string }).error ?? `HTTP ${ctx.status}`; } catch { msg = `HTTP ${ctx.status}`; }
    }
    throw new Error(msg);
  }
  return data as { credited: number; failed: Array<{ id: string; error: string }> };
}

/** Why an invite was flagged, in words. */
export const FLAG_REASON: Record<string, string> = {
  same_email_domain: 'Same company email domain',
  same_phone: 'Same phone number',
  same_card: 'Paid with the same card',
  same_address: 'Same business address',
  same_stripe_customer: 'Same Stripe customer',
  inviter_blocked: 'Inviting shop is blocked',
  refunded: 'First payment refunded',
};
