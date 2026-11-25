import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Loader2, BarChart3, Info, ArrowUp, ArrowDown, MousePointerClick, PlayCircle, FileText, Frown, Ban, Search, Globe2, Monitor, Tablet, Smartphone } from 'lucide-react';
import { Switch } from './addonsUi';
import { getSiteInsights, fmtMs, type Device, type SiteInsights, type Summary } from '../lib/siteInsightsAdmin';
import { countingThisBrowser, setCountingThisBrowser } from '../lib/siteInsights';
import { SiteHeatmap } from './SiteHeatmap';

// One blue for the data (a single series everywhere), text in the text colours.
const BLUE = '#257de0';

const RANGES = [{ days: 7, label: '7 days' }, { days: 30, label: '30 days' }, { days: 90, label: '90 days' }] as const;
const DEVICES: { id: Device | null; label: string }[] = [{ id: null, label: 'All devices' }, { id: 'desktop', label: 'Computers' }, { id: 'tablet', label: 'Tablets' }, { id: 'mobile', label: 'Phones' }];
const SOURCE: Record<string, string> = { direct: 'Direct (typed or bookmarked)', search: 'Search engines', social: 'Social media', referral: 'Other websites', email: 'Email', campaign: 'Campaign links' };
const FORM: Record<string, string> = { signup: 'Signup form', contact: 'Contact form' };

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function rangeOf(days: number) {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth(), to.getDate() - (days - 1));
  return { from: ymd(from), to: ymd(to) };
}
const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '-');
const num = (n: number) => n.toLocaleString('en-US');
/** "1 visit", "3 visits". */
const many = (n: number, word: string) => `${num(n)} ${n === 1 ? word : `${word}s`}`;
const per = (n: number, d: number, digits = 1) => (d > 0 ? (n / d).toFixed(digits) : '-');

/** The numbers of one period, worked out from its totals. */
function kpis(s: Summary) {
  return {
    sessions: s.sessions,
    visitors: s.visitors,
    engagedAvg: s.sessions ? s.engaged_ms / s.sessions : 0,
    lengthAvg: s.sessions ? s.duration_ms / s.sessions : 0,
    pagesPer: s.sessions ? s.pageviews / s.sessions : 0,
    engagement: s.sessions ? s.engaged_sessions / s.sessions : 0,
    bounce: s.sessions ? 1 - s.engaged_sessions / s.sessions : 0,
    actionsPer: s.sessions ? s.actions / s.sessions : 0,
    conversion: s.sessions ? s.conversions / s.sessions : 0,
  };
}

/**
 * Admin > Website insights: how visitors use stampfix.app, counted only for
 * visitors who allowed "Website statistics" in the cookie banner.
 */
export function SiteInsightsAdmin() {
  const [days, setDays] = useState<number>(30);
  const [device, setDevice] = useState<Device | null>(null);
  const [data, setData] = useState<SiteInsights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [counting, setCounting] = useState(countingThisBrowser);
  const range = useMemo(() => rangeOf(days), [days]);

  const load = useCallback(() => {
    setError(null);
    setData(null);
    getSiteInsights(range.from, range.to, device).then(setData).catch((e) => setError(e instanceof Error ? e.message : 'error'));
  }, [range, device]);
  useEffect(load, [load]);

  return (
    <div className="space-y-5" data-site-insights>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-2xl font-serif-display font-semibold text-[#37352F] flex items-center gap-2"><BarChart3 className="w-6 h-6" />Website insights</h2>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">
            How visitors use stampfix.app: the home page, features, pricing, blog, legal pages and the signup form.
            Only visitors who allowed “Website statistics” in the cookie banner are counted, and never you or signed-in shops.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 shrink-0" data-count-me>
          <Switch on={counting} onChange={() => { setCountingThisBrowser(!counting); setCounting(!counting); }} label="Count my own visits from this browser" size="sm" />
          Count my own visits from this browser
        </label>
      </div>

      <div className="flex items-center gap-2 flex-wrap" data-insights-filters>
        {RANGES.map((r) => (
          <button key={r.days} type="button" onClick={() => setDays(r.days)} data-range={r.days}
            className={`px-3 py-1.5 rounded-full text-sm border transition ${days === r.days ? 'bg-[#37352F] text-white border-[#37352F]' : 'bg-white notion-border text-[#37352F] hover:bg-[#F7F7F5]'}`}>
            Last {r.label}
          </button>
        ))}
        <span className="w-px h-5 bg-gray-200 mx-1" aria-hidden />
        {DEVICES.map((d) => (
          <button key={d.label} type="button" onClick={() => setDevice(d.id)} data-device={d.id ?? 'all'}
            className={`px-3 py-1.5 rounded-full text-sm border transition ${device === d.id ? 'bg-[#37352F] text-white border-[#37352F]' : 'bg-white notion-border text-[#37352F] hover:bg-[#F7F7F5]'}`}>
            {d.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3" data-insights-error>
          {/admin_site_insights|function .* does not exist|schema cache/i.test(error)
            ? 'Website insights isn’t set up in the database yet: run the site_insights SQL in Supabase (SQL Editor), then reload.'
            : `Couldn’t load the numbers: ${error}`}
        </div>
      ) : !data ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
      ) : data.summary.sessions === 0 ? (
        <>
          <div className="rounded-xl border notion-border bg-white p-8 text-center" data-insights-empty>
            <BarChart3 className="w-8 h-8 mx-auto text-gray-300" />
            <div className="font-semibold text-[#37352F] mt-3">No visits in the last {days} days{device ? ' on this kind of device' : ''}</div>
            <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">Visits show up here once visitors allow “Website statistics” in the cookie banner. Your own visits aren’t counted unless you switch that on above.</p>
          </div>
          <NotMeasured />
        </>
      ) : (
        <Report data={data} days={days} device={device} range={range} />
      )}
    </div>
  );
}

function Report({ data, days, device, range }: { data: SiteInsights; days: number; device: Device | null; range: { from: string; to: string } }) {
  const now = kpis(data.summary);
  const before = kpis(data.previous);
  const hadBefore = data.previous.sessions > 0;
  const s = data.summary;
  return (
    <>
      {/* 1. The headline numbers */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3" data-kpis>
        <Kpi label="Visits" value={num(s.sessions)} delta={hadBefore ? change(now.sessions, before.sessions) : null}
          hint="A visit ends after 30 minutes without activity." />
        <Kpi label="Visitors" value={num(s.visitors)} delta={hadBefore ? change(now.visitors, before.visitors) : null}
          sub={`${num(s.new_visitors)} new · ${num(s.returning_visitors)} returning`}
          hint="Different people (browsers). New: their first visit was in this period. Returning: they had been here before. Someone can be both." />
        <Kpi label="Engagement time" value={fmtMs(now.engagedAvg)} delta={hadBefore ? change(now.engagedAvg, before.engagedAvg) : null}
          sub="per visit" hint="Time a page was on screen, in focus, with someone there (mouse, keys or scrolling in the last 5 minutes)." />
        <Kpi label="Visit length" value={fmtMs(now.lengthAvg)} delta={hadBefore ? change(now.lengthAvg, before.lengthAvg) : null}
          sub="first page to last activity" hint="Average time from the first page of a visit to the last moment someone was active." />
        <Kpi label="Pages per visit" value={now.pagesPer.toFixed(1)} delta={hadBefore ? change(now.pagesPer, before.pagesPer) : null}
          hint="Pages viewed in a visit, on average." />
        <Kpi label="Engagement rate" value={pct(s.engaged_sessions, s.sessions)} delta={hadBefore ? points(now.engagement, before.engagement) : null}
          hint="Visits that lasted 10 seconds or more in use, saw 2 or more pages, or sent a form." />
        <Kpi label="Bounce rate" value={pct(s.sessions - s.engaged_sessions, s.sessions)} delta={hadBefore ? points(now.bounce, before.bounce) : null}
          hint="The opposite: visits under 10 seconds in use, with one page and no form sent." />
        <Kpi label="Actions per visit" value={now.actionsPer.toFixed(1)} delta={hadBefore ? change(now.actionsPer, before.actionsPer) : null}
          hint="Clicks on buttons and links (menus, FAQ, tabs, calls to action) per visit." />
        <Kpi label="Forms sent" value={num(s.conversions)} delta={hadBefore ? change(s.conversions, data.previous.conversions) : null}
          sub={`${pct(s.conversions, s.sessions)} of visits`} hint="Visits in which the signup or contact form went through." />
        <Devices devices={data.devices} total={s.sessions} />
      </section>
      <p className="text-xs text-gray-400 -mt-2">{hadBefore ? `Arrows compare with the ${days} days before.` : 'No visits in the period before, so nothing to compare with yet.'}</p>

      {/* 2. Visits per day */}
      <Card title="Visits per day" icon={<BarChart3 className="w-4 h-4" />} id="trend">
        <VisitsChart daily={data.daily} from={range.from} to={range.to} />
      </Card>

      {/* 3. Pages */}
      <Card title="Pages" icon={<FileText className="w-4 h-4" />} id="pages"
        note="Time on page: on screen. Engagement: on screen, in focus and in use. Scrolled: share of views that got that far down. Exit rate: views after which the visitor left. Bounce: visits that started here and didn’t engage.">
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full text-sm min-w-[860px]" data-pages-table>
            <thead><tr className="text-left text-xs text-gray-500 border-b notion-border">
              <th className="py-2 pl-4 sm:pl-0 pr-3 font-medium">Page</th><th className="py-2 px-3 font-medium text-right">Views</th>
              <th className="py-2 px-3 font-medium text-right">Time on page</th><th className="py-2 px-3 font-medium text-right">Engagement</th>
              <th className="py-2 px-3 font-medium">Scrolled 25 / 50 / 75 / 100%</th>
              <th className="py-2 px-3 font-medium text-right">Exit rate</th><th className="py-2 px-3 font-medium text-right">Bounce</th>
            </tr></thead>
            <tbody>
              {data.pages.map((p) => (
                <tr key={p.path} className="border-b notion-border last:border-0" data-page-row={p.path}>
                  <td className="py-2 pl-4 sm:pl-0 pr-3 font-medium text-[#37352F] break-all">{p.path}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{num(p.views)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{fmtMs(p.avg_visible_ms)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{fmtMs(p.avg_engaged_ms)}</td>
                  <td className="py-2 px-3"><ScrollBars p={p} /></td>
                  <td className="py-2 px-3 text-right tabular-nums" title={`${p.exits} of ${p.views} views`}>{pct(p.exits, p.views)}</td>
                  <td className="py-2 px-3 text-right tabular-nums" title={`${p.bounces} of ${p.entrances} visits that started here`}>{p.entrances ? pct(p.bounces, p.entrances) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 4. Where visitors come from */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Where visitors come from" icon={<Globe2 className="w-4 h-4" />} id="sources">
          <Bars rows={data.sources.map((x) => ({ key: x.source, label: SOURCE[x.source] ?? x.source, value: x.sessions,
            detail: `${pct(x.engaged, x.sessions)} engaged${x.conversions ? ` · ${x.conversions} form${x.conversions === 1 ? '' : 's'} sent` : ''}` }))} unit="visits" />
          {data.referrers.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Top websites and search engines</div>
              <ul className="text-sm divide-y notion-border" data-referrers>
                {data.referrers.map((r) => <li key={r.host} className="flex justify-between py-1.5"><span className="break-all">{r.host}</span><span className="tabular-nums text-gray-500">{num(r.sessions)}</span></li>)}
              </ul>
            </div>
          )}
          {data.campaigns.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Campaign links (utm)</div>
              <ul className="text-sm divide-y notion-border" data-campaigns>
                {data.campaigns.map((c, i) => (
                  <li key={i} className="flex justify-between gap-3 py-1.5">
                    <span className="min-w-0 break-words">{[c.campaign, c.source, c.medium].filter(Boolean).join(' · ')}</span>
                    <span className="tabular-nums text-gray-500 shrink-0">{many(c.sessions, 'visit')}{c.conversions ? ` · ${c.conversions} sent` : ''}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
        <Card title="Dwell time from search" icon={<Search className="w-4 h-4" />} id="dwell"
          note="How long visitors from Google and other search engines stayed on the one page they saw before leaving. The exact “went back to Google” moment is only known to Google; this is the closest we can measure.">
          {data.dwell.one_page === 0 ? (
            <p className="text-sm text-gray-500">No one-page visits from search engines in this period ({many(data.dwell.search_sessions, 'visit')} from search in all).</p>
          ) : (<>
            <div className="text-3xl font-semibold text-[#37352F] tabular-nums" data-dwell-avg>{fmtMs(data.dwell.avg_visible_ms)}</div>
            <div className="text-sm text-gray-500">average, over {many(data.dwell.one_page, 'one-page visit')} from search ({many(data.dwell.search_sessions, 'visit')} from search in all)</div>
            <ul className="text-sm divide-y notion-border mt-3">
              {data.dwell.pages.map((p) => <li key={p.path} className="flex justify-between py-1.5"><span className="break-all">{p.path}</span><span className="tabular-nums text-gray-500">{fmtMs(p.avg_visible_ms)} · {num(p.sessions)}</span></li>)}
            </ul>
          </>)}
        </Card>
      </div>

      {/* 5. Clicks on buttons and links */}
      <Card title="Buttons and links clicked" icon={<MousePointerClick className="w-4 h-4" />} id="ctas"
        note="Click-through rate: views of that page on which it was clicked. The same button in English and German shows as two rows.">
        {data.ctas.length === 0 ? <p className="text-sm text-gray-500">No clicks on buttons or links yet.</p> : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-sm min-w-[640px]" data-cta-table>
              <thead><tr className="text-left text-xs text-gray-500 border-b notion-border">
                <th className="py-2 pl-4 sm:pl-0 pr-3 font-medium">Button or link</th><th className="py-2 px-3 font-medium">Page</th>
                <th className="py-2 px-3 font-medium text-right">Click-through</th><th className="py-2 px-3 font-medium text-right">Clicks</th>
              </tr></thead>
              <tbody>
                {data.ctas.slice(0, 30).map((c, i) => (
                  <tr key={i} className="border-b notion-border last:border-0" data-cta-row={c.label}>
                    <td className="py-2 pl-4 sm:pl-0 pr-3"><div className="font-medium text-[#37352F] break-words">{c.label}</div>{c.href && <div className="text-xs text-gray-400 break-all">{c.href}</div>}</td>
                    <td className="py-2 px-3 text-gray-600 break-all">{c.path}</td>
                    <td className="py-2 px-3 text-right tabular-nums" title={`${c.views_clicked} of ${c.views} views`}>{pct(c.views_clicked, c.views)}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{num(c.clicks)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 6. Video and forms */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Feature video" icon={<PlayCircle className="w-4 h-4" />} id="video">
          {data.videos.length === 0 ? <p className="text-sm text-gray-500">Nobody played the video in this period.</p> : data.videos.map((v) => (
            <div key={`${v.path}${v.label}`} className="mb-4 last:mb-0" data-video={v.label}>
              <div className="text-sm text-[#37352F]"><b>{v.label}</b> <span className="text-gray-500">on {v.path}</span></div>
              <div className="text-sm text-gray-500 mt-0.5">Played on <b className="text-[#37352F]">{pct(v.plays, v.views)}</b> of {many(v.views, 'view')} ({many(v.plays, 'play')})</div>
              <Bars small rows={[['Watched 25%', v.p25], ['Watched 50%', v.p50], ['Watched 75%', v.p75], ['Watched to the end', v.p100]].map(([label, n]) => ({
                key: String(label), label: String(label), value: Number(n), detail: pct(Number(n), v.plays) }))} max={v.plays} unit="plays" />
            </div>
          ))}
        </Card>
        <Card title="Forms" icon={<FileText className="w-4 h-4" />} id="forms"
          note="Started: someone clicked into a field. Abandoned: started but never went through. Nothing typed is ever recorded.">
          {data.forms.length === 0 ? <p className="text-sm text-gray-500">No one started a form in this period.</p> : data.forms.map((f) => (
            <div key={`${f.form}${f.path}`} className="mb-4 last:mb-0" data-form={f.form}>
              <div className="text-sm text-[#37352F]"><b>{FORM[f.form] ?? f.form}</b> <span className="text-gray-500">on {f.path}</span></div>
              <Bars small rows={[
                { key: 'views', label: 'Saw the page', value: f.views, detail: '' },
                { key: 'started', label: 'Started', value: f.started, detail: pct(f.started, f.views) },
                { key: 'submitted', label: 'Pressed send', value: f.submitted, detail: pct(f.submitted, f.started) },
                { key: 'completed', label: 'Went through', value: f.completed, detail: pct(f.completed, f.started) },
              ]} max={f.views} unit="" />
              <div className="text-sm text-gray-500 mt-1">
                Abandoned: <b className="text-[#37352F]">{f.started ? pct(Math.max(0, f.started - f.completed), f.started) : '-'}</b>
                {f.avg_ms ? <> · Time to fill in: <b className="text-[#37352F]">{fmtMs(f.avg_ms)}</b></> : null}
              </div>
            </div>
          ))}
        </Card>
      </div>

      {/* 7. Frustration */}
      <Card title="Rage clicks and dead clicks" icon={<Frown className="w-4 h-4" />} id="friction"
        note="Rage click: 3 or more quick clicks on the same spot. Dead click: a click on something that looks clickable where nothing happens within a second.">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <MiniStat icon={<Frown className="w-4 h-4 text-red-600" />} label="Rage clicks" value={num(data.friction.rage)} sub={`in ${pct(data.friction.rage_sessions, s.sessions)} of visits`} />
          <MiniStat icon={<Ban className="w-4 h-4 text-amber-600" />} label="Dead clicks" value={num(data.friction.dead)} sub={`in ${pct(data.friction.dead_sessions, s.sessions)} of visits`} />
        </div>
        {data.friction.top.length > 0 && (
          <ul className="text-sm divide-y notion-border" data-friction-top>
            {data.friction.top.map((t, i) => (
              <li key={i} className="flex items-center gap-3 py-1.5">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs shrink-0 ${t.kind === 'rage' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>
                  {t.kind === 'rage' ? <Frown className="w-3 h-3" /> : <Ban className="w-3 h-3" />}{t.kind === 'rage' ? 'Rage' : 'Dead'}
                </span>
                <span className="min-w-0 flex-1 break-words">“{t.target}” <span className="text-gray-400">on {t.path}</span></span>
                <span className="tabular-nums text-gray-500 shrink-0">{num(t.count)}×</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 8. Heatmap */}
      <SiteHeatmap pages={data.pages.map((p) => p.path)} from={range.from} to={range.to} device={device} />

      <NotMeasured />
    </>
  );
}

// ---- Pieces --------------------------------------------------------------------------------

type Delta = { text: string; up: boolean } | null;
function change(a: number, b: number): Delta {
  if (!b) return a ? { text: 'new', up: true } : null;
  const d = Math.round(((a - b) / b) * 100);
  return d === 0 ? { text: 'same', up: true } : { text: `${Math.abs(d)}%`, up: d > 0 };
}
function points(a: number, b: number): Delta {
  const d = Math.round((a - b) * 100);
  return d === 0 ? { text: 'same', up: true } : { text: `${Math.abs(d)} pts`, up: d > 0 };
}

function Kpi({ label, value, sub, hint, delta }: { label: string; value: string; sub?: string; hint: string; delta: Delta }) {
  const [why, setWhy] = useState(false);
  return (
    <div className="rounded-xl border notion-border bg-white px-4 py-3" data-kpi={label}>
      <div className="flex items-center gap-1 text-xs text-gray-500">
        {label}
        <button type="button" onClick={() => setWhy(!why)} aria-expanded={why} aria-label={`What “${label}” means`} title={hint} className="text-gray-300 hover:text-gray-500">
          <Info className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="text-2xl font-semibold text-[#37352F] tabular-nums mt-0.5" data-kpi-value>{value}</div>
      <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5 min-h-[16px]">
        {delta && (
          <span className="inline-flex items-center gap-0.5 tabular-nums" data-kpi-delta>
            {delta.text === 'same' ? null : delta.up ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}{delta.text}
          </span>
        )}
        {sub && <span className="truncate">{sub}</span>}
      </div>
      {why && <p className="text-xs text-gray-500 mt-1.5 leading-snug" data-kpi-hint>{hint}</p>}
    </div>
  );
}

function Devices({ devices, total }: { devices: Partial<Record<Device, number>>; total: number }) {
  const rows: [Device, string, ReactNode][] = [['desktop', 'Computers', <Monitor key="d" className="w-3.5 h-3.5" />], ['tablet', 'Tablets', <Tablet key="t" className="w-3.5 h-3.5" />], ['mobile', 'Phones', <Smartphone key="m" className="w-3.5 h-3.5" />]];
  return (
    <div className="rounded-xl border notion-border bg-white px-4 py-3" data-kpi="Devices">
      <div className="text-xs text-gray-500">Devices</div>
      <ul className="mt-1 space-y-0.5 text-sm">
        {rows.map(([k, label, icon]) => (
          <li key={k} className="flex items-center gap-1.5 text-[#37352F]"><span className="text-gray-400">{icon}</span>{label}<span className="ml-auto tabular-nums">{pct(devices[k] ?? 0, total)}</span></li>
        ))}
      </ul>
    </div>
  );
}

function Card({ title, icon, note, id, children }: { title: string; icon: ReactNode; note?: string; id: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border notion-border bg-white p-4 sm:p-5" data-insights-card={id}>
      <h3 className="font-semibold text-[#37352F] flex items-center gap-2">{icon}{title}</h3>
      {note && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function MiniStat({ icon, label, value, sub }: { icon: ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg bg-[#F7F7F5] px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs text-gray-500">{icon}{label}</div>
      <div className="text-xl font-semibold text-[#37352F] tabular-nums">{value}</div>
      <div className="text-xs text-gray-500">{sub}</div>
    </div>
  );
}

/** Horizontal bars: one hue, the value written beside each. */
function Bars({ rows, max, unit, small = false }: { rows: { key: string; label: string; value: number; detail: string }[]; max?: number; unit: string; small?: boolean }) {
  const top = Math.max(1, max ?? Math.max(0, ...rows.map((r) => r.value)));
  return (
    <ul className={`${small ? 'space-y-1.5' : 'space-y-2'} mt-2`}>
      {rows.map((r) => (
        <li key={r.key} data-bar={r.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-[#37352F]">{r.label}</span>
            <span className="tabular-nums text-gray-500 text-xs whitespace-nowrap"><b className="text-[#37352F] text-sm">{num(r.value)}</b>{unit ? ` ${r.value === 1 ? unit.replace(/s$/, '') : unit}` : ''}{r.detail ? ` · ${r.detail}` : ''}</span>
          </div>
          <div className={`${small ? 'h-1.5' : 'h-2'} rounded-full bg-[#F1F1EF] mt-1 overflow-hidden`}>
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, (r.value / top) * 100)}%`, background: BLUE }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ScrollBars({ p }: { p: { views: number; s25: number; s50: number; s75: number; s100: number } }) {
  return (
    <div className="flex items-end gap-1.5" title={`Of ${p.views} views: ${p.s25} reached 25%, ${p.s50} reached 50%, ${p.s75} reached 75%, ${p.s100} reached the bottom`}>
      {[p.s25, p.s50, p.s75, p.s100].map((n, i) => (
        <div key={i} className="w-12">
          <div className="h-1.5 rounded-full bg-[#F1F1EF] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${p.views ? (n / p.views) * 100 : 0}%`, background: BLUE }} /></div>
          <div className="text-[11px] tabular-nums text-gray-500 mt-0.5">{pct(n, p.views)}</div>
        </div>
      ))}
    </div>
  );
}

/** Visits per day: one series, bars from the baseline, a tooltip on hover. */
function VisitsChart({ daily, from, to }: { daily: SiteInsights['daily']; from: string; to: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const days = useMemo(() => {
    const by = new Map(daily.map((d) => [d.d, d]));
    const out: SiteInsights['daily'] = [];
    const [y, m, d] = from.split('-').map(Number);
    for (let t = new Date(y, m - 1, d); ymd(t) <= to; t.setDate(t.getDate() + 1)) {
      const k = ymd(t);
      out.push(by.get(k) ?? { d: k, sessions: 0, engaged: 0, visitors: 0, pageviews: 0 });
    }
    return out;
  }, [daily, from, to]);
  const max = Math.max(1, ...days.map((d) => d.sessions));
  const W = 1000, H = 180, gap = days.length > 60 ? 1 : 2;
  const bw = W / days.length;
  const label = (k: string) => new Date(`${k}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const h = hover !== null ? days[hover] : null;
  return (
    <div className="relative" data-visits-chart onMouseLeave={() => setHover(null)}>
      <div className="flex justify-between text-[11px] text-gray-400 mb-1"><span>{many(max, 'visit')}</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-44 block" role="img"
        aria-label={`Visits per day from ${label(from)} to ${label(to)}: ${days.reduce((n, d) => n + d.sessions, 0)} in all, most on one day ${max}.`}>
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="#EEEEEC" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} stroke="#D9D9D6" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {days.map((d, i) => {
          const bh = (d.sessions / max) * (H - 6);
          const x = i * bw + gap / 2, w = Math.max(1, bw - gap);
          return (
            <g key={d.d} onMouseEnter={() => setHover(i)} data-day={d.d}>
              <rect x={i * bw} y={0} width={bw} height={H} fill="transparent" />
              {bh > 0 && <path d={`M${x},${H} V${H - bh + Math.min(4, bh)} Q${x},${H - bh} ${x + Math.min(4, w / 2)},${H - bh} H${x + w - Math.min(4, w / 2)} Q${x + w},${H - bh} ${x + w},${H - bh + Math.min(4, bh)} V${H} Z`}
                fill={BLUE} opacity={hover === null || hover === i ? 1 : 0.45} />}
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-[11px] text-gray-400 mt-1"><span>{label(from)}</span><span>{label(to)}</span></div>
      {h && (
        <div className="absolute top-0 z-10 rounded-lg bg-white border notion-border shadow-lg px-3 py-2 text-xs pointer-events-none" data-chart-tip
          style={{ left: `clamp(0px, calc(${((hover! + 0.5) / days.length) * 100}% - 70px), calc(100% - 150px))`, width: 150 }}>
          <div className="font-semibold text-[#37352F]">{label(h.d)}</div>
          <div className="text-gray-600 tabular-nums">{many(h.sessions, 'visit')} · {many(h.visitors, 'visitor')}</div>
          <div className="text-gray-600 tabular-nums">{many(h.pageviews, 'page')} · {pct(h.engaged, h.sessions)} engaged</div>
        </div>
      )}
      <table className="sr-only"><caption>Visits per day</caption><tbody>{days.map((d) => <tr key={d.d}><td>{d.d}</td><td>{d.sessions}</td></tr>)}</tbody></table>
    </div>
  );
}

function NotMeasured() {
  const rows: [string, string][] = [
    ['Internal site search', 'The website has no search box, so there’s nothing to measure. Once one is added, what people type into it can be counted.'],
    ['Exact dwell time', 'Only Google knows when someone goes back to its results. “Dwell time from search” shows the closest we can measure.'],
    ['Cursor trails and session recordings', 'Not recorded, for privacy and speed. The heatmap shows clicks, and for each section how long it was on screen and under the cursor.'],
    ['Visitors who didn’t allow statistics', 'They’re never counted, so all numbers are for those who said yes.'],
  ];
  return (
    <section className="rounded-xl border notion-border bg-[#F7F7F5] p-4 sm:p-5" data-not-measured>
      <h3 className="font-semibold text-[#37352F]">What isn’t measured, and why</h3>
      <ul className="mt-2 space-y-1.5 text-sm text-gray-600">
        {rows.map(([k, v]) => <li key={k}><b className="text-[#37352F]">{k}:</b> {v}</li>)}
      </ul>
    </section>
  );
}
