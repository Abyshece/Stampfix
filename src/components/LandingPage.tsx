import { useState } from 'react';
import {
  ArrowRight, ScanLine, X, Loader2, ArrowLeft, Mail, CheckCircle,
  BarChart3, Users, Zap, Smartphone, QrCode,
} from 'lucide-react';
import { WalletCard } from './WalletCard';
import type { Campaign, UserCard } from '../types';
import { signInMerchant, resetPassword } from '../lib/auth';
import { ContactFormSection } from './ContactFormSection';
import { FeaturesSection } from './FeaturesSection';
import { PromoBannerBar } from './PromoBannerBar';

interface LandingPageProps {
  onEnterMerchantFlow: () => void;
  isAuthenticated?: boolean;
  onResumeMerchant?: () => void;
}

type AuthMode = 'LOGIN' | 'FORGOT_PASSWORD' | 'RESET_SENT';

// Demo data for the phone mockup
const DEMO_CAMPAIGN: Campaign = {
  id: 'demo',
  merchantId: 'demo',
  businessName: 'Urban Brew',
  offerTitle: 'Buy 6 coffees, get 1 free',
  maxStamps: 6,
  primaryColor: '#37352F',
  backgroundColor: '#FFFFFF',
  logoText: 'UB',
  description: 'Demo',
  cardPattern: 'dots',
  customIcon: '☕️',
};

const DEMO_CARD: UserCard = {
  id: 'demo-card',
  campaignId: 'demo',
  customerName: 'Alex Smith',
  email: 'alex@example.com',
  age: 25,
  currentStamps: 4,
  rewardsRedeemed: 0,
  joinedAt: new Date(),
  status: 'ACTIVE',
};

export function LandingPage({
  onEnterMerchantFlow,
  isAuthenticated,
  onResumeMerchant,
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

  const openLoginModal = () => {
    setAuthMode('LOGIN');
    setEmail('');
    setPassword('');
    setAuthError(null);
    setIsLoginOpen(true);
  };

  return (
    <div className="min-h-screen bg-white text-[#37352F] font-sans selection:bg-[#37352F] selection:text-white">
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
                    <div className="w-12 h-12 bg-[#37352F] rounded-lg mx-auto flex items-center justify-center text-white font-bold text-xl mb-4 shadow-sm">S</div>
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
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
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
        <div className="flex items-center gap-2 font-semibold text-lg">
          <div className="w-6 h-6 bg-[#37352F] rounded-sm flex items-center justify-center text-white text-xs font-bold">S</div>
          Stampfix
        </div>
        <div className="flex items-center gap-2 md:gap-3 text-sm font-medium">
          {/* Customer-facing entry to /my-card. A returning customer who
              Googled "stampfix" and lands here needs an obvious way to
              find their card. Subtle styling (text link) so it doesn't
              compete with the primary merchant Log in CTA. */}
          <a
            href="/my-card"
            className="text-gray-600 hover:text-[#37352F] px-2 py-2 md:px-3 transition whitespace-nowrap"
          >
            My loyalty card
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
              onClick={openLoginModal}
              className="bg-[#37352F] text-white px-3 py-2 md:px-5 md:py-2.5 rounded-md font-medium hover:bg-[#2F2D28] transition shadow-sm text-xs md:text-sm whitespace-nowrap"
            >
              Log in
            </button>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-24 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-[#F7F7F5] border notion-border px-3 py-1 rounded-full text-xs font-medium text-gray-500 mb-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <Zap className="w-3 h-3 text-yellow-500 fill-yellow-500" />
          Lightning fast setup & onboarding
        </div>

        <h1 className="text-5xl md:text-7xl font-serif-display font-medium mb-6 leading-[1.1] tracking-tight animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
          Loyalty programs <br />
          <span className="text-gray-400">shouldn't be complicated.</span>
        </h1>

        <p className="text-xl text-gray-500 mb-10 max-w-2xl mx-auto leading-relaxed animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
          Create a digital punch card in 30 seconds. No apps to download. <br className="hidden md:block" />
          Just a simple link that lives in your customer's Google Wallet.
        </p>

        <div className="flex justify-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
          <button
            onClick={onEnterMerchantFlow}
            className="bg-[#37352F] text-white px-8 py-3.5 rounded-lg font-medium text-lg flex items-center justify-center gap-2 hover:bg-[#2F2D28] transition shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transform"
          >
            Start for free <ArrowRight className="w-5 h-5" />
          </button>
        </div>

        {/* Hero visual */}
        <div className="mt-20 relative max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-500">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] bg-gradient-to-r from-pink-100/50 via-purple-100/50 to-blue-100/50 blur-3xl rounded-full -z-10"></div>

          <div className="relative grid grid-cols-1 md:grid-cols-12 gap-8 items-end">
            <div className="md:col-span-8 bg-white rounded-xl shadow-2xl border notion-border overflow-hidden">
              <div className="h-8 bg-[#F7F7F5] border-b notion-border flex items-center px-4 gap-2">
                <div className="w-3 h-3 rounded-full bg-red-400/50"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-400/50"></div>
                <div className="w-3 h-3 rounded-full bg-green-400/50"></div>
              </div>
              <div className="p-6">
                <div className="flex justify-between items-end mb-8">
                  <div>
                    <div className="h-2 w-24 bg-gray-100 rounded mb-2"></div>
                    <div className="h-6 w-48 bg-gray-900 rounded opacity-10"></div>
                  </div>
                  <div className="flex gap-2">
                    <div className="h-8 w-8 rounded bg-gray-100"></div>
                    <div className="h-8 w-8 rounded bg-gray-100"></div>
                  </div>
                </div>
                <div className="flex items-end gap-2 h-48 w-full pb-4 border-b border-gray-100 px-2">
                  {[40, 65, 45, 80, 55, 90, 70, 85, 60, 75, 50, 95].map((h, i) => (
                    <div key={i} className="flex-1 bg-[#37352F] opacity-90 rounded-t-sm hover:opacity-100 transition duration-300" style={{ height: `${h}%` }}></div>
                  ))}
                </div>
                <div className="flex justify-between mt-4">
                  <div className="h-16 w-32 bg-[#F7F7F5] rounded border notion-border p-3">
                    <div className="w-6 h-6 rounded-full bg-blue-100 mb-2"></div>
                    <div className="h-2 w-16 bg-gray-200 rounded"></div>
                  </div>
                  <div className="h-16 w-32 bg-[#F7F7F5] rounded border notion-border p-3">
                    <div className="w-6 h-6 rounded-full bg-green-100 mb-2"></div>
                    <div className="h-2 w-16 bg-gray-200 rounded"></div>
                  </div>
                  <div className="h-16 w-32 bg-[#F7F7F5] rounded border notion-border p-3">
                    <div className="w-6 h-6 rounded-full bg-orange-100 mb-2"></div>
                    <div className="h-2 w-16 bg-gray-200 rounded"></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="hidden md:block md:col-span-4 -mb-12 relative z-10 transform rotate-[-2deg] hover:rotate-0 transition duration-500">
              <div className="bg-black p-3 rounded-[3rem] shadow-2xl border-[4px] border-gray-800">
                <div className="bg-white rounded-[2.2rem] overflow-hidden h-[450px] relative border border-gray-200 flex flex-col items-center">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-6 bg-black rounded-b-xl z-20"></div>
                  <div className="w-full h-10 bg-white flex justify-between items-center px-6 pt-2 text-[10px] font-bold text-gray-900 z-10">
                    <span>9:41</span>
                    <div className="flex gap-1">
                      <div className="w-4 h-2.5 bg-gray-900 rounded-[1px]"></div>
                      <div className="w-0.5 h-2.5 bg-gray-300"></div>
                    </div>
                  </div>
                  <div className="w-full px-2 pt-2 pb-0 flex-1 overflow-hidden bg-gray-50 flex flex-col items-center">
                    <div className="transform scale-[0.70] origin-top w-full -mt-2">
                      <WalletCard campaign={DEMO_CAMPAIGN} card={DEMO_CARD} disableSave staticQR />
                    </div>
                  </div>
                  <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-32 h-1 bg-black rounded-full z-20"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

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
          <div className="order-2 md:order-1 relative group">
            <div className="absolute -inset-2 bg-gradient-to-r from-gray-100 to-gray-50 rounded-xl transform rotate-1 group-hover:rotate-2 transition duration-300"></div>
            <div className="relative bg-white border notion-border rounded-xl p-6 shadow-sm">
              <div className="flex items-center gap-4 mb-6 border-b notion-border pb-4">
                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-gray-900">Customer Database</div>
                  <div className="text-xs text-gray-500">Real-time sync</div>
                </div>
              </div>
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-[#F7F7F5] rounded border notion-border">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-200"></div>
                      <div className="h-3 w-24 bg-gray-300 rounded"></div>
                    </div>
                    <div className="h-2 w-12 bg-green-200 rounded-full"></div>
                  </div>
                ))}
              </div>
            </div>
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
            <h2 className="text-4xl font-serif-display font-semibold">Native to Google Wallet.<br /> No friction.</h2>
            <p className="text-lg text-gray-500 leading-relaxed">
              Customers don't want another app clogging their phone. Our passes live directly in Google Wallet on Android, using the tech already built into their device.
            </p>
            <ul className="space-y-3 text-sm text-gray-600">
              <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500" /> One-tap install from QR code</li>
              <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500" /> Lock screen notifications when nearby</li>
              <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500" /> Updates sync automatically</li>
            </ul>
          </div>
          <div className="relative group">
            <div className="absolute -inset-2 bg-gradient-to-l from-gray-100 to-gray-50 rounded-xl transform -rotate-1 group-hover:-rotate-2 transition duration-300"></div>
            <div className="relative bg-[#222] rounded-xl p-8 text-white shadow-xl flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mb-6 backdrop-blur-md">
                <ScanLine className="w-8 h-8 text-white" />
              </div>
              <div className="text-2xl font-semibold mb-2">Scan to Join</div>
              <div className="text-white/60 text-sm mb-8">Point camera at code</div>

              <div className="bg-white p-4 rounded-lg">
                <QrCode className="w-32 h-32 text-black" />
              </div>
            </div>
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
            <div className="bg-white p-8 rounded-xl border notion-border shadow-sm hover:shadow-md transition">
              <div className="text-6xl font-serif-display text-gray-100 mb-6 font-bold select-none">1</div>
              <h3 className="text-xl font-bold mb-3">Design your card</h3>
              <p className="text-gray-500 leading-relaxed">Customize your colors, logo, and rewards in minutes.</p>
            </div>
            <div className="bg-white p-8 rounded-xl border notion-border shadow-sm hover:shadow-md transition">
              <div className="text-6xl font-serif-display text-gray-100 mb-6 font-bold select-none">2</div>
              <h3 className="text-xl font-bold mb-3">Print your QR</h3>
              <p className="text-gray-500 leading-relaxed">Download your unique poster. Place it at your checkout counter or on tables.</p>
            </div>
            <div className="bg-white p-8 rounded-xl border notion-border shadow-sm hover:shadow-md transition">
              <div className="text-6xl font-serif-display text-gray-100 mb-6 font-bold select-none">3</div>
              <h3 className="text-xl font-bold mb-3">Scan & Reward</h3>
              <p className="text-gray-500 leading-relaxed">Use any phone or tablet to scan customer cards. No expensive hardware needed.</p>
            </div>
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
          <div className="flex items-center gap-2 font-semibold text-[#37352F] mb-4 md:mb-0">
            <div className="w-5 h-5 bg-[#37352F] rounded-sm flex items-center justify-center text-white text-[10px] font-bold">S</div>
            Stampfix
          </div>
          <div className="flex gap-6">
            <a href="/privacy" className="hover:text-[#37352F]">Privacy</a>
            <a href="/terms" className="hover:text-[#37352F]">Terms</a>
            <a href="#contact" className="hover:text-[#37352F]">Contact</a>
          </div>
          <div className="mt-4 md:mt-0">&copy; 2026 Stampfix Inc.</div>
        </div>
      </footer>
    </div>
  );
}
