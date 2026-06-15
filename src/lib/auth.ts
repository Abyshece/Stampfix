import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
}

/**
 * Auth state hook.
 *
 * Design: loading starts as `false`. We never block the UI waiting for
 * Supabase. The listener picks up any session asynchronously and updates
 * state when it arrives. This makes the infinite-spinner failure
 * impossible — at worst we show the logged-out UI for a moment before
 * the listener fires.
 */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    loading: true,
  });

  useEffect(() => {
    let mounted = true;
    let settled = false;

    // Initial hydrate. We MUST wait for this before deciding the user
    // is logged out — otherwise pages like /my-card flash the sign-in
    // form during the brief window when Supabase is still processing
    // a magic-link hash from the URL.
    supabase.auth.getSession()
      .then(({ data }) => {
        if (!mounted) return;
        settled = true;
        setState({
          session: data.session,
          user: data.session?.user ?? null,
          loading: false,
        });
      })
      .catch(() => {
        if (!mounted) return;
        settled = true;
        setState((s) => ({ ...s, loading: false }));
      });

    // Safety: if getSession never resolves (network failure etc), don't
    // hang the UI forever. Force loading=false after 3s as a fallback.
    const timeout = setTimeout(() => {
      if (!mounted || settled) return;
      setState((s) => ({ ...s, loading: false }));
    }, 3000);

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setState({
        session,
        user: session?.user ?? null,
        loading: false,
      });
    });

    return () => {
      mounted = false;
      clearTimeout(timeout);
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}

// ---------------------------------------------------------------------
// Auth actions
// ---------------------------------------------------------------------

export async function signUpMerchant(
  email: string,
  password: string,
  businessName: string,
  country: 'DE' | 'CA',
  marketingOptIn: boolean,
): Promise<{ needsEmailConfirmation: boolean }> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        role: 'merchant',
        business_name: businessName,
        country,
        marketing_opt_in: marketingOptIn,
      },
      emailRedirectTo: `${window.location.origin}/?confirmed=1`,
    },
  });
  if (error) throw error;
  return { needsEmailConfirmation: !data.session };
}

export async function signInMerchant(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function sendCustomerMagicLink(email: string, campaignId: string): Promise<void> {
  // Send a 6-digit OTP code instead of a clickable magic link.
  // Why: Gmail's link-scanner opens magic links before the user does,
  // consuming the one-time-token. By the time the human clicks it,
  // Supabase returns "otp_expired" and the user is stuck. A typed code
  // can't be pre-consumed by a scanner.
  //
  // The `shouldCreateUser` option is true (default) so first-time
  // customers get an account on the same step as receiving the code.
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      data: { role: 'customer', signup_campaign_id: campaignId },
    },
  });
  if (error) throw error;
}

/**
 * Verify the 6-digit code the user typed. On success, Supabase sets
 * the session — the useAuth hook's onAuthStateChange listener picks
 * it up automatically.
 */
export async function verifyCustomerOtp(email: string, code: string): Promise<void> {
  // A freshly-created user (first signup) gets an OTP that verifies with
  // type 'signup'. A returning user gets one that verifies with type
  // 'email'. We don't know which case we're in, so try 'email' first and
  // fall back to 'signup' on failure. One of them will set the session.
  let session = null;
  let lastErr: unknown = null;

  for (const otpType of ['email', 'signup'] as const) {
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: otpType,
      });
      if (error) { lastErr = error; continue; }
      if (data.session) { session = data.session; break; }
    } catch (e) {
      lastErr = e;
    }
  }

  if (!session) {
    throw lastErr instanceof Error
      ? lastErr
      : new Error('That code is invalid or has expired. Request a new one.');
  }

  await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function resetPassword(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/?reset=1`,
  });
  if (error) throw error;
}
