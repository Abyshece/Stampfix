import { useEffect, useState } from 'react';
import { useAuth } from './lib/auth';
import { isSupabaseConfigured } from './lib/supabase';
import { LandingPage } from './components/LandingPage';
import { MerchantApp } from './components/MerchantApp';
import { CustomerApp } from './components/CustomerApp';
import { Loader2 } from 'lucide-react';

/**
 * Top-level routing.
 *
 * View precedence (first match wins):
 *  1. ?campaign=<id> in URL          -> CustomerApp (customer signup/wallet)
 *  2. signed-in user, not on landing -> MerchantApp (signup or dashboard)
 *  3. explicit "go to merchant flow" -> MerchantApp (signup form for new users)
 *  4. otherwise                      -> LandingPage
 *
 * `view` is the explicit user intent; auth state determines which screen
 * inside MerchantApp shows (onboarding vs dashboard).
 */
type View = 'landing' | 'merchant';

export default function App() {
  const { user, loading } = useAuth();
  const [campaignFromUrl, setCampaignFromUrl] = useState<string | null>(null);
  const [view, setView] = useState<View>('landing');

  // Read ?campaign= once on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const campaign = params.get('campaign');
    if (campaign) setCampaignFromUrl(campaign);
  }, []);

  // If the user signs in (from anywhere), drop them on the merchant view.
  // This also handles the case where they click an email-confirmation link
  // and land here authenticated.
  useEffect(() => {
    if (user) setView('merchant');
  }, [user]);

  if (!isSupabaseConfigured) return <ConfigError />;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

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

  if (view === 'merchant') {
    return <MerchantApp onLogout={() => setView('landing')} />;
  }

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
