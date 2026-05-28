import { useState } from 'react';
import { ArrowRight, Mail, Loader2, ArrowLeft, Smile, Check } from 'lucide-react';
import { signUpMerchant, signInMerchant } from '../lib/auth';
import { createCampaign } from '../lib/db';
import { supabase } from '../lib/supabase';

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
export function MerchantOnboarding({ onComplete, initialStep = 'FORM' }: OnboardingProps) {
  const [step, setStep] = useState<'FORM' | 'CHECK_EMAIL' | 'LOGIN'>(initialStep);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busName, setBusName] = useState('');
  const [offerTitle, setOfferTitle] = useState('Buy 6 coffee, get 1 free');
  const [logoText, setLogoText] = useState('');
  const [selectedColor, setSelectedColor] = useState(NOTION_COLORS[0].hex);
  const [selectedIcon, setSelectedIcon] = useState('☕️');
  const [maxStamps, setMaxStamps] = useState(6);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createCampaignForCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    await createCampaign({
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
  };

  const handleSignup = async () => {
    setError(null);
    if (!busName || !email || !password) return;
    setLoading(true);
    try {
      const { needsEmailConfirmation } = await signUpMerchant(email, password, busName);
      if (needsEmailConfirmation) {
        // Can't create the campaign yet (RLS needs a session). Save form
        // values in sessionStorage for after confirmation.
        sessionStorage.setItem(
          'pending_campaign',
          JSON.stringify({ busName, offerTitle, maxStamps, selectedColor, selectedIcon, logoText }),
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
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#F7F7F5] border notion-border rounded-md px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#37352F]/20"
              />
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
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#F7F7F5] border-b notion-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                placeholder="At least 6 characters"
              />
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

          <button
            onClick={handleSignup}
            disabled={!busName || !email || !password || loading}
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
    await createCampaign({
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
    sessionStorage.removeItem('pending_campaign');
    return true;
  } catch {
    sessionStorage.removeItem('pending_campaign');
    return false;
  }
}
