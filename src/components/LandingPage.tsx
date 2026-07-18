import { useState, useEffect } from 'react';
import {
  ArrowRight, ScanLine, X, Loader2, ArrowLeft, Mail, CheckCircle,
  BarChart3, Users, Zap, Smartphone, QrCode, Instagram, Linkedin,
} from 'lucide-react';
import { HeroCardLoop } from './HeroCardLoop';
import { WalletFanVisual, InsightsVisual, StepCard, StatCard } from './FeatureVisuals';
import { signInMerchant, resetPassword } from '../lib/auth';
import { ContactFormSection } from './ContactFormSection';
import { PasswordInput } from './PasswordInput';
import { FeaturesSection } from './FeaturesSection';
import { PromoBannerBar } from './PromoBannerBar';

interface LandingPageProps {
  onEnterMerchantFlow: () => void;
  isAuthenticated?: boolean;
  /** When true (arriving via ?login=1), auto-open the merchant/customer chooser. */
  autoOpenLoginChoice?: boolean;
  onResumeMerchant?: () => void;
}

type AuthMode = 'LOGIN' | 'FORGOT_PASSWORD' | 'RESET_SENT';

// Demo data for the phone mockup
import { MobileNav } from './MobileNav';

export function LandingPage({
  onEnterMerchantFlow,
  isAuthenticated,
  onResumeMerchant,
  autoOpenLoginChoice,
}: LandingPageProps) {
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('LOGIN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setAuthError(null);
    setIsLoading(true);
    try {
      await signInMerchant(email, password);
      setIsLoginOpen(false);
      // Auth state listener in App.tsx will route us to the dashboard.
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setAuthError(null);
    setIsLoading(true);
    try {
      await resetPassword(email);
      setAuthMode('RESET_SENT');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Could not send reset email');
    } finally {
      setIsLoading(false);
    }
  };

  const [showLoginChoice, setShowLoginChoice] = useState(false);

  // Generic "Log in" entry points (e.g. the marketing-site nav via ?login=1)
  // open the merchant/customer chooser instead of jumping straight to merchant login.
  useEffect(() => {
    if (autoOpenLoginChoice) setShowLoginChoice(true);
  }, [autoOpenLoginChoice]);

  const openLoginModal = () => {
    setAuthMode('LOGIN');
    setEmail('');
    setPassword('');
    setAuthError(null);
    setIsLoginOpen(true);
  };

  return (
    <div className="min-h-screen bg-white text-[#37352F] font-sans selection:bg-[#37352F] selection:text-white">
      {/* Login type chooser */}
      {showLoginChoice && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowLoginChoice(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-serif-display font-semibold mb-1">Log in</h3>
            <p className="text-sm text-gray-500 mb-5">Which kind of account?</p>
            <div className="space-y-3">
              <button
                onClick={() => { setShowLoginChoice(false); openLoginModal(); }}
                className="w-full text-left border notion-border rounded-lg p-4 hover:border-[#37352F] transition"
              >
                <div className="font-medium">Merchant login</div>
                <div className="text-sm text-gray-500">Manage your loyalty program and dashboard.</div>
              </button>
              <a
                href="/find-card"
                className="block text-left border notion-border rounded-lg p-4 hover:border-[#37352F] transition"
              >
                <div className="font-medium">Customer login</div>
                <div className="text-sm text-gray-500">Find and re-download your stamp card.</div>
              </a>
            </div>
            <button onClick={() => setShowLoginChoice(false)} className="mt-4 text-sm text-gray-400 hover:text-[#37352F] transition">Cancel</button>
          </div>
        </div>
      )}

      {/* Login Modal */}
      {isLoginOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div
            className="absolute inset-0 bg-white/60 backdrop-blur-md"
            onClick={() => setIsLoginOpen(false)}
          />
          <div className="relative bg-white rounded-xl shadow-2xl border notion-border w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300">
            <button
              onClick={() => setIsLoginOpen(false)}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition z-10"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="p-8 md:p-10">
              {authMode === 'LOGIN' && (
                <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="mb-8 text-center">
                    <div className="w-12 h-12 bg-[#37352F] rounded-lg mx-auto flex items-center justify-center mb-4 shadow-sm"><svg viewBox="0 0 282 90" className="w-8 text-white" fill="currentColor" role="img" aria-label="Stampfix"><rect x="8" y="12" width="66" height="66" rx="4"/><circle cx="140" cy="45" r="34"/><rect x="195" y="36" width="90" height="18" rx="9" transform="rotate(45 240 45)"/><rect x="195" y="36" width="90" height="18" rx="9" transform="rotate(-45 240 45)"/></svg></div>
                    <h2 className="text-2xl font-serif-display font-semibold mb-2">Welcome back</h2>
                    <p className="text-gray-500 text-sm">Enter your details to access your workspace.</p>
                  </div>

                  <form onSubmit={handleLoginSubmit} className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold uppercase text-gray-400 tracking-wider">Email</label>
                      <input
                        type="email"
                        autoFocus
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-[#F7F7F5] border notion-border rounded-md px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#37352F]/20 transition"
                        placeholder="name@company.com"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-bold uppercase text-gray-400 tracking-wider">Password</label>
                        <button
                          type="button"
                          onClick={() => { setAuthMode('FORGOT_PASSWORD'); setAuthError(null); }}
                          className="text-xs text-[#37352F] hover:underline"
                        >
                          Forgot password?
                        </button>
                      </div>
                      <PasswordInput
                        value={password}
                        onChange={setPassword}
                        autoComplete="current-password"
                        className="w-full bg-[#F7F7F5] border notion-border rounded-md px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#37352F]/20 transition"
                        placeholder="••••••••"
                      />
                    </div>

                    {authError && (
                      <div className="text-xs text-red-600 bg-red-50 border border-red-100 p-2 rounded">
                        {authError}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isLoading || !email || !password}
                      className="w-full bg-[#37352F] text-white py-3 rounded-md font-medium hover:bg-[#2F2D28] transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 mt-2"
                    >
                      {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sign In'}
                    </button>
                  </form>

                  <div className="mt-6 text-center">
                    <button
                      onClick={() => { setIsLoginOpen(false); onEnterMerchantFlow(); }}
                      className="text-xs text-gray-500 hover:text-[#37352F] hover:underline"
                    >
                      Don't have an account? Create one
                    </button>
                  </div>
                </div>
              )}

              {authMode === 'FORGOT_PASSWORD' && (
                <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="mb-8 text-center">
                    <button
                      onClick={() => { setAuthMode('LOGIN'); setAuthError(null); }}
                      className="absolute top-4 left-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="w-12 h-12 bg-gray-100 rounded-lg mx-auto flex items-center justify-center text-[#37352F] mb-4 border notion-border">
                      <Mail className="w-6 h-6" />
                    </div>
                    <h2 className="text-2xl font-serif-display font-semibold mb-2">Reset Password</h2>
                    <p className="text-gray-500 text-sm">Enter your email and we'll send you a reset link.</p>
                  </div>

                  <form onSubmit={handleResetSubmit} className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold uppercase text-gray-400 tracking-wider">Email Address</label>
                      <input
                        type="email"
                        autoFocus
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-[#F7F7F5] border notion-border rounded-md px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#37352F]/20 transition"
                        placeholder="name@company.com"
                      />
                    </div>

                    {authError && (
                      <div className="text-xs text-red-600 bg-red-50 border border-red-100 p-2 rounded">
                        {authError}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isLoading || !email}
                      className="w-full bg-[#37352F] text-white py-3 rounded-md font-medium hover:bg-[#2F2D28] transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 mt-2"
                    >
                      {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Reset Link'}
                    </button>
                  </form>

                  <div className="mt-6 text-center">
                    <button onClick={() => setAuthMode('LOGIN')} className="text-xs text-gray-500 hover:text-[#37352F]">
                      Back to Sign In
                    </button>
                  </div>
                </div>
              )}

              {authMode === 'RESET_SENT' && (
                <div className="text-center animate-in fade-in slide-in-from-right-4 duration-300 py-4">
                  <div className="w-16 h-16 bg-green-50 rounded-full mx-auto flex items-center justify-center text-green-600 mb-6 border border-green-100">
                    <CheckCircle className="w-8 h-8" />
                  </div>
                  <h2 className="text-2xl font-serif-display font-semibold mb-2">Check your inbox</h2>
                  <p className="text-gray-500 text-sm mb-8 leading-relaxed">
                    We've sent a password reset link to <br />
                    <span className="font-medium text-[#37352F]">{email}</span>
                  </p>
                  <button
                    onClick={() => setAuthMode('LOGIN')}
                    className="w-full bg-white border notion-border text-[#37352F] py-3 rounded-md font-medium hover:bg-gray-50 transition shadow-sm"
                  >
                    Back to Sign In
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Promo banner — pulls from DB. Sits above the nav (which is sticky)
          so the banner scrolls away with the page; only on first view. */}
      <PromoBannerBar />

      {/* Navbar */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-sm border-b notion-border px-6 py-4 flex justify-between items-center">
        <a href="/" aria-label="Stampfix home" className="flex items-center gap-2 font-semibold text-lg text-[#37352F] hover:opacity-80 transition">
          <svg viewBox="0 0 282 90" className="h-6 w-auto text-[#37352F]" fill="currentColor" role="img" aria-label="Stampfix"><rect x="8" y="12" width="66" height="66" rx="4"/><circle cx="140" cy="45" r="34"/><rect x="195" y="36" width="90" height="18" rx="9" transform="rotate(45 240 45)"/><rect x="195" y="36" width="90" height="18" rx="9" transform="rotate(-45 240 45)"/></svg>
          Stampfix
        </a>
        <div className="flex items-center gap-2 md:gap-3 text-sm font-medium">
          <a href="/features" className="hidden md:inline text-gray-600 hover:text-[#37352F] px-2 transition">Features</a>
          <a href="/use-cases" className="hidden md:inline text-gray-600 hover:text-[#37352F] px-2 transition">Use cases</a>
          <a href="/savings" className="hidden md:inline text-gray-600 hover:text-[#37352F] px-2 transition">Savings</a>
          <a href="/blog" className="hidden md:inline text-gray-600 hover:text-[#37352F] px-2 transition">Blog</a>
          <a href="/about" className="hidden md:inline text-gray-600 hover:text-[#37352F] px-2 transition">About</a>
          {/* Customer-facing entry to /my-card. A returning customer who
              Googled "stampfix" and lands here needs an obvious way to
              find their card. Subtle styling (text link) so it doesn't
              compete with the primary merchant Log in CTA. */}
          <a
            href="/find-card"
            className="hidden md:inline text-gray-600 hover:text-[#37352F] px-2 py-2 md:px-3 transition whitespace-nowrap"
          >
            Lost your card?
          </a>
          {isAuthenticated && onResumeMerchant ? (
            <button
              onClick={onResumeMerchant}
              className="bg-[#37352F] text-white px-3 py-2 md:px-5 md:py-2.5 rounded-md font-medium hover:bg-[#2F2D28] transition shadow-sm text-xs md:text-sm whitespace-nowrap"
            >
              Go to dashboard
            </button>
          ) : (
            <button
              onClick={() => setShowLoginChoice(true)}
              className="bg-[#37352F] text-white px-3 py-2 md:px-5 md:py-2.5 rounded-md font-medium hover:bg-[#2F2D28] transition shadow-sm text-xs md:text-sm whitespace-nowrap"
            >
              Log in
            </button>
          )}
          <MobileNav
            links={[
              { href: '/find-card', label: 'My loyalty card' },
              { href: '/features', label: 'Features' },
              { href: '/use-cases', label: 'Use cases' },
              { href: '/savings', label: 'Savings' },
              { href: '/blog', label: 'Blog' },
              { href: '/about', label: 'About' },
            ]}
          />
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-10 pb-2 text-center">
        <div className="inline-flex items-center gap-2 bg-[#F7F7F5] border notion-border px-3 py-1 rounded-full text-xs font-medium text-gray-500 mb-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <Zap className="w-3 h-3 text-yellow-500 fill-yellow-500" />
          Lightning fast setup & onboarding
        </div>

        <h1 className="text-5xl md:text-7xl font-serif-display font-medium mb-6 leading-[1.1] tracking-tight animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
          No apps. No paper. <br />
          <span className="text-gray-400">Just loyalty.</span>
        </h1>

        <p className="text-xl text-gray-500 mb-10 max-w-2xl mx-auto leading-relaxed animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
          Create a digital punch card in 30 seconds. No apps to download. <br className="hidden md:block" />
          Just a simple link that lives in your customer's Apple or Google Wallet.
        </p>

        <div className="flex justify-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
          <button
            onClick={onEnterMerchantFlow}
            className="bg-[#37352F] text-white px-8 py-3.5 rounded-lg font-medium text-lg flex items-center justify-center gap-2 hover:bg-[#2F2D28] transition shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transform"
          >
            Start for free <ArrowRight className="w-5 h-5" />
          </button>
        </div>

      </section>

      {/* Hero visual — live wallet cards on a straight looping rail */}
      <HeroCardLoop />

      {/* Social proof */}
      <section className="border-y notion-border bg-[#F7F7F5]/50 py-16">
        <div className="max-w-5xl mx-auto px-6 grid md:grid-cols-3 gap-8 text-center divide-x notion-border md:divide-y-0 divide-y">
          <div className="p-4">
            <div className="text-4xl font-serif-display font-semibold mb-1">2.5x</div>
            <div className="text-sm text-gray-500 uppercase tracking-widest font-medium">Increase in Retention</div>
          </div>
          <div className="p-4">
            <div className="text-4xl font-serif-display font-semibold mb-1">0</div>
            <div className="text-sm text-gray-500 uppercase tracking-widest font-medium">Apps to Download</div>
          </div>
          <div className="p-4">
            <div className="text-4xl font-serif-display font-semibold mb-1">100%</div>
            <div className="text-sm text-gray-500 uppercase tracking-widest font-medium">Customizable</div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 max-w-5xl mx-auto px-6 space-y-32">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div className="order-2 md:order-1">
            <InsightsVisual />
          </div>
          <div className="order-1 md:order-2 space-y-6">
            <div className="w-12 h-12 bg-[#37352F] rounded-lg flex items-center justify-center text-white mb-4 shadow-md">
              <BarChart3 className="w-6 h-6" />
            </div>
            <h2 className="text-4xl font-serif-display font-semibold">Know your customers,<br /> not just their orders.</h2>
            <p className="text-lg text-gray-500 leading-relaxed">
              Stop guessing who your regulars are. Stampfix tracks every scan, giving you powerful insights into visit frequency, retention rates, and reward redemptions.
            </p>
            <ul className="space-y-3 text-sm text-gray-600">
              <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500" /> Identify top spenders automatically</li>
              <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500" /> Export data for email marketing</li>
              <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500" /> Block fraudulent activity instantly</li>
            </ul>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div className="space-y-6">
            <div className="w-12 h-12 bg-[#37352F] rounded-lg flex items-center justify-center text-white mb-4 shadow-md">
              <Smartphone className="w-6 h-6" />
            </div>
            <h2 className="text-4xl font-serif-display font-semibold">Native to Apple &amp; Google Wallet.<br /> No friction.</h2>
            <p className="text-lg text-gray-500 leading-relaxed">
              Customers don't want another app clogging their phone. Our passes live directly in Apple Wallet on iPhone and Google Wallet on Android, using the tech already built into their device.
            </p>
            <ul className="space-y-3 text-sm text-gray-600">
              <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500" /> One-tap install from QR code</li>
              <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500" /> Lock screen notifications when nearby</li>
              <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500" /> Updates sync automatically</li>
            </ul>
          </div>
          <div>
            <WalletFanVisual />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-[#F7F7F5] border-y notion-border py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-serif-display font-semibold mb-4">Launch in 3 steps</h2>
            <p className="text-gray-500">No developer required.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <StepCard n={1} title="Design your card" text="Customize your colors, logo, and rewards in minutes." kind="design" />
            <StepCard n={2} title="Print your QR" text="Download your unique poster. Place it at your checkout counter or on tables." kind="qr" />
            <StepCard n={3} title="Scan & Reward" text="Use any phone or tablet to scan customer cards. No expensive hardware needed." kind="scan" />
          </div>
        </div>
      </section>

      {/* Budget pitch band */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-[#F7F7F5] border notion-border px-3 py-1 rounded-full text-xs font-medium text-gray-500 mb-6">
            Built for independent merchants
          </div>
          <h2 className="text-3xl md:text-5xl font-serif-display font-medium mb-5 leading-tight">
            Enterprise-grade loyalty,<br />on a local-business budget.
          </h2>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto mb-8 leading-relaxed">
            No setup fees. No app development. No expensive hardware. Just a flat monthly price with
            unlimited customers &mdash; for less than you&rsquo;d spend on a few lunches.
          </p>
          <a href="/savings" className="inline-flex items-center gap-2 bg-white border notion-border text-[#37352F] px-5 py-2.5 rounded-lg font-medium hover:border-[#37352F] transition">
            See what paper cards cost you <ArrowRight className="w-4 h-4" />
          </a>
          <div className="grid sm:grid-cols-3 gap-4 mt-12 max-w-2xl mx-auto text-left">
            <StatCard value="$0" label="Setup & hardware" color="#16A34A" delay={0} />
            <StatCard value="Unlimited" label="Customers & cards" color="#510AF5" delay={120} />
            <StatCard value="Cancel anytime" label="No contract" color="#1132F5" delay={240} />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-32 px-6 text-center">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-serif-display font-medium mb-8">Ready to grow your community?</h2>
          <button
            onClick={onEnterMerchantFlow}
            className="bg-[#37352F] text-white px-8 py-4 rounded-lg font-medium text-lg flex items-center justify-center gap-2 hover:bg-[#2F2D28] transition shadow-lg mx-auto"
          >
            Create Workspace for Free <ArrowRight className="w-5 h-5" />
          </button>
          <p className="mt-6 text-sm text-gray-400">No credit card required. Up and running in minutes.</p>
        </div>
      </section>

      {/* Features section — 2-column with iPhone mockup */}
      <FeaturesSection />

      {/* Contact form (lands in admin → Contact Inquiries) */}
      <ContactFormSection />

      {/* Footer */}
      <footer className="border-t notion-border bg-white py-12 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center text-sm text-gray-500">
          <a href="/" aria-label="Stampfix home" className="flex items-center gap-2 font-semibold text-[#37352F] mb-4 md:mb-0 hover:opacity-80 transition">
            <svg viewBox="0 0 282 90" className="h-5 w-auto text-[#37352F]" fill="currentColor" role="img" aria-label="Stampfix"><rect x="8" y="12" width="66" height="66" rx="4"/><circle cx="140" cy="45" r="34"/><rect x="195" y="36" width="90" height="18" rx="9" transform="rotate(45 240 45)"/><rect x="195" y="36" width="90" height="18" rx="9" transform="rotate(-45 240 45)"/></svg>
            Stampfix
          </a>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-3">
            <a href="/faq" className="hover:text-[#37352F]">FAQ</a>
            <a href="/wallet-guide" className="hover:text-[#37352F]">Update your card</a>
            <a href="/privacy" className="hover:text-[#37352F]">Privacy</a>
            <a href="/terms" className="hover:text-[#37352F]">Terms</a>
            <a href="/impressum" className="hover:text-[#37352F]">Impressum</a>
            <a href="#contact" className="hover:text-[#37352F]">Contact</a>
          </div>
          <div className="mt-4 md:mt-0">&copy; 2026 Stampfix Inc.</div>
        </div>
        {/* Social — replace href="#" with your real Instagram / LinkedIn / TikTok URLs */}
        <div className="max-w-6xl mx-auto flex justify-center gap-3 mt-8">
          <a href="#" aria-label="Instagram" target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full border notion-border flex items-center justify-center text-gray-500 hover:text-[#37352F] hover:border-[#37352F] transition">
            <Instagram className="w-4 h-4" />
          </a>
          <a href="#" aria-label="LinkedIn" target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full border notion-border flex items-center justify-center text-gray-500 hover:text-[#37352F] hover:border-[#37352F] transition">
            <Linkedin className="w-4 h-4" />
          </a>
          <a href="#" aria-label="TikTok" target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full border notion-border flex items-center justify-center text-gray-500 hover:text-[#37352F] hover:border-[#37352F] transition">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true"><path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 1 1-2.59-2.6c.27 0 .53.05.78.12V9.66a5.7 5.7 0 0 0-.78-.06 5.7 5.7 0 1 0 5.7 5.7V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3a4.3 4.3 0 0 1-3.26-1.48z"/></svg>
          </a>
        </div>
      </footer>
    </div>
  );
}
