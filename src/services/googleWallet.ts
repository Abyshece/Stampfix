import { supabase } from '../lib/supabase';
import type { Campaign, UserCard } from '../types';

/**
 * Request a signed "Save to Google Wallet" link from the Edge Function.
 *
 * The function returns a URL of the form:
 *   https://pay.google.com/gp/v/save/<JWT>
 *
 * Tapping it on Android opens Google Wallet and offers to save the pass.
 * If the Wallet API isn't configured yet on the server, the function
 * returns 503 and we surface a friendly error.
 */
export async function getSaveToWalletUrl(card: UserCard, campaign: Campaign): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ saveUrl: string }>(
    'generate-wallet-jwt',
    {
      body: { cardId: card.id, campaignId: campaign.id },
    },
  );

  if (error) {
    // supabase-js wraps non-2xx into FunctionsHttpError. Try to read the JSON
    // body off the underlying Response (`context`) for a friendlier message.
    let serverMessage: string | undefined;
    try {
      const ctx = (error as unknown as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json();
        serverMessage = body?.error;
      }
    } catch {
      // Body not JSON or already consumed — fall through to error.message.
    }
    throw new Error(serverMessage || error.message || 'Wallet service unavailable');
  }
  if (!data?.saveUrl) {
    throw new Error('Wallet service returned no URL');
  }
  return data.saveUrl;
}

/**
 * Push the current card state to Google Wallet so any already-saved pass
 * reflects the new stamp count / status.
 *
 * This is fire-and-forget by design — called after every stamp, redeem,
 * block, etc. We never want a wallet sync failure to make the underlying
 * stamp action *look* broken to the merchant. The function returns void
 * and logs any errors to the console instead of throwing.
 *
 * If the customer has never saved their pass, the Edge Function will
 * return `synced: false` (the LoyaltyObject doesn't exist yet) — which is
 * fine, the next "Save to Wallet" tap will create it with the right state.
 *
 * If Google Wallet isn't configured on the server yet, the function
 * returns `synced: false` with reason `wallet_not_configured`. Again fine.
 */
export async function syncWalletObject(cardId: string): Promise<void> {
  // Refresh BOTH of the customer's saved passes whenever their card changes
  // (stamp / redeem / block). Google: patch the loyalty object. Apple: send a
  // background push — which also bumps passkit_last_updated, so manual
  // pull-to-refresh works too. Both run in parallel and are best-effort; a
  // wallet hiccup must never block the merchant action. Callers fire this
  // without awaiting, so wallet latency never holds up the UI.
  await Promise.all([
    supabase.functions
      .invoke('sync-wallet-object', { body: { cardId } })
      .then(({ error }) => {
        // eslint-disable-next-line no-console
        if (error) console.warn('[wallet-sync] google failed:', error.message);
      })
      .catch((e) => {
        // eslint-disable-next-line no-console
        console.warn('[wallet-sync] google threw:', e);
      }),
    supabase.functions
      .invoke('push-apple-update', { body: { cardId } })
      .then(({ error }) => {
        // eslint-disable-next-line no-console
        if (error) console.warn('[wallet-sync] apple failed:', error.message);
      })
      .catch((e) => {
        // eslint-disable-next-line no-console
        console.warn('[wallet-sync] apple threw:', e);
      }),
  ]);
}
