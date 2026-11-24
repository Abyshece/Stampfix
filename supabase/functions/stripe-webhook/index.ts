// supabase/functions/stripe-webhook/index.ts
//
// Receives Stripe webhook events and updates merchant plan state.
// This is the authoritative source of truth for "is this merchant Pro" —
// the client never gets to make that call.
//
// Critical: every request is signature-verified against the webhook
// secret. Without verification, anyone who knows the URL could POST a
// fake event and trick us into upgrading them.
//
// Required secrets:
//   STRIPE_SECRET_KEY       - to construct the Stripe SDK client
//   STRIPE_WEBHOOK_SECRET   - signing secret from Stripe webhook setup
//
// Events handled:
//   checkout.session.completed     - subscription just started -> set pro
//   customer.subscription.updated  - status changes -> pro while active/trialing, else free
//   customer.subscription.deleted  - cancellation finalised -> set free
//   invoice.payment_failed         - recurring charge failed -> log only (Stripe retries)
//   invoice.paid                   - referrals: the invited shop's first payment rewards the invite
//   charge.refunded                - referrals: a refunded first payment cancels the invite
//
// Referral steps never change the plan and never fail the webhook: any
// problem is logged and the plan update above it still stands.
//
// Notes on idempotency:
//   Stripe may deliver the same event multiple times. Our updates are
//   idempotent (setting plan='pro' twice has the same effect as once).
//   We don't track delivered event IDs because the operations are safe.

import Stripe from 'https://esm.sh/stripe@17.4.0?target=denonext';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const STRIPE_SECRET = Deno.env.get('STRIPE_SECRET_KEY');
const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/** Asks referral-credit to put due referral months on Stripe. */
async function runReferralCredit(): Promise<void> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/referral-credit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(20000),
    });
    console.log(`[webhook] referral-credit -> ${res.status}`);
  } catch (e) {
    console.error('[webhook] referral-credit call failed:', e instanceof Error ? e.message : e);
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'stripe-signature, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  if (!STRIPE_SECRET || !WEBHOOK_SECRET) {
    console.error('[webhook] missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET');
    return new Response('Server not configured', { status: 503 });
  }

  const signature = req.headers.get('Stripe-Signature');
  if (!signature) {
    console.warn('[webhook] missing Stripe-Signature header');
    return new Response('Missing signature', { status: 400 });
  }

  const body = await req.text();
  const stripe = new Stripe(STRIPE_SECRET, {
    apiVersion: '2024-12-18.acacia',
    httpClient: Stripe.createFetchHttpClient(),
  });

  // Verify the signature. constructEventAsync is REQUIRED in Deno —
  // the sync version uses Node crypto APIs that don't exist here.
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      WEBHOOK_SECRET,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.warn(`[webhook] signature verification failed: ${msg}`);
    return new Response(`Webhook Error: ${msg}`, { status: 400 });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  console.log(`[webhook] processing ${event.type}`);

  try {
    switch (event.type) {
      // -------------------------------------------------------------
      // Initial subscription created via checkout.
      // Flip to 'pro' and remember the customer + subscription IDs.
      // -------------------------------------------------------------
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const merchantId = session.metadata?.merchant_id;
        if (!merchantId) {
          console.warn('[webhook] checkout.session.completed without merchant_id metadata');
          break;
        }
        if (session.payment_status !== 'paid' && session.status !== 'complete') {
          console.log(`[webhook] session ${session.id} not paid yet (status=${session.status}); skipping`);
          break;
        }
        const update = {
          plan: 'pro',
          stripe_customer_id: typeof session.customer === 'string' ? session.customer : null,
          stripe_subscription_id: typeof session.subscription === 'string' ? session.subscription : null,
          plan_started_at: new Date().toISOString(),
        };
        const { error } = await admin.from('merchants').update(update).eq('id', merchantId);
        if (error) console.error(`[webhook] failed to upgrade merchant ${merchantId}:`, error);
        else console.log(`[webhook] merchant ${merchantId} upgraded to pro`);
        // Referral months waiting for this shop's Stripe customer can go on now.
        if (!error) {
          try {
            const { data: due } = await admin.rpc('referral_rewards_due', { p_force: false });
            if (Array.isArray(due) && due.length > 0) await runReferralCredit();
          } catch (e) {
            console.error('[webhook] referral check failed:', e instanceof Error ? e.message : e);
          }
        }
        break;
      }

      // -------------------------------------------------------------
      // Subscription status changed.
      // 'past_due' / 'unpaid' / 'canceled' etc. revert the merchant to
      // free; 'active' / 'trialing' put them back on pro. This used to
      // only ever downgrade, so a renewal that failed once and then went
      // through on Stripe's retry left a paying merchant on free.
      // -------------------------------------------------------------
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const merchantId = sub.metadata?.merchant_id;
        if (!merchantId) {
          console.warn('[webhook] subscription.updated without merchant_id metadata');
          break;
        }
        // Events can arrive late or out of order, so act on the
        // subscription's current status, not the one in this event.
        const current = await stripe.subscriptions.retrieve(sub.id).catch(() => sub);
        // 'trialing' is active for our purposes; 'active' obviously is.
        const isActive = current.status === 'active' || current.status === 'trialing';
        const { error } = await admin
          .from('merchants')
          .update(isActive
            ? { plan: 'pro', stripe_subscription_id: current.id, stripe_subscription_status: current.status }
            : { plan: 'free', stripe_subscription_status: current.status })
          .eq('id', merchantId)
          // Ignore an old subscription's events once the merchant has a newer one.
          .or(`stripe_subscription_id.is.null,stripe_subscription_id.eq.${current.id}`);
        if (error) console.error(`[webhook] failed to update merchant ${merchantId}:`, error);
        else console.log(`[webhook] merchant ${merchantId} -> ${isActive ? 'pro' : 'free'} (sub status=${current.status})`);
        break;
      }

      // -------------------------------------------------------------
      // Subscription canceled / ended.
      // -------------------------------------------------------------
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const merchantId = sub.metadata?.merchant_id;
        if (!merchantId) {
          console.warn('[webhook] subscription.deleted without merchant_id metadata');
          break;
        }
        const { error } = await admin
          .from('merchants')
          .update({
            plan: 'free',
            stripe_subscription_id: null,
            stripe_subscription_status: sub.status,
            // Keep stripe_customer_id so we reuse it if they re-upgrade.
          })
          .eq('id', merchantId)
          // An old subscription ending must not downgrade a newer one.
          .or(`stripe_subscription_id.is.null,stripe_subscription_id.eq.${sub.id}`);
        if (error) console.error(`[webhook] failed to downgrade merchant ${merchantId}:`, error);
        else console.log(`[webhook] merchant ${merchantId} subscription deleted; downgraded`);
        break;
      }

      // -------------------------------------------------------------
      // Recurring payment failed.
      // Stripe retries automatically; we just log it for visibility.
      // If we wanted to email the merchant, this is the place.
      // -------------------------------------------------------------
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        console.warn(`[webhook] invoice payment_failed for customer ${invoice.customer}`);
        break;
      }

      // -------------------------------------------------------------
      // A payment went through. Referrals only: the first real payment
      // of an invited shop rewards the invite (or flags it for review).
      // -------------------------------------------------------------
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        try {
          if ((invoice.amount_paid ?? 0) <= 0) break;
          const customer = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id ?? null;
          let merchantId: string | null = invoice.subscription_details?.metadata?.merchant_id ?? null;
          if (!merchantId && customer) {
            const { data: m } = await admin.from('merchants').select('id').eq('stripe_customer_id', customer).maybeSingle();
            merchantId = (m as { id: string } | null)?.id ?? null;
          }
          if (!merchantId) break;
          // The card's fingerprint (not the card number), to spot one person paying for two shops.
          let fingerprint: string | null = null;
          const chargeId = typeof invoice.charge === 'string' ? invoice.charge : invoice.charge?.id ?? null;
          if (chargeId) {
            const charge = await stripe.charges.retrieve(chargeId).catch(() => null);
            fingerprint = charge?.payment_method_details?.card?.fingerprint ?? null;
          }
          const { data, error } = await admin.rpc('referral_invoice_paid', {
            p_merchant: merchantId, p_invoice: invoice.id, p_fingerprint: fingerprint,
          });
          if (error) console.error(`[webhook] referral_invoice_paid failed for ${merchantId}:`, error);
          else if ((data as { due?: boolean } | null)?.due) await runReferralCredit();
        } catch (e) {
          console.error('[webhook] referral step failed:', e instanceof Error ? e.message : e);
        }
        break;
      }

      // -------------------------------------------------------------
      // Money given back. Referrals only: if it was an invited shop's
      // first payment, the invite no longer counts.
      // -------------------------------------------------------------
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        const invoiceId = typeof charge.invoice === 'string' ? charge.invoice : charge.invoice?.id ?? null;
        if (invoiceId) {
          const { error } = await admin.rpc('referral_invoice_refunded', { p_invoice: invoiceId });
          if (error) console.error(`[webhook] referral_invoice_refunded failed for ${invoiceId}:`, error);
        }
        break;
      }

      default:
        // Unhandled events are normal — Stripe sends many event types.
        console.log(`[webhook] ignored event type ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    // Returning 200 here so Stripe doesn't retry forever on bugs that
    // would also fail on retry. We've already logged the error above.
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error(`[webhook] handler threw: ${msg}`);
    return new Response(JSON.stringify({ received: true, error: msg }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
