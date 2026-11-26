import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Pause, Play, RotateCcw, Trophy, X } from 'lucide-react';

// Stamp Snake: a small game on the Business page for guests waiting for
// their order. Steer the snake to collect stamps; every 5 stamps fill a card
// for 5 bonus points. Swipe on the board or use the arrows (or the keyboard).
// It only loads when a guest opens it, and keeps the best score on this phone.

const N = 15;               // cells per side
const CARD = 5;             // stamps per card
const BEST_KEY = 'sf_snake_best';

type Dir = 'up' | 'down' | 'left' | 'right';
type Cell = { x: number; y: number };
type Phase = 'ready' | 'playing' | 'paused' | 'over';

const VEC: Record<Dir, Cell> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

function lum(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
}

function readBest(): number {
  try { return Math.max(0, parseInt(localStorage.getItem(BEST_KEY) ?? '0', 10) || 0); } catch { return 0; }
}
function writeBest(n: number) {
  try { localStorage.setItem(BEST_KEY, String(n)); } catch { /* private mode */ }
}

function freeCell(snake: Cell[]): Cell {
  const taken = new Set(snake.map((c) => c.y * N + c.x));
  const free: number[] = [];
  for (let i = 0; i < N * N; i++) if (!taken.has(i)) free.push(i);
  const pick = free[Math.floor(Math.random() * free.length)] ?? 0;
  return { x: pick % N, y: Math.floor(pick / N) };
}

function startState() {
  const mid = Math.floor(N / 2);
  const snake = [{ x: mid, y: mid }, { x: mid - 1, y: mid }, { x: mid - 2, y: mid }];
  return { snake, dir: 'right' as Dir, queue: [] as Dir[], food: freeCell(snake), stamps: 0, score: 0 };
}

export default function PageGame({ accent, title, onClose }: { accent: { bg: string; ink: string }; title: string; onClose: () => void }) {
  const { t } = useTranslation();
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const game = useRef(startState());
  const [phase, setPhase] = useState<Phase>('ready');
  const phaseRef = useRef<Phase>('ready');
  const [score, setScore] = useState(0);
  const [stamps, setStamps] = useState(0);
  const [best, setBest] = useState(readBest);
  const [newBest, setNewBest] = useState(false);
  const [flash, setFlash] = useState(false);
  const [size, setSize] = useState(300);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // The stamp colour: the shop's, unless it would vanish on the dark board.
  const food = lum(accent.bg) < 70 ? '#F2B33D' : accent.bg;

  const setPhaseBoth = (p: Phase) => { phaseRef.current = p; setPhase(p); };

  const draw = useCallback(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const px = size * dpr;
    if (c.width !== px) { c.width = px; c.height = px; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cell = size / N;
    ctx.fillStyle = '#1F1D1B';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#242220';
    for (let y = 0; y < N; y++) for (let x = (y % 2); x < N; x += 2) ctx.fillRect(x * cell, y * cell, cell, cell);

    const g = game.current;
    // The stamp: a coloured disc with a ring, like on the card.
    const fx = g.food.x * cell + cell / 2, fy = g.food.y * cell + cell / 2;
    ctx.fillStyle = food;
    ctx.beginPath(); ctx.arc(fx, fy, cell * 0.42, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = Math.max(1.5, cell * 0.08);
    ctx.beginPath(); ctx.arc(fx, fy, cell * 0.24, 0, Math.PI * 2); ctx.stroke();

    // The snake, head last so it sits on top.
    for (let i = g.snake.length - 1; i >= 0; i--) {
      const s = g.snake[i];
      const inset = i === 0 ? cell * 0.06 : cell * 0.12;
      ctx.fillStyle = i === 0 ? '#FFFFFF' : `rgba(244,241,236,${Math.max(0.55, 1 - i * 0.025)})`;
      const r = cell * 0.28;
      const x0 = s.x * cell + inset, y0 = s.y * cell + inset, w = cell - inset * 2;
      ctx.beginPath();
      ctx.moveTo(x0 + r, y0); ctx.arcTo(x0 + w, y0, x0 + w, y0 + w, r); ctx.arcTo(x0 + w, y0 + w, x0, y0 + w, r);
      ctx.arcTo(x0, y0 + w, x0, y0, r); ctx.arcTo(x0, y0, x0 + w, y0, r); ctx.closePath(); ctx.fill();
    }
    // Eyes, looking where it goes.
    const h = g.snake[0], v = VEC[g.dir];
    const cx = h.x * cell + cell / 2 + v.x * cell * 0.12, cy = h.y * cell + cell / 2 + v.y * cell * 0.12;
    const ox = v.y !== 0 ? cell * 0.17 : 0, oy = v.x !== 0 ? cell * 0.17 : 0;
    ctx.fillStyle = '#1F1D1B';
    for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + ox * sgn, cy + oy * sgn, cell * 0.07, 0, Math.PI * 2); ctx.fill(); }
  }, [size, food]);

  const turn = useCallback((d: Dir) => {
    // After a crash only "Play again" starts a new game (no accidental restarts).
    if (phaseRef.current === 'over') return;
    if (phaseRef.current !== 'playing') setPhaseBoth('playing');
    const g = game.current;
    const last = g.queue[g.queue.length - 1] ?? g.dir;
    if (d === last || d === OPPOSITE[last] || g.queue.length >= 2) return;
    g.queue.push(d);
  }, []);

  const restart = () => {
    game.current = startState();
    setScore(0); setStamps(0); setNewBest(false);
    setPhaseBoth('playing');
  };

  // One step of the game.
  const step = useCallback(() => {
    const g = game.current;
    const next = g.queue.shift();
    if (next) g.dir = next;
    const v = VEC[g.dir];
    const head = { x: g.snake[0].x + v.x, y: g.snake[0].y + v.y };
    const willGrow = head.x === g.food.x && head.y === g.food.y;
    const body = willGrow ? g.snake : g.snake.slice(0, -1);
    if (head.x < 0 || head.y < 0 || head.x >= N || head.y >= N || body.some((c) => c.x === head.x && c.y === head.y)) {
      setPhaseBoth('over');
      try { navigator.vibrate?.(60); } catch { /* not on every phone */ }
      if (g.score > readBest()) { writeBest(g.score); setBest(g.score); setNewBest(true); }
      return;
    }
    g.snake = [head, ...body];
    if (willGrow) {
      g.stamps += 1;
      g.score += 1;
      if (g.stamps % CARD === 0) {
        g.score += CARD;
        setFlash(true);
        window.setTimeout(() => setFlash(false), 1200);
      }
      g.food = freeCell(g.snake);
      setScore(g.score);
      setStamps(g.stamps);
      try { navigator.vibrate?.(8); } catch { /* fine */ }
    }
  }, []);

  // The loop: faster as you collect more.
  useEffect(() => {
    let raf = 0, last = performance.now(), acc = 0;
    const loop = (now: number) => {
      const dt = Math.min(200, now - last);
      last = now;
      if (phaseRef.current === 'playing') {
        acc += dt;
        const every = Math.max(70, 150 - game.current.stamps * 3);
        while (acc >= every && phaseRef.current === 'playing') { acc -= every; step(); }
      } else {
        acc = 0;
      }
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw, step]);

  // Board size: as big as fits.
  useEffect(() => {
    const fit = () => {
      const w = wrap.current?.clientWidth ?? 320;
      const h = window.innerHeight - 290;
      setSize(Math.max(210, Math.min(440, w, h)));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  // Keys, pausing when the phone locks, no page scrolling behind.
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const keys: Record<string, Dir> = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right',
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeRef.current(); return; }
      if (e.key === ' ') {
        e.preventDefault();
        if (phaseRef.current === 'playing') setPhaseBoth('paused');
        else if (phaseRef.current === 'paused' || phaseRef.current === 'ready') setPhaseBoth('playing');
        return;
      }
      const d = keys[e.key] ?? keys[e.key.toLowerCase()];
      if (d) { e.preventDefault(); turn(d); }
    };
    const onVis = () => { if (document.hidden && phaseRef.current === 'playing') setPhaseBoth('paused'); };
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVis);
      document.body.style.overflow = overflow;
    };
  }, [turn]);

  // Swipes on the board.
  const touch = useRef<{ x: number; y: number; used: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => { touch.current = { x: e.clientX, y: e.clientY, used: false }; };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = touch.current;
    if (!p || p.used) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
    p.used = true;
    turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  };
  const onPointerUp = () => {
    const p = touch.current;
    touch.current = null;
    // A plain tap starts or resumes.
    if (p && !p.used && phaseRef.current !== 'playing') {
      if (phaseRef.current === 'over') restart(); else setPhaseBoth('playing');
    }
  };

  const pad = (d: Dir, Icon: typeof ArrowUp, label: string) => (
    <button type="button" aria-label={label} data-game-pad={d}
      onPointerDown={(e) => { e.preventDefault(); turn(d); }}
      onClick={(e) => { if (e.detail === 0) turn(d); /* keyboard press */ }}
      className="w-16 h-14 rounded-2xl bg-white/10 active:bg-white/25 text-white flex items-center justify-center select-none"
      style={{ touchAction: 'manipulation' }}>
      <Icon className="w-6 h-6" />
    </button>
  );

  return (
    <div className="fixed inset-0 z-[100] bg-[#141312] text-white flex flex-col items-center select-none overflow-y-auto" role="dialog" aria-modal="true"
      aria-label={t('cust.game.title', { defaultValue: 'Stamp Snake' })} data-game data-game-phase={phase}
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
      <div className="w-full max-w-md px-4 flex flex-col items-center" ref={wrap}>
        <div className="w-full flex items-center gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <div className="text-lg font-semibold leading-tight">{t('cust.game.title', { defaultValue: 'Stamp Snake' })}</div>
            <div className="text-xs text-white/55 truncate">{title}</div>
          </div>
          {phase === 'playing' && (
            <button type="button" onClick={() => setPhaseBoth('paused')} aria-label={t('cust.game.pause', { defaultValue: 'Pause' })}
              className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10"><Pause className="w-5 h-5" /></button>
          )}
          <button type="button" onClick={onClose} aria-label={t('cust.page.closeStory', { defaultValue: 'Close' })} data-game-close
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10"><X className="w-6 h-6" /></button>
        </div>

        <div className="w-full flex items-end justify-between mb-2.5" style={{ maxWidth: size }}>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-white/50">{t('cust.game.score', { defaultValue: 'Score' })}</div>
            <div className="text-2xl font-bold tabular-nums leading-none" data-game-score>{score}</div>
          </div>
          <div className="flex gap-1.5 pb-1" aria-hidden="true">
            {Array.from({ length: CARD }, (_, i) => (
              <span key={i} className="w-4 h-4 rounded-full border-2 transition"
                style={{ borderColor: food, background: i < stamps % CARD || (flash && stamps > 0 && stamps % CARD === 0) ? food : 'transparent' }} />
            ))}
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wider text-white/50">{t('cust.game.best', { defaultValue: 'Best' })}</div>
            <div className="text-2xl font-bold tabular-nums leading-none text-white/80" data-game-best>{best}</div>
          </div>
        </div>

        <div className="relative rounded-2xl overflow-hidden shadow-2xl ring-2 ring-white/15" style={{ width: size, height: size, touchAction: 'none' }}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { touch.current = null; }}>
          <canvas ref={canvas} style={{ width: size, height: size, display: 'block' }} data-game-board />
          {flash && (
            <div className="absolute inset-x-0 top-3 flex justify-center pointer-events-none">
              <span className="rounded-full px-3 py-1 text-sm font-bold shadow-lg" style={{ background: food, color: lum(food) > 150 ? '#1A1A1A' : '#FFFFFF' }}>
                {t('cust.game.cardFull', { bonus: CARD, defaultValue: 'Card full! +{{bonus}}' })}
              </span>
            </div>
          )}
          {phase !== 'playing' && (
            <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center text-center px-6 gap-3">
              {phase === 'over' ? (
                <>
                  <div className="text-2xl font-bold" data-game-over>{t('cust.game.over', { defaultValue: 'Game over' })}</div>
                  {newBest
                    ? <div className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: food }}><Trophy className="w-4 h-4" />{t('cust.game.newBest', { defaultValue: 'New best!' })}</div>
                    : <div className="text-sm text-white/70">{t('cust.game.yourScore', { score, defaultValue: 'You scored {{score}}.' })}</div>}
                  <button type="button" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()} onClick={restart} data-game-again
                    className="mt-1 inline-flex items-center gap-2 rounded-xl px-5 py-3 font-semibold" style={{ background: food, color: lum(food) > 150 ? '#1A1A1A' : '#FFFFFF' }}>
                    <RotateCcw className="w-4 h-4" />{t('cust.game.again', { defaultValue: 'Play again' })}
                  </button>
                </>
              ) : (
                <>
                  <div className="text-xl font-bold">{phase === 'paused' ? t('cust.game.paused', { defaultValue: 'Paused' }) : t('cust.game.title', { defaultValue: 'Stamp Snake' })}</div>
                  {phase === 'ready' && <p className="text-sm text-white/75 max-w-[240px]">{t('cust.game.howTo', { bonus: CARD, defaultValue: 'Collect stamps. Every 5 fill a card for {{bonus}} bonus points. Don’t hit the wall or yourself.' })}</p>}
                  <button type="button" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()} onClick={() => setPhaseBoth('playing')} data-game-start
                    className="mt-1 inline-flex items-center gap-2 rounded-xl px-5 py-3 font-semibold" style={{ background: food, color: lum(food) > 150 ? '#1A1A1A' : '#FFFFFF' }}>
                    <Play className="w-4 h-4" />{phase === 'paused' ? t('cust.game.resume', { defaultValue: 'Resume' }) : t('cust.game.start', { defaultValue: 'Start' })}
                  </button>
                  {phase === 'ready' && <p className="text-xs text-white/50">{t('cust.game.controls', { defaultValue: 'Swipe on the board or use the arrows.' })}</p>}
                </>
              )}
            </div>
          )}
        </div>

        {/* Arrows for thumbs (and mouse). */}
        <div className="mt-4 grid grid-cols-3 gap-2" style={{ gridTemplateAreas: '". u ." "l d r"' }}>
          <div style={{ gridArea: 'u' }}>{pad('up', ArrowUp, t('cust.game.up', { defaultValue: 'Up' }))}</div>
          <div style={{ gridArea: 'l' }}>{pad('left', ArrowLeft, t('cust.game.left', { defaultValue: 'Left' }))}</div>
          <div style={{ gridArea: 'd' }}>{pad('down', ArrowDown, t('cust.game.down', { defaultValue: 'Down' }))}</div>
          <div style={{ gridArea: 'r' }}>{pad('right', ArrowRight, t('cust.game.right', { defaultValue: 'Right' }))}</div>
        </div>
      </div>
    </div>
  );
}
