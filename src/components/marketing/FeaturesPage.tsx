import { MarketingLayout, Eyebrow, StartButton } from './MarketingLayout';
import { Wallet, BellRing, BarChart3, ShieldCheck, Smartphone, RefreshCw } from 'lucide-react';

const STEPS = [
  { n: '1', title: 'Customer scans', body: 'They point their phone camera at your Stampfix QR code. A branded page opens instantly in the browser — nothing to install.' },
  { n: '2', title: 'You stamp', body: 'One tap from you (or a scan) adds a digital stamp. Every stamp is signed and server-verified, so it can\u2019t be faked.' },
  { n: '3', title: 'Saved to Wallet', body: 'They tap Add to Apple Wallet or Google Wallet. The card now lives next to their Apple Pay, impossible to lose.' },
];

const FEATURES = [
  { icon: Wallet, title: 'Apple & Google Wallet, natively', body: 'Customers already have Wallet installed for their credit cards and boarding passes. Your loyalty card slots right in — no new app, ever.' },
  { icon: BellRing, title: 'Location-based reminders', body: 'Because the card lives in their native wallet, it can nudge their lock screen when they\u2019re near your shop: \u201cYou\u2019re one stamp away from a free coffee.\u201d' },
  { icon: RefreshCw, title: 'Dynamic, real-time updates', body: 'Add a stamp and the card in their wallet updates on its own. They always see exactly how close they are to the reward.' },
  { icon: BarChart3, title: 'A merchant dashboard', body: 'Know your customers by name, not just by face. See your best regulars, visit frequency, and retention at a glance.' },
  { icon: ShieldCheck, title: 'Fraud-proof stamps', body: 'Digital, signed stamps end the era of hole-punchers bought online to game your paper cards.' },
  { icon: Smartphone, title: 'Zero-download onboarding', body: 'A QR scan beats an app install every time. Higher participation, no App Store friction, no cold coffee at the register.' },
];

export function FeaturesPage() {
  return (
    <MarketingLayout active="/features">
      <section className="max-w-3xl mx-auto px-6 pt-20 pb-10 text-center">
        <Eyebrow>Features</Eyebrow>
        <h1 className="text-4xl md:text-6xl font-serif-display font-medium mt-6 mb-5 leading-[1.1] tracking-tight">
          The loyalty program your customers will actually use.
        </h1>
        <p className="text-lg text-gray-500 leading-relaxed">
          Enterprise-grade retention on a local-business budget — your brand, right next to their Apple&nbsp;Pay.
        </p>
      </section>

      {/* How it works 1-2-3 */}
      <section className="max-w-5xl mx-auto px-6 py-12">
        <h2 className="text-center text-2xl font-serif-display font-semibold mb-10">How it works</h2>
        <div className="grid md:grid-cols-3 gap-5">
          {STEPS.map((s) => (
            <div key={s.n} className="border notion-border rounded-2xl p-7">
              <div className="text-5xl font-serif-display text-[#37352F]/15 leading-none mb-3">{s.n}</div>
              <h3 className="text-lg font-semibold mb-2">{s.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* The wallet advantage callout */}
      <section className="max-w-4xl mx-auto px-6 py-8">
        <div className="bg-[#F7F7F5] border notion-border rounded-3xl p-8 md:p-10">
          <h2 className="text-2xl font-serif-display font-semibold mb-3">The secret weapon: native wallets</h2>
          <p className="text-gray-600 leading-relaxed">
            This is where Stampfix goes from a cool web tool to a retention strategy. The moment a customer saves
            your card to Apple Wallet or Google Wallet, your brand lives on their phone forever — front and center,
            impossible to lose, and quietly reminding them to come back.
          </p>
        </div>
      </section>

      {/* Feature grid */}
      <section className="max-w-5xl mx-auto px-6 py-12">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="border notion-border rounded-2xl p-7 hover:shadow-md transition">
              <div className="w-11 h-11 rounded-xl bg-[#37352F] text-white flex items-center justify-center mb-4">
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="font-semibold mb-2">{title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 py-14">
        <div className="bg-[#37352F] rounded-3xl px-8 py-14 text-center text-white">
          <h2 className="text-3xl md:text-4xl font-serif-display font-medium mb-4 leading-tight">We handle the tech. You handle the coffee.</h2>
          <p className="text-white/70 mb-8 max-w-lg mx-auto">Premium customer retention, minimal monthly cost. No setup fees, no app development.</p>
          <StartButton label="Start your free trial" className="px-6 py-3 !bg-white !text-[#37352F] hover:!bg-gray-100" />
        </div>
      </section>
    </MarketingLayout>
  );
}
