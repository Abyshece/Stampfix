import { useEffect, useState } from 'react';
import { Smartphone, Zap, BarChart3, Palette, Layers, Globe, Wallet, Building2, Shield, Mail, MapPin } from 'lucide-react';
import { useInView } from './FeatureVisuals';

/**
 * Features section for the marketing site. Two-column on desktop:
 *   left  — checklist of capabilities
 *   right — iPhone mockup showing a sample loyalty card
 * Stacks vertically on mobile.
 *
 * The phone mockup is pure CSS — no asset files. Rounded rectangle
 * "device" with notch, containing an inline SVG loyalty card. Keeps
 * the bundle small and rendering crisp at any resolution.
 */
export function FeaturesSection() {
  // Each feature gets a colour chip drawn from the wallet-card palette, so the
  // list reads as colourful as the cards themselves.
  const features = [
    { icon: Zap,         c: '#75FBFD', fg: '#223355', text: 'No extra scanner hardware — your phone is the terminal' },
    { icon: Smartphone,  c: '#EA3323', fg: '#FFFFFF', text: 'Set up your first loyalty card in 2-3 minutes' },
    { icon: Globe,       c: '#510AF5', fg: '#FCFF54', text: 'No app for customers to download — works in any browser' },
    { icon: BarChart3,   c: '#F7CE46', fg: '#1A1A1A', text: 'Detailed dashboard with per-location and per-offer analytics' },
    { icon: Palette,     c: '#EA33B6', fg: '#FFFFFF', text: 'Brand it your way — choose colors, logo, and offer text' },
    { icon: Layers,      c: '#1132F5', fg: '#FFFFFF', text: 'Run multiple offers and migrate customers automatically' },
    { icon: Wallet,      c: '#F0A479', fg: '#1A1A1A', text: 'Works with Apple Wallet and Google Wallet — no app to download' },
    { icon: Building2,   c: '#75FBE2', fg: '#223355', text: 'Multi-location ready — one account, every branch tracked separately' },
    { icon: Mail,        c: '#ABC2C2', fg: '#223355', text: 'Automatic one-stamp-away emails bring customers back' },
    { icon: Shield,      c: '#37352F', fg: '#FFFFFF', text: 'GDPR-compliant by default with consent flow + data deletion' },
    { icon: MapPin,      c: '#EFECE2', fg: '#1A1A1A', text: 'Print-ready posters in 3 sizes (business card, A5, A4)' },
  ];
  const { ref: listRef, inView } = useInView<HTMLDivElement>(0.15);

  return (
    <section className="bg-white py-16 md:py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12 md:mb-16">
          <span className="text-xs uppercase tracking-widest font-bold text-gray-400">Features</span>
          <h2 className="text-3xl md:text-5xl font-serif-display font-semibold mt-2 mb-4">
            Everything a small business needs
          </h2>
          <p className="text-gray-500 max-w-xl mx-auto">
            Built for cafés, salons, and shops who want loyalty without the bloat — or the price tag — of enterprise platforms.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-12 md:gap-16 items-center">
          {/* Left — feature checklist */}
          <div ref={listRef} className="space-y-3">
            {features.map((f, i) => (
              <div
                key={i}
                className="flex items-start gap-3 transition-all duration-500 ease-out"
                style={{
                  opacity: inView ? 1 : 0,
                  transform: inView ? 'translateX(0)' : 'translateX(-16px)',
                  transitionDelay: `${i * 55}ms`,
                }}
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm"
                  style={{ background: f.c, color: f.fg }}
                >
                  <f.icon className="w-4 h-4" strokeWidth={2.5} />
                </div>
                <div className="flex-1 pt-0.5">
                  <span className="text-sm md:text-base text-[#37352F] leading-relaxed">{f.text}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Right — iPhone mockup with Lucky Café loyalty card */}
          <div className="flex justify-center md:justify-end">
            <PhoneMockup />
          </div>
        </div>
      </div>
    </section>
  );
}

/** Pure-CSS iPhone-style frame showing the current Apple Wallet pass design. */
function PhoneMockup() {
  return (
    <div className="relative" style={{ width: 280, maxWidth: '100%' }}>
      {/* Device body */}
      <div className="relative bg-[#1a1a1a] rounded-[40px] p-2.5 shadow-2xl" style={{ aspectRatio: '9 / 19' }}>
        {/* Screen — iOS-style light grey, like the Wallet pass view */}
        <div className="bg-[#ECECEE] rounded-[32px] w-full h-full overflow-hidden relative flex flex-col">
          {/* Notch */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-5 bg-[#1a1a1a] rounded-full z-10" />

          {/* Status bar */}
          <div className="pt-2.5 px-5 pb-2 flex justify-between items-center text-[10px] font-semibold text-[#37352F] z-0">
            <span>9:41</span>
            <span className="opacity-0">notch</span>
            <span>5G</span>
          </div>

          {/* Wallet chrome — close + more, like the real pass screen */}
          <div className="px-4 pt-1 pb-3 flex justify-between items-center">
            <div className="w-5 h-5 rounded-full bg-white shadow-sm" />
            <div className="w-8 h-5 rounded-full bg-white shadow-sm" />
          </div>

          {/* Card */}
          <div className="px-3 flex-1 flex items-start justify-center">
            <SampleLoyaltyCard />
          </div>

          <div className="h-3" />
        </div>
      </div>
    </div>
  );
}

const CARD_BG = '#EFB1AB';
const INK = '#2D3142';

/** Sample loyalty card — matches the live Apple/Google Wallet pass design. */
function SampleLoyaltyCard() {
  const total = 8;
  const { ref, inView } = useInView<HTMLDivElement>(0.35);
  const [filled, setFilled] = useState(0);
  useEffect(() => {
    if (!inView) return;
    let t: ReturnType<typeof setTimeout>;
    const step = (n: number) => {
      setFilled(n);
      t = setTimeout(() => step(n < total ? n + 1 : 0), n < total ? 520 : 2400);
    };
    t = setTimeout(() => step(1), 500);
    return () => clearTimeout(t);
  }, [inView]);
  return (
    <div ref={ref} className="w-full rounded-2xl shadow-md overflow-hidden" style={{ backgroundColor: CARD_BG }}>
      {/* Header: brand mark + business name | stamps left */}
      <div className="px-4 pt-4 pb-3 flex items-start justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <BrandMark />
          <span className="text-[13px] font-bold truncate" style={{ color: INK }}>Stampfix Cafe</span>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-[7px] font-bold uppercase tracking-widest" style={{ color: INK, opacity: 0.65 }}>Stamps left</div>
          <div className="text-lg font-bold leading-none mt-0.5" style={{ color: INK }}>{total - filled}</div>
        </div>
      </div>

      {/* Stamp grid — 4 cols x 2 rows = 8, shapes cycle square / circle / cross */}
      <div className="px-4 py-1 grid grid-cols-4 gap-y-3 place-items-center">
        {Array.from({ length: total }, (_, i) => (
          <StampShape key={i < filled ? `f${i}` : `e${i}`} kind={i % 3} filled={i < filled} />
        ))}
      </div>

      {/* Member / Reward */}
      <div className="px-4 pt-3 pb-1 grid grid-cols-2 gap-2">
        <div className="min-w-0">
          <div className="text-[7px] font-bold uppercase tracking-widest mb-0.5" style={{ color: INK, opacity: 0.65 }}>Member</div>
          <div className="text-[11px] font-semibold truncate" style={{ color: INK }}>Anna L.</div>
        </div>
        <div className="min-w-0">
          <div className="text-[7px] font-bold uppercase tracking-widest mb-0.5" style={{ color: INK, opacity: 0.65 }}>Reward</div>
          <div className="text-[11px] font-semibold leading-tight" style={{ color: INK }}>Buy 8, get 1 free</div>
        </div>
      </div>

      {/* QR + member id */}
      <div className="px-4 pt-3 pb-4 flex justify-center">
        <div className="bg-white rounded-lg p-2 shadow-sm">
          <div className="w-16 h-16 bg-[length:5px_5px] bg-[linear-gradient(45deg,#000_25%,transparent_25%,transparent_75%,#000_75%),linear-gradient(45deg,#000_25%,transparent_25%,transparent_75%,#000_75%)] bg-[position:0_0,2.5px_2.5px]" />
          <div className="text-[8px] font-mono text-center mt-1 text-[#37352F]">SF00042</div>
        </div>
      </div>
      <style>{`@keyframes sf-stamp{0%{transform:scale(1.7);opacity:0}60%{transform:scale(.9)}100%{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
}

/** The Stampfix brand mark: filled square, filled circle, cross. */
function BrandMark() {
  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      <span className="block w-3 h-3 rounded-[2px]" style={{ backgroundColor: INK }} />
      <span className="block w-3 h-3 rounded-full" style={{ backgroundColor: INK }} />
      <Cross className="w-3 h-3" />
    </div>
  );
}

/** One stamp slot. kind 0=square 1=circle 2=cross. Faded when not yet collected. */
function StampShape({ kind, filled }: { kind: number; filled: boolean }) {
  const op = filled ? 1 : 0.18;
  const anim = filled ? { animation: 'sf-stamp 0.45s cubic-bezier(0.34,1.56,0.64,1) both' } : undefined;
  if (kind === 0) return <span className="block w-7 h-7 rounded-[4px]" style={{ backgroundColor: INK, opacity: op, ...anim }} />;
  if (kind === 1) return <span className="block w-7 h-7 rounded-full" style={{ backgroundColor: INK, opacity: op, ...anim }} />;
  return <span className="inline-flex" style={anim}><Cross className="w-7 h-7" opacity={op} /></span>;
}

function Cross({ className, opacity = 1 }: { className?: string; opacity?: number }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={{ opacity }} fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round">
      <line x1="5" y1="5" x2="19" y2="19" />
      <line x1="19" y1="5" x2="5" y2="19" />
    </svg>
  );
}
