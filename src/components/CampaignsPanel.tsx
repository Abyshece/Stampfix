import { useState, useEffect, useCallback, useMemo, useRef, type ComponentType, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Megaphone, Plus, ArrowRight, ArrowLeft, MessageSquare, Target, CalendarDays, Radio, Users, Info, Loader2,
  X, Pause, Play, Trash2, ChevronDown, Check, Send, Zap, Ban,
} from 'lucide-react';
import { useToast } from './ToastProvider';
import type { Location } from '../types';
import {
  SEGMENTS, TRIGGERS, MAX_MESSAGE, MAX_CAMPAIGN_DAYS, TIME_SLOTS,
  listMarketingCampaigns, createMarketingCampaign, launchMarketingCampaign, setMarketingCampaignStatus,
  deleteMarketingCampaign, estimateReach, browserTimeZone, timeZoneOptions, zonedTimeToUtc, nowInZone, addDays,
  formatInZone,
  type CampaignKind, type MarketingCampaign, type Segment, type TriggerType,
} from '../lib/marketingCampaigns';

type T = ReturnType<typeof useTranslation>['t'];

const initialOf = (name: string) => (name.trim()[0] || 'S').toUpperCase();

// ---- Labels -----------------------------------------------------------------

const segmentLabel = (t: T, s: Segment) => ({
  all: t('dash.campaigns.seg.all', { defaultValue: 'All customers' }),
  new: t('dash.campaigns.seg.new', { defaultValue: 'New customers (joined in the last 30 days)' }),
  active: t('dash.campaigns.seg.active', { defaultValue: 'Active customers (visited in the last 30 days)' }),
  inactive_30: t('dash.campaigns.seg.inactive30', { defaultValue: "Haven't visited in 30+ days" }),
  inactive_60: t('dash.campaigns.seg.inactive60', { defaultValue: "Haven't visited in 60+ days" }),
  close: t('dash.campaigns.seg.close', { defaultValue: '1 stamp away from a reward' }),
  reward_ready: t('dash.campaigns.seg.rewardReady', { defaultValue: 'Reward ready to redeem' }),
  loyal: t('dash.campaigns.seg.loyal', { defaultValue: 'Loyal customers (redeemed a reward)' }),
}[s]);

const triggerName = (t: T, type: TriggerType) => ({
  inactive: t('dash.campaigns.trg.inactive', { defaultValue: 'Inactive customers' }),
  stamps_reached: t('dash.campaigns.trg.stampsReached', { defaultValue: 'Collected stamps' }),
  stamps_away: t('dash.campaigns.trg.stampsAway', { defaultValue: 'Close to a reward' }),
  reward_ready: t('dash.campaigns.trg.rewardReady', { defaultValue: 'Reward ready to redeem' }),
  rewards_redeemed: t('dash.campaigns.trg.rewardsRedeemed', { defaultValue: 'Redeemed rewards' }),
  joined_days: t('dash.campaigns.trg.joinedDays', { defaultValue: 'After joining' }),
}[type]);

/** The question next to the trigger's number picker. */
const triggerValueLabel = (t: T, type: TriggerType) => ({
  inactive: t('dash.campaigns.trgv.inactive', { defaultValue: "Hasn't visited for" }),
  stamps_reached: t('dash.campaigns.trgv.stampsReached', { defaultValue: 'Has collected at least' }),
  stamps_away: t('dash.campaigns.trgv.stampsAway', { defaultValue: 'Stamps left until the reward' }),
  reward_ready: '',
  rewards_redeemed: t('dash.campaigns.trgv.rewardsRedeemed', { defaultValue: 'Has redeemed at least' }),
  joined_days: t('dash.campaigns.trgv.joinedDays', { defaultValue: 'Days after joining' }),
}[type]);

/** One-line summary of a trigger with its number, for the campaign list. */
const triggerSummary = (t: T, type: TriggerType, n: number | null) => ({
  inactive: t('dash.campaigns.trgs.inactive', { count: n ?? 30, defaultValue: "Hasn't visited for {{count}} days" }),
  stamps_reached: t('dash.campaigns.trgs.stampsReached', { count: n ?? 1, defaultValue: 'Has collected {{count}}+ stamps' }),
  stamps_away: t('dash.campaigns.trgs.stampsAway', { count: n ?? 1, defaultValue: '{{count}} stamp(s) away from a reward' }),
  reward_ready: t('dash.campaigns.trg.rewardReady', { defaultValue: 'Reward ready to redeem' }),
  rewards_redeemed: t('dash.campaigns.trgs.rewardsRedeemed', { count: n ?? 1, defaultValue: 'Has redeemed {{count}}+ rewards' }),
  joined_days: t('dash.campaigns.trgs.joinedDays', { count: n ?? 7, defaultValue: '{{count}} days after joining' }),
}[type]);

const unitLabel = (t: T, unit: 'days' | 'count' | null, type: TriggerType) =>
  unit === 'days'
    ? t('dash.campaigns.unitDays', { defaultValue: 'days' })
    : type === 'rewards_redeemed'
      ? t('dash.campaigns.unitRewards', { defaultValue: 'rewards' })
      : t('dash.campaigns.unitStamps', { defaultValue: 'stamps' });

// ---- Building blocks ----------------------------------------------------------

/** On-brand iPhone lock-screen preview of the notification, updating as you type. */
function PhonePreview({ businessName, message }: { businessName: string; message: string }) {
  const { t } = useTranslation();
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  const has = message.trim().length > 0;
  const body = has ? message.trim() : t('dash.campaigns.previewPlaceholder', { defaultValue: 'Type in the message you want to push' });
  return (
    <div className="w-[248px] shrink-0 rounded-[2.5rem] bg-gradient-to-b from-[#3a3a3f] to-[#2b2a27] p-2.5 shadow-2xl ring-1 ring-black/10 select-none mx-auto">
      <div className="rounded-[2rem] h-[440px] relative px-4 pt-5 flex flex-col text-white overflow-hidden">
        <div className="flex justify-between items-center text-[10px] font-medium opacity-90">
          <span>{time}</span><span>•••</span>
        </div>
        <div className="text-center mt-6">
          <div className="text-xs opacity-80">{date}</div>
          <div className="text-6xl font-semibold tracking-tight mt-1">{time}</div>
        </div>
        <div className="mt-auto mb-6">
          <div className="bg-white/95 text-[#37352F] rounded-2xl p-3 shadow-lg">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#37352F] text-white flex items-center justify-center text-sm font-semibold shrink-0">{initialOf(businessName)}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold truncate">{businessName || 'Stampfix'}</span>
                  <span className="text-[11px] text-gray-400 shrink-0">{t('dash.campaigns.previewNow', { defaultValue: 'now' })}</span>
                </div>
                <p className={`text-[12px] leading-snug mt-0.5 line-clamp-3 break-words ${has ? '' : 'text-gray-400'}`}>{body}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, right, children }: { icon: ComponentType<{ className?: string }>; title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="border notion-border rounded-xl p-5 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="flex items-center gap-2 text-base font-semibold text-[#37352F]"><Icon className="w-5 h-5" />{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-lg bg-[#F3F1FE] text-[#5647C9] px-4 py-3 text-sm leading-relaxed">
      <Info className="w-4 h-4 shrink-0 mt-0.5" /><div>{children}</div>
    </div>
  );
}

const fieldLabel = 'block text-sm font-medium text-gray-500 mb-1.5';
const inputCls = 'w-full border notion-border rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#37352F]/10';

/** "All locations" or a chosen subset, as removable chips with a checklist. */
function LocationPicker({ locations, value, onChange }: { locations: Location[]; value: string[]; onChange: (ids: string[]) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  const allLabel = t('dash.campaigns.allLocations', { defaultValue: 'All locations' });
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full min-h-[46px] border notion-border rounded-lg px-2.5 py-2 bg-[#F7F7F5] flex items-center gap-2 text-left">
        <span className="flex flex-wrap gap-1.5 flex-1">
          {value.length === 0 ? (
            <span className="inline-flex items-center gap-1 bg-white border notion-border rounded-md px-2 py-0.5 text-sm font-medium">{allLabel}</span>
          ) : value.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 bg-white border notion-border rounded-md px-2 py-0.5 text-sm font-medium">
              {locations.find((l) => l.id === id)?.name ?? '—'}
              <span role="button" tabIndex={0} aria-label="remove" onClick={(e) => { e.stopPropagation(); toggle(id); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); toggle(id); } }}
                className="text-gray-400 hover:text-[#37352F]"><X className="w-3.5 h-3.5" /></span>
            </span>
          ))}
        </span>
        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border notion-border rounded-lg shadow-lg py-1 max-h-64 overflow-auto">
          <button type="button" onClick={() => { onChange([]); setOpen(false); }}
            className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-[#F7F7F5]">
            {allLabel}{value.length === 0 && <Check className="w-4 h-4" />}
          </button>
          {locations.map((l) => (
            <button type="button" key={l.id} onClick={() => toggle(l.id)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-[#F7F7F5]">
              <span className="truncate">{l.name}</span>{value.includes(l.id) && <Check className="w-4 h-4 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ConfirmDialog({ title, body, confirmLabel, danger, busy, onConfirm, onCancel }: {
  title: string; body: string; confirmLabel: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => !busy && onCancel()} />
      <div className="relative bg-white rounded-xl p-6 max-w-sm w-full shadow-xl">
        <h3 className="text-lg font-semibold text-[#37352F] mb-2">{title}</h3>
        <p className="text-sm text-gray-500 mb-5">{body}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} disabled={busy} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-[#F7F7F5] transition">
            {t('dash.campaigns.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button onClick={onConfirm} disabled={busy}
            className={`inline-flex items-center gap-2 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[#37352F] hover:bg-[#2a2a28]'}`}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}{confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Status -------------------------------------------------------------------

type ShownStatus = 'scheduled' | 'sending' | 'sent' | 'running' | 'paused' | 'ended' | 'cancelled';

function shownStatus(c: MarketingCampaign): ShownStatus {
  const future = new Date(c.startsAt).getTime() > Date.now();
  if (c.status === 'scheduled') return future ? 'scheduled' : 'sending';
  if (c.status === 'active') return future ? 'scheduled' : 'running';
  return c.status;
}

function StatusBadge({ status }: { status: ShownStatus }) {
  const { t } = useTranslation();
  const map: Record<ShownStatus, [string, string]> = {
    scheduled: [t('dash.campaigns.st.scheduled', { defaultValue: 'Scheduled' }), 'bg-blue-50 text-blue-700'],
    sending: [t('dash.campaigns.st.sending', { defaultValue: 'Sending…' }), 'bg-blue-50 text-blue-700'],
    sent: [t('dash.campaigns.st.sent', { defaultValue: 'Sent' }), 'bg-green-50 text-green-700'],
    running: [t('dash.campaigns.st.running', { defaultValue: 'Active' }), 'bg-green-50 text-green-700'],
    paused: [t('dash.campaigns.st.paused', { defaultValue: 'Paused' }), 'bg-amber-50 text-amber-700'],
    ended: [t('dash.campaigns.st.ended', { defaultValue: 'Ended' }), 'bg-gray-100 text-gray-600'],
    cancelled: [t('dash.campaigns.st.cancelled', { defaultValue: 'Cancelled' }), 'bg-gray-100 text-gray-500'],
  };
  const [label, cls] = map[status];
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>{label}</span>;
}

// ---- Panel --------------------------------------------------------------------

export function CampaignsPanel({ campaignId, businessName, locations, showIntro = false, onIntroDone }: {
  campaignId: string; businessName: string; locations: Location[];
  /** First visit: show the "How campaigns work" box with ready-made examples. */
  showIntro?: boolean;
  /** The intro was closed, or a first campaign was created. */
  onIntroDone?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [items, setItems] = useState<MarketingCampaign[] | null>(null);
  const [chooser, setChooser] = useState(false);
  const [editing, setEditing] = useState<CampaignKind | null>(null);
  const [preset, setPreset] = useState<CampaignPreset | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MarketingCampaign | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const activeLocations = useMemo(() => locations.filter((l) => !l.archived), [locations]);

  const load = useCallback(() => {
    listMarketingCampaigns(campaignId).then(setItems).catch(() => setItems([]));
  }, [campaignId]);
  useEffect(() => { load(); }, [load]);

  const changeStatus = async (c: MarketingCampaign, status: 'paused' | 'active' | 'cancelled') => {
    setBusyId(c.id);
    try {
      await setMarketingCampaignStatus(c.id, status);
      load();
    } catch {
      toast.error(t('dash.campaigns.saveErr', { defaultValue: "Couldn't save. Please try again." }));
    } finally {
      setBusyId(null);
    }
  };

  const doDelete = async () => {
    if (!pendingDelete) return;
    setBusyId(pendingDelete.id);
    try {
      await deleteMarketingCampaign(pendingDelete.id);
      setPendingDelete(null);
      load();
    } catch {
      toast.error(t('dash.campaigns.saveErr', { defaultValue: "Couldn't save. Please try again." }));
    } finally {
      setBusyId(null);
    }
  };

  if (editing) {
    return (
      <CampaignEditor
        kind={editing}
        campaignId={campaignId}
        businessName={businessName}
        locations={activeLocations}
        defaultName={t('dash.campaigns.defaultName', { n: (items?.length ?? 0) + 1, defaultValue: 'Campaign {{n}}' })}
        preset={preset}
        onCancel={() => { setEditing(null); setPreset(null); }}
        onDone={() => { setEditing(null); setPreset(null); if (showIntro) onIntroDone?.(); load(); }}
      />
    );
  }

  const examples: Array<CampaignPreset & { key: string }> = [
    {
      key: 'miss',
      name: t('dash.campaigns.intro.exMissName', { defaultValue: 'We miss you' }),
      message: t('dash.campaigns.intro.exMissMsg', { defaultValue: 'We miss you! Pop in this week and collect your next stamp.' }),
      segment: 'inactive_30',
    },
    {
      key: 'close',
      name: t('dash.campaigns.intro.exCloseName', { defaultValue: 'Almost there' }),
      message: t('dash.campaigns.intro.exCloseMsg', { defaultValue: 'You’re just 1 stamp away from your reward. See you soon!' }),
      segment: 'close',
    },
    {
      key: 'weekend',
      name: t('dash.campaigns.intro.exWeekendName', { defaultValue: 'Double stamps weekend' }),
      message: t('dash.campaigns.intro.exWeekendMsg', { defaultValue: 'This weekend only: double stamps on every visit!' }),
      segment: 'all',
    },
  ];
  const startFromExample = (ex: CampaignPreset) => { setPreset({ ...ex, message: ex.message.slice(0, MAX_MESSAGE) }); setEditing('manual'); };
  const introVisible = showIntro && items !== null && items.length === 0;

  const locationNames = (ids: string[]) =>
    ids.length === 0
      ? t('dash.campaigns.allLocations', { defaultValue: 'All locations' })
      : ids.map((id) => locations.find((l) => l.id === id)?.name ?? '—').join(', ');

  return (
    <div className="max-w-5xl">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Megaphone className="w-6 h-6 text-[#37352F]" />
            <h1 className="text-2xl font-semibold text-[#37352F]">{t('dash.campaigns.title', { defaultValue: 'Campaigns' })}</h1>
          </div>
          <p className="text-gray-500">{t('dash.campaigns.sub', { defaultValue: 'Send offers as lock-screen notifications to customers who have your card in Apple Wallet.' })}</p>
        </div>
        <button onClick={() => setChooser(true)}
          className="inline-flex items-center gap-2 bg-[#37352F] text-white px-5 py-3 rounded-xl text-sm font-medium hover:bg-[#2a2a28] transition">
          <Plus className="w-4 h-4" /> {t('dash.campaigns.start', { defaultValue: 'Start new campaign' })}
        </button>
      </div>

      {introVisible && (
        <section aria-label={t('dash.campaigns.intro.title', { defaultValue: 'How campaigns work' })}
          className="border border-blue-200 bg-blue-50/60 rounded-xl p-5 sm:p-6 mb-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base font-semibold text-[#37352F]">{t('dash.campaigns.intro.title', { defaultValue: 'How campaigns work' })}</h2>
              <p className="text-sm text-gray-600 mt-0.5">{t('dash.campaigns.intro.sub', { defaultValue: 'Bring customers back with a short message on their phone. It takes a minute.' })}</p>
            </div>
            <button onClick={() => onIntroDone?.()} className="text-xs font-medium text-blue-700 hover:text-blue-900 whitespace-nowrap">
              {t('dash.campaigns.intro.gotIt', { defaultValue: 'Got it' })}
            </button>
          </div>
          <ol className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            {([
              [MessageSquare, t('dash.campaigns.intro.s1t', { defaultValue: '1. Write your message' }), t('dash.campaigns.intro.s1b', { count: MAX_MESSAGE, defaultValue: 'Up to {{count}} characters, like an offer or a friendly reminder.' })],
              [Target, t('dash.campaigns.intro.s2t', { defaultValue: '2. Choose who gets it and when' }), t('dash.campaigns.intro.s2b', { defaultValue: 'Everyone, regulars who stopped coming, or customers close to a reward. Now or scheduled.' })],
              [Send, t('dash.campaigns.intro.s3t', { defaultValue: '3. It appears on their wallet card' }), t('dash.campaigns.intro.s3b', { defaultValue: 'It pops up on their lock screen, for customers who added your card to Apple Wallet.' })],
            ] as const).map(([Icon, title, body]) => (
              <li key={title} className="bg-white border border-blue-100 rounded-lg p-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#37352F]"><Icon className="w-4 h-4 text-blue-600" />{title}</div>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">{body}</p>
              </li>
            ))}
          </ol>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{t('dash.campaigns.intro.examples', { defaultValue: 'Or start from a ready-made example' })}</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {examples.map((ex) => (
              <div key={ex.key} className="bg-white border notion-border rounded-lg p-3 flex flex-col">
                <div className="text-sm font-semibold text-[#37352F]">{ex.name}</div>
                <p className="text-xs text-gray-600 mt-1 flex-1">“{ex.message}”</p>
                <p className="text-[11px] text-gray-400 mt-2">{t('dash.campaigns.intro.to', { defaultValue: 'To:' })} {segmentLabel(t, ex.segment)}</p>
                <button onClick={() => startFromExample(ex)}
                  className="mt-3 inline-flex items-center justify-center gap-1.5 bg-[#37352F] text-white text-xs font-medium px-3 py-2 rounded-lg hover:bg-[#2a2a28] transition">
                  {t('dash.campaigns.intro.use', { defaultValue: 'Use this example' })} <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {items === null ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
      ) : items.length === 0 ? (
        <div className="border notion-border rounded-xl py-14 px-6 text-center">
          <Megaphone className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="font-medium text-[#37352F]">{t('dash.campaigns.emptyTitle', { defaultValue: 'No campaigns yet' })}</p>
          <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">{t('dash.campaigns.emptyBody', { defaultValue: 'Send a one-off offer, or set up an automation that wins back customers who stopped coming.' })}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((c) => {
            const st = shownStatus(c);
            return (
              <div key={c.id} className="border notion-border rounded-xl p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[#F7F7F5] flex items-center justify-center shrink-0">
                    {c.kind === 'manual' ? <Send className="w-4 h-4 text-[#37352F]" /> : <Zap className="w-4 h-4 text-[#37352F]" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-[#37352F] truncate">{c.name}</span>
                      <span className="text-xs text-gray-400">
                        {c.kind === 'manual' ? t('dash.campaigns.manual', { defaultValue: 'Manual campaign' }) : t('dash.campaigns.automation', { defaultValue: 'Campaign automation' })}
                      </span>
                      <StatusBadge status={st} />
                    </div>
                    <p className="text-sm text-gray-600 mt-1 break-words">“{c.message}”</p>
                    <p className="text-xs text-gray-400 mt-1.5">
                      {c.kind === 'manual'
                        ? (c.segment ? segmentLabel(t, c.segment) : '')
                        : (c.triggerType ? triggerSummary(t, c.triggerType, c.triggerValue) : '')}
                      {' · '}{locationNames(c.locationIds)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatInZone(c.startsAt, c.timezone, i18n.language)}
                      {c.endsAt && <> – {formatInZone(c.endsAt, c.timezone, i18n.language)}</>}
                      {' · '}{t('dash.campaigns.sentTo', { count: c.sentCount, defaultValue: 'Sent to {{count}}' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {busyId === c.id && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                    {c.kind === 'automation' && c.status === 'active' && (
                      <button title={t('dash.campaigns.pause', { defaultValue: 'Pause' })} onClick={() => changeStatus(c, 'paused')}
                        className="p-2 rounded-lg text-gray-500 hover:bg-[#F7F7F5]"><Pause className="w-4 h-4" /></button>
                    )}
                    {c.kind === 'automation' && c.status === 'paused' && (
                      <button title={t('dash.campaigns.resume', { defaultValue: 'Resume' })} onClick={() => changeStatus(c, 'active')}
                        className="p-2 rounded-lg text-gray-500 hover:bg-[#F7F7F5]"><Play className="w-4 h-4" /></button>
                    )}
                    {c.kind === 'manual' && c.status === 'scheduled' && (
                      <button title={t('dash.campaigns.cancelSend', { defaultValue: 'Cancel sending' })} onClick={() => changeStatus(c, 'cancelled')}
                        className="p-2 rounded-lg text-gray-500 hover:bg-[#F7F7F5]"><Ban className="w-4 h-4" /></button>
                    )}
                    <button title={t('dash.campaigns.delete', { defaultValue: 'Delete' })} onClick={() => setPendingDelete(c)}
                      className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {chooser && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setChooser(false)} />
          <div className="relative bg-white rounded-2xl p-6 sm:p-7 max-w-xl w-full shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-[#37352F]"><Megaphone className="w-5 h-5" />{t('dash.campaigns.start', { defaultValue: 'Start new campaign' })}</h3>
              <button onClick={() => setChooser(false)} className="p-1 rounded-lg hover:bg-[#F7F7F5]"><X className="w-5 h-5" /></button>
            </div>
            {([
              ['manual', t('dash.campaigns.manual', { defaultValue: 'Manual campaign' }),
                t('dash.campaigns.manualDesc', { defaultValue: 'Write a message, choose your audience, and send it now or schedule it as a push notification.' })],
              ['automation', t('dash.campaigns.automation', { defaultValue: 'Campaign automation' }),
                t('dash.campaigns.automationDesc', { defaultValue: 'Pick a trigger, like customers who stopped visiting, and each one gets your message automatically.' })],
            ] as const).map(([kind, title, desc]) => (
              <button key={kind} onClick={() => { setChooser(false); setEditing(kind); }}
                className="w-full text-left border notion-border rounded-xl p-5 mb-3 last:mb-0 flex items-center gap-4 hover:border-gray-300 hover:bg-[#FBFBFA] transition">
                <div className="flex-1">
                  <div className="font-semibold text-[#37352F]">{title}</div>
                  <div className="text-sm text-gray-500 mt-1">{desc}</div>
                </div>
                <ArrowRight className="w-5 h-5 text-[#37352F] shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {pendingDelete && (
        <ConfirmDialog
          danger
          busy={busyId === pendingDelete.id}
          title={t('dash.campaigns.deleteTitle', { name: pendingDelete.name, defaultValue: 'Delete “{{name}}”?' })}
          body={t('dash.campaigns.deleteBody', { defaultValue: 'It stops right away and is removed from this list. Messages already sent stay on customers’ cards.' })}
          confirmLabel={t('dash.campaigns.delete', { defaultValue: 'Delete' })}
          onConfirm={doDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

// ---- Editor -------------------------------------------------------------------

/** Next half hour in `tz`, as the default "later" start. */
function nextSlot(tz: string): { date: string; time: string } {
  const { date, time } = nowInZone(tz);
  const [h, m] = time.split(':').map(Number);
  const mins = Math.ceil((h * 60 + m + 1) / 30) * 30;
  if (mins >= 24 * 60) return { date: addDays(date, 1), time: '00:00' };
  return { date, time: `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}` };
}

/** A ready-made campaign the editor opens with (the "How it works" examples). */
interface CampaignPreset { name: string; message: string; segment: Segment }

function CampaignEditor({ kind, campaignId, businessName, locations, defaultName, preset, onCancel, onDone }: {
  kind: CampaignKind; campaignId: string; businessName: string; locations: Location[]; defaultName: string;
  preset?: CampaignPreset | null;
  onCancel: () => void; onDone: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [name, setName] = useState(preset?.name ?? defaultName);
  const [message, setMessage] = useState(preset?.message ?? '');
  const [segment, setSegment] = useState<Segment>(preset?.segment ?? 'all');
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [triggerType, setTriggerType] = useState<TriggerType | ''>('');
  const [triggerValue, setTriggerValue] = useState<number | null>(null);
  const [timezone, setTimezone] = useState(browserTimeZone);
  const zones = useMemo(() => timeZoneOptions(), []);
  const initial = useMemo(() => nextSlot(browserTimeZone()), []);
  const [startMode, setStartMode] = useState<'now' | 'later'>('now');
  const [startDate, setStartDate] = useState(initial.date);
  const [startTime, setStartTime] = useState(initial.time);
  const [endDate, setEndDate] = useState(addDays(initial.date, kind === 'manual' ? 7 : MAX_CAMPAIGN_DAYS));
  const [endTime, setEndTime] = useState(initial.time);
  const [reach, setReach] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);

  const trigger = TRIGGERS.find((x) => x.type === triggerType) ?? null;

  // Live estimate, debounced while the audience is being tweaked.
  useEffect(() => {
    if (kind === 'automation' && !triggerType) { setReach(null); return; }
    let live = true;
    const h = setTimeout(() => {
      estimateReach({ campaignId, kind, segment, triggerType: triggerType || null, triggerValue, locationIds })
        .then((n) => { if (live) setReach(n); })
        .catch(() => { if (live) setReach(null); });
    }, 250);
    return () => { live = false; clearTimeout(h); };
  }, [campaignId, kind, segment, triggerType, triggerValue, locationIds]);

  const startAt = useMemo(
    () => (startMode === 'now' ? new Date() : zonedTimeToUtc(startDate, startTime, timezone)),
    [startMode, startDate, startTime, timezone],
  );
  const endAt = useMemo(() => zonedTimeToUtc(endDate, endTime, timezone), [endDate, endTime, timezone]);

  const trimmed = message.trim();
  const error = (() => {
    if (!name.trim()) return t('dash.campaigns.errName', { defaultValue: 'Give the campaign a name.' });
    if (!trimmed) return t('dash.campaigns.errMessage', { defaultValue: 'Write the push message.' });
    if (kind === 'automation' && !triggerType) return t('dash.campaigns.errTrigger', { defaultValue: 'Choose a trigger.' });
    if (startMode === 'later' && startAt.getTime() < Date.now() - 60_000) return t('dash.campaigns.errPast', { defaultValue: 'The start time is in the past.' });
    if (endAt.getTime() <= startAt.getTime()) return t('dash.campaigns.errEnd', { defaultValue: 'The end must be after the start.' });
    // Calendar days, like the date picker's max: "now" plus a 30-day default
    // end must not fail by the minutes since the next half-hour slot.
    const startDay = startMode === 'now' ? nowInZone(timezone).date : startDate;
    if (endDate > addDays(startDay, MAX_CAMPAIGN_DAYS)) return t('dash.campaigns.errLong', { count: MAX_CAMPAIGN_DAYS, defaultValue: 'A campaign can run for at most {{count}} days.' });
    return null;
  })();
  const nothingToSend = kind === 'manual' && startMode === 'now' && reach === 0;
  // Unfilled fields are a grey hint; red is for real conflicts (past, dates).
  const incomplete = !name.trim() || !trimmed || (kind === 'automation' && !triggerType);

  const submit = async () => {
    setSaving(true);
    try {
      const created = await createMarketingCampaign({
        campaignId, kind, name, message: trimmed, locationIds,
        segment, triggerType: triggerType || undefined, triggerValue: trigger?.unit ? triggerValue : null,
        timezone, startsAt: startMode === 'now' ? new Date() : startAt, endsAt: endAt,
      });
      if (startMode === 'now') {
        const n = await launchMarketingCampaign(created.id);
        toast.success(kind === 'manual'
          ? t('dash.campaigns.sentToast', { count: n, defaultValue: 'Sent to {{count}} customers' })
          : t('dash.campaigns.startedToast', { count: n, defaultValue: 'Automation started, {{count}} customers notified so far' }));
      } else {
        toast.success(t('dash.campaigns.scheduledToast', { when: formatInZone(startAt.toISOString(), timezone), defaultValue: 'Scheduled for {{when}}' }));
      }
      onDone();
    } catch {
      toast.error(t('dash.campaigns.saveErr', { defaultValue: "Couldn't save. Please try again." }));
    } finally {
      setSaving(false);
      setConfirmSend(false);
    }
  };

  const primaryLabel = kind === 'manual'
    ? (startMode === 'now' ? t('dash.campaigns.sendNow', { defaultValue: 'Send now' }) : t('dash.campaigns.schedule', { defaultValue: 'Schedule campaign' }))
    : (startMode === 'now' ? t('dash.campaigns.startAutomation', { defaultValue: 'Start automation' }) : t('dash.campaigns.scheduleAutomation', { defaultValue: 'Schedule automation' }));

  const reachBadge = (
    <span className="flex items-center gap-2 text-sm font-medium text-[#37352F]">
      {kind === 'manual' ? t('dash.campaigns.reach', { defaultValue: 'Estimated reach:' }) : t('dash.campaigns.matching', { defaultValue: 'Matching now:' })}
      <Users className="w-4 h-4" /> <span className="text-base font-semibold">{reach === null ? '—' : reach}</span>
    </span>
  );

  const offset = (() => {
    const found = zones.find((z) => z.value === timezone);
    return found ? found.label.slice(1, found.label.indexOf(')')) : '';
  })();

  return (
    <div className="max-w-6xl">
      <button onClick={onCancel} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#37352F] mb-4">
        <ArrowLeft className="w-4 h-4" /> {t('dash.campaigns.title', { defaultValue: 'Campaigns' })}
      </button>
      <h1 className="text-2xl font-semibold text-[#37352F] mb-1 break-words">{name.trim() || defaultName}</h1>
      <p className="text-gray-500 mb-6">
        {kind === 'manual' ? t('dash.campaigns.manual', { defaultValue: 'Manual campaign' }) : t('dash.campaigns.automation', { defaultValue: 'Campaign automation' })}
      </p>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_260px] gap-8 items-start">
        <div className="space-y-6 min-w-0">
          <Section icon={MessageSquare} title={t('dash.campaigns.info', { defaultValue: 'Campaign info' })}>
            <div>
              <label className={fieldLabel}>{t('dash.campaigns.name', { defaultValue: 'Campaign name' })}</label>
              <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={fieldLabel}>{t('dash.campaigns.message', { defaultValue: 'Push message text' })}</label>
              <textarea value={message} rows={3} onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE))}
                placeholder={t('dash.campaigns.messagePh', { defaultValue: 'e.g. 20% off all coffees today, show this at the till!' })}
                className={`${inputCls} resize-none`} />
              <div className="text-right text-xs text-gray-400 mt-1">{trimmed.length}/{MAX_MESSAGE}</div>
            </div>
          </Section>

          {kind === 'manual' ? (
            <Section icon={Target} title={t('dash.campaigns.audience', { defaultValue: 'Select audience' })} right={reachBadge}>
              <Note>{t('dash.campaigns.audienceNote', { defaultValue: 'Fine-tune who gets the notification by choosing store locations and a customer segment. Only customers with your card in Apple Wallet who agreed to marketing are included.' })}</Note>
              {locations.length > 0 && (
                <div>
                  <label className={fieldLabel}>{t('dash.campaigns.location', { defaultValue: 'Location' })}</label>
                  <LocationPicker locations={locations} value={locationIds} onChange={setLocationIds} />
                </div>
              )}
              <div>
                <label className={fieldLabel}>{t('dash.campaigns.segment', { defaultValue: 'Customer segment' })}</label>
                <select value={segment} onChange={(e) => setSegment(e.target.value as Segment)} className={inputCls}>
                  {SEGMENTS.map((s) => <option key={s} value={s}>{segmentLabel(t, s)}</option>)}
                </select>
              </div>
            </Section>
          ) : (
            <Section icon={Radio} title={t('dash.campaigns.trigger', { defaultValue: 'Select trigger' })} right={reachBadge}>
              <Note>{t('dash.campaigns.triggerNote', { defaultValue: 'Every few minutes, customers who meet the trigger get your message, once each, while the automation runs. Only customers with your card in Apple Wallet who agreed to marketing are included.' })}</Note>
              <div>
                <label className={fieldLabel}>{t('dash.campaigns.triggerLabel', { defaultValue: 'Trigger' })}</label>
                <select value={triggerType} className={inputCls}
                  onChange={(e) => {
                    const next = e.target.value as TriggerType | '';
                    setTriggerType(next);
                    setTriggerValue(TRIGGERS.find((x) => x.type === next)?.defaultValue ?? null);
                  }}>
                  <option value="" disabled>{t('dash.campaigns.triggerPh', { defaultValue: 'Select trigger' })}</option>
                  {TRIGGERS.map((x) => <option key={x.type} value={x.type}>{triggerName(t, x.type)}</option>)}
                </select>
              </div>
              {trigger?.unit && (
                <div>
                  <label className={fieldLabel}>{triggerValueLabel(t, trigger.type)}</label>
                  <div className="flex items-center gap-2">
                    <select value={triggerValue ?? trigger.defaultValue ?? ''} onChange={(e) => setTriggerValue(Number(e.target.value))} className={`${inputCls} w-32`}>
                      {trigger.options.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <span className="text-sm text-gray-500">{unitLabel(t, trigger.unit, trigger.type)}</span>
                  </div>
                </div>
              )}
              {locations.length > 0 && (
                <div>
                  <label className={fieldLabel}>{t('dash.campaigns.location', { defaultValue: 'Location' })}</label>
                  <LocationPicker locations={locations} value={locationIds} onChange={setLocationIds} />
                </div>
              )}
            </Section>
          )}

          <Section icon={CalendarDays} title={t('dash.campaigns.scheduleTitle', { defaultValue: 'Schedule campaign' })}>
            <Note>{t('dash.campaigns.scheduleNote', { offset, count: MAX_CAMPAIGN_DAYS, defaultValue: 'Times are in the selected time zone ({{offset}}). Start and end can be at most {{count}} days apart.' })}</Note>
            <div>
              <label className={fieldLabel}>{t('dash.campaigns.timezone', { defaultValue: 'Time zone' })}</label>
              <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={inputCls}>
                {zones.map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}
              </select>
            </div>
            <div>
              <label className={fieldLabel}>{kind === 'manual' ? t('dash.campaigns.whenSend', { defaultValue: 'When to send' }) : t('dash.campaigns.whenStart', { defaultValue: 'When to start' })}</label>
              <div className="inline-flex rounded-lg border notion-border p-0.5 bg-[#F7F7F5]">
                {(['now', 'later'] as const).map((m) => (
                  <button type="button" key={m} onClick={() => setStartMode(m)}
                    className={`px-4 py-1.5 rounded-md text-sm transition ${startMode === m ? 'bg-white shadow-sm font-medium text-[#37352F]' : 'text-gray-500'}`}>
                    {m === 'now' ? t('dash.campaigns.now', { defaultValue: 'Now' }) : t('dash.campaigns.later', { defaultValue: 'Pick a date' })}
                  </button>
                ))}
              </div>
            </div>
            {startMode === 'later' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={fieldLabel}>{t('dash.campaigns.startDate', { defaultValue: 'Start date' })}</label>
                  <input type="date" value={startDate} min={nowInZone(timezone).date}
                    onChange={(e) => { if (e.target.value) { setStartDate(e.target.value); if (endDate <= e.target.value) setEndDate(addDays(e.target.value, 1)); } }}
                    className={inputCls} />
                </div>
                <div>
                  <label className={fieldLabel}>{t('dash.campaigns.time', { defaultValue: 'Time' })}</label>
                  <select value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputCls}>
                    {TIME_SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={fieldLabel}>{kind === 'manual' ? t('dash.campaigns.endDateManual', { defaultValue: 'Offer valid until' }) : t('dash.campaigns.endDate', { defaultValue: 'End date' })}</label>
                <input type="date" value={endDate}
                  min={startMode === 'now' ? nowInZone(timezone).date : startDate}
                  max={addDays(startMode === 'now' ? nowInZone(timezone).date : startDate, MAX_CAMPAIGN_DAYS)}
                  onChange={(e) => e.target.value && setEndDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={fieldLabel}>{t('dash.campaigns.time', { defaultValue: 'Time' })}</label>
                <select value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputCls}>
                  {TIME_SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </Section>

          <div className="flex items-center justify-end gap-3 flex-wrap pb-4">
            {(error || nothingToSend) && (
              <p className={`text-sm mr-auto ${incomplete ? 'text-gray-500' : 'text-red-600'}`}>
                {error ?? t('dash.campaigns.errNobody', { defaultValue: 'Nobody in this audience can receive it yet.' })}
              </p>
            )}
            <button onClick={onCancel} className="px-4 py-2.5 rounded-lg text-sm text-gray-600 hover:bg-[#F7F7F5] transition">
              {t('dash.campaigns.cancel', { defaultValue: 'Cancel' })}
            </button>
            <button disabled={!!error || nothingToSend || saving}
              onClick={() => (kind === 'manual' && startMode === 'now' ? setConfirmSend(true) : void submit())}
              className="inline-flex items-center gap-2 bg-[#37352F] text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-[#2a2a28] disabled:opacity-40 disabled:cursor-not-allowed transition">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : kind === 'manual' ? <Send className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
              {primaryLabel}
            </button>
          </div>
        </div>

        <div className="lg:sticky lg:top-6">
          <PhonePreview businessName={businessName} message={message} />
        </div>
      </div>

      {confirmSend && (
        <ConfirmDialog
          busy={saving}
          title={t('dash.campaigns.confirmTitle', { count: reach ?? 0, defaultValue: 'Send this campaign to {{count}} customers?' })}
          body={t('dash.campaigns.confirmBody', { defaultValue: "They'll get a lock-screen notification now. This can't be undone." })}
          confirmLabel={t('dash.campaigns.sendNow', { defaultValue: 'Send now' })}
          onConfirm={() => void submit()}
          onCancel={() => setConfirmSend(false)}
        />
      )}
    </div>
  );
}
