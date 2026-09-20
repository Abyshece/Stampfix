import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Megaphone, Send, Users, Loader2, Info } from 'lucide-react';
import { useToast } from './ToastProvider';
import { broadcastReach, sendBroadcast, listBroadcasts, type Broadcast } from '../lib/broadcasts';

const MAX = 100;
const initialOf = (name: string) => (name.trim()[0] || 'S').toUpperCase();

/** On-brand iPhone lock-screen preview of the notification, updating as you type. */
function PhonePreview({ businessName, message }: { businessName: string; message: string }) {
  const { t } = useTranslation();
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  const has = message.trim().length > 0;
  const body = has ? message.trim() : t('dash.offers.previewPlaceholder', { defaultValue: 'Your message will appear here' });
  return (
    <div className="w-[248px] shrink-0 rounded-[2.5rem] bg-gradient-to-b from-[#3a3a3f] to-[#2b2a27] p-2.5 shadow-2xl ring-1 ring-black/10 select-none">
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
                  <span className="text-[11px] text-gray-400 shrink-0">{t('dash.offers.previewNow', { defaultValue: 'now' })}</span>
                </div>
                <p className={`text-[12px] leading-snug mt-0.5 line-clamp-3 ${has ? '' : 'text-gray-400'}`}>{body}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function OffersPanel({ campaignId, businessName }: { campaignId: string; businessName: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [message, setMessage] = useState('');
  const [reach, setReach] = useState<number | null>(null);
  const [history, setHistory] = useState<Broadcast[]>([]);
  const [sending, setSending] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const refresh = useCallback(() => {
    broadcastReach(campaignId).then(setReach).catch(() => setReach(null));
    listBroadcasts(campaignId).then(setHistory).catch(() => setHistory([]));
  }, [campaignId]);
  useEffect(() => { refresh(); }, [refresh]);

  const trimmed = message.trim();
  const reachN = reach ?? 0;
  const canSend = trimmed.length > 0 && trimmed.length <= MAX && reachN > 0 && !sending;

  const doSend = async () => {
    setSending(true);
    try {
      const { sentCount } = await sendBroadcast(campaignId, trimmed);
      toast.success(t('dash.offers.sent', { count: sentCount, defaultValue: 'Offer sent to {{count}} customers' }));
      setMessage(''); setConfirm(false); refresh();
    } catch {
      toast.error(t('dash.offers.sendErr', { defaultValue: "Couldn't send the offer. Please try again." }));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-2 mb-1">
        <Megaphone className="w-6 h-6 text-[#37352F]" />
        <h1 className="text-2xl font-semibold text-[#37352F]">{t('dash.offers.title', { defaultValue: 'Offers' })}</h1>
      </div>
      <p className="text-gray-500 mb-8">{t('dash.offers.sub', { defaultValue: 'Send a push notification to customers who have your card installed.' })}</p>

      <div className="grid md:grid-cols-[1fr_auto] gap-8 items-start">
        <div className="space-y-6 min-w-0">
          <div>
            <label className="block text-sm font-medium text-[#37352F] mb-2">{t('dash.offers.composeLabel', { defaultValue: 'Your offer' })}</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MAX))}
              rows={3}
              placeholder={t('dash.offers.placeholder', { defaultValue: 'e.g. 20% off all coffees today — show this at the till!' })}
              className="w-full border notion-border rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#37352F]/10"
            />
            <div className="text-right text-xs text-gray-400 mt-1">{trimmed.length}/{MAX}</div>
          </div>

          <div className="border notion-border rounded-lg p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-[#37352F] mb-2">
              <Users className="w-4 h-4" /> {t('dash.offers.audienceAll', { defaultValue: 'All customers with the card installed and marketing consent' })}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xs uppercase tracking-wide text-gray-400">{t('dash.offers.reach', { defaultValue: 'Estimated reach' })}</span>
              <span className="text-2xl font-semibold text-[#37352F]">{reach === null ? '—' : reach}</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">{t('dash.offers.reachNote', { defaultValue: 'Only customers who opted in to marketing.' })}</p>
            <div className="mt-3 pt-3 border-t notion-border text-xs text-gray-400 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0" /> {t('dash.offers.segmentsSoon', { defaultValue: 'Segments and scheduling — coming soon.' })}
            </div>
          </div>

          <div>
            <button onClick={() => setConfirm(true)} disabled={!canSend}
              className="inline-flex items-center gap-2 bg-[#37352F] text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-[#2a2a28] disabled:opacity-40 disabled:cursor-not-allowed transition">
              <Send className="w-4 h-4" /> {t('dash.offers.send', { defaultValue: 'Send to all' })}
            </button>
            <p className="text-xs text-gray-400 mt-2">{t('dash.offers.sendNote', { defaultValue: 'Sends immediately. Customers see it as a lock-screen notification.' })}</p>
          </div>
        </div>

        <PhonePreview businessName={businessName} message={message} />
      </div>

      <div className="mt-12">
        <h2 className="text-sm font-semibold text-[#37352F] mb-3">{t('dash.offers.historyTitle', { defaultValue: 'Recent sends' })}</h2>
        {history.length === 0 ? (
          <p className="text-sm text-gray-400">{t('dash.offers.historyEmpty', { defaultValue: 'No offers sent yet.' })}</p>
        ) : (
          <div className="space-y-2">
            {history.map((b) => (
              <div key={b.id} className="border notion-border rounded-lg px-4 py-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-[#37352F] truncate">{b.message}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{new Date(b.createdAt).toLocaleString()}</p>
                </div>
                <span className="text-xs text-gray-500 whitespace-nowrap shrink-0">{t('dash.offers.historySent', { count: b.sentCount, defaultValue: 'Sent to {{count}}' })}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {confirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => !sending && setConfirm(false)} />
          <div className="relative bg-white rounded-xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-semibold text-[#37352F] mb-2">{t('dash.offers.confirmTitle', { count: reachN, defaultValue: 'Send this offer to {{count}} customers?' })}</h3>
            <p className="text-sm text-gray-500 mb-5">{t('dash.offers.confirmBody', { defaultValue: "They'll get a lock-screen notification now. This can't be undone." })}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirm(false)} disabled={sending} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-[#F7F7F5] transition">{t('dash.offers.cancel', { defaultValue: 'Cancel' })}</button>
              <button onClick={doSend} disabled={sending} className="inline-flex items-center gap-2 bg-[#37352F] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#2a2a28] disabled:opacity-50 transition">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {t('dash.offers.confirmSend', { defaultValue: 'Send now' })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
