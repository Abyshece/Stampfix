// supabase/functions/redeem-stamp-token/index.ts
//
// Verifies a stamp token from a scanned QR code and applies the stamp
// atomically server-side. Replaces the client-side "find card and add
// stamp" path with one that's authoritative and replay-protected.
//
// Required secret:
//   STAMP_TOKEN_SECRET   - must match the one used by issue-stamp-token
//
// Auth: the *merchant* whose campaign owns the card.
// RLS-enforced: a merchant for campaign A can't stamp a card in campaign B.
//
// Request body:
//   { token: string }
//
// Response (200):
//   { ok: true, action: 'STAMP' | 'REDEEM', card: { id, currentStamps, rewardsRedeemed, status, customerName } }
//
// Errors:
//   400 token malformed / wrong signature
//   401 not authenticated
//   403 you don't own this card's campaign / card blocked / token already used
//   404 card no longer exists
//   410 token expired
//
// Action semantics:
//   - If currentStamps < maxStamps: increment (STAMP)
//   - If currentStamps >= maxStamps: redeem the reward (REDEEM)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SECRET = Deno.env.get('STAMP_TOKEN_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// ---------------------------------------------------------------------
// HMAC verify
// ---------------------------------------------------------------------
const b64urlDecode = (s: string): Uint8Array => {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const b64urlEncode = (bytes: Uint8Array): string => {
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function verifyToken(token: string, secret: string):
  Promise<{ ok: true; payload: { c: string; e: number; j: string } } | { ok: false; reason: string }> {
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'malformed' };
  const [payloadB64, sigB64] = parts;

  const key = await importHmacKey(secret);
  const expected = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  const expectedB64 = b64urlEncode(new Uint8Array(expected));
  // Constant-time compare via length + char-by-char (Deno doesn't expose
  // a crypto timingSafeEqual; this is good enough for short fixed-length strings).
  if (expectedB64.length !== sigB64.length) return { ok: false, reason: 'bad signature' };
  let diff = 0;
  for (let i = 0; i < expectedB64.length; i++) {
    diff |= expectedB64.charCodeAt(i) ^ sigB64.charCodeAt(i);
  }
  if (diff !== 0) return { ok: false, reason: 'bad signature' };

  let payload: { c: string; e: number; j: string };
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64)));
  } catch {
    return { ok: false, reason: 'malformed payload' };
  }
  if (typeof payload.c !== 'string' || typeof payload.e !== 'number' || typeof payload.j !== 'string') {
    return { ok: false, reason: 'malformed payload' };
  }
  return { ok: true, payload };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!SECRET) return json(503, { error: 'Token signing not configured on the server' });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json(401, { error: 'Missing Authorization header' });

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json(401, { error: 'Not authenticated' });

  let body: { token?: string; locationId?: string | null };
  try { body = await req.json(); } catch { return json(400, { error: 'Invalid JSON' }); }
  if (!body.token) return json(400, { error: 'token is required' });

  const verified = await verifyToken(body.token, SECRET);
  if (!verified.ok) return json(400, { error: `Invalid token: ${verified.reason}` });
  const { c: cardId, e: expiresAt, j: jti } = verified.payload;

  const now = Math.floor(Date.now() / 1000);
  if (now > expiresAt) return json(410, { error: 'Token expired' });

  // Replay protection: try to insert the jti into used_stamp_tokens. If it
  // already exists (unique constraint violation), reject the request.
  // Uses the service-role client because used_stamp_tokens is restricted
  // (no policy grants insert to authenticated users — we want this
  // gatekept by the function).
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { error: jtiErr } = await admin
    .from('used_stamp_tokens')
    .insert({ jti, expires_at: new Date(expiresAt * 1000).toISOString() });
  if (jtiErr) {
    // Code 23505 = unique_violation — token already used.
    const code = (jtiErr as { code?: string }).code;
    if (code === '23505') return json(403, { error: 'Token already used' });
    console.error('jti insert failed:', jtiErr);
    return json(500, { error: 'Internal error' });
  }

  // Now look up the card through the merchant's RLS context. This ensures
  // a merchant for campaign A can't stamp a card in campaign B — RLS does
  // not return rows the user can't access, so the .single() will fail.
  const { data: card, error: cardErr } = await userClient
    .from('cards')
    .select('id, campaign_id, customer_name, current_stamps, rewards_redeemed, status, campaigns(max_stamps)')
    .eq('id', cardId)
    .single();
  if (cardErr || !card) return json(404, { error: 'Card not found or not yours to stamp' });
  if (card.status === 'BLOCKED') return json(403, { error: 'Card is blocked' });

  // deno-lint-ignore no-explicit-any
  const maxStamps = (card as any).campaigns?.max_stamps ?? 6;

  let action: 'STAMP' | 'REDEEM';
  let newStamps: number;
  let newRedeemed: number;
  if (card.current_stamps >= maxStamps) {
    action = 'REDEEM';
    newStamps = 0;
    newRedeemed = card.rewards_redeemed + 1;
  } else {
    action = 'STAMP';
    newStamps = card.current_stamps + 1;
    newRedeemed = card.rewards_redeemed;
  }

  // Apply the update through the merchant's RLS context too.
  const { data: updated, error: updErr } = await userClient
    .from('cards')
    .update({ current_stamps: newStamps, rewards_redeemed: newRedeemed })
    .eq('id', cardId)
    .select('id, customer_name, current_stamps, rewards_redeemed, status')
    .single();
  if (updErr || !updated) {
    console.error('card update failed:', updErr);
    return json(500, { error: 'Could not apply stamp' });
  }

  // Log the activity. Best-effort. Records the location if the merchant's
  // scanner is operating as a specific branch.
  await userClient.from('activities').insert({
    campaign_id: card.campaign_id,
    card_id: cardId,
    customer_name: updated.customer_name,
    type: action,
    location_id: body.locationId ?? null,
  });

  return json(200, { ok: true, action, card: updated });
});
