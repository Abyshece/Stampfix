import { supabase } from '../lib/supabase';

/**
 * Staff anomaly detection.
 *
 * Deliberately simple and explainable — a café owner has to understand why
 * something was flagged. Everything is computed from the activity log; there
 * are no background jobs to run or break.
 */

export type Severity = 'high' | 'medium' | 'low';
export interface Flag {
  id: string;
  severity: Severity;
  staffName: string;
  title: string;
  detail: string;
  at: Date;
}

interface Row {
  id: string; type: string; created_at: string; customer_name: string;
  staff_name: string | null; source: string | null; is_override: boolean | null; reason: string | null;
}

const HOUR_LATE = 23, HOUR_EARLY = 5;      // outside these, activity is odd
const BURST_N = 8, BURST_MIN = 10;          // 8+ stamps in 10 minutes
const OVERRIDE_LIMIT = 3;                   // per staff per day

export async function detectAnomalies(campaignId: string, days = 7): Promise<Flag[]> {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const { data, error } = await supabase
    .from('activities')
    .select('id,type,created_at,customer_name,staff_name,source,is_override,reason')
    .eq('campaign_id', campaignId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) throw error;
  const rows = (data as Row[]).map((r) => ({ ...r, at: new Date(r.created_at) }));
  const flags: Flag[] = [];
  const who = (r: { staff_name: string | null }) => r.staff_name ?? 'Unattributed';

  // 1. Rapid-fire stamping — many stamps in a tight window by one person.
  const stamps = rows.filter((r) => r.type === 'STAMP').sort((a, b) => +a.at - +b.at);
  const byStaff = new Map<string, typeof stamps>();
  stamps.forEach((s) => { const k = who(s); byStaff.set(k, [...(byStaff.get(k) ?? []), s]); });
  byStaff.forEach((list, name) => {
    for (let i = 0; i + BURST_N - 1 < list.length; i++) {
      const a = list[i], b = list[i + BURST_N - 1];
      if (+b.at - +a.at <= BURST_MIN * 60000) {
        flags.push({
          id: `burst-${name}-${a.id}`, severity: 'high', staffName: name,
          title: `${BURST_N} stamps in ${BURST_MIN} minutes`,
          detail: 'A rapid burst of stamps by one person is unusual for normal counter service.',
          at: b.at,
        });
        i += BURST_N; // don't re-report the same burst
      }
    }
  });

  // 2. Same customer stamped repeatedly in one day.
  const perDayCustomer = new Map<string, { n: number; last: Date; staff: string }>();
  stamps.forEach((s) => {
    const key = `${s.customer_name}|${s.at.toDateString()}`;
    const cur = perDayCustomer.get(key);
    perDayCustomer.set(key, { n: (cur?.n ?? 0) + 1, last: s.at, staff: who(s) });
  });
  perDayCustomer.forEach((v, key) => {
    if (v.n >= 4) {
      flags.push({
        id: `repeat-${key}`, severity: 'high', staffName: v.staff,
        title: `${v.n} stamps to ${key.split('|')[0]} in one day`,
        detail: 'One customer receiving many stamps in a single day can mean a card is being padded.',
        at: v.last,
      });
    }
  });

  // 3. Overrides of the daily cap.
  const ovByStaffDay = new Map<string, { n: number; last: Date; staff: string }>();
  rows.filter((r) => r.is_override).forEach((r) => {
    const key = `${who(r)}|${r.at.toDateString()}`;
    const cur = ovByStaffDay.get(key);
    ovByStaffDay.set(key, { n: (cur?.n ?? 0) + 1, last: r.at, staff: who(r) });
  });
  ovByStaffDay.forEach((v, key) => {
    if (v.n > OVERRIDE_LIMIT) {
      flags.push({
        id: `override-${key}`, severity: 'medium', staffName: v.staff,
        title: `${v.n} daily-cap overrides in one day`,
        detail: 'Overriding the daily limit repeatedly may mean the cap is too low — or that it is being worked around.',
        at: v.last,
      });
    }
  });

  // 4. Activity at odd hours.
  rows.filter((r) => r.type === 'STAMP' || r.type === 'REDEEM').forEach((r) => {
    const h = r.at.getHours();
    if (h >= HOUR_LATE || h < HOUR_EARLY) {
      flags.push({
        id: `hours-${r.id}`, severity: 'medium', staffName: who(r),
        title: `${r.type === 'STAMP' ? 'Stamp' : 'Redemption'} at ${r.at.getHours()}:${String(r.at.getMinutes()).padStart(2, '0')}`,
        detail: 'Activity outside normal trading hours is worth a second look.',
        at: r.at,
      });
    }
  });

  // 5. Heavy reliance on manual stamping (no customer scan).
  const manualByStaff = new Map<string, { manual: number; total: number; last: Date }>();
  stamps.forEach((s) => {
    const k = who(s); const cur = manualByStaff.get(k) ?? { manual: 0, total: 0, last: s.at };
    manualByStaff.set(k, {
      manual: cur.manual + (s.source && s.source !== 'qr' ? 1 : 0),
      total: cur.total + 1,
      last: s.at > cur.last ? s.at : cur.last,
    });
  });
  manualByStaff.forEach((v, name) => {
    if (v.total >= 10 && v.manual / v.total > 0.6) {
      flags.push({
        id: `manual-${name}`, severity: 'low', staffName: name,
        title: `${Math.round((v.manual / v.total) * 100)}% of stamps added manually`,
        detail: 'Most stamps should come from scanning the customer\u2019s code. A high manual share is worth asking about.',
        at: v.last,
      });
    }
  });

  const rank: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  return flags.sort((a, b) => rank[a.severity] - rank[b.severity] || +b.at - +a.at).slice(0, 40);
}
