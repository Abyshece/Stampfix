import { useEffect, useState } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import { listDeletedMerchants, restoreMerchant, type DeletedMerchant } from '../services/admin';

/** Merchants deleted in the last 30 days, before the nightly cleanup erases
 *  them, with an Undo that brings the account and its customer cards back. */
export function DeletedMerchantsList({ readOnly, onRestored }: { readOnly: boolean; onRestored: () => void }) {
  const [rows, setRows] = useState<DeletedMerchant[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    setErr(null);
    listDeletedMerchants().then(setRows).catch((e) => setErr(e instanceof Error ? e.message : 'Could not load deleted merchants'));
  };
  useEffect(load, []);

  const undo = async (m: DeletedMerchant) => {
    const cards = m.cards_to_reopen;
    if (!confirm(`Bring back ${m.merchant_code ?? ''} (${m.business_name || m.email})?\n\nTheir account becomes active again${cards ? ` and ${cards} customer card${cards === 1 ? '' : 's'} closed by the deletion ${cards === 1 ? 'is' : 'are'} re-opened` : ''}.`)) return;
    setBusyId(m.id);
    try {
      await restoreMerchant(m.id);
      load();
      onRestored();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not bring the merchant back');
    } finally { setBusyId(null); }
  };

  if (err) return <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-4 py-3">{err}</div>;
  if (!rows) return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  if (rows.length === 0) {
    return <div className="text-sm text-gray-500 bg-white border notion-border rounded-lg p-8 text-center">No deleted merchants waiting to be erased.</div>;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">Deleted accounts are kept for 30 days, then erased for good (with their customers’ cards and history) by the nightly cleanup.</p>
      <div className="bg-white border notion-border rounded-lg overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-[#F7F7F5] text-xs uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Code</th>
              <th className="px-3 py-2 text-left">Business / contact</th>
              <th className="px-2 py-2 text-left">Deleted</th>
              <th className="px-2 py-2 text-left">Erased on</th>
              <th className="px-2 py-2 text-right">Customer cards</th>
              <th className="px-2 py-2 text-center">Undo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const daysLeft = m.purge_after ? Math.max(0, Math.ceil((new Date(m.purge_after).getTime() - Date.now()) / 864e5)) : null;
              return (
                <tr key={m.id} className="border-t notion-border align-top">
                  <td className="px-3 py-3 font-mono text-xs whitespace-nowrap">{m.merchant_code}</td>
                  <td className="px-3 py-3">
                    <div className="font-medium">{m.business_name || '—'}</div>
                    <div className="text-xs text-gray-500">{m.email}</div>
                  </td>
                  <td className="px-2 py-3 text-xs text-gray-500 whitespace-nowrap">{m.deleted_at ? new Date(m.deleted_at).toLocaleDateString() : '—'}</td>
                  <td className="px-2 py-3 text-xs whitespace-nowrap">
                    {m.purge_after ? (
                      <>
                        <div>{new Date(m.purge_after).toLocaleDateString()}</div>
                        <div className={`text-[10px] ${daysLeft !== null && daysLeft <= 7 ? 'text-red-600' : 'text-gray-400'}`}>{daysLeft} day{daysLeft === 1 ? '' : 's'} left</div>
                      </>
                    ) : '—'}
                  </td>
                  <td className="px-2 py-3 text-right text-sm">{m.card_count}</td>
                  <td className="px-2 py-3 text-center">
                    <button
                      onClick={() => void undo(m)} disabled={readOnly || busyId !== null}
                      className="inline-flex items-center gap-1 text-xs text-green-700 border border-green-200 px-2.5 py-1 rounded hover:bg-green-50 disabled:opacity-40"
                    >
                      {busyId === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Bring back
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
