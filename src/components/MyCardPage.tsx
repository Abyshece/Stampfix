import { useEffect, useState } from 'react';
import { Mail, Loader2, ArrowLeft, Smartphone, LogOut, Bookmark } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth, signOut } from '../lib/auth';
import { listCardsForCustomer, getCampaignsByIds, requestCardDeletion, cancelCardDeletion } from '../lib/db';
import type { UserCard, Campaign } from '../types';
import { WalletCard } from './WalletCard';
import { Turnstile } from './Turnstile';
import { verifyTurnstile } from '../services/turnstile';
import { DownloadMyDataButton } from './DownloadMyDataButton';

/**
 * Self-service page where any customer can look up their loyalty cards.
 *
 * Flow:
 *   1. Not signed in -> email + magic-link form
 *   2. Magic link clicked -> redirected back here with a session
 *   3. Signed in -> shows all cards across every merchant they've joined
 *
 * Designed especially for iPhone customers who can't use Google Wallet
 * and need a reliable way to return to their loyalty card on repeat
 * visits. Bookmarking this URL == the iPhone equivalent of a wallet pass.
 */
export function MyCardPage({ onExit }: { onExit: () => void }) {
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [linkSent, setLinkSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Turnstile token for anti-bot protection on the magic-link request.
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  // Card data (once logged in)
  const [cards, setCards] = useState<UserCard[]>([]);
  const [campaignsById, setCampaignsById] = useState<Record<string, Campaign>>({});
  const [loadingCards, setLoadingCards] = useState(false);

  // Show a small "Add to Home Screen" hint on iOS for first-time visitors.
  const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);

  // ----- Load cards once authenticated -----
  const loadCards = async (signal?: { cancelled: boolean }) => {
    if (!user) return;
    setLoadingCards(true);
    try {
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
  const handleSendLink = async () => {
    setError(null);
    if (!email.trim()) return;
    if (!turnstileToken) {
      setError('Please complete the security check.');
      return;
    }
    setSending(true);
    try {
      const ok = await verifyTurnstile(turnstileToken);
      if (!ok) {
        setError('Security check failed. Please try again.');
        setTurnstileToken(null);
        setSending(false);
        return;
      }
      const { error: err } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          // After clicking the email link, the user lands back at /my-card
          // already authenticated. The session is set automatically.
          emailRedirectTo: `${window.location.origin}/my-card`,
        },
      });
      if (err) throw err;
      setLinkSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send sign-in link');
    } finally {
      setSending(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setLinkSent(false);
    setEmail('');
  };

  // ===================================================================
  // RENDER
  // ===================================================================

  // Loading-initial-session state
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  // ---------- Not signed in: ask for email ----------
  if (!user) {
    if (linkSent) {
      return (
        <Shell onExit={onExit}>
          <div className="text-center space-y-5 py-8">
            <div className="w-14 h-14 bg-blue-50 rounded-full mx-auto flex items-center justify-center">
              <Mail className="w-6 h-6 text-blue-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-serif-display font-semibold">Check your email</h2>
              <p className="text-sm text-gray-500 leading-relaxed max-w-sm mx-auto">
                We sent a sign-in link to <strong className="text-[#37352F]">{email}</strong>.
                Tap it and you'll land right back here with your card.
              </p>
            </div>
            <button
              onClick={() => { setLinkSent(false); setEmail(''); }}
              className="text-sm text-gray-500 hover:text-[#37352F] underline"
            >
              Use a different email
            </button>
          </div>
        </Shell>
      );
    }
    return (
      <Shell onExit={onExit}>
        <div className="space-y-6 py-2">
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
              disabled={!email.trim() || !turnstileToken || sending}
              className="w-full bg-[#37352F] text-white py-3 rounded-md font-medium text-sm hover:bg-opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <>Send sign-in link <Mail className="w-4 h-4" /></>
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
          <p className="text-[11px] text-gray-400 text-center">
            Haven't signed up yet? Scan a merchant's QR poster to join their program.
          </p>
        </div>
      </Shell>
    );
  }

  // ---------- Signed in: list cards ----------
  if (loadingCards) {
    return (
      <Shell onExit={onExit} onSignOut={handleSignOut}>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </Shell>
    );
  }

  return (
    <Shell onExit={onExit} onSignOut={handleSignOut}>
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

                  {/* Deletion status + request button */}
                  <DeletionRow card={card} onRefresh={refresh} />
                </div>
              );
            })}
          </div>
        )}

        {/* Bookmark hint — encourages saving the URL for next time */}
        <div className="bg-[#F7F7F5] border notion-border rounded-lg p-3 text-xs text-gray-600 flex gap-2">
          <Bookmark className="w-4 h-4 flex-shrink-0 mt-0.5 text-gray-400" />
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
            <div className="w-6 h-6 bg-[#37352F] rounded-sm flex items-center justify-center text-white text-xs font-bold font-serif-display">S</div>
            <span className="font-semibold">Stampfix</span>
          </button>
          {onSignOut ? (
            <button
              onClick={onSignOut}
              className="text-xs text-gray-400 hover:text-[#37352F] transition flex items-center gap-1"
            >
              <LogOut className="w-3 h-3" /> Sign out
            </button>
          ) : (
            <button
              onClick={onExit}
              className="text-xs text-gray-400 hover:text-[#37352F] transition flex items-center gap-1"
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
        className="text-[11px] text-gray-400 hover:text-red-600 underline disabled:opacity-50 transition"
      >
        {busy ? 'Working...' : 'Request data deletion'}
      </button>
    </div>
  );
}
