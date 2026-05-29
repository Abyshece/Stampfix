import { supabase } from '../lib/supabase';

/**
 * Ask the server for a fresh signed token to encode into the customer's
 * QR code. Tokens live for ~60s; the wallet view should refresh every 30s.
 *
 * Returns null on any failure — callers should fall back to a plain
 * `cardId` QR so the customer isn't left with a broken card. The server
 * is the source of truth for what counts as a valid stamp anyway.
 */
export async function issueStampToken(cardId: string): Promise<{ token: string; expiresAt: number } | null> {
  try {
    const { data, error } = await supabase.functions.invoke<{ token: string; expiresAt: number }>(
      'issue-stamp-token',
      { body: { cardId } },
    );
    if (error || !data?.token) {
      console.warn('[stamp-token] issue failed:', error);
      return null;
    }
    return data;
  } catch (e) {
    console.warn('[stamp-token] issue threw:', e);
    return null;
  }
}

/**
 * Send a scanned token to the server. The server verifies + applies the
 * stamp atomically and returns the updated card state. Thrown errors
 * propagate so the scanner can show the right toast (expired, replayed,
 * blocked, etc.).
 */
export interface RedeemResult {
  action: 'STAMP' | 'REDEEM';
  card: {
    id: string;
    customerName: string;
    currentStamps: number;
    rewardsRedeemed: number;
    status: 'ACTIVE' | 'BLOCKED';
  };
}

export async function redeemStampToken(
  token: string,
  locationId: string | null,
): Promise<RedeemResult> {
  const { data, error } = await supabase.functions.invoke<{
    ok: true;
    action: 'STAMP' | 'REDEEM';
    card: {
      id: string;
      customer_name: string;
      current_stamps: number;
      rewards_redeemed: number;
      status: 'ACTIVE' | 'BLOCKED';
    };
  }>('redeem-stamp-token', { body: { token, locationId } });

  if (error) {
    // Try to extract the server's error message from the response body.
    let serverMessage: string | undefined;
    try {
      const ctx = (error as unknown as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json();
        serverMessage = body?.error;
      }
    } catch { /* ignore */ }
    throw new Error(serverMessage || error.message || 'Could not stamp card');
  }
  if (!data?.ok) throw new Error('Unexpected response from server');

  return {
    action: data.action,
    card: {
      id: data.card.id,
      customerName: data.card.customer_name,
      currentStamps: data.card.current_stamps,
      rewardsRedeemed: data.card.rewards_redeemed,
      status: data.card.status,
    },
  };
}
