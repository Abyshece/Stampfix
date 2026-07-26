// supabase/functions/sync-wallet-object/index.ts
//
// Syncs a single card's state to Google Wallet. Called by the frontend
// after every stamp / redeem / status change so customers see the new
// state in their already-saved wallet pass without re-saving.
//
// This is a "lighter" sibling of generate-wallet-jwt: it does the same
// LoyaltyObject upsert against the Wallet API but doesn't return a JWT.
// The class is also upserted in case it doesn't exist yet (first sync
// after a customer adds the pass).
//
// Required Supabase secrets (same as generate-wallet-jwt):
//   GOOGLE_WALLET_ISSUER_ID
//   GOOGLE_WALLET_SERVICE_ACCOUNT
//
// Auth: the DB trigger (server-to-server) is recognised by a service-role
// token; the function then does all DB work with its OWN service-role env, so
// it no longer breaks when the project's service-role key rotates. Optionally
// set WALLET_SYNC_SECRET for a strict, rotation-proof shared-secret check.
//
// Request body:
//   { cardId: string }
//
// Response:
//   200 { ok: true, synced: true }
//   200 { ok: true, synced: false, reason: "..." }   <- when Wallet isn't configured
//   4xx { error: string }
//
// Why does this return 200 even when Wallet isn't configured?
// Because the frontend calls this after every stamp. If Wallet isn't
// set up yet, that shouldn't make the stamp itself fail or log scary
// errors. We signal "not synced" softly so the UI can ignore it.

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const ISSUER_ID = Deno.env.get('GOOGLE_WALLET_ISSUER_ID');
const SERVICE_ACCOUNT_JSON = Deno.env.get('GOOGLE_WALLET_SERVICE_ACCOUNT');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
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
// Crypto helpers (duplicated from generate-wallet-jwt — Edge Functions
// don't share code, and the helpers are small enough that keeping them
// inline is simpler than building a shared library).
// ---------------------------------------------------------------------

const b64urlEncode = (data: ArrayBuffer | Uint8Array | string): string => {
  let bytes: Uint8Array;
  if (typeof data === 'string') bytes = new TextEncoder().encode(data);
  else if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
  else bytes = data;
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};

async function importServiceAccountKey(pem: string): Promise<CryptoKey> {
  const pemBody = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function signJwt(payload: Record<string, unknown>, key: CryptoKey, kid?: string): Promise<string> {
  const header: Record<string, unknown> = { alg: 'RS256', typ: 'JWT' };
  if (kid) header.kid = kid;
  const headerB64 = b64urlEncode(JSON.stringify(header));
  const payloadB64 = b64urlEncode(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${b64urlEncode(sig)}`;
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
  private_key_id: string;
  token_uri: string;
}

async function getWalletAccessToken(sa: ServiceAccount): Promise<string> {
  const key = await importServiceAccountKey(sa.private_key);
  const now = Math.floor(Date.now() / 1000);
  const assertion = await signJwt(
    {
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/wallet_object.issuer',
      aud: sa.token_uri,
      iat: now,
      exp: now + 3600,
    },
    key,
    sa.private_key_id,
  );

  const res = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) {
    throw new Error(`OAuth token exchange failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()).access_token;
}

// ---------------------------------------------------------------------
// Wallet object payload (must match the shape used by generate-wallet-jwt
// so updates land on the same object id).
// ---------------------------------------------------------------------

interface Campaign {
  id: string;
  business_name: string;
  offer_title: string;
  primary_color: string;
  max_stamps: number;
  custom_icon: string;
  logo_image?: string | null;
  logo_mode?: string | null;
}

interface Card {
  id: string;
  customer_name: string;
  current_stamps: number;
  rewards_redeemed: number;
  status: string;
}

const classIdFor = (campaignId: string) => `${ISSUER_ID}.stampify_${campaignId.replace(/-/g, '')}`;
const objectIdFor = (cardId: string) => `${ISSUER_ID}.card_${cardId.replace(/-/g, '')}`;

function buildLoyaltyClass(campaign: Campaign) {
  // Use the merchant's own logo when they've uploaded one to storage (a public
  // https URL). Google can't fetch base64 data URLs, so anything else falls
  // back to the Stampfix logo.
  const logoUri =
    campaign.logo_mode === 'custom' &&
    typeof campaign.logo_image === 'string' &&
    /^https?:\/\//.test(campaign.logo_image)
      ? campaign.logo_image
      : 'https://stampfix.app/wallet-assets/wallet-logo-v2.png';
  return {
    id: classIdFor(campaign.id),
    issuerName: campaign.business_name,
    programName: campaign.business_name,
    programLogo: {
      sourceUri: {
        uri: logoUri,
      },
    },
    reviewStatus: 'UNDER_REVIEW',
    hexBackgroundColor: campaign.primary_color,
    rewardsTier: campaign.offer_title,
    rewardsTierLabel: 'Reward',
    localizedIssuerName: { defaultValue: { language: 'en-US', value: campaign.business_name } },
    localizedProgramName: { defaultValue: { language: 'en-US', value: campaign.business_name } },
  };
}

function buildLoyaltyObject(campaign: Campaign, card: Card) {
  return {
    id: objectIdFor(card.id),
    classId: classIdFor(campaign.id),
    state: card.status === 'BLOCKED' ? 'INACTIVE' : 'ACTIVE',
    accountId: card.id,
    accountName: card.customer_name,
    loyaltyPoints: {
      balance: { string: `${card.current_stamps} / ${campaign.max_stamps}` },
      label: 'Stamps',
    },
    secondaryLoyaltyPoints: {
      balance: { int: card.rewards_redeemed },
      label: 'Rewards earned',
    },
    barcode: {
      type: 'QR_CODE',
      value: JSON.stringify({ cardId: card.id }),
      alternateText: card.id.slice(0, 8),
    },
    textModulesData: [
      { id: 'offer', header: 'Current offer', body: campaign.offer_title },
      {
        id: 'updated',
        header: 'Last updated',
        body: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      },
      {
        id: 'howto',
        header: 'Keep your card up to date',
        body: 'Your card updates automatically. To refresh it yourself, open the pass in Google Wallet, tap the \u22ee menu (top-right) and choose refresh.',
      },
    ],
  };
}

/**
 * For sync we use PATCH instead of PUT — we only want to update the
 * fields the merchant cares about (points, state), not re-write the
 * entire object. If the object doesn't exist yet (customer never saved
 * the pass), PATCH 404s and we silently skip — there's nothing to sync.
 */
async function syncObject(accessToken: string, campaign: Campaign, card: Card): Promise<boolean> {
  const body = buildLoyaltyObject(campaign, card);
  const url = `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${encodeURIComponent(body.id)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.ok) return true;
  if (res.status === 404) {
    // Object doesn't exist yet — customer hasn't saved their pass.
    // This is expected for cards whose owner never tapped "Save".
    return false;
  }
  throw new Error(`Wallet PATCH failed: ${res.status} ${await res.text()}`);
}

/**
 * Ensure the class exists. We only call this on the first sync miss,
 * since classes rarely change. But for v1 simplicity we just call it
 * every time — it's a single PUT, costs a few hundred ms, idempotent.
 * TODO: cache class existence per campaign for the function instance lifetime.
 */
async function ensureClass(accessToken: string, campaign: Campaign): Promise<void> {
  const body = buildLoyaltyClass(campaign);
  const baseUrl = 'https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass';
  const putRes = await fetch(`${baseUrl}/${encodeURIComponent(body.id)}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (putRes.ok) return;
  if (putRes.status === 404) {
    const postRes = await fetch(baseUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!postRes.ok) throw new Error(`Class create failed: ${postRes.status} ${await postRes.text()}`);
    return;
  }
  throw new Error(`Class upsert failed: ${putRes.status} ${await putRes.text()}`);
}

// ---------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------

/**
 * Decode a JWT payload (NO signature verification) and return its `role`
 * claim, or null. Used only to recognise the server-side DB trigger's
 * service-role token. Signature verification isn't needed for this coarse
 * allow/deny decision because the request can't escalate beyond mirroring
 * one card into Google Wallet, and all DB access uses this function's own
 * service-role env — never the caller's token.
 */
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  // If Wallet isn't configured, return 200 with synced:false. The frontend
  // calls this after every stamp; an error here would surface as a scary
  // toast for merchants who haven't connected Wallet yet.
  if (!ISSUER_ID || !SERVICE_ACCOUNT_JSON) {
    return json(200, { ok: true, synced: false, reason: 'wallet_not_configured' });
  }

  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const SYNC_SECRET = Deno.env.get('WALLET_SYNC_SECRET') ?? '';

  const authHeader = req.headers.get('Authorization') ?? '';
  const bearer = authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : '';
  const headerSecret = req.headers.get('x-wallet-sync-secret')?.trim() ?? '';

  // Authorize the caller WITHOUT requiring the caller's token to BE the
  // current service-role key. That requirement is what broke on every key
  // rotation: the DB trigger sends whatever key sits in Vault, and the moment
  // the project's service-role key rotated, that stored copy went stale.
  //
  // The database work below ALWAYS runs with THIS function's own current
  // SUPABASE_SERVICE_ROLE_KEY env, so the caller's token can never do anything
  // the function couldn't already do — it's used only to allow/deny the call.
  let authorized = false;

  // (1) Strict shared secret — rotation-proof and preferred long term. Set
  // WALLET_SYNC_SECRET on this function and have the trigger send it (either
  // as the Bearer token or an `x-wallet-sync-secret` header) to require it.
  if (SYNC_SECRET && (headerSecret === SYNC_SECRET || bearer === SYNC_SECRET)) {
    authorized = true;
  }

  // (2) Server-to-server: the current service-role key, OR any token whose
  // role claim is 'service_role' (this is what the DB trigger sends, including
  // a legacy/rotated key that no longer matches the current one).
  if (!authorized && bearer && (bearer === SERVICE_ROLE_KEY || jwtRole(bearer) === 'service_role')) {
    authorized = true;
  }

  // (3) A signed-in user (if the app ever calls this directly).
  if (!authorized && bearer) {
    const probe = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data: { user } } = await probe.auth.getUser();
    if (user) authorized = true;
  }

  if (!authorized) return json(401, { error: 'Not authorized' });

  // All reads use the current service-role env (RLS-bypassing). Reading one
  // card by id to mirror it into Google Wallet leaks nothing to the caller —
  // the response is only { ok, synced }.
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  let body: { cardId?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }
  if (!body.cardId) return json(400, { error: 'cardId is required' });

  // Load card + campaign through the user's RLS context. If the user is
  // a merchant, they see cards in their campaign. If a customer, only
  // their own card. Either way, no leak.
  const { data: card, error: cardErr } = await db
    .from('cards')
    .select('id, customer_name, current_stamps, rewards_redeemed, status, campaign_id')
    .eq('id', body.cardId)
    .single();
  if (cardErr || !card) return json(404, { error: 'Card not found' });

  const { data: campaign, error: campaignErr } = await db
    .from('campaigns')
    .select('id, business_name, offer_title, primary_color, max_stamps, custom_icon, logo_image, logo_mode')
    .eq('id', card.campaign_id)
    .single();
  if (campaignErr || !campaign) return json(404, { error: 'Campaign not found' });

  let sa: ServiceAccount;
  try {
    sa = JSON.parse(SERVICE_ACCOUNT_JSON);
  } catch {
    return json(500, { error: 'Server misconfigured: service account JSON is invalid' });
  }

  try {
    const accessToken = await getWalletAccessToken(sa);
    // Class might not exist yet on first sync. Always ensure it.
    await ensureClass(accessToken, campaign as Campaign);
    const synced = await syncObject(accessToken, campaign as Campaign, card as Card);
    return json(200, { ok: true, synced });
  } catch (err) {
    console.error('Wallet sync error:', err);
    return json(500, { error: err instanceof Error ? err.message : 'Sync failed' });
  }
});
