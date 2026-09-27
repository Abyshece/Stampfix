// supabase/functions/redeem-stamp-token/index.ts
//
// Verifies a stamp token from a scanned QR code (the rotating QR on the
// customer's web card), then stamps or redeems through merchant_scan — the
// same atomic database step as every other staff scan. merchant_scan checks
// that the card belongs to the caller's shop, that it isn't blocked, the
// shop's daily stamp limit, and writes the activity row with the stamp.
//
// Required secret:
//   STAMP_TOKEN_SECRET   - must match the one used by issue-stamp-token
//
// Auth: the *merchant* whose campaign owns the card (their JWT is passed on
// to merchant_scan, so auth.uid() is the merchant).
//
// Request body:
//   { token: string, locationId?: string, staffId?: string, staffName?: string, tz?: string }
//
// Response (200):
//   { ok: true, action: 'STAMP' | 'REDEEM', override, card: { id, customerName,
//     currentStamps, rewardsRedeemed, status, maxStamps } }
//   (card also carries the older snake_case names for clients before Sep 2026)
//
// Errors ({ error: message, code?, card?, stampsToday?, cap? }):
//   400 token malformed / wrong signature
//   401 not authenticated
//   403 token already used / card blocked / account frozen or inactive
//   404 card not found or from another shop       (code 'not_found')
//   409 daily stamp limit reached                  (code 'daily_cap')
//   410 token expired

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

  let body: { token?: string; locationId?: string | null; staffId?: string | null; staffName?: string | null; tz?: string | null };
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

  // Stamp or redeem in one atomic step, as the merchant.
  const { data: scan, error: scanErr } = await userClient.rpc('merchant_scan', {
    p_card_id: cardId,
    p_action: 'auto',
    p_location_id: body.locationId ?? null,
    p_source: 'qr',
    p_staff_id: body.staffId ?? null,
    p_staff_name: body.staffName ?? null,
    p_tz: body.tz ?? null,
  });
  if (scanErr || !scan) {
    console.error('merchant_scan failed:', scanErr);
    return json(500, { error: 'Could not apply stamp' });
  }
  // deno-lint-ignore no-explicit-any
  const r = scan as any;
  if (!r.ok) {
    const code = String(r.error ?? 'error');
    const card = r.card ?? undefined;
    switch (code) {
      case 'not_found':
        return json(404, { code, error: 'This card is from a different café' });
      case 'blocked':
        return json(403, { code, error: 'This card is blocked' });
      case 'merchant_frozen':
        return json(403, { code, error: 'Stamping is temporarily disabled for this merchant. Please contact support.' });
      case 'merchant_inactive':
        return json(403, { code, error: 'This merchant account is not active.' });
      case 'daily_cap':
        return json(409, {
          code, card, stampsToday: r.stampsToday, cap: r.cap,
          error: `${card?.customerName ?? 'This customer'} already got ${r.stampsToday} stamp${r.stampsToday === 1 ? '' : 's'} today (daily limit ${r.cap}).`,
        });
      default:
        return json(409, { code, card, error: 'Could not apply stamp' });
    }
  }

  const c = r.card;
  const card = {
    id: c.id,
    customerName: c.customerName,
    currentStamps: c.currentStamps,
    rewardsRedeemed: c.rewardsRedeemed,
    status: c.status,
    maxStamps: c.maxStamps,
    // Older clients read these names.
    customer_name: c.customerName,
    current_stamps: c.currentStamps,
    rewards_redeemed: c.rewardsRedeemed,
  };

  // Tell the customer's wallet passes the card changed. The database trigger
  // does this too; this direct call keeps Apple updates working even if the
  // trigger's stored key goes stale. Best-effort: never fails the stamp.
  try {
    const walletHeaders = {
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    };
    const walletBody = JSON.stringify({ cardId });
    const walletResults = await Promise.allSettled([
      fetch(`${SUPABASE_URL}/functions/v1/push-apple-update`, { method: 'POST', headers: walletHeaders, body: walletBody }),
      fetch(`${SUPABASE_URL}/functions/v1/sync-wallet-object`, { method: 'POST', headers: walletHeaders, body: walletBody }),
    ]);
    walletResults.forEach((res, i) => {
      if (res.status === 'rejected') {
        console.error(`[redeem-stamp-token] wallet notify ${i === 0 ? 'apple' : 'google'} failed:`, res.reason);
      }
    });
  } catch (walletErr) {
    console.error('[redeem-stamp-token] wallet notify dispatch failed:', walletErr);
  }

  // Retention email when the customer is exactly one stamp from the reward.
  // Best-effort: a mail problem never fails the stamp.
  if (r.action === 'STAMP' && c.currentStamps === c.maxStamps - 1 && c.email) {
    sendOneAwayEmail({
      to: c.email,
      customerName: c.customerName,
      businessName: r.businessName ?? 'a merchant',
      offerTitle: c.offerTitle ?? '',
      currentStamps: c.currentStamps,
      maxStamps: c.maxStamps,
    }).catch((err) => console.warn('[notify] one-away email failed:', err));
  }

  return json(200, { ok: true, action: r.action, override: Boolean(r.override), card });
});

// ---------------------------------------------------------------------
// Retention email
// ---------------------------------------------------------------------

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const APP_ORIGIN = Deno.env.get('PUBLIC_APP_ORIGIN') ?? 'https://stampfix.app';
const FROM_ADDRESS = Deno.env.get('NOTIFY_FROM_ADDRESS') ?? 'Stampfix <hello@stampfix.app>';

async function sendOneAwayEmail(input: {
  to: string;
  customerName: string;
  businessName: string;
  offerTitle: string;
  currentStamps: number;
  maxStamps: number;
}): Promise<void> {
  if (!RESEND_API_KEY) {
    console.warn('[notify] RESEND_API_KEY not set; skipping email');
    return;
  }

  const subject = `You're 1 stamp away from your reward at ${input.businessName}!`;
  const html = `
<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F7F7F5;margin:0;padding:32px;color:#37352F;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #E9E9E7;overflow:hidden;">
    <div style="padding:32px 32px 16px;">
      <div style="font-size:32px;text-align:center;margin-bottom:16px;">☕️</div>
      <h1 style="font-family:Georgia,serif;font-size:24px;font-weight:600;margin:0 0 12px;text-align:center;">
        You're 1 stamp away!
      </h1>
      <p style="font-size:15px;line-height:1.5;color:#6B6B6B;text-align:center;margin:0 0 24px;">
        Hi ${escapeHtml(input.customerName)}, you've collected
        <strong style="color:#37352F;">${input.currentStamps} of ${input.maxStamps}</strong> stamps
        at <strong style="color:#37352F;">${escapeHtml(input.businessName)}</strong>.
        One more visit and your reward is yours.
      </p>
      ${input.offerTitle ? `
      <div style="background:#F7F7F5;border:1px solid #E9E9E7;border-radius:8px;padding:16px;text-align:center;margin-bottom:24px;">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#9B9A97;margin-bottom:4px;">Your reward</div>
        <div style="font-size:16px;font-weight:600;">${escapeHtml(input.offerTitle)}</div>
      </div>` : ''}
      <div style="text-align:center;margin-bottom:8px;">
        <a href="${APP_ORIGIN}/my-card"
           style="display:inline-block;background:#37352F;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:500;font-size:14px;">
          See your card
        </a>
      </div>
    </div>
    <div style="background:#F7F7F5;padding:16px 32px;text-align:center;border-top:1px solid #E9E9E7;">
      <p style="margin:0;font-size:11px;color:#9B9A97;line-height:1.5;">
        You're receiving this because you're enrolled in ${escapeHtml(input.businessName)}'s loyalty program on Stampfix.
      </p>
    </div>
  </div>
</body></html>`.trim();

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: input.to,
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend ${res.status}: ${text}`);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
