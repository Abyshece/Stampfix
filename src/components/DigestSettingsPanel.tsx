import { useEffect, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { getDigestSettings, saveDigestSettings, sendTestDigest, digestEmailConfigured, type DigestSettings } from '../services/admin';

function stamp(at?: string, ok?: boolean): string {
  if (!at) return 'never';
  return `${new Date(at).toLocaleString()}${ok === false ? ' — failed' : ''}`;
}

/** Daily email digest + alert settings, with a "send test now" button. */
export function DigestSettingsPanel({ readOnly }: { readOnly: boolean }) {
  const [settings, setSettings] = useState<DigestSettings | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [alerts, setAlerts] = useState(true);
  const [recipients, setRecipients] = useState('');
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const apply = (s: DigestSettings) => {
    setSettings(s);
    setEnabled(s.enabled);
    setAlerts(s.alerts);
    setRecipients(s.recipients.join('\n'));
  };

  useEffect(() => {
    getDigestSettings().then(apply).catch((e) => setLoadErr(e instanceof Error ? e.message : 'Could not load the settings'));
    digestEmailConfigured().then(setConfigured).catch(() => setConfigured(null));
  }, []);

  const list = () => recipients.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);

  const save = async () => {
    setBusy('save'); setMsg(null);
    try {
      apply(await saveDigestSettings(enabled, alerts, list()));
      setMsg({ ok: true, text: 'Saved.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Save failed' });
    } finally { setBusy(null); }
  };

  const test = async () => {
    setBusy('test'); setMsg(null);
    try {
      const r = await sendTestDigest();
      setMsg(r.sent
        ? { ok: true, text: `Sent to ${r.recipients ?? 0} address${r.recipients === 1 ? '' : 'es'}. Check your inbox (and spam folder).` }
        : { ok: false, text: r.why ?? 'Nothing was sent.' });
      getDigestSettings().then(apply).catch(() => {});
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not send the test email' });
    } finally { setBusy(null); }
  };

  if (loadErr) return <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-4 py-3">{loadErr}</div>;
  if (!settings) return <div className="flex items-center gap-2 text-gray-400 text-sm py-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;

  const st = settings.state;
  const dirty = enabled !== settings.enabled || alerts !== settings.alerts || list().join(',') !== settings.recipients.join(',');

  return (
    <div className="max-w-2xl space-y-4">
      {configured === false && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-md px-4 py-3">
          Email isn’t set up yet: add the <code className="font-mono">RESEND_API_KEY</code> secret in Supabase → Edge Functions → Secrets. Until then nothing is sent.
        </div>
      )}
      <div className="bg-white border notion-border rounded-lg p-5 space-y-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={enabled} disabled={readOnly} onChange={(e) => setEnabled(e.target.checked)} className="mt-1" />
          <span>
            <span className="block text-sm font-medium">Daily digest</span>
            <span className="block text-xs text-gray-500">Every morning around 7:00 (German time): new merchants and customers, stamps, rewards, and anything that needs you.</span>
          </span>
        </label>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={alerts} disabled={readOnly} onChange={(e) => setAlerts(e.target.checked)} className="mt-1" />
          <span>
            <span className="block text-sm font-medium">Alerts</span>
            <span className="block text-xs text-gray-500">Checked every hour: an email when 5+ Apple Wallet errors happen within an hour, or a scheduled job fails. At most one of each kind every 6 hours.</span>
          </span>
        </label>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Send to</label>
          <textarea
            value={recipients} disabled={readOnly} onChange={(e) => setRecipients(e.target.value)} rows={3}
            placeholder="one email address per line"
            className="w-full bg-[#F7F7F5] border notion-border rounded-md px-3 py-2 text-sm font-mono"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => void save()} disabled={readOnly || busy !== null || !dirty}
            className="bg-[#37352F] text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-40 inline-flex items-center gap-1.5">
            {busy === 'save' && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save
          </button>
          <button onClick={() => void test()} disabled={readOnly || busy !== null || dirty}
            title={dirty ? 'Save your changes first' : undefined}
            className="border notion-border px-4 py-2 rounded-md text-sm hover:bg-[#F7F7F5] disabled:opacity-40 inline-flex items-center gap-1.5">
            {busy === 'test' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Send test now
          </button>
          {msg && <span className={`text-xs ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</span>}
        </div>
      </div>
      <div className="text-xs text-gray-500 space-y-1">
        <div>Last daily digest: {stamp(st.last_daily_at, st.last_daily_ok)}</div>
        <div>Last alert: {stamp(st.last_alert_at, st.last_alert_ok)}</div>
        <div>Last test: {stamp(st.last_test_at, st.last_test_ok)}</div>
        {st.last_error && <div className="text-red-600">Last error: {st.last_error}</div>}
      </div>
    </div>
  );
}
