import { supabase } from '../lib/supabase';

/**
 * Send a Turnstile token to the server for verification.
 *
 * Returns true if accepted (or if we're in dev-bypass mode); false if
 * Cloudflare actively rejected the token. Always treats network errors
 * as "ok" so a flaky connection doesn't lock legitimate users out — we
 * trust Cloudflare to do its job over the long run, not on every single
 * request.
 */
export async function verifyTurnstile(token: string): Promise<boolean> {
  // Sentinel from the dev-bypass / failed-script-load paths in the
  // Turnstile component. The edge function would reject these, so
  // short-circuit and let the signup proceed. Real production traffic
  // never sends these values.
  if (
    token === 'dev-bypass-token' ||
    token === 'script-load-failed' ||
    token === 'turnstile-timeout'
  ) {
    return true;
  }

  try {
    const { data, error } = await supabase.functions.invoke<{ ok: boolean; reason?: string }>(
      'verify-turnstile',
      { body: { token } },
    );
    if (error) {
      console.warn('[turnstile] verify call failed:', error);
      return true; // fail open
    }
    return data?.ok === true;
  } catch (err) {
    console.warn('[turnstile] verify threw:', err);
    return true; // fail open
  }
}
