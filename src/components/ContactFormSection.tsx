import { useState } from 'react';
import { Mail, Loader2, Check } from 'lucide-react';
import { submitContactMessage } from '../services/admin';

type Inquiry = 'merchant_inquiry' | 'customer_inquiry' | 'partnership' | 'other';

// Soft multi-colour wash + a thin top strip, both built from the wallet-card palette.
const CARD_WASH =
  'radial-gradient(closest-side, #75FBFD, transparent) 12% 25%/38% 65% no-repeat,' +
  'radial-gradient(closest-side, #510AF5, transparent) 42% 12%/38% 65% no-repeat,' +
  'radial-gradient(closest-side, #EA33B6, transparent) 72% 25%/38% 65% no-repeat,' +
  'radial-gradient(closest-side, #F0A479, transparent) 92% 62%/38% 65% no-repeat,' +
  'radial-gradient(closest-side, #1132F5, transparent) 22% 72%/38% 65% no-repeat';
const CARD_LINEAR = 'linear-gradient(90deg, #75FBFD, #1132F5, #510AF5, #EA33B6, #EA3323, #F0A479, #F7CE46)';

/**
 * Contact form embedded in the marketing site footer. Anonymous users
 * can submit inquiries; they land in admin → Contact Inquiries.
 *
 * No CAPTCHA on this for now — it's the marketing page footer with
 * relatively low spam potential. If spam shows up we can wire it
 * through verify-turnstile (the function and flow already exist).
 */
export function ContactFormSection() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [inquiry, setInquiry] = useState<Inquiry>('merchant_inquiry');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) return;
    setError(null);
    setSending(true);
    try {
      await submitContactMessage({
        name,
        email,
        inquiryType: inquiry,
        businessName: businessName || undefined,
        message,
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send. Please try again.');
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <section id="contact" className="relative bg-white text-[#37352F] py-16 px-6 overflow-hidden">
        <div className="pointer-events-none absolute inset-0 opacity-40 blur-3xl" style={{ background: CARD_WASH }} />
        <div className="relative max-w-md mx-auto text-center space-y-4">
          <div className="w-12 h-12 bg-green-100 rounded-full mx-auto flex items-center justify-center">
            <Check className="w-6 h-6 text-green-600" strokeWidth={3} />
          </div>
          <h2 className="text-2xl font-serif-display font-semibold">Got it — thanks!</h2>
          <p className="text-sm text-gray-500">
            We'll get back to you at <strong className="text-[#37352F]">{email}</strong> within 1-2 business days.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section id="contact" className="relative bg-white text-[#37352F] py-16 px-6 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-40 blur-3xl" style={{ background: CARD_WASH }} />
      <div className="relative max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-serif-display font-semibold mb-2">Get in touch</h2>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            Questions about getting started, partnerships, or something else? Drop us a line and we'll reply within 1-2 business days.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="relative bg-white text-[#37352F] rounded-xl p-6 md:p-8 space-y-4 shadow-2xl border notion-border overflow-hidden">
          <div className="h-1.5 -mx-6 md:-mx-8 -mt-6 md:-mt-8 mb-2" style={{ background: CARD_LINEAR }} />
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Your name" required>
              <input
                type="text" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Jane Smith"
                className="w-full bg-[#F7F7F5] border notion-border rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#37352F]/20"
              />
            </Field>
            <Field label="Email" required>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-[#F7F7F5] border notion-border rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#37352F]/20"
              />
            </Field>
          </div>

          <Field label="I'm interested in" required>
            <div className="grid grid-cols-2 gap-2">
              {[
                ['merchant_inquiry', 'Becoming a merchant'],
                ['customer_inquiry', 'A customer question'],
                ['partnership', 'Partnership'],
                ['other', 'Something else'],
              ].map(([val, label]) => (
                <button
                  key={val} type="button"
                  onClick={() => setInquiry(val as Inquiry)}
                  className={`text-sm px-3 py-2 rounded-md border transition text-left ${
                    inquiry === val
                      ? 'bg-[#37352F] text-white border-[#37352F]'
                      : 'bg-white notion-border hover:bg-[#F7F7F5]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>

          {inquiry === 'merchant_inquiry' && (
            <Field label="Business name (optional)">
              <input
                type="text" value={businessName} onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Your shop, salon, restaurant, etc."
                className="w-full bg-[#F7F7F5] border notion-border rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#37352F]/20"
              />
            </Field>
          )}

          <Field label="Message" required>
            <textarea
              value={message} onChange={(e) => setMessage(e.target.value)}
              rows={4} placeholder="Tell us a bit about what you're looking for..."
              className="w-full bg-[#F7F7F5] border notion-border rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#37352F]/20 resize-none"
            />
          </Field>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 p-3 rounded">{error}</div>
          )}

          <button
            type="submit"
            disabled={!name || !email || !message || sending}
            className="w-full bg-[#37352F] text-white py-3 rounded-md font-medium hover:bg-opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Mail className="w-4 h-4" /> Send message</>}
          </button>
        </form>
      </div>
    </section>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-600 block">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}
