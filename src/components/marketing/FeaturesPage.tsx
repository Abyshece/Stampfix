import { useEffect, useRef, useState } from 'react';
import { MarketingLayout, Eyebrow, StartButton } from './MarketingLayout';
import { Wallet, BellRing, BarChart3, ShieldCheck, Smartphone, RefreshCw } from 'lucide-react';

/** Fire once when the element scrolls into view. */
function useInView<T extends HTMLElement>(threshold = 0.2) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const o = new IntersectionObserver(
      (e) => { if (e[0].isIntersecting) { setSeen(true); o.disconnect(); } },
      { threshold },
    );
    o.observe(el);
    return () => o.disconnect();
  }, [threshold]);
  return { ref, seen };
}

// Colours pulled from the wallet-card palette.
const STEPS = [
  { n: '1', c: '#75FBFD', title: 'Customer scans', body: 'They point their phone camera at your Stampfix QR code. A branded page opens instantly in the browser \u2014 nothing to install.' },
  { n: '2', c: '#510AF5', title: 'You stamp', body: 'One tap from you (or a scan) adds a digital stamp. Every stamp is signed and server-verified, so it can\u2019t be faked.' },
  { n: '3', c: '#EA3323', title: 'Saved to Wallet', body: 'They tap Add to Apple Wallet or Google Wallet. The card now lives next to their Apple Pay, impossible to lose.' },
];

const FEATURES = [
  { icon: Wallet,      c: '#75FBFD', fg: '#223355', title: 'Apple & Google Wallet, natively', body: 'Customers already have Wallet installed for their credit cards and boarding passes. Your loyalty card slots right in \u2014 no new app, ever.' },
  { icon: BellRing,    c: '#EA33B6', fg: '#FFFFFF', title: 'Location-based reminders', body: 'Because the card lives in their native wallet, it can nudge their lock screen when they\u2019re near your shop: \u201cYou\u2019re one stamp away from your reward.\u201d' },
  { icon: RefreshCw,   c: '#510AF5', fg: '#FCFF54', title: 'Dynamic, real-time updates', body: 'Add a stamp and the card in their wallet updates on its own. They always see exactly how close they are to the reward.' },
  { icon: BarChart3,   c: '#F7CE46', fg: '#1A1A1A', title: 'A merchant dashboard', body: 'Know your customers by name, not just by face. See your best regulars, visit frequency, and retention at a glance.' },
  { icon: ShieldCheck, c: '#1132F5', fg: '#FFFFFF', title: 'Fraud-proof stamps', body: 'Digital, signed stamps end the era of hole-punchers bought online to game your paper cards.' },
  { icon: Smartphone,  c: '#F0A479', fg: '#1A1A1A', title: 'Zero-download onboarding', body: 'A QR scan beats an app install every time. Higher participation, no App Store friction, no hold-ups at the register.' },
];

const WALLET_LINEAR =
  'linear-gradient(90deg,#75FBFD,#1132F5,#510AF5,#EA33B6,#EA3323,#F0A479,#F7CE46,#75FBFD)';

function StepBox({ s, i }: { s: (typeof STEPS)[number]; i: number }) {
  const { ref, seen } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className="relative border notion-border rounded-2xl p-7 overflow-hidden transition-all duration-500 ease-out hover:shadow-md hover:-translate-y-1"
      style={{ opacity: seen ? 1 : 0, transform: seen ? 'translateY(0)' : 'translateY(18px)', transitionDelay: `${i * 110}ms` }}
    >
      <span className="absolute top-0 left-0 h-1 w-full" style={{ background: s.c }} />
      <div className="text-5xl font-serif-display font-semibold leading-none mb-3" style={{ color: s.c }}>{s.n}</div>
      <h3 className="text-lg font-semibold mb-2">{s.title}</h3>
      <p className="text-sm text-gray-600 leading-relaxed">{s.body}</p>
    </div>
  );
}

function FeatureBox({ f, i }: { f: (typeof FEATURES)[number]; i: number }) {
  const { ref, seen } = useInView<HTMLDivElement>();
  const Icon = f.icon;
  return (
    <div
      ref={ref}
      className="border notion-border rounded-2xl p-7 transition-all duration-500 ease-out hover:shadow-md hover:-translate-y-1"
      style={{ opacity: seen ? 1 : 0, transform: seen ? 'translateY(0)' : 'translateY(18px)', transitionDelay: `${i * 80}ms` }}
    >
      <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 shadow-sm" style={{ background: f.c, color: f.fg }}>
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="font-semibold mb-2">{f.title}</h3>
      <p className="text-sm text-gray-600 leading-relaxed">{f.body}</p>
    </div>
  );
}

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
          {STEPS.map((s, i) => <StepBox key={s.n} s={s} i={i} />)}
        </div>
      </section>

      {/* The wallet advantage callout */}
      <section className="max-w-4xl mx-auto px-6 py-8">
        <div
          className="border notion-border rounded-3xl p-8 md:p-10"
          style={{ background: 'linear-gradient(135deg, #ECFEFF 0%, #F5F3FF 45%, #FFF7ED 100%)' }}
        >
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
          {FEATURES.map((f, i) => <FeatureBox key={f.title} f={f} i={i} />)}
        </div>
      </section>

      {/* We handle the tech — animated rainbow gradient border */}
      <section className="max-w-4xl mx-auto px-6 py-14">
        <div
          className="relative rounded-3xl p-[3px] overflow-hidden shadow-lg"
          style={{ background: WALLET_LINEAR, backgroundSize: '200% 100%', animation: 'sf-grad 7s ease-in-out infinite' }}
        >
          <div className="relative bg-[#37352F] rounded-[calc(1.5rem-3px)] px-8 py-14 text-center text-white">
            <h2 className="text-3xl md:text-4xl font-serif-display font-medium mb-4 leading-tight">We handle the tech. You handle the counter.</h2>
            <p className="text-white/70 mb-8 max-w-lg mx-auto">Premium customer retention, minimal monthly cost. No setup fees, no app development.</p>
            <StartButton label="Start your free trial" className="px-6 py-3 !bg-white !text-[#37352F] hover:!bg-gray-100" />
          </div>
        </div>
        <style>{`@keyframes sf-grad{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}`}</style>
      </section>
    </MarketingLayout>
  );
}
