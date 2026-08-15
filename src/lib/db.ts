import { getStaffSession } from '../services/staff';
import { supabase } from './supabase';
import type { Campaign, UserCard, ActivityItem, Location, MerchantBilling, Plan } from '../types';

// ---------------------------------------------------------------------
// Row <-> Domain mappers
// Keep all snake_case <-> camelCase translation in one place so the
// rest of the app doesn't need to think about it.
// ---------------------------------------------------------------------

interface CampaignRow {
  id: string;
  merchant_id: string;
  business_name: string;
  offer_title: string;
  description: string;
  max_stamps: number;
  primary_color: string;
  background_color: string;
  logo_text: string;
  card_pattern: 'solid' | 'dots' | 'grid';
  logo_mode?: 'stampfix' | 'custom' | 'none' | null;
  custom_icon: string;
  logo_image: string | null;
  poster_color: string | null;
  social_links: Record<string, string> | null;
  customer_privacy_notice: string | null;
  card_text_color: string | null;
  logo_color: string | null;
  approval_status: string;
  approval_banner_seen: boolean;
}

interface LocationRow {
  id: string;
  campaign_id: string;
  name: string;
  address: string | null;
  archived: boolean;
}

interface CardRow {
  id: string;
  campaign_id: string;
  customer_id: string | null;
  customer_name: string;
  email: string;
  current_stamps: number;
  rewards_redeemed: number;
  status: 'ACTIVE' | 'BLOCKED';
  joined_at: string;
  joined_at_location_id: string | null;
  offer_title_snapshot: string | null;
  max_stamps_snapshot: number | null;
  custom_icon_snapshot: string | null;
  customer_code: string | null;
  customer_consent_at: string | null;
  marketing_opt_in: boolean | null;
  deletion_requested_at: string | null;
}

interface ActivityRow {
  id: string;
  campaign_id: string;
  card_id: string | null;
  customer_name: string;
  type: ActivityItem['type'];
  created_at: string;
  location_id: string | null;
  source: string | null;
  actor_user_id: string | null;
  // When the query joins to locations, supabase returns it as a nested
  // object. Optional because some queries don't join.
  locations?: { name: string } | null;
}

const toCampaign = (r: CampaignRow): Campaign => ({
  id: r.id,
  merchantId: r.merchant_id,
  businessName: r.business_name,
  offerTitle: r.offer_title,
  description: r.description,
  maxStamps: r.max_stamps,
  maxStampsPerDay: (r as { max_stamps_per_day?: number }).max_stamps_per_day ?? 1,
  primaryColor: r.primary_color,
  backgroundColor: r.background_color,
  logoText: r.logo_text,
  cardPattern: r.card_pattern,
  logoMode: r.logo_mode ?? 'stampfix',
  customIcon: r.custom_icon,
  logoImage: r.logo_image,
  posterColor: r.poster_color,
  socialLinks: r.social_links ?? {},
  customerPrivacyNotice: r.customer_privacy_notice,
  cardTextColor: r.card_text_color ?? null,
  logoColor: r.logo_color ?? null,
  approvalStatus: (r.approval_status as Campaign['approvalStatus']) ?? 'approved',
  approvalBannerSeen: r.approval_banner_seen ?? false,
});

const toLocation = (r: LocationRow): Location => ({
  id: r.id,
  campaignId: r.campaign_id,
  name: r.name,
  address: r.address,
  archived: r.archived,
});

const toCard = (r: CardRow): UserCard => ({
  id: r.id,
  campaignId: r.campaign_id,
  customerId: r.customer_id,
  customerName: r.customer_name,
  email: r.email,
  currentStamps: r.current_stamps,
  rewardsRedeemed: r.rewards_redeemed,
  status: r.status,
  joinedAt: new Date(r.joined_at),
  joinedAtLocationId: r.joined_at_location_id,
  offerTitleSnapshot: r.offer_title_snapshot,
  maxStampsSnapshot: r.max_stamps_snapshot,
  customIconSnapshot: r.custom_icon_snapshot,
  customerCode: r.customer_code,
  customerConsentAt: r.customer_consent_at,
  marketingOptIn: r.marketing_opt_in ?? false,
  deletionRequestedAt: r.deletion_requested_at,
});

const toActivity = (r: ActivityRow): ActivityItem => ({
  id: r.id,
  campaignId: r.campaign_id,
  cardId: r.card_id,
  customerName: r.customer_name,
  type: r.type,
  timestamp: new Date(r.created_at),
  locationId: r.location_id,
  locationName: r.locations?.name ?? null,
  source: (r.source as ActivityItem['source']) ?? null,
  actorUserId: r.actor_user_id,
});

// ---------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------

export async function getCampaignByMerchant(merchantId: string): Promise<Campaign | null> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('merchant_id', merchantId)
    .maybeSingle();
  if (error) throw error;
  return data ? toCampaign(data as CampaignRow) : null;
}

export async function getCampaignById(id: string): Promise<Campaign | null> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? toCampaign(data as CampaignRow) : null;
}

/** Persist the merchant's dismissal of the "approved" banner so it never
 *  reappears on future logins (localStorage was per-device and transient). */
export async function markApprovalBannerSeen(campaignId: string): Promise<void> {
  const { error } = await supabase
    .from('campaigns')
    .update({ approval_banner_seen: true })
    .eq('id', campaignId);
  if (error) console.warn('[markApprovalBannerSeen]', error.message);
}

export async function createCampaign(input: Omit<Campaign, 'id'>): Promise<Campaign> {
  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      merchant_id: input.merchantId,
      business_name: input.businessName,
      offer_title: input.offerTitle,
      description: input.description,
      max_stamps: input.maxStamps,
      primary_color: input.primaryColor,
      background_color: input.backgroundColor,
      logo_text: input.logoText,
      card_pattern: input.cardPattern,
      custom_icon: input.customIcon,
      logo_image: input.logoImage ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return toCampaign(data as CampaignRow);
}

/**
 * Sets a merchant's account approval status. The dashboard reads this off the
 * merchant's campaign to show the review / approved banner. Keyed by the
 * merchant's user id (campaigns.merchant_id).
 */
export async function setMerchantApproval(
  merchantId: string,
  status: 'pending' | 'approved' | 'rejected',
): Promise<void> {
  const { error } = await supabase.rpc('admin_set_merchant_approval', {
    merchant_id_in: merchantId,
    new_status: status,
  });
  if (error) throw error;
}

/** Reads a merchant's current approval status (for the admin panel). */
export async function getMerchantApproval(
  merchantId: string,
): Promise<'pending' | 'approved' | 'rejected' | null> {
  const { data, error } = await supabase.rpc('admin_get_merchant_approval', {
    merchant_id_in: merchantId,
  });
  if (error) throw error;
  return (data as 'pending' | 'approved' | 'rejected') ?? null;
}

export async function updateCampaign(id: string, patch: Partial<Campaign>): Promise<Campaign> {
  // Convert camelCase patch to snake_case for the DB
  const dbPatch: Record<string, unknown> = {};
  if (patch.businessName !== undefined) dbPatch.business_name = patch.businessName;
  if (patch.offerTitle !== undefined) dbPatch.offer_title = patch.offerTitle;
  if (patch.socialLinks !== undefined) dbPatch.social_links = patch.socialLinks;
  if (patch.description !== undefined) dbPatch.description = patch.description;
  if (patch.maxStamps !== undefined) dbPatch.max_stamps = patch.maxStamps;
  if (patch.primaryColor !== undefined) dbPatch.primary_color = patch.primaryColor;
  if (patch.backgroundColor !== undefined) dbPatch.background_color = patch.backgroundColor;
  if (patch.logoText !== undefined) dbPatch.logo_text = patch.logoText;
  if (patch.cardPattern !== undefined) dbPatch.card_pattern = patch.cardPattern;
  if (patch.logoMode !== undefined) dbPatch.logo_mode = patch.logoMode;
  if (patch.customIcon !== undefined) dbPatch.custom_icon = patch.customIcon;
  if (patch.logoImage !== undefined) dbPatch.logo_image = patch.logoImage;
  if (patch.posterColor !== undefined) dbPatch.poster_color = patch.posterColor;
  if (patch.customerPrivacyNotice !== undefined) dbPatch.customer_privacy_notice = patch.customerPrivacyNotice;
  if (patch.cardTextColor !== undefined) dbPatch.card_text_color = patch.cardTextColor;
  if (patch.logoColor !== undefined) dbPatch.logo_color = patch.logoColor;

  const { data, error } = await supabase
    .from('campaigns')
    .update(dbPatch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return toCampaign(data as CampaignRow);
}

// ---------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------

export async function listCardsForCampaign(campaignId: string): Promise<UserCard[]> {
  const { data, error } = await supabase
    .from('cards')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('joined_at', { ascending: false });
  if (error) throw error;
  return (data as CardRow[]).map(toCard);
}

/** Fetch one card by id, fresh from the DB — used so scan-time stamp/redeem
 *  decisions never run on a stale local count. */
export async function getCardById(cardId: string): Promise<UserCard | null> {
  const { data, error } = await supabase.from('cards').select('*').eq('id', cardId).maybeSingle();
  if (error) throw error;
  return data ? toCard(data as CardRow) : null;
}

export async function getCardForCustomer(
  campaignId: string,
  customerId: string,
): Promise<UserCard | null> {
  const { data, error } = await supabase
    .from('cards')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('customer_id', customerId)
    .maybeSingle();
  if (error) throw error;
  return data ? toCard(data as CardRow) : null;
}

/**
 * Lists every card belonging to a customer across all merchants they've
 * joined. Used by the `/my-card` self-service page so customers can find
 * all their loyalty cards from a single login.
 */
export async function listCardsForCustomer(customerId: string): Promise<UserCard[]> {
  const { data, error } = await supabase
    .from('cards')
    .select('*')
    .eq('customer_id', customerId)
    .eq('status', 'ACTIVE')
    .order('joined_at', { ascending: false });
  if (error) throw error;
  return (data as CardRow[]).map(toCard);
}

/**
 * Bulk-fetch the campaigns that a set of cards belong to. RLS-friendly
 * (the "campaigns public read" policy makes this work for any signed-in
 * user, even when they're not the merchant). Used by /my-card to render
 * each card with its merchant's branding.
 */
export async function getCampaignsByIds(ids: string[]): Promise<Campaign[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .in('id', ids);
  if (error) throw error;
  return (data as CampaignRow[]).map(toCampaign);
}

export async function createCard(input: {
  campaignId: string;
  customerId?: string | null;
  customerName: string;
  email: string;
  joinedAtLocationId?: string | null;
  customerConsentAt?: string | null;
  marketingOptIn?: boolean;
}): Promise<UserCard> {
  // Snapshot the campaign's current offer onto the new card. This is
  // what "freezes" the customer's reward at signup — even if the
  // merchant changes the campaign tomorrow, this card keeps showing
  // the offer they originally signed up for. Server-side, the
  // redeem-stamp-token edge function re-snapshots on redemption so
  // subsequent cycles get the current offer.
  const { data: campaign, error: campErr } = await supabase
    .from('campaigns')
    .select('offer_title, max_stamps, custom_icon')
    .eq('id', input.campaignId)
    .maybeSingle();
  if (campErr) throw campErr;
  if (!campaign) throw new Error('This loyalty program is no longer available.');

  const { data, error } = await supabase
    .from('cards')
    .insert({
      campaign_id: input.campaignId,
      customer_id: input.customerId ?? null,
      customer_name: input.customerName,
      email: input.email,
      joined_at_location_id: input.joinedAtLocationId ?? null,
      offer_title_snapshot: campaign.offer_title,
      max_stamps_snapshot: campaign.max_stamps,
      custom_icon_snapshot: campaign.custom_icon,
      // GDPR consent timestamp — captured at signup, never modified after.
      customer_consent_at: input.customerConsentAt ?? null,
      marketing_opt_in: input.marketingOptIn ?? false,
    })
    .select('*')
    .single();
  if (error) {
    // The DB trigger raises `free_tier_limit_reached` when a free-plan
    // merchant has hit 10 customers. Surface a typed error so callers
    // (customer signup flow, merchant "add customer" form) can render
    // the right message without parsing strings.
    if (error.message?.includes('free_tier_limit_reached')) {
      const e = new Error('This loyalty program is currently full. Please ask the merchant to upgrade their account to add more customers.') as Error & { code?: string };
      e.code = 'free_tier_limit_reached';
      throw e;
    }
    throw error;
  }
  const card = toCard(data as CardRow);
  // JOIN activity is logged server-side by the trg_log_card_join trigger on
  // cards insert (SECURITY DEFINER), so it works even for customer self-signups
  // where the client session can't write to activities under RLS.
  return card;
}

/** Tell the customer's wallet passes their card changed. push-apple-update
 *  pushes to Apple Wallet (and bumps passkit_last_updated so pull-to-refresh
 *  works); sync-wallet-object refreshes the Google Wallet object. Fire-and-
 *  forget — a wallet hiccup must never break stamping. */
// Apple + Google Wallet passes are refreshed by the server-side DB trigger
// `trg_wallet_on_card_change`, which fires on every cards UPDATE — including
// admin-initiated changes. We deliberately do NOT invoke the wallet functions
// from the client too; doing so tripled the edge-function calls per stamp.

export async function addStamp(
  cardId: string,
  maxStamps: number,
  opts?: { reason?: string | null; isOverride?: boolean },
): Promise<UserCard> {
  // Atomic increment via RPC. The guards (not blocked, under the frozen goal,
  // caller owns the campaign) run inside a single UPDATE, so a double-click or
  // two staff stamping at once can never double-count or lose an update.
  // Returns the updated row, or nothing when the card was full / blocked.
  const { data, error } = await supabase.rpc('add_stamp_atomic', { p_card_id: cardId, p_max: maxStamps });
  if (error) throw error;
  const rows = (data ?? []) as CardRow[];
  if (rows.length > 0) {
    const updated = toCard(rows[0]);
    await logActivity(updated.campaignId, updated.id, updated.customerName, 'STAMP', 'manual_dashboard', {
      reason: opts?.reason ?? null,
      isOverride: opts?.isOverride ?? false,
    });
    return updated;
  }
  // No row updated: card was full, blocked, or not owned by the caller.
  const { data: cur, error: curErr } = await supabase.from('cards').select('*').eq('id', cardId).maybeSingle();
  if (curErr) throw curErr;
  if (!cur) throw new Error('Card not found.');
  const row = cur as CardRow;
  if (row.status === 'BLOCKED') throw new Error('Card is blocked');
  return toCard(row); // already full — unchanged
}

export async function redeemReward(cardId: string): Promise<UserCard> {
  const { data: existing, error: fetchErr } = await supabase
    .from('cards')
    .select('*')
    .eq('id', cardId)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!existing) throw new Error('Card not found.');
  const row = existing as CardRow;
  if (row.status === 'BLOCKED') throw new Error('Card is blocked');

  const { data, error } = await supabase
    .from('cards')
    .update({
      current_stamps: 0,
      rewards_redeemed: row.rewards_redeemed + 1,
    })
    .eq('id', cardId)
    .select('*')
    .single();
  if (error) throw error;
  const updated = toCard(data as CardRow);
  await logActivity(updated.campaignId, updated.id, updated.customerName, 'REDEEM');
  return updated;
}

export async function setCardStatus(
  cardId: string,
  status: 'ACTIVE' | 'BLOCKED',
): Promise<UserCard> {
  const { data, error } = await supabase
    .from('cards')
    .update({ status })
    .eq('id', cardId)
    .select('*')
    .single();
  if (error) throw error;
  const card = toCard(data as CardRow);
  await logActivity(
    card.campaignId,
    card.id,
    card.customerName,
    status === 'BLOCKED' ? 'BLOCK' : 'UNBLOCK',
  );
  return card;
}

export async function deleteCard(cardId: string): Promise<void> {
  const { error } = await supabase.from('cards').delete().eq('id', cardId);
  if (error) throw error;
}

/** Customer-initiated deletion request. Soft-deletes via timestamp;
 *  the actual scrub happens in the 24h grace period after. The card
 *  is marked BLOCKED immediately so no further stamps accrue. */
export async function requestCardDeletion(cardId: string): Promise<void> {
  const { error } = await supabase.rpc('request_card_deletion', { card_id_in: cardId });
  if (error) throw error;
}

/** Cancel a pending deletion if the customer changes their mind
 *  within the 24h grace window. */
export async function cancelCardDeletion(cardId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_card_deletion', { card_id_in: cardId });
  if (error) throw error;
}

// ---------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------

export async function listActivities(campaignId: string, limit = 50): Promise<ActivityItem[]> {
  const { data, error } = await supabase
    .from('activities')
    .select('*, locations(name)')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as ActivityRow[]).map(toActivity);
}

// ---------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------

export async function listLocations(campaignId: string, includeArchived = false): Promise<Location[]> {
  let query = supabase.from('locations').select('*').eq('campaign_id', campaignId).order('created_at');
  if (!includeArchived) query = query.eq('archived', false);
  const { data, error } = await query;
  if (error) throw error;
  return (data as LocationRow[]).map(toLocation);
}

export async function getLocation(locationId: string): Promise<Location | null> {
  const { data, error } = await supabase
    .from('locations')
    .select('*')
    .eq('id', locationId)
    .maybeSingle();
  if (error) throw error;
  return data ? toLocation(data as LocationRow) : null;
}

export async function createLocation(input: {
  campaignId: string;
  name: string;
  address?: string | null;
}): Promise<Location> {
  const { data, error } = await supabase
    .from('locations')
    .insert({
      campaign_id: input.campaignId,
      name: input.name,
      address: input.address ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return toLocation(data as LocationRow);
}

export async function updateLocation(
  locationId: string,
  patch: Partial<Pick<Location, 'name' | 'address' | 'archived'>>,
): Promise<Location> {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.address !== undefined) update.address = patch.address;
  if (patch.archived !== undefined) update.archived = patch.archived;
  const { data, error } = await supabase
    .from('locations')
    .update(update)
    .eq('id', locationId)
    .select('*')
    .single();
  if (error) throw error;
  return toLocation(data as LocationRow);
}

async function logActivity(
  campaignId: string,
  cardId: string | null,
  customerName: string,
  type: ActivityItem['type'],
  source: 'qr' | 'manual_dashboard' | 'admin' | 'webhook' = 'manual_dashboard',
  extra?: { reason?: string | null; isOverride?: boolean },
): Promise<void> {
  // Get the actor's auth.users.id from the current session (if any).
  // Server-side functions pass their own actor via the source='webhook'
  // path; in the browser, this is the logged-in merchant or customer.
  const { data: { user } } = await supabase.auth.getUser();
  // If a staff member is signed in on this device, record who did it.
  const staff = getStaffSession(campaignId);
  const { error } = await supabase.from('activities').insert({
    campaign_id: campaignId,
    card_id: cardId,
    customer_name: customerName,
    type,
    source,
    actor_user_id: user?.id ?? null,
    staff_id: staff?.id ?? null,
    staff_name: staff?.name ?? null,
    reason: extra?.reason ?? null,
    is_override: extra?.isOverride ?? false,
  });
  if (error) {
    // Activity logging is best-effort. Don't fail the parent action over it.
    // eslint-disable-next-line no-console
    console.warn('Failed to log activity:', error);
  }
}

// ---------------------------------------------------------------------
// Merchant onboarding state
// ---------------------------------------------------------------------

/** Tracked onboarding steps. Keep this union narrow so typos are caught. */
export type OnboardingKey =
  | 'poster_downloaded'
  | 'test_signup_done'
  | 'first_stamp_given'
  | 'wizard_dismissed'
  | 'checklist_dismissed';

export interface OnboardingState {
  poster_downloaded?: boolean;
  test_signup_done?: boolean;
  first_stamp_given?: boolean;
  wizard_dismissed?: boolean;
  checklist_dismissed?: boolean;
}

export async function getOnboardingState(merchantId: string): Promise<OnboardingState> {
  const { data, error } = await supabase
    .from('merchants')
    .select('onboarding_state')
    .eq('id', merchantId)
    .maybeSingle();
  if (error) {
    console.warn('getOnboardingState failed:', error);
    return {};
  }
  return (data?.onboarding_state as OnboardingState | null) ?? {};
}

/**
 * Merge new keys into the merchant's onboarding state. We always merge
 * (never replace) so concurrent updates from different devices don't
 * stomp each other.
 */
export async function setOnboardingFlag(
  merchantId: string,
  patch: Partial<Record<OnboardingKey, boolean>>,
): Promise<OnboardingState> {
  // Read-modify-write. Race window is small and the worst case is one
  // flag flipping back briefly — not worth a stored procedure for v1.
  const current = await getOnboardingState(merchantId);
  const merged = { ...current, ...patch };
  const { data, error } = await supabase
    .from('merchants')
    .update({ onboarding_state: merged })
    .eq('id', merchantId)
    .select('onboarding_state')
    .single();
  if (error) throw error;
  return (data.onboarding_state as OnboardingState) ?? {};
}

// ---------------------------------------------------------------------
// Merchant billing / plan
// ---------------------------------------------------------------------

interface MerchantBillingRow {
  plan: Plan;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan_started_at: string | null;
  country: 'DE' | 'CA' | null;
}

export interface MerchantBillingWithCountry extends MerchantBilling {
  country: 'DE' | 'CA' | null;
}

export async function getMerchantBilling(merchantId: string): Promise<MerchantBillingWithCountry> {
  const { data, error } = await supabase
    .from('merchants')
    .select('plan, stripe_customer_id, stripe_subscription_id, plan_started_at, country')
    .eq('id', merchantId)
    .maybeSingle();
  if (error) {
    console.warn('getMerchantBilling failed:', error);
    return { plan: 'free', country: null };
  }
  const row = (data as MerchantBillingRow | null) ?? { plan: 'free' as Plan,
    stripe_customer_id: null, stripe_subscription_id: null, plan_started_at: null, country: null };
  return {
    plan: row.plan ?? 'free',
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    planStartedAt: row.plan_started_at ? new Date(row.plan_started_at) : null,
    country: row.country,
  };
}

/**
 * Self-service merchant account deletion (GDPR Article 17).
 *
 * Returns { success: true } on success, or { success: false, error, message }
 * if blocked (e.g. subscription is still active). The merchant's row is
 * soft-deleted to status='deleted'; full cascade cleanup happens
 * asynchronously.
 */
export async function deleteMyAccount(): Promise<{ success: boolean; error?: string; message?: string }> {
  const { data, error } = await supabase.rpc('delete_my_account');
  if (error) throw error;
  return data as { success: boolean; error?: string; message?: string };
}

/**
 * Recover a customer's card(s) with their phone + the 6-digit code they set at
 * signup. The RPC verifies both server-side (code is bcrypt-hashed) and returns
 * the full card + campaign rows, which we map through the same helpers used
 * everywhere else so the shapes stay identical.
 */
export async function recoverCards(
  phone: string,
  code: string,
): Promise<{ card: UserCard; campaign: Campaign }[]> {
  // Guarded wrapper: rate-limits attempts per phone number so a 6-digit code
  // can't be brute-forced. The inner function is not callable from the client.
  const { data, error } = await supabase.rpc('recover_cards_guarded', { p_phone: phone, p_code: code });
  if (error) throw error;
  const rows = (data as Array<{ card: CardRow; campaign: CampaignRow }>) ?? [];
  return rows.map((r) => ({ card: toCard(r.card), campaign: toCampaign(r.campaign) }));
}

/** Recover a customer's card(s) by EMAIL + the 6-digit passcode they set at signup. */
export async function recoverCardsByEmail(
  email: string,
  code: string,
): Promise<{ card: UserCard; campaign: Campaign }[]> {
  const { data, error } = await supabase.rpc('recover_cards_by_email', { p_email: email, p_code: code });
  if (error) throw error;
  const rows = (data as Array<{ card: CardRow; campaign: CampaignRow }>) ?? [];
  return rows.map((r) => ({ card: toCard(r.card), campaign: toCampaign(r.campaign) }));
}

export interface MerchantActivityRow {
  id: string;
  action: string;
  detail: Record<string, unknown> | null;
  created_at: string;
}

/** Admin: read a merchant's dashboard activity log (RLS restricts to admins + the merchant). */
export async function getMerchantActivity(merchantId: string): Promise<MerchantActivityRow[]> {
  const { data, error } = await supabase
    .from('merchant_activity')
    .select('id, action, detail, created_at')
    .eq('merchant_id', merchantId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data as MerchantActivityRow[]) ?? [];
}

/** Log a merchant action to the activity feed (fire-and-forget; non-blocking). */
export async function logMerchantActivity(action: string, detail?: Record<string, unknown>): Promise<void> {
  try {
    await supabase.rpc('log_merchant_activity', { p_action: action, p_detail: detail ?? null });
  } catch { /* non-critical */ }
}

export interface ExtendedKPIs {
  new_merchants: number; active_merchants: number; inactive_merchants: number; total_merchants: number;
  new_customers: number; active_customers: number; inactive_customers: number; total_customers: number;
  active_campaigns: number; apple_passes: number; rewards_redeemed: number; redemption_rate: number;
}

/** Admin: extended KPIs for a date range, optionally scoped to one merchant. */
export async function fetchExtendedKPIs(from: Date, to: Date, merchantId?: string | null): Promise<ExtendedKPIs> {
  const { data, error } = await supabase.rpc('admin_extended_kpis', {
    p_start: from.toISOString(), p_end: to.toISOString(), p_merchant_id: merchantId || null,
  });
  if (error) throw error;
  return data as ExtendedKPIs;
}

/** Public one-click marketing unsubscribe by token (from an email link). */
export async function unsubscribeByToken(token: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('unsubscribe_by_token', { p_token: token });
  if (error) throw error;
  return data === true;
}

// ---------------- Blog posts ----------------
export interface BlogPostRow {
  id: string; slug: string; title: string; excerpt: string; tag: string;
  read_mins: number; content: string; published: boolean; created_at: string; updated_at: string;
}
export async function listPublishedBlogPosts(): Promise<BlogPostRow[]> {
  const { data, error } = await supabase.from('blog_posts').select('*').eq('published', true).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BlogPostRow[];
}
export async function listAllBlogPosts(): Promise<BlogPostRow[]> {
  const { data, error } = await supabase.from('blog_posts').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BlogPostRow[];
}
export async function upsertBlogPost(post: { id?: string; slug: string; title: string; excerpt: string; tag: string; read_mins: number; content: string; published: boolean }): Promise<BlogPostRow> {
  const row = { slug: post.slug, title: post.title, excerpt: post.excerpt, tag: post.tag, read_mins: post.read_mins, content: post.content, published: post.published, updated_at: new Date().toISOString() };
  if (post.id) {
    const { data, error } = await supabase.from('blog_posts').update(row).eq('id', post.id).select('*').single();
    if (error) throw error;
    return data as BlogPostRow;
  }
  const { data, error } = await supabase.from('blog_posts').insert(row).select('*').single();
  if (error) throw error;
  return data as BlogPostRow;
}
export async function deleteBlogPost(id: string): Promise<void> {
  const { error } = await supabase.from('blog_posts').delete().eq('id', id);
  if (error) throw error;
}
export interface BlogDraft { title: string; slug: string; excerpt: string; tag: string; readMins: number; content: string }
export async function generateBlogWithAI(topic: string): Promise<{ limitReached: boolean; post?: BlogDraft }> {
  const { data, error } = await supabase.functions.invoke('generate-blog', { body: { topic } });
  if (error) throw error;
  const d = data as { limitReached?: boolean; error?: string } & Partial<BlogDraft>;
  if (d?.limitReached) return { limitReached: true };
  if (d?.error) throw new Error(d.error);
  return { limitReached: false, post: d as BlogDraft };
}

// ---------------- Broadcast notifications ----------------
export interface NotificationRow { id: string; title: string; body: string; published: boolean; created_at: string }
export async function listMerchantNotifications(): Promise<{ items: NotificationRow[]; readIds: Set<string> }> {
  const [n, r] = await Promise.all([
    supabase.from('notifications').select('*').eq('published', true).order('created_at', { ascending: false }),
    supabase.from('notification_reads').select('notification_id'),
  ]);
  if (n.error) throw n.error;
  if (r.error) throw r.error;
  const readIds = new Set(((r.data ?? []) as { notification_id: string }[]).map((x) => x.notification_id));
  return { items: (n.data ?? []) as NotificationRow[], readIds };
}
export async function markNotificationsRead(ids: string[], merchantId: string): Promise<void> {
  if (!ids.length) return;
  const rows = ids.map((id) => ({ merchant_id: merchantId, notification_id: id }));
  const { error } = await supabase.from('notification_reads').upsert(rows, { onConflict: 'merchant_id,notification_id' });
  if (error) throw error;
}
export async function adminListNotifications(): Promise<NotificationRow[]> {
  const { data, error } = await supabase.from('notifications').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as NotificationRow[];
}
export async function adminCreateNotification(title: string, body: string): Promise<void> {
  const { error } = await supabase.from('notifications').insert({ title, body, published: true });
  if (error) throw error;
}
export async function adminDeleteNotification(id: string): Promise<void> {
  const { error } = await supabase.from('notifications').delete().eq('id', id);
  if (error) throw error;
}
