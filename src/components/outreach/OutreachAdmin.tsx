import { useCallback, useEffect, useState } from 'react';
import { Loader2, Search, Store, Mail, Instagram, Settings2, Send, Sparkles, MapPinned } from 'lucide-react';
import { getOutreachState, type OutreachState } from '../../lib/outreach';
import { FindTab } from './FindTab';
import { ShopsTab } from './ShopsTab';
import { EmailTab } from './EmailTab';
import { InstagramTab } from './InstagramTab';
import { SettingsTab } from './SettingsTab';
import { AiTab } from './AiTab';
import { AreasTab } from './AreasTab';
import { errorText } from './common';

type Tab = 'find' | 'shops' | 'ai' | 'email' | 'instagram' | 'areas' | 'settings';

/**
 * Admin > Outreach. Find shops anywhere (23 kinds, from map data), find the
 * email address and Instagram account on their websites (or with the AI
 * email finder), email them from hello@stampfix.app within safe limits, and
 * message them on Instagram.
 */
export function OutreachAdmin({ readOnly }: { readOnly: boolean }) {
  const [tab, setTab] = useState<Tab>('find');
  const [state, setState] = useState<OutreachState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoScan, setAutoScan] = useState(false);

  const refresh = useCallback(() => {
    getOutreachState().then((s) => { setState(s); setError(null); }).catch((e) => setError(errorText(e)));
  }, []);
  useEffect(refresh, [refresh]);

  if (error && !state) {
    return (
      <div className="max-w-xl">
        <h1 className="text-2xl font-semibold text-[#37352F] mb-2">Outreach</h1>
        <p className="text-sm text-red-600">{error}</p>
        <p className="text-sm text-gray-500 mt-2">If this is the first time, the outreach database update may not be applied yet.</p>
      </div>
    );
  }
  if (!state) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>;

  const replied = (state.email.replied ?? 0) + (state.ig.replied ?? 0);
  const tabs: Array<[Tab, typeof Search, string, number | null]> = [
    ['find', Search, 'Find shops', null],
    ['shops', Store, 'Shops', state.leads],
    ['ai', Sparkles, 'AI email finder', null],
    ['email', Mail, 'Email', state.queued || null],
    ['instagram', Instagram, 'Instagram', null],
    ['areas', MapPinned, 'Areas', null],
    ['settings', Settings2, 'Settings', null],
  ];

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2"><Send className="w-5 h-5 text-[#37352F]" /><h1 className="text-2xl font-semibold text-[#37352F]">Outreach</h1></div>
          <p className="text-gray-500 mt-1 text-sm">Find shops, email them from hello@stampfix.app and message them on Instagram.</p>
        </div>
        <dl className="flex gap-5 text-sm">
          {([['Shops', state.leads], ['With email', state.with_email], ['On Instagram', state.with_instagram], ['Emailed', state.sent_total], ['Replies', replied]] as const).map(([k, v]) => (
            <div key={k}><dt className="text-xs text-gray-500">{k}</dt><dd className="text-lg font-semibold text-[#37352F] tabular-nums">{v}</dd></div>
          ))}
        </dl>
      </header>

      <nav className="flex gap-1 border-b notion-border overflow-x-auto no-scrollbar">
        {tabs.map(([id, Icon, label, count]) => (
          <button key={id} type="button" onClick={() => setTab(id)} data-outreach-tab={id}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition ${tab === id ? 'border-[#37352F] text-[#37352F] font-medium' : 'border-transparent text-gray-500 hover:text-[#37352F]'}`}>
            <Icon className="w-4 h-4" />{label}{count != null && count > 0 && <span className="text-xs text-gray-400">{count}</span>}
          </button>
        ))}
      </nav>

      {tab === 'find' && <FindTab readOnly={readOnly} onAdded={(check) => { refresh(); setAutoScan(check); setTab('shops'); }} />}
      {tab === 'shops' && <ShopsTab state={state} readOnly={readOnly} autoScan={autoScan} onAutoScanStarted={() => setAutoScan(false)} onChanged={refresh} />}
      {tab === 'ai' && <AiTab state={state} readOnly={readOnly} onChanged={refresh} />}
      {tab === 'email' && <EmailTab state={state} readOnly={readOnly} onChanged={refresh} />}
      {tab === 'instagram' && <InstagramTab state={state} readOnly={readOnly} onChanged={refresh} />}
      {tab === 'areas' && <AreasTab />}
      {tab === 'settings' && <SettingsTab key={state.settings.subject_tpl + state.settings.daily_cap} settings={state.settings} readOnly={readOnly} onSaved={refresh} />}
    </div>
  );
}
