import { useEffect, useState } from 'react';
import { Loader2, Plus, Tag, Trash2, Eye, EyeOff, Edit2 } from 'lucide-react';
import {
  adminListPromoBanners, upsertPromoBanner, deletePromoBanner,
  type PromoBanner,
} from '../services/admin';

/**
 * Admin → Offers tab. Lets the platform admin create, edit, activate,
 * and delete promotional banners that appear on the marketing site.
 *
 * Each banner has a headline + optional subtext, coupon code,
 * discount %, CTA URL, date window, and a colour variant.
 *
 * The coupon code is shown to visitors as informational only — actual
 * checkout discounting requires wiring Stripe coupon objects, which
 * is intentionally out of scope here.
 */
export function OffersTab() {
  const [banners, setBanners] = useState<PromoBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PromoBanner | null>(null);
  const [isNew, setIsNew] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setBanners(await adminListPromoBanners()); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing({
      id: '', headline: '', subtext: null, coupon_code: null,
      discount_percent: null, cta_url: null,
      is_active: false, starts_at: null, ends_at: null,
      variant: 'red',
      created_at: '', updated_at: '',
    });
    setIsNew(true);
  };

  const handleToggleActive = async (b: PromoBanner) => {
    try {
      await upsertPromoBanner({
        id: b.id,
        headline: b.headline,
        subtext: b.subtext,
        coupon_code: b.coupon_code,
        discount_percent: b.discount_percent,
        cta_url: b.cta_url,
        is_active: !b.is_active,
        starts_at: b.starts_at,
        ends_at: b.ends_at,
        variant: b.variant,
      });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not toggle');
    }
  };

  const handleDelete = async (b: PromoBanner) => {
    if (!confirm(`Delete the banner "${b.headline}"? This cannot be undone.`)) return;
    try { await deletePromoBanner(b.id); await load(); }
    catch (e) { alert(e instanceof Error ? e.message : 'Could not delete'); }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-serif-display font-semibold mb-1 flex items-center gap-2">
            <Tag className="w-6 h-6 text-gray-500" /> Offers
          </h1>
          <p className="text-gray-500 text-sm">Promotional banners shown on the public landing page. Active banners appear at the top of stampfix.app.</p>
        </div>
        <button
          onClick={openNew}
          className="bg-[#37352F] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-opacity-90 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> New banner
        </button>
      </header>

      {loading ? <Loader /> : banners.length === 0 ? (
        <Empty msg="No banners yet. Click 'New banner' to create your first offer." />
      ) : (
        <div className="space-y-2">
          {banners.map((b) => (
            <BannerRow
              key={b.id}
              banner={b}
              onEdit={() => { setEditing(b); setIsNew(false); }}
              onToggleActive={() => handleToggleActive(b)}
              onDelete={() => handleDelete(b)}
            />
          ))}
        </div>
      )}

      {editing && (
        <BannerEditor
          banner={editing}
          isNew={isNew}
          onClose={() => { setEditing(null); setIsNew(false); }}
          onSaved={() => { setEditing(null); setIsNew(false); load(); }}
        />
      )}
    </div>
  );
}

function BannerRow({
  banner, onEdit, onToggleActive, onDelete,
}: {
  banner: PromoBanner;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
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
            {/* Mini preview swatch */}
            <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${variantBg[banner.variant]}`}>
              {banner.variant}
            </span>
            {isLive ? (
              <span className="text-[10px] font-semibold uppercase tracking-wider bg-green-100 text-green-700 px-2 py-0.5 rounded">● Live</span>
            ) : banner.is_active ? (
              <span className="text-[10px] font-semibold uppercase tracking-wider bg-gray-100 text-gray-600 px-2 py-0.5 rounded">Scheduled / expired</span>
            ) : (
              <span className="text-[10px] font-semibold uppercase tracking-wider bg-gray-100 text-gray-500 px-2 py-0.5 rounded">Inactive</span>
            )}
            <span className="font-medium text-sm">{banner.headline}</span>
          </div>
          {banner.subtext && <div className="text-xs text-gray-500">{banner.subtext}</div>}
          <div className="text-[11px] text-gray-400 flex items-center gap-2 flex-wrap">
            {banner.coupon_code && <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">{banner.coupon_code}</span>}
            {banner.discount_percent && <span>{banner.discount_percent}% off</span>}
            {banner.starts_at && <span>From {new Date(banner.starts_at).toLocaleDateString()}</span>}
            {banner.ends_at && <span>Until {new Date(banner.ends_at).toLocaleDateString()}</span>}
            {banner.cta_url && <span className="truncate max-w-[200px]">→ {banner.cta_url}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onToggleActive} title={banner.is_active ? 'Deactivate' : 'Activate'} className="p-1.5 hover:bg-[#F7F7F5] rounded">
            {banner.is_active ? <Eye className="w-4 h-4 text-green-600" /> : <EyeOff className="w-4 h-4 text-gray-400" />}
          </button>
          <button onClick={onEdit} title="Edit" className="p-1.5 hover:bg-[#F7F7F5] rounded">
            <Edit2 className="w-4 h-4 text-gray-500" />
          </button>
          <button onClick={onDelete} title="Delete" className="p-1.5 hover:bg-red-50 rounded">
            <Trash2 className="w-4 h-4 text-red-500" />
          </button>
        </div>
      </div>
    </div>
  );
}

function BannerEditor({
  banner, isNew, onClose, onSaved,
}: {
  banner: PromoBanner;
  isNew: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    headline: banner.headline,
    subtext: banner.subtext ?? '',
    coupon_code: banner.coupon_code ?? '',
    discount_percent: banner.discount_percent?.toString() ?? '',
    cta_url: banner.cta_url ?? '',
    is_active: banner.is_active,
    starts_at: banner.starts_at ? banner.starts_at.slice(0, 16) : '',
    ends_at: banner.ends_at ? banner.ends_at.slice(0, 16) : '',
    variant: banner.variant,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.headline.trim()) { alert('Headline is required'); return; }
    setSaving(true);
    try {
      await upsertPromoBanner({
        id: isNew ? null : banner.id,
        headline: form.headline.trim(),
        subtext: form.subtext.trim() || null,
        coupon_code: form.coupon_code.trim().toUpperCase() || null,
        discount_percent: form.discount_percent ? parseInt(form.discount_percent, 10) : null,
        cta_url: form.cta_url.trim() || null,
        is_active: form.is_active,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
        variant: form.variant,
      });
      onSaved();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-xl md:rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b notion-border px-5 py-3 flex items-center justify-between">
          <h3 className="font-semibold">{isNew ? 'New banner' : 'Edit banner'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-[#37352F] text-xl leading-none">&times;</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <Field label="Headline" required>
            <input type="text" value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })}
              placeholder="e.g. Black Friday: 20% off Pro for 12 months"
              maxLength={120}
              className="w-full bg-[#F7F7F5] border notion-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#37352F]/20"
            />
          </Field>

          <Field label="Subtext (optional)">
            <input type="text" value={form.subtext} onChange={(e) => setForm({ ...form, subtext: e.target.value })}
              placeholder="e.g. Ends Sunday at midnight"
              className="w-full bg-[#F7F7F5] border notion-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#37352F]/20"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Coupon code (optional)">
              <input type="text" value={form.coupon_code} onChange={(e) => setForm({ ...form, coupon_code: e.target.value.toUpperCase() })}
                placeholder="BLACKFRIDAY"
                className="w-full bg-[#F7F7F5] border notion-border rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#37352F]/20"
              />
            </Field>
            <Field label="Discount % (optional)">
              <input type="number" min={1} max={100} value={form.discount_percent} onChange={(e) => setForm({ ...form, discount_percent: e.target.value })}
                placeholder="20"
                className="w-full bg-[#F7F7F5] border notion-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#37352F]/20"
              />
            </Field>
          </div>

          <Field label="CTA link (optional)">
            <input type="url" value={form.cta_url} onChange={(e) => setForm({ ...form, cta_url: e.target.value })}
              placeholder="https://stampfix.app/signup?code=BLACKFRIDAY"
              className="w-full bg-[#F7F7F5] border notion-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#37352F]/20"
            />
          </Field>

          <Field label="Color">
            <div className="grid grid-cols-4 gap-2">
              {(['red', 'blue', 'green', 'amber'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setForm({ ...form, variant: v })}
                  className={`text-xs py-2 rounded-md border transition capitalize ${
                    form.variant === v
                      ? v === 'red' ? 'bg-red-600 text-white border-red-600'
                      : v === 'blue' ? 'bg-blue-600 text-white border-blue-600'
                      : v === 'green' ? 'bg-green-600 text-white border-green-600'
                      : 'bg-amber-500 text-white border-amber-500'
                      : 'bg-white notion-border hover:bg-[#F7F7F5]'
                  }`}
                >{v}</button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts at (optional)">
              <input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                className="w-full bg-[#F7F7F5] border notion-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#37352F]/20"
              />
            </Field>
            <Field label="Ends at (optional)">
              <input type="datetime-local" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                className="w-full bg-[#F7F7F5] border notion-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#37352F]/20"
              />
            </Field>
          </div>

          <label className="flex gap-2.5 cursor-pointer items-start pt-2 border-t notion-border">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="mt-0.5 w-4 h-4 accent-[#37352F]" />
            <span className="text-sm text-gray-700">
              Active — show this banner on the landing page
              <span className="block text-[11px] text-gray-400 mt-0.5">If date window is set, banner only shows within that window.</span>
            </span>
          </label>
        </div>

        <div className="sticky bottom-0 bg-white border-t notion-border px-5 py-3 flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-sm px-3 py-1.5 rounded notion-border border hover:bg-[#F7F7F5]">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="bg-[#37352F] text-white text-sm px-4 py-1.5 rounded hover:bg-opacity-90 disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-600 block">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function Loader() { return <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>; }
function Empty({ msg }: { msg: string }) { return <div className="text-sm text-gray-500 bg-white border notion-border rounded-lg p-8 text-center">{msg}</div>; }
