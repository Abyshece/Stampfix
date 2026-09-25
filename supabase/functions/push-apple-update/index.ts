// supabase/functions/push-apple-update/index.ts
//
// Sends a Wallet-update push to every device registered for a card's pass.
// The push wakes Apple Wallet, which then calls the web service
// (apple-wallet-webservice) to pull the refreshed .pkpass.
//
// Called whenever a card's stamp count / status changes (DB trigger
// notify_wallet_on_card_change on public.cards).
//
// Secrets required:
//   APNS_AUTH_KEY_P8  -> contents of the AuthKey_XXXX.p8 file (PEM, PKCS#8)
//   APNS_KEY_ID       -> the Key ID of that APNs auth key
//   APPLE_TEAM_ID     -> CL2ADKJNSU
//   APPLE_PASS_TYPE_ID-> pass.app.stampfix.loyalty
//
// Deploy WITHOUT gateway JWT verification; the function authorizes callers
// itself (see isAuthorized below):
//   supabase functions deploy push-apple-update --no-verify-jwt
//
// Why: the DB trigger sends the service-role key stored in Vault. Once the
// project's key rotates, that copy is stale and the gateway rejects every
// trigger call with 401 before this code runs — no push, no pass update.
// That already broke Google sync once; sync-wallet-object tolerates it, and
// this now matches it.
//
// Optional secret:
//   WALLET_SYNC_SECRET -> strict shared secret (same one sync-wallet-object
//                         accepts), sent as Bearer or x-wallet-sync-secret

import { createClient } from 'jsr:@supabase/supabase-js@2';

function env(name: string, fallback?: string): string {
  const v = Deno.env.get(name);
  if (v && v.length > 0) return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required secret: ${name}`);
}

// CORS so the merchant dashboard can call this straight after a stamp.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Import a PKCS#8 PEM EC P-256 private key (the .p8) for ES256 signing.
async function importP8(pem: string): Promise<CryptoKey> {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

// Build the short-lived ES256 JWT APNs expects. Web Crypto ECDSA produces the
// raw r||s signature, which is exactly the JWS format (not DER) — correct here.
async function makeApnsJwt(teamId: string, keyId: string, key: CryptoKey): Promise<string> {
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'ES256', kid: keyId })));
  const claims = b64url(new TextEncoder().encode(JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) })));
  const unsigned = `${header}.${claims}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${b64url(sig)}`;
}

// The JWT's `role` claim, decoded WITHOUT signature verification. Used only to
// recognise the DB trigger's (possibly rotated) service-role token, exactly as
// sync-wallet-object does. The worst a caller can do is wake a card's pass.
function jwtRole(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const payload = JSON.parse(atob(b64));
    return typeof payload?.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

// Same allow-list as sync-wallet-object: the shared secret, the current
// service-role key, any service_role token (the trigger's Vault copy), or a
// signed-in user. The anon key alone is not enough.
async function isAuthorized(
  req: Request,
  auth: { getUser(jwt: string): Promise<{ data: { user: unknown } }> },
): Promise<boolean> {
  const authHeader = req.headers.get('Authorization') ?? '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
  const headerSecret = req.headers.get('x-wallet-sync-secret')?.trim() ?? '';
  const syncSecret = Deno.env.get('WALLET_SYNC_SECRET') ?? '';

  if (syncSecret && (headerSecret === syncSecret || bearer === syncSecret)) return true;
  if (!bearer) return false;
  if (bearer === env('SUPABASE_SERVICE_ROLE_KEY') || jwtRole(bearer) === 'service_role') return true;
  const { data } = await auth.getUser(bearer).catch(() => ({ data: { user: null } }));
  return !!data?.user;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
    if (!(await isAuthorized(req, supabase.auth))) {
      console.warn('[push-apple-update] rejected unauthorized call');
      return json({ error: 'Not authorized' }, 401);
    }

    const { cardId } = await req.json().catch(() => ({}));
    if (!cardId) return json({ error: 'cardId required' }, 400);

    // Bump the pass's update tag so the web service reports it as changed.
    await supabase.from('cards').update({ passkit_last_updated: new Date().toISOString() }).eq('id', cardId);

    const { data: regs } = await supabase
      .from('apple_wallet_registrations')
      .select('push_token')
      .eq('serial_number', cardId);
    if (!regs || regs.length === 0) return json({ pushed: 0, reason: 'no_registrations' });

    const key = await importP8(env('APNS_AUTH_KEY_P8'));
    const jwt = await makeApnsJwt(env('APPLE_TEAM_ID', 'CL2ADKJNSU'), env('APNS_KEY_ID'), key);
    const topic = env('APPLE_PASS_TYPE_ID', 'pass.app.stampfix.loyalty');

    let pushed = 0;
    const stale: string[] = [];
    const errors: Array<{ status: number; reason: string }> = [];
    for (const r of regs) {
      // Apple Wallet always uses the PRODUCTION APNs host, even during dev.
      const resp = await fetch(`https://api.push.apple.com/3/device/${r.push_token}`, {
        method: 'POST',
        headers: {
          authorization: `bearer ${jwt}`,
          // Wallet routes the push by the pass type id in apns-topic — there
          // is no app bundle id involved.
          'apns-topic': topic,
          // Deliver NOW. This used to be push-type `background` + priority 5,
          // which Apple defines as "send based on power considerations on the
          // user's device": the phone may hold the push back (and background
          // pushes are throttled), so the pass only changed on pull-to-refresh.
          // Every version of this function used 5 and none auto-updated.
          // Wallet pushes predate push types and were always high priority;
          // node-apn, which most working Wallet servers use, sends priority 10
          // and no background type. `alert` is the type that allows 10 (and
          // watchOS requires an explicit type for the Watch's registration).
          'apns-push-type': 'alert',
          'apns-priority': '10',
          // Store-and-retry for 24h if the device is briefly offline/asleep,
          // instead of APNs dropping the push after a single attempt.
          'apns-expiration': String(Math.floor(Date.now() / 1000) + 86400),
        },
        // A Wallet update push carries an empty JSON dictionary — literally
        // `{}` — per Apple's "Updating a Pass" guide and Apple DTS. Wallet
        // treats it purely as "something changed, come re-fetch": it then asks
        // apple-wallet-webservice which passes changed and pulls those.
        body: '{}',
      });
      if (resp.ok) {
        pushed++;
      } else {
        const text = await resp.text().catch(() => '');
        console.warn('[push-apple-update] APNs', resp.status, text);
        let reason = text;
        try { reason = (JSON.parse(text) as { reason?: string }).reason ?? text; } catch { /* keep raw */ }
        errors.push({ status: resp.status, reason });
        // 410 = token no longer valid; clean it up.
        if (resp.status === 410) stale.push(r.push_token);
      }
    }

    if (stale.length > 0) {
      await supabase.from('apple_wallet_registrations').delete().in('push_token', stale);
    }

    // Surface APNs failures in the response (and logs) so a bad push can never
    // masquerade as success again.
    return json({ pushed, devices: regs.length, ...(errors.length ? { errors } : {}) });
  } catch (e) {
    console.error('[push-apple-update]', e);
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
