import { useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useToast } from '../ToastProvider';
import { Switch, inputCls, btnDark } from '../addonsUi';
import { saveOutreachSettings, type OutreachSettings } from '../../lib/outreach';
import { errorText } from './common';

/** Limits, sending hours and the wording of emails and Instagram messages. */
export function SettingsTab({ settings, readOnly, onSaved }: { settings: OutreachSettings; readOnly: boolean; onSaved: () => void }) {
  const toast = useRef(useToast()).current;
  const [f, setF] = useState<OutreachSettings>(settings);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof OutreachSettings>(k: K, v: OutreachSettings[K]) => setF((o) => ({ ...o, [k]: v }));
  const changed = JSON.stringify(f) !== JSON.stringify(settings);
  const save = async () => {
    setBusy(true);
    try {
      const { paused: _p, pause_reason: _r, ...rest } = f;
      await saveOutreachSettings(rest);
      toast.success('Settings saved');
      onSaved();
    } catch (e) {
      toast.error(/check|violat/i.test(String((e as Error)?.message)) ? 'Some values are out of range (daily limit 1 to 30, end hour after start hour).' : errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const label = 'block text-xs font-medium text-gray-500 mb-1';
  const hours = Array.from({ length: 25 }, (_, h) => h);
  const area = (k: 'body_tpl' | 'followup_tpl' | 'ig_tpl' | 'footer', rows: number) => (
    <textarea id={`os-${k}`} rows={rows} value={f[k]} disabled={readOnly} onChange={(e) => set(k, e.target.value)} className={`${inputCls} resize-y font-mono text-xs leading-relaxed`} />
  );

  return (
    <div className="space-y-5 max-w-3xl">
      <section className="rounded-xl border notion-border bg-white p-4 sm:p-5 space-y-4">
        <h3 className="font-semibold text-[#37352F]">Sending</h3>
        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label className={label} htmlFor="os-cap">Emails per day (at most)</label>
            <input id="os-cap" type="number" min={1} max={100} value={f.daily_cap} disabled={readOnly} onChange={(e) => set('daily_cap', Number(e.target.value))} className={inputCls} />
            <p className="text-[11px] text-gray-500 mt-1">Up to 100. Resend’s free plan allows 100 a day in total, the app’s own emails included (sign-ups, card recovery), so leave a little room.</p>
          </div>
          <div>
            <label className={label}>Sending hours (shop’s local time)</label>
            <div className="flex items-center gap-2">
              <select aria-label="From" value={f.window_start} disabled={readOnly} onChange={(e) => set('window_start', Number(e.target.value))} className={inputCls}>
                {hours.slice(0, 24).map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
              </select>
              <span className="text-gray-400">to</span>
              <select aria-label="Until" value={f.window_end} disabled={readOnly} onChange={(e) => set('window_end', Number(e.target.value))} className={inputCls}>
                {hours.slice(1).map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={label} htmlFor="os-fu">Follow-up after (days)</label>
            <input id="os-fu" type="number" min={2} max={30} value={f.followup_days} disabled={readOnly} onChange={(e) => set('followup_days', Number(e.target.value))} className={inputCls} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Switch on={f.weekdays_only} disabled={readOnly} onChange={() => set('weekdays_only', !f.weekdays_only)} label="Weekdays only" />
          <span className="text-sm text-[#37352F]">Weekdays only</span>
        </div>
      </section>

      <section className="rounded-xl border notion-border bg-white p-4 sm:p-5 space-y-4">
        <h3 className="font-semibold text-[#37352F]">Email</h3>
        <p className="text-xs text-gray-500">Fields: <code>{'{business}'}</code> <code>{'{first_line}'}</code> <code>{'{city}'}</code> <code>{'{category}'}</code>. Plain text works best: short, one link, no images.</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={label} htmlFor="os-from">Sender name</label>
            <input id="os-from" value={f.from_name} maxLength={60} disabled={readOnly} onChange={(e) => set('from_name', e.target.value)} className={inputCls} />
            <p className="text-[11px] text-gray-500 mt-1">Sent from hello@stampfix.app; replies come back there.</p>
          </div>
          <div>
            <label className={label} htmlFor="os-first">Default first line</label>
            <input id="os-first" value={f.default_first_line} maxLength={300} disabled={readOnly} onChange={(e) => set('default_first_line', e.target.value)} className={inputCls} />
            <p className="text-[11px] text-gray-500 mt-1">Used when a shop has no personal first line.</p>
          </div>
        </div>
        <div>
          <label className={label} htmlFor="os-subj">Subject</label>
          <input id="os-subj" value={f.subject_tpl} maxLength={150} disabled={readOnly} onChange={(e) => set('subject_tpl', e.target.value)} className={inputCls} />
        </div>
        <div><label className={label} htmlFor="os-body_tpl">First email</label>{area('body_tpl', 14)}</div>
        <div>
          <label className={label} htmlFor="os-fsubj">Follow-up subject</label>
          <input id="os-fsubj" value={f.followup_subject_tpl} maxLength={150} disabled={readOnly} onChange={(e) => set('followup_subject_tpl', e.target.value)} className={inputCls} />
        </div>
        <div><label className={label} htmlFor="os-followup_tpl">Follow-up email</label>{area('followup_tpl', 7)}</div>
        <div>
          <label className={label} htmlFor="os-footer">Footer under every email</label>
          {area('footer', 3)}
          <p className="text-[11px] text-gray-500 mt-1">Required by anti-spam laws (Canada’s CASL, the US CAN-SPAM Act): your business name, a postal address you get mail at, and how to opt out.</p>
        </div>
      </section>

      <section className="rounded-xl border notion-border bg-white p-4 sm:p-5 space-y-4">
        <h3 className="font-semibold text-[#37352F]">Instagram</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={label} htmlFor="os-iga">Our Instagram name</label>
            <input id="os-iga" value={f.ig_account ?? ''} disabled={readOnly} onChange={(e) => set('ig_account', e.target.value)} className={inputCls} placeholder="stampfix.app" />
          </div>
          <div>
            <label className={label} htmlFor="os-igl">Suggested messages per day</label>
            <input id="os-igl" type="number" min={1} max={100} value={f.ig_daily_limit} disabled={readOnly} onChange={(e) => set('ig_daily_limit', Number(e.target.value))} className={inputCls} />
          </div>
        </div>
        <div><label className={label} htmlFor="os-ig_tpl">Message</label>{area('ig_tpl', 5)}</div>
      </section>

      {!readOnly && (
        <div className="sticky bottom-4 flex justify-end">
          <button type="button" className={`${btnDark} shadow-lg`} disabled={busy || !changed} onClick={() => void save()}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}Save settings
          </button>
        </div>
      )}
    </div>
  );
}
