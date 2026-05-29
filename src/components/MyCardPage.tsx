import { useEffect, useState } from 'react';
import { Mail, Loader2, ArrowLeft, Smartphone, LogOut, Bookmark } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth, signOut } from '../lib/auth';
import { listCardsForCustomer, getCampaignsByIds } from '../lib/db';
import type { UserCard, Campaign } from '../types';
import { WalletCard } from './WalletCard';

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

  // Card data (once logged in)
  const [cards, setCards] = useState<UserCard[]>([]);
  const [campaignsById, setCampaignsById] = useState<Record<string, Campaign>>({});
  const [loadingCards, setLoadingCards] = useState(false);

  // Show a small "Add to Home Screen" hint on iOS for first-time visitors.
  const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);

  // ----- Load cards once authenticated -----
  useEffect(() => {
    if (!user) {
      setCards([]);
      setCampaignsById({});
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingCards(true);
      try {
        const myCards = await listCardsForCustomer(user.id);
        if (cancelled) return;
        setCards(myCards);
        const campaignIds = Array.from(new Set(myCards.map((c) => c.campaignId)));
        const campaigns = await getCampaignsByIds(campaignIds);
        if (cancelled) return;
        const map: Record<string, Campaign> = {};
        for (const camp of campaigns) map[camp.id] = camp;
        setCampaignsById(map);
      } catch (e) {
        if (!cancelled) {
          console.error('[my-card] failed to load cards:', e);
        }
      } finally {
        if (!cancelled) setLoadingCards(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // ----- Send magic link -----
  const handleSendLink = async () => {
    setError(null);
    if (!email.trim()) return;
    setSending(true);
    try {
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
            <button
              onClick={handleSendLink}
              disabled={!email.trim() || sending}
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
                <div key={card.id} className="bg-white border notion-border rounded-xl p-4 shadow-sm">
                  <WalletCard card={card} campaign={campaign} />
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
