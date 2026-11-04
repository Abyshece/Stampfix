import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { X, MoreHorizontal, Loader2, type LucideIcon } from 'lucide-react';

// Shared bits of the Add-ons screens (digital menu, coupons).

export const inputCls = 'w-full border notion-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#37352F]/10';
export const btnDark = 'inline-flex items-center justify-center gap-1.5 bg-[#37352F] text-white px-3.5 py-2 rounded-lg text-sm font-medium hover:bg-[#2a2a28] disabled:opacity-40 transition whitespace-nowrap';
export const btnLight = 'inline-flex items-center justify-center gap-1.5 border notion-border bg-white px-3 py-2 rounded-lg text-sm text-[#37352F] hover:bg-[#F7F7F5] disabled:opacity-40 transition whitespace-nowrap';
export const iconBtn = 'p-1.5 rounded-md text-gray-400 hover:text-[#37352F] hover:bg-[#F1F1EF] disabled:opacity-30 transition';

/** "8,50" or "8.50" -> 8.5; NaN when it isn't a valid price. */
export function parsePrice(s: string): number {
  const v = Number(s.replace(',', '.').trim());
  return s.trim() !== '' && Number.isFinite(v) && v >= 0 && v <= 100000 ? Math.round(v * 100) / 100 : NaN;
}

export function ConfirmDialog({ title, body, confirmLabel, busy, onConfirm, onClose }: {
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
export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
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

export function Switch({ on, onChange, disabled, label, size = 'md' }: {
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
export function ActionMenu({ label, actions }: {
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
