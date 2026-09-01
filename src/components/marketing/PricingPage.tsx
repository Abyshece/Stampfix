import { MarketingLayout, Eyebrow, StartButton, GradientBanner } from './MarketingLayout';
import {
  Check, Smartphone, Zap, Globe, BarChart3, Palette, Building2, Users, Wallet,
  FileDown, Gauge, Link2, MapPin, BellRing, ShieldCheck, Printer, LifeBuoy, Sparkles, TrendingUp,
} from 'lucide-react';
import { useState } from 'react';
import { proMonthly, type MerchantCountry } from '../../lib/pricing';

const FREE = [
  'Up to 10 customer cards',
  '1 location',
  'Apple Wallet & Google Wallet passes',
  'Your phone or tablet as the scanner',
  'Stamps, rewards & a QR signup poster',
];

const PRO = [
  'Unlimited customer cards',
  'Unlimited locations',
  'Custom card branding + live preview',
  'Analytics — per-location & per-offer',
  'Staff PINs, activity & permissions',
  'Custom links on your cards',
  'CSV export',
  'Per-customer stamp limits',
  'Custom-branded posters (3 sizes)',
  'Customer segments & animated stamps',
];

/**
 * Each Pro capability with a plain-language reason it matters to a small
 * business — framed around getting customers back and marketing, not features.
 * Icons use the wallet-card palette and animate continuously.
 */
export const BENEFITS = [
  { icon: Smartphone,  c: '#75FBFD', fg: '#1A1A1A', anim: 'pf-fl', title: 'Your phone is the scanner', body: 'Start today with the device already in your pocket. No hardware to buy, install, or maintain — money that stays in your business.' },
  { icon: Zap,         c: '#EA3323', fg: '#FFFFFF', anim: 'pf-pu', title: 'Live in 1–2 minutes', body: 'No setup fees, no onboarding calls. Design your card and start stamping before your next customer walks in.' },
  { icon: Globe,       c: '#510AF5', fg: '#FCFF54', anim: 'pf-sp', title: 'No app to download', body: 'Kill the biggest reason loyalty programs fail. Customers add the pass to the wallet they already use — no install, no signup, no friction at the counter.' },
  { icon: BarChart3,   c: '#F7CE46', fg: '#1A1A1A', anim: 'pf-fl', title: 'Analytics that guide you', body: 'See which location and which offer actually brings people back, so you double down on what works and stop guessing.' },
  { icon: Palette,     c: '#EA33B6', fg: '#FFFFFF', anim: 'pf-wg', title: 'Your brand, your card', body: 'Match your colours and logo. Every time a customer opens their wallet, your brand is right there — free advertising in their pocket.' },
  { icon: Building2,   c: '#1132F5', fg: '#FFFFFF', anim: 'pf-fl', title: 'One offer, every branch', body: 'Launch a promotion across all your shops at once. Campaigns go out in seconds, not shop by shop.' },
  { icon: Users,       c: '#F0A479', fg: '#1A1A1A', anim: 'pf-pu', title: 'Staff you can trust', body: 'Every stamp is tied to a team member, so you catch mistakes and abuse early — and decide who sees your numbers.' },
  { icon: Wallet,      c: '#75FBE2', fg: '#1A1A1A', anim: 'pf-fl', title: 'Apple & Google Wallet', body: 'The pass lives beside their payment cards and boarding passes. Always carried, never lost, always one swipe away.' },
  { icon: FileDown,    c: '#ABC2C2', fg: '#1A1A1A', anim: 'pf-bo', title: 'Export your data anytime', body: 'Your customer list is yours. Export to CSV for email marketing, bookkeeping, or deeper analysis in your own tools.' },
  { icon: Gauge,       c: '#EA3323', fg: '#FFFFFF', anim: 'pf-wg', title: 'Stamp limits per customer', body: 'Protect your margins — cap daily stamps so a visit earns a stamp, not a fully-padded card.' },
  { icon: Link2,       c: '#75FBFD', fg: '#1A1A1A', anim: 'pf-sp', title: 'Links on the card', body: 'Turn the pass into a marketing channel: add Instagram, delivery, and your website, one tap from the customer’s wallet.' },
  { icon: MapPin,      c: '#510AF5', fg: '#FFFFFF', anim: 'pf-fl', title: 'Multi-location ready', body: 'Add branches as you grow, each tracked on its own, so you always know which shop is performing.' },
  { icon: BellRing,    c: '#F7CE46', fg: '#1A1A1A', anim: 'pf-wg', title: 'Geo reminders', body: 'Customers get a lock-screen nudge when they’re nearby — free foot traffic from people already carrying your card.' },
  { icon: ShieldCheck, c: '#111318', fg: '#FFFFFF', anim: 'pf-pu', title: 'GDPR handled for you', body: 'Consent and deletion flows are built in, so you stay compliant and keep customer trust without the legal headache.' },
  { icon: Printer,     c: '#EA33B6', fg: '#FFFFFF', anim: 'pf-fl', title: 'Print-ready posters', body: 'Counter cards, A5, and A4, ready to print — everything you need to turn walk-ins into signups, no designer required.' },
  { icon: LifeBuoy,    c: '#1132F5', fg: '#FFFFFF', anim: 'pf-sp', title: 'Help in your dashboard', body: 'Reach us straight from the app, so a question never slows down your service.' },
  { icon: Sparkles,    c: '#F0A479', fg: '#1A1A1A', anim: 'pf-pu', title: 'Delightful stamps', body: 'Sound and animation make earning a stamp feel like a win — the little moment that brings people back for the next one.' },
  { icon: TrendingUp,  c: '#75FBE2', fg: '#1A1A1A', anim: 'pf-fl', title: 'Find who to reach', body: 'Instantly surface lapsed customers to win back and your top spenders to reward. Targeted marketing, one tap away.' },
];

export function PricingPage() {
  const [country, setCountry] = useState<MerchantCountry>('CA');
  const { amount, symbol } = proMonthly(country);
  return (
    <MarketingLayout active="/pricing">
      <section className="max-w-3xl mx-auto px-6 pt-20 pb-8 text-center">
        <Eyebrow>Pricing</Eyebrow>
        <h1 className="text-4xl md:text-6xl font-serif-display font-medium mt-6 mb-5 leading-[1.1] tracking-tight">
          Start free. Upgrade when it pays for itself.
        </h1>
        <p className="text-lg text-gray-500 leading-relaxed">
          One simple plan when you’re ready — no per-customer fees, no contracts, cancel anytime.
        </p>
      </section>

      {/* Plans */}
      <section className="max-w-4xl mx-auto px-6 pb-6">
        <div className="flex justify-center mb-8">
          <div className="inline-flex rounded-lg border notion-border bg-white p-0.5 text-sm">
            {(['CA', 'DE'] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCountry(c)}
                className={`px-4 py-1.5 rounded-md transition ${country === c ? 'bg-[#37352F] text-white font-medium' : 'text-gray-600 hover:text-[#37352F]'}`}
              >
                {c === 'CA' ? 'CA$ · Canada' : '€ · Germany'}
              </button>
            ))}
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-6 items-stretch">
          {/* Free */}
          <div className="border notion-border rounded-2xl p-8 flex flex-col bg-white">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Free</div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-5xl font-serif-display font-semibold">{symbol}0</span>
              <span className="text-gray-500 text-sm">/month</span>
            </div>
            <p className="text-gray-500 mt-2 text-sm">Everything you need to launch a loyalty card and start stamping.</p>
            <ul className="mt-6 space-y-3 flex-1">
              {FREE.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-[#37352F]">
                  <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" strokeWidth={3} />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <StartButton label="Start for free" className="mt-8 w-full py-3" />
          </div>

          {/* Pro */}
          <div className="relative border-2 border-[#37352F] rounded-2xl p-8 flex flex-col bg-white shadow-lg">
            <span className="absolute -top-3 left-8 bg-[#37352F] text-white text-[11px] font-semibold px-3 py-1 rounded-full uppercase tracking-wide">Most popular</span>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Pro</div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-5xl font-serif-display font-semibold">{symbol}{amount}</span>
              <span className="text-gray-500 text-sm">/month</span>
            </div>
            <p className="text-gray-500 mt-2 text-sm">Everything in Free, plus the full toolkit.{country === 'DE' ? ' Prices include VAT.' : ''}</p>
            <ul className="mt-6 space-y-3 flex-1">
              {PRO.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-[#37352F]">
                  <Check className="w-4 h-4 text-[#37352F] flex-shrink-0 mt-0.5" strokeWidth={3} />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <StartButton label="Start free, upgrade anytime" className="mt-8 w-full py-3" />
          </div>
        </div>
        <p className="text-center text-xs text-gray-400 mt-5">
          No card details needed to start. You only upgrade once Stampfix is already working for you.
        </p>
      </section>

      {/* Enterprise */}
      <section className="max-w-4xl mx-auto px-6 pb-4">
        <div className="rounded-xl border notion-border bg-[#F7F7F5] p-8 text-center">
          <span className="text-xs uppercase tracking-widest font-bold text-gray-400">Enterprise</span>
          <h2 className="text-2xl md:text-3xl font-serif-display font-semibold mt-2 mb-3">Running a larger chain or franchise?</h2>
          <p className="text-gray-500 max-w-xl mx-auto mb-6">
            For bigger businesses with many locations and custom needs, we&apos;ll tailor Stampfix to your rollout and pricing. Book a quick demo and we&apos;ll walk you through it.
          </p>
          <a
            href="https://calendar.app.google/WCPgkaPjeoUbkQJq7"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#37352F] text-white px-6 py-3 rounded-lg font-medium hover:bg-[#2F2D28] transition"
          >
            Contact for demo
          </a>
          <p className="text-xs text-gray-400 mt-3">Just 10–12 minutes over Google Meet.</p>
        </div>
      </section>

      {/* 18 benefits explained */}
      <section className="max-w-6xl mx-auto px-6 py-14">
        <div className="text-center mb-10 md:mb-14">
          <span className="text-xs uppercase tracking-widest font-bold text-gray-400">What Pro gives you</span>
          <h2 className="text-3xl md:text-4xl font-serif-display font-semibold mt-2 mb-4">
            Every feature, and what it does for your business
          </h2>
          <p className="text-gray-500 max-w-xl mx-auto">
            Pro isn’t a longer feature list for its own sake — each of these is built to bring customers back and take work off your plate.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {BENEFITS.map((b, i) => (
            <div key={b.title} className="rounded-2xl border notion-border bg-white p-6 flex flex-col gap-3.5 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm" style={{ background: b.c, color: b.fg }}>
                <b.icon className={`w-6 h-6 ${b.anim}`} strokeWidth={2.2} style={{ animationDelay: `${(i % 6) * 0.15}s` }} />
              </div>
              <h3 className="font-semibold text-[#37352F] leading-snug">{b.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{b.body}</p>
            </div>
          ))}
        </div>
      </section>

      <GradientBanner
        title="Try it free. See the repeat visits."
        subtitle="Set up your first loyalty card in minutes — no card details, no commitment."
        buttonLabel="Start for free"
      />

      <style>{`
        @keyframes pf-fl { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
        @keyframes pf-pu { 0%,100%{transform:scale(1)} 50%{transform:scale(1.18)} }
        @keyframes pf-wg { 0%,100%{transform:rotate(0)} 25%{transform:rotate(-12deg)} 75%{transform:rotate(12deg)} }
        @keyframes pf-sp { to{transform:rotate(360deg)} }
        @keyframes pf-bo { 0%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }
        .pf-fl{animation:pf-fl 3s ease-in-out infinite}
        .pf-pu{animation:pf-pu 2.4s ease-in-out infinite}
        .pf-wg{animation:pf-wg 2.6s ease-in-out infinite}
        .pf-sp{animation:pf-sp 8s linear infinite}
        .pf-bo{animation:pf-bo 2.6s ease-in-out infinite}
      `}</style>
    </MarketingLayout>
  );
}
