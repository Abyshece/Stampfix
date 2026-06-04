// supabase/functions/create-checkout-session/index.ts
//
// Creates an embedded Stripe Checkout Session for the authenticated
// merchant. Embedded mode means the payment form renders inside an
// iframe on stampfix.app, not a redirect — branding stays consistent.
//
// Authoritative price selection lives server-side: the client says
// nothing about which plan or price to charge. The merchant's country
// (stored at signup) picks the right price ID. This prevents a
// malicious client from sending `?price=cheap_one` and getting Pro
// access for less than intended.
//
// Required secrets:
//   STRIPE_SECRET_KEY      - server-only Stripe key (sk_test_... or sk_live_...)
//   STRIPE_PRICE_ID_EUR    - price ID for the EUR €19.99/mo plan
//   STRIPE_PRICE_ID_CAD    - price ID for the CAD $28/mo plan
//   PUBLIC_APP_ORIGIN      - where to send the user after payment
//
// Request: no body required. Reads the merchant from the auth context.
//
// Response (200):
//   { clientSecret: string }
//
// Errors:
//   401 - not authenticated
//   404 - merchant record not found (shouldn't happen for a real user)
//   400 - no price configured for merchant's country
//   500 - Stripe call failed

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import Stripe from 'https://esm.sh/stripe@17.4.0?target=denonext';

const STRIPE_SECRET = Deno.env.get('STRIPE_SECRET_KEY');
const PRICE_EUR = Deno.env.get('STRIPE_PRICE_ID_EUR');
const PRICE_CAD = Deno.env.get('STRIPE_PRICE_ID_CAD');
const APP_ORIGIN = Deno.env.get('PUBLIC_APP_ORIGIN') ?? 'https://stampfix.app';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

  if (!STRIPE_SECRET) {
    console.error('[checkout] STRIPE_SECRET_KEY not set');
    return json(503, { error: 'Billing is not configured on the server' });
  }

  // Authenticate the calling merchant.
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json(401, { error: 'Not authenticated' });

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json(401, { error: 'Not authenticated' });

  // Read country + existing stripe customer id (if any). We use the
  // service-role client to bypass RLS — the merchant should always be
  // able to read their own row, but service-role avoids relying on that.
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  let { data: merchant, error: mErr } = await admin
    .from('merchants')
    .select('id, email, country, stripe_customer_id, plan')
    .eq('id', user.id)
    .maybeSingle();

  // SELF-HEAL: if the merchant row is missing but the auth user has
  // role=merchant, create the row on demand. This handles users who
  // signed up before the handle_new_user trigger existed, or for
  // whom the trigger failed silently. Without this, they get stuck
  // unable to upgrade and have to contact support.
  if (!mErr && !merchant) {
    const role = user.user_metadata?.role;
    if (role === 'merchant') {
      console.warn(`[checkout] auto-creating missing merchant row for ${user.id}`);
      const { data: created, error: createErr } = await admin
        .from('merchants')
        .insert({
          id: user.id,
          email: user.email ?? '',
          business_name: user.user_metadata?.business_name ?? '',
          country: user.user_metadata?.country ?? null,
        })
        .select('id, email, country, stripe_customer_id, plan')
        .single();
      if (createErr) {
        console.error('[checkout] auto-create failed:', createErr);
        return json(500, { error: 'Could not initialize merchant account. Please contact support.' });
      }
      merchant = created;
    }
  }

  if (mErr || !merchant) {
    console.error('[checkout] merchant fetch failed:', mErr);
    return json(404, { error: 'Merchant record not found' });
  }

  // Already on Pro? Don't let them double-subscribe.
  if (merchant.plan === 'pro') {
    return json(400, { error: 'Already on Pro plan' });
  }

  // Pick the right price for the country.
  const priceId = merchant.country === 'CA' ? PRICE_CAD
                : merchant.country === 'DE' ? PRICE_EUR
                : PRICE_EUR; // sensible default — fall back to EUR
  if (!priceId) {
    return json(400, { error: 'No price configured for your country. Please contact support.' });
  }

  const stripe = new Stripe(STRIPE_SECRET, {
    apiVersion: '2024-12-18.acacia',
    httpClient: Stripe.createFetchHttpClient(),
  });

  try {
    const session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded',
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      // Reuse Stripe customer if we already have one for this merchant,
      // otherwise create a new one tied to their email.
      ...(merchant.stripe_customer_id
        ? { customer: merchant.stripe_customer_id }
        : { customer_email: merchant.email }),
      // Merchant ID embedded as Stripe metadata. The webhook reads this
      // back to know which merchant just paid. Both at session AND
      // subscription level so events that reference either still work.
      metadata: { merchant_id: merchant.id },
      subscription_data: {
        metadata: { merchant_id: merchant.id },
      },
      // After payment, redirect (within the embedded iframe) back to
      // a confirmation page. CHECKOUT_SESSION_ID is replaced by Stripe.
      return_url: `${APP_ORIGIN}/?upgraded=1&session_id={CHECKOUT_SESSION_ID}`,
      // Don't auto-charge tax for now — we'll add Stripe Tax later when
      // the BC entity is registered and tax IDs are configured.
      automatic_tax: { enabled: false },
      // Allow promotion codes for early-customer discounts.
      allow_promotion_codes: true,
    });

    return json(200, { clientSecret: session.client_secret });
  } catch (err) {
    console.error('[checkout] Stripe error:', err);
    const message = err instanceof Error ? err.message : 'Unknown Stripe error';
    return json(500, { error: `Could not create checkout session: ${message}` });
  }
});
