// supabase/functions/verify-turnstile/index.ts
//
// Verifies a Cloudflare Turnstile token server-side.
//
// Why server-side: the browser-issued token is only meaningful if we
// confirm it with Cloudflare. A bot can otherwise just call our signup
// endpoint directly with no token. By requiring a verified token from
// THIS function before allowing a downstream action, we close that gap.
//
// Why a separate function (not inline in each signup): we have two
// signup flows (merchant + customer) and may add more. One verifier
// keeps the logic and the secret in one place.
//
// Required secret:
//   TURNSTILE_SECRET_KEY - from Cloudflare dashboard > Turnstile > your site
//
// If the secret is not set, this function returns ok=true with a
// `bypass: true` flag. That lets dev environments run without
// CAPTCHA. We still log a warning so it's obvious.
//
// Request body:
//   { token: string }
//
// Response (200):
//   { ok: true }          // verified
//   { ok: true, bypass: true }  // dev mode, no secret configured
//   { ok: false, reason: string }  // rejected by Cloudflare

const TURNSTILE_SECRET = Deno.env.get('TURNSTILE_SECRET_KEY');

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  // No secret configured: dev mode. Bypass the check but flag it so we
  // can find logs if this accidentally ships to production.
  if (!TURNSTILE_SECRET) {
    console.warn('[turnstile] TURNSTILE_SECRET_KEY not set; bypassing verification');
    return json(200, { ok: true, bypass: true });
  }

  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, reason: 'Invalid JSON' });
  }
  if (!body.token) {
    return json(400, { ok: false, reason: 'Missing token' });
  }

  // Cloudflare's siteverify endpoint. Cap at 5s — if Cloudflare is
  // slow/down, fail open rather than blocking real users.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const cf = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: TURNSTILE_SECRET,
        response: body.token,
      }),
      signal: controller.signal,
    });

    if (!cf.ok) {
      console.warn(`[turnstile] siteverify HTTP ${cf.status}; failing open`);
      return json(200, { ok: true, degraded: true });
    }

    const result = await cf.json() as { success: boolean; 'error-codes'?: string[] };
    if (!result.success) {
      const codes = result['error-codes']?.join(',') ?? 'unknown';
      console.warn(`[turnstile] verification failed: ${codes}`);
      return json(200, { ok: false, reason: 'Failed verification' });
    }

    return json(200, { ok: true });
  } catch (err) {
    // Network error or timeout. Fail open — better to occasionally let
    // a bot through than to block every legitimate signup if Cloudflare
    // has a hiccup.
    const reason = err instanceof Error ? err.message : 'unknown error';
    console.warn(`[turnstile] siteverify threw: ${reason}; failing open`);
    return json(200, { ok: true, degraded: true });
  } finally {
    clearTimeout(timeout);
  }
});
