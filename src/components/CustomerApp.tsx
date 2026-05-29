import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Loader2, LogOut } from 'lucide-react';
import type { Campaign, UserCard } from '../types';
import { useAuth, sendCustomerMagicLink, signOut } from '../lib/auth';
import { getCampaignById, getCardForCustomer, createCard } from '../lib/db';
import { WalletCard } from './WalletCard';

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
          // Pull pending signup details from sessionStorage if present.
          const pendingRaw = sessionStorage.getItem('pending_customer_signup');
          let name = user.email?.split('@')[0] ?? 'Customer';
          let age: number | null = null;
          if (pendingRaw) {
            try {
              const p = JSON.parse(pendingRaw);
              name = `${p.firstName} ${p.surname}`.trim() || name;
              age = p.age ? parseInt(p.age) : null;
            } catch {
              // ignore
            }
          }
          existing = await createCard({
            campaignId: campaign.id,
            customerId: user.id,
            customerName: name,
            email: user.email ?? '',
            age,
            joinedAtLocationId: joinedLocationId ?? null,
          });
          sessionStorage.removeItem('pending_customer_signup');
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
    setError(null);
    setIsSendingLink(true);
    try {
      // Stash form so we have the name when the magic link redirects back
      sessionStorage.setItem('pending_customer_signup', JSON.stringify(formData));
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-6 text-center">
        <div className="max-w-md space-y-4">
          <p className="text-gray-500">{error || 'No campaign found for this link.'}</p>
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
          <div className="max-w-sm w-full text-center space-y-6">
            <div className="text-5xl">📬</div>
            <h1 className="text-2xl font-serif-display font-semibold">Check your email</h1>
            <p className="text-gray-500 text-sm leading-relaxed">
              We sent a sign-in link to <strong className="text-[#37352F]">{formData.email}</strong>.
              Open the email on this device and tap the link to access your loyalty card.
            </p>
            <div className="bg-[#F7F7F5] border notion-border rounded-lg p-4 text-xs text-gray-500">
              Tip: the link expires after 1 hour. You can close this tab — the link will open here.
            </div>
            <button onClick={() => { setLinkSent(false); setFormData({ ...formData, email: '' }); }}
              className="text-xs text-gray-500 hover:underline">
              Used the wrong email?
            </button>
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

            <button
              onClick={handleSendLink}
              disabled={!formData.firstName || !formData.email || isSendingLink}
              className="w-full bg-[#37352F] text-white py-3 rounded-md font-medium hover:bg-opacity-90 transition disabled:opacity-50 shadow-sm flex items-center justify-center gap-2 mt-2"
            >
              {isSendingLink ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <>Send me a link <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
            <p className="text-[10px] text-gray-400 text-center">
              By joining you agree to receive marketing emails from {campaign.businessName}.
            </p>
          </div>
        </div>
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
      </main>
    </div>
  );
}
