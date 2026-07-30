import { PhoneField } from './PhoneField';
import { useState } from 'react';
import { ArrowRight, Mail, Loader2, ArrowLeft, Smile, Check, Eye, EyeOff, Info } from 'lucide-react';
import { signUpMerchant, signInMerchant } from '../lib/auth';
import { CountrySelect } from './CountrySelect';
import { createCampaign, createLocation } from '../lib/db';
import { supabase } from '../lib/supabase';
import { Turnstile } from './Turnstile';
import { verifyTurnstile } from '../services/turnstile';

const NOTION_COLORS = [
  { name: 'Default', hex: '#37352F' },
  { name: 'Gray', hex: '#9B9A97' },
  { name: 'Brown', hex: '#64473A' },
  { name: 'Orange', hex: '#D9730D' },
  { name: 'Yellow', hex: '#DFAB01' },
  { name: 'Green', hex: '#0F7B6C' },
  { name: 'Blue', hex: '#0B6E99' },
  { name: 'Purple', hex: '#6940A5' },
  { name: 'Pink', hex: '#AD1A72' },
  { name: 'Red', hex: '#E03E3E' },
];

const EMOJI_LIST = [
  '☕️', '🍔', '🍕', '🥗', '🍦', '🍩', '🍪', '🥐', '🥪', '🌮',
  '🍣', '🍱', '🍛', '🍜', '🍝', '🍷', '🍺', '🍸', '💇‍♀️', '💅',
  '💆‍♀️', '💈', '🏋️', '🧘', '🚲', '🚗', '📚', '🧸', '🎸', '🎮',
  '🧵', '🧶', '🎨', '📷', '💐', '🪴', '👗', '👠', '👓', '🛍️',
];

interface OnboardingProps {
  onComplete: () => void;
  /** Which screen to open on. Defaults to the signup form. */
  initialStep?: 'FORM' | 'LOGIN' | 'FINISH';
  /** Optional: show a back button that returns to the landing page. */
  onBack?: () => void;
}

/**
 * Merchant signup with two steps:
 *  1) Account & business details (collected in one form)
 *  2) Wait for email confirmation OR proceed directly if confirmations are off
 *
 * After signup, we create the campaign. If Supabase is configured to
 * require email confirmation, we ask the user to confirm before campaign
 * creation (because they need to be authenticated for RLS to allow the
 * insert). Otherwise we create immediately.
 */
export function MerchantOnboarding({ onComplete, initialStep = 'FORM', onBack }: OnboardingProps) {
  const [step, setStep] = useState<'FORM' | 'CHECK_EMAIL' | 'LOGIN' | 'THANK_YOU' | 'FINISH'>(() => {
    // Survive the remount caused by signing out right after signup, so the
    // thank-you screen shows instead of bouncing back to the empty form.
    try { if (sessionStorage.getItem('sf_just_registered') === '1') return 'THANK_YOU'; } catch { /* ignore */ }
    return initialStep;
  });
  const clearRegFlags = () => {
    try {
      sessionStorage.removeItem('sf_just_registered');
      sessionStorage.removeItem('sf_registered_email');
      sessionStorage.removeItem('sf_registered_business');
    } catch { /* ignore */ }
  };

  const [email, setEmail] = useState(() => {
    try { return sessionStorage.getItem('sf_registered_email') ?? ''; } catch { return ''; }
  });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busName, setBusName] = useState(() => {
    try { return sessionStorage.getItem('sf_registered_business') ?? ''; } catch { return ''; }
  });
  const [country, setCountry] = useState<string>('');
  const [offerTitle, setOfferTitle] = useState('Buy 6, get 1 free');
  const [logoText, setLogoText] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedColor, setSelectedColor] = useState(NOTION_COLORS[0].hex);
  const [selectedIcon, setSelectedIcon] = useState('☕️');
  const [maxStamps, setMaxStamps] = useState(0);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  // Primary location name. Defaults to the business name so single-
  // location merchants don't have to think about it; multi-location ones
  // can give the first location a meaningful name (e.g. "Mitte branch").
  const [primaryLocationName, setPrimaryLocationName] = useState('');
  // Consent state. termsAccepted blocks signup; marketingOptIn is purely
  // optional (default false per GDPR Article 7 — explicit opt-in only).
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [dpaAccepted, setDpaAccepted] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  // Turnstile (anti-bot) token. null until the widget verifies; the
  // submit button is gated on this so bots can't bypass the check by
  // simply clicking before it fires.
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createCampaignForCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const campaign = await createCampaign({
      merchantId: user.id,
      businessName: busName,
      offerTitle,
      description: `Join ${busName} rewards.`,
      maxStamps,
      primaryColor: selectedColor,
      backgroundColor: '#F5F5F0',
      logoText: logoText || busName.substring(0, 10).toUpperCase(),
      cardPattern: 'solid',
      customIcon: selectedIcon,
      logoImage: null,
    });
    // Always create a first location so the campaign is immediately usable
    // by the scanner. If the merchant didn't customise the name, default
    // to the business name (single-location case).
    await createLocation({
      campaignId: campaign.id,
      name: primaryLocationName.trim() || busName,
    });
  };

  const handleSignup = async () => {
    setError(null);
    if (!busName || !email || !password || !country) return;
    if (!maxStamps || maxStamps < 1) {
      setError('Please set how many stamps a customer needs to earn the reward (at least 1).');
      return;
    }
    if (!termsAccepted || !privacyAccepted || !dpaAccepted) {
      setError('Please accept the Terms, Privacy Policy, and Data Processing Agreement to continue.');
      return;
    }
    if (!turnstileToken) {
      setError('Please complete the security check.');
      return;
    }
    setLoading(true);
    try {
      // Verify the Turnstile token server-side BEFORE creating an account.
      // verifyTurnstile fails open on infra issues so legitimate users
      // aren't blocked by a Cloudflare outage.
      const ok = await verifyTurnstile(turnstileToken);
      if (!ok) {
        setError('Security check failed. Please try again.');
        setTurnstileToken(null);
        setLoading(false);
        return;
      }
      const { needsEmailConfirmation } = await signUpMerchant(
        email, password, busName, country, marketingOptIn, phone,
      );
      if (needsEmailConfirmation) {
        // Can't create the campaign yet (RLS needs a session). Save form
        // values in sessionStorage for after confirmation.
        sessionStorage.setItem(
          'pending_campaign',
          JSON.stringify({
            busName, offerTitle, maxStamps, selectedColor, selectedIcon, logoText,
            primaryLocationName: primaryLocationName.trim() || busName,
          }),
        );
        setStep('CHECK_EMAIL');
      } else {
        // Session is live. Set the post-signup flag FIRST. The app's auth
        // listener re-renders the moment this session appears and unmounts
        // this component; the step initializer reads this flag on remount to
        // restore the thank-you screen. Setting it only after the awaits
        // below meant the remount found no flag and bounced the merchant back
        // to the empty signup form (which looked like the page reloading).
        try {
          sessionStorage.setItem('sf_just_registered', '1');
          sessionStorage.setItem('sf_registered_email', email);
          sessionStorage.setItem('sf_registered_business', busName);
        } catch { /* ignore */ }
        // Create the campaign (starts as 'pending' review), then sign out so
        // the merchant sees the thank-you message and signs in fresh, rather
        // than being dropped into an unreviewed dashboard.
        await createCampaignForCurrentUser();
        await supabase.auth.signOut();
        setStep('THANK_YOU');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchToLogin = () => {
    setError(null);
    setStep('LOGIN');
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setError(null);
    setLoading(true);
    try {
      await signInMerchant(email, password);
      clearRegFlags();
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  // ----- THANK_YOU step (shown right after a successful signup) -----
  if (step === 'THANK_YOU') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6 text-[#37352F]">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 bg-blue-50 rounded-full mx-auto flex items-center justify-center text-blue-600 border border-blue-100">
            <Info className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-serif-display font-semibold">Thank you for registering!</h1>
          <p className="text-gray-500 leading-relaxed">
            Your business <strong className="text-[#37352F]">{busName || 'account'}</strong> has been registered.
          </p>
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800 text-left flex items-start gap-2.5">
            <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>
              We'll review your business within <strong>24 hours</strong> and approve or reject it. You can sign in now and start setting things up — you'll see your approval status on the dashboard.
            </span>
          </div>
          <button
            onClick={() => { clearRegFlags(); handleSwitchToLogin(); }}
            className="w-full bg-[#37352F] text-white py-3 rounded-md font-medium hover:bg-opacity-90 transition"
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  // ----- CHECK_EMAIL step -----
  if (step === 'CHECK_EMAIL') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6 text-[#37352F]">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 bg-blue-50 rounded-full mx-auto flex items-center justify-center text-blue-600 border border-blue-100">
            <Mail className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-serif-display font-semibold">Check your email</h1>
          <p className="text-gray-500 leading-relaxed">
            We sent a confirmation link to <strong className="text-[#37352F]">{email}</strong>.
            Click it to activate your workspace, then come back here and sign in.
          </p>
          <div className="bg-[#F7F7F5] border notion-border rounded-lg p-4 text-xs text-gray-500 text-left">
            <strong>Heads up:</strong> Your workspace details ({busName}, {maxStamps} stamps)
            will be set up automatically the first time you sign in after confirming.
          </div>
          <button
            onClick={handleSwitchToLogin}
            className="w-full bg-[#37352F] text-white py-3 rounded-md font-medium hover:bg-opacity-90 transition"
          >
            I've confirmed - sign me in
          </button>
        </div>
      </div>
    );
  }

  // ----- LOGIN step (for users coming back from email confirmation) -----
  if (step === 'LOGIN') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6 text-[#37352F]">
        <div className="max-w-md w-full space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-serif-display font-semibold">Sign in</h1>
            <p className="text-gray-500 text-sm">Enter the credentials you just created.</p>
          </div>
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase text-gray-400 tracking-wider">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#F7F7F5] border notion-border rounded-md px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#37352F]/20"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase text-gray-400 tracking-wider">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#F7F7F5] border notion-border rounded-md px-4 py-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-[#37352F]/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {error && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-100 p-2 rounded">{error}</div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#37352F] text-white py-3 rounded-md font-medium hover:bg-opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sign In'}
            </button>
          </form>
          <button
            onClick={() => { clearRegFlags(); setStep('FORM'); }}
            className="w-full text-xs text-gray-500 hover:text-[#37352F] flex items-center justify-center gap-1"
          >
            <ArrowLeft className="w-3 h-3" /> Back to signup
          </button>
        </div>
      </div>
    );
  }

  // ----- FORM step -----
  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6 text-[#37352F]">
      <div className="max-w-xl w-full">
        {onBack && (
          <button
            onClick={onBack}
            className="mb-6 text-sm text-gray-500 hover:text-[#37352F] flex items-center gap-1 transition"
          >
            <ArrowLeft className="w-4 h-4" /> Back to home
          </button>
        )}
        <div className="mb-10 text-center">
          <div className="flex items-center justify-center mb-4 text-[#37352F]">
            <svg viewBox="0 0 282 90" className="h-11 w-auto" fill="currentColor" role="img" aria-label="Stampfix"><rect x="8" y="12" width="66" height="66" rx="4"/><circle cx="140" cy="45" r="34"/><rect x="195" y="36" width="90" height="18" rx="9" transform="rotate(45 240 45)"/><rect x="195" y="36" width="90" height="18" rx="9" transform="rotate(-45 240 45)"/></svg>
          </div>
          <div className="h-1.5 w-16 rounded-full mx-auto mb-4" style={{ background: 'linear-gradient(90deg,#75FBFD,#1132F5,#510AF5,#EA33B6,#EA3323,#F0A479,#F7CE46,#75FBFD)' }} />
          <h2 className="text-3xl font-serif-display font-semibold mb-2">Create your workspace</h2>
          <p className="text-gray-500">Set up your business&rsquo;s loyalty program in under a minute.</p>
        </div>

        <div className="bg-white rounded-lg p-8 shadow-sm border notion-border space-y-8">
          {/* Account */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase text-gray-400 tracking-wider border-b notion-border pb-2">Account Details</h3>
            <div className="space-y-1">
              <label className="text-sm font-medium">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#F7F7F5] border-b notion-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                placeholder="merchant@example.com"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">
                Phone Number <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <PhoneField onChange={setPhone} />
              <p className="text-xs text-gray-500">
                Strongly recommended — it's how we reach you fast for account recovery and any urgent issue affecting your loyalty program.
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#F7F7F5] border-b notion-border rounded px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                  placeholder="At least 6 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Business */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase text-gray-400 tracking-wider border-b notion-border pb-2">Business Details</h3>
            <div className="space-y-1">
              <label className="text-sm font-medium">Business Name</label>
              <input
                value={busName}
                onChange={(e) => setBusName(e.target.value)}
                className="w-full bg-[#F7F7F5] border-b notion-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                placeholder="e.g. Bella's Salon"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium flex items-center gap-1.5">
                Primary location
                <span className="text-[10px] text-gray-400 font-normal uppercase tracking-wider">Optional</span>
              </label>
              <input
                value={primaryLocationName}
                onChange={(e) => setPrimaryLocationName(e.target.value)}
                className="w-full bg-[#F7F7F5] border-b notion-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                placeholder={busName || 'e.g. Downtown branch, or just your shop name'}
              />
              <p className="text-[11px] text-gray-400">If you have multiple branches with the same name, name this one (e.g. "Downtown"). You can add more locations later in Settings.</p>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Country</label>
              <div className="pt-1">
                <CountrySelect value={country} onChange={setCountry} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Logo Text</label>
              <input
                value={logoText}
                onChange={(e) => setLogoText(e.target.value)}
                className="w-full bg-[#F7F7F5] border-b notion-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                placeholder="ACME"
                maxLength={10}
              />
              <div className="flex gap-2 items-start text-[11px] text-blue-800 bg-blue-50 border border-blue-200 rounded-md p-2 mt-1.5">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-500" />
                <span>This short text shows at the very top of your card &mdash; next to your logo &mdash; in both Apple Wallet and Google Wallet.</span>
              </div>
            </div>
          </div>

          {/* Rules */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase text-gray-400 tracking-wider border-b notion-border pb-2">Loyalty Rules</h3>
            <div className="space-y-1">
              <label className="text-sm font-medium">Offer Title</label>
              <input
                value={offerTitle}
                onChange={(e) => setOfferTitle(e.target.value)}
                className="w-full bg-[#F7F7F5] border-b notion-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                placeholder="e.g. Buy 8, get 1 free"
              />
              <div className="flex gap-2 items-start text-[11px] text-blue-800 bg-blue-50 border border-blue-200 rounded-md p-2 mt-1.5">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-500" />
                <span>Describe the reward in your customers&rsquo; words. e.g. <b>&ldquo;Buy 8 coffees, get 1 free&rdquo;</b> or <b>&ldquo;Order 6 times, get a dessert on us.&rdquo;</b></span>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Number of stamps to earn a reward</label>
              <input
                type="number"
                min={1}
                max={20}
                value={maxStamps === 0 ? '' : maxStamps}
                onChange={(e) => setMaxStamps(parseInt(e.target.value) || 0)}
                className="w-full bg-[#F7F7F5] border-b notion-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                placeholder="e.g. 8"
              />
              <div className="flex gap-2 items-start text-[11px] text-blue-800 bg-blue-50 border border-blue-200 rounded-md p-2 mt-1.5">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-500" />
                <span>How many stamps a customer collects before the reward unlocks. e.g. <b>8</b> means they buy 8 and the 9th is free.</span>
              </div>
            </div>
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 p-3 rounded">{error}</div>
          )}

          {/* Consent block — GDPR Article 13 (information) + Article 7
              (explicit opt-in for marketing). Terms acceptance is required;
              marketing is genuinely optional. */}
          <div className="space-y-2.5 pt-2">
            <div className="flex justify-between items-center">
              <span className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Legal</span>
              <button
                type="button"
                onClick={() => {
                  const allOn = termsAccepted && privacyAccepted && dpaAccepted;
                  setTermsAccepted(!allOn);
                  setPrivacyAccepted(!allOn);
                  setDpaAccepted(!allOn);
                }}
                className="text-[11px] text-gray-500 underline hover:text-[#37352F]"
              >
                {termsAccepted && privacyAccepted && dpaAccepted ? 'Uncheck all' : 'Accept all required'}
              </button>
            </div>
            <ConsentCheckbox
              checked={termsAccepted}
              onChange={setTermsAccepted}
              required
              label={<>I agree to the <a href="/terms" target="_blank" className="underline">Terms of Service</a>.</>}
            />
            <ConsentCheckbox
              checked={privacyAccepted}
              onChange={setPrivacyAccepted}
              required
              label={<>I've read the <a href="/privacy" target="_blank" className="underline">Privacy Policy</a>.</>}
            />
            <ConsentCheckbox
              checked={dpaAccepted}
              onChange={setDpaAccepted}
              required
              label={
                <>I accept the <a href="/dpa" target="_blank" className="underline">Data Processing Agreement</a>
                {country === 'DE' && <span className="text-gray-500"> (required for GDPR compliance)</span>}.</>
              }
            />
            <ConsentCheckbox
              checked={marketingOptIn}
              onChange={setMarketingOptIn}
              label={<span className="text-gray-500">Send me product updates and tips by email (optional).</span>}
            />
          </div>

          {/* Anti-bot challenge. Renders nothing if no Turnstile site key
              is configured (dev/preview), in which case the form still
              works but you're trusting your audience. */}
          <Turnstile
            onVerify={setTurnstileToken}
            onError={() => setTurnstileToken(null)}
          />

          <button
            onClick={handleSignup}
            disabled={!busName || !email || !password || !country || !termsAccepted || !turnstileToken || loading}
            className="w-full bg-[#37352F] text-white py-3 rounded hover:bg-opacity-90 transition font-medium disabled:opacity-50 shadow-sm flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
              <>Create Workspace <ArrowRight className="w-4 h-4" /></>
            )}
          </button>

          <div className="pt-4 border-t notion-border flex justify-center">
            <button
              onClick={handleSwitchToLogin}
              className="text-sm text-gray-500 hover:text-[#37352F] transition-colors"
            >
              Already have an account? <span className="text-[#37352F] font-medium border-b border-gray-300">Sign in</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Helper called from MerchantApp after a confirmed-and-logged-in user
 * with no campaign appears. Picks up the pending values from sessionStorage
 * and creates the campaign.
 */
export async function consumePendingCampaign(userId: string): Promise<boolean> {
  const raw = sessionStorage.getItem('pending_campaign');
  if (!raw) return false;
  try {
    const p = JSON.parse(raw);
    const campaign = await createCampaign({
      merchantId: userId,
      businessName: p.busName,
      offerTitle: p.offerTitle,
      description: `Join ${p.busName} rewards.`,
      maxStamps: p.maxStamps,
      primaryColor: p.selectedColor,
      backgroundColor: '#F5F5F0',
      logoText: p.logoText || p.busName.substring(0, 10).toUpperCase(),
      cardPattern: 'solid',
      customIcon: p.selectedIcon,
      logoImage: null,
    });
    await createLocation({
      campaignId: campaign.id,
      name: p.primaryLocationName || p.busName,
    });
    sessionStorage.removeItem('pending_campaign');
    return true;
  } catch {
    sessionStorage.removeItem('pending_campaign');
    return false;
  }
}

function ConsentCheckbox({
  checked, onChange, label, required,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="flex gap-2.5 cursor-pointer group items-start">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 rounded border-gray-300 text-[#37352F] focus:ring-1 focus:ring-gray-300 cursor-pointer flex-shrink-0"
      />
      <span className="text-xs text-gray-600 leading-relaxed">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
    </label>
  );
}
