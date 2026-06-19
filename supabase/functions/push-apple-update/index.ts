// supabase/functions/push-apple-update/index.ts
//
// Sends an empty APNs push to every device registered for a card's pass.
// The empty push wakes Apple Wallet, which then calls the web service
// (apple-wallet-webservice) to pull the refreshed .pkpass.
//
// Called whenever a card's stamp count / status changes (see the DB trigger
// in the runbook, or call it from your stamping flow).
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
    for (const r of regs) {
      // Apple Wallet always uses the PRODUCTION APNs host, even during dev.
      const resp = await fetch(`https://api.push.apple.com/3/device/${r.push_token}`, {
        method: 'POST',
        headers: {
          authorization: `bearer ${jwt}`,
          'apns-topic': topic,
          'apns-push-type': 'background',
          'apns-priority': '5',
        },
        body: '{}',
      });
      if (resp.ok) {
        pushed++;
      } else {
        const text = await resp.text().catch(() => '');
        console.warn('[push-apple-update] APNs', resp.status, text);
        // 410 = token no longer valid; clean it up.
        if (resp.status === 410) stale.push(r.push_token);
      }
    }

    if (stale.length > 0) {
      await supabase.from('apple_wallet_registrations').delete().in('push_token', stale);
    }

    return json({ pushed, devices: regs.length });
  } catch (e) {
    console.error('[push-apple-update]', e);
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
