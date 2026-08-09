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

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      setState((prev) => {
        const nextUser = session?.user ?? null;
        // On a token refresh / re-fired SIGNED_IN (both happen when the tab
        // regains focus), the signed-in user hasn't actually changed. Keep the
        // SAME user object reference so effects keyed on `user` don't re-run and
        // flash the loading screen — i.e. a quiet background refresh. Other
        // events (real sign-in/out, USER_UPDATED) update normally.
        const keepRef =
          (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') &&
          !!prev.user && !!nextUser && prev.user.id === nextUser.id;
        return {
          session,
          user: keepRef ? prev.user : nextUser,
          loading: false,
        };
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
  country: string,
  marketingOptIn: boolean,
  phone?: string,
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
        phone: phone?.trim() || null,
        // Audit record of the Terms / Privacy / DPA acceptance that the signup
        // form requires before this function is ever reached.
        terms_accepted_at: new Date().toISOString(),
        accepted_documents: ['terms', 'privacy', 'dpa'],
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

export async function signUpOrInCustomer(email: string, campaignId: string, phone?: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  const password = await deriveCustomerPassword(cleanEmail);

  // Try to create the account first.
  const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
    email: cleanEmail,
    password,
    options: { data: { role: 'customer', signup_campaign_id: campaignId, phone: phone?.trim() || null } },
  });

  if (!signUpErr && signUpData.session) {
    return; // New customer, logged in immediately.
  }

  // Log the signup error so we can diagnose (visible in console).
  if (signUpErr) {
    console.warn('[auth] signUp failed:', signUpErr.status, signUpErr.message);
  }

  // signUp didn't give us a session. Two cases:
  //  (a) user already exists → try signing in with the derived password
  //  (b) signUp succeeded but email-confirmation is somehow still on →
  //      also try signing in
  const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password,
  });

  if (!signInErr && signInData.session) {
    return; // Returning customer (or just-created), logged in.
  }

  if (signInErr) {
    console.warn('[auth] signIn failed:', signInErr.status, signInErr.message);
  }

  // Both failed. Give a precise error depending on what we saw.
  if (signUpErr?.message?.toLowerCase().includes('already registered') ||
      signUpErr?.status === 422) {
    throw new Error(
      'This email is already registered but we couldn\'t sign you in. ' +
      'It may have been created with a different sign-in method. ' +
      'Please contact support@stampfix.app to recover your card.'
    );
  }

  // Surface the actual underlying error so it's not a silent failure.
  const detail = signUpErr?.message || signInErr?.message || 'Unknown error';
  throw new Error(`Could not sign you in: ${detail}`);
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

/**
 * Google OAuth sign-in / sign-up. Works for both: OAuth signs the user in if
 * they exist, or creates the auth user if new. New users are provisioned a
 * merchant row by the handle_new_user DB trigger (google provider branch);
 * they then land on the onboarding form to create their first campaign.
 */
export async function signInWithGoogle(): Promise<void> {
  // Intent flag: survives the external redirect so a brand-new Google user
  // gets a merchant row provisioned on return (returning merchants have one).
  try { localStorage.setItem('sf_google_merchant', '1'); } catch { /* ignore */ }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/?signup=1` },
  });
  if (error) throw error;
}
