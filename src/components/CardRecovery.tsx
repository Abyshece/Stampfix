import { PhoneField } from './PhoneField';
import { useState } from 'react';
import { ArrowLeft, Loader2, Info } from 'lucide-react';
import type { Campaign, UserCard } from '../types';
import { recoverCardsByEmail } from '../lib/db';
import { submitContactMessage } from '../services/admin';
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
  const [showContact, setShowContact] = useState(false);
  const [cName, setCName] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cMsg, setCMsg] = useState("I forgot my 6-digit code and can't recover my loyalty card. Could you please help?");
  const [cSending, setCSending] = useState(false);
  const [cSent, setCSent] = useState(false);
  const [cErr, setCErr] = useState<string | null>(null);
  const sendContact = async () => {
    if (!cEmail.trim() || !cMsg.trim()) return;
    setCSending(true); setCErr(null);
    try {
      await submitContactMessage({ name: cName.trim() || 'Customer', email: cEmail.trim(), inquiryType: 'customer_inquiry', message: cMsg.trim() });
      setCSent(true);
    } catch (e) { setCErr(e instanceof Error ? e.message : 'Could not send. Please try again.'); }
    finally { setCSending(false); }
  };

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
              <button onClick={() => { setCEmail(email); setShowContact(true); }} className="w-full text-center text-sm text-gray-500 hover:text-[#37352F] transition pt-1">
                Can&rsquo;t remember your code? Contact us for help
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
      {showContact && (
        <div className="fixed inset-0 z-[300] bg-black/40 flex items-center justify-center p-4" onClick={() => setShowContact(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            {cSent ? (
              <div className="text-center">
                <div className="text-4xl mb-2">&#9989;</div>
                <h3 className="text-lg font-serif-display font-semibold mb-1">Message sent</h3>
                <p className="text-sm text-gray-500 mb-4">Thanks &mdash; we&rsquo;ll get back to you by email soon.</p>
                <button onClick={() => { setShowContact(false); setCSent(false); }} className="px-5 py-2.5 rounded-lg bg-[#37352F] text-white text-sm font-medium hover:bg-[#2F2D28] transition">Close</button>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-serif-display font-semibold mb-1">Contact Stampfix</h3>
                <p className="text-sm text-gray-500 mb-4">Forgot your 6-digit code? Send us a message and we&rsquo;ll help you get back into your card.</p>
                <div className="space-y-3">
                  <input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Your name" className="w-full bg-[#F7F7F5] border notion-border rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400" />
                  <input value={cEmail} onChange={(e) => setCEmail(e.target.value)} type="email" placeholder="you@email.com" className="w-full bg-[#F7F7F5] border notion-border rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400" />
                  <textarea value={cMsg} onChange={(e) => setCMsg(e.target.value)} rows={3} placeholder="Tell us which shop and your name" className="w-full bg-[#F7F7F5] border notion-border rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 resize-none" />
                  {cErr && <p className="text-xs text-red-600">{cErr}</p>}
                  <button onClick={sendContact} disabled={cSending || !cEmail.trim() || !cMsg.trim()} className="w-full bg-[#37352F] text-white rounded-md py-2.5 text-sm font-medium hover:bg-[#2F2D28] transition disabled:opacity-50 flex items-center justify-center gap-2">
                    {cSending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send message'}
                  </button>
                  <button onClick={() => setShowContact(false)} className="w-full text-sm text-gray-500 py-1 hover:text-[#37352F] transition">Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
