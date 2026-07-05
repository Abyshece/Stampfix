import { MarketingLayout, Eyebrow, StartButton } from './MarketingLayout';
import { Coffee, Scissors, Truck, ShoppingBag } from 'lucide-react';

const CASES = [
  { icon: Coffee, tag: 'Cafés & coffee shops', focus: 'Speed', title: 'Keep the morning line moving.', body: 'Three-second stamping means no cold coffee and no queue backing up while someone fumbles with an app. Scan, stamp, next.' },
  { icon: Scissors, tag: 'Salons & spas', focus: 'High-value retention', title: 'Reward your most loyal clients.', body: 'When each visit is worth a lot, keeping a regular matters more than chasing a new booking. Give your best clients a reason to always come back to you.' },
  { icon: Truck, tag: 'Food trucks', focus: 'Portability', title: 'No clunky POS integrations.', body: 'Your loyalty program runs from your phone. Park anywhere, stamp anywhere — the card follows the customer, not the register.' },
  { icon: ShoppingBag, tag: 'Local retail', focus: 'Repeat visits', title: 'Turn browsers into regulars.', body: 'A card sitting in their wallet next to Apple Pay is a standing invitation to come back — and a nudge when they walk past your door.' },
];

export function UseCasesPage() {
  return (
    <MarketingLayout active="/use-cases">
      <section className="max-w-3xl mx-auto px-6 pt-20 pb-10 text-center">
        <Eyebrow>Who we help</Eyebrow>
        <h1 className="text-4xl md:text-6xl font-serif-display font-medium mt-6 mb-5 leading-[1.1] tracking-tight">
          Built for the businesses that make a neighbourhood.
        </h1>
        <p className="text-lg text-gray-500 leading-relaxed">
          Whatever you sell, loyalty works the same way: make it effortless, and people come back.
        </p>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-10">
        <div className="grid md:grid-cols-2 gap-5">
          {CASES.map(({ icon: Icon, tag, focus, title, body }) => (
            <div key={tag} className="border notion-border rounded-2xl p-8 hover:shadow-md transition">
              <div className="flex items-center justify-between mb-4">
                <div className="w-11 h-11 rounded-xl bg-[#37352F] text-white flex items-center justify-center">
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{focus}</span>
              </div>
              <div className="text-xs font-medium text-gray-400 mb-1">{tag}</div>
              <h3 className="text-lg font-semibold mb-2">{title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* In real life — Sarah */}
      <section className="max-w-3xl mx-auto px-6 py-12">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-serif-display font-medium">How it works in real life</h2>
        </div>
        <div className="space-y-4">
          {[
            { k: 'Scan', v: 'Sarah buys a croissant at your bakery. You ask if she wants a loyalty stamp. She points her camera at the Stampfix code on the counter.' },
            { k: 'Stamp', v: 'A branded page opens instantly on her phone. One tap and she has her first digital stamp.' },
            { k: 'Save', v: 'She taps \u201cSave to Apple Wallet.\u201d The card is now on her phone, next to her boarding passes and bank cards.' },
            { k: 'Return', v: 'Next week she\u2019s walking past. Her phone buzzes: she has a stamp card with you. She walks in, double-clicks to pull up the card, gets stamp two, and leaves smiling.' },
          ].map((row) => (
            <div key={row.k} className="flex gap-5 items-start border notion-border rounded-2xl p-6">
              <span className="text-sm font-semibold text-[#37352F] w-16 shrink-0 pt-0.5">{row.k}</span>
              <p className="text-[15px] text-gray-700 leading-relaxed">{row.v}</p>
            </div>
          ))}
        </div>
        <p className="text-center text-gray-400 mt-8 font-serif-display text-xl">No paper. No apps. No friction.</p>
      </section>

      <section className="max-w-4xl mx-auto px-6 py-10">
        <div className="bg-[#37352F] rounded-3xl px-8 py-14 text-center text-white">
          <h2 className="text-3xl md:text-4xl font-serif-display font-medium mb-4 leading-tight">Stop punching paper. Start building relationships.</h2>
          <StartButton label="Start your free trial" className="px-6 py-3 mt-2 !bg-white !text-[#37352F] hover:!bg-gray-100" />
        </div>
      </section>
    </MarketingLayout>
  );
}
