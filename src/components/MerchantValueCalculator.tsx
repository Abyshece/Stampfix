import { useState } from 'react';
import { Coffee, TrendingUp } from 'lucide-react';

/**
 * Merchant-facing "Payback" page (Workspace → Payback).
 *
 * Shows, in the merchant's own numbers, how much extra revenue repeat customers
 * bring — and how fast the Stampfix subscription pays for itself. Fully
 * self-contained: three sliders + live results, no external data.
 *
 * Figures are estimates. The visit-uplift slider is the honest lever: industry
 * benchmarks put loyalty-member visit frequency ~20–30% higher than non-members.
 */

interface Props {
  monthly: number;        // subscription price per month, e.g. 29.99
  businessName?: string;
}

const CUR = 'CA$';
const money = (n: number) => CUR + Math.round(n).toLocaleString('en-CA');

function Slider({
  label, value, min, max, step, onChange, format,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format: (v: number) => string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <label className="text-sm text-gray-600">{label}</label>
        <span className="text-lg font-semibold text-[#37352F] tabular-nums">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#37352F] cursor-pointer"
        aria-label={label}
      />
    </div>
  );
}

export function MerchantValueCalculator({ monthly, businessName }: Props) {
  const [regulars, setRegulars] = useState(120);
  const [spend, setSpend] = useState(6);
  const [extraVisits, setExtraVisits] = useState(2);

  const extraMonthly = regulars * extraVisits * spend;
  const extraAnnual = extraMonthly * 12;
  const subAnnual = monthly * 12;
  const netAnnual = Math.max(0, extraAnnual - subAnnual);
  const roi = extraMonthly > 0 ? extraAnnual / subAnnual : 0;

  // "Almost free" framing (task 4)
  const coffees = Math.max(1, Math.round(monthly / spend));
  const paybackCustomers = Math.max(1, Math.ceil(monthly / Math.max(1, extraVisits * spend)));

  return (
    <div className="space-y-8">
      <header>
        <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">
          <TrendingUp className="w-4 h-4" /> Payback
        </div>
        <h2 className="text-3xl font-serif-display font-semibold">What your regulars are worth</h2>
        <p className="text-gray-500 mt-1">
          Slide in {businessName ? businessName + "\u2019s" : 'your'} numbers. See what repeat
          customers add — and how fast Stampfix pays for itself.
        </p>
      </header>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Inputs */}
        <div className="p-6 border notion-border rounded-lg bg-white shadow-sm space-y-6">
          <Slider label="Regulars on your card" value={regulars} min={20} max={1000} step={10}
            onChange={setRegulars} format={(v) => v.toLocaleString('en-CA')} />
          <Slider label="Average spend per visit" value={spend} min={3} max={60} step={1}
            onChange={setSpend} format={(v) => money(v)} />
          <Slider label="Extra visits per regular / month" value={extraVisits} min={1} max={6} step={1}
            onChange={setExtraVisits} format={(v) => `${v}\u00d7`} />
          <p className="text-xs text-gray-400 leading-relaxed">
            Loyalty members typically visit 20–30% more often than one-off customers. These figures
            are estimates to help you picture the upside, not a guarantee.
          </p>
        </div>

        {/* Results */}
        <div className="p-6 border notion-border rounded-lg bg-[#37352F] text-white shadow-sm flex flex-col">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Extra revenue a year</p>
          <div className="text-5xl font-serif-display font-semibold mt-1 tabular-nums">{money(extraAnnual)}</div>
          <div className="mt-1 text-sm text-gray-300">{money(extraMonthly)} / month from returning customers</div>

          <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-gray-400 text-xs uppercase tracking-wide">Your subscription</div>
              <div className="text-lg font-semibold tabular-nums">{money(subAnnual)}/yr</div>
            </div>
            <div>
              <div className="text-gray-400 text-xs uppercase tracking-wide">Net gain</div>
              <div className="text-lg font-semibold tabular-nums text-amber-300">{money(netAnnual)}/yr</div>
            </div>
          </div>

          <div className="mt-auto pt-6">
            <span className="inline-flex items-center gap-1.5 text-amber-300 font-semibold">
              <TrendingUp className="w-4 h-4" />
              {roi >= 1 ? `${roi.toFixed(roi < 10 ? 1 : 0)}\u00d7 return on what you pay` : 'Add a few regulars to break even'}
            </span>
          </div>
        </div>
      </div>

      {/* The "almost free" narrative */}
      <div className="p-6 border notion-border rounded-lg bg-[#F7F7F5] flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-[#37352F] text-white flex items-center justify-center flex-shrink-0">
          <Coffee className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-semibold text-[#37352F]">Basically pays for itself</h3>
          <p className="text-gray-600 text-sm mt-1 leading-relaxed">
            At {money(monthly)}/month, Stampfix costs about the price of{' '}
            <span className="font-semibold text-[#37352F]">{coffees} {coffees === 1 ? 'coffee' : 'coffees'}</span>
            {' '}— covered by just{' '}
            <span className="font-semibold text-[#37352F]">{paybackCustomers} returning {paybackCustomers === 1 ? 'regular' : 'regulars'}</span>
            {' '}a month. Everything your other regulars spend on top of that is extra.
          </p>
        </div>
      </div>
    </div>
  );
}
