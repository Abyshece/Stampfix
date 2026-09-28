import { useEffect, useState } from 'react';
import { Loader2, Plus, Megaphone, Trash2, Eye, EyeOff, Edit2 } from 'lucide-react';
import {
  adminListMerchantBanners, adminSaveMerchantBanner, adminDeleteMerchantBanner, BANNER_TABS,
  type MerchantBanner, type MerchantBannerInput, type BannerTab, type BannerVariant,
} from '../services/merchantBanners';
import { MerchantBannerView } from './MerchantBannerBar';
import { toLocalInput } from '../lib/datetimeLocal';

/**
 * Admin → Merchant Banners. Announcements shown at the top of every
 * merchant's dashboard (the merchant-facing twin of the Offers banners on
 * the public site): new features, tips, maintenance notices.
 *
 * Each banner can target a plan and a minimum number of customers, run in a
 * date window, have a German version, and carry a button that opens a
 * dashboard page or a link. Merchants see it as the owner only (not in staff
 * mode) and never on the scanner screen; closing it is saved to their account.
 */
export function MerchantBannersTab({ readOnly }: { readOnly: boolean }) {
  const [banners, setBanners] = useState<MerchantBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<MerchantBanner | null>(null);
  const [isNew, setIsNew] = useState(false);

  const load = async () => {
    setLoading(true); setLoadErr(null);
    try { setBanners(await adminListMerchantBanners()); }
    catch (e) { setLoadErr(e instanceof Error ? e.message : 'Could not load banners'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const openNew = () => {
    setEditing({
      id: '', headline: '', body: null, headline_de: null, body_de: null,
      cta_label: null, cta_label_de: null, cta_tab: null, cta_url: null,
      variant: 'blue', audience: 'all', min_customers: 0, is_active: false,
      starts_at: null, ends_at: null, created_at: '', updated_at: '',
      clicked_count: 0, closed_count: 0, eligible_count: 0,
    });
    setIsNew(true);
  };

  const toggleActive = async (b: MerchantBanner) => {
    try { await adminSaveMerchantBanner(b.id, { ...pickInput(b), is_active: !b.is_active }); await load(); }
    catch (e) { alert(e instanceof Error ? e.message : 'Could not change it'); }
  };

  const remove = async (b: MerchantBanner) => {
    if (!confirm(`Delete the banner "${b.headline}"? This cannot be undone.`)) return;
    try { await adminDeleteMerchantBanner(b.id); await load(); }
    catch (e) { alert(e instanceof Error ? e.message : 'Could not delete'); }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-serif-display font-semibold mb-1 flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-gray-500" /> Merchant Banners
          </h1>
          <p className="text-gray-500 text-sm max-w-2xl">
            Announcements at the top of every merchant’s dashboard, like new features or tips. Shown to the shop owner only
            (not in staff mode) and never on the scanner screen. When a merchant closes a banner or uses its button, it stays gone for them.
          </p>
        </div>
        <button onClick={openNew} disabled={readOnly}
          className="bg-[#37352F] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-opacity-90 flex items-center gap-2 disabled:opacity-40">
          <Plus className="w-4 h-4" /> New banner
        </button>
      </header>

      {loadErr ? (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-4 py-3">{loadErr}</div>
      ) : loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : banners.length === 0 ? (
        <div className="text-sm text-gray-500 bg-white border notion-border rounded-lg p-8 text-center">No banners yet. Click “New banner” to announce something to your merchants.</div>
      ) : (
        <div className="space-y-2">
          {banners.map((b) => (
            <BannerRow key={b.id} banner={b} readOnly={readOnly}
              onEdit={() => { setEditing(b); setIsNew(false); }}
              onToggleActive={() => void toggleActive(b)}
              onDelete={() => void remove(b)} />
          ))}
        </div>
      )}

      {editing && (
        <BannerEditor banner={editing} isNew={isNew} readOnly={readOnly}
          onClose={() => { setEditing(null); setIsNew(false); }}
          onSaved={() => { setEditing(null); setIsNew(false); void load(); }} />
      )}
    </div>
  );
}

function pickInput(b: MerchantBanner): MerchantBannerInput {
  return {
    headline: b.headline, body: b.body, headline_de: b.headline_de, body_de: b.body_de,
    cta_label: b.cta_label, cta_label_de: b.cta_label_de, cta_tab: b.cta_tab, cta_url: b.cta_url,
    variant: b.variant, audience: b.audience, min_customers: b.min_customers, is_active: b.is_active,
    starts_at: b.starts_at, ends_at: b.ends_at,
  };
}

const tabLabel = (tab: BannerTab | null) => BANNER_TABS.find(([k]) => k === tab)?.[1] ?? tab;

function whoLine(b: Pick<MerchantBanner, 'audience' | 'min_customers'>): string {
  const plan = b.audience === 'free' ? 'Free-plan merchants' : b.audience === 'pro' ? 'Pro merchants' : 'All merchants';
  return b.min_customers > 0 ? `${plan} with ${b.min_customers}+ customers` : plan;
}

function BannerRow({ banner, readOnly, onEdit, onToggleActive, onDelete }: {
  banner: MerchantBanner; readOnly: boolean; onEdit: () => void; onToggleActive: () => void; onDelete: () => void;
}) {
  const variantBg: Record<string, string> = {
    red: 'bg-red-100 text-red-700 border-red-200',
    blue: 'bg-blue-100 text-blue-700 border-blue-200',
    green: 'bg-green-100 text-green-700 border-green-200',
    amber: 'bg-amber-100 text-amber-700 border-amber-200',
  };
  const isLive = banner.is_active
    && (!banner.starts_at || new Date(banner.starts_at) <= new Date())
    && (!banner.ends_at || new Date(banner.ends_at) > new Date());

  return (
    <div className="bg-white border notion-border rounded-lg p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${variantBg[banner.variant]}`}>{banner.variant}</span>
            {isLive ? (
              <span className="text-[10px] font-semibold uppercase tracking-wider bg-green-100 text-green-700 px-2 py-0.5 rounded">● Live</span>
            ) : banner.is_active ? (
              <span className="text-[10px] font-semibold uppercase tracking-wider bg-gray-100 text-gray-600 px-2 py-0.5 rounded">Scheduled / expired</span>
            ) : (
              <span className="text-[10px] font-semibold uppercase tracking-wider bg-gray-100 text-gray-500 px-2 py-0.5 rounded">Inactive</span>
            )}
            {banner.headline_de && <span className="text-[10px] font-semibold uppercase tracking-wider bg-gray-100 text-gray-500 px-2 py-0.5 rounded">EN + DE</span>}
            <span className="font-medium text-sm">{banner.headline}</span>
          </div>
          {banner.body && <div className="text-xs text-gray-500">{banner.body}</div>}
          <div className="text-[11px] text-gray-400 flex items-center gap-x-2 gap-y-0.5 flex-wrap">
            <span>{whoLine(banner)}</span>
            {banner.cta_label && (banner.cta_tab || banner.cta_url) && (
              <span>· Button “{banner.cta_label}” → {banner.cta_tab ? tabLabel(banner.cta_tab) : banner.cta_url}</span>
            )}
            {banner.starts_at && <span>· From {new Date(banner.starts_at).toLocaleString()}</span>}
            {banner.ends_at && <span>· Until {new Date(banner.ends_at).toLocaleString()}</span>}
          </div>
          <div className="text-[11px] text-gray-500 pt-0.5">
            Would show to <strong>{banner.eligible_count}</strong> merchant{banner.eligible_count === 1 ? '' : 's'} now
            · <strong>{banner.clicked_count}</strong> used the button · <strong>{banner.closed_count}</strong> closed it
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onToggleActive} disabled={readOnly} title={banner.is_active ? 'Deactivate' : 'Activate'} className="p-1.5 hover:bg-[#F7F7F5] rounded disabled:opacity-40">
            {banner.is_active ? <Eye className="w-4 h-4 text-green-600" /> : <EyeOff className="w-4 h-4 text-gray-400" />}
          </button>
          <button onClick={onEdit} title="Edit" className="p-1.5 hover:bg-[#F7F7F5] rounded">
            <Edit2 className="w-4 h-4 text-gray-500" />
          </button>
          <button onClick={onDelete} disabled={readOnly} title="Delete" className="p-1.5 hover:bg-red-50 rounded disabled:opacity-40">
            <Trash2 className="w-4 h-4 text-red-500" />
          </button>
        </div>
      </div>
    </div>
  );
}

const inp = 'w-full bg-[#F7F7F5] border notion-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#37352F]/20';

function BannerEditor({ banner, isNew, readOnly, onClose, onSaved }: {
  banner: MerchantBanner; isNew: boolean; readOnly: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    headline: banner.headline,
    body: banner.body ?? '',
    headline_de: banner.headline_de ?? '',
    body_de: banner.body_de ?? '',
    cta_label: banner.cta_label ?? '',
    cta_label_de: banner.cta_label_de ?? '',
    cta_kind: (banner.cta_url ? 'url' : banner.cta_tab ? 'tab' : 'none') as 'none' | 'tab' | 'url',
    cta_tab: (banner.cta_tab ?? 'OFFERS') as BannerTab,
    cta_url: banner.cta_url ?? '',
    variant: banner.variant,
    audience: banner.audience,
    min_customers: String(banner.min_customers ?? 0),
    is_active: banner.is_active,
    starts_at: toLocalInput(banner.starts_at),
    ends_at: toLocalInput(banner.ends_at),
  });
  const [previewDe, setPreviewDe] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const input: MerchantBannerInput = {
    headline: form.headline.trim(),
    body: form.body.trim() || null,
    headline_de: form.headline_de.trim() || null,
    body_de: form.body_de.trim() || null,
    cta_label: form.cta_kind === 'none' ? null : form.cta_label.trim() || null,
    cta_label_de: form.cta_kind === 'none' ? null : form.cta_label_de.trim() || null,
    cta_tab: form.cta_kind === 'tab' ? form.cta_tab : null,
    cta_url: form.cta_kind === 'url' ? form.cta_url.trim() || null : null,
    variant: form.variant,
    audience: form.audience,
    min_customers: Math.max(0, parseInt(form.min_customers, 10) || 0),
    is_active: form.is_active,
    starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
    ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
  };

  const save = async () => {
    setErr(null);
    if (!input.headline) { setErr('The headline is required.'); return; }
    if (form.cta_kind !== 'none' && !input.cta_label) { setErr('Give the button a label, or choose “No button”.'); return; }
    if (form.cta_kind === 'url' && !/^https?:\/\/\S+$/i.test(form.cta_url.trim())) { setErr('The link must start with https://'); return; }
    setSaving(true);
    try { await adminSaveMerchantBanner(isNew ? null : banner.id, input); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}>
      <div role="dialog" aria-label={isNew ? 'New merchant banner' : 'Edit merchant banner'}
        className="bg-white rounded-t-xl md:rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 bg-white border-b notion-border px-5 py-3 flex items-center justify-between">
          <h3 className="font-semibold">{isNew ? 'New merchant banner' : 'Edit merchant banner'}</h3>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-[#37352F] text-xl leading-none p-2 -m-2">&times;</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Live preview */}
          <div className="bg-[#F7F7F5] border notion-border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Preview on the merchant dashboard</span>
              <div className="inline-flex flex-shrink-0 rounded-md border notion-border overflow-hidden text-[11px]">
                {(['EN', 'DE'] as const).map((l) => (
                  <button key={l} type="button" onClick={() => setPreviewDe(l === 'DE')}
                    className={`px-2.5 py-1 ${previewDe === (l === 'DE') ? 'bg-[#37352F] text-white' : 'bg-white text-gray-500'}`}>{l}</button>
                ))}
              </div>
            </div>
            <MerchantBannerView
              german={previewDe}
              banner={{
                id: 'preview', headline: input.headline || 'Your headline', body: input.body,
                headline_de: input.headline_de, body_de: input.body_de,
                cta_label: input.cta_label, cta_label_de: input.cta_label_de,
                cta_tab: input.cta_tab, cta_url: input.cta_url, variant: input.variant,
              }}
              onCta={() => {}} onDismiss={() => {}}
            />
            {previewDe && !input.headline_de && <p className="text-[11px] text-gray-400">No German version yet, so German dashboards show the English text.</p>}
          </div>

          <Field label="Headline" required hint="One short line, e.g. “New: send a message straight to your customers’ wallet cards”">
            <input value={form.headline} maxLength={160} onChange={(e) => set('headline', e.target.value)} className={inp} />
          </Field>
          <Field label="Extra text (optional)">
            <input value={form.body} maxLength={300} onChange={(e) => set('body', e.target.value)} className={inp}
              placeholder="e.g. Like “Double stamps this weekend”, it pops up on their lock screen." />
          </Field>

          <details className="border notion-border rounded-md px-3 py-2" open={!!(banner.headline_de || banner.body_de)}>
            <summary className="text-xs font-medium text-gray-600 cursor-pointer">German version (optional, shown when the dashboard is in German)</summary>
            <div className="space-y-3 pt-3">
              <Field label="Headline (German)">
                <input value={form.headline_de} maxLength={160} onChange={(e) => set('headline_de', e.target.value)} className={inp} />
              </Field>
              <Field label="Extra text (German)">
                <input value={form.body_de} maxLength={300} onChange={(e) => set('body_de', e.target.value)} className={inp} />
              </Field>
              {form.cta_kind !== 'none' && (
                <Field label="Button label (German)">
                  <input value={form.cta_label_de} maxLength={40} onChange={(e) => set('cta_label_de', e.target.value)} className={inp} />
                </Field>
              )}
            </div>
          </details>

          <Field label="Button">
            <div className="grid grid-cols-3 gap-2">
              {([['none', 'No button'], ['tab', 'Opens a dashboard page'], ['url', 'Opens a link']] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => set('cta_kind', k)}
                  className={`text-xs py-2 px-2 rounded-md border transition ${form.cta_kind === k ? 'bg-[#37352F] text-white border-[#37352F]' : 'bg-white notion-border hover:bg-[#F7F7F5]'}`}>{l}</button>
              ))}
            </div>
          </Field>
          {form.cta_kind !== 'none' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Button label" required>
                <input value={form.cta_label} maxLength={40} onChange={(e) => set('cta_label', e.target.value)} className={inp} placeholder="e.g. Try Campaigns" />
              </Field>
              {form.cta_kind === 'tab' ? (
                <Field label="Opens">
                  <select value={form.cta_tab} onChange={(e) => set('cta_tab', e.target.value as BannerTab)} className={inp}>
                    {BANNER_TABS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </Field>
              ) : (
                <Field label="Link">
                  <input type="url" value={form.cta_url} onChange={(e) => set('cta_url', e.target.value)} className={inp} placeholder="https://stampfix.app/blog/…" />
                </Field>
              )}
            </div>
          )}

          <Field label="Color">
            <div className="grid grid-cols-4 gap-2">
              {(['blue', 'green', 'amber', 'red'] as const).map((v: BannerVariant) => (
                <button key={v} type="button" onClick={() => set('variant', v)}
                  className={`text-xs py-2 rounded-md border transition capitalize ${
                    form.variant === v
                      ? v === 'red' ? 'bg-red-600 text-white border-red-600'
                      : v === 'blue' ? 'bg-blue-600 text-white border-blue-600'
                      : v === 'green' ? 'bg-green-600 text-white border-green-600'
                      : 'bg-amber-500 text-white border-amber-500'
                      : 'bg-white notion-border hover:bg-[#F7F7F5]'
                  }`}>{v}</button>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">Blue for news. Green, amber and red already mean approved, under review and rejected on the dashboard.</p>
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Who sees it">
              <select value={form.audience} onChange={(e) => set('audience', e.target.value as MerchantBanner['audience'])} className={inp}>
                <option value="all">All merchants</option>
                <option value="free">Free plan only</option>
                <option value="pro">Pro only (paying and comped)</option>
              </select>
            </Field>
            <Field label="Only shops with at least … customers" hint="0 = every shop">
              <input type="number" min={0} value={form.min_customers} onChange={(e) => set('min_customers', e.target.value)} className={inp} />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Starts at (optional)">
              <input type="datetime-local" value={form.starts_at} onChange={(e) => set('starts_at', e.target.value)} className={inp} />
            </Field>
            <Field label="Ends at (optional)">
              <input type="datetime-local" value={form.ends_at} onChange={(e) => set('ends_at', e.target.value)} className={inp} />
            </Field>
          </div>

          <label className="flex gap-2.5 cursor-pointer items-start pt-2 border-t notion-border">
            <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#37352F]" />
            <span className="text-sm text-gray-700">
              Active — show this banner on merchant dashboards
              <span className="block text-[11px] text-gray-400 mt-0.5">If dates are set, it only shows between them. The newest active banner is shown first; when a merchant closes it, the next one appears.</span>
            </span>
          </label>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>

        <div className="sticky bottom-0 bg-white border-t notion-border px-5 py-3 flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-sm px-3 py-1.5 rounded notion-border border hover:bg-[#F7F7F5]">Cancel</button>
          <button onClick={() => void save()} disabled={saving || readOnly}
            className="bg-[#37352F] text-white text-sm px-4 py-1.5 rounded hover:bg-opacity-90 disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-600 block">{label} {required && <span className="text-red-500">*</span>}</label>
      {children}
      {hint && <p className="text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}
