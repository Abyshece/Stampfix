import { setRecoveryCode } from '../lib/db';
import { useEffect, useState, useRef, useMemo} from 'react';
import { Mail, Loader2, ArrowLeft, Smartphone, LogOut, Bookmark } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth, signOut, signUpOrInCustomer } from '../lib/auth';
import { listCardsForCustomer, getCampaignsByIds, requestCardDeletion, cancelCardDeletion, createCard } from '../lib/db';
import type { UserCard, Campaign } from '../types';
import { WalletCard } from './WalletCard';
import { Turnstile } from './Turnstile';
import { verifyTurnstile } from '../services/turnstile';
import { DownloadMyDataButton } from './DownloadMyDataButton';
import { AddToAppleWalletButton } from './AddToAppleWalletButton';
import { Logo } from './Logo';

/**
 * Self-service page where any customer can look up their loyalty cards.
 *
 * Flow:
 *   1. Not signed in -> email + magic-link form
 *   2. Magic link clicked -> redirected back here with a session
 *   3. Signed in -> shows all cards across every merchant they've joined
 *
 * A reliable way for any customer to return to their loyalty card on
 * repeat visits, and a fallback if they haven't added the card to Apple
 * Wallet or Google Wallet. Bookmarking this URL keeps the card one tap away.
 */
const WELCOME_COLORS = ['#EA3323', '#F7CE46', '#1132F5', '#75FBFD', '#EA33B6', '#510AF5'];

/** One-time welcome for a freshly-joined card (0 stamps): tells the customer to
 *  ask the counter to scan/tap the stamp QR, with a little confetti. */
function WelcomeModal({ onDismiss }: { onDismiss: () => void }) {
  const pieces = useMemo(
    () => Array.from({ length: 40 }, (_, i) => {
      const d = 2.2 + Math.random() * 1.8;
      return { id: i, left: Math.random() * 100, delay: -(Math.random() * d), duration: d, size: 6 + Math.random() * 8, color: WELCOME_COLORS[i % WELCOME_COLORS.length], rotate: Math.random() * 360, round: Math.random() > 0.5 };
    }),
    [],
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
      <style>{`@keyframes wm-fall{0%{transform:translateY(-10vh) rotate(0);opacity:0}8%{opacity:1}100%{transform:translateY(110vh) rotate(720deg);opacity:1}}`}</style>
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        {pieces.map((p) => (
          <span key={p.id} style={{ position: 'absolute', top: 0, left: `${p.left}%`, width: p.size, height: p.size, background: p.color, borderRadius: p.round ? '50%' : 2, transform: `rotate(${p.rotate}deg)`, animation: `wm-fall ${p.duration}s linear ${p.delay}s infinite` }} />
        ))}
      </div>
      <div className="relative bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 text-center">
        <div className="text-5xl mb-2">🎉</div>
        <h2 className="text-xl font-serif-display font-semibold mb-2">You&rsquo;re all set!</h2>
        <p className="text-gray-600 text-sm mb-5">Your card is saved. To collect your first stamp, ask the staff at the counter &mdash; they&rsquo;ll show you the stamp QR to scan or tap. You&rsquo;ll earn a stamp on every order.</p>
        <button onClick={onDismiss} className="w-full bg-[#37352F] text-white py-3 rounded-lg font-medium hover:bg-opacity-90 transition">Got it</button>
      </div>
    </div>
  );
}

export function MyCardPage({ onExit }: { onExit: () => void }) {
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Turnstile token for anti-bot protection on the magic-link request.
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  // True once we've emailed a sign-in code (fallback for accounts we can't
  // sign in instantly). otp holds the code the user types back in.
  const [linkSent, setLinkSent] = useState(false);
  const [otp, setOtp] = useState('');

  // Card data (once logged in)
  const [cards, setCards] = useState<UserCard[]>([]);
  const [showWelcome, setShowWelcome] = useState(false);
  const [campaignsById, setCampaignsById] = useState<Record<string, Campaign>>({});
  const [loadingCards, setLoadingCards] = useState(false);

  // Show a small "Add to Home Screen" hint on iOS for first-time visitors.
  const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);

  // ----- Load cards once authenticated -----
  const loadCards = async (signal?: { cancelled: boolean }) => {
    if (!user) return;
    setLoadingCards(true);
    try {
      // Step 1: process any pending_customer_signups for this user's email.
      // This is the bridge from the customer signup form to the actual card row.
      // The signup form persists details here; we consume them on first /my-card load.
      if (user.email) {
        try {
          const { data: pendings } = await supabase
            .from('pending_customer_signups')
            .select('*')
            .ilike('email', user.email);
          if (pendings && pendings.length > 0) {
            for (const p of pendings) {
              // Skip if a card for this user+campaign already exists
              const { data: existing } = await supabase
                .from('cards')
                .select('id')
                .eq('campaign_id', p.campaign_id)
                .eq('customer_id', user.id)
                .maybeSingle();
              if (existing) {
                // Already created — just clean up the pending row
                await supabase.from('pending_customer_signups').delete().eq('id', p.id);
                continue;
              }
              // Create the card from pending data
              const fullName = `${p.first_name ?? ''} ${p.surname ?? ''}`.trim()
                || user.email.split('@')[0];
              await createCard({
                campaignId: p.campaign_id,
                customerId: user.id,
                customerName: fullName,
                email: user.email,
                joinedAtLocationId: p.joined_location_id ?? null,
                customerConsentAt: p.terms_accepted ? new Date().toISOString() : null,
                marketingOptIn: p.marketing_opt_in === true,
              });
              await supabase.from('pending_customer_signups').delete().eq('id', p.id);
            }
          }
        } catch (e) {
          // Non-fatal: still try to load whatever cards exist
          console.warn('[my-card] pending signup processing failed:', e);
        }
      }
      if (signal?.cancelled) return;

      // Step 2: load all cards for this user (now including any just-created)
      const myCards = await listCardsForCustomer(user.id);
      if (signal?.cancelled) return;
      setCards(myCards);
      const campaignIds = Array.from(new Set(myCards.map((c) => c.campaignId)));
      const campaigns = await getCampaignsByIds(campaignIds);
      if (signal?.cancelled) return;
      const map: Record<string, Campaign> = {};
      for (const camp of campaigns) map[camp.id] = camp;
      setCampaignsById(map);
    } catch (e) {
      if (!signal?.cancelled) {
        console.error('[my-card] failed to load cards:', e);
      }
    } finally {
      if (!signal?.cancelled) setLoadingCards(false);
    }
  };

  // Capture magic-link errors that Supabase puts in the URL hash.
  // e.g. #error=access_denied&error_code=otp_expired&error_description=...
  // Without this, an expired/already-used link silently dumps the user
  // on the sign-in form and they have no idea what happened.
  const [linkError, setLinkError] = useState<string | null>(null);
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash || !hash.includes('error')) return;
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const code = params.get('error_code');
    const desc = params.get('error_description');
    if (code === 'otp_expired') {
      setLinkError(
        'That sign-in link has expired or was already used. ' +
        'Enter your email below to get a fresh link.'
      );
    } else if (code) {
      setLinkError(desc ? decodeURIComponent(desc.replace(/\+/g, ' ')) : code);
    }
    // Clean the hash so a page refresh doesn't keep showing the error
    if (code) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);

  useEffect(() => {
    if (!user) {
      setCards([]);
      setCampaignsById({});
      return;
    }
    const signal = { cancelled: false };
    loadCards(signal);
    return () => { signal.cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  /** Called by child components (DeletionRow) after a mutation, so the
   *  card list re-renders with fresh status. */
  const refresh = () => loadCards();

  // ----- Send magic link -----
  // If arriving from a stamp with the customer's email in the URL and no
  // session, sign them straight in so they land on their card (no re-typing).
  const autoRan = useRef(false);
  useEffect(() => {
    if (authLoading || user || autoRan.current) return;
    const e = new URLSearchParams(window.location.search).get('e');
    if (e && e.includes('@')) {
      autoRan.current = true;
      signUpOrInCustomer(e, '').catch(() => setEmail(e));
    }
  }, [authLoading, user]);

  useEffect(() => {
    const fresh = cards.find((c) => (c.currentStamps ?? 0) === 0);
    if (!fresh) return;
    try { if (localStorage.getItem('sf_welcome_' + fresh.id) !== '1') setShowWelcome(true); }
    catch { setShowWelcome(true); }
  }, [cards]);
  const dismissWelcome = () => {
    setShowWelcome(false);
    const fresh = cards.find((c) => (c.currentStamps ?? 0) === 0);
    if (fresh) { try { localStorage.setItem('sf_welcome_' + fresh.id, '1'); } catch { /* ignore */ } }
  };

  const handleSendLink = async () => {
    setError(null);
    if (!email.trim()) return;
    setSending(true);
    try {
      // Best-effort bot check. Never dead-end a real customer trying to reach
      // their own card: only block if Turnstile actively rejects a real token.
      // A missing or fail-open token still proceeds — the email + derived
      // password is the real authentication gate.
      if (turnstileToken) {
        const ok = await verifyTurnstile(turnstileToken);
        if (!ok) {
          setError('Security check failed. Please try again.');
          setTurnstileToken(null);
          setSending(false);
          return;
        }
      }
      try {
        // Fast path: customers who joined through a program have a derived
        // password, so we can sign them in instantly — no email round-trip.
        await signUpOrInCustomer(email.trim(), '');
        // Auth state change re-renders into the signed-in branch.
      } catch {
        // The account exists but instant sign-in doesn't apply (it was created
        // with a real password — e.g. a merchant account — or needs email
        // confirmation). Fall back to a real emailed sign-in link, which works
        // regardless of how the account was created. This is what the form
        // copy already promises.
        const { error: otpErr } = await supabase.auth.signInWithOtp({
          email: email.trim().toLowerCase(),
          options: { emailRedirectTo: `${window.location.origin}/my-card` },
        });
        if (otpErr) throw otpErr;
        setLinkSent(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign you in');
    } finally {
      setSending(false);
    }
  };

  const handleVerifyOtp = async () => {
    setError(null);
    if (otp.length < 6) return;
    setSending(true);
    const cleanEmail = email.trim().toLowerCase();
    try {
      // The email delivers a 6-digit code. Verify it directly. Try the plain
      // email-OTP type first, then the magic-link type, since projects differ
      // in which one a sign-in code is issued under.
      let res = await supabase.auth.verifyOtp({ email: cleanEmail, token: otp, type: 'email' });
      if (res.error) {
        res = await supabase.auth.verifyOtp({ email: cleanEmail, token: otp, type: 'magiclink' });
      }
      if (res.error) throw res.error;
      // Auth state change re-renders into the signed-in branch.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid or expired code. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const [newCode, setNewCode] = useState('');
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeMsg, setCodeMsg] = useState<string | null>(null);
  const [codeErr, setCodeErr] = useState(false);
  const handleChangeCode = async () => {
    if (newCode.length !== 6) return;
    setCodeBusy(true); setCodeMsg(null); setCodeErr(false);
    try {
      await setRecoveryCode(newCode);
      setCodeMsg('Recovery code updated.'); setNewCode('');
    } catch (e) {
      setCodeErr(true); setCodeMsg(e instanceof Error ? e.message : 'Could not update the code');
    } finally { setCodeBusy(false); }
  };

  const handleSignOut = async () => {
    await signOut();
    setEmail('');
  };

  // ===================================================================
  // RENDER
  // ===================================================================

  // Loading-initial-session state
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
      </div>
    );
  }

  // ---------- Not signed in: ask for email ----------
  if (!user) {
    return (
      <Shell onExit={onExit}>
        <div className="space-y-6 py-2">
          {linkError && (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-900">
              {linkError}
            </div>
          )}
          {linkSent ? (
            <div className="text-center space-y-4 py-6">
              <div className="w-12 h-12 mx-auto bg-[#37352F] rounded-full flex items-center justify-center">
                <Mail className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-2xl font-serif-display font-semibold">Check your email</h2>
              <p className="text-sm text-gray-500 leading-relaxed max-w-sm mx-auto">
                We sent a 6-digit sign-in code to <strong className="text-[#37352F]">{email}</strong>.
                Enter it below to reach your loyalty card.
              </p>
              <div className="space-y-3 max-w-[15rem] mx-auto">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  autoFocus
                  className="w-full bg-[#F7F7F5] border notion-border rounded-md px-4 py-3 text-center text-lg font-semibold tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-[#37352F]/20"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleVerifyOtp(); }}
                />
                {error && (
                  <div className="text-xs text-red-600 bg-red-50 border border-red-100 p-2 rounded">{error}</div>
                )}
                <button
                  onClick={handleVerifyOtp}
                  disabled={otp.length < 6 || sending}
                  className="w-full bg-[#37352F] text-white py-3 rounded-md font-medium text-sm hover:bg-opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify & sign in'}
                </button>
              </div>
              <button
                onClick={() => { setLinkSent(false); setError(null); setOtp(''); }}
                className="text-xs text-gray-500 hover:text-[#37352F] transition underline"
              >
                Use a different email
              </button>
            </div>
          ) : (
          <>
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-serif-display font-semibold">Find my loyalty card</h2>
            <p className="text-sm text-gray-500 leading-relaxed max-w-sm mx-auto">
              Enter the email you signed up with — we'll send a sign-in link.
            </p>
          </div>
          <div className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus
              className="w-full bg-[#F7F7F5] border notion-border rounded-md px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#37352F]/20"
              onKeyDown={(e) => { if (e.key === 'Enter') handleSendLink(); }}
            />
            {error && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-100 p-2 rounded">{error}</div>
            )}
            <Turnstile
              onVerify={setTurnstileToken}
              onError={() => setTurnstileToken(null)}
            />
            <button
              onClick={handleSendLink}
              disabled={!email.trim() || sending}
              className="w-full bg-[#37352F] text-white py-3 rounded-md font-medium text-sm hover:bg-opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <>Find my card <ArrowLeft className="w-4 h-4 rotate-180" /></>
              )}
            </button>
          </div>
          {isIOS && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-800 flex gap-2">
              <Smartphone className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <strong>iPhone tip:</strong> tap <strong>Share</strong> →{' '}
                <strong>Add to Home Screen</strong> to keep this page one tap away.
              </div>
            </div>
          )}
          <p className="text-[11px] text-gray-500 text-center">
            Haven't signed up yet? Scan a merchant's QR poster to join their program.
          </p>
          </>
          )}
        </div>
      </Shell>
    );
  }

  // ---------- Signed in: list cards ----------
  if (loadingCards) {
    return (
      <Shell onExit={onExit} onSignOut={handleSignOut}>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
        </div>
      </Shell>
    );
  }

  return (
    <Shell onExit={onExit} onSignOut={handleSignOut}>
      {showWelcome && <WelcomeModal onDismiss={dismissWelcome} />}
      <div className="space-y-6 py-2">
        <div className="space-y-1">
          <h2 className="text-2xl font-serif-display font-semibold">Your loyalty cards</h2>
          <p className="text-sm text-gray-500">
            Signed in as <strong className="text-[#37352F]">{user.email}</strong>
          </p>
        </div>

        {cards.length === 0 ? (
          <div className="bg-[#F7F7F5] border notion-border rounded-lg p-8 text-center space-y-3">
            <div className="text-3xl">🎯</div>
            <h3 className="font-medium">No cards yet</h3>
            <p className="text-sm text-gray-500 max-w-xs mx-auto">
              Scan a merchant's QR poster to join your first loyalty program.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {cards.map((card) => {
              const campaign = campaignsById[card.campaignId];
              if (!campaign) return null;
              return (
                <div key={card.id} className="bg-white border notion-border rounded-xl p-4 shadow-sm space-y-3">
                  <WalletCard card={card} campaign={campaign} />

                  {/* Add to Apple Wallet — only renders on Apple devices */}
                  <AddToAppleWalletButton cardId={card.id} />

                  {/* Edit profile row — GDPR Art. 16 rectification */}
                  <EditProfileRow card={card} onRefresh={refresh} />

                  {/* Deletion status + request button */}
                  <DeletionRow card={card} onRefresh={refresh} />
                </div>
              );
            })}
          </div>
        )}

        {/* Change recovery code */}
        <div className="bg-[#F7F7F5] border notion-border rounded-lg p-4 space-y-2">
          <p className="text-sm font-medium">Change your recovery code</p>
          <p className="text-xs text-gray-500">The 6-digit code you use with your email to get your card back on a new phone. Set a new one anytime.</p>
          <div className="flex gap-2 items-center">
            <input value={newCode} onChange={(e) => setNewCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))} inputMode="numeric" placeholder="New 6-digit code" className="border notion-border rounded px-3 py-2 text-sm w-40 tracking-widest" />
            <button onClick={handleChangeCode} disabled={codeBusy || newCode.length !== 6} className="text-sm bg-[#37352F] text-white px-3 py-2 rounded disabled:opacity-40">{codeBusy ? 'Saving…' : 'Update'}</button>
          </div>
          {codeMsg && <p className={`text-xs ${codeErr ? 'text-red-600' : 'text-green-600'}`}>{codeMsg}</p>}
        </div>

        {/* Bookmark hint — encourages saving the URL for next time */}
        <div className="bg-[#F7F7F5] border notion-border rounded-lg p-3 text-xs text-gray-600 flex gap-2">
          <Bookmark className="w-4 h-4 flex-shrink-0 mt-0.5 text-gray-500" />
          <div>
            <strong>Tip:</strong> bookmark this page (<code className="bg-white px-1 rounded">stampfix.app/my-card</code>) to get back here anytime.
            {isIOS && ' On iPhone, tap Share → Add to Home Screen.'}
          </div>
        </div>

        {/* Data export — GDPR Art. 20 portability + PIPEDA Principle 9.
            Subtle styling because most users won't ever click this, but
            it must be available to anyone who asks for their data. */}
        <div className="pt-2 border-t notion-border space-y-1.5">
          <p className="text-xs text-gray-500">
            Download a JSON copy of all your data on Stampfix.
          </p>
          <DownloadMyDataButton variant="customer" />
        </div>
      </div>
    </Shell>
  );
}

// ----- Layout shell ------------------------------------------------------

function Shell({
  children, onExit, onSignOut,
}: { children: React.ReactNode; onExit: () => void; onSignOut?: () => void }) {
  return (
    <div className="min-h-screen bg-white text-[#37352F]">
      <header className="border-b notion-border sticky top-0 bg-white/95 backdrop-blur-sm z-10">
        <div className="max-w-md mx-auto px-5 py-3 flex items-center justify-between">
          <button onClick={onExit} className="flex items-center gap-2 text-sm hover:opacity-70 transition">
            <Logo className="h-6 w-auto text-[#37352F]" />
            <span className="font-semibold">Stampfix</span>
          </button>
          {onSignOut ? (
            <button
              onClick={onSignOut}
              className="text-xs text-gray-500 hover:text-[#37352F] transition flex items-center gap-1"
            >
              <LogOut className="w-3 h-3" /> Sign out
            </button>
          ) : (
            <button
              onClick={onExit}
              className="text-xs text-gray-500 hover:text-[#37352F] transition flex items-center gap-1"
            >
              <ArrowLeft className="w-3 h-3" /> Home
            </button>
          )}
        </div>
      </header>
      <main className="max-w-md mx-auto px-5 py-6">
        {children}
      </main>
    </div>
  );
}

// ----- Deletion request UI ------------------------------------------------

/**
 * Renders a small grey "Request deletion" link below each card.
 * If a deletion is already pending (within the 24h grace window),
 * shows status + a cancel option.
 *
 * The button is deliberately understated — grey text, secondary
 * styling. We want it accessible (GDPR Article 17 right to erasure)
 * but not so prominent that customers click it accidentally.
 */
function DeletionRow({ card, onRefresh }: { card: UserCard; onRefresh: () => void }) {
  const [busy, setBusy] = useState(false);
  const isPending = !!card.deletionRequestedAt;
  const requestedAt = card.deletionRequestedAt ? new Date(card.deletionRequestedAt) : null;
  const hoursPending = requestedAt
    ? Math.floor((Date.now() - requestedAt.getTime()) / (1000 * 60 * 60))
    : 0;
  const hoursRemaining = Math.max(0, 24 - hoursPending);

  const handleRequest = async () => {
    if (!confirm(
      `Request deletion of this loyalty card?\n\n` +
      `Your stamps and history will be permanently removed within 24 hours. ` +
      `You can cancel anytime during that window.`
    )) return;
    setBusy(true);
    try {
      await requestCardDeletion(card.id);
      await onRefresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not request deletion');
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    setBusy(true);
    try {
      await cancelCardDeletion(card.id);
      await onRefresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not cancel');
    } finally {
      setBusy(false);
    }
  };

  if (isPending) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-xs">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <div className="font-medium text-amber-900">Deletion pending</div>
            <div className="text-amber-700 mt-0.5">
              This card will be deleted in about {hoursRemaining} hour{hoursRemaining === 1 ? '' : 's'}. No more stamps can be added.
            </div>
          </div>
          <button
            onClick={handleCancel}
            disabled={busy}
            className="bg-white border border-amber-300 text-amber-800 px-2 py-1 rounded text-xs font-medium hover:bg-amber-100 disabled:opacity-50 whitespace-nowrap"
          >
            {busy ? '...' : 'Cancel'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-end pt-1">
      <button
        onClick={handleRequest}
        disabled={busy}
        className="text-[11px] text-gray-500 hover:text-red-600 underline disabled:opacity-50 transition"
      >
        {busy ? 'Working...' : 'Request data deletion'}
      </button>
    </div>
  );
}

// ----- Edit profile row (GDPR Art. 16 rectification) ---------------------

/**
 * Lets a customer correct their name (and optionally age) on a specific
 * card. Inline expand-collapse — most customers never need this so we
 * keep it subtle. Email changes intentionally not supported here: that
 * would require Supabase auth flow + re-confirmation. Customers who
 * need to change email contact support.
 */
function EditProfileRow({ card, onRefresh }: { card: UserCard; onRefresh: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(card.customerName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    if (!name.trim()) { setError('Name cannot be empty'); return; }
    setBusy(true);
    try {
      const { error: rpcErr } = await supabase.rpc('update_my_card_profile', {
        card_id_in: card.id,
        new_name: name.trim(),
      });
      if (rpcErr) throw rpcErr;
      setEditing(false);
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update');
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex justify-end -mt-1">
        <button
          onClick={() => setEditing(true)}
          className="text-[11px] text-gray-500 hover:text-[#37352F] underline transition"
        >
          Edit profile
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[#F7F7F5] border notion-border rounded-md p-3 space-y-2 text-xs">
      <div className="font-medium text-gray-700">Edit profile on this card</div>
      <div className="space-y-1.5">
        <label className="block">
          <span className="text-gray-500 text-[10px] uppercase tracking-wider font-bold">Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-white border notion-border rounded px-2 py-1.5 text-sm mt-0.5 focus:outline-none focus:ring-2 focus:ring-[#37352F]/20"
            maxLength={100}
          />
        </label>
      </div>
      <p className="text-[10px] text-gray-500 leading-snug">
        Need to change your email? Contact <a href="mailto:hello@stampfix.app" className="underline">hello@stampfix.app</a>.
      </p>
      {error && <div className="text-red-600 text-[11px]">{error}</div>}
      <div className="flex gap-2 justify-end">
        <button
          onClick={() => { setEditing(false); setName(card.customerName); setError(null); }}
          disabled={busy}
          className="text-[11px] px-2 py-1 rounded border notion-border bg-white hover:bg-[#F7F7F5]"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={busy}
          className="text-[11px] px-3 py-1 rounded bg-[#37352F] text-white hover:bg-opacity-90 disabled:opacity-50"
        >
          {busy ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}
