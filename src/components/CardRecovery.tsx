import { useState } from 'react';
import { ArrowLeft, ArrowRight, Mail, Loader2 } from 'lucide-react';
import { submitContactMessage } from '../services/admin';
import { useTranslation } from 'react-i18next';

/**
 * "Find my card": the customer types the email they joined with and goes
 * straight to their card(s) on /my-card (which signs them in with that email).
 * Can't remember the email? A short message to Stampfix support.
 */
export function CardRecovery() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [going, setGoing] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [cName, setCName] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cMsg, setCMsg] = useState(t('cust.recover.defaultMsg2', { defaultValue: "I can't remember which email I used for my loyalty card. Could you please help?" }));
  const [cSending, setCSending] = useState(false);
  const [cSent, setCSent] = useState(false);
  const [cErr, setCErr] = useState<string | null>(null);
  const sendContact = async () => {
    if (!cEmail.trim() || !cMsg.trim()) return;
    setCSending(true); setCErr(null);
    try {
      await submitContactMessage({ name: cName.trim() || 'Customer', email: cEmail.trim(), inquiryType: 'customer_inquiry', message: cMsg.trim() });
      setCSent(true);
    } catch (e) { setCErr(e instanceof Error ? e.message : t('cust.recover.errSend', { defaultValue: 'Could not send. Please try again.' })); }
    finally { setCSending(false); }
  };

  const submit = () => {
    setError(null);
    const e = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(e)) {
      setError(t('cust.recover.errEmail', { defaultValue: 'Enter the email you used when you joined.' }));
      return;
    }
    setGoing(true);
    window.location.href = `/my-card?e=${encodeURIComponent(e)}`;
  };

  return (
    <div className="min-h-screen bg-white text-[#37352F] font-sans">
      <div className="max-w-md mx-auto px-6 py-16">
        <a href="/" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#37352F] mb-8 transition">
          <ArrowLeft className="w-4 h-4" /> {t('cust.recover.home', { defaultValue: 'Home' })}
        </a>

        <h1 className="text-3xl font-serif-display font-medium mb-2">{t('cust.recover.findTitle', { defaultValue: 'Find your stamp card' })}</h1>
        <p className="text-gray-500 mb-8 leading-relaxed">
          {t('cust.recover.findSub', { defaultValue: "Enter the email you used when you joined, and we'll open your card right away." })}
        </p>

        <div className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="find-email" className="text-[11px] font-bold uppercase text-gray-500 tracking-wider">{t('cust.recover.email', { defaultValue: 'Email' })}</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="find-email" type="email" inputMode="email" autoComplete="email" value={email} data-find-email
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                className="w-full bg-[#F7F7F5] border notion-border rounded-md pl-9 pr-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-gray-400 placeholder-gray-400"
                placeholder={t('cust.recover.emailPh', { defaultValue: 'you@email.com' })}
              />
            </div>
          </div>
          {error && <div className="text-xs text-red-600 bg-red-50 border border-red-100 p-2.5 rounded" role="alert">{error}</div>}
          <button
            onClick={submit} disabled={going} data-find-submit
            className="w-full bg-[#37352F] text-white rounded-md py-2.5 font-medium hover:bg-[#2F2D28] transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {going ? <Loader2 className="w-4 h-4 animate-spin" /> : <>{t('cust.recover.openCard', { defaultValue: 'Open my card' })} <ArrowRight className="w-4 h-4" /></>}
          </button>
          <button onClick={() => { setCEmail(email); setShowContact(true); }} data-find-contact
            className="w-full text-center text-sm text-gray-500 hover:text-[#37352F] transition pt-1">
            {t('cust.recover.cantRememberEmail', { defaultValue: "Can't remember which email you used? Contact us for help" })}
          </button>
        </div>
      </div>
      {showContact && (
        <div className="fixed inset-0 z-[300] bg-black/40 flex items-center justify-center p-4" onClick={() => setShowContact(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            {cSent ? (
              <div className="text-center">
                <div className="text-4xl mb-2">&#9989;</div>
                <h3 className="text-lg font-serif-display font-semibold mb-1">{t('cust.recover.msgSent', { defaultValue: 'Message sent' })}</h3>
                <p className="text-sm text-gray-500 mb-4">{t('cust.recover.thanks', { defaultValue: "Thanks, we'll get back to you by email soon." })}</p>
                <button onClick={() => { setShowContact(false); setCSent(false); }} className="px-5 py-2.5 rounded-lg bg-[#37352F] text-white text-sm font-medium hover:bg-[#2F2D28] transition">{t('cust.recover.close', { defaultValue: 'Close' })}</button>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-serif-display font-semibold mb-1">{t('cust.recover.contactTitle', { defaultValue: 'Contact Stampfix' })}</h3>
                <p className="text-sm text-gray-500 mb-4">{t('cust.recover.contactSub2', { defaultValue: "Send us a message with your name and the shop, and we'll help you get back to your card." })}</p>
                <div className="space-y-3">
                  <input value={cName} onChange={(e) => setCName(e.target.value)} placeholder={t('cust.recover.yourName', { defaultValue: 'Your name' })} className="w-full bg-[#F7F7F5] border notion-border rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400" />
                  <input value={cEmail} onChange={(e) => setCEmail(e.target.value)} type="email" placeholder={t('cust.recover.emailPh', { defaultValue: 'you@email.com' })} className="w-full bg-[#F7F7F5] border notion-border rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400" />
                  <textarea value={cMsg} onChange={(e) => setCMsg(e.target.value)} rows={3} placeholder={t('cust.recover.tellShop', { defaultValue: 'Tell us which shop and your name' })} className="w-full bg-[#F7F7F5] border notion-border rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 resize-none" />
                  {cErr && <p className="text-xs text-red-600">{cErr}</p>}
                  <button onClick={sendContact} disabled={cSending || !cEmail.trim() || !cMsg.trim()} className="w-full bg-[#37352F] text-white rounded-md py-2.5 text-sm font-medium hover:bg-[#2F2D28] transition disabled:opacity-50 flex items-center justify-center gap-2">
                    {cSending ? <Loader2 className="w-4 h-4 animate-spin" /> : t('cust.recover.sendMessage', { defaultValue: 'Send message' })}
                  </button>
                  <button onClick={() => setShowContact(false)} className="w-full text-sm text-gray-500 py-1 hover:text-[#37352F] transition">{t('cust.recover.cancel', { defaultValue: 'Cancel' })}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
