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
  custom_icon: string;
  logo_image: string | null;
  poster_color: string | null;
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
  age: number | null;
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
  primaryColor: r.primary_color,
  backgroundColor: r.background_color,
  logoText: r.logo_text,
  cardPattern: r.card_pattern,
  customIcon: r.custom_icon,
  logoImage: r.logo_image,
  posterColor: r.poster_color,
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
  age: r.age,
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
  if (patch.description !== undefined) dbPatch.description = patch.description;
  if (patch.maxStamps !== undefined) dbPatch.max_stamps = patch.maxStamps;
  if (patch.primaryColor !== undefined) dbPatch.primary_color = patch.primaryColor;
  if (patch.backgroundColor !== undefined) dbPatch.background_color = patch.backgroundColor;
  if (patch.logoText !== undefined) dbPatch.logo_text = patch.logoText;
  if (patch.cardPattern !== undefined) dbPatch.card_pattern = patch.cardPattern;
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
  age?: number | null;
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
      age: input.age ?? null,
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

export async function addStamp(cardId: string, maxStamps: number): Promise<UserCard> {
  // Fetch current state to compute next value (Postgres doesn't have an
  // atomic "increment if less than" — for v1 we accept the read-modify-write).
  const { data: existing, error: fetchErr } = await supabase
    .from('cards')
    .select('*')
    .eq('id', cardId)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!existing) throw new Error('Card not found.');
  const row = existing as CardRow;
  if (row.status === 'BLOCKED') throw new Error('Card is blocked');
  // The card's frozen snapshot is the source of truth for its goal — never
  // trust a maxStamps passed from the UI (it can be stale, or fall back to a
  // since-changed campaign value). Use the argument only for legacy rows that
  // predate the snapshot column.
  const effectiveMax = row.max_stamps_snapshot ?? maxStamps;
  if (row.current_stamps >= effectiveMax) return toCard(row); // already full

  const { data, error } = await supabase
    .from('cards')
    .update({ current_stamps: row.current_stamps + 1 })
    .eq('id', cardId)
    .select('*')
    .single();
  if (error) throw error;
  const updated = toCard(data as CardRow);
  await logActivity(updated.campaignId, updated.id, updated.customerName, 'STAMP');
  return updated;
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
): Promise<void> {
  // Get the actor's auth.users.id from the current session (if any).
  // Server-side functions pass their own actor via the source='webhook'
  // path; in the browser, this is the logged-in merchant or customer.
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('activities').insert({
    campaign_id: campaignId,
    card_id: cardId,
    customer_name: customerName,
    type,
    source,
    actor_user_id: user?.id ?? null,
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
  const { data, error } = await supabase.rpc('recover_cards', { p_phone: phone, p_code: code });
  if (error) throw error;
  const rows = (data as Array<{ card: CardRow; campaign: CampaignRow }>) ?? [];
  return rows.map((r) => ({ card: toCard(r.card), campaign: toCampaign(r.campaign) }));
}
