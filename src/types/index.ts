// Domain types - these map closely to the Supabase tables but use
// camelCase for JS ergonomics. The data layer (lib/db.ts) handles
// the snake_case <-> camelCase mapping.

/** Available subscription plans. Server-side enforced via a trigger on
 *  the cards table — see migration 20260528050000_merchant_plan.sql. */
export type Plan = 'free' | 'pro';

/** Hard-coded limit for the free tier. Centralised here so UI and any
 *  client-side guards agree. The database trigger holds the authoritative
 *  copy; if you change one, change the other. */
export const FREE_TIER_CARD_LIMIT = 10;

/** Threshold (80% of FREE_TIER_CARD_LIMIT) at which we start showing the
 *  upgrade banner. Configured separately from the limit itself. */
export const FREE_TIER_WARNING_THRESHOLD = 8;

export interface MerchantBilling {
  plan: Plan;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  planStartedAt?: Date | null;
}

export interface Campaign {
  id: string;
  merchantId: string;
  businessName: string;
  offerTitle: string;
  description: string;
  maxStamps: number;
  primaryColor: string;
  backgroundColor: string;
  logoText: string;
  cardPattern: 'solid' | 'dots' | 'grid';
  customIcon: string;
  logoImage?: string | null;
}

export interface Location {
  id: string;
  campaignId: string;
  name: string;
  address?: string | null;
  archived: boolean;
}

export interface UserCard {
  id: string;
  campaignId: string;
  customerId?: string | null;
  customerName: string;
  email: string;
  age?: number | null;
  currentStamps: number;
  rewardsRedeemed: number;
  status: 'ACTIVE' | 'BLOCKED';
  joinedAt: Date;
  joinedAtLocationId?: string | null;
}

export interface ActivityItem {
  id: string;
  campaignId: string;
  cardId?: string | null;
  customerName: string;
  type: 'STAMP' | 'REDEEM' | 'JOIN' | 'BLOCK' | 'UNBLOCK';
  timestamp: Date;
  locationId?: string | null;
  locationName?: string | null;
}

// Re-exported from db so components can import alongside other types.
export type { OnboardingState } from '../lib/db';

export enum ViewMode {
  LANDING = 'LANDING',
  MERCHANT = 'MERCHANT',
  CUSTOMER = 'CUSTOMER',
}
