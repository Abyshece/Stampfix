import { supabase } from '../lib/supabase';

/**
 * Starts an embedded Stripe Checkout session and returns the client
 * secret needed by Stripe.js to render the form.
 *
 * Throws on any failure so the caller can surface a clear error in the
 * UI — silent failures here are worse than a noisy one (the merchant
 * thinks they're paying but nothing happens).
 */
export async function createCheckoutSession(): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ clientSecret: string }>(
    'create-checkout-session',
    { body: {} },
  );
  if (error) {
    // Try to extract the server's error message from the response body
    // so we don't surface "Edge Function returned a non-2xx response."
    let serverMessage: string | undefined;
    try {
      const ctx = (error as unknown as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json();
        serverMessage = body?.error;
      }
    } catch { /* ignore */ }
    throw new Error(serverMessage || error.message || 'Could not start checkout');
  }
  if (!data?.clientSecret) throw new Error('Server returned no client secret');
  return data.clientSecret;
}

/**
 * Opens the Stripe-hosted customer portal in a new tab. Used by Pro
 * merchants to cancel, update card, or view invoices.
 */
export async function openBillingPortal(): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ url: string }>(
    'open-billing-portal',
    { body: {} },
  );
  if (error) {
    let serverMessage: string | undefined;
    try {
      const ctx = (error as unknown as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json();
        serverMessage = body?.error;
      }
    } catch { /* ignore */ }
    throw new Error(serverMessage || error.message || 'Could not open billing portal');
  }
  if (!data?.url) throw new Error('Server returned no portal URL');
  window.location.href = data.url;
}
