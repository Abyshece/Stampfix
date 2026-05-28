import { useEffect, useState } from 'react';
import { useAuth, signOut } from './lib/auth';
import { isSupabaseConfigured } from './lib/supabase';
import { LandingPage } from './components/LandingPage';
import { MerchantApp } from './components/MerchantApp';
import { CustomerApp } from './components/CustomerApp';
import { EmailConfirmed } from './components/EmailConfirmed';
import { PrivacyPolicy } from './components/legal/PrivacyPolicy';
import { TermsOfService } from './components/legal/TermsOfService';

/**
 * Top-level routing.
 *
 * View precedence (first match wins):
 *  1. ?confirmed=1 in URL   -> EmailConfirmed success page (post email-verify)
 *  2. ?campaign=<id> in URL -> CustomerApp (customer signup/wallet)
 *  3. view === 'merchant'   -> MerchantApp (signup form or dashboard)
 *  4. otherwise             -> LandingPage
 */
type View = 'landing' | 'merchant';

export default function App() {
  const { user } = useAuth();
  const [campaignFromUrl, setCampaignFromUrl] = useState<string | null>(null);
  const [showConfirmed, setShowConfirmed] = useState(false);
  const [cameFromConfirmation, setCameFromConfirmation] = useState(false);
  const [view, setView] = useState<View>('landing');

  // Read URL params once on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('confirmed') === '1') {
      setShowConfirmed(true);
      return; // don't also process ?campaign on the same load
    }
    const campaign = params.get('campaign');
    if (campaign) setCampaignFromUrl(campaign);
  }, []);

  // If the user signs in, drop them on the merchant view — UNLESS we're
  // showing the post-confirmation success page, which deliberately wants
  // the user to click "Sign in" themselves.
  useEffect(() => {
    if (user && !showConfirmed) setView('merchant');
  }, [user, showConfirmed]);

  if (!isSupabaseConfigured) return <ConfigError />;

  // Static legal pages — public, no auth needed. Path-based (Vercel SPA
  // rewrites serve index.html for these, then we render the right page).
  const path = window.location.pathname;
  if (path === '/privacy') return <PrivacyPolicy />;
  if (path === '/terms') return <TermsOfService />;

  // 1) Post email-confirmation success screen.
  if (showConfirmed) {
    return (
      <EmailConfirmed
        onContinue={async () => {
          // The confirmation link auto-logs-in the user. Sign them out so
          // the "Sign in" button shows a real login form, matching the
          // chosen UX (confirmation is separate from signing in).
          try {
            await signOut();
          } catch {
            /* ignore */
          }
          // Clean the URL so a refresh doesn't re-trigger this screen.
          window.history.replaceState({}, '', window.location.pathname);
          setShowConfirmed(false);
          setCameFromConfirmation(true);
          setView('merchant'); // MerchantApp shows login form when signed out
        }}
      />
    );
  }

  // 2) Customer flow.
  if (campaignFromUrl) {
    return (
      <CustomerApp
        campaignId={campaignFromUrl}
        onExit={() => {
          setCampaignFromUrl(null);
          window.history.replaceState({}, '', window.location.pathname);
        }}
      />
    );
  }

  // 3) Merchant flow (login form if signed out, dashboard if signed in).
  if (view === 'merchant') {
    return <MerchantApp onLogout={() => setView('landing')} startOnLogin={cameFromConfirmation} />;
  }

  // 4) Landing.
  return (
    <LandingPage
      isAuthenticated={Boolean(user)}
      onEnterMerchantFlow={() => setView('merchant')}
      onResumeMerchant={() => setView('merchant')}
    />
  );
}

function ConfigError() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-8 text-[#37352F]">
      <div className="max-w-md space-y-4 text-center">
        <div className="text-4xl">⚙️</div>
        <h1 className="text-2xl font-serif-display font-semibold">Configuration needed</h1>
        <p className="text-gray-500 text-sm leading-relaxed">
          The Supabase environment variables are not set. In the deployment
          settings, add <code className="text-xs">VITE_SUPABASE_URL</code> and{' '}
          <code className="text-xs">VITE_SUPABASE_ANON_KEY</code>, then redeploy
          without using the build cache.
        </p>
      </div>
    </div>
  );
}
