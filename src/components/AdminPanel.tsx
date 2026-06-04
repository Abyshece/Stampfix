import { useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard, Users, UserCircle, MessageSquare, Mail, Search,
  LogOut, Loader2, Shield, ChevronRight,
  Ban, Snowflake, Trash2, RotateCcw, ArrowUpCircle, ArrowDownCircle, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { useAuth, signOut } from '../lib/auth';
import {
  checkIsAdmin, fetchKPIs, listMerchants, listCustomers,
  listTickets, listContactMessages,
  setMerchantStatus, setMerchantPlan, setTicketStatus, setContactMessageStatus,
  type KPIBuckets, type MerchantRow, type CustomerRow, type TicketRow,
  type ContactMessage, type MerchantStatus,
} from '../services/admin';

type AdminTab = 'OVERVIEW' | 'B2B' | 'B2B2C' | 'B2B_REPORTS' | 'B2B2C_REPORTS' | 'CONTACT';

export function AdminPanel() {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<AdminTab>('OVERVIEW');

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setIsAdmin(false); return; }
    checkIsAdmin().then(setIsAdmin);
  }, [user, authLoading]);

  if (authLoading || isAdmin === null) {
    return <FullPageLoader />;
  }
  if (!user) return <NotLoggedIn />;
  if (!isAdmin) return <NotAuthorized email={user.email ?? null} />;

  return (
    <div className="min-h-screen bg-[#FBFBFA] flex">
      <aside className="w-60 bg-[#F7F7F5] border-r notion-border fixed inset-y-0 left-0 z-40 flex flex-col">
        <div className="p-5 border-b notion-border">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-4 h-4 text-amber-600" />
            <span className="text-xs font-bold uppercase tracking-widest text-amber-700">Admin</span>
          </div>
          <div className="text-sm font-semibold">Stampfix Platform</div>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {([
            ['OVERVIEW', LayoutDashboard, 'Overview'],
            ['B2B', Users, 'B2B Clients'],
            ['B2B2C', UserCircle, 'B2B2C Clients'],
            ['B2B_REPORTS', MessageSquare, 'B2B Reports'],
            ['B2B2C_REPORTS', MessageSquare, 'B2B2C Reports'],
            ['CONTACT', Mail, 'Contact Inquiries'],
          ] as const).map(([id, Icon, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm transition ${
                tab === id ? 'bg-white text-[#37352F] shadow-sm font-medium' : 'text-gray-600 hover:bg-white/50'
              }`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t notion-border space-y-1.5">
          <a href="/" className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-gray-500 hover:text-[#37352F]">
            <ChevronRight className="w-3 h-3" /> Back to main app
          </a>
          <button
            onClick={() => signOut().then(() => { window.location.href = '/'; })}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-red-50 text-gray-600 hover:text-red-600"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </aside>

      <main className="ml-60 flex-1 p-8 max-w-7xl">
        {tab === 'OVERVIEW' && <OverviewTab />}
        {tab === 'B2B' && <B2BTab />}
        {tab === 'B2B2C' && <B2B2CTab />}
        {tab === 'B2B_REPORTS' && <ReportsTab source="merchant" title="B2B Reports" subtitle="Tickets submitted by merchants." />}
        {tab === 'B2B2C_REPORTS' && <ReportsTab source="customer" title="B2B2C Reports" subtitle="Tickets submitted by end-customers." />}
        {tab === 'CONTACT' && <ContactTab />}
      </main>
    </div>
  );
}

// =====================================================================
// OVERVIEW
// =====================================================================

function OverviewTab() {
  const [kpi, setKpi] = useState<KPIBuckets | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchKPIs().then(setKpi).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <Loader />;
  if (!kpi) return <Empty msg="No data." />;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-serif-display font-semibold mb-1">Overview</h1>
        <p className="text-gray-500 text-sm">Platform-wide KPIs across daily, weekly, and monthly windows.</p>
      </header>

      {/* Top: open work attention */}
      {(kpi.open_tickets > 0 || kpi.new_contact_messages > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div className="flex-1 text-sm">
            <strong>You have unfinished work.</strong>
            {kpi.open_tickets > 0 && ` ${kpi.open_tickets} open ticket${kpi.open_tickets === 1 ? '' : 's'}.`}
            {kpi.new_contact_messages > 0 && ` ${kpi.new_contact_messages} new contact inquir${kpi.new_contact_messages === 1 ? 'y' : 'ies'}.`}
          </div>
        </div>
      )}

      <KPIBucket
        title="Merchant signups"
        today={kpi.signups_today}
        weekly={kpi.signups_7d}
        monthly={kpi.signups_30d}
        delta={{ today: kpi.signups_today, yesterday: kpi.signups_yesterday }}
      />
      <KPIBucket
        title="New customer cards"
        today={kpi.customers_today}
        weekly={kpi.customers_7d}
        monthly={kpi.customers_30d}
      />
      <KPIBucket
        title="Stamping activity"
        today={kpi.activities_today}
        weekly={kpi.activities_7d}
        monthly={kpi.activities_30d}
      />
      <KPIBucket
        title="Rewards redeemed"
        today={kpi.rewards_today}
        weekly={kpi.rewards_7d}
        monthly={kpi.rewards_30d}
      />

      {/* Signup sparkline */}
      <div className="bg-white border notion-border rounded-lg p-6">
        <h3 className="font-semibold mb-2">Merchant signups · last 14 days</h3>
        <Sparkline data={kpi.signups_sparkline} />
      </div>
    </div>
  );
}

function KPIBucket({
  title, today, weekly, monthly, delta,
}: {
  title: string;
  today: number;
  weekly: number;
  monthly: number;
  delta?: { today: number; yesterday: number };
}) {
  let trendStr: string | null = null;
  if (delta) {
    if (delta.yesterday === 0 && delta.today === 0) trendStr = null;
    else if (delta.yesterday === 0) trendStr = '+100%';
    else {
      const pct = ((delta.today - delta.yesterday) / delta.yesterday) * 100;
      trendStr = (pct >= 0 ? '+' : '') + pct.toFixed(0) + '%';
    }
  }
  return (
    <div>
      <h3 className="text-xs uppercase tracking-widest font-bold text-gray-400 mb-2">{title}</h3>
      <div className="grid grid-cols-3 gap-4">
        <MetricCard label="Today" value={today} accent="text-[#37352F]" delta={trendStr} />
        <MetricCard label="Last 7 days" value={weekly} accent="text-blue-600" />
        <MetricCard label="Last 30 days" value={monthly} accent="text-purple-600" />
      </div>
    </div>
  );
}

function MetricCard({ label, value, accent, delta }: { label: string; value: number | string; accent: string; delta?: string | null }) {
  return (
    <div className="bg-white border notion-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500">{label}</span>
        {delta && (
          <span className={`text-xs font-medium ${delta.startsWith('-') ? 'text-red-600' : delta === '+0%' ? 'text-gray-400' : 'text-green-600'}`}>
            {delta}
          </span>
        )}
      </div>
      <div className={`text-2xl font-bold ${accent}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </div>
  );
}

function Sparkline({ data }: { data: Array<{ date: string; count: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div>
      <div className="flex items-end gap-1 h-24">
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col justify-end" title={`${d.date}: ${d.count}`}>
            <div
              className="bg-[#37352F] rounded-t opacity-80 hover:opacity-100 transition-all"
              style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count > 0 ? '3px' : '0' }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1 text-[9px] text-gray-400 font-medium mt-1">
        {data.map((d, i) => (
          <div key={i} className="flex-1 text-center">
            {i === 0 || i === data.length - 1 || i === Math.floor(data.length / 2)
              ? new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

// =====================================================================
// B2B CLIENTS (merchants)
// =====================================================================

function B2BTab() {
  const [rows, setRows] = useState<MerchantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async (s = '') => {
    setLoading(true);
    try { setRows(await listMerchants(s, 200)); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(''); }, []);

  const handleStatus = async (m: MerchantRow, target: MerchantStatus) => {
    const action = target === 'deleted' ? 'PERMANENTLY DELETE' : target;
    if (!confirm(`Set ${m.merchant_code} (${m.email}) to "${action}"?`)) return;
    setBusyId(m.id);
    try { await setMerchantStatus(m.id, target); await load(search); }
    catch (e) { alert(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusyId(null); }
  };

  const handlePlanToggle = async (m: MerchantRow) => {
    const newPlan = m.plan === 'pro' ? 'free' : 'pro';
    if (!confirm(`Switch ${m.merchant_code} to ${newPlan.toUpperCase()}?`)) return;
    setBusyId(m.id);
    try { await setMerchantPlan(m.id, newPlan); await load(search); }
    catch (e) { alert(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusyId(null); }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-serif-display font-semibold mb-1">B2B Clients</h1>
        <p className="text-gray-500 text-sm">All merchants. Search by code (STF-XXXX), email, or business name.</p>
      </header>

      <form onSubmit={(e) => { e.preventDefault(); load(search.trim()); }} className="flex gap-2">
        <div className="flex-1 flex items-center bg-white border notion-border rounded-md px-3">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="STF-0001 or email or business name..."
            className="flex-1 px-2 py-2 bg-transparent outline-none text-sm"
          />
        </div>
        <button type="submit" className="bg-[#37352F] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-opacity-90">
          Search
        </button>
      </form>

      {loading ? <Loader /> : rows.length === 0 ? <Empty msg="No merchants found." /> : (
        <div className="bg-white border notion-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#F7F7F5] text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Code</th>
                <th className="px-3 py-2 text-left">Business / email</th>
                <th className="px-2 py-2 text-left">Country</th>
                <th className="px-2 py-2 text-left">Plan</th>
                <th className="px-2 py-2 text-left">Status</th>
                <th className="px-2 py-2 text-right">Customers</th>
                <th className="px-2 py-2 text-right">Activity 7d</th>
                <th className="px-2 py-2 text-left">Signed up</th>
                <th className="px-2 py-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="border-t notion-border hover:bg-[#FBFBFA] align-top">
                  <td className="px-3 py-3 font-mono text-xs">{m.merchant_code}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div>
                        <div className="font-medium truncate max-w-[200px]">{m.business_name || '—'}</div>
                        <div className="text-xs text-gray-500 truncate max-w-[200px]">{m.email}</div>
                      </div>
                      {m.is_platform_admin && <span className="text-[10px] font-bold uppercase bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">Admin</span>}
                    </div>
                  </td>
                  <td className="px-2 py-3 text-gray-500 text-xs">{m.country ?? '—'}</td>
                  <td className="px-2 py-3">
                    <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                      m.plan === 'pro' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                    }`}>{m.plan.toUpperCase()}</span>
                  </td>
                  <td className="px-2 py-3">
                    <StatusBadge status={m.status} />
                  </td>
                  <td className="px-2 py-3 text-right font-medium text-sm">{m.card_count}</td>
                  <td className="px-2 py-3 text-right text-gray-500 text-sm">{m.recent_activity_count}</td>
                  <td className="px-2 py-3 text-xs text-gray-500">{new Date(m.created_at).toLocaleDateString()}</td>
                  <td className="px-2 py-3 text-center">
                    <div className="inline-flex items-center gap-0.5">
                      {busyId === m.id ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                        <>
                          {/* Plan flip */}
                          <IconButton
                            title={m.plan === 'pro' ? 'Downgrade to Free' : 'Comp Pro'}
                            onClick={() => handlePlanToggle(m)}
                          >
                            {m.plan === 'pro' ? <ArrowDownCircle className="w-4 h-4 text-gray-500" /> : <ArrowUpCircle className="w-4 h-4 text-amber-600" />}
                          </IconButton>
                          {/* Freeze (stop stamping) */}
                          {m.status !== 'frozen' && (
                            <IconButton title="Freeze (stop stamping)" onClick={() => handleStatus(m, 'frozen')}>
                              <Snowflake className="w-4 h-4 text-blue-500" />
                            </IconButton>
                          )}
                          {/* Block */}
                          {m.status !== 'blocked' && (
                            <IconButton title="Block (account disabled)" onClick={() => handleStatus(m, 'blocked')}>
                              <Ban className="w-4 h-4 text-red-500" />
                            </IconButton>
                          )}
                          {/* Reactivate (only when not active) */}
                          {m.status !== 'active' && (
                            <IconButton title="Reactivate" onClick={() => handleStatus(m, 'active')}>
                              <RotateCcw className="w-4 h-4 text-green-600" />
                            </IconButton>
                          )}
                          {/* Delete */}
                          <IconButton title="Delete account" onClick={() => handleStatus(m, 'deleted')}>
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </IconButton>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// B2B2C CLIENTS (customers)
// =====================================================================

function B2B2CTab() {
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [merchants, setMerchants] = useState<MerchantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [merchantFilter, setMerchantFilter] = useState<string>('');

  const load = async () => {
    setLoading(true);
    try {
      setRows(await listCustomers(search.trim() || undefined, merchantFilter || null, 200));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    listMerchants('', 500).then(setMerchants).catch(console.error);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchantFilter]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-serif-display font-semibold mb-1">B2B2C Clients</h1>
        <p className="text-gray-500 text-sm">End-customers enrolled in merchant loyalty programs.</p>
      </header>

      <div className="flex gap-2 flex-wrap">
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="flex-1 flex gap-2 min-w-[300px]">
          <div className="flex-1 flex items-center bg-white border notion-border rounded-md px-3">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Customer email or name..."
              className="flex-1 px-2 py-2 bg-transparent outline-none text-sm"
            />
          </div>
          <button type="submit" className="bg-[#37352F] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-opacity-90">
            Search
          </button>
        </form>
        <select
          value={merchantFilter} onChange={(e) => setMerchantFilter(e.target.value)}
          className="bg-white border notion-border rounded-md px-3 py-2 text-sm"
        >
          <option value="">All merchants</option>
          {merchants.map((m) => (
            <option key={m.id} value={m.id}>{m.merchant_code} · {m.business_name}</option>
          ))}
        </select>
      </div>

      {loading ? <Loader /> : rows.length === 0 ? <Empty msg="No customers match." /> : (
        <div className="bg-white border notion-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#F7F7F5] text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Customer</th>
                <th className="px-3 py-2 text-left">Merchant</th>
                <th className="px-2 py-2 text-left">Joined at</th>
                <th className="px-2 py-2 text-right">Stamps</th>
                <th className="px-2 py-2 text-right">Rewards</th>
                <th className="px-2 py-2 text-left">Joined date</th>
                <th className="px-2 py-2 text-left">Card status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.card_id} className="border-t notion-border hover:bg-[#FBFBFA]">
                  <td className="px-3 py-3">
                    <div className="font-medium truncate max-w-[200px]">{c.customer_name || '—'}</div>
                    <div className="text-xs text-gray-500 truncate max-w-[200px]">{c.email}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-medium truncate max-w-[200px]">{c.business_name}</div>
                    <div className="text-xs text-gray-400 font-mono">{c.merchant_code}</div>
                  </td>
                  <td className="px-2 py-3 text-xs text-gray-500">{c.location_name ?? '—'}</td>
                  <td className="px-2 py-3 text-right font-medium">{c.current_stamps}</td>
                  <td className="px-2 py-3 text-right text-gray-500">{c.rewards_redeemed}</td>
                  <td className="px-2 py-3 text-xs text-gray-500">{new Date(c.joined_at).toLocaleDateString()}</td>
                  <td className="px-2 py-3">
                    <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                      c.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>{c.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// REPORTS (both B2B and B2B2C share the same component)
// =====================================================================

function ReportsTab({ source, title, subtitle }: { source: 'merchant' | 'customer'; title: string; subtitle: string }) {
  const [rows, setRows] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await listTickets(source, (statusFilter || null) as 'open' | 'in_progress' | 'resolved' | 'dismissed' | null, 200));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, source]);

  const handleUpdate = async (id: string, newStatus: 'open' | 'in_progress' | 'resolved' | 'dismissed') => {
    try { await setTicketStatus(id, newStatus); await load(); }
    catch (e) { alert(e instanceof Error ? e.message : 'Failed'); }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-serif-display font-semibold mb-1">{title}</h1>
        <p className="text-gray-500 text-sm">{subtitle}</p>
      </header>

      <div className="flex gap-2">
        {(['open', 'in_progress', 'resolved', 'dismissed', ''] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-1.5 rounded-md border transition ${
              statusFilter === s ? 'bg-[#37352F] text-white border-[#37352F]' : 'bg-white notion-border hover:bg-[#F7F7F5]'
            }`}
          >
            {s === '' ? 'All' : s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {loading ? <Loader /> : rows.length === 0 ? <Empty msg="No reports in this category." /> : (
        <div className="space-y-2">
          {rows.map((t) => {
            const expanded = expandedId === t.id;
            return (
              <div key={t.id} className="bg-white border notion-border rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedId(expanded ? null : t.id)}
                  className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-[#FBFBFA] transition"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <TicketStatusBadge status={t.status} />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{t.category}</span>
                      <span className="font-medium text-sm">{t.subject}</span>
                    </div>
                    <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                      {source === 'merchant' ? (
                        <>
                          <span className="font-mono">{t.merchant_code ?? '—'}</span>
                          <span>·</span>
                          <span>{t.merchant_email}</span>
                        </>
                      ) : (
                        <>
                          <span>{t.customer_name ?? 'Anonymous'}</span>
                          <span>·</span>
                          <span>{t.customer_email}</span>
                          {t.related_business_name && (<><span>·</span><span>about {t.related_business_name}</span></>)}
                        </>
                      )}
                      <span>·</span>
                      <span>{new Date(t.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform mt-1 ${expanded ? 'rotate-90' : ''}`} />
                </button>
                {expanded && (
                  <div className="border-t notion-border px-4 py-3 space-y-3 bg-[#FBFBFA]">
                    <div className="text-sm whitespace-pre-wrap">{t.body}</div>
                    {t.admin_notes && (
                      <div className="text-xs bg-amber-50 border border-amber-100 p-2 rounded">
                        <strong>Admin notes:</strong> {t.admin_notes}
                      </div>
                    )}
                    <div className="flex gap-2 flex-wrap pt-1">
                      {t.status !== 'in_progress' && (
                        <button onClick={() => handleUpdate(t.id, 'in_progress')} className="text-xs px-2 py-1 rounded border notion-border hover:bg-white">
                          Mark in progress
                        </button>
                      )}
                      {t.status !== 'resolved' && (
                        <button onClick={() => handleUpdate(t.id, 'resolved')} className="text-xs px-2 py-1 rounded border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Resolve
                        </button>
                      )}
                      {t.status !== 'dismissed' && (
                        <button onClick={() => handleUpdate(t.id, 'dismissed')} className="text-xs px-2 py-1 rounded border notion-border hover:bg-white text-gray-500">
                          Dismiss
                        </button>
                      )}
                      {t.status !== 'open' && (
                        <button onClick={() => handleUpdate(t.id, 'open')} className="text-xs px-2 py-1 rounded border notion-border hover:bg-white">
                          Reopen
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// CONTACT INQUIRIES
// =====================================================================

function ContactTab() {
  const [rows, setRows] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('new');

  const load = async () => {
    setLoading(true);
    try { setRows(await listContactMessages(statusFilter || null, 200)); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter]);

  const handleStatus = async (id: string, newStatus: 'new' | 'replied' | 'archived') => {
    try { await setContactMessageStatus(id, newStatus); await load(); }
    catch (e) { alert(e instanceof Error ? e.message : 'Failed'); }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-serif-display font-semibold mb-1">Contact Inquiries</h1>
        <p className="text-gray-500 text-sm">Messages submitted via the public contact form on stampfix.app.</p>
      </header>

      <div className="flex gap-2">
        {(['new', 'replied', 'archived', ''] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-1.5 rounded-md border transition ${
              statusFilter === s ? 'bg-[#37352F] text-white border-[#37352F]' : 'bg-white notion-border hover:bg-[#F7F7F5]'
            }`}
          >
            {s === '' ? 'All' : s}
          </button>
        ))}
      </div>

      {loading ? <Loader /> : rows.length === 0 ? <Empty msg="No inquiries here." /> : (
        <div className="space-y-3">
          {rows.map((m) => (
            <div key={m.id} className="bg-white border notion-border rounded-lg p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold">{m.name}</span>
                    <span className="text-xs text-gray-500">{m.email}</span>
                    {m.business_name && <span className="text-xs text-gray-500">· {m.business_name}</span>}
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                      {m.inquiry_type.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400">{new Date(m.created_at).toLocaleString()}</div>
                </div>
                <ContactStatusBadge status={m.status} />
              </div>
              <div className="text-sm whitespace-pre-wrap pt-1">{m.message}</div>
              <div className="flex gap-2 pt-2 border-t notion-border flex-wrap">
                <a
                  href={`mailto:${m.email}?subject=Re: Your inquiry to Stampfix`}
                  className="text-xs px-2 py-1 rounded border notion-border hover:bg-[#F7F7F5] inline-flex items-center gap-1"
                >
                  <Mail className="w-3 h-3" /> Reply via email
                </a>
                {m.status !== 'replied' && (
                  <button onClick={() => handleStatus(m.id, 'replied')} className="text-xs px-2 py-1 rounded border border-green-200 bg-green-50 text-green-700 hover:bg-green-100">
                    Mark replied
                  </button>
                )}
                {m.status !== 'archived' && (
                  <button onClick={() => handleStatus(m.id, 'archived')} className="text-xs px-2 py-1 rounded border notion-border hover:bg-white text-gray-500">
                    Archive
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// Reusable
// =====================================================================

function IconButton({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title} className="p-1.5 hover:bg-[#F7F7F5] rounded transition">
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: MerchantStatus }) {
  const map: Record<MerchantStatus, string> = {
    active: 'bg-green-100 text-green-700',
    frozen: 'bg-blue-100 text-blue-700',
    blocked: 'bg-red-100 text-red-700',
    deleted: 'bg-gray-200 text-gray-600',
  };
  return <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${map[status]}`}>{status.toUpperCase()}</span>;
}

function TicketStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    open: 'bg-amber-100 text-amber-700',
    in_progress: 'bg-blue-100 text-blue-700',
    resolved: 'bg-green-100 text-green-700',
    dismissed: 'bg-gray-200 text-gray-600',
  };
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${map[status] ?? ''}`}>{status.replace('_', ' ').toUpperCase()}</span>;
}

function ContactStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    new: 'bg-amber-100 text-amber-700',
    replied: 'bg-green-100 text-green-700',
    archived: 'bg-gray-200 text-gray-600',
  };
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${map[status] ?? ''}`}>{status.toUpperCase()}</span>;
}

function Loader() {
  return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
}

function Empty({ msg }: { msg: string }) {
  return <div className="text-sm text-gray-500 bg-white border notion-border rounded-lg p-8 text-center">{msg}</div>;
}

function FullPageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  );
}

function NotLoggedIn() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="max-w-sm text-center space-y-4">
        <Shield className="w-12 h-12 text-gray-300 mx-auto" />
        <h1 className="text-2xl font-serif-display font-semibold">Sign in required</h1>
        <p className="text-sm text-gray-500">The admin panel is only accessible to authorized platform admins.</p>
        <a href="/" className="inline-block bg-[#37352F] text-white px-4 py-2 rounded-md text-sm font-medium">Go to main site</a>
      </div>
    </div>
  );
}

function NotAuthorized({ email }: { email: string | null }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="max-w-sm text-center space-y-4">
        <Shield className="w-12 h-12 text-red-300 mx-auto" />
        <h1 className="text-2xl font-serif-display font-semibold">Not authorized</h1>
        <p className="text-sm text-gray-500">You're signed in as <strong className="text-[#37352F]">{email}</strong> but this account isn't a platform admin.</p>
        <a href="/" className="inline-block bg-[#37352F] text-white px-4 py-2 rounded-md text-sm font-medium">Back to main site</a>
      </div>
    </div>
  );
}
