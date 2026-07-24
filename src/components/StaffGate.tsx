import { useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { verifyStaffPin, verifyStaffPinFor, setStaffSession } from '../services/staff';

/** PIN prompt shown after the shop logs in: "who's at the till?" */
export function StaffGate({ campaignId, onDone, onSkip, staffId, staffName }: {
  campaignId: string; onDone: () => void; onSkip?: () => void;
  /** When set, the PIN must belong to this person (they picked their name first). */
  staffId?: string; staffName?: string;
}) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!/^\d{4,8}$/.test(pin)) { setErr('Enter your 4-8 digit PIN.'); return; }
    setBusy(true); setErr(null);
    try {
      const s = staffId
        ? await verifyStaffPinFor(campaignId, staffId, pin)
        : await verifyStaffPin(campaignId, pin);
      if (!s) {
        setErr(staffName ? `That PIN doesn\u2019t match ${staffName}.` : 'That PIN wasn\u2019t recognised.');
        setPin(''); return;
      }
      setStaffSession(s); onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not check that PIN.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-md flex items-center justify-center p-6">
      <div className="bg-white rounded-xl shadow-2xl border notion-border w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-[#37352F]" />
          <h2 className="text-lg font-semibold">{staffName ? `Sign in as ${staffName}` : 'Who\u2019s on shift?'}</h2>
        </div>
        <p className="text-sm text-gray-500">Enter your staff ID (PIN) to start your shift. Everything you stamp today is recorded under your name.</p>
        <input
          autoFocus type="password" inputMode="numeric" value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder="&bull;&bull;&bull;&bull;"
          className="w-full text-center tracking-[0.5em] text-lg bg-[#F7F7F5] border notion-border rounded-md px-3 py-3 focus:outline-none focus:ring-1 focus:ring-gray-400"
        />
        {err && <p className="text-xs text-red-600">{err}</p>}
        <button onClick={submit} disabled={busy}
          className="w-full py-2.5 rounded-md bg-[#37352F] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Continue
        </button>
        {onSkip && (
          <button onClick={onSkip} className="w-full text-xs text-gray-400 hover:text-gray-600">
            I&rsquo;m the owner &mdash; skip
          </button>
        )}
      </div>
    </div>
  );
}
