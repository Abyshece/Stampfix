import { MarketingLayout, Eyebrow, StartButton , GradientBanner } from './MarketingLayout';
import { BarChart3, Zap, ShieldCheck, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const MERCHANT_BENEFITS = [
  {
    icon: BarChart3,
    title: 'You finally get customer data',
    body: 'Hand out a paper card and the customer walks out a ghost — you never learn their name, how often they visit, or what they buy. Stampfix captures that from the first stamp, so you can see who your best regulars are and run promotions that actually land.',
  },
  {
    icon: Zap,
    title: 'Zero friction, higher sign-ups',
    body: 'Ask 100 people to download an app at the register and maybe 5 will. Ask them to scan a QR code with the camera they already have open and almost all of them will. More people joining means a program that actually works.',
  },
  {
    icon: ShieldCheck,
    title: 'No printing costs, no fraud',
    body: 'Stop reprinting hundreds of cards that end up in the bin, and stop worrying about hole-punchers bought online to fake stamps. Every stamp is digital, signed, and server-verified.',
  },
  {
    icon: Sparkles,
    title: 'You look like a premium brand',
    body: 'A sleek, scan-to-stamp card that lives in Apple Wallet tells customers you are modern, efficient, and that you respect their time — the same experience the big chains spent millions building.',
  },
];

export function AboutPage() {
  const { t } = useTranslation();
  return (
    <MarketingLayout active="/about">
      {/* Hero */}
      <section className="max-w-3xl mx-auto px-6 pt-20 pb-12 text-center">
        <Eyebrow>{t('about.eyebrow', { defaultValue: 'Our story' })}</Eyebrow>
        <h1 className="text-4xl md:text-6xl font-serif-display font-medium mt-6 mb-5 leading-[1.1] tracking-tight text-balance">
          {t('about.h1', { defaultValue: 'Because your best customers deserve better than a crumpled piece of paper.' })}
        </h1>
        <p className="text-lg text-gray-500 leading-relaxed text-pretty">
          {t('about.sub', { defaultValue: 'Stampfix is a lightning-fast web tool that gives independent merchants the power of a custom loyalty app — entirely through the mobile browser and native digital wallets. No App Store, no paper.' })}
        </p>
      </section>

      {/* Story */}
      <section className="max-w-2xl mx-auto px-6 py-10 space-y-5 text-[15px] leading-relaxed text-gray-700">
        <h2 className="text-2xl font-serif-display font-semibold text-[#37352F]">{t('about.bornH2', { defaultValue: 'Born from frustration' })}</h2>
        <p>
          {t('about.bornP1', { defaultValue: 'Every good product starts with an everyday annoyance. We were tired of losing paper punch cards when we were one stamp away from the reward. We were just as tired of being asked to download a 50\u00a0MB app to get a discount on a sandwich.' })}
        </p>
        <p>
          {t('about.bornP2', { defaultValue: 'There was a real disconnect. Independent merchants — cafés, salons, food trucks, local retailers — need a way to build loyalty and keep customers coming back. But making a customer jump through hoops is the fastest way to lose them. So we asked a simple question:' })}
        </p>
        <p className="text-xl font-serif-display text-[#37352F] leading-snug py-2">
          {t('about.bornQ', { defaultValue: 'What if loyalty required zero friction — join, get a stamp, and save your progress in under five seconds, without ever visiting the App Store?' })}
        </p>
        <p>{t('about.bornP3', { defaultValue: 'That question became Stampfix.' })}</p>
      </section>

      {/* Vision + Mission */}
      <section className="max-w-4xl mx-auto px-6 py-10">
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-[#F7F7F5] border notion-border rounded-2xl p-8">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">{t('about.visionLabel', { defaultValue: 'Our vision' })}</h3>
            <p className="text-xl font-serif-display text-[#37352F] leading-snug">
              {t('about.visionText', { defaultValue: 'To become the global standard for frictionless customer loyalty.' })}
            </p>
            <p className="text-sm text-gray-500 mt-4 leading-relaxed">
              {t('about.visionSub', { defaultValue: 'Building relationships with your regulars shouldn’t need a massive tech budget — and it certainly shouldn’t need paper.' })}
            </p>
          </div>
          <div className="bg-[#F7F7F5] border notion-border rounded-2xl p-8">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">{t('about.missionLabel', { defaultValue: 'Our mission' })}</h3>
            <p className="text-xl font-serif-display text-[#37352F] leading-snug">
              {t('about.missionText', { defaultValue: 'Level the playing field for independent business.' })}
            </p>
            <p className="text-sm text-gray-500 mt-4 leading-relaxed">
              {t('about.missionSub', { defaultValue: 'Give local shops the exact same digital-wallet technology the big chains use — for the price of a few lunches a month.' })}
            </p>
          </div>
        </div>
      </section>

      {/* Why we build */}
      <section className="max-w-2xl mx-auto px-6 py-10 space-y-5 text-[15px] leading-relaxed text-gray-700">
        <h2 className="text-2xl font-serif-display font-semibold text-[#37352F]">{t('about.whyH2', { defaultValue: 'Why we’re building this' })}</h2>
        <p>
          {t('about.whyP1', { defaultValue: 'For years, big-box retailers and national chains have owned customer loyalty — because they could afford million-dollar apps. Everyone else was left with the paper punch card. We think independent businesses are the heartbeat of a community, and they deserve the same tools.' })}
        </p>
        <p>
          {t('about.whyP2', { defaultValue: 'Loyalty is about making customers feel valued, not giving them homework. Stampfix exists to remove the friction on both sides of the counter: nothing to download for the customer, nothing to engineer for the merchant.' })}
        </p>
      </section>

      {/* How it helps small business */}
      <section className="max-w-5xl mx-auto px-6 py-12">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="text-3xl font-serif-display font-medium mb-3">{t('about.helpH2', { defaultValue: 'How it helps small business' })}</h2>
          <p className="text-gray-500">{t('about.helpSub', { defaultValue: 'Four things change the day you retire the paper card.' })}</p>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          {MERCHANT_BENEFITS.map(({ icon: Icon, title, body }, i) => (
            <div key={title} className="border notion-border rounded-2xl p-7 hover:shadow-md transition">
              <div className="w-11 h-11 rounded-xl bg-[#37352F] text-white flex items-center justify-center mb-4">
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{t(`about.m${i}t`, { defaultValue: title })}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{t(`about.m${i}b`, { defaultValue: body })}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <GradientBanner
        title={t('about.bannerTitle', { defaultValue: 'Turn casual walk-ins into lifelong regulars.' })}
        subtitle={t('about.bannerSub', { defaultValue: 'Ditch the paper, skip the App Store, and give your customers a loyalty card they’ll actually use.' })}
        buttonLabel={t('about.bannerCta', { defaultValue: 'Start your free trial' })}
      />
    </MarketingLayout>
  );
}
