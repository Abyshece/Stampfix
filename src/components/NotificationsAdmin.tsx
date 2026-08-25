import { useState, useEffect } from 'react';
import { Send, Trash2 } from 'lucide-react';
import { adminListNotifications, adminCreateNotification, adminDeleteNotification, type NotificationRow } from '../lib/db';
import { listMerchants, type MerchantRow } from '../services/admin';

export function NotificationsAdmin() {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [merchantId, setMerchantId] = useState('');
  const [merchants, setMerchants] = useState<MerchantRow[]>([]);
  const [msgErr, setMsgErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = () => adminListNotifications().then(setItems).catch(() => {});
  useEffect(() => { load(); listMerchants('', 500).then(setMerchants).catch(() => {}); }, []);

  const send = async () => {
    if (!title.trim() || !body.trim()) return;
    const target = merchantId.trim();
    const targetName = merchants.find((m) => m.id === target)?.business_name;
    setBusy(true); setMsg(null); setMsgErr(false);
    try {
      await adminCreateNotification(title.trim(), body.trim(), target || undefined);
      setTitle(''); setBody(''); setMerchantId('');
      setMsg(target ? `Sent to ${targetName ?? 'that merchant'}.` : 'Sent to all merchants.');
      load();
    } catch (e) { setMsgErr(true); setMsg(e instanceof Error ? e.message : 'Failed to send'); }
    finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this notification for everyone?')) return;
    try { await adminDeleteNotification(id); load(); } catch { /* ignore */ }
  };

  const inp = 'w-full bg-[#F7F7F5] border notion-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400';

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-serif-display font-semibold text-[#37352F]">Notifications</h2>
        <p className="text-sm text-gray-500">Send an announcement to every merchant&rsquo;s dashboard bell.</p>
      </div>

      <div className="rounded-xl border notion-border bg-white p-4 space-y-3">
        <input className={inp} value={title} maxLength={80} placeholder="Title (e.g. New feature: geo-notifications)" onChange={(e) => setTitle(e.target.value)} />
        <textarea className={inp} rows={4} value={body} maxLength={500} placeholder="Message to merchants\u2026" onChange={(e) => setBody(e.target.value)} />
        <select className={inp} value={merchantId} onChange={(e) => setMerchantId(e.target.value)}>
          <option value="">All merchants (broadcast)</option>
          {merchants.map((m) => (
            <option key={m.id} value={m.id}>{m.business_name} ({m.merchant_code})</option>
          ))}
        </select>
        <div className="flex items-center gap-3">
          <button onClick={send} disabled={busy} className="inline-flex items-center gap-1.5 bg-[#37352F] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-opacity-90 transition disabled:opacity-50">
            <Send className="w-4 h-4" /> {busy ? 'Sending\u2026' : (merchantId.trim() ? 'Send to this merchant' : 'Send to all merchants')}
          </button>
          {msg && <span className={`text-xs ${msgErr ? 'text-red-600' : 'text-green-700'}`}>{msg}</span>}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-[#37352F] mb-2">Sent ({items.length})</h3>
        <div className="space-y-2">
          {items.map((n) => (
            <div key={n.id} className="flex items-start gap-3 rounded-lg border notion-border bg-white px-3 py-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[#37352F]">{n.title}</div>
                <div className="text-xs text-gray-500 whitespace-pre-wrap">{n.body}</div>
                <div className="text-[10px] text-gray-400 mt-1">{new Date(n.created_at).toLocaleString()}</div>
              </div>
              <button onClick={() => remove(n.id)} className="text-gray-400 hover:text-red-600 flex-shrink-0" aria-label="Delete"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          {items.length === 0 && <p className="text-sm text-gray-400">None sent yet.</p>}
        </div>
      </div>
    </div>
  );
}
