import { useState } from 'react';
import { CreditCard, Sparkles, Check } from 'lucide-react';
import type { MerchantBilling, UserCard } from '../types';
import { FREE_TIER_CARD_LIMIT } from '../types';
import { UpgradeModal } from './UpgradeModal';

interface AccountBillingProps {
  billing: MerchantBilling;
  country?: 'DE' | 'CA' | null;
  cards: UserCard[];
}

/**
 * Account & Billing panel inside Settings. Shows current plan, usage
 * meter for free-tier merchants, and an Upgrade CTA. After Stripe Part B
 * ships, this also becomes where merchants manage their subscription
 * (cancel, update payment method, view invoices).
 */
export function AccountBilling({ billing, country, cards }: AccountBillingProps) {
  const [showModal, setShowModal] = useState(false);

  const isPro = billing.plan === 'pro';
  const used = cards.length;
  const pct = Math.min(100, (used / FREE_TIER_CARD_LIMIT) * 100);
  const isCA = country === 'CA';
  const price = isCA ? 'CAD $28/mo' : '€19.99/mo';

  return (
    <div className="bg-white rounded-lg border notion-border p-6 space-y-5">
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-gray-500" /> Account & Billing
        </h3>
        <p className="text-sm text-gray-500 mt-1">Your current plan and usage.</p>
      </div>

      {/* Plan card */}
      <div className={`rounded-lg p-4 border ${
        isPro ? 'bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200'
              : 'bg-[#F7F7F5] notion-border'
      }`}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Current Plan</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-serif-display font-semibold">
                {isPro ? 'Pro' : 'Free'}
              </span>
              {isPro && <Sparkles className="w-4 h-4 text-amber-500" />}
            </div>
            {isPro && billing.planStartedAt && (
              <p className="text-xs text-gray-500 mt-1">
                Active since {billing.planStartedAt.toLocaleDateString()}
              </p>
            )}
          </div>
          {!isPro && (
            <button
              onClick={() => setShowModal(true)}
              className="bg-[#37352F] text-white px-4 py-2 rounded-md font-medium text-sm hover:bg-opacity-90 transition"
            >
              Upgrade
            </button>
          )}
        </div>
      </div>

      {/* Usage meter (free plan only) */}
      {!isPro && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Customer cards</span>
            <span className="text-gray-500">
              <strong className="text-[#37352F]">{used}</strong> of {FREE_TIER_CARD_LIMIT}
            </span>
          </div>
          <div className="h-2 bg-[#F7F7F5] rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                pct >= 100 ? 'bg-red-500'
                : pct >= 80 ? 'bg-amber-500'
                : 'bg-[#37352F]'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-gray-500">
            {used >= FREE_TIER_CARD_LIMIT
              ? 'You\'ve hit the free-tier cap. New customer signups are blocked until you upgrade. Existing customers can still earn stamps.'
              : `${FREE_TIER_CARD_LIMIT - used} customer slot${FREE_TIER_CARD_LIMIT - used === 1 ? '' : 's'} left. Upgrade for unlimited.`}
          </p>
        </div>
      )}

      {/* What's included */}
      {!isPro && (
        <div className="bg-[#F7F7F5] border notion-border rounded-md p-4 space-y-2.5">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Pro features — {price}</p>
          {[
            'Unlimited customer cards',
            'Multiple locations',
            'Priority email support',
            'Cancel anytime',
          ].map((feat) => (
            <div key={feat} className="flex items-center gap-2 text-sm">
              <Check className="w-3.5 h-3.5 text-green-600 flex-shrink-0" strokeWidth={3} />
              <span>{feat}</span>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <UpgradeModal country={country ?? null} onClose={() => setShowModal(false)} />
      )}
    </div>
  );
}
