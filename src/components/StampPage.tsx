import { useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { selfServeStamp } from '../lib/db';
import { supabase } from '../lib/supabase';
import { playScanSound } from '../lib/scanSounds';
import { useTranslation } from 'react-i18next';

type Phase = 'locating' | 'stamping' | 'success' | 'need_identity' | 'ask_more' | 'pick_count' | 'ask_code' | 'error';

const ERR: Record<string, string> = {
  self_serve_off: "This shop isn't using self-serve stamps right now.",
  too_far: "We couldn't confirm you're at the shop. Step inside or closer to the counter and tap Try again. If it keeps happening, ask a staff member.",
  imprecise: "Your phone is only sharing an approximate location. Turn on Precise Location (iPhone: Settings › Privacy & Security › Location Services › Safari Websites › Precise Location), then tap Try again.",
  location_archived: "This stamp QR is no longer in use. Please ask a staff member for the current one.",
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
  unavailable: "We couldn't pin your location. Check that Location Services are on in your phone's settings (not just the browser), then tap Try again.",
  network: "Couldn't reach the server. Check your connection and try again.",
};

const CONFETTI_COLORS = ['#EA3323', '#F7CE46', '#1132F5', '#75FBFD', '#EA33B6', '#510AF5', '#75FBE2', '#F0A479'];

/** Same confetti rain as the merchant scan celebration; runs for 8 seconds. */
function StampConfetti() {
  const pieces = useMemo(
    () => Array.from({ length: 80 }, (_, i) => {
      const duration = 2.3 + Math.random() * 1.9;
      return {
        id: i, left: Math.random() * 100, delay: -(Math.random() * duration), duration,
        size: 7 + Math.random() * 9, color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rotate: Math.random() * 360, round: Math.random() > 0.5,
      };
    }),
    [],
  );
  const [on, setOn] = useState(true);
  useEffect(() => { const t = setTimeout(() => setOn(false), 8000); return () => clearTimeout(t); }, []);
  if (!on) return null;
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden z-50">
      <style>{`@keyframes stamp-fall { 0%{transform:translateY(-14vh) rotate(0);opacity:0} 8%{opacity:1} 100%{transform:translateY(112vh) rotate(720deg);opacity:1} }`}</style>
      {pieces.map((p) => (
        <span key={p.id} style={{ position: 'absolute', top: 0, left: `${p.left}%`, width: p.size, height: p.size, background: p.color, borderRadius: p.round ? '50%' : 2, transform: `rotate(${p.rotate}deg)`, animation: `stamp-fall ${p.duration}s linear ${p.delay}s infinite` }} />
      ))}
    </div>
  );
}

function CountWheel({ max, value, onChange }: { max: number; value: number; onChange: (n: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const ITEM = 56;
  const nums = useMemo(() => Array.from({ length: Math.max(max, 1) }, (_, i) => i + 1), [max]);
  const onScroll = () => {
    const el = ref.current; if (!el) return;
    const n = Math.min(Math.max(max, 1), Math.max(1, Math.round(el.scrollTop / ITEM) + 1));
    if (n !== value) onChange(n);
  };
  return (
    <div className="relative h-[168px] w-28 mx-auto">
      <style>{`.cw::-webkit-scrollbar{display:none}`}</style>
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-14 rounded-xl bg-[#F7F7F5] pointer-events-none" />
      <div ref={ref} onScroll={onScroll} className="cw h-full overflow-y-scroll snap-y snap-mandatory relative" style={{ scrollbarWidth: 'none' }}>
        <div style={{ height: ITEM }} />
        {nums.map((n) => (
          <div key={n} style={{ height: ITEM }} className={`snap-center flex items-center justify-center text-3xl font-bold ${n === value ? 'text-[#37352F]' : 'text-gray-300'}`}>{n}</div>
        ))}
        <div style={{ height: ITEM }} />
      </div>
    </div>
  );
}

function StampShell({ children, shop }: { children: ReactNode; shop?: string | null }) {
  return (
    <div className="min-h-screen bg-[#FBFBFA] flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className={`flex items-center gap-2 text-[#37352F] ${shop ? 'mb-3' : 'mb-8'}`}>
        <span className="w-3 h-3 bg-[#37352F]" />
        <span className="w-3 h-3 bg-[#37352F] rounded-full" />
        <span className="font-bold text-lg leading-none">&#10005;</span>
      </div>
      {/* Which shop this QR belongs to. Without it, a QR from a different shop
          (e.g. an old poster) fails with no clue why. */}
      {shop && <p className="text-sm font-medium text-gray-500 mb-8">{shop}</p>}
      {children}
    </div>
  );
}

// The email a customer without a signed-in session identified with, kept on
// their phone so the next visit stamps straight away. Best-effort only.
const emailKey = (campaignId: string) => `stampfix_stamp_email:${campaignId}`;
function readSavedEmail(campaignId: string): string {
  try { return localStorage.getItem(emailKey(campaignId)) ?? ''; } catch { return ''; }
}
function saveEmail(campaignId: string, email: string | null) {
  try {
    if (email) localStorage.setItem(emailKey(campaignId), email);
    else localStorage.removeItem(emailKey(campaignId));
  } catch { /* storage blocked: they type it next time */ }
}

export function StampPage() {
  const { t } = useTranslation();
  const params = new URLSearchParams(window.location.search);
  const campaignId = (params.get('campaign') ?? '').trim();
  const locationId = (params.get('location') ?? '').trim();

  const [phase, setPhase] = useState<Phase>('locating');
  const [errKey, setErrKey] = useState('');
  const [errExtra, setErrExtra] = useState('');
  // added = stamps this visit put on the card (0 when it only shows the card).
  const [result, setResult] = useState<{ currentStamps: number; maxStamps: number; added: number } | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  // After a "too far" answer, the next fix is a fresh high-accuracy one.
  const [precise, setPrecise] = useState(false);
  const [limit, setLimit] = useState<'cooldown' | 'daily_cap'>('cooldown');
  const [email, setEmail] = useState(() => readSavedEmail(campaignId));
  const [identityError, setIdentityError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [retry, setRetry] = useState(0);
  const [count, setCount] = useState(1);
  const [multiCode, setMultiCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [shopName, setShopName] = useState<string | null>(null);
  const [locationName, setLocationName] = useState<string | null>(null);

  // Name the shop (and branch) the QR points at. Both tables are publicly
  // readable, same as the signup page. Best-effort: stamping never waits on it.
  useEffect(() => {
    if (!campaignId) return;
    let live = true;
    void supabase.from('campaigns').select('business_name').eq('id', campaignId).maybeSingle()
      .then(({ data }) => { if (live) setShopName((data as { business_name?: string } | null)?.business_name?.trim() || null); });
    if (locationId) {
      void supabase.from('locations').select('name').eq('id', locationId).maybeSingle()
        .then(({ data }) => { if (live) setLocationName((data as { name?: string } | null)?.name?.trim() || null); });
    }
    return () => { live = false; };
  }, [campaignId, locationId]);
  const shopLabel = shopName ? (locationName ? `${shopName} · ${locationName}` : shopName) : null;

  // `typed` = the customer just entered the email themselves (vs. the one
  // saved on this phone, or none), so a miss is worth telling them about.
  const attempt = useCallback(async (typed: boolean) => {
    if (!coords) return;
    const id = email.trim();
    setPhase('stamping');
    setSubmitting(true);
    setIdentityError('');
    try {
      const r = await selfServeStamp(campaignId, locationId, coords.lat, coords.lng, id || undefined);
      if (r.ok) {
        if (id) saveEmail(campaignId, id);
        const current = r.currentStamps ?? 0, max = r.maxStamps ?? 0;
        setResult({ currentStamps: current, maxStamps: max, added: r.added ?? 1 });
        setPhase('success'); playScanSound(current >= max ? 'last' : 'stamp');
      } else if (r.error === 'card_not_found') {
        if (typed) {
          saveEmail(campaignId, null);
          setIdentityError(t('cust.stamp.noCardForEmail', { defaultValue: "We couldn't find a card with that email here. Check the spelling, or join below if you're new." }));
        }
        setPhase('need_identity');
      } else if (r.error === 'cooldown' || r.error === 'daily_cap') {
        setResult({ currentStamps: r.currentStamps ?? 0, maxStamps: r.maxStamps ?? 0, added: 0 });
        setLimit(r.error); setPhase('ask_more');
      } else if (r.error === 'too_far' && !precise) {
        // The first fix is a quick, possibly cached one (it can be from before
        // the customer walked in). Check once more with a fresh, precise fix
        // before saying they're not at the shop.
        setCoords(null); setPrecise(true); setPhase('locating');
      } else {
        const imprecise = r.error === 'too_far' && coords.accuracy > 500;
        setErrKey(imprecise ? 'imprecise' : r.error ?? 'network');
        setErrExtra('');
        setPhase('error');
      }
    } catch (e) {
      setErrKey('network'); setErrExtra(e instanceof Error ? ': ' + e.message : ''); setPhase('error');
    } finally {
      setSubmitting(false);
    }
  }, [coords, campaignId, locationId, email, precise, t]);

  const attemptMulti = async () => {
    if (!coords) return;
    setSubmitting(true); setCodeError('');
    try {
      const r = await selfServeStamp(campaignId, locationId, coords.lat, coords.lng, email.trim() || undefined, multiCode.trim(), count);
      if (r.ok || r.error === 'card_full') {
        const current = r.currentStamps ?? 0, max = r.maxStamps ?? 0;
        // Show the stamps from this visit: the single one plus the extras.
        setResult((prev) => ({ currentStamps: current, maxStamps: max, added: (prev?.added ?? 0) + (r.ok ? r.added ?? count : 0) }));
        setPhase('success');
        if (r.ok) playScanSound(current >= max ? 'last' : 'stamp');
      }
      else if (r.error === 'bad_code') { setCodeError(t('cust.stamp.badCode', { defaultValue: "That code isn't right — ask the cashier again." })); }
      else if (r.error === 'no_code_set') { setCodeError(t('cust.stamp.noCodeSet', { defaultValue: "This shop hasn't set a code yet." })); }
      else if (r.error === 'too_many_attempts') { setCodeError(t('cust.stamp.tooManyCodes', { defaultValue: 'Too many wrong codes. Please try again in 30 minutes, or ask the cashier to stamp your card.' })); }
      else { setErrKey(r.error ?? 'network'); setErrExtra(''); setPhase('error'); }
    } catch (e) { setErrKey('network'); setErrExtra(e instanceof Error ? ': ' + e.message : ''); setPhase('error'); }
    finally { setSubmitting(false); }
  };
  const remaining = result ? Math.max(1, result.maxStamps - result.currentStamps) : 9;

  // Request GPS on mount and on each retry.
  useEffect(() => {
    if (!campaignId || !locationId) { setErrKey('invalid'); setPhase('error'); return; }
    if (!('geolocation' in navigator)) { setErrKey('no_geo'); setPhase('error'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => {
        // Only code 1 (PERMISSION_DENIED) is a real permission problem. Codes 2
        // (POSITION_UNAVAILABLE) and 3 (TIMEOUT) happen constantly on Android
        // indoors, so we must NOT tell the customer to fix a permission that is
        // already granted — that was the bug. When the precise re-check can't
        // get a fix, the quick fix already said "too far", so say that.
        setErrKey(err.code === 1 ? 'denied' : precise ? 'too_far' : 'unavailable');
        setPhase('error');
      },
      // First try: low accuracy uses Wi-Fi / cell towers, resolves in ~1s and
      // works indoors (a cafe), unlike GPS, which often can't get a fix; a fix
      // up to 5 minutes old is reused. After a "too far", ask for a fresh,
      // high-accuracy fix instead: the reused one may be from before the
      // customer arrived.
      precise
        ? { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        : { enableHighAccuracy: false, timeout: 20000, maximumAge: 300000 },
    );
  }, [campaignId, locationId, retry, precise]);

  // Auto-attempt once we have coordinates: the signed-in customer's card, or
  // the email saved on this phone from an earlier visit.
  useEffect(() => {
    if (coords && phase === 'locating') void attempt(false);
  }, [coords, phase, attempt]);

  const tryAgain = () => { setErrKey(''); setCoords(null); setPhase('locating'); setRetry((r) => r + 1); };

  if (phase === 'locating' || phase === 'stamping') {
    return (
      <StampShell shop={shopLabel}>
        <div className="animate-spin w-8 h-8 border-2 border-gray-300 border-t-[#37352F] rounded-full mb-4" />
        <p className="text-gray-500">{phase === 'locating' ? t('cust.stamp.locating', { defaultValue: "Checking you're at the shop…" }) : t('cust.stamp.stamping', { defaultValue: 'Adding your stamp…' })}</p>
      </StampShell>
    );
  }

  if (phase === 'success' && result) {
    const full = result.currentStamps >= result.maxStamps;
    const dots = Array.from({ length: Math.max(result.maxStamps, 1) }, (_, i) => i < result.currentStamps);
    const added = result.added > 0;
    return (
      <StampShell shop={shopLabel}>
        {/* Celebrate only when this visit really added a stamp; "No, that's
            all" after an earlier stamp just shows the card. */}
        {added && <StampConfetti />}
        <div className={`text-6xl mb-2 ${added ? 'animate-bounce' : ''}`}>{added ? '🎉' : '✅'}</div>
        <h1 className="text-2xl font-serif-display font-semibold mb-1">{
          !added ? t('cust.stamp.allSet', { defaultValue: "You're all set" })
            : result.added > 1 ? t('cust.stamp.addedMany', { count: result.added, defaultValue: '{{count}} stamps added!' })
            : t('cust.stamp.added', { defaultValue: 'Stamp added!' })
        }</h1>
        <p className="text-gray-500 mb-5">{full ? t('cust.stamp.cardFull', { defaultValue: 'Your card is full — claim your reward!' }) : t('cust.stamp.ofStamps', { current: result.currentStamps, max: result.maxStamps, defaultValue: '{{current}} of {{max}} stamps' })}</p>
        <div className="flex flex-wrap justify-center gap-2 max-w-[240px] mb-8">
          {dots.map((f, i) => (
            <span key={i} className={`w-6 h-6 rounded-full border-2 ${f ? 'bg-[#37352F] border-[#37352F]' : 'border-gray-300'}`} />
          ))}
        </div>
        {added && result.currentStamps < result.maxStamps && (
          <button onClick={() => { setCount(1); setMultiCode(''); setCodeError(''); setPhase('pick_count'); }} className="text-sm text-[#37352F] underline mb-4">{t('cust.stamp.boughtMultiple', { defaultValue: 'Bought multiple orders? Add more stamps' })}</button>
        )}
        <a href={email.trim() ? `/my-card?e=${encodeURIComponent(email.trim())}` : '/my-card'} className="bg-[#37352F] text-white px-6 py-3 rounded-lg font-medium hover:bg-opacity-90 transition">{t('cust.stamp.viewSave', { defaultValue: 'View & save your card' })}</a>
        <p className="text-xs text-gray-400 mt-3 max-w-xs">{t('cust.stamp.saveHint', { defaultValue: 'Save it to Apple or Google Wallet so it updates on its own next time.' })}</p>
      </StampShell>
    );
  }

  if (phase === 'need_identity') {
    return (
      <StampShell shop={shopLabel}>
        <h1 className="text-xl font-serif-display font-semibold mb-1">{t('cust.stamp.quickCheck', { defaultValue: 'One quick check' })}</h1>
        <p className="text-gray-500 mb-5 max-w-xs">{t('cust.stamp.confirmEmail', { defaultValue: 'Just confirm the email you signed up with to collect your stamp.' })}</p>
        <form className="w-full max-w-xs space-y-3" onSubmit={(e) => { e.preventDefault(); if (!submitting && email.trim()) void attempt(true); }}>
          <input value={email} onChange={(e) => { setEmail(e.target.value); setIdentityError(''); }} type="email" autoComplete="email" placeholder={t('cust.stamp.emailPh', { defaultValue: 'you@email.com' })}
            className="w-full border notion-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300" />
          {identityError && <p className="text-xs text-red-600">{identityError}</p>}
          <button type="submit" disabled={submitting || !email.trim()}
            className="w-full bg-[#37352F] text-white py-3 rounded-lg font-medium disabled:opacity-50 hover:bg-opacity-90 transition">
            {t('cust.stamp.getStamp', { defaultValue: 'Get my stamp' })}
          </button>
        </form>
        {/* Someone scanning the stamp QR before they have a card needs a way in. */}
        <a href={`/?campaign=${encodeURIComponent(campaignId)}&location=${encodeURIComponent(locationId)}`} className="mt-6 text-sm text-[#37352F] underline">
          {t('cust.stamp.joinCta', { defaultValue: 'New here? Get your loyalty card first' })}
        </a>
      </StampShell>
    );
  }

  if (phase === 'ask_more') {
    const daily = limit === 'daily_cap';
    return (
      <StampShell shop={shopLabel}>
        <div className="text-5xl mb-3">🧾</div>
        <h1 className="text-xl font-serif-display font-semibold mb-1">{
          daily ? t('cust.stamp.todayCollected', { defaultValue: "Today's stamp is collected" }) : t('cust.stamp.alreadyStamped', { defaultValue: 'Already stamped' })
        }</h1>
        <p className="text-gray-500 mb-6 max-w-xs">{
          daily
            ? t('cust.stamp.dailyMoreQ', { defaultValue: "You've already collected your stamp for today. Bought more? Ask the cashier for the code to add the extra stamps." })
            : t('cust.stamp.boughtMoreQ', { defaultValue: 'Did you buy more than one? Add the extra stamps for this order.' })
        }</p>
        <div className="w-full max-w-xs space-y-2">
          <button onClick={() => { setCount(1); setMultiCode(''); setCodeError(''); setPhase('pick_count'); }} className="w-full bg-[#37352F] text-white py-3 rounded-lg font-medium">{
            daily ? t('cust.stamp.addWithCode', { defaultValue: 'Add stamps with a code' }) : t('cust.stamp.yesMultiple', { defaultValue: 'Yes, bought multiple' })
          }</button>
          <button onClick={() => setPhase('success')} className="w-full text-gray-500 py-2 text-sm">{
            daily ? t('cust.stamp.ok', { defaultValue: 'OK' }) : t('cust.stamp.noThatsAll', { defaultValue: "No, that's all" })
          }</button>
        </div>
      </StampShell>
    );
  }

  if (phase === 'pick_count') {
    return (
      <StampShell shop={shopLabel}>
        <h1 className="text-xl font-serif-display font-semibold mb-1">{t('cust.stamp.howManyMore', { defaultValue: 'How many more stamps?' })}</h1>
        <p className="text-gray-500 mb-4 max-w-xs">{t('cust.stamp.onePerItem', { defaultValue: 'One per item you bought in this order.' })}</p>
        <CountWheel max={remaining} value={count} onChange={setCount} />
        <button onClick={() => setPhase('ask_code')} className="mt-6 bg-[#37352F] text-white px-8 py-3 rounded-lg font-medium">{t('cust.stamp.next', { defaultValue: 'Next' })}</button>
      </StampShell>
    );
  }

  if (phase === 'ask_code') {
    return (
      <StampShell shop={shopLabel}>
        <h1 className="text-xl font-serif-display font-semibold mb-1">{t('cust.stamp.askCode', { defaultValue: 'Ask the cashier for the code' })}</h1>
        <p className="text-gray-500 mb-5 max-w-xs">{t(`cust.stamp.enterCode${count > 1 ? 'Other' : 'One'}`, { count, defaultValue: count > 1 ? 'Enter the 4-digit code from the counter to add {{count}} stamps.' : 'Enter the 4-digit code from the counter to add {{count}} stamp.' })}</p>
        <div className="w-full max-w-xs space-y-3">
          <input value={multiCode} onChange={(e) => setMultiCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))} inputMode="numeric" placeholder={t('cust.stamp.codePh', { defaultValue: '4-digit code' })} className="w-full border notion-border rounded-lg px-4 py-3 text-center text-2xl tracking-[0.4em]" />
          {codeError && <p className="text-xs text-red-600">{codeError}</p>}
          <button onClick={() => void attemptMulti()} disabled={submitting || multiCode.length !== 4} className="w-full bg-[#37352F] text-white py-3 rounded-lg font-medium disabled:opacity-40">{submitting ? t('cust.stamp.adding', { defaultValue: 'Adding…' }) : t('cust.stamp.addStamps', { defaultValue: 'Add stamps' })}</button>
          <button onClick={() => setPhase('pick_count')} className="w-full text-gray-500 py-2 text-sm">{t('cust.stamp.back', { defaultValue: 'Back' })}</button>
        </div>
      </StampShell>
    );
  }

  return (
    <StampShell shop={shopLabel}>
      <div className="text-4xl mb-3">😕</div>
      <p className="text-gray-600 max-w-xs mb-6">{
        errKey === 'self_serve_off' && shopName
          ? t('cust.stamp.err.self_serve_off_named', { shop: shopName, defaultValue: "{{shop}} isn't using self-serve stamps right now." })
          : t(`cust.stamp.err.${errKey}`, { defaultValue: ERR[errKey] ?? t('cust.stamp.generic', { defaultValue: 'Something went wrong. Please try again.' }) }) + errExtra
      }</p>
      {(errKey === 'too_far' || errKey === 'imprecise' || errKey === 'denied' || errKey === 'network' || errKey === 'unavailable') && (
        <button onClick={tryAgain} className="bg-[#37352F] text-white px-6 py-3 rounded-lg font-medium hover:bg-opacity-90 transition">{t('cust.stamp.tryAgain', { defaultValue: 'Try again' })}</button>
      )}
    </StampShell>
  );
}
