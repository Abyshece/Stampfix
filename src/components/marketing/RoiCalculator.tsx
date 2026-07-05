import { useState } from 'react';
import { MarketingLayout, Eyebrow, StartButton } from './MarketingLayout';

const STAMPFIX_MONTHLY = 29.99;      // CA$29.99 / month, flat
const LOST_RATE = 0.3;               // ~30% of paper cards get lost or forgotten
const RECOVER_RATE = 0.2;            // of those, a fifth would have come back once more

const money = (n: number) =>
  '$' + Math.round(n).toLocaleString('en-US');

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

export function RoiCalculator() {
  const [cardsPerMonth, setCardsPerMonth] = useState(150);
  const [costPerCard, setCostPerCard] = useState(0.2);
  const [returnValue, setReturnValue] = useState(12);

  const annualPrint = cardsPerMonth * costPerCard * 12;
  const stampfixAnnual = STAMPFIX_MONTHLY * 12;
  const lostCustomers = cardsPerMonth * 12 * LOST_RATE * RECOVER_RATE;
  const lostRevenue = lostCustomers * returnValue;
  const totalSaving = Math.max(0, annualPrint + lostRevenue - stampfixAnnual);

  // bar widths (relative to the larger of the two so the comparison reads clearly)
  const paperTotal = annualPrint + lostRevenue;
  const maxBar = Math.max(paperTotal, stampfixAnnual, 1);

  return (
    <MarketingLayout active="/savings">
      <section className="max-w-3xl mx-auto px-6 pt-20 pb-8 text-center">
        <Eyebrow>Savings calculator</Eyebrow>
        <h1 className="text-4xl md:text-6xl font-serif-display font-medium mt-6 mb-5 leading-[1.1] tracking-tight">
          How much are paper cards costing you?
        </h1>
        <p className="text-lg text-gray-500 leading-relaxed">
          Printing is only the visible cost. Slide the numbers to your shop and see the real total —
          then compare it to one flat monthly price.
        </p>
      </section>

      <section className="max-w-4xl mx-auto px-6 pb-16">
        <div className="grid md:grid-cols-2 gap-6 items-start">
          {/* Inputs */}
          <div className="border notion-border rounded-2xl p-7 space-y-7">
            <h2 className="font-semibold">Your numbers</h2>
            <Slider
              label="Cards handed out / month" value={cardsPerMonth}
              min={10} max={1000} step={10} onChange={setCardsPerMonth}
              format={(v) => v.toLocaleString('en-US')}
            />
            <Slider
              label="Cost to print each card" value={costPerCard}
              min={0.05} max={1} step={0.05} onChange={setCostPerCard}
              format={(v) => '$' + v.toFixed(2)}
            />
            <Slider
              label="Avg. spend on a return visit" value={returnValue}
              min={3} max={60} step={1} onChange={setReturnValue}
              format={(v) => '$' + v}
            />
            <p className="text-xs text-gray-400 leading-relaxed pt-1">
              Lost-revenue estimate assumes ~30% of paper cards are lost or forgotten, and a fifth of
              those customers would have returned once more. Adjust the return value to match your shop.
            </p>
          </div>

          {/* Results */}
          <div className="space-y-4">
            <div className="bg-[#37352F] rounded-2xl p-7 text-white">
              <div className="text-sm text-white/60 mb-1">You could save about</div>
              <div className="text-5xl font-serif-display font-medium tabular-nums leading-none">
                {money(totalSaving)}<span className="text-2xl text-white/50">/yr</span>
              </div>
              <div className="mt-6">
                <StartButton label="Start your free trial" className="px-5 py-2.5 text-sm !bg-white !text-[#37352F] hover:!bg-gray-100" />
              </div>
            </div>

            <div className="border notion-border rounded-2xl p-7 space-y-4">
              <Row label="Annual printing cost" value={money(annualPrint)} />
              <Row label="Lost repeat revenue (est.)" value={money(lostRevenue)} />
              <div className="border-t notion-border pt-4">
                <Row label="Total paper is costing you" value={money(paperTotal)} strong />
              </div>
              <Row label="Stampfix (flat, unlimited)" value={money(stampfixAnnual) + '/yr'} muted />

              {/* comparison bars */}
              <div className="pt-2 space-y-2">
                <Bar label="Paper" width={(paperTotal / maxBar) * 100} tone="dark" amount={money(paperTotal)} />
                <Bar label="Stampfix" width={(stampfixAnnual / maxBar) * 100} tone="light" amount={money(stampfixAnnual)} />
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-8">
          Stampfix is a flat CA$29.99 / month with unlimited customers and cards. Figures are estimates to
          illustrate the difference, not a quote.
        </p>
      </section>
    </MarketingLayout>
  );
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className={`text-sm ${muted ? 'text-gray-400' : 'text-gray-600'}`}>{label}</span>
      <span className={`tabular-nums ${strong ? 'text-lg font-semibold text-[#37352F]' : muted ? 'text-gray-400' : 'font-medium text-[#37352F]'}`}>{value}</span>
    </div>
  );
}

function Bar({ label, width, tone, amount }: { label: string; width: number; tone: 'dark' | 'light'; amount: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-400 w-16 shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
        <div
          className={`h-full rounded-full flex items-center justify-end px-2 transition-all duration-300 ${tone === 'dark' ? 'bg-[#37352F]' : 'bg-gray-300'}`}
          style={{ width: `${Math.max(width, 8)}%` }}
        >
          <span className={`text-[10px] font-semibold ${tone === 'dark' ? 'text-white' : 'text-gray-600'}`}>{amount}</span>
        </div>
      </div>
    </div>
  );
}
