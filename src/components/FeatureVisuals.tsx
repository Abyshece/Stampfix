import { useEffect, useRef, useState } from 'react';
import { WalletPass, type CardSpec } from './HeroCardLoop';

/**
 * The two colourful landing feature visuals, replacing the old grey/black
 * mockups. Self-contained; drop <WalletFanVisual /> and <InsightsVisual /> into
 * the feature grid in LandingPage.
 */

/** Fire once when the element scrolls into view (drives the bar-grow animation). */
function useInView<T extends HTMLElement>(threshold = 0.3) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) { setInView(true); obs.disconnect(); }
      },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

// ─────────────────────────────────────────── Wallet card fan
const FAN: CardSpec[] = [
  { bg: '#510AF5', mark: '#FFFFFF', text: '#FCFF54', name: 'Pulp Juice',   reward: 'Free juice, every 6th', stamps: 6 },
  { bg: '#75FBFD', mark: '#1A1A1A', text: '#223355', name: 'Bloom Coffee', reward: 'Buy 6, get 1 free',      stamps: 2 },
  { bg: '#EA3323', mark: '#FFFFFF', text: '#FFFFFF', name: 'Fade Barbers', reward: '6 cuts, 7th on us',      stamps: 4 },
];

const GLOW =
  'radial-gradient(closest-side, #A5F3FC, transparent) 28% 58%/46% 62% no-repeat,' +
  'radial-gradient(closest-side, #DDD6FE, transparent) 50% 64%/46% 62% no-repeat,' +
  'radial-gradient(closest-side, #FBCFE8, transparent) 72% 58%/46% 62% no-repeat';

export function WalletFanVisual() {
  return (
    <div className="relative flex items-center justify-center h-[360px] sm:h-[440px] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 blur-3xl opacity-50" style={{ background: GLOW }} />

      {/* left card (behind) */}
      <div className="absolute left-1/2 top-1/2" style={{ transform: 'translate(-50%,-50%) translateX(-74px) rotate(-12deg) scale(0.72)', zIndex: 10 }}>
        <div style={{ animation: 'sf-float 7s ease-in-out infinite' }}><WalletPass spec={FAN[0]} /></div>
      </div>
      {/* right card (behind) */}
      <div className="absolute left-1/2 top-1/2" style={{ transform: 'translate(-50%,-50%) translateX(74px) rotate(12deg) scale(0.72)', zIndex: 20 }}>
        <div style={{ animation: 'sf-float 7s ease-in-out infinite 1.3s' }}><WalletPass spec={FAN[2]} /></div>
      </div>
      {/* centre card (front) */}
      <div className="absolute left-1/2 top-1/2 drop-shadow-2xl" style={{ transform: 'translate(-50%,-50%) scale(0.82)', zIndex: 30 }}>
        <div style={{ animation: 'sf-float 6s ease-in-out infinite 0.5s' }}><WalletPass spec={FAN[1]} /></div>
      </div>

      <style>{`@keyframes sf-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}`}</style>
    </div>
  );
}

// ─────────────────────────────────────────── Customer insights panel
const AVATARS = ['#75FBFD', '#EA3323', '#510AF5', '#F0A479', '#EA33B6', '#1132F5'];
const BARS = [
  { h: 34, c: '#1132F5' }, { h: 42, c: '#EA33B6' }, { h: 38, c: '#510AF5' }, { h: 55, c: '#EA3323' },
  { h: 50, c: '#F0A479' }, { h: 68, c: '#510AF5' }, { h: 74, c: '#75FBFD' }, { h: 88, c: '#EA33B6' },
];

export function InsightsVisual() {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className="relative bg-white border notion-border rounded-2xl p-6 shadow-sm">
      {/* header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="flex">
            {AVATARS.map((c, i) => (
              <div key={i} className="w-8 h-8 rounded-full border-2 border-white" style={{ background: c, marginLeft: i === 0 ? 0 : -10 }} />
            ))}
          </div>
          <div>
            <div className="text-lg font-bold text-[#37352F] leading-none">1,248</div>
            <div className="text-xs text-gray-500 mt-1">regulars this month</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-medium text-green-600">
          <span className="w-2 h-2 rounded-full bg-green-500" /> Live
        </div>
      </div>

      {/* chart */}
      <div className="text-xs font-bold text-gray-700 mb-3">Visit frequency</div>
      <div className="flex items-end justify-between gap-2 h-32 border-b notion-border">
        {BARS.map((b, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-md transition-[height] duration-700 ease-out"
            style={{ background: b.c, height: inView ? `${b.h}%` : '0%', transitionDelay: `${i * 60}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
