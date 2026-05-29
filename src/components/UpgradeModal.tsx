import { useState } from 'react';
import { X, Check, Sparkles, Loader2 } from 'lucide-react';

interface UpgradeModalProps {
  country?: 'DE' | 'CA' | null;
  onClose: () => void;
}

/**
 * Pricing/upgrade page shown when a merchant taps the upgrade banner.
 * Lists features, shows the price, and has a single "Upgrade" CTA.
 *
 * NOTE: The Upgrade button is wired to a placeholder for now — it shows
 * a "coming soon" message. Real Stripe checkout will replace the
 * handleUpgrade body in the next phase. Everything else (the UI shell,
 * the way the banner triggers this, the country-aware pricing) ships
 * working today.
 */
export function UpgradeModal({ country, onClose }: UpgradeModalProps) {
  const [loading, setLoading] = useState(false);
  const [showComingSoon, setShowComingSoon] = useState(false);

  const isCA = country === 'CA';
  const price = isCA ? 'CAD $28' : '€19.99';
  const currencyNote = isCA
    ? 'Billed monthly in Canadian dollars.'
    : 'Billed monthly in Euros. Includes VAT where applicable.';

  const handleUpgrade = async () => {
    setLoading(true);
    // Placeholder. In the next phase this will call a Supabase Edge
    // Function (create-checkout-session) that returns a Stripe Checkout
    // URL, then window.location = url.
    await new Promise((r) => setTimeout(r, 600));
    setLoading(false);
    setShowComingSoon(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-title"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-[#37352F] transition p-1 z-10"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="bg-gradient-to-br from-[#37352F] to-[#1a1918] text-white px-8 pt-10 pb-12 text-center">
          <div className="w-12 h-12 bg-white/10 rounded-full mx-auto flex items-center justify-center mb-4">
            <Sparkles className="w-6 h-6 text-amber-300" />
          </div>
          <h2 id="upgrade-title" className="text-2xl font-serif-display font-semibold mb-1">
            Upgrade to Pro
          </h2>
          <p className="text-sm text-gray-300">Unlimited customers, no limits.</p>
        </div>

        {/* Price */}
        <div className="px-8 -mt-6">
          <div className="bg-white border notion-border rounded-xl p-5 shadow-md text-center">
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-4xl font-bold">{price}</span>
              <span className="text-gray-500 text-sm">/month</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">{currencyNote}</p>
          </div>
        </div>

        {/* Features */}
        <div className="px-8 py-8 space-y-3">
          {[
            'Unlimited customer cards',
            'Multiple locations with per-branch analytics',
            'Rotating signed QR codes (anti-fraud)',
            'Google Wallet support',
            'Priority email support',
            'Cancel anytime, no contract',
          ].map((feature) => (
            <div key={feature} className="flex items-start gap-2.5">
              <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Check className="w-3 h-3 text-green-600" strokeWidth={3} />
              </div>
              <span className="text-sm text-[#37352F]">{feature}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="px-8 pb-8 space-y-3">
          {showComingSoon ? (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800 text-center">
              <p className="font-semibold mb-1">Almost ready!</p>
              <p>
                We're finalising payment processing. Drop us a line at <strong>hello@stampfix.app</strong> and
                we'll personally set you up with the Pro plan today.
              </p>
            </div>
          ) : (
            <button
              onClick={handleUpgrade}
              disabled={loading}
              className="w-full bg-[#37352F] text-white py-3 rounded-lg font-medium hover:bg-opacity-90 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>Upgrade now — {price}/mo <Sparkles className="w-4 h-4" /></>
              )}
            </button>
          )}
          <p className="text-[11px] text-center text-gray-400">
            Secure payment via Stripe. Cancel anytime from Settings.
          </p>
        </div>
      </div>
    </div>
  );
}
