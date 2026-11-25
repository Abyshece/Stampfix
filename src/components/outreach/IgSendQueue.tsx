import { useEffect, useRef, useState } from 'react';
import { ListOrdered, Check, SkipForward, RotateCcw, Square, Play, BellRing } from 'lucide-react';
import { btnDark, btnLight, inputCls } from '../addonsUi';
import type { Lead, PhoneAnswer } from '../../lib/outreach';

const GAP_KEY = 'stampfix_ig_gap';
type Gap = { min: number; max: number };
type Phase = 'idle' | 'open' | 'wait' | 'done';

function loadGap(): Gap {
  try {
    const g = JSON.parse(localStorage.getItem(GAP_KEY) ?? '') as Gap;
    if (g && g.min >= 1 && g.max >= g.min && g.max <= 120) return g;
  } catch { /* defaults */ }
  return { min: 8, max: 12 };
}
const clampMin = (n: number) => Math.max(1, Math.min(120, Math.round(Number.isFinite(n) ? n : 1)));
const mmss = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/**
 * The Instagram send queue: opens each shop's chat in the Stampfix Phone with
 * the message typed in. You check it and press Enter there (it never sends by
 * itself), then "Sent, next". It waits a random gap you choose, pings you and
 * opens the next one, within the daily limit, and stops by itself.
 */
export function IgSendQueue({ leads, textOf, sentToday, limit, typesIn, onOpen, onMark, onCurrent }: {
  leads: Lead[];
  textOf: (l: Lead) => string;
  sentToday: number;
  limit: number;
  /** The installed phone types messages in (1.2+); else they're copied for pasting. */
  typesIn: boolean;
  onOpen: (l: Lead, text: string) => Promise<PhoneAnswer>;
  onMark: (l: Lead, status: 'sent' | 'skipped') => Promise<boolean>;
  onCurrent: (id: string | null) => void;
}) {
  const [gap, setGap] = useState<Gap>(loadGap);
  const [phase, setPhase] = useState<Phase>('idle');
  const [ended, setEnded] = useState<'all' | 'limit' | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [nextAt, setNextAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const base = useRef(0);     // sent in the last 24 hours when the queue started
  const sentHere = useRef(0); // sent through the queue since
  const audio = useRef<AudioContext | null>(null);
  const firing = useRef(false);

  const byId = new Map(leads.map((l) => [l.id, l]));
  const current = currentId ? byId.get(currentId) ?? null : null;
  const count = () => Math.max(sentToday, base.current + sentHere.current);
  const left = order.filter((id) => byId.has(id) && id !== currentId);
  const nextLead = (skip: string | null) => order.map((id) => byId.get(id)).find((l): l is Lead => !!l && l.id !== skip) ?? null;
  const upcoming = phase === 'wait' ? nextLead(null) : null;

  useEffect(() => { onCurrent(phase === 'open' ? currentId : null); }, [phase, currentId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onCurrent(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveGap = (g: Gap) => { setGap(g); try { localStorage.setItem(GAP_KEY, JSON.stringify(g)); } catch { /* this visit only */ } };

  const ping = (l: Lead) => {
    try {
      const ctx = audio.current;
      if (ctx) {
        void ctx.resume();
        [880, 1320].forEach((f, i) => {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.frequency.value = f; g.gain.value = 0.08;
          o.connect(g); g.connect(ctx.destination);
          o.start(ctx.currentTime + i * 0.16); o.stop(ctx.currentTime + i * 0.16 + 0.12);
        });
      }
    } catch { /* no sound */ }
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && (document.hidden || !document.hasFocus())) {
        const n = new Notification('Next Instagram message is ready', {
          body: `${l.business_name}: the chat is open in the Stampfix Phone${typesIn ? ' with the message typed in' : ''}. Check it and press Enter.`,
          tag: 'stampfix-ig-queue',
        });
        n.onclick = () => { window.focus(); n.close(); };
      }
    } catch { /* no notification */ }
    if (document.hidden) {
      const was = document.title;
      document.title = '● Next Instagram message ready';
      const back = () => { if (!document.hidden) { document.title = was; document.removeEventListener('visibilitychange', back); } };
      document.addEventListener('visibilitychange', back);
    }
  };

  const openNext = async (skip: string | null, byTimer: boolean) => {
    setNextAt(null);
    if (count() >= limit) { setPhase('done'); setEnded('limit'); setCurrentId(null); return; }
    const l = nextLead(skip);
    if (!l) { setPhase('done'); setEnded('all'); setCurrentId(null); return; }
    setCurrentId(l.id);
    setPhase('open');
    if (byTimer) ping(l);
    await onOpen(l, textOf(l));
  };

  const start = async () => {
    try { if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission(); } catch { /* fine */ }
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC && !audio.current) audio.current = new AC();
    } catch { /* no sound */ }
    const g = gap.max < gap.min ? { min: gap.max, max: gap.min } : gap;
    if (g !== gap) saveGap(g);
    base.current = sentToday;
    sentHere.current = 0;
    setEnded(null);
    setOrder(leads.map((l) => l.id));
    // order is set for the next render; open the first one now from the list itself.
    if (sentToday >= limit) { setPhase('done'); setEnded('limit'); return; }
    const first = leads[0];
    if (!first) { setPhase('done'); setEnded('all'); return; }
    setCurrentId(first.id);
    setPhase('open');
    await onOpen(first, textOf(first));
  };

  const sentNext = async () => {
    if (!current || busy) return;
    setBusy(true);
    const ok = await onMark(current, 'sent');
    setBusy(false);
    if (!ok) return;
    sentHere.current += 1;
    const more = order.some((id) => byId.has(id) && id !== current.id);
    if (!more) { setPhase('done'); setEnded('all'); setCurrentId(null); return; }
    if (count() >= limit) { setPhase('done'); setEnded('limit'); setCurrentId(null); return; }
    const g = gap.max < gap.min ? { min: gap.max, max: gap.min } : gap;
    const wait = (g.min + Math.random() * (g.max - g.min)) * 60_000;
    setCurrentId(null);
    setPhase('wait');
    setNow(Date.now());
    setNextAt(Date.now() + wait);
  };

  const skip = async () => {
    if (!current || busy) return;
    setBusy(true);
    const ok = await onMark(current, 'skipped');
    setBusy(false);
    if (ok) await openNext(current.id, false);
  };

  const stop = () => { setPhase('idle'); setEnded(null); setCurrentId(null); setNextAt(null); };

  // The wait: count down, then open the next chat by itself.
  useEffect(() => {
    if (phase !== 'wait' || nextAt === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [phase, nextAt]);
  useEffect(() => {
    if (phase === 'wait' && nextAt !== null && now >= nextAt && !firing.current) {
      firing.current = true;
      void openNext(null, true).finally(() => { firing.current = false; });
    }
  }, [phase, nextAt, now]); // eslint-disable-line react-hooks/exhaustive-deps

  const todayLine = <span className="text-xs text-gray-500" data-queue-today>Sent in the last 24 hours: <b className="text-[#37352F]">{count()}</b> of {limit}</span>;

  return (
    <section className="rounded-xl border notion-border bg-white p-4 sm:p-5" data-ig-queue={phase}>
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-pink-50 text-pink-700 flex items-center justify-center shrink-0"><ListOrdered className="w-5 h-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="font-semibold text-[#37352F]">Send queue</div>
            {todayLine}
          </div>

          {phase === 'idle' && (<>
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">
              Opens each shop’s chat in the phone {typesIn ? 'with the message already typed in' : 'with the message copied, ready to paste'}.
              You check it, press Enter, then click “Sent, next”. It then waits a few minutes, pings you and opens the next one.
              It never sends by itself.
            </p>
            {!typesIn && <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2 mt-2">Update the Stampfix Phone (see above) to have each message typed in for you. Until then, paste it with Cmd+V.</p>}
            <div className="mt-3 flex items-center gap-2 flex-wrap text-sm text-[#37352F]">
              <span>Wait between messages:</span>
              <input type="number" min={1} max={120} value={gap.min} aria-label="Shortest wait in minutes" data-gap-min
                onChange={(e) => saveGap({ ...gap, min: clampMin(Number(e.target.value)) })} className={`${inputCls} !w-16 text-center`} />
              <span>to</span>
              <input type="number" min={1} max={120} value={gap.max} aria-label="Longest wait in minutes" data-gap-max
                onChange={(e) => saveGap({ ...gap, max: clampMin(Number(e.target.value)) })} className={`${inputCls} !w-16 text-center`} />
              <span>minutes, a bit different each time.</span>
            </div>
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              <button type="button" className={btnDark} disabled={!leads.length || sentToday >= limit} onClick={() => void start()} data-queue-start>
                <Play className="w-4 h-4" />Start sending ({leads.length} {leads.length === 1 ? 'shop' : 'shops'})
              </button>
              {sentToday >= limit && <span className="text-xs text-amber-800">Today’s limit is reached. Continue tomorrow.</span>}
            </div>
          </>)}

          {phase === 'open' && current && (
            <div className="mt-2" data-queue-now>
              <div className="text-sm text-[#37352F]">
                Now: <b>{current.business_name}</b> <span className="text-pink-700">@{current.instagram}</span>
                <span className="text-gray-400"> · {left.length} more after this</span>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {typesIn ? 'The chat is open in the phone with the message typed in.' : 'The chat is open in the phone and the message is copied: paste it with Cmd+V.'} Check it, press Enter there, then:
              </p>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <button type="button" disabled={busy} onClick={() => void sentNext()} data-queue-sent
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
                  <Check className="w-4 h-4" />Sent, next
                </button>
                <button type="button" className={btnLight} disabled={busy} onClick={() => void skip()} data-queue-skip><SkipForward className="w-4 h-4" />Skip this shop</button>
                <button type="button" className={btnLight} onClick={() => void onOpen(current, textOf(current))} data-queue-reopen><RotateCcw className="w-4 h-4" />Open chat again</button>
                <button type="button" className={btnLight} onClick={stop} data-queue-stop><Square className="w-4 h-4" />Stop</button>
              </div>
            </div>
          )}

          {phase === 'open' && !current && (
            <div className="mt-2" data-queue-gone>
              <p className="text-sm text-gray-500">That shop was marked in the list below.</p>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <button type="button" className={btnDark} onClick={() => void openNext(currentId, false)} data-queue-next><Play className="w-4 h-4" />Open next</button>
                <button type="button" className={btnLight} onClick={stop} data-queue-stop><Square className="w-4 h-4" />Stop</button>
              </div>
            </div>
          )}

          {phase === 'wait' && nextAt !== null && (
            <div className="mt-2" data-queue-wait>
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="text-sm text-green-700 font-medium">Sent. Next: <b className="text-[#37352F]">{upcoming?.business_name ?? 'the next shop'}</b> in</span>
                <span className="text-2xl font-semibold tabular-nums text-[#37352F]" data-queue-countdown>{mmss(nextAt - now)}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5"><BellRing className="w-3.5 h-3.5" />You’ll hear a ping (and get a notification if you’re elsewhere) when it opens. Keep this tab open.</p>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <button type="button" className={btnDark} onClick={() => void openNext(null, false)} data-queue-now-btn><Play className="w-4 h-4" />Open now</button>
                <button type="button" className={btnLight} onClick={stop} data-queue-stop><Square className="w-4 h-4" />Stop</button>
              </div>
            </div>
          )}

          {phase === 'done' && (
            <div className="mt-2" data-queue-done={ended ?? ''}>
              <p className="text-sm text-[#37352F]">
                {ended === 'limit'
                  ? `Daily limit reached: ${count()} of ${limit} messages in the last 24 hours. Instagram limits accounts that send many similar messages, so continue tomorrow.`
                  : 'All done: no more shops to message right now.'}
              </p>
              <button type="button" className={`${btnLight} mt-3`} onClick={stop} data-queue-close>OK</button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
