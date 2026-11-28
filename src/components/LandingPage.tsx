import { useState, useEffect } from 'react';
import {
  ArrowRight, ScanLine, X, Loader2, ArrowLeft, Mail, CheckCircle,
  Users, Zap, QrCode, Wallet, RefreshCw, UtensilsCrossed} from 'lucide-react';
import { HeroCardLoop } from './HeroCardLoop';
import { christmasOn, Snowfall, StringLights, SantaHat, Holly, SnowGround } from './ChristmasDecor';
import { LaunchSteps } from './LaunchSteps';
import { StepCard, StatCard } from './FeatureVisuals';
import { signInMerchant, resetPassword } from '../lib/auth';
import { ContactFormSection } from './ContactFormSection';
import { SiteFooter } from './SiteFooter';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useTranslation } from 'react-i18next';
import { PasswordInput } from './PasswordInput';
import { PlatformGrid, OneQrSection, ReplacesStrip, SoundFamiliar, LandingFaq, ClosingCta } from './PlatformSections';
import { TrustpilotWidget } from './TrustpilotWidget';
import { FeatureVideo } from './FeatureVideo';
import { InstaCarousel } from './InstaCarousel';
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
import { reopenCookieBanner } from '../lib/cookieConsent';
import { useSiteInsightsPage } from '../lib/siteInsights';

const INDUSTRIES = [
  { key: 'cafe', icon: '☕' }, { key: 'restaurant', icon: '🍽️' }, { key: 'bakery', icon: '🥐' },
  { key: 'iceCream', icon: '🍦' }, { key: 'snackBar', icon: '🌮' }, { key: 'pizzeria', icon: '🍕' },
  { key: 'bar', icon: '🍸' }, { key: 'florist', icon: '🌸' }, { key: 'nailStudio', icon: '💅' },
  { key: 'hairdresser', icon: '✂️' }, { key: 'barbershop', icon: '💈' }, { key: 'tattoo', icon: '🎨' },
  { key: 'gym', icon: '💪' }, { key: 'retail', icon: '🛍️' },
  { key: 'doner', icon: '🥙' }, { key: 'bubbleTea', icon: '🧋' }, { key: 'foodTruck', icon: '🚚' },
  { key: 'lashBrow', icon: '👁️' }, { key: 'spa', icon: '💆' }, { key: 'carWash', icon: '🚗' },
  { key: 'dogGrooming', icon: '🐶' }, { key: 'dryCleaner', icon: '👔' }, { key: 'yoga', icon: '🧘' },
];

export function LandingPage({
  onEnterMerchantFlow,
  isAuthenticated,
  onResumeMerchant,
  autoOpenLoginChoice,
}: LandingPageProps) {
  const { t } = useTranslation();
  useSiteInsightsPage('/');
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

  // Christmas decorations (20 Nov to 6 Jan); see ChristmasDecor.
  const xmas = christmasOn();

  return (
    <div className="min-h-screen bg-white text-[#37352F] font-sans selection:bg-[#37352F] selection:text-white">
      {xmas && <Snowfall />}
      {/* Login type chooser */}
      {showLoginChoice && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowLoginChoice(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-serif-display font-semibold mb-1">{t('login.title')}</h3>
            <p className="text-sm text-gray-500 mb-5">{t('login.which')}</p>
            <div className="space-y-3">
              <button
                onClick={() => { setShowLoginChoice(false); openLoginModal(); }}
                className="w-full text-left border notion-border rounded-lg p-4 hover:border-[#37352F] transition"
              >
                <div className="font-medium">{t('login.merchant')}</div>
                <div className="text-sm text-gray-500">{t('login.merchantDesc')}</div>
              </button>
              <a
                href="/find-card"
                className="block text-left border notion-border rounded-lg p-4 hover:border-[#37352F] transition"
              >
                <div className="font-medium">{t('login.customer')}</div>
                <div className="text-sm text-gray-500">{t('login.customerDesc')}</div>
              </a>
            </div>
            <button onClick={() => setShowLoginChoice(false)} className="mt-4 text-sm text-gray-400 hover:text-[#37352F] transition">{t('login.cancel')}</button>
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
            <div className="absolute top-0 inset-x-0 h-1.5 z-20" style={{ background: 'linear-gradient(90deg,#75FBFD,#1132F5,#510AF5,#EA33B6,#EA3323,#F0A479,#F7CE46,#75FBFD)' }} />
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
                    <h2 className="text-2xl font-serif-display font-semibold mb-2">{t('login.welcome')}</h2>
                    <p className="text-gray-500 text-sm">{t('login.welcomeDesc')}</p>
                  </div>

                  <form onSubmit={handleLoginSubmit} className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold uppercase text-gray-400 tracking-wider">{t('login.email')}</label>
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
                        <label className="text-xs font-bold uppercase text-gray-400 tracking-wider">{t('login.password')}</label>
                        <button
                          type="button"
                          onClick={() => { setAuthMode('FORGOT_PASSWORD'); setAuthError(null); }}
                          className="text-xs text-[#37352F] hover:underline"
                        >
                          {t('login.forgot')}
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
                      {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : t('login.signIn')}
                    </button>
                  </form>

                  <div className="mt-6 text-center">
                    <button
                      onClick={() => { setIsLoginOpen(false); onEnterMerchantFlow(); }}
                      className="text-xs text-gray-500 hover:text-[#37352F] hover:underline"
                    >
                      {t('login.noAccount')}
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
                    <h2 className="text-2xl font-serif-display font-semibold mb-2">{t('login.resetTitle')}</h2>
                    <p className="text-gray-500 text-sm">{t('login.resetDesc')}</p>
                  </div>

                  <form onSubmit={handleResetSubmit} className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold uppercase text-gray-400 tracking-wider">{t('login.emailAddr')}</label>
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
                      {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : t('login.sendReset')}
                    </button>
                  </form>

                  <div className="mt-6 text-center">
                    <button onClick={() => setAuthMode('LOGIN')} className="text-xs text-gray-500 hover:text-[#37352F]">
                      {t('login.back')}
                    </button>
                  </div>
                </div>
              )}

              {authMode === 'RESET_SENT' && (
                <div className="text-center animate-in fade-in slide-in-from-right-4 duration-300 py-4">
                  <div className="w-16 h-16 bg-green-50 rounded-full mx-auto flex items-center justify-center text-green-600 mb-6 border border-green-100">
                    <CheckCircle className="w-8 h-8" />
                  </div>
                  <h2 className="text-2xl font-serif-display font-semibold mb-2">{t('login.checkInbox')}</h2>
                  <p className="text-gray-500 text-sm mb-8 leading-relaxed">
                    {t('login.resetSent')} <br />
                    <span className="font-medium text-[#37352F]">{email}</span>
                  </p>
                  <button
                    onClick={() => setAuthMode('LOGIN')}
                    className="w-full bg-white border notion-border text-[#37352F] py-3 rounded-md font-medium hover:bg-gray-50 transition shadow-sm"
                  >
                    {t('login.back')}
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
        {xmas && <StringLights />}
        <a href="/" aria-label="Stampfix home" className="relative flex items-center gap-2 font-semibold text-lg text-[#37352F] hover:opacity-80 transition">
          {xmas && <SantaHat className="absolute -top-[13px] -left-[7px] w-[26px] h-[23px] -rotate-[18deg]" />}
          <svg viewBox="0 0 282 90" className="h-6 w-auto text-[#37352F]" fill="currentColor" role="img" aria-label="Stampfix"><rect x="8" y="12" width="66" height="66" rx="4"/><circle cx="140" cy="45" r="34"/><rect x="195" y="36" width="90" height="18" rx="9" transform="rotate(45 240 45)"/><rect x="195" y="36" width="90" height="18" rx="9" transform="rotate(-45 240 45)"/></svg>
          Stampfix
        </a>
        <div className="flex items-center gap-2 md:gap-3 text-sm font-medium">
          <a href="/features" className="hidden md:inline text-gray-600 hover:text-[#37352F] px-2 transition">{t('nav.features')}</a>
          <a href="/pricing" className="hidden md:inline text-gray-600 hover:text-[#37352F] px-2 transition">{t('nav.pricing')}</a>
          <a href="/about" className="hidden md:inline text-gray-600 hover:text-[#37352F] px-2 transition">{t('nav.about')}</a>
          {/* Customer-facing entry to /my-card. A returning customer who
              Googled "stampfix" and lands here needs an obvious way to
              find their card. Subtle styling (text link) so it doesn't
              compete with the primary merchant Log in CTA. */}
          <a
            href="/find-card"
            className="hidden md:inline text-gray-600 hover:text-[#37352F] px-2 py-2 md:px-3 transition whitespace-nowrap"
          >
            {t('nav.lostCard')}
          </a>
          {isAuthenticated && onResumeMerchant ? (
            <button
              onClick={onResumeMerchant}
              className="bg-[#37352F] text-white px-3 py-2 md:px-5 md:py-2.5 rounded-md font-medium hover:bg-[#2F2D28] transition shadow-sm text-xs md:text-sm whitespace-nowrap"
            >
              {t('nav.dashboard')}
            </button>
          ) : (
            <button
              onClick={() => setShowLoginChoice(true)}
              className="bg-[#37352F] text-white px-3 py-2 md:px-5 md:py-2.5 rounded-md font-medium hover:bg-[#2F2D28] transition shadow-sm text-xs md:text-sm whitespace-nowrap"
            >
              {t('nav.login')}
            </button>
          )}
          <LanguageSwitcher className="hidden sm:block" />
          <MobileNav
            links={[
              { href: '/find-card', label: t('nav.lostCardMobile') },
              { href: '/features', label: t('nav.features') },
              { href: '/pricing', label: t('nav.pricing') },
              { href: '/about', label: t('nav.about') },
            ]}
          />
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-6 pb-2">
        <div className="grid md:grid-cols-[1.9fr_1fr] gap-10 items-center">
          <div className="text-center md:text-left">
        <span className="inline-flex items-center gap-1.5 bg-[#F7F7F5] border notion-border rounded-full px-3 py-1 text-xs font-medium text-gray-600 mb-5 animate-in fade-in duration-700" data-hero-kicker>
          {t('hero.kicker', { defaultValue: 'The all-in-one marketing and retention platform' })}
        </span>
        <h1 className="text-4xl md:text-6xl font-serif-display font-medium mb-6 leading-[1.1] tracking-tight text-balance animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
          {t('hero.h1a', { defaultValue: 'Turn first-time customers' })}{' '}
          <span className="text-gray-400">{t('hero.h1b', { defaultValue: 'into regulars.' })}</span>
        </h1>

        <p className="text-xl text-gray-500 mb-10 max-w-xl mx-auto md:mx-0 leading-relaxed animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
          {t('hero.sub2', { defaultValue: 'Loyalty cards in Apple and Google Wallet, one QR code for your services, Wi-Fi and reviews, and offers that bring people back. Everything a local business needs, in one place.' })}
        </p>

        <div className="flex flex-col items-center md:items-start gap-2 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
          <div className="flex justify-center items-start gap-4 flex-wrap">
            <div className="flex flex-col items-center md:items-start gap-1.5">
              <button
                onClick={onEnterMerchantFlow}
                className="bg-[#37352F] text-white px-8 py-3.5 rounded-lg font-medium text-lg flex items-center justify-center gap-2 hover:bg-[#2F2D28] transition shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transform"
              >
                {t('hero.startFree')} <ArrowRight className="w-5 h-5" />
              </button>
              <p className="text-xs text-gray-500">{t('hero.noCard')}</p>
            </div>
            <a
              href="https://calendar.app.google/WCPgkaPjeoUbkQJq7"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white border notion-border text-[#37352F] px-8 py-3.5 rounded-lg font-medium text-lg flex items-center justify-center hover:border-[#37352F] transition"
            >
              {t('hero.bookDemo')}
            </a>
          </div>
          <p className="text-sm text-gray-500">{t('hero.demoNote')}</p>
        </div>
          </div>

          <div className="flex justify-center animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
            <style>{`@keyframes hero-float{0%,100%{transform:translate(0,0)}25%{transform:translate(7px,-6px)}50%{transform:translate(0,-11px)}75%{transform:translate(-7px,-4px)}}`}</style>
            <div className="relative">
              {xmas && <SantaHat className="absolute -top-9 -right-4 md:-right-6 w-20 h-[70px] md:w-24 md:h-[84px] rotate-[20deg] z-10" />}
              {xmas && <Holly className="absolute -top-4 left-6 w-14 h-10 z-10 -rotate-6" />}
              <img
                src="/cafe-hero.jpg"
                alt="A customer showing their Stampfix loyalty card in Apple Wallet at a café"
                className="rounded-3xl shadow-xl w-full max-w-[260px] md:max-w-[300px] object-cover"
                loading="eager"
              />
              <div className="flex absolute top-6 left-1 md:top-10 md:-left-6 items-center gap-1.5 md:gap-2 bg-white rounded-full px-2.5 py-1.5 md:px-3.5 md:py-2 text-xs md:text-sm font-medium text-[#37352F] whitespace-nowrap"
                   style={{ animation: 'hero-float 5s ease-in-out infinite', boxShadow: '0 6px 18px rgba(0,0,0,0.10)' }}>
                <Wallet className="w-4 h-4 text-green-600" /> {t('hero.pill2Wallet', { defaultValue: 'Wallet loyalty card' })}
              </div>
              <div className="flex absolute top-16 right-1 md:top-24 md:-right-6 items-center gap-1.5 md:gap-2 bg-white rounded-full px-2.5 py-1.5 md:px-3.5 md:py-2 text-xs md:text-sm font-medium text-[#37352F] whitespace-nowrap"
                   style={{ animation: 'hero-float 6s ease-in-out infinite', animationDelay: '1.2s', boxShadow: '0 6px 18px rgba(0,0,0,0.10)' }}>
                <QrCode className="w-4 h-4 text-violet-600" /> {t('hero.pill2Qr', { defaultValue: 'One QR code' })}
              </div>
              <div className="flex absolute bottom-24 left-1 md:bottom-28 md:-left-8 items-center gap-1.5 md:gap-2 bg-white rounded-full px-2.5 py-1.5 md:px-3.5 md:py-2 text-xs md:text-sm font-medium text-[#37352F] whitespace-nowrap"
                   style={{ animation: 'hero-float 5.5s ease-in-out infinite', animationDelay: '0.6s', boxShadow: '0 6px 18px rgba(0,0,0,0.10)' }}>
                <RefreshCw className="w-4 h-4 text-rose-500" /> {t('hero.pill2Auto', { defaultValue: 'Win-back offers' })}
              </div>
              <div className="flex absolute bottom-8 right-1 md:bottom-12 md:-right-4 items-center gap-1.5 md:gap-2 bg-white rounded-full px-2.5 py-1.5 md:px-3.5 md:py-2 text-xs md:text-sm font-medium text-[#37352F] whitespace-nowrap"
                   style={{ animation: 'hero-float 6.5s ease-in-out infinite', animationDelay: '1.8s', boxShadow: '0 6px 18px rgba(0,0,0,0.10)' }}>
                <UtensilsCrossed className="w-4 h-4 text-sky-500" /> {t('hero.pill2Order', { defaultValue: 'QR ordering' })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {xmas && <SnowGround />}

      {/* Hero visual — live wallet cards on a straight looping rail */}
      <HeroCardLoop />
      <TrustpilotWidget />
      <ReplacesStrip />

      {/* Social proof */}
      <section className="border-y notion-border bg-[#F7F7F5]/50 py-16">
        <div className="max-w-5xl mx-auto px-6 grid md:grid-cols-3 gap-8 text-center divide-x notion-border md:divide-y-0 divide-y">
          <div className="p-4">
            <div className="text-4xl font-serif-display font-semibold mb-1">2.5x</div>
            <div className="text-sm text-gray-500 uppercase tracking-widest font-medium">{t('social.retention')}</div>
          </div>
          <div className="p-4">
            <div className="text-4xl font-serif-display font-semibold mb-1">0</div>
            <div className="text-sm text-gray-500 uppercase tracking-widest font-medium">{t('social.apps')}</div>
          </div>
          <div className="p-4">
            <div className="text-4xl font-serif-display font-semibold mb-1">1</div>
            <div className="text-sm text-gray-500 uppercase tracking-widest font-medium">{t('social.oneQr', { defaultValue: 'QR code for everything' })}</div>
          </div>
        </div>
      </section>

      {/* The problem, then everything Stampfix does, then the business page */}
      <SoundFamiliar />
      <PlatformGrid />
      <OneQrSection />

      {/* 2-minute feature tour (video) */}
      <FeatureVideo />

      {/* Made for your shop */}
      <section className="max-w-5xl mx-auto px-6 py-20 text-center">
        <style>{`@keyframes shop-pop{0%{opacity:0;transform:translateY(12px) scale(0.92)}100%{opacity:1;transform:translateY(0) scale(1)}}@keyframes shop-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}`}</style>
        <h2 className="text-3xl md:text-5xl font-serif-display font-medium mb-4 tracking-tight text-balance">{t('shops.heading')}</h2>
        <p className="text-lg text-gray-500 mb-10 max-w-2xl mx-auto text-pretty">{t('shops.subtitle')}</p>
        <div className="flex flex-wrap justify-center gap-3">
          {INDUSTRIES.map((ind, i) => (
            <div key={ind.key} className="inline-flex items-center gap-2 bg-white border notion-border rounded-full px-4 py-2.5 text-sm font-medium text-[#37352F] shadow-sm hover:shadow-md hover:-translate-y-0.5 transition" style={{ animation: `shop-pop 0.5s ease-out ${i * 55}ms both` }}>
              <span className="text-lg" style={{ display: 'inline-block', animation: `shop-bob 3s ease-in-out ${i * 180}ms infinite` }}>{ind.icon}</span>
              {t(`industries.${ind.key}`)}
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <LaunchSteps />
      <InstaCarousel />

      {/* Budget pitch band */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-[#F7F7F5] border notion-border px-3 py-1 rounded-full text-xs font-medium text-gray-500 mb-6">
            {t('budget.badge')}
          </div>
          <h2 className="text-3xl md:text-5xl font-serif-display font-medium mb-5 leading-tight">
            {t('budget.t1b', { defaultValue: 'Big-brand marketing,' })}<br />{t('budget.t2')}
          </h2>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto mb-8 leading-relaxed">
            {t('budget.body2', { defaultValue: 'Loyalty cards, offers, your business page and QR ordering for one flat monthly price. No setup fees, no app development, no hardware, and unlimited customers.' })}
          </p>
          <a href="/savings" className="inline-flex items-center gap-2 bg-white border notion-border text-[#37352F] px-5 py-2.5 rounded-lg font-medium hover:border-[#37352F] transition">
            {t('budget.cta')} <ArrowRight className="w-4 h-4" />
          </a>
          <div className="grid sm:grid-cols-3 gap-4 mt-12 max-w-2xl mx-auto text-left">
            <StatCard value="$0" label={t('budget.s1')} color="#16A34A" delay={0} />
            <StatCard value={t('budget.v2')} label={t('budget.s2')} color="#510AF5" delay={120} />
            <StatCard value={t('budget.v3')} label={t('budget.s3')} color="#1132F5" delay={240} />
          </div>
        </div>
      </section>

      <LandingFaq />
      <ClosingCta onStart={onEnterMerchantFlow} />

      {/* Contact form (lands in admin → Contact Inquiries) */}
      <ContactFormSection />

      <SiteFooter onCookieSettings={reopenCookieBanner} />
    </div>
  );
}
