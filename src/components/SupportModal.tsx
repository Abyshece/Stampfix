import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, LifeBuoy, Check } from 'lucide-react';
import { submitContactMessage } from '../services/admin';

/**
 * Lightweight "Contact support" pop-up (used from the rejection banner).
 * Submits to the same contact_messages table as the marketing contact form,
 * so it lands in admin → Contact Inquiries. On success it confirms a
 * 24–48h response.
 */
export function SupportModal({ defaultEmail, businessName, onClose }: {
  defaultEmail?: string;
  businessName?: string;
  onClose: () => void;
}) {
  const [email, setEmail] = useState(defaultEmail ?? '');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim()) || message.trim().length < 5) {
      setError('Please enter your email and a short message.');
      return;
    }
    setSending(true); setError(null);
    try {
      await submitContactMessage({
        name: businessName || email.trim(),
        email: email.trim(),
        inquiryType: 'merchant_inquiry',
        businessName: businessName || undefined,
        message: message.trim(),
      });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[300] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl border notion-border w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b notion-border">
          <div className="flex items-center gap-2">
            <LifeBuoy className="w-5 h-5 text-[#37352F]" />
            <h2 className="text-base font-semibold m-0">Contact support</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {sent ? (
          <div className="p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 mx-auto flex items-center justify-center mb-3">
              <Check className="w-6 h-6 text-green-600" strokeWidth={3} />
            </div>
            <h3 className="text-lg font-semibold text-[#37352F]">Message sent</h3>
            <p className="text-sm text-gray-500 mt-1">
              Thanks — we&rsquo;ll get back to you within <strong>24&ndash;48 hours</strong>.
            </p>
            <button onClick={onClose} className="mt-5 px-5 py-2.5 rounded-lg bg-[#37352F] text-white text-sm font-medium hover:bg-[#2F2D28] transition">
              Close
            </button>
          </div>
        ) : (
          <div className="p-6 space-y-3">
            <p className="text-sm text-gray-500 m-0">Tell us what&rsquo;s going on and we&rsquo;ll help sort it out.</p>
            <div>
              <label className="text-[11px] font-bold uppercase text-gray-400 tracking-wider">Your email</label>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#F7F7F5] border notion-border rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                placeholder="you@email.com"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase text-gray-400 tracking-wider">Message</label>
              <textarea
                value={message} onChange={(e) => setMessage(e.target.value)} rows={4}
                className="w-full bg-[#F7F7F5] border notion-border rounded-md px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-gray-400"
                placeholder="How can we help?"
              />
            </div>
            {error && <p className="text-xs text-red-600 m-0">{error}</p>}
            <button
              onClick={submit} disabled={sending}
              className="w-full bg-[#37352F] text-white py-2.5 rounded-lg text-sm font-medium hover:bg-[#2F2D28] transition disabled:opacity-50"
            >
              {sending ? 'Sending\u2026' : 'Send message'}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
