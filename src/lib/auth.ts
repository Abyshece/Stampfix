import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    loading: true,
  });

  useEffect(() => {
    let mounted = true;

    // Safety net: if getSession() hangs (network issue, misconfigured URL,
    // browser blocking storage access), don't leave the app stuck on a
    // spinner forever. After 5s, proceed as if there's no session and let
    // the user try to sign in.
    const timeout = setTimeout(() => {
      if (!mounted) return;
      // eslint-disable-next-line no-console
      console.warn('[auth] getSession timed out after 5s; proceeding without session');
      setState((s) => (s.loading ? { session: null, user: null, loading: false } : s));
    }, 5000);

    // Hydrate from any existing session
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!mounted) return;
        clearTimeout(timeout);
        if (error) {
          // eslint-disable-next-line no-console
          console.error('[auth] getSession error:', error);
        }
        setState({
          session: data.session,
          user: data.session?.user ?? null,
          loading: false,
        });
      })
      .catch((err) => {
        if (!mounted) return;
        clearTimeout(timeout);
        // eslint-disable-next-line no-console
        console.error('[auth] getSession threw:', err);
        setState({ session: null, user: null, loading: false });
      });

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
): Promise<{ needsEmailConfirmation: boolean }> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        role: 'merchant',
        business_name: businessName,
      },
      emailRedirectTo: `${window.location.origin}/?confirmed=1`,
    },
  });
  if (error) throw error;
  // If session is null, email confirmation is required
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
      // After clicking the link, the user lands back here and we know which
      // campaign they were joining via the URL hash.
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
