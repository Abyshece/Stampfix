import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Loader2, Play, Store, Volume2, VolumeX, X } from 'lucide-react';
import type { PageStory } from '../lib/businessPage';

// Stories on the Business page, like Instagram: round bubbles at the top that
// scroll sideways, and a full-screen viewer. Videos play muted (phones only
// autoplay muted videos) with a sound button when the video has sound; photos
// show for 5 seconds. Tap the right side for the next story, the left side for
// the one before, hold to pause, swipe down (or Esc, or Back) to close.

const PHOTO_MS = 5000;
const FAILED_MS = 3000;

/** Stories this phone has already watched, per shop (only to grey the ring). */
export function readSeen(campaignId: string): Set<string> {
  try {
    const raw = localStorage.getItem(`sf_story_seen_${campaignId}`);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}
export function writeSeen(campaignId: string, seen: Set<string>) {
  try {
    localStorage.setItem(`sf_story_seen_${campaignId}`, JSON.stringify([...seen].slice(-50)));
  } catch { /* private mode: rings just stay coloured */ }
}

interface RailProps {
  stories: PageStory[];
  seen: Set<string>;
  ring: string;
  seenRing: string;
  bg: string;
  text: string;
  onOpen: (index: number) => void;
  /** Line the bubbles up on the left (the page's layout) instead of centring them. */
  start?: boolean;
}

/** The row of round bubbles. Centred when they fit, scrolls sideways when they don't. */
export function StoryRail({ stories, seen, ring, seenRing, bg, text, onOpen, start = false }: RailProps) {
  const { t } = useTranslation();
  const anyLabel = stories.some((s) => s.label);
  return (
    <div className="-mx-5 px-5 overflow-x-auto no-scrollbar" data-story-rail aria-label={t('cust.page.stories', { defaultValue: 'Stories' })}>
      <ul className={`flex gap-3 w-max py-1 ${start ? '' : 'mx-auto'}`}>
        {stories.map((s, i) => {
          const isSeen = seen.has(s.id);
          return (
            <li key={s.id} className="shrink-0">
              <button type="button" onClick={() => onOpen(i)} data-story-bubble={s.id} data-seen={isSeen ? '1' : '0'}
                aria-label={s.label ?? t('cust.page.storyN', { n: i + 1, defaultValue: 'Story {{n}}' })}
                className="flex flex-col items-center gap-1 w-[72px] focus:outline-none group">
                <span className="block rounded-full p-[2.5px] transition group-focus-visible:ring-2 group-focus-visible:ring-offset-2"
                  style={{ background: isSeen ? seenRing : ring }}>
                  <span className="block rounded-full p-[2.5px]" style={{ background: bg }}>
                    <img src={s.posterUrl} alt="" loading="lazy" draggable={false}
                      className="block w-[60px] h-[60px] rounded-full object-cover bg-black/10" />
                  </span>
                </span>
                {anyLabel && (
                  <span className="block w-full truncate text-center text-[11px] leading-tight" style={{ color: text }}>{s.label ?? ' '}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface ViewerProps {
  stories: PageStory[];
  start: number;
  title: string;
  logo: ReactNode;
  onClose: () => void;
  onSeen: (id: string) => void;
}

function playSafe(v: HTMLVideoElement, on: { mutedFallback: () => void; blocked: () => void }) {
  const p = v.play();
  if (p && typeof p.catch === 'function') {
    p.catch((e: unknown) => {
      if (!(e instanceof DOMException) || e.name !== 'NotAllowedError') return; // e.g. moved on mid-load
      if (!v.muted) {
        // A phone that won't autoplay with sound: play muted instead.
        v.muted = true;
        on.mutedFallback();
        v.play().catch(() => on.blocked());
      } else {
        // No autoplay at all (e.g. iPhone battery saver): a tap starts it.
        on.blocked();
      }
    });
  }
}

/** The full-screen viewer. */
export function StoryViewer({ stories, start, title, logo, onClose, onSeen }: ViewerProps) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(() => Math.min(Math.max(0, start), stories.length - 1));
  const [muted, setMuted] = useState(true);
  const [held, setHeld] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<Record<string, true>>({});
  const [blocked, setBlocked] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const elapsed = useRef(0);
  const closed = useRef(false);
  const press = useRef<{ x: number; y: number; timer: number; held: boolean } | null>(null);

  const story = stories[index];
  const isFailed = !!failed[story.id];
  const asPhoto = story.kind === 'photo' || isFailed;
  const paused = held || tabHidden;

  // Latest values for the handlers that live outside React's render.
  const latest = useRef({ index, count: stories.length, onClose, onSeen });
  latest.current = { index, count: stories.length, onClose, onSeen };

  const close = () => {
    if (closed.current) return;
    closed.current = true;
    latest.current.onClose();
  };
  const go = (d: 1 | -1) => {
    const { index: i, count } = latest.current;
    if (d === 1 && i + 1 >= count) { close(); return; }
    if (d === -1 && i === 0) {
      // The first story: start it again.
      elapsed.current = 0;
      const v = videoRef.current;
      if (v && v.getAttribute('src')) v.currentTime = 0;
      return;
    }
    setIndex(i + d);
  };
  const goRef = useRef(go);
  goRef.current = go;
  const playHandlers = { mutedFallback: () => setMuted(true), blocked: () => setBlocked(true) };

  // Lock the page behind, put focus in the viewer, give it back on close.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); goRef.current(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); goRef.current(-1); }
    };
    const onVis = () => setTabHidden(document.hidden);
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVis);
      document.body.style.overflow = overflow;
      try { before?.focus?.(); } catch { /* element gone */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new story: mark it seen, reset the bar, load the video (or stop it for a photo).
  useEffect(() => {
    latest.current.onSeen(story.id);
    elapsed.current = 0;
    setBlocked(false);
    if (barRef.current) barRef.current.style.width = '0%';
    const v = videoRef.current;
    if (story.kind === 'video' && !failed[story.id]) {
      setLoading(true);
      if (v) { v.src = story.mediaUrl; v.muted = muted; v.currentTime = 0; }
    } else {
      setLoading(story.kind === 'photo' && !failed[story.id]);
      if (v && v.getAttribute('src')) { v.pause(); v.removeAttribute('src'); v.load(); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Play or pause the video with the viewer.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || asPhoto || !v.getAttribute('src')) return;
    if (paused) v.pause();
    else if (v.paused && !v.ended) playSafe(v, playHandlers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, asPhoto, index]);

  useEffect(() => { if (videoRef.current) videoRef.current.muted = muted; }, [muted]);

  // The progress bar, and the timer for photos.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      let p: number;
      if (asPhoto) {
        if (!paused && !loading) elapsed.current += dt;
        p = elapsed.current / (isFailed ? FAILED_MS : PHOTO_MS);
        if (p >= 1) { goRef.current(1); return; }
      } else {
        const v = videoRef.current;
        const dur = v && Number.isFinite(v.duration) && v.duration > 0 ? v.duration : (story.durationMs ?? 10000) / 1000;
        p = v ? v.currentTime / dur : 0;
      }
      if (barRef.current) barRef.current.style.width = `${Math.min(1, Math.max(0, p)) * 100}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [index, asPhoto, isFailed, paused, loading, story.durationMs]);

  // Warm up the next story so it starts quickly.
  useEffect(() => {
    const next = stories[index + 1];
    if (!next) return;
    if (next.kind === 'photo') { const img = new Image(); img.src = next.mediaUrl; return; }
    const v = document.createElement('video');
    v.preload = 'auto'; v.muted = true; v.src = next.mediaUrl;
    return () => { v.removeAttribute('src'); v.load(); };
  }, [index, stories]);

  const markFailed = () => setFailed((f) => (f[story.id] ? f : { ...f, [story.id]: true }));

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const timer = window.setTimeout(() => { if (press.current) { press.current.held = true; setHeld(true); } }, 220);
    press.current = { x: e.clientX, y: e.clientY, timer, held: false };
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    window.clearTimeout(p.timer);
    if (p.held) setHeld(false);
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (dy > 80 && dy > Math.abs(dx)) { close(); return; }
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { go(dx < 0 ? 1 : -1); return; }
    if (p.held) return;
    if (blocked && videoRef.current && !asPhoto) {
      // This tap is what the phone was waiting for.
      setBlocked(false);
      playSafe(videoRef.current, playHandlers);
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    go(e.clientX - r.left < r.width * 0.3 ? -1 : 1);
  };
  const onPointerCancel = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
    setHeld(false);
  };

  const toggleSound = () => {
    const v = videoRef.current;
    const next = !muted;
    setMuted(next);
    if (v) {
      v.muted = next;
      // Unmuting is a tap, so phones allow sound from here on.
      if (!next && v.paused && !paused) { setBlocked(false); playSafe(v, playHandlers); }
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center select-none" role="dialog" aria-modal="true"
      aria-label={t('cust.page.stories', { defaultValue: 'Stories' })} data-story-viewer data-story-index={index}
      style={{ WebkitTouchCallout: 'none' }}>
      <button type="button" onClick={() => go(-1)} aria-label={t('cust.page.prevStory', { defaultValue: 'Previous story' })}
        className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 text-white items-center justify-center">
        <ChevronLeft className="w-6 h-6" />
      </button>
      <button type="button" onClick={() => go(1)} aria-label={t('cust.page.nextStory', { defaultValue: 'Next story' })}
        className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 text-white items-center justify-center">
        <ChevronRight className="w-6 h-6" />
      </button>

      <div className="relative h-full overflow-hidden bg-black" style={{ width: 'min(100vw, calc(100vh * 9 / 16))' }}>
        {/* The story. */}
        <video ref={videoRef} playsInline muted={muted} preload="auto" poster={story.kind === 'video' ? story.posterUrl : undefined}
          className={`absolute inset-0 w-full h-full object-contain ${asPhoto ? 'invisible' : ''}`} data-story-video
          onPlaying={() => setLoading(false)} onLoadedData={() => setLoading(false)} onWaiting={() => setLoading(true)}
          onEnded={() => goRef.current(1)}
          onError={() => { const v = videoRef.current; if (v && v.getAttribute('src') && story.kind === 'video') { setLoading(false); markFailed(); } }} />
        {story.kind === 'photo' && !isFailed && (
          <img key={story.id} src={story.mediaUrl} alt={story.label ?? ''} draggable={false} data-story-photo
            className="absolute inset-0 w-full h-full object-contain"
            onLoad={() => setLoading(false)} onError={() => { setLoading(false); markFailed(); }} />
        )}
        {isFailed && (
          <div className="absolute inset-0 flex items-center justify-center p-8">
            <img src={story.posterUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40 blur-sm" />
            <p className="relative text-white/90 text-sm text-center" data-story-failed>{t('cust.page.storyFailed', { defaultValue: "This story can't be played right now." })}</p>
          </div>
        )}
        {blocked && !asPhoto && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" data-story-blocked>
            <span className="w-16 h-16 rounded-full bg-black/45 flex items-center justify-center"><Play className="w-8 h-8 text-white ml-1" /></span>
          </div>
        )}
        {loading && !isFailed && !blocked && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><Loader2 className="w-8 h-8 text-white/80 animate-spin" /></div>
        )}

        {/* Taps, holds and swipes. */}
        <div className="absolute inset-0" style={{ touchAction: 'none' }} data-story-tap
          onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} onPointerLeave={onPointerCancel}
          onContextMenu={(e) => e.preventDefault()} />

        {/* Top: one bar per story, the shop, sound and close. */}
        <div className="absolute inset-x-0 top-0 pt-2 px-2 pb-8 bg-gradient-to-b from-black/60 to-transparent pointer-events-none">
          <div className="flex gap-1" aria-hidden="true">
            {stories.map((s, i) => (
              <div key={s.id} className="h-[3px] flex-1 rounded-full bg-white/35 overflow-hidden">
                <div ref={i === index ? barRef : undefined} className="h-full bg-white rounded-full"
                  style={{ width: i < index ? '100%' : '0%' }} />
              </div>
            ))}
          </div>
          <div className="mt-2.5 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full overflow-hidden bg-white flex items-center justify-center shrink-0 text-base">{logo ?? <Store className="w-4 h-4 text-black/60" />}</div>
            <div className="min-w-0 flex-1 text-white leading-tight">
              <div className="text-sm font-semibold truncate">{title}</div>
              {story.label && <div className="text-xs text-white/75 truncate" data-story-label>{story.label}</div>}
            </div>
            {story.kind === 'video' && story.hasSound && !isFailed && (
              <button type="button" onClick={toggleSound} data-story-sound={muted ? 'off' : 'on'}
                aria-label={muted ? t('cust.page.soundOn', { defaultValue: 'Turn sound on' }) : t('cust.page.soundOff', { defaultValue: 'Turn sound off' })}
                className="pointer-events-auto w-10 h-10 rounded-full flex items-center justify-center text-white hover:bg-white/15">
                {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
            )}
            <button ref={closeRef} type="button" onClick={close} data-story-close
              aria-label={t('cust.page.closeStory', { defaultValue: 'Close' })}
              className="pointer-events-auto w-10 h-10 rounded-full flex items-center justify-center text-white hover:bg-white/15">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
