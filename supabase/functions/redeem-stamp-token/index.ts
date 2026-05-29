// supabase/functions/issue-stamp-token/index.ts
//
// Issues a short-lived signed token that the customer's wallet card
// encodes into its rotating QR. The merchant's scanner sends the token
// to /redeem-stamp-token to apply the stamp.
//
// Threat model: prevents a screenshot of the QR from being usable beyond
// the token lifetime (60s). Does NOT prevent the customer from forwarding
// a live QR to a friend in real time — that's a fundamentally social
// problem we accept for v1.
//
// Required secret:
//   STAMP_TOKEN_SECRET   - any random string >= 32 bytes
//
// Auth: must be called by the *authenticated customer* whose card it is.
// We use the user's RLS context to enforce this — they can only request
// tokens for cards where customer_id = auth.uid().
//
// Request body:
//   { cardId: string }
//
// Response (200):
//   { token: string, expiresAt: number }    // expiresAt = unix seconds
//
// Errors:
//   401 not authenticated
//   403 not your card
//   404 card not found / blocked

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SECRET = Deno.env.get('STAMP_TOKEN_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const TOKEN_LIFETIME_SECONDS = 60;

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
// HMAC helpers. Token format is a compact custom envelope (not full JWT)
// to keep the QR code small enough to scan reliably from a phone:
//
//   <payload-b64url>.<sig-b64url>
//
// payload = JSON({ c: cardId, e: expiresAt, j: jti })
// sig = HMAC-SHA256(secret, payload-b64url)
// ---------------------------------------------------------------------

const b64urlEncode = (bytes: Uint8Array | string): string => {
  const arr = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  let bin = '';
  for (let i = 0; i < arr.byteLength; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};

async function hmacSign(key: CryptoKey, data: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return b64urlEncode(new Uint8Array(sig));
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

function randomJti(): string {
  // 16 random bytes encoded — collision-safe for our purposes (one row
  // per stamp event, kept for 2 minutes, single-issuer).
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return b64urlEncode(buf);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  if (!SECRET) {
    // Misconfiguration — fail loud so we don't accidentally ship insecure tokens.
    return json(503, { error: 'Token signing not configured on the server' });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json(401, { error: 'Missing Authorization header' });
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json(401, { error: 'Not authenticated' });

  let body: { cardId?: string };
  try { body = await req.json(); } catch { return json(400, { error: 'Invalid JSON' }); }
  if (!body.cardId) return json(400, { error: 'cardId is required' });

  // Look up the card through the user's RLS context. The "cards customer
  // self read" policy ensures this only returns rows where the user IS
  // the customer — so a malicious user can't mint tokens for someone else.
  const { data: card, error: cardErr } = await userClient
    .from('cards')
    .select('id, customer_id, status')
    .eq('id', body.cardId)
    .single();
  if (cardErr || !card) return json(404, { error: 'Card not found' });
  if (card.customer_id !== user.id) {
    // Shouldn't be reachable due to RLS, but belt-and-braces.
    return json(403, { error: 'Not your card' });
  }
  if (card.status === 'BLOCKED') {
    return json(403, { error: 'Card is blocked' });
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + TOKEN_LIFETIME_SECONDS;
  const payload = { c: card.id, e: expiresAt, j: randomJti() };
  const payloadB64 = b64urlEncode(JSON.stringify(payload));

  const key = await importHmacKey(SECRET);
  const sig = await hmacSign(key, payloadB64);
  const token = `${payloadB64}.${sig}`;

  return json(200, { token, expiresAt });
});
