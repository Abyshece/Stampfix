import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Flame, Monitor, Smartphone } from 'lucide-react';
import { getSiteHeatmap, fmtMs, type Device, type Heatmap } from '../lib/siteInsightsAdmin';

const WIDTH = { desktop: 1280, mobile: 390 } as const;
const MAX_H = 12000;

/**
 * The heatmap: the real page in a frame, at computer or phone width, with every
 * click drawn where it happened (found again by its place in the page, else by
 * its position), and per section how long it was on screen and under the cursor.
 */
export function SiteHeatmap({ pages, from, to, device }: { pages: string[]; from: string; to: string; device: Device | null }) {
  const [path, setPath] = useState(() => (pages.includes('/') ? '/' : pages[0] ?? '/'));
  const [view, setView] = useState<'desktop' | 'mobile'>(device === 'mobile' ? 'mobile' : 'desktop');
  const [data, setData] = useState<Heatmap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [docH, setDocH] = useState(1200);
  const [boxW, setBoxW] = useState(320);
  const [drawn, setDrawn] = useState({ placed: 0, total: 0 });
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const settle = useRef(0);
  const shownDevice: Device = view === 'mobile' ? 'mobile' : device === 'tablet' ? 'tablet' : 'desktop';

  useEffect(() => { if (device === 'mobile') setView('mobile'); else if (device === 'desktop') setView('desktop'); }, [device]);
  useEffect(() => {
    setData(null); setError(null);
    getSiteHeatmap(path, from, to, device ?? (view === 'mobile' ? 'mobile' : 'desktop')).then(setData).catch((e) => setError(e instanceof Error ? e.message : 'error'));
  }, [path, from, to, device, view]);
  // The preview box exists once the numbers are in: follow its width from then on.
  const hasData = !!data;
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    setBoxW(el.clientWidth);
    return () => ro.disconnect();
  }, [hasData]);

  const w = WIDTH[view];
  const scale = Math.min(1, boxW / w);

  const draw = useCallback(() => {
    const f = frame.current, c = canvas.current;
    if (!f || !c || !data) return;
    let doc: Document | null = null;
    try { doc = f.contentDocument; } catch { doc = null; }
    const h = Math.min(MAX_H, Math.max(600, doc?.documentElement.scrollHeight ?? 1200));
    setDocH(h);
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    let placed = 0;
    // Plain clicks first, as a soft heat; rage and dead clicks on top, as rings.
    const order = [...data.clicks].sort((a, b) => (a.k === 'click' ? 0 : 1) - (b.k === 'click' ? 0 : 1));
    for (const k of order) {
      let x: number | null = null, y: number | null = null;
      if (doc && k.sel) {
        try {
          const el = doc.querySelector(k.sel);
          if (el) {
            const r = el.getBoundingClientRect();
            if (r.width || r.height) { x = r.left + (k.rx ?? 0.5) * r.width; y = r.top + (k.ry ?? 0.5) * r.height; }
          }
        } catch { /* not a valid selector here */ }
      }
      if (x === null && k.fx !== null && k.fy !== null) { x = k.fx * w; y = k.fy * h; }
      if (x === null || y === null) continue;
      placed += 1;
      if (k.k === 'click') {
        const g = ctx.createRadialGradient(x, y, 0, x, y, 18);
        g.addColorStop(0, 'rgba(37,125,224,0.55)'); g.addColorStop(1, 'rgba(37,125,224,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.strokeStyle = k.k === 'rage' ? '#dc2626' : '#d97706';
        ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.stroke();
      }
    }
    setDrawn({ placed, total: data.clicks.length });
  }, [data, w]);

  // The page inside needs a moment for its lazy parts; measure and draw then (and again a little later).
  const onLoad = () => {
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => { draw(); settle.current = window.setTimeout(draw, 2000); }, 1200);
  };
  useEffect(() => { draw(); }, [draw]);
  useEffect(() => () => window.clearTimeout(settle.current), []);

  const sections = data?.sections ?? [];
  const views = data?.views ?? 0;
  return (
    <section className="rounded-xl border notion-border bg-white p-4 sm:p-5" data-insights-card="heatmap">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold text-[#37352F] flex items-center gap-2"><Flame className="w-4 h-4" />Heatmap</h3>
          <p className="text-xs text-gray-500 mt-1">Where visitors click on a page, and which parts get their attention.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={path} onChange={(e) => setPath(e.target.value)} aria-label="Page" data-heat-page
            className="border notion-border rounded-lg px-2.5 py-1.5 text-sm bg-white max-w-[220px]">
            {(pages.length ? pages : ['/']).map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <div className="inline-flex rounded-lg border notion-border overflow-hidden">
            {(['desktop', 'mobile'] as const).map((v) => (
              <button key={v} type="button" onClick={() => setView(v)} disabled={device === (v === 'desktop' ? 'mobile' : 'desktop')} data-heat-view={v}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm disabled:opacity-40 ${view === v ? 'bg-[#37352F] text-white' : 'bg-white text-[#37352F] hover:bg-[#F7F7F5]'}`}>
                {v === 'desktop' ? <Monitor className="w-3.5 h-3.5" /> : <Smartphone className="w-3.5 h-3.5" />}{v === 'desktop' ? 'Computer' : 'Phone'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error ? <p className="text-sm text-red-700 mt-3">Couldn’t load the heatmap: {error}</p> : !data ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_280px] mt-3">
          <div className="min-w-0">
            <div className="flex items-center gap-3 text-xs text-gray-500 mb-2 flex-wrap" data-heat-legend>
              <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-full" style={{ background: 'rgba(37,125,224,0.6)' }} />Click</span>
              <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-full border-2 border-red-600" />Rage click</span>
              <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-full border-2 border-amber-600" />Dead click</span>
              <span className="ml-auto" data-heat-count>{drawn.placed} of {data.clicks.length} {data.clicks.length === 1 ? 'click' : 'clicks'} shown · {views} {views === 1 ? 'view' : 'views'} ({shownDevice === 'mobile' ? 'phones' : shownDevice === 'tablet' ? 'tablets' : 'computers'})</span>
            </div>
            <div ref={box} className="rounded-lg border notion-border bg-[#F7F7F5] overflow-y-auto overflow-x-hidden max-h-[640px]" data-heat-box>
              <div className="relative mx-auto" style={{ width: w * scale, height: docH * scale }}>
                <div className="absolute top-0 left-0 origin-top-left" style={{ width: w, height: docH, transform: `scale(${scale})` }}>
                  <iframe ref={frame} key={`${path}-${view}`} src={path} title={`Preview of ${path}`} onLoad={onLoad} data-heat-frame
                    className="absolute inset-0 bg-white border-0 pointer-events-none" style={{ width: w, height: docH }} tabIndex={-1} />
                  <canvas ref={canvas} className="absolute inset-0 pointer-events-none" style={{ width: w, height: docH }} data-heat-canvas />
                </div>
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5">The page is shown as it is today; clicks on parts that changed since are placed by their position on the page.</p>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Attention by section</div>
            {sections.length === 0 ? <p className="text-sm text-gray-500">No sections recorded for this page yet.</p> : (
              <ol className="space-y-2.5" data-heat-sections>
                {sections.map((s) => (
                  <li key={s.k} data-heat-section={s.k}>
                    <div className="text-sm text-[#37352F] leading-snug break-words">{s.h ?? `Section ${s.k.replace(/^s/, '')}`}</div>
                    <div className="h-1.5 rounded-full bg-[#F1F1EF] mt-1 overflow-hidden"><div className="h-full rounded-full bg-[#257de0]" style={{ width: `${views ? Math.min(100, (s.seen / views) * 100) : 0}%` }} /></div>
                    <div className="text-[11px] text-gray-500 mt-0.5 tabular-nums">
                      seen in {views ? Math.round((s.seen / views) * 100) : 0}% of views · on screen {fmtMs(s.avg_visible_ms)} · under the cursor {fmtMs(s.avg_hover_ms)}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
