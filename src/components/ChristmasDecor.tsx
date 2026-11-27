import { useEffect, useRef, type CSSProperties } from 'react';

// Christmas on the landing page: falling snow, string lights under the
// navbar, a Santa hat on the logo, and gifts and candy canes around the hero.
// Everything is decoration only (aria-hidden, no clicks).
//
// On from 20 November to 6 January. ?xmas=1 / ?xmas=0 forces it on or off
// (for checking). With "reduce motion" set, the snow and twinkling stop.

export function christmasOn(now = new Date(), search = typeof location !== 'undefined' ? location.search : ''): boolean {
  const force = new URLSearchParams(search).get('xmas');
  if (force === '1') return true;
  if (force === '0') return false;
  const m = now.getMonth(), d = now.getDate();
  return (m === 10 && d >= 20) || m === 11 || (m === 0 && d <= 6);
}

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Snow over the whole page. A canvas that ignores clicks. */
export function Snowfall() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx || reducedMotion()) return;
    type Flake = { x: number; y: number; r: number; vy: number; sway: number; phase: number; a: number; star: boolean; rot: number };
    let w = 0, h = 0, flakes: Flake[] = [], raf = 0, last = performance.now();
    const make = (top: boolean): Flake => ({
      x: Math.random() * w, y: top ? -10 : Math.random() * h,
      r: 1.2 + Math.random() * 2.8, vy: 18 + Math.random() * 42, sway: 8 + Math.random() * 22,
      phase: Math.random() * Math.PI * 2, a: 0.55 + Math.random() * 0.4,
      star: Math.random() < 0.18, rot: Math.random() * Math.PI,
    });
    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth; h = window.innerHeight;
      c.width = w * dpr; c.height = h * dpr; c.style.width = `${w}px`; c.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(140, Math.max(45, w / 10)));
      flakes = Array.from({ length: n }, () => make(false));
    };
    const frame = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      ctx.clearRect(0, 0, w, h);
      for (const f of flakes) {
        f.y += f.vy * dt; f.phase += dt * 1.2;
        const x = f.x + Math.sin(f.phase) * f.sway;
        if (f.y > h + 10) Object.assign(f, make(true));
        // Pale icy blue, so the snow shows on the white page and on dark sections.
        if (f.star) {
          // A six-armed snowflake.
          const R = f.r * 2.4; f.rot += dt * 0.4;
          ctx.save(); ctx.translate(x, f.y); ctx.rotate(f.rot);
          ctx.strokeStyle = `rgba(150, 180, 218, ${f.a})`; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
          ctx.beginPath();
          for (let k = 0; k < 6; k++) {
            ctx.rotate(Math.PI / 3);
            ctx.moveTo(0, 0); ctx.lineTo(0, -R);
            ctx.moveTo(0, -R * 0.55); ctx.lineTo(R * 0.28, -R * 0.78);
            ctx.moveTo(0, -R * 0.55); ctx.lineTo(-R * 0.28, -R * 0.78);
          }
          ctx.stroke(); ctx.restore();
        } else {
          ctx.beginPath(); ctx.arc(x, f.y, f.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(185, 205, 232, ${f.a})`; ctx.fill();
        }
      }
      raf = requestAnimationFrame(frame);
    };
    size();
    raf = requestAnimationFrame(frame);
    window.addEventListener('resize', size);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', size); };
  }, []);
  return <canvas ref={ref} aria-hidden data-snow className="pointer-events-none fixed inset-0 z-[60]" />;
}

/** String lights hanging under the navbar. */
export function StringLights() {
  const colors = ['#E53935', '#FBC02D', '#43A047', '#1E88E5'];
  const n = 28;
  return (
    <div aria-hidden data-xmas-lights className="pointer-events-none absolute left-0 right-0 top-full h-5 overflow-hidden">
      <style>{`@keyframes xmas-twinkle{0%,100%{opacity:1}50%{opacity:.35}}@media (prefers-reduced-motion: reduce){[data-xmas-lights] circle{animation:none!important}}`}</style>
      <svg viewBox={`0 0 ${n * 40} 20`} preserveAspectRatio="none" className="w-full h-full">
        <path d={`M0 2 ${Array.from({ length: n }, (_, i) => `Q ${i * 40 + 20} 12 ${i * 40 + 40} 2`).join(' ')}`}
          fill="none" stroke="#2E4A2E" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="absolute inset-0 flex justify-around">
        {Array.from({ length: n }, (_, i) => (
          <svg key={i} viewBox="0 0 10 14" className="w-2.5 h-3.5 mt-[6px]">
            <rect x="3" y="0" width="4" height="3" rx="0.8" fill="#4B5D4B" />
            <circle cx="5" cy="8" r="4.2" fill={colors[i % colors.length]}
              style={{ animation: `xmas-twinkle ${1.6 + (i % 5) * 0.35}s ease-in-out infinite`, animationDelay: `${(i * 0.37) % 2}s` }} />
          </svg>
        ))}
      </div>
    </div>
  );
}

export function SantaHat({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 64 56" aria-hidden className={className} style={style}>
      <path d="M8 42 C 12 20, 28 6, 44 8 C 52 9, 58 16, 56 26 C 52 20, 46 18, 42 22 C 46 28, 50 34, 52 42 Z" fill="#D62828" />
      <path d="M22 18 C 30 10, 40 8, 48 11" fill="none" stroke="#A4161A" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      <rect x="4" y="38" width="52" height="13" rx="6.5" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
      <circle cx="56" cy="27" r="7" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1" />
    </svg>
  );
}

export function CandyCane({ className, style }: { className?: string; style?: CSSProperties }) {
  const d = 'M14 92 L14 26 A 13 13 0 0 1 40 26 L40 34';
  return (
    <svg viewBox="0 0 54 100" aria-hidden className={className} style={style}>
      <path d={d} fill="none" stroke="#E5E7EB" strokeWidth="12" strokeLinecap="round" />
      <path d={d} fill="none" stroke="#FFFFFF" strokeWidth="10" strokeLinecap="round" />
      <path d={d} fill="none" stroke="#D62828" strokeWidth="10" strokeDasharray="7 7" />
    </svg>
  );
}

/** A gift in red wrapping paper. */
export function Gift({ className, style, ribbon = '#F5C542', dots = false }: { className?: string; style?: CSSProperties; ribbon?: string; dots?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={className} style={style}>
      <rect x="6" y="24" width="52" height="36" rx="3" fill="#D62828" />
      {dots && [[14, 34], [26, 46], [44, 34], [50, 50], [16, 52], [38, 54]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2" fill="#FFFFFF" opacity="0.85" />)}
      <rect x="2" y="16" width="60" height="11" rx="2.5" fill="#B71C1C" />
      <rect x="28" y="16" width="8" height="44" fill={ribbon} />
      <path d="M32 16 C 22 4, 10 8, 16 15 C 19 18, 27 17, 32 16 Z" fill={ribbon} />
      <path d="M32 16 C 42 4, 54 8, 48 15 C 45 18, 37 17, 32 16 Z" fill={ribbon} />
      <circle cx="32" cy="16" r="3.5" fill={ribbon} stroke="#00000022" strokeWidth="1" />
    </svg>
  );
}

/** A small pine sprig with berries. */
export function Holly({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 60 40" aria-hidden className={className} style={style}>
      <path d="M30 22 C 22 8, 6 10, 4 18 C 10 16, 12 22, 8 26 C 16 24, 22 28, 30 22 Z" fill="#2E7D32" />
      <path d="M30 22 C 38 8, 54 10, 56 18 C 50 16, 48 22, 52 26 C 44 24, 38 28, 30 22 Z" fill="#388E3C" />
      <circle cx="27" cy="24" r="4" fill="#C62828" /><circle cx="34" cy="25" r="4" fill="#D32F2F" /><circle cx="30.5" cy="18.5" r="4" fill="#E53935" />
    </svg>
  );
}

/** A snowy ground line with gifts and candy canes at both ends, under the hero. */
export function SnowGround() {
  return (
    <div aria-hidden data-xmas-ground className="pointer-events-none relative max-w-6xl mx-auto h-28 -mt-4">
      <svg viewBox="0 0 1200 40" preserveAspectRatio="none" className="absolute bottom-0 left-0 w-full h-8">
        <path d="M0 40 L0 22 C 80 8, 160 30, 260 18 C 360 6, 440 28, 560 16 C 680 4, 760 30, 880 18 C 980 8, 1080 28, 1200 14 L1200 40 Z" fill="#EEF4FA" />
        <path d="M0 22 C 80 8, 160 30, 260 18 C 360 6, 440 28, 560 16 C 680 4, 760 30, 880 18 C 980 8, 1080 28, 1200 14" fill="none" stroke="#DCE6F2" strokeWidth="2" />
      </svg>
      <div className="absolute left-4 md:left-8 bottom-3 flex items-end">
        <Gift className="w-14 h-14 md:w-20 md:h-20" />
        <Gift className="w-10 h-10 md:w-14 md:h-14 -ml-3" ribbon="#FFFFFF" dots />
        <CandyCane className="w-9 h-16 md:w-12 md:h-24 -ml-1 rotate-[8deg]" />
      </div>
      <div className="absolute right-4 md:right-8 bottom-3 flex items-end">
        <CandyCane className="w-9 h-16 md:w-12 md:h-24 -scale-x-100 -rotate-[8deg]" />
        <Gift className="w-11 h-11 md:w-14 md:h-14 -ml-1" ribbon="#FFFFFF" />
        <Gift className="w-14 h-14 md:w-20 md:h-20 -ml-3" dots />
      </div>
    </div>
  );
}
