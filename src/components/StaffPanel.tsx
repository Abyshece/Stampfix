import { useEffect, useState } from 'react';
import { UserPlus, Loader2, KeyRound, Trash2, LogIn } from 'lucide-react';
import {
  listStaff, createStaff, setStaffActive, setStaffPin, deleteStaff,
  listStaffLogins, getStaffSession, clearStaffSession,
  type StaffMember, type StaffLogin,
} from '../services/staff';

/** Merchant-facing staff management: create staff, set PINs, see who logged in. */
export function StaffPanel({ campaignId, onSwitchStaff }: { campaignId: string; onSwitchStaff: () => void }) {
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [logins, setLogins] = useState<StaffLogin[]>([]);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const current = getStaffSession(campaignId);

  const refresh = () => {
    listStaff(campaignId).then(setStaff).catch(() => setStaff([]));
    listStaffLogins(campaignId).then(setLogins).catch(() => setLogins([]));
  };
  useEffect(refresh, [campaignId]);

  const add = async () => {
    setErr(null);
    if (!name.trim()) { setErr('Enter a name.'); return; }
    if (!/^\d{4,8}$/.test(pin)) { setErr('PIN must be 4-8 digits.'); return; }
    setBusy(true);
    try { await createStaff(campaignId, name, pin); setName(''); setPin(''); refresh(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not add staff member.'); }
    finally { setBusy(false); }
  };

  const changePin = async (s: StaffMember) => {
    const p = window.prompt(`New PIN for ${s.name} (4-8 digits)`);
    if (!p) return;
    try { await setStaffPin(s.id, p); alert('PIN updated.'); }
    catch (e) { alert(e instanceof Error ? e.message : 'Could not update PIN.'); }
  };

  const remove = async (s: StaffMember) => {
    if (!window.confirm(`Remove ${s.name}? Their past activity stays in the log.`)) return;
    await deleteStaff(s.id); refresh();
  };

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl font-serif-display font-semibold">Staff</h2>
        <p className="text-gray-500 mt-1">
          Give each team member their own PIN. Every stamp and redemption is recorded against the person who did it.
        </p>
      </header>

      <div className="p-4 rounded-lg border notion-border bg-[#F7F7F5] flex items-center justify-between gap-4 flex-wrap">
        <div className="text-sm">
          {current
            ? <>Currently at the till: <span className="font-semibold text-[#37352F]">{current.name}</span></>
            : <span className="text-gray-500">No staff member signed in on this device.</span>}
        </div>
        <button
          onClick={() => { clearStaffSession(); onSwitchStaff(); }}
          className="text-xs px-3 py-1.5 rounded-md bg-[#37352F] text-white hover:opacity-90 transition"
        >
          {current ? 'Switch staff' : 'Sign in staff'}
        </button>
      </div>

      {/* Add */}
      <div className="p-5 rounded-lg border notion-border bg-white space-y-3">
        <h3 className="font-semibold flex items-center gap-2"><UserPlus className="w-4 h-4" /> Add a staff member</h3>
        <div className="flex gap-2 flex-wrap">
          <input
            value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Martina)"
            className="flex-1 min-w-[180px] bg-[#F7F7F5] border notion-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
          <input
            value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="PIN (4-8 digits)" inputMode="numeric"
            className="w-40 bg-[#F7F7F5] border notion-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
          <button onClick={add} disabled={busy}
            className="px-4 py-2 rounded-md bg-[#37352F] text-white text-sm hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Add
          </button>
        </div>
        {err && <p className="text-xs text-red-600">{err}</p>}
        <p className="text-xs text-gray-400">
          Staff use the shop&rsquo;s login, then enter their PIN. Nobody needs their own email account.
        </p>
      </div>

      {/* List */}
      <div>
        <h3 className="font-semibold mb-3">Your team</h3>
        {staff === null ? (
          <div className="flex items-center gap-2 text-sm text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
        ) : staff.length === 0 ? (
          <p className="text-sm text-gray-400">No staff yet. Add your first team member above.</p>
        ) : (
          <div className="border notion-border rounded-lg divide-y notion-border overflow-hidden">
            {staff.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 p-3 bg-white flex-wrap">
                <div className="min-w-0">
                  <div className="font-medium text-sm flex items-center gap-2">
                    {s.name}
                    {!s.active && <span className="text-[10px] uppercase tracking-wide bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">inactive</span>}
                  </div>
                  <div className="text-xs text-gray-400">
                    {s.lastLoginAt ? `Last signed in ${s.lastLoginAt.toLocaleString()}` : 'Never signed in'}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => changePin(s)} className="text-xs px-2.5 py-1.5 rounded-md border notion-border hover:bg-[#F7F7F5] flex items-center gap-1">
                    <KeyRound className="w-3 h-3" /> PIN
                  </button>
                  <button onClick={() => setStaffActive(s.id, !s.active).then(refresh)} className="text-xs px-2.5 py-1.5 rounded-md border notion-border hover:bg-[#F7F7F5]">
                    {s.active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button onClick={() => remove(s)} className="text-xs px-2.5 py-1.5 rounded-md border notion-border text-red-600 hover:bg-red-50 flex items-center gap-1">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Login log */}
      <div>
        <h3 className="font-semibold mb-3 flex items-center gap-2"><LogIn className="w-4 h-4" /> Sign-in log</h3>
        {logins.length === 0 ? (
          <p className="text-sm text-gray-400">No staff sign-ins recorded yet.</p>
        ) : (
          <div className="border notion-border rounded-lg divide-y notion-border overflow-hidden max-h-80 overflow-y-auto">
            {logins.map((l) => (
              <div key={l.id} className="flex items-center justify-between p-2.5 bg-white text-sm">
                <span className="font-medium">{l.staffName}</span>
                <span className="text-xs text-gray-400">{l.at.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
