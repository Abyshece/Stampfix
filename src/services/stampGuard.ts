import { supabase } from '../lib/supabase';

/** Reasons a staff member can pick when stamping outside the normal scan flow. */
export const STAMP_REASONS = [
  'Customer forgot their phone',
  'QR code would not scan',
  'Multiple purchases in one visit',
  'Making up a missed stamp',
  'Other (explained below)',
] as const;

export interface DailyCheck {
  stampsToday: number;
  cap: number;              // 0 = unlimited
  atCap: boolean;
}

/** How many stamps this card already got today, and whether that hits the cap. */
export async function checkDailyCap(cardId: string, cap: number): Promise<DailyCheck> {
  if (!cap || cap <= 0) return { stampsToday: 0, cap: 0, atCap: false };
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const { count, error } = await supabase
    .from('activities')
    .select('id', { count: 'exact', head: true })
    .eq('card_id', cardId)
    .eq('type', 'STAMP')
    .gte('created_at', start.toISOString());
  if (error) return { stampsToday: 0, cap, atCap: false }; // never block on a failed check
  const n = count ?? 0;
  return { stampsToday: n, cap, atCap: n >= cap };
}

/** Read/update the per-customer daily stamp limit for a shop. 0 = unlimited. */
export async function getDailyCap(campaignId: string): Promise<number> {
  const { data, error } = await supabase
    .from('campaigns').select('max_stamps_per_day').eq('id', campaignId).maybeSingle();
  if (error || !data) return 1;
  return (data as { max_stamps_per_day: number | null }).max_stamps_per_day ?? 1;
}

export async function setDailyCap(campaignId: string, cap: number): Promise<void> {
  const { error } = await supabase
    .from('campaigns').update({ max_stamps_per_day: cap }).eq('id', campaignId);
  if (error) throw error;
}
