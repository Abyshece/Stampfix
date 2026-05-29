// Domain types - these map closely to the Supabase tables but use
// camelCase for JS ergonomics. The data layer (lib/db.ts) handles
// the snake_case <-> camelCase mapping.

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

export enum ViewMode {
  LANDING = 'LANDING',
  MERCHANT = 'MERCHANT',
  CUSTOMER = 'CUSTOMER',
}
