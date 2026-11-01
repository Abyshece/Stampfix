import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import QRCode from 'react-qr-code';
import {
  Puzzle, UtensilsCrossed, Check, Loader2, Plus, Pencil, Trash2, ArrowUp, ArrowDown, X, Printer,
  ExternalLink, ClipboardList,
} from 'lucide-react';
import type { Location } from '../types';
import { useToast } from './ToastProvider';
import {
  getOrderingSettings, saveOrderingSettings, listMenu, createCategory, updateCategory, deleteCategory,
  createItem, updateItem, deleteItem, orderUrl, menuMoney, isTableNumber, MAX_TABLES,
  type OrderingSettings, type MenuCategory, type MenuItem, type ItemInput,
} from '../lib/ordering';

const inputCls = 'w-full border notion-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#37352F]/10';
const btnDark = 'inline-flex items-center justify-center gap-1.5 bg-[#37352F] text-white px-3.5 py-2 rounded-lg text-sm font-medium hover:bg-[#2a2a28] disabled:opacity-40 transition';
const btnLight = 'inline-flex items-center justify-center gap-1.5 border notion-border bg-white px-3 py-2 rounded-lg text-sm text-[#37352F] hover:bg-[#F7F7F5] disabled:opacity-40 transition';
const iconBtn = 'p-1.5 rounded-md text-gray-400 hover:text-[#37352F] hover:bg-[#F7F7F5] disabled:opacity-30 transition';

/** "8,50" or "8.50" -> 8.5; NaN when it isn't a valid price. */
function parsePrice(s: string): number {
  const v = Number(s.replace(',', '.').trim());
  return s.trim() !== '' && Number.isFinite(v) && v >= 0 && v <= 100000 ? Math.round(v * 100) / 100 : NaN;
}

/**
 * Add-ons (dashboard). For now one add-on, free on every plan: a digital menu
 * that guests order from by scanning a QR code on their table.
 */
export function AddonsPanel({ campaignId, businessName, country, locations, onOrderingChanged, onOpenOrders }: {
  campaignId: string; businessName: string; country: string | null; locations: Location[];
  onOrderingChanged: (enabled: boolean) => void; onOpenOrders: () => void;
}) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState<boolean | null>(null);

  return (
    <div className="max-w-5xl space-y-6">
      <header>
        <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">
          <Puzzle className="w-4 h-4" /> {t('dash.addons.kicker', { defaultValue: 'Add-ons' })}
        </div>
        <h1 className="text-2xl font-semibold text-[#37352F]">{t('dash.addons.title', { defaultValue: 'Add-ons' })}</h1>
        <p className="text-gray-500 mt-1">{t('dash.addons.sub', { defaultValue: 'Extra tools for your shop, free on every plan.' })}</p>
      </header>

      <section className="border notion-border rounded-xl p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-[#F7F7F5] flex items-center justify-center shrink-0">
            <UtensilsCrossed className="w-5 h-5 text-[#37352F]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold text-[#37352F]">{t('dash.addons.menuTitle', { defaultValue: 'Digital menu & table ordering' })}</h2>
              {enabled !== null && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${enabled ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  {enabled ? t('dash.addons.on', { defaultValue: 'On' }) : t('dash.addons.off', { defaultValue: 'Off' })}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600 mt-1">
              {t('dash.addons.menuDesc', { defaultValue: 'Put your menu online. Guests scan the QR code on their table, order from their phone and pay at the counter.' })}
            </p>
            <ul className="mt-3 space-y-1.5">
              {[
                t('dash.addons.menuB1', { defaultValue: 'No app and no sign-up for your guests' }),
                t('dash.addons.menuB2', { defaultValue: 'Accept orders and mark them ready under Orders' }),
                t('dash.addons.menuB3', { defaultValue: 'Guests pay at the counter, as usual' }),
              ].map((b) => (
                <li key={b} className="flex items-start gap-2 text-sm text-[#37352F]"><Check className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />{b}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <OrderingSetup campaignId={campaignId} businessName={businessName} country={country} locations={locations}
        onEnabledLoaded={setEnabled}
        onOrderingChanged={(on) => { setEnabled(on); onOrderingChanged(on); }}
        onOpenOrders={onOpenOrders} />
    </div>
  );
}

function OrderingSetup({ campaignId, businessName, country, locations, onEnabledLoaded, onOrderingChanged, onOpenOrders }: {
  campaignId: string; businessName: string; country: string | null; locations: Location[];
  onEnabledLoaded: (on: boolean) => void; onOrderingChanged: (on: boolean) => void; onOpenOrders: () => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const money = useMemo(() => menuMoney(country, i18n.language), [country, i18n.language]);
  const [settings, setSettings] = useState<OrderingSettings | null>(null);
  const [menu, setMenu] = useState<{ categories: MenuCategory[]; items: MenuItem[] } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const reloadMenu = useCallback(() => listMenu(campaignId).then(setMenu), [campaignId]);
  useEffect(() => {
    let live = true;
    Promise.all([getOrderingSettings(campaignId), listMenu(campaignId)])
      .then(([s, m]) => {
        if (!live) return;
        setSettings(s); setNote(s.note ?? ''); setMenu(m); onEnabledLoaded(s.enabled);
      })
      .catch(() => { if (live) setLoadError(true); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  const fail = () => toast.error(t('dash.addons.saveErr', { defaultValue: "Couldn't save. Please try again." }));
  // Runs a change, reloads the menu, keeps the screen calm on errors.
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); await reloadMenu(); } catch { fail(); } finally { setBusy(false); }
  };
  const saveSettings = async (next: OrderingSettings) => {
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

  if (loadError) {
    return <p className="text-sm text-red-600">{t('dash.addons.loadErr', { defaultValue: "Couldn't load your menu. Please refresh the page." })}</p>;
  }
  if (!settings || !menu) {
    return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>;
  }

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

  return (
    <div className="space-y-6">
      {/* 1. Switch */}
      <section className="border notion-border rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-[#37352F]">{t('dash.addons.takeOrders', { defaultValue: 'Take orders' })}</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {t('dash.addons.takeOrdersHint', { defaultValue: "When this is off, guests can still see your menu but can't order." })}
            </p>
          </div>
          <button role="switch" aria-checked={settings.enabled} onClick={() => void toggle()}
            disabled={busy || (!settings.enabled && availableCount === 0)}
            className={`relative w-12 h-7 rounded-full shrink-0 transition disabled:opacity-40 ${settings.enabled ? 'bg-green-600' : 'bg-gray-300'}`}>
            <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${settings.enabled ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>
        {!settings.enabled && availableCount === 0 && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            {t('dash.addons.addItemFirst', { defaultValue: 'Add at least one item to your menu below, then switch this on.' })}
          </p>
        )}
        {settings.enabled && (
          <button onClick={onOpenOrders} className={btnLight}><ClipboardList className="w-4 h-4" />{t('dash.addons.goOrders', { defaultValue: 'Go to Orders' })}</button>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1.5">{t('dash.addons.noteLabel', { defaultValue: 'Message on your menu (optional)' })}</label>
          <div className="flex gap-2">
            <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} className={inputCls}
              placeholder={t('dash.addons.notePh', { defaultValue: 'e.g. Kitchen closes at 9 pm' })} />
            <button className={btnLight} disabled={busy || note.trim() === (settings.note ?? '')}
              onClick={async () => { if (await saveSettings({ ...settings, note: note.trim() || null })) toast.success(t('dash.addons.saved', { defaultValue: 'Saved' })); }}>
              {t('dash.addons.save', { defaultValue: 'Save' })}
            </button>
          </div>
        </div>
      </section>

      {/* 2. Menu */}
      <MenuEditor menu={menu} money={money} busy={busy} campaignId={campaignId} run={run} />

      {/* 3. Table QR codes */}
      <TableQrCodes campaignId={campaignId} businessName={businessName} locations={locations}
        settings={settings} busy={busy} onSave={saveSettings} />
    </div>
  );
}

// ---- Menu editor ---------------------------------------------------------------------

function MenuEditor({ menu, money, busy, campaignId, run }: {
  menu: { categories: MenuCategory[]; items: MenuItem[] }; money: (n: number) => string; busy: boolean;
  campaignId: string; run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [newCat, setNewCat] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; categoryId: string | null } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const groups: Array<{ cat: MenuCategory | null; items: MenuItem[] }> = [
    ...menu.categories.map((c) => ({ cat: c, items: menu.items.filter((i) => i.categoryId === c.id) })),
  ];
  const loose = menu.items.filter((i) => !i.categoryId || !menu.categories.some((c) => c.id === i.categoryId));
  if (loose.length > 0 || menu.categories.length === 0) groups.push({ cat: null, items: loose });

  // Swap with the neighbour, writing clean positions for the whole list.
  const move = (list: Array<{ id: string }>, index: number, dir: -1 | 1, save: (id: string, position: number) => Promise<void>) => {
    const j = index + dir;
    if (j < 0 || j >= list.length) return;
    const order = list.map((x) => x.id);
    [order[index], order[j]] = [order[j], order[index]];
    void run(() => Promise.all(order.map((id, pos) => save(id, pos))));
  };

  return (
    <section className="border notion-border rounded-xl p-5 sm:p-6 space-y-5">
      <div>
        <h3 className="font-semibold text-[#37352F]">{t('dash.addons.menuHeading', { defaultValue: 'Your menu' })}</h3>
        <p className="text-sm text-gray-500 mt-0.5">{t('dash.addons.menuHeadingHint', { defaultValue: 'Group items into categories like Drinks or Food. Mark an item as sold out to hide it from guests.' })}</p>
      </div>

      <form className="flex flex-col sm:flex-row gap-2" onSubmit={(e) => {
        e.preventDefault();
        const name = newCat.trim();
        if (!name) return;
        void run(() => createCategory(campaignId, name.slice(0, 60), menu.categories.length)).then(() => setNewCat(''));
      }}>
        <input value={newCat} maxLength={60} onChange={(e) => setNewCat(e.target.value)} className={inputCls}
          placeholder={t('dash.addons.newCatPh', { defaultValue: 'New category, e.g. Drinks' })} />
        <button className={`${btnLight} whitespace-nowrap shrink-0`} disabled={busy || !newCat.trim()}><Plus className="w-4 h-4" />{t('dash.addons.addCat', { defaultValue: 'Add category' })}</button>
      </form>

      {groups.map(({ cat, items }, gi) => (
        <div key={cat?.id ?? 'none'} className="rounded-xl bg-[#FBFBFA] border notion-border">
          <div className="flex items-center gap-2 px-4 py-3 border-b notion-border">
            {renaming && cat && renaming.id === cat.id ? (
              <form className="flex gap-2 flex-1" onSubmit={(e) => {
                e.preventDefault();
                const name = renaming.name.trim();
                if (name) void run(() => updateCategory(cat.id, { name: name.slice(0, 60) })).then(() => setRenaming(null));
              }}>
                <input autoFocus value={renaming.name} maxLength={60} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} className={inputCls} />
                <button className={btnDark} disabled={busy || !renaming.name.trim()}>{t('dash.addons.save', { defaultValue: 'Save' })}</button>
                <button type="button" className={iconBtn} onClick={() => setRenaming(null)}><X className="w-4 h-4" /></button>
              </form>
            ) : (
              <>
                <span className="font-medium text-[#37352F] flex-1 truncate">{cat ? cat.name : t('dash.addons.noCategory', { defaultValue: 'Other items' })}</span>
                {cat && (
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button className={iconBtn} disabled={busy || gi === 0} title={t('dash.addons.up', { defaultValue: 'Move up' })}
                      onClick={() => move(menu.categories, gi, -1, (id, position) => updateCategory(id, { position }))}><ArrowUp className="w-4 h-4" /></button>
                    <button className={iconBtn} disabled={busy || gi >= menu.categories.length - 1} title={t('dash.addons.down', { defaultValue: 'Move down' })}
                      onClick={() => move(menu.categories, gi, 1, (id, position) => updateCategory(id, { position }))}><ArrowDown className="w-4 h-4" /></button>
                    <button className={iconBtn} disabled={busy} title={t('dash.addons.rename', { defaultValue: 'Rename' })}
                      onClick={() => setRenaming({ id: cat.id, name: cat.name })}><Pencil className="w-4 h-4" /></button>
                    {confirmDelete === cat.id ? (
                      <span className="flex items-center gap-1 text-xs ml-1">
                        <button className="px-2 py-1 rounded-md bg-red-600 text-white font-medium" disabled={busy}
                          onClick={() => void run(() => deleteCategory(cat.id)).then(() => setConfirmDelete(null))}>{t('dash.addons.delete', { defaultValue: 'Delete' })}</button>
                        <button className="px-2 py-1 rounded-md text-gray-500" onClick={() => setConfirmDelete(null)}>{t('dash.addons.cancel', { defaultValue: 'Cancel' })}</button>
                      </span>
                    ) : (
                      <button className={iconBtn} disabled={busy} title={t('dash.addons.deleteCatHint', { defaultValue: 'Delete category (its items stay on the menu)' })}
                        onClick={() => setConfirmDelete(cat.id)}><Trash2 className="w-4 h-4" /></button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="divide-y divide-[#E9E9E7]">
            {items.map((item, ii) => (
              editing && editing.id === item.id ? (
                <ItemForm key={item.id} item={item} categories={menu.categories} busy={busy}
                  onCancel={() => setEditing(null)}
                  onSave={(input) => run(() => updateItem(item.id, input)).then(() => setEditing(null))} />
              ) : (
                <div key={item.id} className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className={`font-medium ${item.available ? 'text-[#37352F]' : 'text-gray-400 line-through'}`}>{item.name}</span>
                      <span className="text-sm text-gray-600">{money(item.price)}</span>
                    </div>
                    {item.description && <p className="text-xs text-gray-500 mt-0.5 break-words">{item.description}</p>}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0 flex-wrap sm:justify-end -ml-1 sm:ml-0">
                    <button onClick={() => void run(() => updateItem(item.id, { available: !item.available }))} disabled={busy}
                      className={`text-xs font-medium px-2 py-1 rounded-full mr-1 ${item.available ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {item.available ? t('dash.addons.available', { defaultValue: 'Available' }) : t('dash.addons.soldOut', { defaultValue: 'Sold out' })}
                    </button>
                    <button className={iconBtn} disabled={busy || ii === 0} title={t('dash.addons.up', { defaultValue: 'Move up' })}
                      onClick={() => move(items, ii, -1, (id, position) => updateItem(id, { position }))}><ArrowUp className="w-4 h-4" /></button>
                    <button className={iconBtn} disabled={busy || ii >= items.length - 1} title={t('dash.addons.down', { defaultValue: 'Move down' })}
                      onClick={() => move(items, ii, 1, (id, position) => updateItem(id, { position }))}><ArrowDown className="w-4 h-4" /></button>
                    <button className={iconBtn} disabled={busy} title={t('dash.addons.edit', { defaultValue: 'Edit' })}
                      onClick={() => setEditing({ id: item.id, categoryId: item.categoryId })}><Pencil className="w-4 h-4" /></button>
                    {confirmDelete === item.id ? (
                      <span className="flex items-center gap-1 text-xs ml-1">
                        <button className="px-2 py-1 rounded-md bg-red-600 text-white font-medium" disabled={busy}
                          onClick={() => void run(() => deleteItem(item.id)).then(() => setConfirmDelete(null))}>{t('dash.addons.delete', { defaultValue: 'Delete' })}</button>
                        <button className="px-2 py-1 rounded-md text-gray-500" onClick={() => setConfirmDelete(null)}>{t('dash.addons.cancel', { defaultValue: 'Cancel' })}</button>
                      </span>
                    ) : (
                      <button className={iconBtn} disabled={busy} title={t('dash.addons.delete', { defaultValue: 'Delete' })}
                        onClick={() => setConfirmDelete(item.id)}><Trash2 className="w-4 h-4" /></button>
                    )}
                  </div>
                </div>
              )
            ))}
            {editing && editing.id === null && editing.categoryId === (cat?.id ?? null) ? (
              <ItemForm categories={menu.categories} defaultCategoryId={cat?.id ?? null} busy={busy}
                onCancel={() => setEditing(null)}
                onSave={(input) => run(() => createItem(campaignId, input, items.length)).then(() => setEditing(null))} />
            ) : (
              <div className="px-4 py-3">
                <button className="inline-flex items-center gap-1.5 text-sm font-medium text-[#37352F] hover:underline disabled:opacity-40" disabled={busy}
                  onClick={() => setEditing({ id: null, categoryId: cat?.id ?? null })}>
                  <Plus className="w-4 h-4" />{t('dash.addons.addItem', { defaultValue: 'Add item' })}
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}

function ItemForm({ item, categories, defaultCategoryId = null, busy, onSave, onCancel }: {
  item?: MenuItem; categories: MenuCategory[]; defaultCategoryId?: string | null; busy: boolean;
  onSave: (input: ItemInput) => void; onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(item?.name ?? '');
  const [price, setPrice] = useState(item ? String(item.price) : '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(item ? item.categoryId : defaultCategoryId);
  const p = parsePrice(price);
  const valid = name.trim().length > 0 && !Number.isNaN(p);
  return (
    <form className="px-4 py-4 space-y-3 bg-white" onSubmit={(e) => {
      e.preventDefault();
      if (!valid) return;
      onSave({ name: name.trim().slice(0, 80), price: p, description: description.trim().slice(0, 300) || null, categoryId, available: item?.available ?? true });
    }}>
      <div className="grid sm:grid-cols-[1fr_8rem] gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{t('dash.addons.itemName', { defaultValue: 'Name' })}</label>
          <input autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className={inputCls}
            placeholder={t('dash.addons.itemNamePh', { defaultValue: 'e.g. Cappuccino' })} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{t('dash.addons.itemPrice', { defaultValue: 'Price' })}</label>
          <input value={price} inputMode="decimal" onChange={(e) => setPrice(e.target.value)} className={inputCls} placeholder="4.50" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">{t('dash.addons.itemDesc', { defaultValue: 'Description (optional)' })}</label>
        <input value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} className={inputCls}
          placeholder={t('dash.addons.itemDescPh', { defaultValue: 'e.g. With oat milk on request' })} />
      </div>
      {categories.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{t('dash.addons.itemCat', { defaultValue: 'Category' })}</label>
          <select value={categoryId ?? ''} onChange={(e) => setCategoryId(e.target.value || null)} className={inputCls}>
            <option value="">{t('dash.addons.noCategory', { defaultValue: 'Other items' })}</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}
      {price.trim() !== '' && Number.isNaN(p) && (
        <p className="text-xs text-red-600">{t('dash.addons.priceInvalid', { defaultValue: 'Enter a price like 4.50' })}</p>
      )}
      <div className="flex gap-2">
        <button className={btnDark} disabled={busy || !valid}>{busy && <Loader2 className="w-4 h-4 animate-spin" />}{t('dash.addons.save', { defaultValue: 'Save' })}</button>
        <button type="button" className={btnLight} onClick={onCancel}>{t('dash.addons.cancel', { defaultValue: 'Cancel' })}</button>
      </div>
    </form>
  );
}

// ---- Table QR codes ----------------------------------------------------------------

function TableQrCodes({ campaignId, businessName, locations, settings, busy, onSave }: {
  campaignId: string; businessName: string; locations: Location[]; settings: OrderingSettings; busy: boolean;
  onSave: (next: OrderingSettings) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const active = useMemo(() => locations.filter((l) => !l.archived), [locations]);
  const [locationId, setLocationId] = useState<string>(active[0]?.id ?? '');
  const [label, setLabel] = useState('');
  const [count, setCount] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const loc = active.length > 1 ? locationId || null : null;

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
      return `<div class="card"><div class="biz">${esc(businessName)}</div><div class="scan">${esc(t('dash.addons.printScan', { defaultValue: 'Scan to order' }))}</div>${svg}<div class="table">${esc(isTableNumber(table) ? t('dash.addons.printTable', { table, defaultValue: 'Table {{table}}' }) : table)}</div><div class="pay">${esc(t('dash.addons.printPay', { defaultValue: 'Pay at the counter' }))}</div></div>`;
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
    <section className="border notion-border rounded-xl p-5 sm:p-6 space-y-4">
      <div>
        <h3 className="font-semibold text-[#37352F]">{t('dash.addons.tablesHeading', { defaultValue: 'Table QR codes' })}</h3>
        <p className="text-sm text-gray-500 mt-0.5">{t('dash.addons.tablesHint', { defaultValue: 'Add your tables, print the codes and put one on each table. Orders show the table number.' })}</p>
      </div>

      {active.length > 1 && (
        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1.5">{t('dash.addons.location', { defaultValue: 'Location' })}</label>
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={`${inputCls} max-w-xs`}>
            {active.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <form className="flex gap-2 flex-1" onSubmit={(e) => {
          e.preventDefault();
          const n = Math.floor(Number(count));
          if (!(n >= 1 && n <= MAX_TABLES)) return;
          void addTables(Array.from({ length: n }, (_, i) => String(i + 1))).then((ok) => { if (ok) setCount(''); });
        }}>
          <input value={count} inputMode="numeric" aria-label={t('dash.addons.howMany', { defaultValue: 'How many tables?' })}
            onChange={(e) => setCount(e.target.value.replace(/\D/g, '').slice(0, 3))} className={`${inputCls.replace('w-full ', '')} w-20 shrink-0`} placeholder="12" />
          <button className={`${btnLight} whitespace-nowrap`} disabled={busy || !count}>
            {count ? t('dash.addons.addRange', { n: count, defaultValue: 'Add tables 1–{{n}}' }) : t('dash.addons.addNumbered', { defaultValue: 'Add numbered tables' })}
          </button>
        </form>
        <form className="flex gap-2 flex-1" onSubmit={(e) => {
          e.preventDefault();
          if (!label.trim()) return;
          void addTables([label]).then((ok) => { if (ok) setLabel(''); });
        }}>
          <input value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} className={inputCls}
            placeholder={t('dash.addons.tableLabelPh', { defaultValue: 'Or a name, e.g. Terrace 1' })} />
          <button className={btnLight} disabled={busy || !label.trim()}><Plus className="w-4 h-4" /></button>
        </form>
      </div>

      {settings.tables.length > 0 ? (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <button className={btnDark} onClick={print}><Printer className="w-4 h-4" />{t('dash.addons.print', { defaultValue: 'Print QR codes' })}</button>
            <a href={orderUrl(campaignId, settings.tables[0], loc)} target="_blank" rel="noreferrer" className={btnLight}>
              <ExternalLink className="w-4 h-4" />{t('dash.addons.openMenu', { defaultValue: 'Open your menu' })}
            </a>
            {confirmClear ? (
              <span className="flex items-center gap-1 text-sm ml-auto">
                <button className="px-2.5 py-1.5 rounded-md bg-red-600 text-white font-medium" disabled={busy}
                  onClick={() => void onSave({ ...settings, tables: [] }).then(() => setConfirmClear(false))}>{t('dash.addons.removeAll', { defaultValue: 'Remove all tables' })}</button>
                <button className="px-2.5 py-1.5 rounded-md text-gray-500" onClick={() => setConfirmClear(false)}>{t('dash.addons.cancel', { defaultValue: 'Cancel' })}</button>
              </span>
            ) : (
              <button className="text-sm text-gray-500 hover:text-red-600 ml-auto" disabled={busy}
                onClick={() => setConfirmClear(true)}>{t('dash.addons.removeAll', { defaultValue: 'Remove all tables' })}</button>
            )}
          </div>
          <div ref={gridRef} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {settings.tables.map((tb) => (
              <div key={tb} data-qr-card data-table={tb} className="relative border notion-border rounded-xl p-3 text-center bg-white">
                <button className="absolute top-1.5 right-1.5 p-1 rounded text-gray-300 hover:text-red-600" disabled={busy}
                  title={t('dash.addons.removeTable', { defaultValue: 'Remove table' })}
                  onClick={() => void onSave({ ...settings, tables: settings.tables.filter((x) => x !== tb) })}><X className="w-3.5 h-3.5" /></button>
                <QRCode value={orderUrl(campaignId, tb, loc)} size={256} style={{ width: '100%', height: 'auto', maxWidth: 120 }} className="mx-auto" />
                <div className="text-sm font-semibold text-[#37352F] mt-2 break-words">{isTableNumber(tb) ? t('dash.addons.printTable', { table: tb, defaultValue: 'Table {{table}}' }) : tb}</div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="text-sm text-gray-400">{t('dash.addons.noTables', { defaultValue: 'No tables yet.' })}</p>
      )}
    </section>
  );
}
