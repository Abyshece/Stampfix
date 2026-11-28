import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Ticket, Pencil, Pause, Play, Trash2, ExternalLink, Loader2, ArrowLeft, AlertTriangle, EyeOff, ChevronDown, ChevronRight } from 'lucide-react';
import type { Campaign, Location } from '../types';
import { useToast } from './ToastProvider';
import { Dialog, inputCls, btnDark, btnLight } from './addonsUi';
import { DealCard } from './DealCard';
import {
  DEAL_CATEGORIES, DEAL_TYPES, listMyDeals, saveDeal, setDealStatus, deleteDeal, dealErrorCode, dealBadge, dateRange,
  minutesToTime, toLocalInput, cityFromAddress, browserTimeZone,
  type Deal, type DealDraft, type DealCurrency, type DealState,
} from '../lib/deals';

const STATE_STYLE: Record<DealState, string> = {
  live: 'bg-green-50 text-green-700 border-green-200',
  scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  paused: 'bg-gray-100 text-gray-600 border-gray-200',
  ended: 'bg-gray-50 text-gray-400 border-gray-200',
  hidden: 'bg-red-50 text-red-700 border-red-200',
};

const defaultCurrency = (country: string | null): DealCurrency => (country === 'DE' ? 'EUR' : country === 'CA' ? 'CAD' : 'USD');
const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 0, 0); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

/**
 * Dashboard > Deals. The shop's deals, and a form to add or change one.
 * Deals show on stampfix.app/deals from their start until their end.
 */
export function DealsPanel({ campaign, country, locations }: { campaign: Campaign; country: string | null; locations: Location[] }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const lang = i18n.language?.startsWith('de') ? 'de-DE' : 'en-GB';
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [draft, setDraft] = useState<DealDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Deal | null>(null);
  const [showEnded, setShowEnded] = useState(false);
  const activeLocations = useMemo(() => locations.filter((l) => !l.archived), [locations]);

  const load = async () => {
    setLoadError(false);
    try { setDeals(await listMyDeals(campaign.id)); } catch { setLoadError(true); setDeals([]); }
  };
  useEffect(() => { void load(); }, [campaign.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const newDraft = (): DealDraft => {
    const last = deals?.[0];
    const now = new Date();
    return {
      title: '', deal_type: 'percent', value: '', currency: defaultCurrency(country), description: '', code: '', terms: '',
      category: last?.category ?? '', city: last?.city ?? cityFromAddress(activeLocations[0]?.address), location_id: '',
      starts_at: toLocalInput(now), ends_at: toLocalInput(endOfDay(addDays(now, 14))), days: [], hours: false,
      start_time: '15:00', end_time: '18:00', status: 'active',
    };
  };
  const fromDeal = (d: Deal): DealDraft => ({
    id: d.id, title: d.title, deal_type: d.deal_type, value: d.value == null ? '' : String(Number(d.value)),
    currency: d.currency ?? defaultCurrency(country), description: d.description ?? '', code: d.code ?? '', terms: d.terms ?? '',
    category: d.category, city: d.city, location_id: d.location_id ?? '',
    starts_at: toLocalInput(new Date(d.starts_at)), ends_at: toLocalInput(new Date(d.ends_at)), days: d.days ?? [],
    hours: d.start_minute != null, start_time: minutesToTime(d.start_minute) || '15:00', end_time: minutesToTime(d.end_minute) || '18:00',
    status: d.status ?? 'active',
  });

  const errorText = (code: string | null): string => {
    switch (code) {
      case 'deal_title': return t('deals.err.title', { defaultValue: 'Give the deal a title (3 to 80 characters).' });
      case 'deal_value': return t('deals.err.value', { defaultValue: 'Enter the value: 1 to 100 for a percentage, or an amount above 0.' });
      case 'deal_code': return t('deals.err.code', { defaultValue: 'A code uses letters, numbers, - or _ (2 to 30 characters).' });
      case 'deal_category': return t('deals.err.category', { defaultValue: 'Pick your business type.' });
      case 'deal_city': return t('deals.err.city', { defaultValue: 'Enter the city the deal is in.' });
      case 'deal_dates': return t('deals.err.dates', { defaultValue: 'Check the dates: the end must be after the start, in the future, and within a year.' });
      case 'deal_days': return t('deals.err.days', { defaultValue: 'Pick the days again.' });
      case 'deal_hours': return t('deals.err.hours', { defaultValue: 'Check the hours: "from" and "until" must be different times.' });
      case 'deal_location': return t('deals.err.location', { defaultValue: 'Pick the branch again.' });
      case 'deal_limit': return t('deals.err.limit', { defaultValue: 'You can have up to 25 deals that have not ended. Delete or end one first.' });
      case 'deal_description': return t('deals.err.description', { defaultValue: 'The description can be up to 500 characters.' });
      case 'deal_terms': return t('deals.err.terms', { defaultValue: 'The fine print can be up to 300 characters.' });
      default: return t('deals.err.save', { defaultValue: 'Could not save the deal. Try again.' });
    }
  };

  const submit = async () => {
    if (!draft) return;
    setSaving(true); setFormError(null);
    try {
      const saved = await saveDeal(campaign.id, draft);
      setDeals((list) => [saved, ...(list ?? []).filter((d) => d.id !== saved.id)]);
      toast.success(draft.id ? t('deals.toast.saved', { defaultValue: 'Deal saved.' }) : t('deals.toast.created', { defaultValue: 'Deal created.' }));
      setDraft(null);
      void load();
    } catch (e) {
      setFormError(errorText(dealErrorCode(e)));
    } finally { setSaving(false); }
  };

  const toggle = async (d: Deal) => {
    setBusy(d.id);
    try {
      const next = await setDealStatus(d.id, d.status === 'paused' ? 'active' : 'paused');
      setDeals((list) => (list ?? []).map((x) => (x.id === next.id ? next : x)));
    } catch { toast.error(t('deals.err.save', { defaultValue: 'Could not save the deal. Try again.' })); }
    finally { setBusy(null); }
  };

  const remove = async (d: Deal) => {
    setBusy(d.id);
    try { await deleteDeal(d.id); setDeals((list) => (list ?? []).filter((x) => x.id !== d.id)); toast.success(t('deals.toast.deleted', { defaultValue: 'Deal deleted.' })); }
    catch { toast.error(t('deals.err.delete', { defaultValue: 'Could not delete the deal. Try again.' })); }
    finally { setBusy(null); setConfirmDelete(null); }
  };

  if (draft) {
    return <DealForm draft={draft} setDraft={(d) => { setDraft(d); setFormError(null); }} campaign={campaign} country={country} locations={activeLocations}
      saving={saving} error={formError} onCancel={() => { setDraft(null); setFormError(null); }} onSave={() => void submit()} />;
  }

  const current = (deals ?? []).filter((d) => d.state !== 'ended');
  const ended = (deals ?? []).filter((d) => d.state === 'ended');
  const stateLabel = (s: DealState) => t(`deals.state.${s}`, { defaultValue: { live: 'Live', scheduled: 'Scheduled', paused: 'Paused', ended: 'Ended', hidden: 'Hidden by Stampfix' }[s] });

  const row = (d: Deal) => {
    const { from, to } = dateRange(d.starts_at, d.ends_at, lang);
    const badge = dealBadge(d, t as unknown as (k: string, o: Record<string, unknown>) => string);
    return (
      <li key={d.id} className="flex items-start gap-3 px-4 py-3.5" data-deal-row={d.title}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[11px] font-semibold border rounded-full px-2 py-0.5 ${STATE_STYLE[d.state ?? 'live']}`} data-deal-state={d.state}>
              {d.state === 'live' && d.live_now ? t('deals.state.liveNow', { defaultValue: 'On now' }) : stateLabel(d.state ?? 'live')}
            </span>
            {badge && <span className="text-xs font-semibold text-[#37352F]">{badge}</span>}
          </div>
          <div className="font-medium text-[#37352F] mt-1 break-words">{d.title}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {t('deals.card.dates', { defaultValue: '{{from}} to {{to}}', from, to })} · {d.city}{d.code ? ` · ${d.code}` : ''}
          </div>
          {d.state === 'hidden' && (
            <p className="text-xs text-red-700 mt-1 flex items-start gap-1"><EyeOff className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              {t('deals.hiddenNote', { defaultValue: 'Stampfix took this deal off the deals page.' })}{d.hidden_reason ? ` ${d.hidden_reason}` : ''} {t('deals.hiddenContact', { defaultValue: 'Questions? Email hello@stampfix.app.' })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {d.state !== 'ended' && (
            <button type="button" className="p-2 rounded-md hover:bg-[#F7F7F5] text-gray-500" disabled={busy === d.id} onClick={() => void toggle(d)}
              aria-label={d.status === 'paused' ? t('deals.resume', { defaultValue: 'Resume' }) : t('deals.pause', { defaultValue: 'Pause' })}
              title={d.status === 'paused' ? t('deals.resume', { defaultValue: 'Resume' }) : t('deals.pause', { defaultValue: 'Pause' })}>
              {d.status === 'paused' ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </button>
          )}
          <button type="button" className="p-2 rounded-md hover:bg-[#F7F7F5] text-gray-500" onClick={() => setDraft(fromDeal(d))}
            aria-label={t('deals.edit', { defaultValue: 'Edit' })} title={t('deals.edit', { defaultValue: 'Edit' })} data-deal-edit><Pencil className="w-4 h-4" /></button>
          <button type="button" className="p-2 rounded-md hover:bg-red-50 text-gray-500 hover:text-red-600" disabled={busy === d.id} onClick={() => setConfirmDelete(d)}
            aria-label={t('deals.delete', { defaultValue: 'Delete' })} title={t('deals.delete', { defaultValue: 'Delete' })}><Trash2 className="w-4 h-4" /></button>
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-6" data-deals-panel>
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-serif-display font-semibold text-[#37352F]">{t('deals.title', { defaultValue: 'Deals' })}</h1>
          <p className="text-gray-500 text-sm md:text-base mt-1 max-w-2xl">
            {t('deals.sub', { defaultValue: 'List your deals on the Stampfix deals page, where people find offers by city and business type. Free on every plan.' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/deals" target="_blank" rel="noopener noreferrer" className={btnLight}><ExternalLink className="w-4 h-4" /> {t('deals.seePage', { defaultValue: 'See the deals page' })}</a>
          <button type="button" className={btnDark} onClick={() => setDraft(newDraft())} data-deal-new><Plus className="w-4 h-4" /> {t('deals.new', { defaultValue: 'New deal' })}</button>
        </div>
      </header>

      {campaign.approvalStatus && campaign.approvalStatus !== 'approved' && (
        <p className="flex gap-2 text-sm bg-amber-50 text-amber-900 border border-amber-200 rounded-lg px-3 py-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {t('deals.notApproved', { defaultValue: 'You can create deals now. They show on the deals page once your shop is approved.' })}
        </p>
      )}
      {loadError && <p role="alert" className="text-sm bg-red-50 text-red-700 border border-red-200 rounded-lg px-3 py-2">{t('deals.err.load', { defaultValue: 'Could not load your deals.' })} <button type="button" className="underline" onClick={() => void load()}>{t('deals.retry', { defaultValue: 'Try again' })}</button></p>}

      {deals === null ? (
        <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
      ) : deals.length === 0 ? (
        <div className="rounded-2xl border notion-border bg-white p-8 md:p-12 text-center" data-deals-empty>
          <div className="w-12 h-12 rounded-2xl bg-[#F7F7F5] mx-auto flex items-center justify-center mb-4"><Ticket className="w-6 h-6 text-[#37352F]" /></div>
          <h2 className="font-semibold text-lg text-[#37352F]">{t('deals.emptyTitle', { defaultValue: 'No deals yet' })}</h2>
          <p className="text-gray-500 text-sm mt-1 max-w-md mx-auto">{t('deals.emptyBody', { defaultValue: 'A 2 for 1, a happy hour, 20% off your first visit: create a deal and new customers nearby can find it on the deals page.' })}</p>
          <button type="button" className={`${btnDark} mt-5`} onClick={() => setDraft(newDraft())}><Plus className="w-4 h-4" /> {t('deals.createFirst', { defaultValue: 'Create your first deal' })}</button>
        </div>
      ) : (
        <>
          {current.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{t('deals.current', { defaultValue: 'Live and coming up' })}</h2>
              <ul className="rounded-xl border notion-border bg-white divide-y divide-gray-100">{current.map(row)}</ul>
            </section>
          )}
          {ended.length > 0 && (
            <section>
              <button type="button" onClick={() => setShowEnded((v) => !v)} className="flex items-center gap-1 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2" aria-expanded={showEnded}>
                {showEnded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}{t('deals.ended', { defaultValue: 'Ended ({{n}})', n: ended.length })}
              </button>
              {showEnded && <ul className="rounded-xl border notion-border bg-white divide-y divide-gray-100">{ended.map(row)}</ul>}
            </section>
          )}
        </>
      )}

      {confirmDelete && (
        <Dialog title={t('deals.deleteTitle', { defaultValue: 'Delete this deal?' })} onClose={() => setConfirmDelete(null)}>
          <p className="px-5 text-sm text-gray-600">{t('deals.deleteBody', { defaultValue: '“{{title}}” disappears from the deals page right away. This cannot be undone.', title: confirmDelete.title })}</p>
          <div className="flex justify-end gap-2 px-5 py-4 mt-5 border-t notion-border">
            <button type="button" className={btnLight} onClick={() => setConfirmDelete(null)}>{t('deals.cancel', { defaultValue: 'Cancel' })}</button>
            <button type="button" className={`${btnDark} !bg-red-600 hover:!bg-red-700`} disabled={busy === confirmDelete.id} onClick={() => void remove(confirmDelete)} data-deal-confirm-delete>
              {busy === confirmDelete.id && <Loader2 className="w-4 h-4 animate-spin" />} {t('deals.delete', { defaultValue: 'Delete' })}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

// ---- The form -------------------------------------------------------------------------

function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <p className="text-[11px] text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border notion-border bg-white p-4 sm:p-5 space-y-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-[#37352F]">
        <span className="w-5 h-5 rounded-full bg-[#37352F] text-white text-[11px] flex items-center justify-center">{n}</span>{title}
      </h2>
      {children}
    </section>
  );
}

function DealForm({ draft, setDraft, campaign, country, locations, saving, error, onCancel, onSave }: {
  draft: DealDraft; setDraft: (d: DealDraft) => void; campaign: Campaign; country: string | null; locations: Location[];
  saving: boolean; error: string | null; onCancel: () => void; onSave: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('de') ? 'de-DE' : 'en-GB';
  const set = <K extends keyof DealDraft>(k: K, v: DealDraft[K]) => setDraft({ ...draft, [k]: v });
  const typeLabel: Record<string, string> = {
    percent: t('deals.type.percent', { defaultValue: '% off' }), amount: t('deals.type.amount', { defaultValue: 'Amount off' }),
    free: t('deals.type.free', { defaultValue: 'Free item' }), bogo: t('deals.type.bogo', { defaultValue: '2 for 1' }), other: t('deals.type.other', { defaultValue: 'Other' }),
  };
  const placeholder: Record<string, string> = {
    percent: t('deals.ph.percent', { defaultValue: '20% off every haircut' }), amount: t('deals.ph.amount', { defaultValue: '10 off your first visit' }),
    free: t('deals.ph.free', { defaultValue: 'Free coffee with any pastry' }), bogo: t('deals.ph.bogo', { defaultValue: '2 for 1 on all smoothies' }), other: t('deals.ph.other', { defaultValue: 'Happy hour every Friday' }),
  };
  const weekday = new Intl.DateTimeFormat(lang, { weekday: 'short' });
  const setEnd = (days: number) => {
    const start = new Date(draft.starts_at || Date.now());
    const end = new Date(start); end.setDate(end.getDate() + days); end.setHours(23, 59, 0, 0);
    set('ends_at', toLocalInput(end));
  };
  const hasValue = draft.deal_type === 'percent' || draft.deal_type === 'amount';

  // What the card will look like on the deals page.
  const preview: Deal = {
    id: 'preview', title: draft.title.trim() || placeholder[draft.deal_type], deal_type: draft.deal_type,
    value: hasValue && draft.value ? Number(draft.value.replace(',', '.')) || null : null, currency: draft.deal_type === 'amount' ? draft.currency : null,
    description: draft.description.trim() || null, code: draft.code.trim().toUpperCase().replace(/\s+/g, '') || null, terms: draft.terms.trim() || null,
    category: (draft.category || 'other') as Deal['category'], city: draft.city.trim() || t('deals.form.cityPh', { defaultValue: 'Your city' }), country,
    starts_at: new Date(draft.starts_at || Date.now()).toISOString(), ends_at: new Date(draft.ends_at || Date.now()).toISOString(),
    days: draft.days, start_minute: null, end_minute: null, timezone: browserTimeZone(), live_now: false,
    location: draft.location_id ? (() => { const l = locations.find((x) => x.id === draft.location_id); return l ? { id: l.id, name: l.name, address: l.address ?? null } : null; })() : null,
    business: { name: campaign.businessName, logo_image: campaign.logoImage ?? null, logo_text: campaign.logoText, color: campaign.primaryColor, text_color: campaign.cardTextColor ?? null, link: '#' },
  };
  if (draft.hours) {
    const [sh, sm] = draft.start_time.split(':').map(Number), [eh, em] = draft.end_time.split(':').map(Number);
    preview.start_minute = sh * 60 + sm; preview.end_minute = eh * 60 + em;
  }

  return (
    <div className="space-y-5" data-deal-form>
      <button type="button" onClick={onCancel} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#37352F]"><ArrowLeft className="w-4 h-4" /> {t('deals.back', { defaultValue: 'All deals' })}</button>
      <h1 className="text-2xl md:text-3xl font-serif-display font-semibold text-[#37352F]">{draft.id ? t('deals.editTitle', { defaultValue: 'Edit deal' }) : t('deals.newTitle', { defaultValue: 'New deal' })}</h1>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
        <div className="space-y-4 min-w-0">
          <Step n={1} title={t('deals.form.s1', { defaultValue: 'The deal' })}>
            <Field label={t('deals.form.type', { defaultValue: 'Kind of deal' })}>
              <div className="flex flex-wrap gap-2" role="group">
                {DEAL_TYPES.map((k) => (
                  <button key={k} type="button" aria-pressed={draft.deal_type === k} onClick={() => set('deal_type', k)} data-deal-type={k}
                    className={`px-3 py-1.5 rounded-lg border text-sm transition ${draft.deal_type === k ? 'border-[#37352F] bg-[#37352F] text-white' : 'notion-border bg-white text-gray-600 hover:bg-[#F7F7F5]'}`}>
                    {typeLabel[k]}
                  </button>
                ))}
              </div>
            </Field>
            {hasValue && (
              <Field label={draft.deal_type === 'percent' ? t('deals.form.percent', { defaultValue: 'Percent off' }) : t('deals.form.amount', { defaultValue: 'Amount off' })} htmlFor="deal-value">
                <div className="flex items-center gap-2 max-w-xs">
                  {draft.deal_type === 'amount' && (
                    <select className={`${inputCls} !w-24`} value={draft.currency} onChange={(e) => set('currency', e.target.value as DealCurrency)} aria-label={t('deals.form.currency', { defaultValue: 'Currency' })}>
                      {(['CAD', 'EUR', 'USD'] as const).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )}
                  <input id="deal-value" className={inputCls} inputMode="decimal" value={draft.value} onChange={(e) => set('value', e.target.value)}
                    placeholder={draft.deal_type === 'percent' ? '20' : '10'} />
                  {draft.deal_type === 'percent' && <span className="text-gray-500">%</span>}
                </div>
              </Field>
            )}
            <Field label={t('deals.form.title', { defaultValue: 'Title' })} htmlFor="deal-title" hint={t('deals.form.titleHint', { defaultValue: 'Short and clear. This is the big line on the card.' })}>
              <input id="deal-title" className={inputCls} maxLength={80} value={draft.title} onChange={(e) => set('title', e.target.value)} placeholder={placeholder[draft.deal_type]} />
            </Field>
            <Field label={t('deals.form.description', { defaultValue: 'Description (optional)' })} htmlFor="deal-desc">
              <textarea id="deal-desc" className={`${inputCls} font-[inherit]`} rows={3} maxLength={500} value={draft.description} onChange={(e) => set('description', e.target.value)}
                placeholder={t('deals.form.descriptionPh', { defaultValue: 'What is included, and anything people should know.' })} />
            </Field>
          </Step>

          <Step n={2} title={t('deals.form.s2', { defaultValue: 'When' })}>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label={t('deals.form.starts', { defaultValue: 'Starts' })} htmlFor="deal-starts" hint={t('deals.form.startsHint', { defaultValue: 'It goes live on the deals page at this time.' })}>
                <input id="deal-starts" type="datetime-local" className={inputCls} value={draft.starts_at} onChange={(e) => set('starts_at', e.target.value)} />
              </Field>
              <Field label={t('deals.form.ends', { defaultValue: 'Ends' })} htmlFor="deal-ends">
                <input id="deal-ends" type="datetime-local" className={inputCls} value={draft.ends_at} onChange={(e) => set('ends_at', e.target.value)} />
                <div className="flex gap-1.5 mt-1.5 flex-wrap">
                  {[[7, t('deals.form.week1', { defaultValue: '1 week' })], [14, t('deals.form.week2', { defaultValue: '2 weeks' })], [30, t('deals.form.month1', { defaultValue: '1 month' })], [90, t('deals.form.month3', { defaultValue: '3 months' })]].map(([n, l]) => (
                    <button key={String(n)} type="button" onClick={() => setEnd(Number(n))} className="text-[11px] rounded-full border notion-border px-2 py-0.5 text-gray-600 hover:bg-[#F7F7F5]">{l}</button>
                  ))}
                </div>
              </Field>
            </div>
            <Field label={t('deals.form.days', { defaultValue: 'Days' })} hint={t('deals.form.daysHint', { defaultValue: 'Leave all off for every day.' })}>
              <div className="flex flex-wrap gap-1.5" role="group">
                {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                  const on = draft.days.includes(d);
                  return (
                    <button key={d} type="button" aria-pressed={on} data-deal-day={d}
                      onClick={() => set('days', on ? draft.days.filter((x) => x !== d) : [...draft.days, d].sort((a, b) => a - b))}
                      className={`w-11 py-1.5 rounded-lg border text-xs font-medium ${on ? 'border-[#37352F] bg-[#37352F] text-white' : 'notion-border bg-white text-gray-600 hover:bg-[#F7F7F5]'}`}>
                      {weekday.format(new Date(Date.UTC(2024, 0, d, 12)))}
                    </button>
                  );
                })}
              </div>
            </Field>
            <div>
              <label className="inline-flex items-center gap-2 text-sm text-[#37352F]">
                <input type="checkbox" checked={draft.hours} onChange={(e) => set('hours', e.target.checked)} data-deal-hours />
                {t('deals.form.hours', { defaultValue: 'Only at certain hours (for example a happy hour)' })}
              </label>
              {draft.hours && (
                <div className="flex items-center gap-2 mt-2">
                  <input type="time" className={`${inputCls} !w-32`} value={draft.start_time} onChange={(e) => set('start_time', e.target.value)} aria-label={t('deals.form.from', { defaultValue: 'From' })} />
                  <span className="text-gray-500 text-sm">{t('deals.form.until', { defaultValue: 'until' })}</span>
                  <input type="time" className={`${inputCls} !w-32`} value={draft.end_time} onChange={(e) => set('end_time', e.target.value)} aria-label={t('deals.form.until', { defaultValue: 'until' })} />
                </div>
              )}
            </div>
          </Step>

          <Step n={3} title={t('deals.form.s3', { defaultValue: 'Where' })}>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label={t('deals.form.category', { defaultValue: 'Business type' })} htmlFor="deal-cat" hint={t('deals.form.categoryHint', { defaultValue: 'People filter the deals page by this.' })}>
                <select id="deal-cat" className={inputCls} value={draft.category} onChange={(e) => set('category', e.target.value as DealDraft['category'])}>
                  <option value="">{t('deals.form.pick', { defaultValue: 'Pick one' })}</option>
                  {DEAL_CATEGORIES.map((c) => <option key={c} value={c}>{t(`industries.${c}`, { defaultValue: c === 'other' ? 'Other' : c })}</option>)}
                </select>
              </Field>
              <Field label={t('deals.form.city', { defaultValue: 'City' })} htmlFor="deal-city">
                <input id="deal-city" className={inputCls} maxLength={60} value={draft.city} onChange={(e) => set('city', e.target.value)} placeholder={t('deals.form.cityPh', { defaultValue: 'Your city' })} />
              </Field>
            </div>
            {locations.length > 0 && (
              <Field label={t('deals.form.branch', { defaultValue: 'Branch' })} htmlFor="deal-branch">
                <select id="deal-branch" className={inputCls} value={draft.location_id} onChange={(e) => set('location_id', e.target.value)}>
                  <option value="">{locations.length > 1 ? t('deals.form.allBranches', { defaultValue: 'All branches' }) : t('deals.form.noAddress', { defaultValue: 'Do not show an address' })}</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}{l.address ? ` · ${l.address}` : ''}</option>)}
                </select>
              </Field>
            )}
          </Step>

          <Step n={4} title={t('deals.form.s4', { defaultValue: 'Extras (optional)' })}>
            <Field label={t('deals.form.code', { defaultValue: 'Promo code' })} htmlFor="deal-code" hint={t('deals.form.codeHint', { defaultValue: 'Customers show this code at your counter or use it online.' })}>
              <input id="deal-code" className={`${inputCls} uppercase font-mono max-w-xs`} maxLength={30} value={draft.code} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="WINTER20" />
            </Field>
            <Field label={t('deals.form.terms', { defaultValue: 'Fine print' })} htmlFor="deal-terms">
              <textarea id="deal-terms" className={`${inputCls} font-[inherit]`} rows={2} maxLength={300} value={draft.terms} onChange={(e) => set('terms', e.target.value)}
                placeholder={t('deals.form.termsPh', { defaultValue: 'One per customer. Not with other offers.' })} />
            </Field>
          </Step>

          <section className="rounded-xl border notion-border bg-white p-4 sm:p-5 flex items-center justify-between gap-4 flex-wrap">
            <label className="inline-flex items-start gap-2 text-sm text-[#37352F]">
              <input type="checkbox" className="mt-0.5" checked={draft.status === 'active'} onChange={(e) => set('status', e.target.checked ? 'active' : 'paused')} data-deal-publish />
              <span><span className="font-medium">{t('deals.form.publish', { defaultValue: 'Show on the deals page' })}</span>
                <span className="block text-xs text-gray-500">{t('deals.form.publishHint', { defaultValue: 'Untick to save it paused, and switch it on later.' })}</span></span>
            </label>
            <div className="flex items-center gap-2 ml-auto">
              <button type="button" className={btnLight} onClick={onCancel} disabled={saving}>{t('deals.cancel', { defaultValue: 'Cancel' })}</button>
              <button type="button" className={btnDark} onClick={onSave} disabled={saving} data-deal-save>
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} {draft.id ? t('deals.form.save', { defaultValue: 'Save deal' }) : t('deals.form.create', { defaultValue: 'Create deal' })}
              </button>
            </div>
            {error && <p role="alert" className="w-full text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" data-deal-error>{error}</p>}
          </section>
        </div>

        <aside className="lg:sticky lg:top-6 space-y-2">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('deals.form.preview', { defaultValue: 'Preview on the deals page' })}</div>
          <DealCard deal={preview} preview />
        </aside>
      </div>
    </div>
  );
}
