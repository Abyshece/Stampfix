import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, Loader2, MessageSquareHeart, Star, Wifi, X } from 'lucide-react';
import { submitPageFeedback, FEEDBACK_MAX, type FeedbackError } from '../lib/businessPage';

// The Wi-Fi and feedback sheets on the Business page. They slide up from the
// bottom on phones and sit in the middle on bigger screens.

type Accent = { bg: string; ink: string };

function Sheet({ label, onClose, children, testId }: { label: string; onClose: () => void; children: ReactNode; testId: string }) {
  const { t } = useTranslation();
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); closeRef.current(); } };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      try { before?.focus?.(); } catch { /* element gone */ }
    };
  }, []);
  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/45" data-sheet={testId}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label}
        className="relative w-full max-w-md max-h-[92vh] overflow-y-auto bg-white text-[#2F2A26] rounded-t-3xl sm:rounded-3xl shadow-2xl px-6 pt-6 outline-none"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
        <button type="button" onClick={onClose} aria-label={t('cust.page.closeStory', { defaultValue: 'Close' })} data-sheet-close
          className="absolute right-3 top-3 w-10 h-10 rounded-full flex items-center justify-center text-[#8A8178] hover:bg-[#F4F1EC]">
          <X className="w-5 h-5" />
        </button>
        {children}
      </div>
    </div>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older in-app browsers: the classic way.
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.setAttribute('readonly', '');
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand('copy');
      el.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function CopyRow({ label, value, mono, testId }: { label: string; value: string; mono?: boolean; testId: string }) {
  const { t } = useTranslation();
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle');
  return (
    <div className="rounded-2xl border border-black/10 bg-[#FAF7F2] px-4 py-3 flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[#8A8178]">{label}</div>
        <div className={`text-base font-semibold break-all select-all ${mono ? 'font-mono' : ''}`} data-wifi-value={testId}>{value}</div>
      </div>
      <button type="button" data-copy-wifi={testId}
        onClick={async () => { const ok = await copyText(value); setState(ok ? 'done' : 'failed'); setTimeout(() => setState('idle'), 2000); }}
        className={`shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold border ${state === 'done' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-black/10'}`}>
        {state === 'done' ? <><Check className="w-4 h-4" />{t('cust.page.copied', { defaultValue: 'Copied' })}</> : <><Copy className="w-4 h-4" />{t('cust.page.copy', { defaultValue: 'Copy' })}</>}
      </button>
    </div>
  );
}

/** The shop's Wi-Fi: name and password to copy, and how to join. */
export function WifiSheet({ wifi, accent, onClose }: { wifi: { ssid: string; password: string | null }; accent: Accent; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Sheet label={t('cust.page.tileWifi', { defaultValue: 'Wi-Fi' })} onClose={onClose} testId="wifi">
      <div className="flex items-center gap-3 mb-5 pr-10">
        <span className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: accent.bg, color: accent.ink }}><Wifi className="w-5 h-5" /></span>
        <h2 className="text-xl font-semibold">{t('cust.page.wifiTitle', { defaultValue: 'Free Wi-Fi' })}</h2>
      </div>
      <div className="space-y-3">
        <CopyRow label={t('cust.page.wifiNetwork', { defaultValue: 'Network' })} value={wifi.ssid} testId="ssid" />
        {wifi.password
          ? <CopyRow label={t('cust.page.wifiPassword', { defaultValue: 'Password' })} value={wifi.password} mono testId="password" />
          : <p className="text-sm text-[#5B544D] px-1" data-wifi-open>{t('cust.page.wifiOpen', { defaultValue: 'No password needed.' })}</p>}
      </div>
      <ol className="mt-5 space-y-2 text-sm text-[#5B544D] list-decimal pl-5">
        {wifi.password && <li>{t('cust.page.wifiStep1', { defaultValue: 'Copy the password.' })}</li>}
        <li>{t('cust.page.wifiStep2', { defaultValue: "Open Wi-Fi in your phone's settings." })}</li>
        <li>{wifi.password
          ? t('cust.page.wifiStep3', { ssid: wifi.ssid, defaultValue: 'Pick {{ssid}} and paste the password.' })
          : t('cust.page.wifiStep3Open', { ssid: wifi.ssid, defaultValue: 'Pick {{ssid}}.' })}</li>
      </ol>
      <button type="button" onClick={onClose} className="mt-6 w-full rounded-xl py-3.5 font-semibold" style={{ background: accent.bg, color: accent.ink }}>
        {t('cust.page.done', { defaultValue: 'Done' })}
      </button>
    </Sheet>
  );
}

const FEEDBACK_ERRORS: Record<FeedbackError, [string, string]> = {
  bad_rating: ['cust.page.fbErrRating', 'Pick how many stars first.'],
  too_long: ['cust.page.fbErrLong', 'Please keep it to 500 characters.'],
  off: ['cust.page.fbErrOff', "This shop isn't taking feedback right now."],
  too_many: ['cust.page.fbErrMany', "Thanks, we already have your feedback for today."],
  network: ['cust.page.fbErrNetwork', "Couldn't send it. Check your connection and try again."],
};

/** Anonymous feedback: stars and a message, only the shop reads it. */
export function FeedbackSheet({ campaignId, businessName, accent, preview, locationId, table, onClose }: {
  campaignId: string; businessName: string; accent: Accent; preview?: boolean; locationId: string | null; table: string | null; onClose: () => void;
}) {
  const { t } = useTranslation();
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (preview || busy) return;
    if (rating < 1) { setError(t(FEEDBACK_ERRORS.bad_rating[0], { defaultValue: FEEDBACK_ERRORS.bad_rating[1] })); return; }
    setBusy(true); setError(null);
    const r = await submitPageFeedback(campaignId, rating, message, { locationId, table });
    setBusy(false);
    if (!r.ok) { const [k, d] = FEEDBACK_ERRORS[r.error]; setError(t(k, { defaultValue: d })); return; }
    setSent(true);
  };

  return (
    <Sheet label={t('cust.page.fbTitle', { defaultValue: 'How was your visit?' })} onClose={onClose} testId="feedback">
      {sent ? (
        <div className="text-center py-4" data-feedback-sent>
          <span className="mx-auto w-14 h-14 rounded-full flex items-center justify-center mb-4" style={{ background: accent.bg, color: accent.ink }}><Check className="w-7 h-7" /></span>
          <h2 className="text-xl font-semibold mb-1">{t('cust.page.fbThanks', { defaultValue: 'Thank you!' })}</h2>
          <p className="text-sm text-[#5B544D]">{t('cust.page.fbThanksSub', { name: businessName, defaultValue: 'Your feedback went straight to {{name}}.' })}</p>
          <button type="button" onClick={onClose} className="mt-6 w-full rounded-xl py-3.5 font-semibold" style={{ background: accent.bg, color: accent.ink }}>
            {t('cust.page.done', { defaultValue: 'Done' })}
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-1 pr-10">
            <span className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: accent.bg, color: accent.ink }}><MessageSquareHeart className="w-5 h-5" /></span>
            <h2 className="text-xl font-semibold">{t('cust.page.fbTitle', { defaultValue: 'How was your visit?' })}</h2>
          </div>
          <p className="text-sm text-[#5B544D] mt-3">{t('cust.page.fbSub', { name: businessName, defaultValue: "Only {{name}} sees this. We don't ask for your name." })}</p>
          <div className="mt-5 flex justify-center gap-1.5" role="radiogroup" aria-label={t('cust.page.fbStars', { defaultValue: 'Your rating' })}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={rating === n} data-star={n}
                aria-label={t('cust.page.fbStarN', { count: n, defaultValue: n === 1 ? '1 star' : '{{count}} stars' })}
                onClick={() => { setRating(n); setError(null); }}
                className="w-12 h-12 rounded-xl flex items-center justify-center hover:bg-[#F4F1EC] transition">
                <Star className="w-9 h-9 transition" strokeWidth={1.6}
                  style={n <= rating ? { fill: '#F2B33D', color: '#E0A020' } : { color: '#CFC8BF' }} />
              </button>
            ))}
          </div>
          <label className="block mt-5">
            <span className="text-sm font-medium">{t('cust.page.fbMessage', { defaultValue: 'Anything to tell the team? (optional)' })}</span>
            <textarea value={message} maxLength={FEEDBACK_MAX} rows={4} data-feedback-message
              onChange={(e) => { setMessage(e.target.value); setError(null); }}
              placeholder={t('cust.page.fbPh', { defaultValue: 'What did you like? What could be better?' })}
              className="mt-1.5 w-full rounded-xl border border-black/10 bg-[#FAF7F2] px-3.5 py-3 text-[15px] resize-none focus:outline-none focus:ring-2 focus:ring-black/10" />
            <span className="block text-right text-xs text-[#8A8178]">{message.length}/{FEEDBACK_MAX}</span>
          </label>
          {error && <p className="text-sm text-red-600 mt-1" data-feedback-error>{error}</p>}
          {preview && <p className="text-xs text-[#8A8178] mt-1">{t('cust.page.fbPreview', { defaultValue: 'This is a preview, so nothing is sent.' })}</p>}
          <button type="button" onClick={() => void send()} disabled={busy || preview || rating < 1} data-feedback-send
            className="mt-4 w-full rounded-xl py-3.5 font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: accent.bg, color: accent.ink }}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}{t('cust.page.fbSend', { defaultValue: 'Send feedback' })}
          </button>
        </>
      )}
    </Sheet>
  );
}
