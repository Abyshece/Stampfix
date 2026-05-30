import { useState } from 'react';
import { ArrowRight, Mail, Loader2, ArrowLeft, Smile, Check, Eye, EyeOff } from 'lucide-react';
import { signUpMerchant, signInMerchant } from '../lib/auth';
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
  initialStep?: 'FORM' | 'LOGIN';
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
  const [step, setStep] = useState<'FORM' | 'CHECK_EMAIL' | 'LOGIN'>(initialStep);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busName, setBusName] = useState('');
  const [country, setCountry] = useState<'DE' | 'CA' | ''>('');
  const [offerTitle, setOfferTitle] = useState('Buy 6 coffee, get 1 free');
  const [logoText, setLogoText] = useState('');
  const [selectedColor, setSelectedColor] = useState(NOTION_COLORS[0].hex);
  const [selectedIcon, setSelectedIcon] = useState('☕️');
  const [maxStamps, setMaxStamps] = useState(6);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  // Primary location name. Defaults to the business name so single-
  // location merchants don't have to think about it; multi-location ones
  // can give the first location a meaningful name (e.g. "Mitte branch").
  const [primaryLocationName, setPrimaryLocationName] = useState('');
  // Consent state. termsAccepted blocks signup; marketingOptIn is purely
  // optional (default false per GDPR Article 7 — explicit opt-in only).
  const [termsAccepted, setTermsAccepted] = useState(false);
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
    if (!termsAccepted) {
      setError('Please accept the Terms of Service and Privacy Policy to continue.');
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
        email, password, busName, country, marketingOptIn,
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
        // Session is live — create the campaign now.
        await createCampaignForCurrentUser();
        onComplete();
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
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

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
            <strong>Heads up:</strong> Your workspace details ({busName}, {maxStamps} stamps,{' '}
            {selectedIcon}) will be set up automatically the first time you sign in after confirming.
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
            onClick={() => setStep('FORM')}
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
          <div className="w-16 h-16 bg-[#F7F7F5] rounded-lg mx-auto flex items-center justify-center mb-4 border notion-border text-3xl">☕️</div>
          <h2 className="text-3xl font-serif-display font-semibold mb-2">Create Workspace</h2>
          <p className="text-gray-500">Set up your loyalty card in under a minute.</p>
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
                placeholder="e.g. Acme Coffee Co."
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
                placeholder={busName || 'e.g. Mitte branch, or just your shop name'}
              />
              <p className="text-[11px] text-gray-400">If you have multiple branches with the same name, name this one (e.g. "Mitte"). You can add more locations later in Settings.</p>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Country</label>
              <div className="grid grid-cols-2 gap-3 pt-1">
                {([
                  ['DE', '🇩🇪', 'Germany'],
                  ['CA', '🇨🇦', 'Canada'],
                ] as const).map(([code, flag, name]) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setCountry(code)}
                    className={`flex items-center gap-2 px-4 py-3 rounded-md border-2 text-sm font-medium transition ${
                      country === code
                        ? 'border-[#37352F] bg-[#F7F7F5]'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <span className="text-lg">{flag}</span> {name}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Logo Text</label>
                <input
                  value={logoText}
                  onChange={(e) => setLogoText(e.target.value)}
                  className="w-full bg-[#F7F7F5] border-b notion-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                  placeholder="ACME"
                  maxLength={10}
                />
              </div>
              <div className="space-y-1 relative">
                <label className="text-sm font-medium">Stamp Icon</label>
                <div className="flex gap-2">
                  <input
                    value={selectedIcon}
                    onChange={(e) => setSelectedIcon(e.target.value)}
                    className="w-full bg-[#F7F7F5] border-b notion-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 text-center"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="px-3 bg-[#F7F7F5] border-b notion-border rounded hover:bg-gray-200 flex items-center justify-center text-gray-500"
                  >
                    <Smile className="w-4 h-4" />
                  </button>
                </div>
                {showEmojiPicker && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowEmojiPicker(false)}></div>
                    <div className="absolute top-full right-0 mt-2 z-50 bg-white border notion-border shadow-xl rounded-lg p-2 w-64 h-64 overflow-y-auto grid grid-cols-5 gap-1">
                      {EMOJI_LIST.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => {
                            setSelectedIcon(emoji);
                            setShowEmojiPicker(false);
                          }}
                          className="w-10 h-10 flex items-center justify-center text-xl hover:bg-gray-100 rounded transition"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Card Color</label>
              <div className="flex flex-wrap gap-2 pt-1">
                {NOTION_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    onClick={() => setSelectedColor(c.hex)}
                    className={`w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center transition ${
                      selectedColor === c.hex ? 'ring-2 ring-offset-2 ring-gray-900 scale-110' : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: c.hex }}
                    title={c.name}
                  >
                    {selectedColor === c.hex && <Check className="w-4 h-4 text-white drop-shadow-md" />}
                  </button>
                ))}
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
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">
                Stamps: <span className="font-bold">{maxStamps}</span>
              </label>
              <input
                type="range"
                min={3}
                max={12}
                step={1}
                value={maxStamps}
                onChange={(e) => setMaxStamps(parseInt(e.target.value))}
                className="w-full accent-[#37352F] cursor-pointer"
              />
            </div>
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 p-3 rounded">{error}</div>
          )}

          {/* Consent block — GDPR Article 13 (information) + Article 7
              (explicit opt-in for marketing). Terms acceptance is required;
              marketing is genuinely optional. */}
          <div className="space-y-3 pt-2">
            <label className="flex gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-[#37352F] focus:ring-1 focus:ring-gray-300 cursor-pointer flex-shrink-0"
              />
              <span className="text-xs text-gray-600 leading-relaxed">
                I agree to the{' '}
                <a href="/terms" target="_blank" className="underline hover:text-[#37352F]">Terms of Service</a>{' '}
                and acknowledge the{' '}
                <a href="/privacy" target="_blank" className="underline hover:text-[#37352F]">Privacy Policy</a>.
                {country === 'DE' && ' Data is processed in the EU and Canada under an EU adequacy decision.'}
                <span className="text-red-500 ml-0.5">*</span>
              </span>
            </label>
            <label className="flex gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={marketingOptIn}
                onChange={(e) => setMarketingOptIn(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-[#37352F] focus:ring-1 focus:ring-gray-300 cursor-pointer flex-shrink-0"
              />
              <span className="text-xs text-gray-600 leading-relaxed">
                Send me product updates, tips, and occasional news by email.
                <span className="text-gray-400"> (optional, you can unsubscribe anytime)</span>
              </span>
            </label>
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
