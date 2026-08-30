import { MarketingLayout, Eyebrow, StartButton , GradientBanner } from './MarketingLayout';
import { BarChart3, Zap, ShieldCheck, Sparkles } from 'lucide-react';

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
  return (
    <MarketingLayout active="/about">
      {/* Hero */}
      <section className="max-w-3xl mx-auto px-6 pt-20 pb-12 text-center">
        <Eyebrow>Our story</Eyebrow>
        <h1 className="text-4xl md:text-6xl font-serif-display font-medium mt-6 mb-5 leading-[1.1] tracking-tight text-balance">
          Because your best customers deserve better than a crumpled piece of paper.
        </h1>
        <p className="text-lg text-gray-500 leading-relaxed text-pretty">
          Stampfix is a lightning-fast web tool that gives independent merchants the power of a custom
          loyalty app — entirely through the mobile browser and native digital wallets. No App Store, no paper.
        </p>
      </section>

      {/* Story */}
      <section className="max-w-2xl mx-auto px-6 py-10 space-y-5 text-[15px] leading-relaxed text-gray-700">
        <h2 className="text-2xl font-serif-display font-semibold text-[#37352F]">Born from frustration</h2>
        <p>
          Every good product starts with an everyday annoyance. We were tired of losing paper punch cards when
          we were one stamp away from the reward. We were just as tired of being asked to download a 50&nbsp;MB
          app to get a discount on a sandwich.
        </p>
        <p>
          There was a real disconnect. Independent merchants — cafés, salons, food trucks, local retailers —
          need a way to build loyalty and keep customers coming back. But making a customer jump through hoops is
          the fastest way to lose them. So we asked a simple question:
        </p>
        <p className="text-xl font-serif-display text-[#37352F] leading-snug py-2">
          What if loyalty required zero friction — join, get a stamp, and save your progress in under five
          seconds, without ever visiting the App Store?
        </p>
        <p>That question became Stampfix.</p>
      </section>

      {/* Vision + Mission */}
      <section className="max-w-4xl mx-auto px-6 py-10">
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-[#F7F7F5] border notion-border rounded-2xl p-8">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Our vision</h3>
            <p className="text-xl font-serif-display text-[#37352F] leading-snug">
              To become the global standard for frictionless customer loyalty.
            </p>
            <p className="text-sm text-gray-500 mt-4 leading-relaxed">
              Building relationships with your regulars shouldn&rsquo;t need a massive tech budget — and it
              certainly shouldn&rsquo;t need paper.
            </p>
          </div>
          <div className="bg-[#F7F7F5] border notion-border rounded-2xl p-8">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Our mission</h3>
            <p className="text-xl font-serif-display text-[#37352F] leading-snug">
              Level the playing field for independent business.
            </p>
            <p className="text-sm text-gray-500 mt-4 leading-relaxed">
              Give local shops the exact same digital-wallet technology the big chains use — for the price of a
              few lunches a month.
            </p>
          </div>
        </div>
      </section>

      {/* Why we build */}
      <section className="max-w-2xl mx-auto px-6 py-10 space-y-5 text-[15px] leading-relaxed text-gray-700">
        <h2 className="text-2xl font-serif-display font-semibold text-[#37352F]">Why we&rsquo;re building this</h2>
        <p>
          For years, big-box retailers and national chains have owned customer loyalty — because they could afford
          million-dollar apps. Everyone else was left with the paper punch card. We think independent businesses
          are the heartbeat of a community, and they deserve the same tools.
        </p>
        <p>
          Loyalty is about making customers feel valued, not giving them homework. Stampfix exists to remove the
          friction on both sides of the counter: nothing to download for the customer, nothing to engineer for
          the merchant.
        </p>
      </section>

      {/* How it helps small business */}
      <section className="max-w-5xl mx-auto px-6 py-12">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="text-3xl font-serif-display font-medium mb-3">How it helps small business</h2>
          <p className="text-gray-500">Four things change the day you retire the paper card.</p>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          {MERCHANT_BENEFITS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="border notion-border rounded-2xl p-7 hover:shadow-md transition">
              <div className="w-11 h-11 rounded-xl bg-[#37352F] text-white flex items-center justify-center mb-4">
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <GradientBanner
        title="Turn casual walk-ins into lifelong regulars."
        subtitle="Ditch the paper, skip the App Store, and give your customers a loyalty card they’ll actually use."
        buttonLabel="Start your free trial"
      />
    </MarketingLayout>
  );
}
