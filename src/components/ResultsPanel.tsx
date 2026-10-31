import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingUp, Users, Repeat, Gift, Wallet, Megaphone, ArrowRight, Loader2 } from 'lucide-react';
import type { ActivityItem } from '../types';
import { proMonthly, type MerchantCountry } from '../lib/pricing';
import { computeResults, getAverageSpend, setAverageSpend } from '../lib/results';
import { listMarketingCampaigns, deliverySummaries, campaignReturns } from '../lib/marketingCampaigns';
import { useToast } from './ToastProvider';

type Period = 'this_month' | 'last_month' | '30d';

function periodRange(p: Period, now = new Date()): { from: Date; to: Date } {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (p === 'last_month') {
    return {
      from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
    };
  }
  if (p === '30d') {
    const from = new Date(startOfToday);
    from.setDate(from.getDate() - 29);
    return { from, to: now };
  }
  return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
}

/**
 * "Your results" (Results page): what the loyalty program brought the shop,
 * from its real customer activity: returning customers, repeat visits,
 * rewards, what campaigns brought back, and an estimate of sales from
 * repeat visits based on the owner's average spend per visit.
 */
export function ResultsPanel({ campaignId, activities, country, onOpenCampaigns }: {
  campaignId: string;
  activities: ActivityItem[];
  country: MerchantCountry;
  onOpenCampaigns: () => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { symbol } = proMonthly(country);
  const locale = i18n.language?.startsWith('de') ? 'de-DE' : 'en-CA';
  const money = (n: number) => symbol + Math.round(n).toLocaleString(locale);
  const moneyCents = (n: number) => symbol + n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const [period, setPeriod] = useState<Period>('this_month');
  const { from, to } = useMemo(() => periodRange(period), [period]);
  const r = useMemo(() => computeResults(activities, from, to), [activities, from, to]);

  // Average spend per visit (saved for the shop, private to the owner).
  const [spend, setSpend] = useState<number | null>(null);
  const [spendInput, setSpendInput] = useState('');
  const [spendLoaded, setSpendLoaded] = useState(false);
  const [savingSpend, setSavingSpend] = useState(false);
  useEffect(() => {
    let live = true;
    getAverageSpend(campaignId)
      .then((v) => { if (!live) return; setSpend(v); setSpendInput(v === null ? '' : String(v)); })
      .catch(() => {})
      .finally(() => { if (live) setSpendLoaded(true); });
    return () => { live = false; };
  }, [campaignId]);

  const parsedSpend = (() => {
    const v = Number(spendInput.replace(',', '.').trim());
    return spendInput.trim() === '' ? null : Number.isFinite(v) && v > 0 && v <= 100000 ? v : NaN;
  })();
  const spendChanged = parsedSpend !== spend && !(Number.isNaN(parsedSpend));
  const saveSpend = async () => {
    if (Number.isNaN(parsedSpend)) return;
    setSavingSpend(true);
    try {
      const v = await setAverageSpend(campaignId, parsedSpend);
      setSpend(v);
      setSpendInput(v === null ? '' : String(v));
      toast.success(t('dash.results.spendSaved', { defaultValue: 'Average spend saved' }));
    } catch {
      toast.error(t('dash.results.spendErr', { defaultValue: "Couldn't save. Please try again." }));
    } finally {
      setSavingSpend(false);
    }
  };

  // Campaigns started in the period: how many customers they reached and how
  // many came back within 7 days. Extra: the page works without it.
  const [camp, setCamp] = useState<{ reached: number; returned: number; count: number } | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([listMarketingCampaigns(campaignId), deliverySummaries(campaignId), campaignReturns(campaignId)])
      .then(([list, sums, rets]) => {
        if (!live) return;
        const inPeriod = list.filter((c) => {
          const s = new Date(c.startsAt);
          return s >= from && s <= to && (sums[c.id]?.sent ?? 0) > 0;
        });
        setCamp({
          count: inPeriod.length,
          reached: inPeriod.reduce((n, c) => n + (sums[c.id]?.sent ?? 0), 0),
          returned: inPeriod.reduce((n, c) => n + (rets[c.id] ?? 0), 0),
        });
      })
      .catch(() => { if (live) setCamp(null); });
    return () => { live = false; };
  }, [campaignId, from, to]);

  const periods: Array<[Period, string]> = [
    ['this_month', t('dash.results.thisMonth', { defaultValue: 'This month' })],
    ['last_month', t('dash.results.lastMonth', { defaultValue: 'Last month' })],
    ['30d', t('dash.results.last30', { defaultValue: 'Last 30 days' })],
  ];

  const tiles: Array<{ icon: typeof Users; label: string; value: string; hint: string }> = [
    {
      icon: Users,
      label: t('dash.results.returning', { defaultValue: 'Returning customers' }),
      value: String(r.returningCustomers),
      hint: t('dash.results.returningHint', { defaultValue: 'Came back at least once' }),
    },
    {
      icon: Repeat,
      label: t('dash.results.repeatVisits', { defaultValue: 'Repeat visits' }),
      value: String(r.repeatVisits),
      hint: t('dash.results.repeatHint', { count: r.visits, defaultValue: 'Total visits: {{count}}' }),
    },
    {
      icon: Gift,
      label: t('dash.results.rewards', { defaultValue: 'Rewards claimed' }),
      value: String(r.rewardsRedeemed),
      hint: t('dash.results.newMembers', { count: r.newMembers, defaultValue: 'New members: {{count}}' }),
    },
    {
      icon: Wallet,
      label: t('dash.results.sales', { defaultValue: 'Sales from repeat visits' }),
      value: spend === null ? '—' : money(r.repeatVisits * spend),
      hint: spend === null
        ? t('dash.results.salesSetSpend', { defaultValue: 'Add your average spend below to see this' })
        : t('dash.results.salesHint', { spend: moneyCents(spend), defaultValue: 'Estimate: repeat visits × {{spend}}' }),
    },
  ];

  return (
    <section className="space-y-5">
      <header>
        <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">
          <TrendingUp className="w-4 h-4" /> {t('dash.results.kicker', { defaultValue: 'Results' })}
        </div>
        <h2 className="text-3xl font-serif-display font-semibold">{t('dash.results.title', { defaultValue: 'Your results' })}</h2>
        <p className="text-gray-500 mt-1">{t('dash.results.sub', { defaultValue: 'What your loyalty program brought you, from your real customer activity.' })}</p>
      </header>

      <div className="flex flex-wrap gap-2">
        {periods.map(([key, label]) => (
          <button key={key} onClick={() => setPeriod(key)}
            className={`px-3 py-1.5 rounded-full text-sm border transition ${period === key ? 'bg-[#37352F] text-white border-[#37352F]' : 'bg-white notion-border text-gray-600 hover:bg-[#F7F7F5]'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map(({ icon: Icon, label, value, hint }) => (
          <div key={label} className="border notion-border rounded-xl p-4 min-w-0">
            <div className="flex items-start gap-1.5 text-xs font-medium text-gray-500 leading-tight"><Icon className="w-3.5 h-3.5 shrink-0" /><span className="break-words min-w-0">{label}</span></div>
            <div className="text-2xl sm:text-3xl font-semibold text-[#37352F] mt-1.5 break-words">{value}</div>
            <div className="text-xs text-gray-400 mt-1 leading-snug">{hint}</div>
          </div>
        ))}
      </div>

      {camp && camp.count > 0 && (
        <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap rounded-xl bg-[#F7F7F5] px-4 py-3">
          <p className="flex items-start gap-2 text-sm text-[#37352F]">
            <Megaphone className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{t('dash.results.campaigns', { count: camp.count, reached: camp.reached, returned: camp.returned,
              defaultValue: 'Campaigns this period reached {{reached}}. Came back within 7 days: {{returned}}.' })}</span>
          </p>
          <button onClick={onOpenCampaigns} className="inline-flex items-center gap-1 text-sm font-medium text-[#37352F] hover:underline">
            {t('dash.results.viewCampaigns', { defaultValue: 'View campaigns' })} <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="border notion-border rounded-xl p-4 sm:p-5">
        <label htmlFor="avg-spend" className="block text-sm font-medium text-[#37352F]">
          {t('dash.results.spendLabel', { defaultValue: 'Average spend per visit' })}
        </label>
        <p className="text-xs text-gray-500 mt-0.5">
          {t('dash.results.spendNote', { defaultValue: 'Only used for the sales estimate above. Only you can see it.' })}
        </p>
        <div className="flex items-center gap-2 mt-3">
          <div className="flex items-center border notion-border rounded-lg bg-white focus-within:ring-2 focus-within:ring-[#37352F]/10 w-40">
            <span className="pl-3 text-sm text-gray-500">{symbol}</span>
            <input id="avg-spend" inputMode="decimal" value={spendInput} disabled={!spendLoaded}
              onChange={(e) => setSpendInput(e.target.value)} placeholder="8.50"
              onKeyDown={(e) => { if (e.key === 'Enter' && spendChanged) void saveSpend(); }}
              className="w-full px-2 py-2 text-sm bg-transparent focus:outline-none" />
          </div>
          <button onClick={() => void saveSpend()} disabled={!spendChanged || savingSpend}
            className="inline-flex items-center gap-2 bg-[#37352F] text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-[#2a2a28] transition">
            {savingSpend && <Loader2 className="w-4 h-4 animate-spin" />}{t('dash.results.save', { defaultValue: 'Save' })}
          </button>
        </div>
        {Number.isNaN(parsedSpend) && (
          <p className="text-xs text-red-600 mt-2">{t('dash.results.spendInvalid', { defaultValue: 'Enter an amount like 8.50' })}</p>
        )}
      </div>
    </section>
  );
}
