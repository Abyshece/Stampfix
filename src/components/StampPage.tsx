import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { selfServeStamp } from '../lib/db';

type Phase = 'locating' | 'stamping' | 'success' | 'need_identity' | 'error';

const ERR: Record<string, string> = {
  self_serve_off: "This shop isn't using self-serve stamps right now.",
  too_far: "You're too far from the shop. Come a bit closer and try again.",
  no_location: "This shop hasn't set its location yet, so we can't confirm you're here.",
  daily_cap: "You've already collected your stamp for today. See you next time!",
  cooldown: "You just got a stamp — please wait a little before the next one.",
  card_inactive: "This card isn't active.",
  card_full: "Your card is already full — show it at the counter to claim your reward!",
  not_found: "We couldn't find this shop.",
  card_not_found: "We couldn't find your card.",
  invalid: "This stamp link is invalid.",
  no_geo: "Your browser can't share location, which is needed to get a stamp.",
  denied: "Please allow location access — it confirms you're at the shop.",
  network: "Couldn't reach the server. Check your connection and try again.",
};

function StampShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#FBFBFA] flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="flex items-center gap-2 mb-8 text-[#37352F]">
        <span className="w-3 h-3 bg-[#37352F]" />
        <span className="w-3 h-3 bg-[#37352F] rounded-full" />
        <span className="font-bold text-lg leading-none">&#10005;</span>
      </div>
      {children}
    </div>
  );
}

export function StampPage() {
  const params = new URLSearchParams(window.location.search);
  const campaignId = (params.get('campaign') ?? '').trim();
  const locationId = (params.get('location') ?? '').trim();

  const [phase, setPhase] = useState<Phase>('locating');
  const [errKey, setErrKey] = useState('');
  const [errExtra, setErrExtra] = useState('');
  const [result, setResult] = useState<{ currentStamps: number; maxStamps: number } | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [retry, setRetry] = useState(0);

  const attempt = useCallback(async (withIdentity: boolean) => {
    if (!coords) return;
    setPhase('stamping');
    setSubmitting(true);
    try {
      const r = await selfServeStamp(
        campaignId, locationId, coords.lat, coords.lng,
        withIdentity ? email.trim() : undefined,
      );
      if (r.ok) {
        setResult({ currentStamps: r.currentStamps ?? 0, maxStamps: r.maxStamps ?? 0 });
        setPhase('success');
      } else if (r.error === 'card_not_found' && !withIdentity) {
        setPhase('need_identity');
      } else {
        setErrKey(r.error ?? 'network');
        setErrExtra(r.distance ? ` (~${r.distance}m away)` : '');
        setPhase('error');
      }
    } catch (e) {
      setErrKey('network'); setErrExtra(e instanceof Error ? ': ' + e.message : ''); setPhase('error');
    } finally {
      setSubmitting(false);
    }
  }, [coords, campaignId, locationId, email]);

  // Request GPS on mount and on each retry.
  useEffect(() => {
    if (!campaignId || !locationId) { setErrKey('invalid'); setPhase('error'); return; }
    if (!('geolocation' in navigator)) { setErrKey('no_geo'); setPhase('error'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => { setErrKey('denied'); setPhase('error'); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }, [campaignId, locationId, retry]);

  // Auto-attempt (signed-in path) once we have coordinates.
  useEffect(() => {
    if (coords && phase === 'locating') void attempt(false);
  }, [coords, phase, attempt]);

  const tryAgain = () => { setErrKey(''); setCoords(null); setPhase('locating'); setRetry((r) => r + 1); };

  if (phase === 'locating' || phase === 'stamping') {
    return (
      <StampShell>
        <div className="animate-spin w-8 h-8 border-2 border-gray-300 border-t-[#37352F] rounded-full mb-4" />
        <p className="text-gray-500">{phase === 'locating' ? "Checking you're at the shop…" : 'Adding your stamp…'}</p>
      </StampShell>
    );
  }

  if (phase === 'success' && result) {
    const full = result.currentStamps >= result.maxStamps;
    const dots = Array.from({ length: Math.max(result.maxStamps, 1) }, (_, i) => i < result.currentStamps);
    return (
      <StampShell>
        <div className="text-6xl mb-2 animate-bounce">🎉</div>
        <h1 className="text-2xl font-serif-display font-semibold mb-1">Stamp added!</h1>
        <p className="text-gray-500 mb-5">{full ? 'Your card is full — claim your reward!' : `${result.currentStamps} of ${result.maxStamps} stamps`}</p>
        <div className="flex flex-wrap justify-center gap-2 max-w-[240px] mb-8">
          {dots.map((f, i) => (
            <span key={i} className={`w-6 h-6 rounded-full border-2 ${f ? 'bg-[#37352F] border-[#37352F]' : 'border-gray-300'}`} />
          ))}
        </div>
        <a href="/my-card" className="bg-[#37352F] text-white px-6 py-3 rounded-lg font-medium hover:bg-opacity-90 transition">View &amp; save your card</a>
        <p className="text-xs text-gray-400 mt-3 max-w-xs">Save it to Apple or Google Wallet so it updates on its own next time.</p>
      </StampShell>
    );
  }

  if (phase === 'need_identity') {
    return (
      <StampShell>
        <h1 className="text-xl font-serif-display font-semibold mb-1">One quick check</h1>
        <p className="text-gray-500 mb-5 max-w-xs">Just confirm the email you signed up with to collect your stamp.</p>
        <div className="w-full max-w-xs space-y-3">
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@email.com"
            className="w-full border notion-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300" />
          <button onClick={() => void attempt(true)} disabled={submitting || !email.trim()}
            className="w-full bg-[#37352F] text-white py-3 rounded-lg font-medium disabled:opacity-50 hover:bg-opacity-90 transition">
            Get my stamp
          </button>
        </div>
      </StampShell>
    );
  }

  return (
    <StampShell>
      <div className="text-4xl mb-3">😕</div>
      <p className="text-gray-600 max-w-xs mb-6">{(ERR[errKey] ?? 'Something went wrong. Please try again.') + errExtra}</p>
      {(errKey === 'too_far' || errKey === 'denied' || errKey === 'network') && (
        <button onClick={tryAgain} className="bg-[#37352F] text-white px-6 py-3 rounded-lg font-medium hover:bg-opacity-90 transition">Try again</button>
      )}
    </StampShell>
  );
}
