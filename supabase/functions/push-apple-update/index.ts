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
// Deploy with default JWT verification; the DB trigger calls it with the
// service-role key:
//   supabase functions deploy push-apple-update

import { createClient } from 'jsr:@supabase/supabase-js@2';

function env(name: string, fallback?: string): string {
  const v = Deno.env.get(name);
  if (v && v.length > 0) return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required secret: ${name}`);
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

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

Deno.serve(async (req) => {
  try {
    const { cardId } = await req.json().catch(() => ({}));
    if (!cardId) return json({ error: 'cardId required' }, 400);

    const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));

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
          // Standard header set for a silent Wallet wake-up.
          'apns-push-type': 'background',
          'apns-priority': '5',
          // Store-and-retry for 24h if the device is briefly offline/asleep,
          // instead of APNs dropping the push after a single attempt.
          'apns-expiration': String(Math.floor(Date.now() / 1000) + 86400),
        },
        // A Wallet update push MUST carry an empty JSON dictionary as its
        // payload — per Apple's "Updating a Pass" guide and Apple DTS. Wallet
        // treats it purely as a "something changed, come re-fetch" wake-up and
        // then pulls the fresh .pkpass from the web service. The previous
        // `{ aps: { 'content-available': 1 } }` was an app silent-push payload
        // that APNs accepted (status 200) but Wallet ignored — which is exactly
        // why the pass only updated on a manual pull-to-refresh.
        body: JSON.stringify({ aps: {} }),
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
