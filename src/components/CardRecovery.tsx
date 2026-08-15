import { PhoneField } from './PhoneField';
import { useState } from 'react';
import { ArrowLeft, Loader2, Info } from 'lucide-react';
import type { Campaign, UserCard } from '../types';
import { recoverCardsByEmail } from '../lib/db';
import { WalletCard } from './WalletCard';
import { AddToAppleWalletButton } from './AddToAppleWalletButton';

/**
 * Customer card recovery / "Customer login": phone + 6-digit code (set at
 * signup) -> the customer's card(s), rendered with the normal WalletCard so
 * they can re-add to Apple/Google Wallet. No account/magic-link needed.
 */
export function CardRecovery() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{ card: UserCard; campaign: Campaign }[] | null>(null);

  const submit = async () => {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim()) || !/^\d{4,6}$/.test(code)) {
      setError('Enter the email and 6-digit code you used when you signed up.');
      return;
    }
    setLoading(true);
    try {
      const found = await recoverCardsByEmail(email.trim(), code);
      setResults(found);
      if (found.length === 0) {
        setError('No card found for that email and code. Double-check both and try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const hasResults = results && results.length > 0;

  return (
    <div className="min-h-screen bg-white text-[#37352F] font-sans">
      <div className="max-w-md mx-auto px-6 py-16">
        <a href="/" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#37352F] mb-8 transition">
          <ArrowLeft className="w-4 h-4" /> Home
        </a>

        {!hasResults && (
          <>
            <h1 className="text-3xl font-serif-display font-medium mb-2">Lost your stamp card?</h1>
            <p className="text-gray-500 mb-8 leading-relaxed">
              Enter the email and 6-digit code you set when you signed up, and we&rsquo;ll bring your card back.
            </p>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase text-gray-500 tracking-wider">Email</label>
                <input
                  type="email" inputMode="email" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                  className="w-full bg-[#F7F7F5] border notion-border rounded-md px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-gray-400 placeholder-gray-400"
                  placeholder="you@email.com"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase text-gray-500 tracking-wider">6-digit code</label>
                <input
                  type="text" inputMode="numeric" maxLength={6} value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                  className="w-full bg-[#F7F7F5] border notion-border rounded-md px-3 py-2.5 font-mono tracking-[0.3em] focus:outline-none focus:ring-1 focus:ring-gray-400 placeholder-gray-400"
                  placeholder="••••••"
                />
                <div className="flex gap-2 items-start text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded-md p-2.5 mt-1.5">
                  <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
                  <span>You chose this code yourself when you first saved your card &mdash; it wasn&rsquo;t emailed or texted to you. Try the 6 digits you picked at sign-up.</span>
                </div>
              </div>
              {error && <div className="text-xs text-red-600 bg-red-50 border border-red-100 p-2.5 rounded">{error}</div>}
              <button
                onClick={submit} disabled={loading}
                className="w-full bg-[#37352F] text-white rounded-md py-2.5 font-medium hover:bg-[#2F2D28] transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Find my card'}
              </button>
            </div>
          </>
        )}

        {hasResults && (
          <>
            <h1 className="text-2xl font-serif-display font-medium mb-1">Here&rsquo;s your card{results!.length > 1 ? 's' : ''}</h1>
            <p className="text-gray-500 mb-6 text-sm">Add it back to your wallet below.</p>
            <div className="space-y-10">
              {results!.map(({ card, campaign }) => (
                <div key={card.id} className="space-y-3">
                  <WalletCard card={card} campaign={campaign} staticQR />
                  <AddToAppleWalletButton cardId={card.id} />
                </div>
              ))}
            </div>
            <button
              onClick={() => { setResults(null); setCode(''); setError(null); }}
              className="mt-8 text-sm text-gray-500 hover:text-[#37352F] transition"
            >
              ← Look up another
            </button>
          </>
        )}
      </div>
    </div>
  );
}
