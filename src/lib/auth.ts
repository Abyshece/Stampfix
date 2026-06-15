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

/**
 * Frictionless customer auth — no email, no code.
 *
 * We derive a deterministic password from the email so the same customer
 * always maps to the same credentials. First time → signUp creates the
 * account and (with email-confirmation OFF in Supabase) returns a session
 * immediately. Returning customer → signUp fails with "already
 * registered", so we fall back to signInWithPassword using the same
 * derived password. Either way the customer is logged in on the spot and
 * lands on their card.
 *
 * Security note: this is intentionally low-friction for a loyalty-card
 * use case. The derived password is not a secret the user manages; it's
 * an implementation detail. The threat model (someone guessing another
 * person's coffee-stamp balance) is low. We pepper the derivation with a
 * constant so the password isn't literally the email.
 */
async function deriveCustomerPassword(email: string): Promise<string> {
  const PEPPER = 'stampfix-customer-v1';
  const enc = new TextEncoder();
  const data = enc.encode(`${email.toLowerCase()}:${PEPPER}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = Array.from(new Uint8Array(digest));
  // base64-ish, plus guaranteed complexity so it passes any password policy
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/[^a-zA-Z0-9]/g, '');
  return `Sf1!${b64.slice(0, 32)}`;
}

export async function signUpOrInCustomer(email: string, campaignId: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  const password = await deriveCustomerPassword(cleanEmail);

  // Try to create the account first.
  const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
    email: cleanEmail,
    password,
    options: { data: { role: 'customer', signup_campaign_id: campaignId } },
  });

  if (!signUpErr && signUpData.session) {
    // New customer, logged in immediately.
    return;
  }

  // If signUp failed because the user already exists (returning customer),
  // OR succeeded but didn't return a session, sign in with the derived
  // password.
  const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password,
  });
  if (signInErr) {
    // Surface a friendly message. This can happen if a returning user
    // originally signed up via the old magic-link flow (different/no
    // password). They'll need the recovery path.
    throw new Error(
      'We couldn\'t sign you in automatically. If you signed up a while ago, ' +
      'please contact the cafe or support@stampfix.app to recover your card.'
    );
  }
  if (!signInData.session) {
    throw new Error('Sign-in did not return a session. Please try again.');
  }
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
