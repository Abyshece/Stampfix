import { supabase } from './supabase';
import type { ActivityItem } from '../types';

// "Your results": what the loyalty program brought the shop in a period,
// worked out from the activity history the dashboard already loads.
//
// A visit is a day on which a customer got a stamp or redeemed a reward
// (several stamps on one day are one visit). A repeat visit is any visit
// after the customer's first one; a returning customer has at least one
// repeat visit in the period.

export interface ProgramResults {
  /** Customers with at least one repeat visit in the period. */
  returningCustomers: number;
  /** Visits in the period that were not the customer's first visit. */
  repeatVisits: number;
  /** All visits in the period. */
  visits: number;
  rewardsRedeemed: number;
  newMembers: number;
}

/** Local calendar day, so a visit late in the evening isn't split across two days. */
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

export function computeResults(
  activities: ActivityItem[],
  from: Date,
  to: Date,
  locationId: string | null = null,
): ProgramResults {
  // Each card's first visit day, over the whole history (all locations: a
  // customer's first visit anywhere makes later visits repeat visits).
  const firstVisit = new Map<string, number>();
  for (const a of activities) {
    if (!a.cardId || (a.type !== 'STAMP' && a.type !== 'REDEEM')) continue;
    const t = new Date(a.timestamp);
    const day = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
    const prev = firstVisit.get(a.cardId);
    if (prev === undefined || day < prev) firstVisit.set(a.cardId, day);
  }

  const visitDays = new Set<string>();
  const repeatDays = new Set<string>();
  const returning = new Set<string>();
  let rewardsRedeemed = 0;
  let newMembers = 0;
  for (const a of activities) {
    const t = new Date(a.timestamp);
    if (t < from || t > to) continue;
    if (locationId && a.locationId !== locationId) continue;
    if (a.type === 'JOIN') newMembers++;
    if (a.type === 'REDEEM') rewardsRedeemed++;
    if (!a.cardId || (a.type !== 'STAMP' && a.type !== 'REDEEM')) continue;
    const key = `${a.cardId}|${dayKey(t)}`;
    visitDays.add(key);
    const day = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
    const first = firstVisit.get(a.cardId);
    if (first !== undefined && day > first) {
      repeatDays.add(key);
      returning.add(a.cardId);
    }
  }

  return {
    returningCustomers: returning.size,
    repeatVisits: repeatDays.size,
    visits: visitDays.size,
    rewardsRedeemed,
    newMembers,
  };
}

/** The shop's average spend per visit, or null when it hasn't been set. */
export async function getAverageSpend(campaignId: string): Promise<number | null> {
  const { data, error } = await supabase.rpc('campaign_average_spend', { p_campaign: campaignId });
  if (error) throw error;
  return data === null || data === undefined ? null : Number(data);
}

/** Saves the average spend per visit; null clears it. Returns the stored value. */
export async function setAverageSpend(campaignId: string, amount: number | null): Promise<number | null> {
  const { data, error } = await supabase.rpc('set_campaign_average_spend', { p_campaign: campaignId, p_amount: amount });
  if (error) throw error;
  return data === null || data === undefined ? null : Number(data);
}
