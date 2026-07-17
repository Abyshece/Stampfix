// supabase/functions/generate-wallet-jwt/index.ts
//
// Generates a "Save to Google Wallet" URL for a customer's loyalty card.
//
// Required Supabase secrets (set via `supabase secrets set ...`):
//   GOOGLE_WALLET_ISSUER_ID         - e.g. "3388000000022xxxxxx"
//   GOOGLE_WALLET_SERVICE_ACCOUNT   - full service account JSON, as a string
//   PUBLIC_APP_ORIGIN               - e.g. "https://stampify.app" (for the pass origins field)
//
// Required headers:
//   Authorization: Bearer <supabase user JWT>
//
// Request body:
//   { cardId: string, campaignId: string }
//
// Response:
//   200 { saveUrl: string }
//   4xx { error: string }
//
// Notes:
// - We sign the Google Wallet JWT using RS256 with the service account's
//   private key. The Web Crypto API in Deno supports this natively.
// - We use the "skinny JWT" approach: we pre-create the LoyaltyClass and
//   LoyaltyObject via the Wallet REST API, then sign a JWT that just
//   references the object's ID. This keeps the JWT small and stable.

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

// ---------------------------------------------------------------------
// Config from environment
// ---------------------------------------------------------------------
const ISSUER_ID = Deno.env.get('GOOGLE_WALLET_ISSUER_ID');
const SERVICE_ACCOUNT_JSON = Deno.env.get('GOOGLE_WALLET_SERVICE_ACCOUNT');
const APP_ORIGIN = Deno.env.get('PUBLIC_APP_ORIGIN') ?? 'https://stampify.app';
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
// Base64url helpers
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

// Convert PEM-encoded PKCS#8 private key to a CryptoKey we can sign with.
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

// ---------------------------------------------------------------------
// Google Wallet API helpers
// ---------------------------------------------------------------------

interface ServiceAccount {
  client_email: string;
  private_key: string;
  private_key_id: string;
  token_uri: string;
}

// Exchange the service account for an OAuth access token for the Wallet API.
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
    const text = await res.text();
    throw new Error(`OAuth token exchange failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data.access_token;
}

interface Campaign {
  id: string;
  business_name: string;
  offer_title: string;
  primary_color: string;
  max_stamps: number;
  custom_icon: string;
}

interface Card {
  id: string;
  customer_name: string;
  email: string;
  current_stamps: number;
  rewards_redeemed: number;
  status: string;
}

const classIdFor = (campaignId: string) => `${ISSUER_ID}.stampify_${campaignId.replace(/-/g, '')}`;
const objectIdFor = (cardId: string) => `${ISSUER_ID}.card_${cardId.replace(/-/g, '')}`;

/** Build a LoyaltyClass payload for a campaign. */
function buildLoyaltyClass(campaign: Campaign) {
  return {
    id: classIdFor(campaign.id),
    issuerName: campaign.business_name,
    programName: campaign.business_name,
    programLogo: {
      sourceUri: {
        // Generic placeholder logo - replace with your hosted logo when ready
        uri: 'https://stampfix.app/wallet-assets/wallet-logo-v2.png',
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

/** Build a LoyaltyObject payload for a specific card. */
function buildLoyaltyObject(campaign: Campaign, card: Card) {
  const rewardReady = (card.current_stamps ?? 0) >= campaign.max_stamps;
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
      {
        id: 'offer',
        header: rewardReady ? 'Reward ready' : 'Current offer',
        body: rewardReady ? '🎉 Free reward unlocked — show this to redeem!' : campaign.offer_title,
      },
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

/** Idempotently upsert the class. PUTs the class; if 404 on PUT, POSTs it. */
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
    if (!postRes.ok) {
      throw new Error(`Failed to create class: ${postRes.status} ${await postRes.text()}`);
    }
    return;
  }
  throw new Error(`Failed to upsert class: ${putRes.status} ${await putRes.text()}`);
}

/** Idempotently upsert the object. Returns the object's full ID. */
async function ensureObject(accessToken: string, campaign: Campaign, card: Card): Promise<string> {
  const body = buildLoyaltyObject(campaign, card);
  const baseUrl = 'https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject';
  const putRes = await fetch(`${baseUrl}/${encodeURIComponent(body.id)}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (putRes.ok) return body.id;
  if (putRes.status === 404) {
    const postRes = await fetch(baseUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!postRes.ok) {
      throw new Error(`Failed to create object: ${postRes.status} ${await postRes.text()}`);
    }
    return body.id;
  }
  throw new Error(`Failed to upsert object: ${putRes.status} ${await putRes.text()}`);
}

/** Build & sign the "Save to Wallet" JWT (the skinny variant). */
async function buildSaveJwt(sa: ServiceAccount, objectId: string): Promise<string> {
  const key = await importServiceAccountKey(sa.private_key);
  return await signJwt(
    {
      iss: sa.client_email,
      aud: 'google',
      typ: 'savetowallet',
      iat: Math.floor(Date.now() / 1000),
      origins: [APP_ORIGIN],
      payload: {
        loyaltyObjects: [{ id: objectId }],
      },
    },
    key,
  );
}

// ---------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  // Config check — fail loudly with a useful message when not yet set up.
  if (!ISSUER_ID || !SERVICE_ACCOUNT_JSON) {
    return json(503, {
      error:
        'Google Wallet is not configured on the server yet. ' +
        'An administrator needs to set GOOGLE_WALLET_ISSUER_ID and GOOGLE_WALLET_SERVICE_ACCOUNT.',
    });
  }

  // Authenticate the caller — must be a logged-in user (customer or merchant).
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json(401, { error: 'Missing Authorization header' });
  }
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) return json(401, { error: 'Not authenticated' });

  let body: { cardId?: string; campaignId?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }
  if (!body.cardId || !body.campaignId) {
    return json(400, { error: 'cardId and campaignId are required' });
  }

  // Load card and campaign through the user's RLS context — this ensures
  // the user can only request a wallet pass for a card they're authorised
  // to see (either as the customer who owns it, or as the merchant who
  // runs the campaign).
  const { data: card, error: cardErr } = await userClient
    .from('cards')
    .select('id, customer_name, email, current_stamps, rewards_redeemed, status, campaign_id')
    .eq('id', body.cardId)
    .single();
  if (cardErr || !card) return json(404, { error: 'Card not found' });
  if (card.campaign_id !== body.campaignId) {
    return json(400, { error: 'Card does not belong to the given campaign' });
  }

  const { data: campaign, error: campaignErr } = await userClient
    .from('campaigns')
    .select('id, business_name, offer_title, primary_color, max_stamps, custom_icon')
    .eq('id', body.campaignId)
    .single();
  if (campaignErr || !campaign) return json(404, { error: 'Campaign not found' });

  // Parse the service account JSON.
  let sa: ServiceAccount;
  try {
    sa = JSON.parse(SERVICE_ACCOUNT_JSON);
  } catch {
    return json(500, { error: 'Server misconfigured: service account JSON is invalid' });
  }

  try {
    const accessToken = await getWalletAccessToken(sa);
    await ensureClass(accessToken, campaign as Campaign);
    const objectId = await ensureObject(accessToken, campaign as Campaign, card as Card);
    const jwt = await buildSaveJwt(sa, objectId);
    return json(200, { saveUrl: `https://pay.google.com/gp/v/save/${jwt}` });
  } catch (err) {
    console.error('Wallet generation error:', err);
    return json(500, {
      error: err instanceof Error ? err.message : 'Failed to generate wallet pass',
    });
  }
});
