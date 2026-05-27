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
