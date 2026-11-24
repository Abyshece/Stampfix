// Checks that a webhook really comes from Resend. Resend signs its webhooks
// the Svix way: HMAC-SHA256 over "<id>.<timestamp>.<body>" with the secret
// (base64 after "whsec_"), sent as "v1,<base64 signature>" (several may be
// listed, space-separated). Plain Web Crypto, so it runs in Deno and Node.

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifySvix(
  secret: string, msgId: string | null, timestamp: string | null, signatures: string | null, body: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!secret || !msgId || !timestamp || !signatures) return false;
  const ts = Number(timestamp);
  // Older or newer than 5 minutes: a replay, or a clock far off.
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > 300) return false;
  let key: Uint8Array;
  try { key = b64ToBytes(secret.replace(/^whsec_/, '')); } catch { return false; }
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(`${msgId}.${timestamp}.${body}`)));
  const expected = bytesToB64(mac);
  return signatures.split(' ').some((part) => {
    const [version, sig] = part.split(',');
    return version === 'v1' && !!sig && sameText(sig, expected);
  });
}
