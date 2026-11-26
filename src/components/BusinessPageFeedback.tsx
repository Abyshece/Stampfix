import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, MessageSquareHeart, RefreshCw, Star, Trash2, MapPin, UtensilsCrossed } from 'lucide-react';
import type { Campaign } from '../types';
import { deleteFeedback, getMyPageFeedback, markFeedbackRead, type PageFeedback } from '../lib/businessPage';

// The Feedback tab: what guests sent from the page's feedback button.
// Opening it marks everything as seen.

const card = 'bg-white rounded-xl border notion-border p-5 sm:p-6';
const btnLight = 'inline-flex items-center justify-center gap-1.5 bg-white border notion-border text-[#37352F] px-3.5 py-2 rounded-md text-sm font-medium hover:bg-[#F7F7F5] transition disabled:opacity-50';

function Stars({ n, size = 'w-4 h-4' }: { n: number; size?: string }) {
  return (
    <span className="inline-flex" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={size} strokeWidth={1.6} style={i <= n ? { fill: '#F2B33D', color: '#E0A020' } : { color: '#D6D3CE' }} />
      ))}
    </span>
  );
}

export function FeedbackTab({ campaign, feedbackOn, canEdit, onRead, onOpenProfile }: {
  campaign: Campaign; feedbackOn: boolean | null; canEdit: boolean; onRead: () => void; onOpenProfile: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<PageFeedback[] | null>(null);
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const onReadRef = useRef(onRead);
  onReadRef.current = onRead;

  useEffect(() => {
    let live = true;
    setError(false);
    getMyPageFeedback(campaign.id)
      .then(async (list) => {
        if (!live) return;
        setItems(list);
        if (list.some((x) => !x.read)) { if (await markFeedbackRead(campaign.id)) onReadRef.current(); }
        else onReadRef.current();
      })
      .catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [campaign.id, tick]);

  const remove = async (f: PageFeedback) => {
    if (!window.confirm(t('dash.feedback.confirmDelete', { defaultValue: 'Delete this feedback?' }))) return;
    setBusy(f.id);
    const ok = await deleteFeedback(f.id);
    setBusy(null);
    if (ok) setItems((l) => (l ?? []).filter((x) => x.id !== f.id));
  };

  const fmt = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(i18n.language?.startsWith('de') ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  };
  const avg = items && items.length ? items.reduce((a, x) => a + x.rating, 0) / items.length : null;

  return (
    <div className="space-y-5 max-w-3xl" data-feedback-tab>
      <p className="text-sm text-gray-500">{t('dash.feedback.sub', { defaultValue: 'Guests tap "Give feedback" on your page. They stay anonymous, and only you see what they write.' })}</p>
      {feedbackOn === false && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 flex flex-wrap items-center gap-3" data-feedback-off>
          <span className="flex-1 min-w-[200px]">{t('dash.feedback.off', { defaultValue: "The feedback button is switched off, so guests don't see it." })}</span>
          {canEdit && <button type="button" className={btnLight} onClick={onOpenProfile}>{t('dash.feedback.switchOn', { defaultValue: 'Switch it on' })}</button>}
        </div>
      )}
      {error && !items ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 flex flex-wrap items-center gap-3">
          <span className="flex-1">{t('dash.feedback.loadError', { defaultValue: "We couldn't load your feedback." })}</span>
          <button type="button" className={btnLight} onClick={() => setTick((n) => n + 1)}><RefreshCw className="w-4 h-4" />{t('dash.page.retry', { defaultValue: 'Try again' })}</button>
        </div>
      ) : !items ? (
        <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" />{t('dash.feedback.loading', { defaultValue: 'Loading feedback…' })}</div>
      ) : items.length === 0 ? (
        <div className={`${card} text-center py-10`} data-feedback-empty>
          <MessageSquareHeart className="w-8 h-8 mx-auto text-gray-300 mb-3" />
          <p className="font-medium">{t('dash.feedback.empty', { defaultValue: 'No feedback yet' })}</p>
          <p className="text-sm text-gray-500 mt-1">{t('dash.feedback.emptyHint', { defaultValue: 'When guests send some, it shows up here.' })}</p>
        </div>
      ) : (
        <>
          <div className={`${card} flex flex-wrap items-center gap-x-6 gap-y-2`} data-feedback-summary>
            <div className="flex items-center gap-2">
              <span className="text-3xl font-bold tabular-nums" data-feedback-avg>{avg!.toFixed(1).replace('.', i18n.language?.startsWith('de') ? ',' : '.')}</span>
              <Stars n={Math.round(avg!)} size="w-5 h-5" />
            </div>
            <span className="text-sm text-gray-500">{t('dash.feedback.fromN', { count: items.length, defaultValue: items.length === 1 ? 'from 1 guest' : 'from {{count}} guests' })}</span>
          </div>
          <ul className="space-y-3" data-feedback-list>
            {items.map((f) => (
              <li key={f.id} className={`${card} !p-4 sm:!p-5 ${!f.read ? 'ring-1 ring-amber-300' : ''}`} data-feedback-item={f.id}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Stars n={f.rating} />
                      {!f.read && <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 rounded-full px-2 py-0.5">{t('dash.feedback.new', { defaultValue: 'New' })}</span>}
                      <span className="text-xs text-gray-400">{fmt(f.createdAt)}</span>
                    </div>
                    {f.message
                      ? <p className="mt-2 text-sm whitespace-pre-line break-words" data-feedback-text>{f.message}</p>
                      : <p className="mt-2 text-sm text-gray-400 italic">{t('dash.feedback.starsOnly', { defaultValue: 'Stars only, no message.' })}</p>}
                    {(f.table || f.locationName) && (
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                        {f.locationName && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{f.locationName}</span>}
                        {f.table && <span className="inline-flex items-center gap-1"><UtensilsCrossed className="w-3 h-3" />{/^\d+$/.test(f.table) ? t('cust.page.tableN', { n: f.table, defaultValue: 'Table {{n}}' }) : f.table}</span>}
                      </div>
                    )}
                  </div>
                  {canEdit && (
                    <button type="button" onClick={() => void remove(f)} disabled={busy !== null} data-feedback-delete
                      aria-label={t('dash.stories.delete', { defaultValue: 'Delete' })}
                      className="w-8 h-8 rounded-md flex items-center justify-center text-gray-400 hover:bg-[#F1F1EF] hover:text-red-600 shrink-0">
                      {busy === f.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
