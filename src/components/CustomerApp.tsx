import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Loader2, LogOut } from 'lucide-react';
import type { Campaign, UserCard } from '../types';
import { useAuth, sendCustomerMagicLink, verifyCustomerOtp, signOut } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { getCampaignById, getCardForCustomer, createCard } from '../lib/db';
import { WalletCard } from './WalletCard';
import { Turnstile } from './Turnstile';
import { verifyTurnstile } from '../services/turnstile';

interface CustomerAppProps {
  campaignId: string;
  /** Optional: location id from `?location=` URL param. When set, the
   *  customer's card is tagged with the branch they joined at, so the
   *  merchant can see which location drove the signup. */
  joinedLocationId?: string | null;
  onExit: () => void;
}

/**
 * Customer-facing flow:
 *
 *  - Load the campaign by id (public read allowed by RLS)
 *  - If not signed in     -> magic-link signup form
 *  - If signed in but no card on this campaign -> auto-create one, then show wallet
 *  - If signed in and has card -> show wallet
 *
 * Magic link flow: user enters email, we call signInWithOtp, Supabase
 * sends them an email with a link back to `?campaign=<id>`. When they
 * click it, they land here authenticated.
 */
export function CustomerApp({ campaignId, joinedLocationId, onExit }: CustomerAppProps) {
  const { user, loading: authLoading } = useAuth();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [card, setCard] = useState<UserCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Magic-link form state
  const [formData, setFormData] = useState({ firstName: '', surname: '', email: '', age: '' });
  const [isSendingLink, setIsSendingLink] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  // Turnstile token gating the magic-link send.
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  // Consent: required (terms + data processing) and optional (marketing).
  // Without termsAccepted = true, the submit button stays disabled.
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [showPrivacyNotice, setShowPrivacyNotice] = useState(false);

  // 1) Load campaign on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const c = await getCampaignById(campaignId);
        if (mounted) setCampaign(c);
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : 'Could not load campaign');
      }
    })();
    return () => {
      mounted = false;
    };
  }, [campaignId]);

  // 2) Once auth is resolved AND campaign loaded, look for the user's card.
  //    If none exists yet, create one using the form data we stashed in
  //    sessionStorage before sending the magic link.
  useEffect(() => {
    if (authLoading) return;
    if (!campaign) return;

    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        if (!user) {
          setCard(null);
          return;
        }
        let existing = await getCardForCustomer(campaign.id, user.id);
        if (!existing) {
          // Resolve signup details. Three sources, in priority order:
          //   1. sessionStorage (same-tab signup → magic link click)
          //   2. pending_customer_signups table (cross-tab, survives
          //      Gmail-app-opens-new-window flow)
          //   3. Auth user email/metadata as last-resort fallback
          let name = user.email?.split('@')[0] ?? 'Customer';
          let age: number | null = null;
          let consentGiven = false;
          let marketing = false;
          let pendingRowId: string | null = null;
          let resolvedJoinedLocationId: string | null = joinedLocationId ?? null;

          const pendingRaw = sessionStorage.getItem('pending_customer_signup');
          if (pendingRaw) {
            try {
              const p = JSON.parse(pendingRaw);
              name = `${p.firstName} ${p.surname}`.trim() || name;
              age = p.age ? parseInt(p.age) : null;
              consentGiven = p.termsAccepted === true;
              marketing = p.marketingOptIn === true;
            } catch {
              // ignore
            }
          } else if (user.email) {
            // Cross-tab fallback: look up pending signup by email + campaign.
            // RLS on the table is permissive enough that an authenticated user
            // can read their own pending row.
            const { data: pending } = await supabase
              .from('pending_customer_signups')
              .select('*')
              .ilike('email', user.email)
              .eq('campaign_id', campaign.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (pending) {
              pendingRowId = pending.id;
              name = `${pending.first_name ?? ''} ${pending.surname ?? ''}`.trim() || name;
              age = pending.age ?? null;
              consentGiven = pending.terms_accepted === true;
              marketing = pending.marketing_opt_in === true;
              if (!resolvedJoinedLocationId && pending.joined_location_id) {
                resolvedJoinedLocationId = pending.joined_location_id;
              }
            }
          }

          existing = await createCard({
            campaignId: campaign.id,
            customerId: user.id,
            customerName: name,
            email: user.email ?? '',
            age,
            joinedAtLocationId: resolvedJoinedLocationId,
            customerConsentAt: consentGiven ? new Date().toISOString() : null,
            marketingOptIn: marketing,
          });
          sessionStorage.removeItem('pending_customer_signup');
          // Consume the pending row so it doesn't linger after card creation
          if (pendingRowId) {
            await supabase.from('pending_customer_signups').delete().eq('id', pendingRowId);
          }
        }
        if (mounted) setCard(existing);
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : 'Could not load card');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [authLoading, campaign, user]);

  const handleSendLink = async () => {
    if (!formData.firstName || !formData.email) return;
    if (!turnstileToken) {
      setError('Please complete the security check.');
      return;
    }
    setError(null);
    setIsSendingLink(true);
    try {
      const ok = await verifyTurnstile(turnstileToken);
      if (!ok) {
        setError('Security check failed. Please try again.');
        setTurnstileToken(null);
        setIsSendingLink(false);
        return;
      }
      // Stash form + consent flags in BOTH sessionStorage (fast path for
      // same-tab callback) and the pending_customer_signups table
      // (cross-tab fallback for when the magic link opens in a new
      // tab/window via Gmail app etc).
      sessionStorage.setItem('pending_customer_signup', JSON.stringify({
        ...formData,
        termsAccepted,
        marketingOptIn,
      }));

      // DB persistence — upsert so re-submitting the form overwrites.
      // Non-blocking: if this fails for any reason we still proceed with
      // the magic-link flow; the sessionStorage path will likely cover
      // same-tab usage. We log so we know if the cross-tab path is broken.
      try {
        const { error: pendingErr } = await supabase
          .from('pending_customer_signups')
          .upsert({
            email: formData.email.toLowerCase(),
            campaign_id: campaignId,
            first_name: formData.firstName,
            surname: formData.surname || null,
            age: formData.age ? parseInt(formData.age) : null,
            joined_location_id: joinedLocationId ?? null,
            terms_accepted: termsAccepted,
            marketing_opt_in: marketingOptIn,
          }, { onConflict: 'email,campaign_id' });
        if (pendingErr) console.warn('[signup] could not persist pending row:', pendingErr);
      } catch (e) {
        console.warn('[signup] pending persist threw:', e);
      }
      await sendCustomerMagicLink(formData.email, campaignId);
      setLinkSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send sign-in link');
    } finally {
      setIsSendingLink(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    onExit();
  };

  // ----- Loading -----
  if (!campaign && !error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }
  if (error || !campaign) {
    // Special-case the free-tier limit error so it doesn't look like a
    // bug. This is a "soft" block — the merchant just needs to upgrade.
    const isLimitError = error?.toLowerCase().includes('currently full')
                       || error?.toLowerCase().includes('free-tier');
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-6 text-center">
        <div className="max-w-md space-y-5">
          {isLimitError ? (
            <>
              <div className="text-5xl">🎉</div>
              <h2 className="text-2xl font-serif-display font-semibold">This program is popular!</h2>
              <p className="text-gray-600 leading-relaxed">
                The loyalty program is currently at capacity. Please ask the staff to upgrade their
                Stampfix account so you can join.
              </p>
              <p className="text-xs text-gray-400">
                Existing customers can still collect stamps as normal.
              </p>
            </>
          ) : (
            <p className="text-gray-500">{error || 'No campaign found for this link.'}</p>
          )}
          <button onClick={onExit} className="text-blue-600 hover:underline">Return Home</button>
        </div>
      </div>
    );
  }

  // ----- Not authenticated: magic link form -----
  if (!user) {
    if (linkSent) {
      return (
        <div className="min-h-screen bg-white flex items-center justify-center p-6 text-[#37352F]">
          <div className="max-w-sm w-full space-y-6">
            <div className="text-center space-y-3">
              <div className="text-5xl">📬</div>
              <h1 className="text-2xl font-serif-display font-semibold">Enter your code</h1>
              <p className="text-gray-500 text-sm leading-relaxed">
                We sent a 6-digit code to <strong className="text-[#37352F]">{formData.email}</strong>.
                Type it below to finish creating your loyalty card.
              </p>
            </div>
            <SignupOtpForm
              email={formData.email}
              onBack={() => { setLinkSent(false); setFormData({ ...formData, email: '' }); }}
            />
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-[#37352F]">
        <button onClick={onExit} className="absolute top-6 left-6 text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="max-w-sm w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 bg-[#F7F7F5] rounded-md mx-auto flex items-center justify-center text-xl border notion-border mb-4">
              {campaign.customIcon || '👋'}
            </div>
            <h1 className="text-2xl font-serif-display font-semibold">Join {campaign.businessName}</h1>
            <p className="text-gray-500 text-sm">{campaign.offerTitle}</p>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase text-gray-400 tracking-wider">First Name</label>
                <input
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className="w-full bg-[#F7F7F5] border notion-border rounded-md px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-gray-400 placeholder-gray-300"
                  placeholder="Jane"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase text-gray-400 tracking-wider">Surname</label>
                <input
                  value={formData.surname}
                  onChange={(e) => setFormData({ ...formData, surname: e.target.value })}
                  className="w-full bg-[#F7F7F5] border notion-border rounded-md px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-gray-400 placeholder-gray-300"
                  placeholder="Doe"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase text-gray-400 tracking-wider">Email Address</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full bg-[#F7F7F5] border notion-border rounded-md px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-gray-400 placeholder-gray-300"
                placeholder="jane@example.com"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase text-gray-400 tracking-wider">Age (optional)</label>
              <input
                type="number"
                value={formData.age}
                onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                className="w-full bg-[#F7F7F5] border notion-border rounded-md px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-gray-400 placeholder-gray-300"
                placeholder="25"
              />
            </div>

            {error && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-100 p-2 rounded">{error}</div>
            )}

            {/* Consent — required by GDPR. Customer must explicitly tick this. */}
            <div className="space-y-2.5 pt-2 border-t notion-border">
              <label className="flex items-start gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[#37352F] flex-shrink-0"
                />
                <span className="text-xs text-gray-600 leading-relaxed">
                  I agree to {campaign.businessName}'s{' '}
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setShowPrivacyNotice(true); }}
                    className="underline text-[#37352F] font-medium"
                  >
                    privacy notice
                  </button>
                  {' '}and{' '}
                  <a href="/terms" target="_blank" rel="noreferrer" className="underline text-[#37352F] font-medium">
                    Stampfix's terms
                  </a>
                  .
                </span>
              </label>
              <label className="flex items-start gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={marketingOptIn}
                  onChange={(e) => setMarketingOptIn(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[#37352F] flex-shrink-0"
                />
                <span className="text-xs text-gray-500 leading-relaxed">
                  Send me marketing emails from {campaign.businessName} (optional).
                </span>
              </label>
            </div>

            <Turnstile
              onVerify={setTurnstileToken}
              onError={() => setTurnstileToken(null)}
            />

            <button
              onClick={handleSendLink}
              disabled={!formData.firstName || !formData.email || !turnstileToken || !termsAccepted || isSendingLink}
              className="w-full bg-[#37352F] text-white py-3 rounded-md font-medium hover:bg-opacity-90 transition disabled:opacity-50 shadow-sm flex items-center justify-center gap-2 mt-2"
            >
              {isSendingLink ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <>Send me a link <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
            <p className="text-[10px] text-gray-400 text-center">
              We'll email you a single-use sign-in link. No password needed.
            </p>
          </div>
        </div>

        {/* Privacy notice modal */}
        {showPrivacyNotice && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowPrivacyNotice(false)}>
            <div className="bg-white rounded-t-xl sm:rounded-xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="sticky top-0 bg-white border-b notion-border px-5 py-3 flex items-center justify-between">
                <h3 className="font-semibold">{campaign.businessName} — Privacy notice</h3>
                <button onClick={() => setShowPrivacyNotice(false)} className="text-gray-400 hover:text-[#37352F] text-xl leading-none">&times;</button>
              </div>
              <div className="px-5 py-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {campaign.customerPrivacyNotice ?? (
                  <>
                    <p>{campaign.businessName} collects your name and email to operate their loyalty program. They use this information solely for the purpose of tracking your stamps, sending reward notifications, and (with your consent) sending marketing communications.</p>
                    <p className="mt-3">{campaign.businessName} has not yet published a custom privacy notice. For Stampfix's general data handling practices, see our <a href="/privacy" className="underline">platform privacy policy</a>.</p>
                    <p className="mt-3">You can request deletion of your data at any time from the "My Card" page.</p>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ----- Authenticated, loading card -----
  if (loading || !card) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  // ----- Wallet view -----
  return (
    <div className="min-h-screen bg-[#F7F7F5] flex flex-col font-sans text-[#37352F]">
      <header className="bg-white border-b notion-border px-6 py-4 flex justify-between items-center sticky top-0 z-20">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <div className="w-6 h-6 rounded text-white flex items-center justify-center text-xs"
            style={{ backgroundColor: campaign.primaryColor }}>
            {campaign.businessName.charAt(0)}
          </div>
          <span>{campaign.businessName}</span>
        </div>
        <button onClick={handleSignOut} className="text-xs text-gray-500 hover:text-red-500 transition flex items-center gap-1">
          <LogOut className="w-3 h-3" /> Sign out
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-start pt-12 p-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20 overflow-y-auto">
        <div className="text-center mb-8 space-y-2">
          <h1 className="text-3xl font-serif-display font-semibold">Your Digital Card</h1>
          <p className="text-gray-500 text-sm max-w-xs mx-auto">
            Save to Google Wallet for quick access on Android.
          </p>
        </div>

        <div className="w-full max-w-[340px]">
          <WalletCard campaign={campaign} card={card} />
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4 w-full max-w-[340px] text-center">
          <div className="bg-white p-4 rounded-lg border notion-border shadow-sm">
            <div className="font-bold text-2xl mb-1 text-[#37352F]">{card.currentStamps}</div>
            <div className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Stamps</div>
          </div>
          <div className="bg-white p-4 rounded-lg border notion-border shadow-sm">
            <div className="font-bold text-2xl mb-1 text-[#37352F]">{campaign.maxStamps - card.currentStamps}</div>
            <div className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">To Go</div>
          </div>
        </div>

        <div className="mt-8 text-center max-w-xs">
          <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-2">Instructions</p>
          <p className="text-xs text-gray-500">
            Present the QR code on your card to the cashier at <strong>{campaign.businessName}</strong> to collect stamps and redeem rewards.
          </p>
        </div>

        <div className="mt-6 max-w-xs w-full bg-[#F7F7F5] border notion-border rounded-lg p-3 text-center">
          <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-1.5">Coming back later?</p>
          <p className="text-xs text-gray-600 leading-relaxed">
            Visit <a href="/my-card" className="text-[#37352F] font-medium underline">stampfix.app/my-card</a> and enter this same email to find your card again.
          </p>
        </div>
      </main>
    </div>
  );
}

// ----- 6-digit OTP code entry form ---------------------------------------

/**
 * After the signup form is submitted we send a 6-digit OTP code (not a
 * magic link) — Gmail's link-scanner consumes magic-link OTPs before
 * the human clicks, breaking auth. Typed codes are scanner-proof.
 */
function SignupOtpForm({ email, onBack }: { email: string; onBack: () => void }) {
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleVerify = async () => {
    const cleaned = code.replace(/\D/g, '');
    if (cleaned.length !== 6) { setErr('Enter the 6-digit code from your email'); return; }
    setErr(null);
    setVerifying(true);
    try {
      await verifyCustomerOtp(email, cleaned);
      // useAuth's onAuthStateChange picks up the new session and the
      // page re-renders into the signed-in branch automatically.
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Invalid or expired code');
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-3">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        onKeyDown={(e) => { if (e.key === 'Enter' && code.length === 6) handleVerify(); }}
        placeholder="123456"
        autoFocus
        maxLength={6}
        className="w-full bg-[#F7F7F5] border notion-border rounded-md px-4 py-3 text-lg tracking-[0.5em] text-center font-mono focus:outline-none focus:ring-2 focus:ring-[#37352F]/20"
      />
      {err && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-100 p-2 rounded">{err}</div>
      )}
      <button
        onClick={handleVerify}
        disabled={code.length !== 6 || verifying}
        className="w-full bg-[#37352F] text-white py-3 rounded-md font-medium text-sm hover:bg-opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify code'}
      </button>
      <button onClick={onBack} className="w-full text-xs text-gray-500 hover:underline">
        Used the wrong email?
      </button>
    </div>
  );
}
