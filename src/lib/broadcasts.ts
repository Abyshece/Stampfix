import { supabase } from './supabase';

// A one-off offer push sent to customers with the card installed + marketing consent.
export interface Broadcast {
  id: string;
  message: string;
  sentCount: number;
  createdAt: string;
}
interface BroadcastRow { id: string; message: string; sent_count: number | null; created_at: string }

/** How many customers a broadcast would reach: card installed (Apple registration) AND marketing_opt_in. */
export async function broadcastReach(campaignId: string): Promise<number> {
  const { data, error } = await supabase.rpc('broadcast_reach', { p_campaign_id: campaignId });
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

/** Write the offer onto every targeted card + fire the wallet push. Returns how many were sent. */
export async function sendBroadcast(campaignId: string, message: string): Promise<{ sentCount: number }> {
  const { data, error } = await supabase.rpc('send_broadcast', { p_campaign_id: campaignId, p_message: message });
  if (error) throw error;
  return { sentCount: typeof data === 'number' ? data : 0 };
}

/** Past sends for the history list. */
export async function listBroadcasts(campaignId: string): Promise<Broadcast[]> {
  const { data, error } = await supabase
    .from('broadcasts')
    .select('id, message, sent_count, created_at')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .limit(25);
  if (error) throw error;
  return ((data as BroadcastRow[] | null) ?? []).map((r) => ({
    id: r.id, message: r.message, sentCount: r.sent_count ?? 0, createdAt: r.created_at,
  }));
}
