// supabase/functions/open-billing-portal/index.ts
//
// Returns a Stripe-hosted billing portal URL for the authenticated
// merchant. From the portal they can cancel, update their card, view
// invoices, etc. Stripe handles all of that UI — we just give them
// a one-time signed link to it.
//
// Required secrets:
//   STRIPE_SECRET_KEY     - server-only Stripe key
//   PUBLIC_APP_ORIGIN     - where to send them back when they're done

import Stripe from 'https://esm.sh/stripe@17.4.0?target=denonext';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const STRIPE_SECRET = Deno.env.get('STRIPE_SECRET_KEY');
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
    return json(503, { error: 'Billing is not configured on the server' });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json(401, { error: 'Not authenticated' });

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json(401, { error: 'Not authenticated' });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: merchant, error } = await admin
    .from('merchants')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .maybeSingle();
  if (error || !merchant?.stripe_customer_id) {
    return json(400, { error: 'No billing account on file. Upgrade first to manage billing.' });
  }

  const stripe = new Stripe(STRIPE_SECRET, {
    apiVersion: '2024-12-18.acacia',
    httpClient: Stripe.createFetchHttpClient(),
  });

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: merchant.stripe_customer_id,
      return_url: `${APP_ORIGIN}/`,
    });
    return json(200, { url: session.url });
  } catch (err) {
    console.error('[billing-portal] Stripe error:', err);
    const message = err instanceof Error ? err.message : 'Unknown Stripe error';
    return json(500, { error: message });
  }
});
