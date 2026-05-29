import { supabase } from './supabase';
import type { Campaign, UserCard, ActivityItem, Location } from '../types';

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
}

interface ActivityRow {
  id: string;
  campaign_id: string;
  card_id: string | null;
  customer_name: string;
  type: ActivityItem['type'];
  created_at: string;
  location_id: string | null;
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

export async function createCard(input: {
  campaignId: string;
  customerId?: string | null;
  customerName: string;
  email: string;
  age?: number | null;
  joinedAtLocationId?: string | null;
}): Promise<UserCard> {
  const { data, error } = await supabase
    .from('cards')
    .insert({
      campaign_id: input.campaignId,
      customer_id: input.customerId ?? null,
      customer_name: input.customerName,
      email: input.email,
      age: input.age ?? null,
      joined_at_location_id: input.joinedAtLocationId ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  const card = toCard(data as CardRow);
  await logActivity(card.campaignId, card.id, card.customerName, 'JOIN');
  return card;
}

export async function addStamp(cardId: string, maxStamps: number): Promise<UserCard> {
  // Fetch current state to compute next value (Postgres doesn't have an
  // atomic "increment if less than" — for v1 we accept the read-modify-write).
  const { data: existing, error: fetchErr } = await supabase
    .from('cards')
    .select('*')
    .eq('id', cardId)
    .single();
  if (fetchErr) throw fetchErr;
  const row = existing as CardRow;
  if (row.status === 'BLOCKED') throw new Error('Card is blocked');
  if (row.current_stamps >= maxStamps) return toCard(row); // already full

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
    .single();
  if (fetchErr) throw fetchErr;
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
): Promise<void> {
  const { error } = await supabase.from('activities').insert({
    campaign_id: campaignId,
    card_id: cardId,
    customer_name: customerName,
    type,
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
  | 'wizard_dismissed';

export interface OnboardingState {
  poster_downloaded?: boolean;
  test_signup_done?: boolean;
  first_stamp_given?: boolean;
  wizard_dismissed?: boolean;
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
