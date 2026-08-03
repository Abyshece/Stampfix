import { useState } from 'react';
import { Coffee, TrendingUp } from 'lucide-react';
import { proMonthly, type MerchantCountry } from '../lib/pricing';
import { InfoHint } from './InfoHint';

/**
 * Merchant-facing "Payback" page (Workspace → Payback) and the public /savings
 * page. Self-contained: three clearly-labelled sliders + a time-period filter,
 * no external data. Currency + price follow the merchant's country.
 */

interface Props {
  country: MerchantCountry;
  businessName?: string;
}

const PERIODS = [
  { key: 'week', label: 'Weekly', months: 12 / 52 },
  { key: 'month', label: 'Monthly', months: 1 },
  { key: 'half', label: '6 months', months: 6 },
  { key: 'year', label: 'Yearly', months: 12 },
] as const;
type PeriodKey = (typeof PERIODS)[number]['key'];

function Slider({
  label, hint, value, min, max, step, onChange, format,
}: {
  label: string; hint: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format: (v: number) => string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <label className="text-sm font-medium text-[#37352F]">{label}</label>
        <span className="text-lg font-semibold text-[#37352F] tabular-nums">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#37352F] cursor-pointer"
        aria-label={label}
      />
      <p className="text-xs text-gray-400 mt-1 leading-relaxed">{hint}</p>
    </div>
  );
}

export function MerchantValueCalculator({ country, businessName }: Props) {
  const { amount: monthly, symbol, vat } = proMonthly(country);
  const money = (n: number) => symbol + Math.round(n).toLocaleString('en-CA');

  const [regulars, setRegulars] = useState(120);
  const [spend, setSpend] = useState(6);
  const [extraVisits, setExtraVisits] = useState(2);
  const [period, setPeriod] = useState<PeriodKey>('year');

  const p = PERIODS.find((x) => x.key === period)!;
  const extraMonthly = regulars * extraVisits * spend;
  const extraPeriod = extraMonthly * p.months;
  const subPeriod = monthly * p.months;
  const netPeriod = Math.max(0, extraPeriod - subPeriod);
  const roi = subPeriod > 0 ? extraPeriod / subPeriod : 0;

  const coffees = Math.max(1, Math.round(monthly / spend));
  const paybackCustomers = Math.max(1, Math.ceil(monthly / Math.max(1, extraVisits * spend)));

  return (
    <div className="space-y-8">
      <header>
        <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">
          <TrendingUp className="w-4 h-4" /> Payback
        </div>
        <div className="flex items-center gap-2">
          <h2 className="text-3xl font-serif-display font-semibold">What your regulars are worth</h2>
          <InfoHint text="An estimate, not a promise. Slide in your own numbers to see what your loyal customers add over time, and how quickly the subscription pays for itself." label="payback" />
        </div>
        <p className="text-gray-500 mt-1 max-w-xl leading-relaxed">
          Move the three sliders to match {businessName ? businessName + '\u2019s' : 'your'} shop. We
          multiply your regulars by their extra visits and their average spend to estimate the extra
          revenue a loyalty program brings in.
        </p>
      </header>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Inputs */}
        <div className="p-6 border notion-border rounded-lg bg-white shadow-sm space-y-5">
          <Slider
            label="Regulars with a stamp card"
            hint="Your repeat customers \u2014 the ones who carry a paper stamp card today, or a Stampfix card on their phone."
            value={regulars} min={20} max={1000} step={10}
            onChange={setRegulars} format={(v) => v.toLocaleString('en-CA')}
          />
          <Slider
            label="Average spend per visit"
            hint="What one customer typically spends each time they come in."
            value={spend} min={3} max={60} step={1}
            onChange={setSpend} format={(v) => money(v)}
          />
          <Slider
            label="Extra visits per regular each month"
            hint="Chasing a reward brings people back more often. A loyalty program usually adds 1\u20132 extra visits a month for each regular."
            value={extraVisits} min={1} max={6} step={1}
            onChange={setExtraVisits} format={(v) => `+${v} / mo`}
          />
        </div>

        {/* Results */}
        <div className="p-6 border notion-border rounded-lg bg-[#37352F] text-white shadow-sm flex flex-col">
          {/* Time-period filter */}
          <div className="inline-flex flex-wrap gap-0.5 rounded-lg bg-white/10 p-0.5 text-xs mb-4 self-start">
            {PERIODS.map((x) => (
              <button
                key={x.key}
                onClick={() => setPeriod(x.key)}
                className={`px-2.5 py-1.5 rounded-md transition ${
                  period === x.key ? 'bg-white text-[#37352F] font-semibold' : 'text-gray-300 hover:text-white'
                }`}
              >
                {x.label}
              </button>
            ))}
          </div>

          <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Extra revenue \u00b7 {p.label}</p>
          <div className="text-5xl font-serif-display font-semibold mt-1 tabular-nums">{money(extraPeriod)}</div>
          <div className="mt-1 text-sm text-gray-300">from your returning customers</div>

          <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-gray-400 text-xs uppercase tracking-wide">Stampfix costs</div>
              <div className="text-lg font-semibold tabular-nums">{money(subPeriod)}</div>
            </div>
            <div>
              <div className="text-gray-400 text-xs uppercase tracking-wide">You keep</div>
              <div className="text-lg font-semibold tabular-nums text-amber-300">{money(netPeriod)}</div>
            </div>
          </div>

          <div className="mt-auto pt-6">
            <span className="inline-flex items-center gap-1.5 text-amber-300 font-semibold">
              <TrendingUp className="w-4 h-4" />
              {roi >= 1 ? `${roi.toFixed(roi < 10 ? 1 : 0)}\u00d7 what you pay comes back` : 'Add a few regulars to break even'}
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
            At {money(monthly)}/month{vat ? ' (incl. USt.)' : ''}, Stampfix costs about the price of{' '}
            <span className="font-semibold text-[#37352F]">{coffees} {coffees === 1 ? 'coffee' : 'coffees'}</span>
            {' '}\u2014 covered by just{' '}
            <span className="font-semibold text-[#37352F]">{paybackCustomers} returning {paybackCustomers === 1 ? 'regular' : 'regulars'}</span>
            {' '}a month. Everything your other regulars spend on top of that is pure upside.
          </p>
        </div>
      </div>
    </div>
  );
}
