import { useState } from 'react';
import { MarketingLayout, Eyebrow, StartButton } from './MarketingLayout';
import { MerchantValueCalculator } from '../MerchantValueCalculator';
import type { MerchantCountry } from '../../lib/pricing';

/**
 * Public "Payback" page (replaces the old /savings ROI calculator). Reuses the
 * exact same calculator merchants see in their dashboard, wrapped in the
 * marketing shell, with a currency toggle so the sales team can show either
 * market. Route stays /savings to avoid clashing with the merchant /payback tab.
 */
export function PaybackCalculatorPage() {
  const [country, setCountry] = useState<MerchantCountry>('CA');

  return (
    <MarketingLayout active="/savings">
      <section className="max-w-4xl mx-auto px-6 py-16">
        <Eyebrow>Payback</Eyebrow>
        <h1 className="text-4xl md:text-5xl font-serif-display font-semibold mt-3 leading-tight">
          See what loyalty is worth to your shop
        </h1>
        <p className="text-gray-500 mt-3 max-w-2xl leading-relaxed">
          This is the same payback calculator you get in your dashboard after signing up. Slide in
          your own numbers and see — week by week, or across a whole year — how much extra revenue
          returning customers bring in, and how quickly Stampfix pays for itself.
        </p>

        {/* Currency toggle */}
        <div className="mt-6 inline-flex rounded-lg border notion-border bg-white p-0.5 text-sm">
          {(['CA', 'DE'] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCountry(c)}
              className={`px-3 py-1.5 rounded-md transition ${
                country === c ? 'bg-[#37352F] text-white font-medium' : 'text-gray-600 hover:text-[#37352F]'
              }`}
            >
              {c === 'CA' ? 'CA$ · Canada' : '\u20ac · Germany'}
            </button>
          ))}
        </div>

        <div className="mt-8">
          <MerchantValueCalculator country={country} />
        </div>

        <div className="mt-14 text-center">
          <StartButton label="Start for free" className="px-6 py-3" />
          <p className="text-xs text-gray-400 mt-3">Free up to 10 customers. No card, no app to install.</p>
        </div>
      </section>
    </MarketingLayout>
  );
}
