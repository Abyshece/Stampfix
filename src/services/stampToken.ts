import { supabase } from '../lib/supabase';
import type { ScanCard, ScanResult } from '../lib/db';

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
 * Send a scanned token to the server. The server verifies the token (expiry,
 * replay) and then stamps or redeems through the same atomic merchant_scan
 * step as every other scan. Scan outcomes (blocked, other shop, daily limit)
 * come back as { ok: false, error } so the scanner can react — e.g. ask for
 * a reason at the daily limit. Token problems (expired, already used) and
 * network failures come back as { ok: false, error: 'token', message }.
 */
export async function redeemStampToken(
  token: string,
  locationId: string | null,
  staff: { id: string; name: string } | null = null,
): Promise<ScanResult> {
  const { data, error } = await supabase.functions.invoke<Record<string, unknown>>('redeem-stamp-token', {
    body: { token, locationId, staffId: staff?.id ?? null, staffName: staff?.name ?? null, tz: deviceTimeZone() },
  });

  if (error) {
    // Non-2xx: the body says why ({ error: message, code?, card?, stampsToday?, cap? }).
    let body: Record<string, unknown> | undefined;
    try {
      const ctx = (error as unknown as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') body = await ctx.json();
    } catch { /* ignore */ }
    const message = (typeof body?.error === 'string' && body.error) || error.message || 'Could not stamp card';
    if (typeof body?.code === 'string') {
      return {
        ok: false, error: body.code, message,
        card: toScanCard(body.card), stampsToday: Number(body.stampsToday ?? 0), cap: Number(body.cap ?? 0),
      };
    }
    return { ok: false, error: 'token', message };
  }
  if (!data?.ok) return { ok: false, error: 'token', message: 'Unexpected response from server' };

  const card = toScanCard(data.card);
  if (!card) return { ok: false, error: 'token', message: 'Unexpected response from server' };
  return {
    ok: true,
    action: data.action === 'REDEEM' ? 'REDEEM' : 'STAMP',
    override: Boolean(data.override),
    card: { ...card, rewardsRedeemed: card.rewardsRedeemed ?? 0, status: card.status ?? 'ACTIVE' },
  };
}

/** Accepts the camelCase card from merchant_scan and the older snake_case shape. */
function toScanCard(raw: unknown): ScanCard | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const c = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0));
  return {
    id: String(c.id ?? ''),
    customerName: String(c.customerName ?? c.customer_name ?? ''),
    currentStamps: num(c.currentStamps ?? c.current_stamps),
    rewardsRedeemed: num(c.rewardsRedeemed ?? c.rewards_redeemed),
    status: (c.status === 'BLOCKED' ? 'BLOCKED' : 'ACTIVE'),
    maxStamps: num(c.maxStamps ?? c.max_stamps_snapshot ?? 0),
  };
}

function deviceTimeZone(): string | null {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; }
}
