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
  /** Max stamps one customer can receive per day. 0 = unlimited. */
  maxStampsPerDay?: number;
  primaryColor: string;
  backgroundColor: string;
  logoText: string;
  cardPattern: 'solid' | 'dots' | 'grid';
  /** Branding shown at the top of the wallet card. */
  logoMode?: 'stampfix' | 'custom' | 'none';
  customIcon: string;
  logoImage?: string | null;
  /** Custom poster background. Solid hex or CSS gradient. Falls back
   *  to primaryColor when null. See migration 20260528070000. */
  posterColor?: string | null;
  /** Text/foreground color for the wallet card. Apple Wallet honours this
   *  exactly; Google Wallet auto-derives text color for contrast and
   *  ignores it. Falls back to #1d3458 when null. */
  cardTextColor?: string | null;
  /** Brand-mark (logo) colour override. Null = auto (dark on light card, white on dark). */
  logoColor?: string | null;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  /** Whether the merchant has dismissed the one-time approval banner. */
  approvalBannerSeen?: boolean;
  /** Merchant's own customer-facing privacy notice. Shown to customers
   *  at signup. If null, a generic Stampfix-pointing fallback is used. */
  customerPrivacyNotice?: string | null;
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
  /** Reward text frozen at signup. Stays the same until the customer
   *  redeems, at which point the server re-snapshots from the campaign's
   *  current values. The wallet pass should render from this, NOT from
   *  the campaign — that's the whole point of the snapshot model. */
  offerTitleSnapshot?: string | null;
  maxStampsSnapshot?: number | null;
  customIconSnapshot?: string | null;
  /** SF00001-style short ID. Assigned automatically by DB trigger. */
  customerCode?: string | null;
  /** Timestamp the customer ticked the consent checkbox at signup. */
  customerConsentAt?: string | null;
  /** Did the customer opt in to marketing emails at signup? */
  marketingOptIn?: boolean;
  /** When the customer requested deletion. 24h grace before scrub. */
  deletionRequestedAt?: string | null;
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
  /** How this activity was triggered. 'qr' = real customer scan,
   *  'manual_dashboard' = merchant clicked +stamp, 'admin' = platform
   *  ops, 'webhook' = third-party. Null on pre-audit-trail rows. */
  source?: 'qr' | 'manual_dashboard' | 'admin' | 'webhook' | null;
  /** auth.users.id of whoever performed the action. */
  actorUserId?: string | null;
}

// Re-exported from db so components can import alongside other types.
export type { OnboardingState } from '../lib/db';

export enum ViewMode {
  LANDING = 'LANDING',
  MERCHANT = 'MERCHANT',
  CUSTOMER = 'CUSTOMER',
}
