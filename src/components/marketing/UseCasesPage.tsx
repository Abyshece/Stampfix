import { MarketingLayout, Eyebrow, StartButton , GradientBanner } from './MarketingLayout';
import { Coffee, Scissors, Truck, ShoppingBag } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const CASES = [
  { icon: Coffee, tag: 'Cafés & bakeries', focus: 'Speed', title: 'Keep the morning line moving.', body: 'Three-second stamping keeps the line moving, no waiting while someone fumbles with an app. Scan, stamp, next.' },
  { icon: Scissors, tag: 'Salons & spas', focus: 'High-value retention', title: 'Reward your most loyal clients.', body: 'When each visit is worth a lot, keeping a regular matters more than chasing a new booking. Give your best clients a reason to always come back to you.' },
  { icon: Truck, tag: 'Food trucks', focus: 'Portability', title: 'No clunky POS integrations.', body: 'Your loyalty program runs from your phone. Park anywhere, stamp anywhere — the card follows the customer, not the register.' },
  { icon: ShoppingBag, tag: 'Local retail', focus: 'Repeat visits', title: 'Turn browsers into regulars.', body: 'A card sitting in their wallet next to Apple Pay is a standing invitation to come back — and a nudge when they walk past your door.' },
];

export function UseCasesPage() {
  const { t } = useTranslation();
  return (
    <MarketingLayout active="/use-cases">
      <section className="max-w-3xl mx-auto px-6 pt-20 pb-10 text-center">
        <Eyebrow>{t('usecases.eyebrow', { defaultValue: 'Who we help' })}</Eyebrow>
        <h1 className="text-4xl md:text-6xl font-serif-display font-medium mt-6 mb-5 leading-[1.1] tracking-tight">
          {t('usecases.h1', { defaultValue: 'Built for the businesses that make a neighbourhood.' })}
        </h1>
        <p className="text-lg text-gray-500 leading-relaxed">
          {t('usecases.sub', { defaultValue: 'Whatever you sell, loyalty works the same way: make it effortless, and people come back.' })}
        </p>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-10">
        <div className="grid md:grid-cols-2 gap-5">
          {CASES.map(({ icon: Icon, tag, focus, title, body }, i) => (
            <div key={tag} className="border notion-border rounded-2xl p-8 hover:shadow-md transition">
              <div className="flex items-center justify-between mb-4">
                <div className="w-11 h-11 rounded-xl bg-[#37352F] text-white flex items-center justify-center">
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{t(`usecases.c${i}focus`, { defaultValue: focus })}</span>
              </div>
              <div className="text-xs font-medium text-gray-400 mb-1">{t(`usecases.c${i}tag`, { defaultValue: tag })}</div>
              <h3 className="text-lg font-semibold mb-2">{t(`usecases.c${i}title`, { defaultValue: title })}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{t(`usecases.c${i}body`, { defaultValue: body })}</p>
            </div>
          ))}
        </div>
      </section>

      {/* In real life — Sarah */}
      <section className="max-w-3xl mx-auto px-6 py-12">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-serif-display font-medium">{t('usecases.realH2', { defaultValue: 'How it works in real life' })}</h2>
        </div>
        <div className="space-y-4">
          {[
            { k: 'Scan', v: 'Sarah buys a croissant at your bakery. You ask if she wants a loyalty stamp. She points her camera at the Stampfix code on the counter.' },
            { k: 'Stamp', v: 'A branded page opens instantly on her phone. One tap and she has her first digital stamp.' },
            { k: 'Save', v: 'She taps \u201cSave to Apple Wallet.\u201d The card is now on her phone, next to her boarding passes and bank cards.' },
            { k: 'Return', v: 'Next week she\u2019s walking past. Her phone buzzes: she has a stamp card with you. She walks in, double-clicks to pull up the card, gets stamp two, and leaves smiling.' },
          ].map((row, i) => (
            <div key={row.k} className="flex gap-5 items-start border notion-border rounded-2xl p-6">
              <span className="text-sm font-semibold text-[#37352F] w-16 shrink-0 pt-0.5">{t(`usecases.r${i}k`, { defaultValue: row.k })}</span>
              <p className="text-[15px] text-gray-700 leading-relaxed">{t(`usecases.r${i}v`, { defaultValue: row.v })}</p>
            </div>
          ))}
        </div>
        <p className="text-center text-gray-400 mt-8 font-serif-display text-xl">{t('usecases.realTag', { defaultValue: 'No paper. No apps. No friction.' })}</p>
      </section>

      <GradientBanner title={t('usecases.bannerTitle', { defaultValue: 'Stop punching paper. Start building relationships.' })} buttonLabel={t('usecases.bannerCta', { defaultValue: 'Start your free trial' })} />
    </MarketingLayout>
  );
}
