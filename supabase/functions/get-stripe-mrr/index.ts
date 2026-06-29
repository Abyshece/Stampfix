// supabase/functions/get-stripe-mrr/index.ts
//
// Returns the EXACT current MRR straight from Stripe: the sum of every active
// and trialing subscription, normalised to a monthly figure (cents), with any
// subscription-level coupon applied. Also returns the active-subscription count.
//
// This is the revenue source of truth. Comped merchants (plan = 'pro' with no
// Stripe subscription) and discounts are naturally excluded here, unlike the
// plan-based per-merchant estimate shown in the admin table.
//
// Admin-only: reuses the same is_platform_admin() RPC the app uses.
//
// Secrets: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_ANON_KEY
// Deploy:  supabase functions deploy get-stripe-mrr

import Stripe from 'https://esm.sh/stripe@17.4.0?target=denonext';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const STRIPE_SECRET = Deno.env.get('STRIPE_SECRET_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Normalise one subscription item's amount to a monthly figure (cents).
function monthlyCents(unitAmount: number, quantity: number, interval: string, intervalCount: number): number {
  const amount = unitAmount * quantity;
  const ic = intervalCount || 1;
  if (interval === 'year') return amount / (12 * ic);
  if (interval === 'week') return (amount * 52) / 12 / ic;
  if (interval === 'day') return (amount * 365) / 12 / ic;
  return amount / ic; // month
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    if (!STRIPE_SECRET) return json({ error: 'Stripe not configured' }, 500);

    // --- Admin auth: same is_platform_admin() RPC the app calls. ---
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Not authenticated' }, 401);
    const { data: isAdmin } = await userClient.rpc('is_platform_admin');
    if (isAdmin !== true) return json({ error: 'Forbidden' }, 403);

    const stripe = new Stripe(STRIPE_SECRET, { apiVersion: '2024-12-18.acacia' });

    let mrr = 0;
    let count = 0;
    let currency = 'cad';

    for (const status of ['active', 'trialing'] as const) {
      let startingAfter: string | undefined;
      // Paginate through every subscription of this status (100 = Stripe max).
      // deno-lint-ignore no-constant-condition
      while (true) {
        const page = await stripe.subscriptions.list({ status, limit: 100, starting_after: startingAfter });
        for (const sub of page.data) {
          let subTotal = 0;
          for (const item of sub.items.data) {
            const price = item.price;
            subTotal += monthlyCents(
              price.unit_amount ?? 0,
              item.quantity ?? 1,
              price.recurring?.interval ?? 'month',
              price.recurring?.interval_count ?? 1,
            );
            currency = price.currency ?? currency;
          }
          // Apply a subscription-level coupon so the number matches what Stripe
          // actually charges (handles any discounts).
          const coupon = sub.discount?.coupon;
          if (coupon?.percent_off) subTotal *= 1 - coupon.percent_off / 100;
          else if (coupon?.amount_off) subTotal = Math.max(0, subTotal - coupon.amount_off);

          mrr += subTotal;
          count++;
        }
        if (!page.has_more) break;
        startingAfter = page.data[page.data.length - 1]?.id;
      }
    }

    return json({ mrr_cents: Math.round(mrr), currency, active_subscriptions: count });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
