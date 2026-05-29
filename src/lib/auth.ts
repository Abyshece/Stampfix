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
    loading: false,
  });

  useEffect(() => {
    let mounted = true;

    // Best-effort initial hydrate. If this hangs forever we don't care:
    // loading is already false, so the UI renders. The listener handles
    // any subsequent session changes.
    supabase.auth.getSession()
      .then(({ data }) => {
        if (!mounted || !data.session) return;
        setState({ session: data.session, user: data.session.user, loading: false });
      })
      .catch(() => { /* swallow */ });

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
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${window.location.origin}/?campaign=${campaignId}`,
      data: { role: 'customer' },
    },
  });
  if (error) throw error;
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
