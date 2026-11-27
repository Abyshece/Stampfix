import { useEffect, useMemo, useState } from 'react';

/**
 * Seasonal Christmas decorations for the landing page.
 * Active from 15 Nov to 6 Jan (local time) so it switches itself off after
 * the holidays. `?xmas=1` / `?xmas=0` force it on/off for previews.
 */
export function isChristmasSeason(now = new Date()): boolean {
  if (typeof window !== 'undefined') {
    const q = new URLSearchParams(window.location.search).get('xmas');
    if (q === '1') return true;
    if (q === '0') return false;
  }
  const m = now.getMonth(); // 0 = Jan
  const d = now.getDate();
  return (m === 10 && d >= 15) || m === 11 || (m === 0 && d <= 6);
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduced;
}

const XMAS_CSS = `
@keyframes xmas-fall { 0% { transform: translate3d(0,-10vh,0); } 100% { transform: translate3d(0,110vh,0); } }
@keyframes xmas-sway { 0%,100% { transform: translateX(0) rotate(0deg); } 50% { transform: translateX(var(--sway)) rotate(180deg); } }
@keyframes xmas-twinkle { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
@keyframes xmas-bob { 0%,100% { transform: translateY(0) rotate(var(--r,0deg)); } 50% { transform: translateY(-6px) rotate(var(--r,0deg)); } }
`;

/** Falling snow over the whole page. Purely decorative, never blocks clicks. */
export function Snowfall() {
  const reduced = usePrefersReducedMotion();
  const flakes = useMemo(() => {
    const count = typeof window !== 'undefined' && window.innerWidth < 640 ? 28 : 60;
    return Array.from({ length: count }, (_, i) => {
      const size = 6 + Math.random() * 14;
      return {
        id: i,
        left: Math.random() * 100,
        size,
        fall: 9 + Math.random() * 12,
        delay: -Math.random() * 20,
        sway: (Math.random() < 0.5 ? -1 : 1) * (15 + Math.random() * 35),
        swayDur: 3 + Math.random() * 4,
        glyph: size > 13 ? '❄' : '●',
        opacity: 0.55 + Math.random() * 0.45,
      };
    });
  }, []);

  if (reduced) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      <style>{XMAS_CSS}</style>
      {flakes.map((f) => (
        <span
          key={f.id}
          className="absolute top-0 block"
          style={{
            left: `${f.left}%`,
            animation: `xmas-fall ${f.fall}s linear ${f.delay}s infinite`,
            willChange: 'transform',
          }}
        >
          <span
            className="block select-none leading-none"
            style={{
              ['--sway' as string]: `${f.sway}px`,
              animation: `xmas-sway ${f.swayDur}s ease-in-out infinite`,
              fontSize: f.glyph === '❄' ? f.size : f.size * 0.45,
              color: f.glyph === '❄' ? '#A9C8E8' : '#FFFFFF',
              opacity: f.opacity,
              // White dots need an outline to be visible on the white page.
              textShadow: '0 0 2px rgba(120,150,190,.55), 0 1px 3px rgba(80,110,150,.35)',
            }}
          >
            {f.glyph}
          </span>
        </span>
      ))}
    </div>
  );
}

/** Small Santa hat that sits on the top-left corner of the nav logo. */
export function SantaHat({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 56" aria-hidden="true" className={`pointer-events-none ${className}`}>
      <path d="M8 44 C14 22 28 6 46 10 C52 12 56 20 58 30 L50 30 C48 24 44 20 38 22 C30 26 26 34 24 44 Z" fill="#D62828" />
      <path d="M46 10 C52 12 56 20 58 30" fill="none" stroke="#A4161A" strokeWidth="2" />
      <circle cx="56" cy="33" r="6" fill="#FFFFFF" stroke="#E5E7EB" />
      <rect x="4" y="40" width="40" height="12" rx="6" fill="#FFFFFF" stroke="#E5E7EB" />
    </svg>
  );
}

function Gift({ box, ribbon, className = '', style }: { box: string; ribbon: string; className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className} style={style}>
      <path d="M32 16 C24 4 12 8 18 16 Z" fill={ribbon} />
      <path d="M32 16 C40 4 52 8 46 16 Z" fill={ribbon} />
      <rect x="6" y="16" width="52" height="12" rx="2" fill={box} />
      <rect x="10" y="28" width="44" height="32" rx="2" fill={box} />
      <rect x="10" y="28" width="44" height="4" fill="rgba(0,0,0,.12)" />
      <rect x="28" y="16" width="8" height="44" fill={ribbon} />
    </svg>
  );
}

function CandyCane({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 40 90" aria-hidden="true" className={className} style={style}>
      <path d="M28 86 L28 22 A10 10 0 0 0 8 22" fill="none" stroke="#FFFFFF" strokeWidth="9" strokeLinecap="round" />
      <path d="M28 86 L28 22 A10 10 0 0 0 8 22" fill="none" stroke="#D62828" strokeWidth="9" strokeLinecap="round" strokeDasharray="7 7" />
      <path d="M28 86 L28 22 A10 10 0 0 0 8 22" fill="none" stroke="rgba(0,0,0,.08)" strokeWidth="9" strokeLinecap="round" />
    </svg>
  );
}

/** Twinkling string of lights across the top of the hero. */
export function StringLights() {
  const colors = ['#D62828', '#F7CE46', '#2A9D8F', '#1132F5', '#EA33B6'];
  const bulbs = Array.from({ length: 24 }, (_, i) => i);
  return (
    <div aria-hidden="true" className="pointer-events-none relative h-8 -mt-1 mb-2 overflow-hidden">
      <style>{XMAS_CSS}</style>
      <svg viewBox="0 0 1200 40" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
        <path d="M0 6 Q 50 26 100 6 T 200 6 T 300 6 T 400 6 T 500 6 T 600 6 T 700 6 T 800 6 T 900 6 T 1000 6 T 1100 6 T 1200 6" fill="none" stroke="#2F4F3A" strokeWidth="2" />
      </svg>
      <div className="absolute inset-0 flex justify-between px-[2%]">
        {bulbs.map((i) => (
          <span
            key={i}
            className="block w-2.5 h-3.5 rounded-full"
            style={{
              marginTop: i % 2 ? 16 : 10,
              background: colors[i % colors.length],
              boxShadow: `0 0 8px ${colors[i % colors.length]}`,
              animation: `xmas-twinkle ${1.4 + (i % 5) * 0.3}s ease-in-out ${(i % 7) * 0.2}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** Gifts, candy canes and a snow cap placed around the hero image. */
export function HeroChristmasProps() {
  return (
    <>
      <style>{XMAS_CSS}</style>
      {/* snow cap on top of the hero photo */}
      <div aria-hidden="true" className="pointer-events-none absolute top-0 left-0 w-full h-9 z-10 overflow-hidden rounded-t-3xl">
        <svg viewBox="0 0 300 40" preserveAspectRatio="none" className="w-full h-full drop-shadow-sm">
          <path d="M0 0 H300 V14 C 290 22, 282 30, 272 18 C 262 8, 250 26, 236 20 C 222 14, 214 34, 198 22 C 186 12, 170 28, 156 18 C 142 8, 130 32, 114 22 C 100 12, 88 26, 74 18 C 60 10, 50 30, 36 20 C 24 12, 12 26, 0 16 Z" fill="#FFFFFF" />
        </svg>
      </div>
      <CandyCane className="pointer-events-none absolute -bottom-4 -left-6 md:-left-10 w-7 md:w-9 z-10" style={{ ['--r' as string]: '-14deg', animation: 'xmas-bob 4s ease-in-out infinite' }} />
      <Gift box="#D62828" ribbon="#F7CE46" className="pointer-events-none absolute -bottom-6 left-4 md:-left-2 w-12 md:w-16 z-10 drop-shadow" style={{ ['--r' as string]: '-6deg', animation: 'xmas-bob 5s ease-in-out .4s infinite' }} />
      <Gift box="#2A9D8F" ribbon="#D62828" className="pointer-events-none absolute -bottom-5 right-6 md:right-2 w-10 md:w-14 z-10 drop-shadow" style={{ ['--r' as string]: '5deg', animation: 'xmas-bob 4.6s ease-in-out .9s infinite' }} />
      <Gift box="#1132F5" ribbon="#FFFFFF" className="pointer-events-none absolute -bottom-3 -right-4 md:-right-8 w-8 md:w-11 z-10 drop-shadow" style={{ ['--r' as string]: '10deg', animation: 'xmas-bob 5.4s ease-in-out .2s infinite' }} />
      <CandyCane className="pointer-events-none absolute -top-6 -right-3 md:-right-7 w-6 md:w-8 z-10" style={{ ['--r' as string]: '18deg', animation: 'xmas-bob 4.4s ease-in-out .6s infinite' }} />
    </>
  );
}
