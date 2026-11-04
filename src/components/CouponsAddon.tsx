import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Ticket, Plus, Pencil, Trash2, Copy, ChevronLeft, Loader2, RefreshCw, UtensilsCrossed, Wallet, Smartphone, Info,
} from 'lucide-react';
import { useToast } from './ToastProvider';
import { inputCls, btnDark, btnLight, parsePrice, ConfirmDialog, Dialog, Switch, ActionMenu } from './addonsUi';
import {
  listCoupons, createCoupon, updateCoupon, deleteCoupon, couponUsage, getOrderingSettings,
  menuMoney, menuCurrency, couponValueLabel, cleanCouponCode, randomCouponCode, COUPON_CODE,
  type Coupon, type CouponInput, type CouponKind, type CouponUse, type CouponSaveError,
} from '../lib/ordering';

// Coupons add-on (dashboard). A shop creates discount codes; guests use them
// on the digital menu (tap one shown on the menu, or type the code at
// checkout). There is no online payment: the order shows the code and the
// discount, and staff charge the lower total at the counter.

/** Today in the shop's time zone (YYYY-MM-DD). Coupon days are inclusive, like on the server. */
export function shopToday(country: string | null): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: country === 'CA' ? 'America/Toronto' : 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}
function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function dayLabel(day: string, lang: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString(lang.startsWith('de') ? 'de-DE' : 'en-CA', { day: 'numeric', month: 'short', year: 'numeric' });
}

export type CouponState = 'live' | 'scheduled' | 'paused' | 'expired' | 'used_up';
export function couponState(c: Pick<Coupon, 'active' | 'startsOn' | 'endsOn' | 'maxUses'>, uses: number, today: string): CouponState {
  if (!c.active) return 'paused';
  if (c.endsOn && today > c.endsOn) return 'expired';
  if (c.maxUses != null && uses >= c.maxUses) return 'used_up';
  if (c.startsOn && today < c.startsOn) return 'scheduled';
  return 'live';
}

export function CouponsAddon({ campaignId, country, onBack, onOpenMenu }: {
  campaignId: string; country: string | null; onBack: () => void; onOpenMenu: () => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const money = useMemo(() => menuMoney(country, i18n.language), [country, i18n.language]);
  const label = (c: { kind: CouponKind; value: number }) => couponValueLabel(c, country, i18n.language);
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [usage, setUsage] = useState<Record<string, CouponUse>>({});
  const [orderingOn, setOrderingOn] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ coupon?: Coupon; draft?: Partial<CouponInput> } | null>(null);
  const [deleting, setDeleting] = useState<Coupon | null>(null);
  const today = shopToday(country);

  const reload = useCallback(async () => {
    const [list, use] = await Promise.all([listCoupons(campaignId), couponUsage(campaignId).catch(() => ({} as Record<string, CouponUse>))]);
    setCoupons(list);
    setUsage(use);
  }, [campaignId]);

  useEffect(() => {
    let live = true;
    reload().catch(() => { if (live) setLoadError(true); });
    getOrderingSettings(campaignId).then((s) => { if (live) setOrderingOn(s.enabled); }).catch(() => { /* no hint then */ });
    return () => { live = false; };
  }, [campaignId, reload]);

  const saveErr = () => toast.error(t('dash.addons.saveErr', { defaultValue: "Couldn't save. Please try again." }));

  const save = async (input: CouponInput, id?: string): Promise<CouponSaveError | null> => {
    try {
      if (id) await updateCoupon(id, input);
      else await createCoupon(campaignId, input);
    } catch (e) {
      return (e as { code?: CouponSaveError }).code ?? 'unknown';
    }
    await reload().catch(() => { /* the list refreshes next time */ });
    toast.success(id ? t('dash.coupons.saved', { defaultValue: 'Coupon saved' }) : t('dash.coupons.created', { defaultValue: 'Coupon created' }));
    return null;
  };

  const patch = async (c: Coupon, p: Partial<CouponInput>) => {
    setBusyId(c.id);
    setCoupons((list) => list?.map((x) => (x.id === c.id ? { ...x, ...p } : x)) ?? list);
    try {
      await updateCoupon(c.id, p);
    } catch {
      saveErr();
    } finally {
      await reload().catch(() => { /* keep what we have */ });
      setBusyId(null);
    }
  };

  const remove = async (c: Coupon) => {
    setBusyId(c.id);
    try {
      await deleteCoupon(c.id);
      await reload().catch(() => { /* keep what we have */ });
      toast.success(t('dash.coupons.deleted', { defaultValue: 'Coupon deleted' }));
      setDeleting(null);
      setDialog(null);
    } catch {
      saveErr();
    } finally {
      setBusyId(null);
    }
  };

  const copy = (code: string) => {
    void navigator.clipboard?.writeText(code)
      .then(() => toast.success(t('dash.coupons.copied', { code, defaultValue: 'Copied {{code}}' })))
      .catch(() => toast.error(t('dash.coupons.copyErr', { defaultValue: "Couldn't copy. Please copy the code by hand." })));
  };

  const back = (
    <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#37352F] mb-4 -ml-1">
      <ChevronLeft className="w-4 h-4" />{t('dash.addons.back', { defaultValue: 'Add-ons' })}
    </button>
  );
  if (loadError) {
    return <div className="max-w-5xl">{back}<p className="text-sm text-red-600">{t('dash.coupons.loadErr', { defaultValue: "Couldn't load your coupons. Please refresh the page." })}</p></div>;
  }
  if (!coupons) {
    return <div className="max-w-5xl">{back}<div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div></div>;
  }

  const templates: Array<{ key: string; name: string; hint: string; draft: Partial<CouponInput> }> = [
    {
      key: 'welcome',
      name: t('dash.coupons.tWelcome', { defaultValue: 'Welcome offer' }),
      hint: t('dash.coupons.tWelcomeHint', { value: label({ kind: 'percent', value: 10 }), defaultValue: '{{value}} off any order' }),
      draft: { code: t('dash.coupons.tWelcomeCode', { defaultValue: 'WELCOME10' }), title: t('dash.coupons.tWelcome', { defaultValue: 'Welcome offer' }), kind: 'percent', value: 10, showOnMenu: true },
    },
    {
      key: 'spend',
      name: t('dash.coupons.tSpend', { defaultValue: 'Spend a bit more' }),
      hint: t('dash.coupons.tSpendHint', { value: label({ kind: 'amount', value: 2 }), amount: money(15), defaultValue: '{{value}} off orders from {{amount}}' }),
      draft: { code: t('dash.coupons.tSpendCode', { defaultValue: 'SAVE2' }), title: t('dash.coupons.tSpendTitle', { defaultValue: 'Treat yourself' }), kind: 'amount', value: 2, minOrder: 15, showOnMenu: true },
    },
    {
      key: 'week',
      name: t('dash.coupons.tWeek', { defaultValue: 'One-week special' }),
      hint: t('dash.coupons.tWeekHint', { value: label({ kind: 'percent', value: 15 }), defaultValue: '{{value}} off, for 7 days' }),
      draft: { code: t('dash.coupons.tWeekCode', { defaultValue: 'WEEK15' }), title: t('dash.coupons.tWeekTitle', { defaultValue: 'This week only' }), kind: 'percent', value: 15, startsOn: today, endsOn: addDays(today, 6), showOnMenu: true },
    },
  ];

  return (
    <div className="max-w-5xl">
      {back}

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-[#F7F7F5] flex items-center justify-center shrink-0">
            <Ticket className="w-5 h-5 text-[#37352F]" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold text-[#37352F]">{t('dash.coupons.title', { defaultValue: 'Coupons' })}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{t('dash.coupons.sub', { defaultValue: 'Discount codes your guests use when they order from your digital menu.' })}</p>
          </div>
        </div>
        {coupons.length > 0 && (
          <button onClick={() => setDialog({})} className={`${btnDark} self-start shrink-0`}>
            <Plus className="w-4 h-4" />{t('dash.coupons.new', { defaultValue: 'New coupon' })}
          </button>
        )}
      </div>

      {orderingOn === false && (
        <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap rounded-xl bg-amber-50 text-amber-900 px-4 py-3 mb-6 text-sm">
          <span className="min-w-0">{t('dash.coupons.orderingOff', { defaultValue: 'Guests use coupons when they order from your digital menu. Table ordering is off right now, so nobody can use them yet.' })}</span>
          <button onClick={onOpenMenu} className="inline-flex items-center gap-1.5 font-medium hover:underline shrink-0">
            <UtensilsCrossed className="w-4 h-4" />{t('dash.coupons.openMenu', { defaultValue: 'Open digital menu' })}
          </button>
        </div>
      )}

      {coupons.length === 0 ? (
        <>
          <HowItWorks />
          <section className="rounded-2xl border notion-border bg-white p-5 sm:p-7 mt-6">
            <h2 className="font-semibold text-[#37352F]">{t('dash.coupons.emptyTitle', { defaultValue: 'Create your first coupon' })}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{t('dash.coupons.emptySub', { defaultValue: 'Start from an idea below or from scratch. You can change everything later.' })}</p>
            <div className="grid sm:grid-cols-3 gap-3 mt-4">
              {templates.map((tp) => (
                <button key={tp.key} data-template={tp.key} onClick={() => setDialog({ draft: tp.draft })}
                  className="text-left rounded-xl border notion-border p-4 hover:border-[#37352F]/30 hover:bg-[#FBFBFA] transition">
                  <div className="text-2xl font-extrabold text-[#37352F] leading-none">{label({ kind: tp.draft.kind!, value: tp.draft.value! })}</div>
                  <div className="text-sm font-medium text-[#37352F] mt-2">{tp.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{tp.hint}</div>
                  <div className="font-mono text-xs font-semibold tracking-wider text-gray-400 mt-3">{tp.draft.code}</div>
                </button>
              ))}
            </div>
            <button onClick={() => setDialog({})} className={`${btnLight} mt-4`}>
              <Plus className="w-4 h-4" />{t('dash.coupons.scratch', { defaultValue: 'Start from scratch' })}
            </button>
          </section>
        </>
      ) : (
        <>
          <div className="grid md:grid-cols-2 gap-3">
            {coupons.map((c) => {
              const use = usage[c.id] ?? { uses: 0, discountTotal: 0 };
              return (
                <CouponCard key={c.id} c={c} use={use} state={couponState(c, use.uses, today)} label={label} money={money}
                  busy={busyId === c.id}
                  onActive={() => void patch(c, { active: !c.active })}
                  onMenu={() => void patch(c, { showOnMenu: !c.showOnMenu })}
                  onEdit={() => setDialog({ coupon: c })}
                  onCopy={() => copy(c.code)}
                  onDelete={() => setDeleting(c)} />
              );
            })}
          </div>
          <p className="flex items-start gap-2 text-sm text-gray-500 mt-5">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            {t('dash.coupons.chargeHint', { defaultValue: 'When a guest uses a coupon, their order under Orders shows the code and the discount. Charge the lower total at the counter.' })}
          </p>
        </>
      )}

      {dialog && (
        <CouponDialog coupon={dialog.coupon} draft={dialog.draft} country={country} today={today}
          takenCodes={coupons.filter((c) => c.id !== dialog.coupon?.id).map((c) => c.code)}
          onSave={(input) => save(input, dialog.coupon?.id)}
          onDelete={dialog.coupon ? () => setDeleting(dialog.coupon!) : undefined}
          onClose={() => setDialog(null)} />
      )}
      {deleting && (
        <ConfirmDialog
          title={t('dash.coupons.deleteTitle', { code: deleting.code, defaultValue: 'Delete {{code}}?' })}
          body={t('dash.coupons.deleteBody', { defaultValue: 'Guests can’t use this code anymore. Orders that already used it keep their discount.' })}
          confirmLabel={t('dash.addons.delete', { defaultValue: 'Delete' })} busy={busyId === deleting.id}
          onConfirm={() => void remove(deleting)} onClose={() => setDeleting(null)} />
      )}
    </div>
  );
}

function HowItWorks() {
  const { t } = useTranslation();
  const steps = [
    { icon: Ticket, title: t('dash.coupons.how1', { defaultValue: 'Create a coupon' }), body: t('dash.coupons.how1Body', { defaultValue: 'Pick a code and the discount: a percentage or an amount off.' }) },
    { icon: Smartphone, title: t('dash.coupons.how2', { defaultValue: 'Guests use it' }), body: t('dash.coupons.how2Body', { defaultValue: 'They tap it on your menu or type the code when they order.' }) },
    { icon: Wallet, title: t('dash.coupons.how3', { defaultValue: 'Charge the new total' }), body: t('dash.coupons.how3Body', { defaultValue: 'The order shows the code and the discount. You charge the lower total at the counter.' }) },
  ];
  return (
    <section className="rounded-2xl border notion-border bg-[#FBFBFA] p-4 sm:p-6">
      <h2 className="font-semibold text-[#37352F]">{t('dash.coupons.howTitle', { defaultValue: 'How coupons work' })}</h2>
      <ol className="grid sm:grid-cols-3 gap-3 mt-4">
        {steps.map((s, i) => (
          <li key={i} className="rounded-xl bg-white border notion-border p-4">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-[#F1F1EF] text-gray-600 text-sm font-semibold flex items-center justify-center shrink-0">{i + 1}</span>
              <s.icon className="w-4 h-4 text-gray-400" />
            </div>
            <div className="text-sm font-medium text-[#37352F] mt-3">{s.title}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.body}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function StatePill({ state }: { state: CouponState }) {
  const { t } = useTranslation();
  const map: Record<CouponState, { cls: string; text: string }> = {
    live: { cls: 'bg-green-50 text-green-700', text: t('dash.coupons.stLive', { defaultValue: 'Live' }) },
    scheduled: { cls: 'bg-blue-50 text-blue-700', text: t('dash.coupons.stScheduled', { defaultValue: 'Scheduled' }) },
    paused: { cls: 'bg-gray-100 text-gray-600', text: t('dash.coupons.stPaused', { defaultValue: 'Paused' }) },
    expired: { cls: 'bg-gray-100 text-gray-500', text: t('dash.coupons.stExpired', { defaultValue: 'Expired' }) },
    used_up: { cls: 'bg-gray-100 text-gray-500', text: t('dash.coupons.stUsedUp', { defaultValue: 'Used up' }) },
  };
  const m = map[state];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${m.cls}`} data-state={state}>
      {state === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-green-600" />}{m.text}
    </span>
  );
}

function CouponCard({ c, use, state, label, money, busy, onActive, onMenu, onEdit, onCopy, onDelete }: {
  c: Coupon; use: CouponUse; state: CouponState; label: (c: { kind: CouponKind; value: number }) => string; money: (n: number) => string;
  busy: boolean; onActive: () => void; onMenu: () => void; onEdit: () => void; onCopy: () => void; onDelete: () => void;
}) {
  const { t, i18n } = useTranslation();
  const value = label(c);
  const lang = i18n.language;
  const dates = c.startsOn && c.endsOn
    ? t('dash.coupons.condRange', { from: dayLabel(c.startsOn, lang), to: dayLabel(c.endsOn, lang), defaultValue: '{{from}} to {{to}}' })
    : c.endsOn ? t('dash.coupons.condUntil', { date: dayLabel(c.endsOn, lang), defaultValue: 'Until {{date}}' })
      : c.startsOn ? t('dash.coupons.condFrom', { date: dayLabel(c.startsOn, lang), defaultValue: 'From {{date}}' }) : null;
  const conds = [
    c.minOrder != null && c.minOrder > 0 ? t('dash.coupons.condMin', { amount: money(c.minOrder), defaultValue: 'Orders from {{amount}}' }) : null,
    dates,
  ].filter((x): x is string => !!x);
  const used = c.maxUses != null
    ? t('dash.coupons.usedOf', { uses: use.uses, max: c.maxUses, defaultValue: 'Used: {{uses}} of {{max}}' })
    : t('dash.coupons.used', { count: use.uses, defaultValue: 'Used: {{count}}' });
  const strong = state === 'live' || state === 'scheduled';

  return (
    <div className="rounded-2xl border notion-border bg-white overflow-hidden flex min-w-0" data-coupon-card={c.code}>
      <div className={`w-[88px] sm:w-24 shrink-0 flex flex-col items-center justify-center text-center px-2 py-4 ${strong ? 'bg-[#37352F] text-white' : 'bg-[#F1F1EF] text-gray-500'}`}>
        <div className={`${value.length > 5 ? 'text-lg' : 'text-2xl'} font-extrabold leading-none tracking-tight`}>{value}</div>
        <div className="text-[10px] font-bold uppercase tracking-widest mt-1.5 opacity-70">{t('order.cOff', { defaultValue: 'off' })}</div>
      </div>
      <div className="min-w-0 flex-1 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-bold tracking-wider text-[#37352F] break-all">{c.code}</span>
              <StatePill state={state} />
            </div>
            <div className="text-sm text-gray-600 mt-0.5 break-words">{c.title || t('order.cDefaultTitle', { value, defaultValue: '{{value}} off your order' })}</div>
          </div>
          <ActionMenu label={t('dash.coupons.more', { code: c.code, defaultValue: 'More for {{code}}' })} actions={[
            { label: t('dash.coupons.edit', { defaultValue: 'Edit' }), icon: Pencil, onClick: onEdit },
            { label: t('dash.coupons.copy', { defaultValue: 'Copy code' }), icon: Copy, onClick: onCopy },
            { label: t('dash.addons.delete', { defaultValue: 'Delete' }), icon: Trash2, onClick: onDelete, danger: true },
          ]} />
        </div>
        {conds.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {conds.map((x) => <span key={x} className="text-xs px-2 py-0.5 rounded-full bg-[#F7F7F5] text-gray-600">{x}</span>)}
          </div>
        )}
        <div className="text-xs text-gray-500 mt-2.5">
          {used}{use.discountTotal > 0 ? ` · ${t('dash.coupons.given', { amount: money(use.discountTotal), defaultValue: 'Discounts given: {{amount}}' })}` : ''}
        </div>
        <div className="flex items-center gap-x-5 gap-y-2 flex-wrap mt-3 pt-3 border-t notion-border">
          <div className="flex items-center gap-2 text-sm text-[#37352F]">
            <Switch size="sm" on={c.active} disabled={busy} onChange={onActive} label={t('dash.coupons.active', { defaultValue: 'Active' })} />
            {t('dash.coupons.active', { defaultValue: 'Active' })}
          </div>
          <div className="flex items-center gap-2 text-sm text-[#37352F]">
            <Switch size="sm" on={c.showOnMenu} disabled={busy} onChange={onMenu} label={t('dash.coupons.showOnMenu', { defaultValue: 'Show on menu' })} />
            {t('dash.coupons.showOnMenu', { defaultValue: 'Show on menu' })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** How a coupon looks to guests at the top of the menu (the dashboard's small copy of it). */
export function TicketPreview({ value, title, code, note, applied, compact, notch = '#FAF7F2' }: {
  value: string; title: string; code: string; note?: string | null; applied?: boolean; notch?: string;
  /** Narrow version for the small phone drawing: code and button stacked. */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div aria-hidden className="flex items-stretch rounded-xl bg-white overflow-hidden text-left" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.06), 0 4px 14px rgba(0,0,0,0.06)' }}>
      <div className={`${compact ? 'w-[54px]' : 'w-[72px]'} shrink-0 flex flex-col items-center justify-center py-3 px-1 bg-[#2F2A26] text-white`}>
        <span className={`${compact ? 'text-base' : value.length > 5 ? 'text-sm' : 'text-xl'} font-extrabold leading-none`}>{value}</span>
        <span className="text-[9px] font-bold uppercase tracking-[0.16em] mt-1 opacity-80">{t('order.cOff', { defaultValue: 'off' })}</span>
      </div>
      <div className="relative w-0 border-l-2 border-dashed border-black/10">
        <i className="absolute -left-[7px] -top-1.5 w-3 h-3 rounded-full" style={{ background: notch }} />
        <i className="absolute -left-[7px] -bottom-1.5 w-3 h-3 rounded-full" style={{ background: notch }} />
      </div>
      <div className={`min-w-0 flex-1 ${compact ? 'px-2.5 py-2' : 'px-3 py-2.5'}`}>
        <div className={`${compact ? 'text-[11px]' : 'text-[13px]'} font-semibold text-[#2F2A26] truncate`}>{title}</div>
        {note && <div className="text-[11px] text-gray-500 truncate">{note}</div>}
        <div className={compact ? 'flex flex-col items-start gap-1 mt-1' : 'flex items-center justify-between gap-2 mt-1.5'}>
          <span className="font-mono text-[11px] font-bold tracking-wider text-[#2F2A26] truncate">{code}</span>
          <span className={`shrink-0 text-[10px] font-semibold rounded-full px-2 py-0.5 ${applied ? 'bg-[#2F2A26] text-white' : 'bg-[#FAF7F2] text-[#2F2A26]'}`}>
            {applied ? t('order.cApplied', { defaultValue: 'Applied' }) : t('order.cUse', { defaultValue: 'Use coupon' })}
          </span>
        </div>
      </div>
    </div>
  );
}

function CouponDialog({ coupon, draft, country, today, takenCodes, onSave, onDelete, onClose }: {
  coupon?: Coupon; draft?: Partial<CouponInput>; country: string | null; today: string; takenCodes: string[];
  onSave: (input: CouponInput) => Promise<CouponSaveError | null>; onDelete?: () => void; onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const init: Partial<CouponInput> = coupon ?? draft ?? {};
  const currency = menuCurrency(country);
  const money = useMemo(() => menuMoney(country, i18n.language), [country, i18n.language]);
  const [code, setCode] = useState(init.code ?? '');
  const [title, setTitle] = useState(init.title ?? '');
  const [kind, setKind] = useState<CouponKind>(init.kind ?? 'percent');
  const [value, setValue] = useState(init.value != null ? (Number.isInteger(init.value) ? String(init.value) : init.value.toFixed(2)) : '');
  const [minOrder, setMinOrder] = useState(init.minOrder != null ? init.minOrder.toFixed(2) : '');
  const [startsOn, setStartsOn] = useState(init.startsOn ?? '');
  const [endsOn, setEndsOn] = useState(init.endsOn ?? '');
  const [maxUses, setMaxUses] = useState(init.maxUses != null ? String(init.maxUses) : '');
  const [showOnMenu, setShowOnMenu] = useState(init.showOnMenu ?? true);
  const [active, setActive] = useState(init.active ?? true);
  const [busy, setBusy] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const v = parsePrice(value);
  const valueOk = !Number.isNaN(v) && v > 0 && (kind !== 'percent' || v <= 100);
  const m = minOrder.trim() ? parsePrice(minOrder) : null;
  const minOk = m === null || !Number.isNaN(m);
  const datesOk = !startsOn || !endsOn || endsOn >= startsOn;
  const mu = maxUses.trim() ? Number(maxUses.trim()) : null;
  const usesOk = mu === null || (Number.isInteger(mu) && mu >= 1 && mu <= 1000000);
  const codeOk = COUPON_CODE.test(code);
  const taken = takenCodes.includes(code);
  const valid = codeOk && !taken && valueOk && minOk && datesOk && usesOk;
  const pastEnd = !!endsOn && endsOn < today;
  const valueLabel = valueOk ? couponValueLabel({ kind, value: v }, country, i18n.language) : (kind === 'percent' ? '10%' : `${currency}2`);

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const r = await onSave({
      code, title: title.trim() || null, kind, value: v, minOrder: m && m > 0 ? m : null,
      startsOn: startsOn || null, endsOn: endsOn || null, maxUses: mu, active, showOnMenu,
    });
    setBusy(false);
    if (r === null) onClose();
    else if (r === 'duplicate') setCodeError(t('dash.coupons.codeTaken', { defaultValue: 'You already have a coupon with this code.' }));
    else setError(t('dash.addons.saveErr', { defaultValue: "Couldn't save. Please try again." }));
  };

  const label = (id: string, text: string) => <label htmlFor={id} className="block text-xs font-medium text-gray-500 mb-1">{text}</label>;
  const seg = (on: boolean) => `flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${on ? 'bg-white shadow-sm text-[#37352F]' : 'text-gray-500 hover:text-[#37352F]'}`;

  return (
    <Dialog title={coupon ? t('dash.coupons.editTitle', { defaultValue: 'Edit coupon' }) : t('dash.coupons.newTitle', { defaultValue: 'New coupon' })} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div className="px-5 space-y-4">
          <div>
            {label('cp-code', t('dash.coupons.code', { defaultValue: 'Code' }))}
            <div className="flex gap-2">
              <input id="cp-code" autoFocus={!coupon} value={code} maxLength={20} autoComplete="off" spellCheck={false} autoCapitalize="characters"
                onChange={(e) => { setCode(cleanCouponCode(e.target.value)); setCodeError(null); }}
                className={`${inputCls} font-mono font-semibold tracking-wider uppercase`} placeholder="WELCOME10" />
              <button type="button" className={`${btnLight} shrink-0`} onClick={() => { setCode(randomCouponCode()); setCodeError(null); }}>
                <RefreshCw className="w-4 h-4" />{t('dash.coupons.generate', { defaultValue: 'Generate' })}
              </button>
            </div>
            {codeError || taken
              ? <p className="text-xs text-red-600 mt-1">{codeError ?? t('dash.coupons.codeTaken', { defaultValue: 'You already have a coupon with this code.' })}</p>
              : <p className="text-xs text-gray-500 mt-1">{t('dash.coupons.codeHint', { defaultValue: 'Letters and numbers, 3 to 20 characters. Guests type this at checkout.' })}</p>}
          </div>

          <div>
            <span className="block text-xs font-medium text-gray-500 mb-1">{t('dash.coupons.discount', { defaultValue: 'Discount' })}</span>
            <div className="flex gap-2">
              <div className="inline-flex rounded-lg bg-[#F1F1EF] p-1 w-40 shrink-0" role="radiogroup" aria-label={t('dash.coupons.discount', { defaultValue: 'Discount' })}>
                <button type="button" role="radio" aria-checked={kind === 'percent'} className={seg(kind === 'percent')} onClick={() => setKind('percent')}>%</button>
                <button type="button" role="radio" aria-checked={kind === 'amount'} className={seg(kind === 'amount')} onClick={() => setKind('amount')}>{currency}</button>
              </div>
              <div className="relative flex-1 min-w-0">
                {kind === 'amount' && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">{currency}</span>}
                <input id="cp-value" aria-label={t('dash.coupons.discount', { defaultValue: 'Discount' })} value={value} inputMode="decimal"
                  onChange={(e) => setValue(e.target.value)}
                  className={`${inputCls} ${kind === 'amount' ? (currency.length > 1 ? 'pl-11' : 'pl-7') : 'pr-8'}`} placeholder={kind === 'percent' ? '10' : '2.00'} />
                {kind === 'percent' && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">%</span>}
              </div>
            </div>
            {value.trim() !== '' && !valueOk && (
              <p className="text-xs text-red-600 mt-1">
                {kind === 'percent' ? t('dash.coupons.percentBad', { defaultValue: 'Enter a percentage up to 100.' }) : t('dash.coupons.amountBad', { defaultValue: 'Enter an amount like 2.50' })}
              </p>
            )}
          </div>

          <div>
            {label('cp-title', t('dash.coupons.titleLabel', { defaultValue: 'Name for guests (optional)' }))}
            <input id="cp-title" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} className={inputCls}
              placeholder={t('dash.coupons.titlePh', { defaultValue: 'e.g. Welcome offer' })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              {label('cp-min', t('dash.coupons.minOrder', { defaultValue: 'Minimum order (optional)' }))}
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">{currency}</span>
                <input id="cp-min" value={minOrder} inputMode="decimal" onChange={(e) => setMinOrder(e.target.value)}
                  className={`${inputCls} ${currency.length > 1 ? 'pl-11' : 'pl-7'}`} placeholder="15.00" />
              </div>
              {!minOk && <p className="text-xs text-red-600 mt-1">{t('dash.addons.priceInvalid', { defaultValue: 'Enter a price like 4.50' })}</p>}
            </div>
            <div>
              {label('cp-uses', t('dash.coupons.maxUses', { defaultValue: 'Usage limit (optional)' }))}
              <input id="cp-uses" value={maxUses} inputMode="numeric" onChange={(e) => setMaxUses(e.target.value.replace(/[^0-9]/g, '').slice(0, 7))}
                className={inputCls} placeholder={t('dash.coupons.maxUsesPh', { defaultValue: 'No limit' })} />
              {!usesOk && <p className="text-xs text-red-600 mt-1">{t('dash.coupons.maxUsesBad', { defaultValue: 'Enter a number from 1.' })}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              {label('cp-from', t('dash.coupons.startsOn', { defaultValue: 'Valid from (optional)' }))}
              <input id="cp-from" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className={inputCls} />
            </div>
            <div>
              {label('cp-to', t('dash.coupons.endsOn', { defaultValue: 'Valid until (optional)' }))}
              <input id="cp-to" type="date" value={endsOn} min={startsOn || undefined} onChange={(e) => setEndsOn(e.target.value)} className={inputCls} />
            </div>
          </div>
          {!datesOk && <p className="text-xs text-red-600 -mt-2">{t('dash.coupons.datesBad', { defaultValue: 'The end date is before the start date.' })}</p>}
          {datesOk && pastEnd && <p className="text-xs text-amber-700 -mt-2">{t('dash.coupons.pastEnd', { defaultValue: 'This end date has passed, so guests can’t use the coupon.' })}</p>}

          <div className="rounded-lg bg-[#F7F7F5] divide-y divide-black/5">
            <div className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-sm text-[#37352F]">{t('dash.coupons.showOnMenu', { defaultValue: 'Show on menu' })}</div>
                <div className="text-xs text-gray-500">{t('dash.coupons.showOnMenuHint', { defaultValue: 'Guests see it at the top of your menu and tap to use it. Off: only people with the code can use it.' })}</div>
              </div>
              <Switch on={showOnMenu} onChange={() => setShowOnMenu((s) => !s)} label={t('dash.coupons.showOnMenu', { defaultValue: 'Show on menu' })} />
            </div>
            {showOnMenu && (
              <div className="px-3 py-3" style={{ background: '#FAF7F2' }}>
                <div className="text-[11px] font-medium text-gray-500 mb-2">{t('dash.coupons.previewLabel', { defaultValue: 'What guests see' })}</div>
                <TicketPreview value={valueLabel} code={code || 'WELCOME10'}
                  title={title.trim() || t('order.cDefaultTitle', { value: valueLabel, defaultValue: '{{value}} off your order' })}
                  note={m && m > 0 ? t('order.cMin', { amount: money(m), defaultValue: 'On orders from {{amount}}' }) : null} />
              </div>
            )}
            <div className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-sm text-[#37352F]">{t('dash.coupons.active', { defaultValue: 'Active' })}</div>
                <div className="text-xs text-gray-500">{t('dash.coupons.activeHint', { defaultValue: 'Switch off to pause the coupon.' })}</div>
              </div>
              <Switch on={active} onChange={() => setActive((a) => !a)} label={t('dash.coupons.active', { defaultValue: 'Active' })} />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex items-center gap-2 px-5 py-4 mt-5 border-t notion-border">
          {onDelete && (
            <button type="button" onClick={onDelete} className="mr-auto inline-flex items-center gap-1 text-sm text-red-600 hover:underline">
              <Trash2 className="w-4 h-4" />{t('dash.addons.delete', { defaultValue: 'Delete' })}
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button type="button" className={btnLight} onClick={onClose}>{t('dash.addons.cancel', { defaultValue: 'Cancel' })}</button>
            <button className={btnDark} disabled={busy || !valid}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {coupon ? t('dash.addons.save', { defaultValue: 'Save' }) : t('dash.coupons.create', { defaultValue: 'Create coupon' })}
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
