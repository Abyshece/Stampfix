import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import QRCode from 'react-qr-code';
import {
  Puzzle, UtensilsCrossed, Check, Loader2, Plus, Pencil, Trash2, ArrowUp, ArrowDown, X, Printer,
  ExternalLink, ClipboardList, ChevronLeft, ChevronRight, MoreHorizontal, QrCode, BookOpen, FolderPlus,
  type LucideIcon,
} from 'lucide-react';
import type { Location } from '../types';
import { useToast } from './ToastProvider';
import {
  getOrderingSettings, saveOrderingSettings, listMenu, createCategory, updateCategory, deleteCategory,
  createItem, updateItem, deleteItem, orderUrl, menuMoney, menuCurrency, isTableNumber, MAX_TABLES,
  type OrderingSettings, type MenuCategory, type MenuItem, type ItemInput,
} from '../lib/ordering';

const inputCls = 'w-full border notion-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#37352F]/10';
const btnDark = 'inline-flex items-center justify-center gap-1.5 bg-[#37352F] text-white px-3.5 py-2 rounded-lg text-sm font-medium hover:bg-[#2a2a28] disabled:opacity-40 transition whitespace-nowrap';
const btnLight = 'inline-flex items-center justify-center gap-1.5 border notion-border bg-white px-3 py-2 rounded-lg text-sm text-[#37352F] hover:bg-[#F7F7F5] disabled:opacity-40 transition whitespace-nowrap';
const iconBtn = 'p-1.5 rounded-md text-gray-400 hover:text-[#37352F] hover:bg-[#F1F1EF] disabled:opacity-30 transition';

type Menu = { categories: MenuCategory[]; items: MenuItem[] };

/** "8,50" or "8.50" -> 8.5; NaN when it isn't a valid price. */
function parsePrice(s: string): number {
  const v = Number(s.replace(',', '.').trim());
  return s.trim() !== '' && Number.isFinite(v) && v >= 0 && v <= 100000 ? Math.round(v * 100) / 100 : NaN;
}

/**
 * Add-ons (dashboard). The home view lists the add-ons; for now one, free on
 * every plan: a digital menu guests order from by scanning a QR code on
 * their table. Opening it shows a setup checklist and two tabs (Menu,
 * Tables & QR codes).
 */
export function AddonsPanel({ campaignId, businessName, country, locations, onOrderingChanged, onOpenOrders }: {
  campaignId: string; businessName: string; country: string | null; locations: Location[];
  onOrderingChanged: (enabled: boolean) => void; onOpenOrders: () => void;
}) {
  const { t, i18n } = useTranslation();
  const money = useMemo(() => menuMoney(country, i18n.language), [country, i18n.language]);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<{ enabled: boolean; items: number; tables: number } | null>(null);

  useEffect(() => {
    if (open) return;
    let live = true;
    Promise.all([getOrderingSettings(campaignId), listMenu(campaignId)])
      .then(([s, m]) => { if (live) setStatus({ enabled: s.enabled, items: m.items.length, tables: s.tables.length }); })
      .catch(() => { /* the card still opens; the add-on shows its own error */ });
    return () => { live = false; };
  }, [campaignId, open]);

  if (open) {
    return (
      <OrderingAddon campaignId={campaignId} businessName={businessName} country={country} locations={locations}
        onBack={() => setOpen(false)} onOrderingChanged={onOrderingChanged} onOpenOrders={onOpenOrders} />
    );
  }

  const started = !!status && (status.enabled || status.items > 0 || status.tables > 0);
  return (
    <div className="max-w-5xl space-y-6">
      <header>
        <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">
          <Puzzle className="w-4 h-4" /> {t('dash.addons.kicker', { defaultValue: 'Add-ons' })}
        </div>
        <h1 className="text-2xl font-semibold text-[#37352F]">{t('dash.addons.title', { defaultValue: 'Add-ons' })}</h1>
        <p className="text-gray-500 mt-1">{t('dash.addons.sub', { defaultValue: 'Extra tools for your shop, free on every plan.' })}</p>
      </header>

      <section className="rounded-2xl border notion-border bg-white overflow-hidden">
        <div className="grid md:grid-cols-[minmax(0,1fr)_280px]">
          <div className="p-5 sm:p-7">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-xl bg-[#F7F7F5] flex items-center justify-center shrink-0">
                <UtensilsCrossed className="w-5 h-5 text-[#37352F]" />
              </div>
              {status && (
                status.enabled ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-green-50 text-green-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-600" />{t('dash.addons.statusOn', { defaultValue: 'Taking orders' })}
                  </span>
                ) : (
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
                    {started ? t('dash.addons.statusOff', { defaultValue: 'Off' }) : t('dash.addons.statusNew', { defaultValue: 'Not set up yet' })}
                  </span>
                )
              )}
            </div>
            <h2 className="text-xl font-semibold text-[#37352F]">{t('dash.addons.menuTitle', { defaultValue: 'Digital menu & table ordering' })}</h2>
            <p className="text-sm text-gray-600 mt-1.5 max-w-prose">
              {t('dash.addons.menuDesc', { defaultValue: 'Put your menu online. Guests scan the QR code on their table, order from their phone and pay at the counter.' })}
            </p>
            <ul className="mt-4 space-y-2">
              {[
                t('dash.addons.menuB1', { defaultValue: 'No app and no sign-up for your guests' }),
                t('dash.addons.menuB2', { defaultValue: 'Accept orders and mark them ready under Orders' }),
                t('dash.addons.menuB3', { defaultValue: 'Guests pay at the counter, as usual' }),
              ].map((b) => (
                <li key={b} className="flex items-start gap-2 text-sm text-[#37352F]"><Check className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />{b}</li>
              ))}
            </ul>
            {started && status && (
              <p className="text-sm text-gray-500 mt-4">
                {t('dash.addons.summary', { items: status.items, tables: status.tables, defaultValue: 'Menu items: {{items}} · Tables: {{tables}}' })}
              </p>
            )}
            <button onClick={() => setOpen(true)} className={`${btnDark} mt-5 px-5 py-2.5`}>
              {started ? t('dash.addons.manage', { defaultValue: 'Manage' }) : t('dash.addons.setUp', { defaultValue: 'Set up' })}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="hidden md:flex items-center justify-center bg-[#F7F7F5] p-6">
            <PhonePreview money={money} />
          </div>
        </div>
      </section>
    </div>
  );
}

/** A small drawing of the guest's phone, to show what the add-on does. */
function PhonePreview({ money }: { money: (n: number) => string }) {
  const { t } = useTranslation();
  const rows: Array<[string, number]> = [['Cappuccino', 3.9], ['Croissant', 2.8], ['Espresso', 2.5]];
  return (
    <div aria-hidden className="w-[180px] rounded-[26px] border-[6px] border-[#37352F] bg-white shadow-xl overflow-hidden">
      <div className="px-3.5 pt-4 pb-3.5">
        <div className="text-[11px] text-gray-400">{t('dash.addons.printTable', { table: '4', defaultValue: 'Table {{table}}' })}</div>
        <div className="mt-2.5 space-y-2.5">
          {rows.map(([name, price]) => (
            <div key={name} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] font-medium text-[#37352F] truncate">{name}</div>
                <div className="text-[10px] text-gray-500">{money(price)}</div>
              </div>
              <span className="w-5 h-5 rounded-full bg-[#37352F] text-white flex items-center justify-center shrink-0"><Plus className="w-3 h-3" /></span>
            </div>
          ))}
        </div>
        <div className="mt-3.5 rounded-lg bg-[#37352F] text-white text-[10px] font-semibold text-center py-1.5">
          {t('order.send', { defaultValue: 'Send order' })}
        </div>
      </div>
    </div>
  );
}

// ---- The add-on itself ---------------------------------------------------------------

function OrderingAddon({ campaignId, businessName, country, locations, onBack, onOrderingChanged, onOpenOrders }: {
  campaignId: string; businessName: string; country: string | null; locations: Location[];
  onBack: () => void; onOrderingChanged: (enabled: boolean) => void; onOpenOrders: () => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const money = useMemo(() => menuMoney(country, i18n.language), [country, i18n.language]);
  const [settings, setSettings] = useState<OrderingSettings | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'menu' | 'tables'>('menu');
  const [itemDialog, setItemDialog] = useState<{ item?: MenuItem; categoryId: string | null } | null>(null);

  const reloadMenu = useCallback(() => listMenu(campaignId).then(setMenu), [campaignId]);
  useEffect(() => {
    let live = true;
    Promise.all([getOrderingSettings(campaignId), listMenu(campaignId)])
      .then(([s, m]) => { if (live) { setSettings(s); setMenu(m); } })
      .catch(() => { if (live) setLoadError(true); });
    return () => { live = false; };
  }, [campaignId]);

  const fail = () => toast.error(t('dash.addons.saveErr', { defaultValue: "Couldn't save. Please try again." }));
  /** Runs a menu change, then reloads the menu. False when it failed. */
  const run = async (fn: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    try { await fn(); await reloadMenu(); return true; } catch { fail(); return false; } finally { setBusy(false); }
  };
  const saveSettings = async (next: OrderingSettings): Promise<boolean> => {
    setBusy(true);
    try {
      await saveOrderingSettings(campaignId, next);
      setSettings(next);
      return true;
    } catch {
      fail();
      return false;
    } finally {
      setBusy(false);
    }
  };

  const back = (
    <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#37352F] mb-4 -ml-1">
      <ChevronLeft className="w-4 h-4" />{t('dash.addons.back', { defaultValue: 'Add-ons' })}
    </button>
  );
  if (loadError) {
    return <div className="max-w-5xl">{back}<p className="text-sm text-red-600">{t('dash.addons.loadErr', { defaultValue: "Couldn't load your menu. Please refresh the page." })}</p></div>;
  }
  if (!settings || !menu) {
    return <div className="max-w-5xl">{back}<div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div></div>;
  }

  const active = locations.filter((l) => !l.archived);
  const availableCount = menu.items.filter((i) => i.available).length;
  const toggle = async () => {
    const next = { ...settings, enabled: !settings.enabled };
    if (await saveSettings(next)) {
      onOrderingChanged(next.enabled);
      toast.success(next.enabled
        ? t('dash.addons.nowOn', { defaultValue: 'Table ordering is on' })
        : t('dash.addons.nowOff', { defaultValue: 'Table ordering is off' }));
    }
  };
  const previewUrl = orderUrl(campaignId, settings.tables[0] ?? null, active.length > 1 ? active[0].id : null);

  const steps: Array<{ done: boolean; title: string; hint: string; cta: string; action: () => void; disabled?: boolean }> = [
    {
      done: availableCount > 0,
      title: t('dash.addons.step1', { defaultValue: 'Add your menu' }),
      hint: t('dash.addons.step1Hint', { defaultValue: 'Add the drinks and food guests can order.' }),
      cta: t('dash.addons.step1Btn', { defaultValue: 'Add items' }),
      action: () => { setTab('menu'); setItemDialog({ categoryId: menu.categories[0]?.id ?? null }); },
    },
    {
      done: settings.tables.length > 0,
      title: t('dash.addons.step2', { defaultValue: 'Put QR codes on your tables' }),
      hint: t('dash.addons.step2Hint', { defaultValue: 'Add your tables and print a code for each one.' }),
      cta: t('dash.addons.step2Btn', { defaultValue: 'Add tables' }),
      action: () => setTab('tables'),
    },
    {
      done: settings.enabled,
      title: t('dash.addons.step3', { defaultValue: 'Turn on ordering' }),
      hint: t('dash.addons.step3Hint', { defaultValue: 'Guests can order as soon as this is on.' }),
      cta: t('dash.addons.step3Btn', { defaultValue: 'Turn on' }),
      action: () => void toggle(),
      disabled: busy || availableCount === 0,
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="max-w-5xl">
      {back}

      {/* Title, preview and the main switch */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-6">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-[#F7F7F5] flex items-center justify-center shrink-0">
            <UtensilsCrossed className="w-5 h-5 text-[#37352F]" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold text-[#37352F]">{t('dash.addons.menuTitle', { defaultValue: 'Digital menu & table ordering' })}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{t('dash.addons.detailSub', { defaultValue: 'Guests scan the code on their table, order from their phone and pay at the counter.' })}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <a href={previewUrl} target="_blank" rel="noreferrer" className={btnLight}>
            <ExternalLink className="w-4 h-4" />{t('dash.addons.preview', { defaultValue: 'Preview menu' })}
          </a>
          <div className={`flex items-center gap-3 rounded-lg border px-3 py-1.5 ${settings.enabled ? 'border-green-200 bg-green-50' : 'notion-border bg-white'}`}
            title={!settings.enabled && availableCount === 0 ? t('dash.addons.needItems', { defaultValue: 'Add a menu item first' }) : undefined}>
            <span className="text-sm font-medium text-[#37352F]">{t('dash.addons.takeOrders', { defaultValue: 'Take orders' })}</span>
            <Switch on={settings.enabled} label={t('dash.addons.takeOrders', { defaultValue: 'Take orders' })}
              disabled={busy || (!settings.enabled && availableCount === 0)} onChange={() => void toggle()} />
          </div>
        </div>
      </div>

      {/* Guided setup until everything is done, then a short "live" line */}
      {doneCount < steps.length ? (
        <section className="rounded-2xl border notion-border bg-[#FBFBFA] p-4 sm:p-6 mb-6">
          <h2 className="font-semibold text-[#37352F]">{t('dash.addons.stepsTitle', { defaultValue: 'Get set up in 3 steps' })}</h2>
          <p className="text-sm text-gray-500 mt-0.5">{t('dash.addons.stepsDone', { done: doneCount, defaultValue: 'Done: {{done}} of 3' })}</p>
          <div className="h-1.5 rounded-full bg-[#EFEFEE] mt-3 overflow-hidden">
            <div className="h-full bg-green-600 rounded-full transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </div>
          <ol className="mt-4 space-y-2">
            {steps.map((s, i) => (
              <li key={i} className="flex items-start sm:items-center gap-3 rounded-xl bg-white border notion-border px-3 sm:px-4 py-3">
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${s.done ? 'bg-green-600 text-white' : 'bg-[#F1F1EF] text-gray-500'}`}>
                  {s.done ? <Check className="w-4 h-4" /> : i + 1}
                </span>
                {/* On phones the button sits under the text, on wider screens to its right. */}
                <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-3">
                  <div className="min-w-0 flex-1 pt-1 sm:pt-0">
                    <div className={`text-sm font-medium ${s.done ? 'text-gray-400 line-through' : 'text-[#37352F]'}`}>{s.title}</div>
                    {!s.done && <div className="text-xs text-gray-500 mt-0.5">{s.hint}</div>}
                  </div>
                  {!s.done && <button className={`${btnLight} shrink-0 mt-2 sm:mt-0`} disabled={s.disabled} onClick={s.action}>{s.cta}</button>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl bg-green-50 text-green-900 px-4 py-3 mb-6">
          <div className="flex items-center gap-2 text-sm min-w-0">
            <span className="w-2 h-2 rounded-full bg-green-600 shrink-0" />
            <span className="font-semibold">{t('dash.addons.liveTitle', { defaultValue: 'You’re taking orders' })}</span>
            <span className="hidden sm:inline text-green-800/80">· {t('dash.addons.liveHint', { defaultValue: 'New orders show up under Orders.' })}</span>
          </div>
          <button onClick={onOpenOrders} className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline">
            <ClipboardList className="w-4 h-4" />{t('dash.addons.goOrders', { defaultValue: 'Go to Orders' })}
          </button>
        </div>
      )}

      {/* Tabs */}
      <div role="tablist" className="flex gap-1 border-b notion-border mb-5 overflow-x-auto no-scrollbar">
        {([
          ['menu', BookOpen, t('dash.addons.tabMenu', { defaultValue: 'Menu' }), menu.items.length],
          ['tables', QrCode, t('dash.addons.tabTables', { defaultValue: 'Tables & QR codes' }), settings.tables.length],
        ] as const).map(([id, Icon, label, n]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`inline-flex items-center gap-2 px-3 py-2.5 -mb-px border-b-2 text-sm font-medium whitespace-nowrap transition ${
              tab === id ? 'border-[#37352F] text-[#37352F]' : 'border-transparent text-gray-500 hover:text-[#37352F]'
            }`}>
            <Icon className="w-4 h-4 hidden sm:block" />{label}
            <span className={`text-xs tabular-nums px-1.5 rounded-full ${tab === id ? 'bg-[#37352F] text-white' : 'bg-[#F1F1EF] text-gray-500'}`}>{n}</span>
          </button>
        ))}
      </div>

      {tab === 'menu' ? (
        <MenuTab menu={menu} settings={settings} money={money} busy={busy} campaignId={campaignId} run={run}
          saveSettings={saveSettings}
          onAddItem={(categoryId) => setItemDialog({ categoryId })}
          onEditItem={(item) => setItemDialog({ item, categoryId: item.categoryId })} />
      ) : (
        <TablesTab campaignId={campaignId} businessName={businessName} locations={active} settings={settings}
          busy={busy} onSave={saveSettings} />
      )}

      {itemDialog && (
        <ItemDialog item={itemDialog.item} categoryId={itemDialog.categoryId} categories={menu.categories}
          currency={menuCurrency(country)} busy={busy}
          onClose={() => setItemDialog(null)}
          onSave={(input) => {
            const editing = itemDialog.item;
            const position = menu.items.filter((i) => i.categoryId === input.categoryId).length;
            return run(() => (editing ? updateItem(editing.id, input) : createItem(campaignId, input, position)));
          }}
          onDelete={itemDialog.item ? () => {
            const id = itemDialog.item!.id;
            void run(() => deleteItem(id)).then((ok) => { if (ok) setItemDialog(null); });
          } : undefined} />
      )}
    </div>
  );
}

// ---- Menu tab ------------------------------------------------------------------------

function MenuTab({ menu, settings, money, busy, campaignId, run, saveSettings, onAddItem, onEditItem }: {
  menu: Menu; settings: OrderingSettings; money: (n: number) => string; busy: boolean; campaignId: string;
  run: (fn: () => Promise<unknown>) => Promise<boolean>; saveSettings: (next: OrderingSettings) => Promise<boolean>;
  onAddItem: (categoryId: string | null) => void; onEditItem: (item: MenuItem) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [note, setNote] = useState(settings.note ?? '');
  const [catDialog, setCatDialog] = useState<{ cat?: MenuCategory } | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; body: string; label: string; action: () => Promise<unknown> } | null>(null);

  const groups: Array<{ cat: MenuCategory | null; items: MenuItem[] }> =
    menu.categories.map((c) => ({ cat: c, items: menu.items.filter((i) => i.categoryId === c.id) }));
  const loose = menu.items.filter((i) => !i.categoryId || !menu.categories.some((c) => c.id === i.categoryId));
  if (loose.length > 0) groups.push({ cat: null, items: loose });

  // Swap with the neighbour, writing clean positions for the whole list.
  const move = (list: Array<{ id: string }>, index: number, dir: -1 | 1, save: (id: string, position: number) => Promise<void>) => {
    const j = index + dir;
    if (j < 0 || j >= list.length) return;
    const order = list.map((x) => x.id);
    [order[index], order[j]] = [order[j], order[index]];
    void run(() => Promise.all(order.map((id, pos) => save(id, pos))));
  };

  const empty = menu.items.length === 0 && menu.categories.length === 0;

  return (
    <div className="space-y-4">
      {empty ? (
        <div className="rounded-2xl border-2 border-dashed border-[#E9E9E7] py-12 px-6 text-center">
          <BookOpen className="w-8 h-8 mx-auto text-gray-300 mb-3" />
          <h3 className="font-semibold text-[#37352F]">{t('dash.addons.emptyMenu', { defaultValue: 'Your menu is empty' })}</h3>
          <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">{t('dash.addons.emptyMenuHint', { defaultValue: 'Add what guests can order, like a cappuccino or a slice of cake.' })}</p>
          <div className="flex justify-center gap-2 mt-5 flex-wrap">
            <button className={btnDark} onClick={() => onAddItem(null)}><Plus className="w-4 h-4" />{t('dash.addons.addFirst', { defaultValue: 'Add your first item' })}</button>
            <button className={btnLight} onClick={() => setCatDialog({})}><FolderPlus className="w-4 h-4" />{t('dash.addons.addCat', { defaultValue: 'Add category' })}</button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm text-gray-500 hidden sm:block">{t('dash.addons.menuTip', { defaultValue: 'Click an item to edit it. Switch it off when it’s sold out.' })}</p>
            <div className="flex flex-wrap gap-2 sm:ml-auto w-full sm:w-auto">
              <button className={`${btnLight} flex-1 sm:flex-none`} onClick={() => setCatDialog({})}><FolderPlus className="w-4 h-4" />{t('dash.addons.addCat', { defaultValue: 'Add category' })}</button>
              <button className={`${btnDark} flex-1 sm:flex-none`} onClick={() => onAddItem(menu.categories[0]?.id ?? null)}><Plus className="w-4 h-4" />{t('dash.addons.addItem', { defaultValue: 'Add item' })}</button>
            </div>
          </div>

          {groups.map(({ cat, items }, gi) => (
            <section key={cat?.id ?? 'none'} className="rounded-xl border notion-border bg-white">
              <header className="flex items-center gap-2 pl-4 pr-2 py-2 border-b notion-border bg-[#FBFBFA] rounded-t-xl">
                <h3 className="font-semibold text-sm text-[#37352F] truncate">{cat ? cat.name : t('dash.addons.noCategory', { defaultValue: 'Other items' })}</h3>
                <span className="text-xs text-gray-400 tabular-nums">{items.length}</span>
                <div className="ml-auto flex items-center gap-0.5">
                  <button onClick={() => onAddItem(cat?.id ?? null)} title={t('dash.addons.addItem', { defaultValue: 'Add item' })}
                    className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#37352F] px-2 py-1 rounded-md hover:bg-[#F1F1EF]">
                    <Plus className="w-4 h-4" /><span className="hidden sm:inline">{t('dash.addons.addItem', { defaultValue: 'Add item' })}</span>
                  </button>
                  {cat && (
                    <ActionMenu label={t('dash.addons.catActions', { defaultValue: 'Category options' })} actions={[
                      { label: t('dash.addons.rename', { defaultValue: 'Rename' }), icon: Pencil, onClick: () => setCatDialog({ cat }) },
                      { label: t('dash.addons.up', { defaultValue: 'Move up' }), icon: ArrowUp, disabled: busy || gi === 0,
                        onClick: () => move(menu.categories, gi, -1, (id, position) => updateCategory(id, { position })) },
                      { label: t('dash.addons.down', { defaultValue: 'Move down' }), icon: ArrowDown, disabled: busy || gi >= menu.categories.length - 1,
                        onClick: () => move(menu.categories, gi, 1, (id, position) => updateCategory(id, { position })) },
                      { label: t('dash.addons.delete', { defaultValue: 'Delete' }), icon: Trash2, danger: true,
                        onClick: () => setConfirm({
                          title: t('dash.addons.deleteCatQ', { name: cat.name, defaultValue: 'Delete “{{name}}”?' }),
                          body: t('dash.addons.deleteCatBody', { defaultValue: 'The category goes away. Its items stay on your menu under Other items.' }),
                          label: t('dash.addons.delete', { defaultValue: 'Delete' }),
                          action: () => run(() => deleteCategory(cat.id)),
                        }) },
                    ]} />
                  )}
                </div>
              </header>
              {items.length === 0 ? (
                <p className="px-4 py-4 text-sm text-gray-400">{t('dash.addons.catEmpty', { defaultValue: 'No items in this category yet.' })}</p>
              ) : (
                <ul className="divide-y divide-[#F1F1EF]">
                  {items.map((item, ii) => (
                    <li key={item.id} className="flex items-center gap-2 sm:gap-3 pl-4 pr-2 py-2.5">
                      <button onClick={() => onEditItem(item)} className="min-w-0 flex-1 text-left group py-0.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`font-medium truncate group-hover:underline ${item.available ? 'text-[#37352F]' : 'text-gray-400'}`}>{item.name}</span>
                          {!item.available && (
                            <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0">{t('dash.addons.soldOut', { defaultValue: 'Sold out' })}</span>
                          )}
                        </div>
                        {item.description && <div className="text-xs text-gray-500 truncate mt-0.5">{item.description}</div>}
                      </button>
                      <span className={`text-sm font-medium tabular-nums shrink-0 ${item.available ? 'text-[#37352F]' : 'text-gray-400'}`}>{money(item.price)}</span>
                      <Switch size="sm" on={item.available} disabled={busy}
                        label={t('dash.addons.availableFor', { name: item.name, defaultValue: '{{name}}: available to order' })}
                        onChange={() => void run(() => updateItem(item.id, { available: !item.available }))} />
                      <ActionMenu label={t('dash.addons.itemActions', { defaultValue: 'Item options' })} actions={[
                        { label: t('dash.addons.edit', { defaultValue: 'Edit' }), icon: Pencil, onClick: () => onEditItem(item) },
                        { label: t('dash.addons.up', { defaultValue: 'Move up' }), icon: ArrowUp, disabled: busy || ii === 0,
                          onClick: () => move(items, ii, -1, (id, position) => updateItem(id, { position })) },
                        { label: t('dash.addons.down', { defaultValue: 'Move down' }), icon: ArrowDown, disabled: busy || ii >= items.length - 1,
                          onClick: () => move(items, ii, 1, (id, position) => updateItem(id, { position })) },
                        { label: t('dash.addons.delete', { defaultValue: 'Delete' }), icon: Trash2, danger: true,
                          onClick: () => setConfirm({
                            title: t('dash.addons.deleteItemQ', { name: item.name, defaultValue: 'Delete “{{name}}”?' }),
                            body: t('dash.addons.deleteItemBody', { defaultValue: 'It disappears from your menu. Past orders keep it.' }),
                            label: t('dash.addons.delete', { defaultValue: 'Delete' }),
                            action: () => run(() => deleteItem(item.id)),
                          }) },
                      ]} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </>
      )}

      {/* Message at the top of the guest menu */}
      <section className="rounded-xl border notion-border bg-white p-4 sm:p-5">
        <label htmlFor="menu-note" className="block text-sm font-medium text-[#37352F]">{t('dash.addons.noteLabel', { defaultValue: 'Message for guests (optional)' })}</label>
        <p className="text-xs text-gray-500 mt-0.5 mb-2">{t('dash.addons.noteHint', { defaultValue: 'Shown at the top of your menu.' })}</p>
        <form className="flex flex-col sm:flex-row gap-2" onSubmit={async (e) => {
          e.preventDefault();
          if (await saveSettings({ ...settings, note: note.trim() || null })) toast.success(t('dash.addons.saved', { defaultValue: 'Saved' }));
        }}>
          <input id="menu-note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} className={inputCls}
            placeholder={t('dash.addons.notePh', { defaultValue: 'e.g. Kitchen closes at 9 pm' })} />
          <button className={`${btnLight} shrink-0`} disabled={busy || note.trim() === (settings.note ?? '')}>{t('dash.addons.save', { defaultValue: 'Save' })}</button>
        </form>
      </section>

      {catDialog && (
        <CategoryDialog cat={catDialog.cat} busy={busy} onClose={() => setCatDialog(null)}
          onSave={(name) => {
            const editing = catDialog.cat;
            return run(() => (editing ? updateCategory(editing.id, { name }) : createCategory(campaignId, name, menu.categories.length)));
          }} />
      )}
      {confirm && (
        <ConfirmDialog title={confirm.title} body={confirm.body} confirmLabel={confirm.label} busy={busy}
          onClose={() => setConfirm(null)}
          onConfirm={() => void confirm.action().then(() => setConfirm(null))} />
      )}
    </div>
  );
}

// ---- Tables & QR codes tab -------------------------------------------------------------

function TablesTab({ campaignId, businessName, locations, settings, busy, onSave }: {
  campaignId: string; businessName: string; locations: Location[]; settings: OrderingSettings; busy: boolean;
  onSave: (next: OrderingSettings) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [locationId, setLocationId] = useState<string>(locations[0]?.id ?? '');
  const [label, setLabel] = useState('');
  const [count, setCount] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const loc = locations.length > 1 ? locationId || null : null;
  const tableName = (tb: string) => (isTableNumber(tb) ? t('dash.addons.printTable', { table: tb, defaultValue: 'Table {{table}}' }) : tb);

  const addTables = (labels: string[]) => {
    const next = [...settings.tables];
    for (const raw of labels) {
      const l = raw.trim().slice(0, 40);
      if (l && !next.includes(l) && next.length < MAX_TABLES) next.push(l);
    }
    return onSave({ ...settings, tables: next });
  };

  const print = () => {
    const cards = Array.from(gridRef.current?.querySelectorAll('[data-qr-card]') ?? []);
    const w = window.open('', '_blank');
    if (!w) return;
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
    const body = cards.map((c) => {
      // Drop the on-screen size so the print size below applies.
      const el = c.querySelector('svg')?.cloneNode(true) as SVGElement | undefined;
      el?.removeAttribute('style');
      const svg = el?.outerHTML ?? '';
      const table = c.getAttribute('data-table') ?? '';
      return `<div class="card"><div class="biz">${esc(businessName)}</div><div class="scan">${esc(t('dash.addons.printScan', { defaultValue: 'Scan to order' }))}</div>${svg}<div class="table">${esc(tableName(table))}</div><div class="pay">${esc(t('dash.addons.printPay', { defaultValue: 'Pay at the counter' }))}</div></div>`;
    }).join('');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(businessName)}</title><style>
      @page { size: A4; margin: 10mm; } * { box-sizing: border-box; } body { margin: 0; font-family: -apple-system, Helvetica, Arial, sans-serif; color: #37352F; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; } .card { border: 1px dashed #bbb; border-radius: 4mm; padding: 7mm; text-align: center; break-inside: avoid; }
      .biz { font-size: 13pt; font-weight: 700; } .scan { font-size: 11pt; color: #666; margin: 1.5mm 0 4mm; } svg { width: 52mm; height: 52mm; }
      .table { font-size: 18pt; font-weight: 800; margin-top: 4mm; } .pay { font-size: 9pt; color: #888; margin-top: 1mm; }
    </style></head><body><div class="grid">${body}</div><script>window.onload=function(){window.print();}<\/script></body></html>`);
    w.document.close();
  };

  return (
    <div className="space-y-4">
      {/* Add tables */}
      <section className="rounded-xl border notion-border bg-white p-4 sm:p-5 space-y-4">
        <p className="text-sm text-gray-500">{t('dash.addons.tablesHint', { defaultValue: 'Print one QR code per table. Orders show which table they came from.' })}</p>
        {locations.length > 1 && (
          <div>
            <label htmlFor="tables-loc" className="block text-xs font-medium text-gray-500 mb-1">{t('dash.addons.location', { defaultValue: 'Location' })}</label>
            <select id="tables-loc" value={locationId} onChange={(e) => setLocationId(e.target.value)} className={`${inputCls} sm:max-w-xs`}>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <form onSubmit={(e) => {
            e.preventDefault();
            const n = Math.floor(Number(count));
            if (!(n >= 1 && n <= MAX_TABLES)) return;
            void addTables(Array.from({ length: n }, (_, i) => String(i + 1))).then((ok) => { if (ok) setCount(''); });
          }}>
            <label htmlFor="tables-count" className="block text-xs font-medium text-gray-500 mb-1">{t('dash.addons.howMany', { defaultValue: 'How many tables?' })}</label>
            <div className="flex gap-2">
              <input id="tables-count" value={count} inputMode="numeric" onChange={(e) => setCount(e.target.value.replace(/\D/g, '').slice(0, 3))}
                className={`${inputCls.replace('w-full ', '')} w-20 shrink-0`} placeholder="12" />
              <button className={`${btnDark} flex-1 sm:flex-none`} disabled={busy || !count}>
                {count ? t('dash.addons.addRange', { n: count, defaultValue: 'Add tables 1–{{n}}' }) : t('dash.addons.addNumbered', { defaultValue: 'Add numbered tables' })}
              </button>
            </div>
          </form>
          <form onSubmit={(e) => {
            e.preventDefault();
            if (!label.trim()) return;
            void addTables([label]).then((ok) => { if (ok) setLabel(''); });
          }}>
            <label htmlFor="tables-name" className="block text-xs font-medium text-gray-500 mb-1">{t('dash.addons.namedTable', { defaultValue: 'Or add a table by name' })}</label>
            <div className="flex gap-2">
              <input id="tables-name" value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} className={inputCls}
                placeholder={t('dash.addons.tableLabelPh', { defaultValue: 'e.g. Terrace 1' })} />
              <button className={`${btnLight} shrink-0`} disabled={busy || !label.trim()} aria-label={t('dash.addons.addTable', { defaultValue: 'Add table' })}><Plus className="w-4 h-4" /></button>
            </div>
          </form>
        </div>
      </section>

      {/* The codes */}
      {settings.tables.length > 0 ? (
        <section className="rounded-xl border notion-border bg-white p-4 sm:p-5">
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <h3 className="font-semibold text-sm text-[#37352F] mr-auto">{t('dash.addons.tablesCount', { count: settings.tables.length, defaultValue: 'Tables: {{count}}' })}</h3>
            <button className="text-sm text-gray-500 hover:text-red-600 px-2 py-2 rounded-lg" disabled={busy} onClick={() => setConfirmClear(true)}>
              {t('dash.addons.removeAll', { defaultValue: 'Remove all tables' })}
            </button>
            <button className={btnDark} onClick={print}><Printer className="w-4 h-4" />{t('dash.addons.print', { defaultValue: 'Print QR codes' })}</button>
          </div>
          <div ref={gridRef} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {settings.tables.map((tb) => (
              <div key={tb} data-qr-card data-table={tb} className="group relative rounded-xl border notion-border p-3 pt-4 text-center bg-white">
                <button className="absolute top-1.5 right-1.5 p-1 rounded-md text-gray-300 hover:text-red-600 hover:bg-red-50 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition" disabled={busy}
                  title={t('dash.addons.removeTable', { defaultValue: 'Remove table' })} aria-label={t('dash.addons.removeTable', { defaultValue: 'Remove table' })}
                  onClick={() => void onSave({ ...settings, tables: settings.tables.filter((x) => x !== tb) })}><X className="w-3.5 h-3.5" /></button>
                <QRCode value={orderUrl(campaignId, tb, loc)} size={256} style={{ width: '100%', height: 'auto', maxWidth: 112 }} className="mx-auto" />
                <div className="text-sm font-semibold text-[#37352F] mt-2 break-words">{tableName(tb)}</div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-[#E9E9E7] py-10 px-6 text-center">
          <QrCode className="w-8 h-8 mx-auto text-gray-300 mb-3" />
          <h3 className="font-semibold text-[#37352F]">{t('dash.addons.noTables', { defaultValue: 'No tables yet' })}</h3>
          <p className="text-sm text-gray-500 mt-1">{t('dash.addons.noTablesHint', { defaultValue: 'Add your tables above, then print the codes.' })}</p>
        </div>
      )}

      {confirmClear && (
        <ConfirmDialog
          title={t('dash.addons.removeAllQ', { defaultValue: 'Remove all tables?' })}
          body={t('dash.addons.removeAllBody', { defaultValue: 'QR codes you already printed keep working. You can add the tables again any time.' })}
          confirmLabel={t('dash.addons.removeAll', { defaultValue: 'Remove all tables' })} busy={busy}
          onClose={() => setConfirmClear(false)}
          onConfirm={() => void onSave({ ...settings, tables: [] }).then(() => setConfirmClear(false))} />
      )}
    </div>
  );
}

// ---- Dialogs -----------------------------------------------------------------------------

function ItemDialog({ item, categoryId, categories, currency, busy, onSave, onDelete, onClose }: {
  item?: MenuItem; categoryId: string | null; categories: MenuCategory[]; currency: string; busy: boolean;
  onSave: (input: ItemInput) => Promise<boolean>; onDelete?: () => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(item?.name ?? '');
  const [price, setPrice] = useState(item ? item.price.toFixed(2) : '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [cat, setCat] = useState<string | null>(categoryId);
  const [available, setAvailable] = useState(item?.available ?? true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const p = parsePrice(price);
  const valid = name.trim().length > 0 && !Number.isNaN(p);
  const priceBad = price.trim() !== '' && Number.isNaN(p);

  return (
    <Dialog title={item ? t('dash.addons.editItem', { defaultValue: 'Edit item' }) : t('dash.addons.newItem', { defaultValue: 'New item' })} onClose={onClose}>
      <form onSubmit={async (e) => {
        e.preventDefault();
        if (!valid || busy) return;
        const ok = await onSave({ name: name.trim().slice(0, 80), price: p, description: description.trim().slice(0, 300) || null, categoryId: cat, available });
        if (ok) onClose();
      }}>
        <div className="px-5 space-y-4">
          <div>
            <label htmlFor="item-name" className="block text-xs font-medium text-gray-500 mb-1">{t('dash.addons.itemName', { defaultValue: 'Name' })}</label>
            <input id="item-name" autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className={inputCls}
              placeholder={t('dash.addons.itemNamePh', { defaultValue: 'e.g. Cappuccino' })} />
          </div>
          <div className={`grid gap-3 ${categories.length > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <div>
              <label htmlFor="item-price" className="block text-xs font-medium text-gray-500 mb-1">{t('dash.addons.itemPrice', { defaultValue: 'Price' })}</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">{currency}</span>
                <input id="item-price" value={price} inputMode="decimal" onChange={(e) => setPrice(e.target.value)}
                  className={`${inputCls} ${currency.length > 1 ? 'pl-11' : 'pl-7'}`} placeholder="4.50" />
              </div>
            </div>
            {categories.length > 0 && (
              <div>
                <label htmlFor="item-cat" className="block text-xs font-medium text-gray-500 mb-1">{t('dash.addons.itemCat', { defaultValue: 'Category' })}</label>
                <select id="item-cat" value={cat ?? ''} onChange={(e) => setCat(e.target.value || null)} className={inputCls}>
                  <option value="">{t('dash.addons.noCategory', { defaultValue: 'Other items' })}</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
          </div>
          {priceBad && <p className="text-xs text-red-600 -mt-2">{t('dash.addons.priceInvalid', { defaultValue: 'Enter a price like 4.50' })}</p>}
          <div>
            <label htmlFor="item-desc" className="block text-xs font-medium text-gray-500 mb-1">{t('dash.addons.itemDesc', { defaultValue: 'Description (optional)' })}</label>
            <textarea id="item-desc" value={description} maxLength={300} rows={2} onChange={(e) => setDescription(e.target.value)}
              className={`${inputCls} resize-none`} placeholder={t('dash.addons.itemDescPh', { defaultValue: 'e.g. With oat milk on request' })} />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg bg-[#F7F7F5] px-3 py-2.5">
            <div className="min-w-0">
              <div className="text-sm text-[#37352F]">{t('dash.addons.itemAvailable', { defaultValue: 'Available to order' })}</div>
              <div className="text-xs text-gray-500">{t('dash.addons.itemAvailableHint', { defaultValue: 'Switch off when it’s sold out.' })}</div>
            </div>
            <Switch on={available} onChange={() => setAvailable((a) => !a)} label={t('dash.addons.itemAvailable', { defaultValue: 'Available to order' })} />
          </div>
        </div>
        <div className="flex items-center gap-2 px-5 py-4 mt-5 border-t notion-border">
          {onDelete && (confirmDelete ? (
            <span className="flex items-center gap-1 mr-auto">
              <button type="button" className="px-2.5 py-1.5 rounded-md bg-red-600 text-white text-sm font-medium" disabled={busy} onClick={onDelete}>
                {t('dash.addons.delete', { defaultValue: 'Delete' })}
              </button>
              <button type="button" className="px-2 py-1.5 rounded-md text-sm text-gray-500" onClick={() => setConfirmDelete(false)}>{t('dash.addons.cancel', { defaultValue: 'Cancel' })}</button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="mr-auto inline-flex items-center gap-1 text-sm text-red-600 hover:underline">
              <Trash2 className="w-4 h-4" />{t('dash.addons.delete', { defaultValue: 'Delete' })}
            </button>
          ))}
          <div className="ml-auto flex gap-2">
            <button type="button" className={btnLight} onClick={onClose}>{t('dash.addons.cancel', { defaultValue: 'Cancel' })}</button>
            <button className={btnDark} disabled={busy || !valid}>{busy && <Loader2 className="w-4 h-4 animate-spin" />}{t('dash.addons.save', { defaultValue: 'Save' })}</button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

function CategoryDialog({ cat, busy, onSave, onClose }: {
  cat?: MenuCategory; busy: boolean; onSave: (name: string) => Promise<boolean>; onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(cat?.name ?? '');
  return (
    <Dialog title={cat ? t('dash.addons.renameCat', { defaultValue: 'Rename category' }) : t('dash.addons.newCat', { defaultValue: 'New category' })} onClose={onClose}>
      <form onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim() || busy) return;
        if (await onSave(name.trim().slice(0, 60))) onClose();
      }}>
        <div className="px-5">
          <label htmlFor="cat-name" className="block text-xs font-medium text-gray-500 mb-1">{t('dash.addons.catName', { defaultValue: 'Name' })}</label>
          <input id="cat-name" autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className={inputCls}
            placeholder={t('dash.addons.catNamePh', { defaultValue: 'e.g. Drinks' })} />
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 mt-5 border-t notion-border">
          <button type="button" className={btnLight} onClick={onClose}>{t('dash.addons.cancel', { defaultValue: 'Cancel' })}</button>
          <button className={btnDark} disabled={busy || !name.trim()}>{busy && <Loader2 className="w-4 h-4 animate-spin" />}{t('dash.addons.save', { defaultValue: 'Save' })}</button>
        </div>
      </form>
    </Dialog>
  );
}

function ConfirmDialog({ title, body, confirmLabel, busy, onConfirm, onClose }: {
  title: string; body: string; confirmLabel: string; busy: boolean; onConfirm: () => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog title={title} onClose={onClose}>
      <p className="px-5 text-sm text-gray-600">{body}</p>
      <div className="flex justify-end gap-2 px-5 py-4 mt-5 border-t notion-border">
        <button type="button" className={btnLight} onClick={onClose}>{t('dash.addons.cancel', { defaultValue: 'Cancel' })}</button>
        <button type="button" className="inline-flex items-center gap-1.5 bg-red-600 text-white px-3.5 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-40"
          disabled={busy} onClick={onConfirm}>{busy && <Loader2 className="w-4 h-4 animate-spin" />}{confirmLabel}</button>
      </div>
    </Dialog>
  );
}

/** Centered on desktop, a sheet from the bottom on phones. Esc or a tap outside closes it. */
function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useTranslation();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title}
        className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto pb-safe">
        <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-4">
          <h3 className="text-lg font-semibold text-[#37352F] min-w-0 break-words">{title}</h3>
          <button type="button" onClick={onClose} aria-label={t('dash.addons.close', { defaultValue: 'Close' })} className={iconBtn}><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---- Small controls -------------------------------------------------------------------------

function Switch({ on, onChange, disabled, label, size = 'md' }: {
  on: boolean; onChange: () => void; disabled?: boolean; label: string; size?: 'sm' | 'md';
}) {
  const sm = size === 'sm';
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} title={label} disabled={disabled} onClick={onChange}
      className={`relative ${sm ? 'w-9 h-5' : 'w-11 h-6'} rounded-full shrink-0 transition disabled:opacity-40 ${on ? 'bg-green-600' : 'bg-gray-300'}`}>
      <span className={`absolute top-0.5 ${sm ? 'w-4 h-4' : 'w-5 h-5'} rounded-full bg-white shadow transition-all ${
        on ? (sm ? 'left-[18px]' : 'left-[22px]') : 'left-0.5'
      }`} />
    </button>
  );
}

/** A "⋯" button with a short list of actions. */
function ActionMenu({ label, actions }: {
  label: string;
  actions: Array<{ label: string; icon: LucideIcon; onClick: () => void; disabled?: boolean; danger?: boolean }>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={iconBtn}>
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1 z-30 min-w-[11rem] rounded-lg border notion-border bg-white shadow-lg py-1">
          {actions.map((a) => (
            <button key={a.label} type="button" role="menuitem" disabled={a.disabled}
              onClick={() => { setOpen(false); a.onClick(); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left whitespace-nowrap hover:bg-[#F7F7F5] disabled:opacity-40 disabled:hover:bg-transparent ${a.danger ? 'text-red-600' : 'text-[#37352F]'}`}>
              <a.icon className="w-4 h-4" />{a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
