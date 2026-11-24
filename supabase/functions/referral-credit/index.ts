// supabase/functions/referral-credit/index.ts
//
// Puts referral months on Stripe: for every pending reward whose shop has a
// Stripe customer, adds a credit of one month's Pro price (the shop's own
// price: CAD for Canada, EUR otherwise, as in create-checkout-session).
// Stripe uses the credit on the shop's next bill.
//
// Called by stripe-webhook after a payment (with the service role key), and
// by an admin from Admin > Referrals ("Credit now", which also retries ones
// that failed 3 times).
//
//   POST { force?: boolean }  ->  { credited, failed: [{ id, error }] }
//
// Secrets: STRIPE_SECRET_KEY, STRIPE_PRICE_ID_EUR, STRIPE_PRICE_ID_CAD,
//          SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// Deploy:  supabase functions deploy referral-credit --no-verify-jwt
//          (it checks the caller itself)

import Stripe from 'https://esm.sh/stripe@17.4.0?target=denonext';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const STRIPE_SECRET = Deno.env.get('STRIPE_SECRET_KEY');
const PRICE_EUR = Deno.env.get('STRIPE_PRICE_ID_EUR');
const PRICE_CAD = Deno.env.get('STRIPE_PRICE_ID_CAD');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

interface Due { id: string; merchant_id: string; role: 'referrer' | 'referred'; customer: string; country: string | null; other_name: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  const auth = req.headers.get('Authorization') ?? '';
  const body = await req.json().catch(() => ({}));
  let force = false;
  if (!sameSecret(auth, `Bearer ${SERVICE_ROLE}`)) {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: isAdmin } = await userClient.rpc('is_platform_admin');
    if (isAdmin !== true) return json({ error: 'Forbidden' }, 403);
    force = body?.force === true;
  }
  if (!STRIPE_SECRET) return json({ error: 'STRIPE_SECRET_KEY not set' }, 500);

  const db = createClient(SUPABASE_URL, SERVICE_ROLE);
  const stripe = new Stripe(STRIPE_SECRET, { apiVersion: '2024-12-18.acacia', httpClient: Stripe.createFetchHttpClient() });

  const { data, error } = await db.rpc('referral_rewards_due', { p_force: force });
  if (error) return json({ error: error.message }, 500);
  const due = (data ?? []) as Due[];

  const prices = new Map<string, { amount: number; currency: string }>();
  const priceFor = async (country: string | null) => {
    const id = country === 'CA' ? PRICE_CAD : PRICE_EUR;
    if (!id) throw new Error(`No Stripe price set for ${country === 'CA' ? 'CAD' : 'EUR'}`);
    if (!prices.has(id)) {
      const p = await stripe.prices.retrieve(id);
      if (!p.unit_amount || p.unit_amount <= 0) throw new Error(`Price ${id} has no amount`);
      prices.set(id, { amount: p.unit_amount, currency: p.currency });
    }
    return prices.get(id)!;
  };

  let credited = 0;
  const failed: Array<{ id: string; error: string }> = [];
  for (const r of due) {
    try {
      const price = await priceFor(r.country);
      // Already on Stripe (a run that stopped before saving it)? Then just save it.
      const existing = await stripe.customers.listBalanceTransactions(r.customer, { limit: 100 });
      let txn = existing.data.find((t) => t.metadata?.referral_reward_id === r.id);
      if (!txn) {
        txn = await stripe.customers.createBalanceTransaction(r.customer, {
          amount: -price.amount,
          currency: price.currency,
          description: r.role === 'referrer'
            ? `Referral: 1 free month for inviting ${r.other_name}`
            : `Referral: 1 free month (invited by ${r.other_name})`,
          metadata: { referral_reward_id: r.id, merchant_id: r.merchant_id },
        }, { idempotencyKey: `referral-reward-${r.id}` });
      }
      await db.rpc('referral_reward_done', {
        p_id: r.id, p_txn: txn.id, p_amount: -txn.amount, p_currency: txn.currency, p_error: null,
      });
      credited++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[referral-credit] reward ${r.id} failed: ${msg}`);
      await db.rpc('referral_reward_done', { p_id: r.id, p_txn: null, p_amount: null, p_currency: null, p_error: msg });
      failed.push({ id: r.id, error: msg });
    }
  }
  console.log(`[referral-credit] credited ${credited}, failed ${failed.length}`);
  return json({ credited, failed });
});
