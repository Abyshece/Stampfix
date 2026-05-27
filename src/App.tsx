import { useEffect, useState } from 'react';
import { ViewMode } from './types';
import { useAuth } from './lib/auth';
import { isSupabaseConfigured } from './lib/supabase';
import { LandingPage } from './components/LandingPage';
import { MerchantApp } from './components/MerchantApp';
import { CustomerApp } from './components/CustomerApp';
import { Loader2 } from 'lucide-react';

/**
 * Top-level routing logic:
 *
 *  - URL contains ?campaign=<id>  => customer flow (signup or wallet view)
 *  - User is logged in            => merchant dashboard
 *  - Otherwise                    => landing page
 *
 * Auth state changes (login/logout) automatically trigger re-render.
 */
export default function App() {
  const { user, loading } = useAuth();
  const [campaignFromUrl, setCampaignFromUrl] = useState<string | null>(null);
  const [forceLanding, setForceLanding] = useState(false);

  // Read ?campaign= once on mount. We don't reactively watch the URL after
  // that — the customer flow handles its own navigation internally.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const campaign = params.get('campaign');
    if (campaign) setCampaignFromUrl(campaign);
  }, []);

  if (!isSupabaseConfigured) {
    return <ConfigError />;
  }

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
          // Clean up the URL so refreshing won't re-trigger this branch.
          window.history.replaceState({}, '', window.location.pathname);
        }}
      />
    );
  }

  if (user && !forceLanding) {
    return <MerchantApp onLogout={() => setForceLanding(true)} />;
  }

  return (
    <LandingPage
      onEnterMerchantFlow={() => setForceLanding(false)}
      onSimulateCustomer={() => {
        // For "Try as customer" demo button on the landing page,
        // we'd need a campaign id. For now, pop a hint.
        alert(
          'To preview the customer flow, sign in as a merchant first, then use the "Share & Promote" tab to scan your own QR code.',
        );
      }}
      forceLandingMode={forceLanding}
      isAuthenticated={Boolean(user)}
      onResumeMerchant={() => setForceLanding(false)}
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
          The Supabase environment variables are not set. Create a{' '}
          <code className="bg-[#F7F7F5] px-1.5 py-0.5 rounded border notion-border text-xs">
            .env.local
          </code>{' '}
          file in the project root (copy from{' '}
          <code className="bg-[#F7F7F5] px-1.5 py-0.5 rounded border notion-border text-xs">
            .env.example
          </code>
          ) and fill in <code className="text-xs">VITE_SUPABASE_URL</code> and{' '}
          <code className="text-xs">VITE_SUPABASE_ANON_KEY</code>, then restart the dev server.
        </p>
      </div>
    </div>
  );
}
