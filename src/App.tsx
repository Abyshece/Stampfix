import { useEffect, useState, lazy, Suspense } from 'react';
import { useAuth, signOut } from './lib/auth';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import { LandingPage } from './components/LandingPage';
const MerchantApp = lazy(() => import('./components/MerchantApp').then((m) => ({ default: m.MerchantApp })));
import { CustomerApp } from './components/CustomerApp';
import { EmailConfirmed } from './components/EmailConfirmed';
import { PrivacyPolicy } from './components/legal/PrivacyPolicy';
import { TermsOfService } from './components/legal/TermsOfService';
import { DataProcessingAgreement } from './components/legal/DataProcessingAgreement';
import { Impressum } from './components/legal/Impressum';
import { Subprocessors } from './components/legal/Subprocessors';
import { CardholderPrivacy } from './components/legal/CardholderPrivacy';
import { CookiePolicy } from './components/legal/CookiePolicy';
import { AccessibilityStatement } from './components/legal/AccessibilityStatement';
import { Unsubscribe } from './components/Unsubscribe';
import { Faq } from './components/Faq';
import { AppleWalletGuide } from './components/AppleWalletGuide';
const AboutPage = lazy(() => import('./components/marketing/AboutPage').then((m) => ({ default: m.AboutPage })));
const FeaturesPage = lazy(() => import('./components/marketing/FeaturesPage').then((m) => ({ default: m.FeaturesPage })));
const PricingPage = lazy(() => import('./components/marketing/PricingPage').then((m) => ({ default: m.PricingPage })));
const UseCasesPage = lazy(() => import('./components/marketing/UseCasesPage').then((m) => ({ default: m.UseCasesPage })));
const BlogPage = lazy(() => import('./components/marketing/BlogPage').then((m) => ({ default: m.BlogPage })));
const PaybackCalculatorPage = lazy(() => import('./components/marketing/PaybackCalculatorPage').then((m) => ({ default: m.PaybackCalculatorPage })));
const CardRecovery = lazy(() => import('./components/CardRecovery').then((m) => ({ default: m.CardRecovery })));
import { MyCardPage } from './components/MyCardPage';
const AdminPanel = lazy(() => import('./components/AdminPanel').then((m) => ({ default: m.AdminPanel })));
import { BrandLoading } from './components/BrandLoading';

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

/** Merchant dashboard pages that open the merchant flow on a deep link / refresh. */
const MERCHANT_PATHS = ['/scan', '/customers', '/activity', '/insights', '/payback', '/staff', '/preview-card', '/settings', '/promote', '/help'];

export default function App() {
  const { user, loading: authLoading } = useAuth();
  const [campaignFromUrl, setCampaignFromUrl] = useState<string | null>(null);
  const [locationFromUrl, setLocationFromUrl] = useState<string | null>(null);
  const [showConfirmed, setShowConfirmed] = useState(false);
  const [showUpgraded, setShowUpgraded] = useState(false);
  const [cameFromConfirmation, setCameFromConfirmation] = useState(false);
  const [view, setView] = useState<View>(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('signup') === '1') return 'merchant';
    const path = window.location.pathname;
    return MERCHANT_PATHS.some((mp) => path === mp || path.startsWith(mp + '/')) ? 'merchant' : 'landing';
  });
  const [enterOnLogin] = useState<boolean>(
    () => new URLSearchParams(window.location.search).get('login') === '1',
  );

  // Read URL params once on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('confirmed') === '1') {
      setShowConfirmed(true);
      return; // don't also process ?campaign on the same load
    }
    if (params.get('upgraded') === '1') {
      setShowUpgraded(true);
      // Clean the URL so refresh doesn't re-trigger the toast.
      window.history.replaceState({}, '', window.location.pathname);
      // Auto-dismiss the toast after 6 seconds.
      const t = setTimeout(() => setShowUpgraded(false), 6000);
      return () => clearTimeout(t);
    }
    if (params.get('signup') === '1' || params.get('login') === '1') {
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }
    const campaign = params.get('campaign');
    if (campaign) setCampaignFromUrl(campaign);
    const location = params.get('location');
    if (location) setLocationFromUrl(location);
  }, []);

  // If the user signs in, drop them on the merchant view — UNLESS we're
  // showing the post-confirmation success page, which deliberately wants
  // the user to click "Sign in" themselves.
  //
  // Also guard against the "ghost session" case: an auth.users row that
  // no longer has a matching merchants row (e.g. account deleted by SQL).
  // We detect that, sign the orphan session out, and stay on landing so
  // the button correctly shows "Log in" instead of "Go to dashboard".
  const [orphanCheckDone, setOrphanCheckDone] = useState(false);
  // True only after we've confirmed the auth user has a real, non-deleted
  // merchants row. Customers (signed in via /my-card) and orphaned sessions
  // are both `false`. The "Go to dashboard" button gates on this flag so
  // a customer never sees an incorrect "Go to dashboard" CTA that would
  // dump them into the merchant signup flow.
  const [hasMerchantRow, setHasMerchantRow] = useState(false);
  useEffect(() => {
    if (!user) { setOrphanCheckDone(true); setHasMerchantRow(false); return; }

    // Customers must NOT go through the merchant orphan check. A customer
    // legitimately has no merchant row — that's expected, not an orphan.
    // Detect customers two ways: (1) they signed up with role='customer'
    // in their auth metadata, or (2) we're currently in the customer flow
    // (a ?campaign= URL or the /my-card page). In either case, skip
    // straight through without touching the merchants table or signing
    // them out.
    const meta = (user as { user_metadata?: Record<string, unknown> }).user_metadata ?? {};
    const isCustomer = meta.role === 'customer' || Boolean(campaignFromUrl)
      || window.location.pathname === '/my-card';
    if (isCustomer) {
      setHasMerchantRow(false);
      setOrphanCheckDone(true);
      return;
    }

    (async () => {
      const { data } = await supabase
        .from('merchants')
        .select('id, status')
        .eq('id', user.id)
        .maybeSingle();

      if (data && data.status !== 'deleted') {
        // Healthy merchant row — proceed.
        setHasMerchantRow(true);
        setOrphanCheckDone(true);
        return;
      }

      // No merchant row (or soft-deleted). Brand-new merchant signup whose
      // trigger silently failed → heal from auth metadata. (Customers were
      // already handled and returned above.)
      let googleMerchant = false;
      try { googleMerchant = localStorage.getItem('sf_google_merchant') === '1'; } catch { /* ignore */ }
      const isMerchantSignup = meta.role === 'merchant' || googleMerchant;

      if (isMerchantSignup && (!data || data.status !== 'deleted')) {
        const businessName = (typeof meta.business_name === 'string' && meta.business_name)
          || (typeof meta.full_name === 'string' && meta.full_name)
          || (typeof meta.name === 'string' && meta.name)
          || 'My business';
        const country = (typeof meta.country === 'string' ? meta.country : null);
        const { error: insertErr } = await supabase
          .from('merchants')
          .insert({
            id: user.id,
            email: user.email ?? '',
            business_name: businessName,
            country,
          });
        if (!insertErr) {
          try { localStorage.removeItem('sf_google_merchant'); } catch { /* ignore */ }
          setHasMerchantRow(true);
          setOrphanCheckDone(true);
          return;
        }
        console.warn('[orphan-check] failed to heal merchant row:', insertErr);
      }

      // Heal failed → sign out and return to landing.
      await supabase.auth.signOut();
      setHasMerchantRow(false);
      setView('landing');
      setOrphanCheckDone(true);
    })();
  }, [user, campaignFromUrl]);

  useEffect(() => {
    if (user && orphanCheckDone && hasMerchantRow && !showConfirmed) setView('merchant');
  }, [user, orphanCheckDone, hasMerchantRow, showConfirmed]);

  if (!isSupabaseConfigured) return <ConfigError />;

  // Static legal pages — public, no auth needed. Path-based (Vercel SPA
  // rewrites serve index.html for these, then we render the right page).
  const path = window.location.pathname;
  if (path === '/privacy') return <PrivacyPolicy />;
  if (path === '/terms') return <TermsOfService />;
  if (path === '/dpa') return <DataProcessingAgreement />;
  if (path === '/impressum') return <Impressum />;
  if (path === '/subprocessors') return <Subprocessors />;
  if (path === '/cardholder-privacy') return <CardholderPrivacy />;
  if (path === '/cookies') return <CookiePolicy />;
  if (path === '/accessibility') return <AccessibilityStatement />;
  if (path === '/unsubscribe') return <Unsubscribe />;
  if (path === '/faq') return <Faq />;
  if (path === '/wallet-guide') return <AppleWalletGuide />;
  if (path === '/about') return <Suspense fallback={<BrandLoading />}><AboutPage /></Suspense>;
  if (path === '/features') return <Suspense fallback={<BrandLoading />}><FeaturesPage /></Suspense>;
  if (path === '/pricing') return <Suspense fallback={<BrandLoading />}><PricingPage /></Suspense>;
  if (path === '/use-cases') return <Suspense fallback={<BrandLoading />}><UseCasesPage /></Suspense>;
  if (path === '/blog' || path.startsWith('/blog/')) return <Suspense fallback={<BrandLoading />}><BlogPage /></Suspense>;
  if (path === '/savings') return <Suspense fallback={<BrandLoading />}><PaybackCalculatorPage /></Suspense>;
  if (path === '/find-card') return <Suspense fallback={<BrandLoading />}><CardRecovery /></Suspense>;
  if (path === '/admin') return <Suspense fallback={<BrandLoading />}><AdminPanel onExit={() => { window.history.pushState({}, '', '/'); setView('merchant'); }} /></Suspense>;
  if (path === '/my-card') {
    return (
      <MyCardPage
        onExit={() => {
          window.history.replaceState({}, '', '/');
          // Re-render by reloading; cheaper than threading state for one nav.
          window.location.reload();
        }}
      />
    );
  }

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
        joinedLocationId={locationFromUrl}
        onExit={() => {
          setCampaignFromUrl(null);
          setLocationFromUrl(null);
          window.history.replaceState({}, '', window.location.pathname);
        }}
      />
    );
  }

  // Resolve auth (and, for a signed-in user, the merchant orphan check)
  // before choosing between the dashboard and the public landing page —
  // otherwise we flash Landing/signup for a beat before settling.
  if (authLoading || (user && !orphanCheckDone)) {
    return <BrandLoading />;
  }

  // A signed-in, healthy merchant is flipped to the dashboard by the effect
  // above, which runs on the next tick. Hold the loader through that tick so
  // the public Landing page doesn't flash for a frame before the dashboard.
  if (user && hasMerchantRow && !showConfirmed && view !== 'merchant') {
    return <BrandLoading />;
  }

  // 3) Merchant flow (login form if signed out, dashboard if signed in).
  if (view === 'merchant') {
    return (
      <>
        <Suspense fallback={<BrandLoading />}><MerchantApp onLogout={() => { window.history.pushState({}, '', '/'); setView('landing'); }} startOnLogin={cameFromConfirmation} /></Suspense>
        {showUpgraded && <UpgradeSuccessToast onClose={() => setShowUpgraded(false)} />}
      </>
    );
  }

  // 4) Landing.
  return (
    <>
      <LandingPage
        isAuthenticated={Boolean(user) && hasMerchantRow}
        onEnterMerchantFlow={() => setView('merchant')}
        onResumeMerchant={() => setView('merchant')}
        autoOpenLoginChoice={enterOnLogin}
      />
      {showUpgraded && <UpgradeSuccessToast onClose={() => setShowUpgraded(false)} />}
    </>
  );
}

/**
 * Small banner that flashes when Stripe redirects back after a
 * successful upgrade. Auto-dismisses; user can close early.
 */
function UpgradeSuccessToast({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed top-4 inset-x-4 sm:left-auto sm:right-4 sm:w-96 z-[100] animate-in slide-in-from-top duration-300">
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-lg p-4 shadow-xl flex items-start gap-3">
        <div className="text-2xl">🎉</div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-green-900">You're on Pro!</h3>
          <p className="text-sm text-green-800 mt-0.5">
            Unlimited customers unlocked. Your subscription is active.
          </p>
        </div>
        <button onClick={onClose} className="text-green-700/60 hover:text-green-900 p-1">
          ×
        </button>
      </div>
    </div>
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
