import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard, Users, UserCircle, MessageSquare, Mail, Search, Tag, Activity,
  LogOut, Loader2, Shield, ChevronRight, Menu, X,
  Ban, Snowflake, Trash2, RotateCcw, ArrowUpCircle, ArrowDownCircle, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { useAuth, signOut } from '../lib/auth';
import {
  checkIsAdmin, fetchRangedKPIs, listMerchants, listCustomers, fetchStripeMrr,
  listTickets, listContactMessages,
  setMerchantStatus, setMerchantPlan, setMerchantNotes, setTicketStatus, setContactMessageStatus,
  type RangedKPIs, type KPIBlock, type MerchantRow, type CustomerRow, type TicketRow,
  type ContactMessage, type MerchantStatus, type StripeMrr,
  fetchActivityLog, fetchWalletErrors, fetchRecentSignups, fetchJobRuns,
  type ActivityLogRow, type WalletErrorRow, type SignupRow, type JobRunRow,
  isReadOnlyAdminEmail,
} from '../services/admin';
import { OffersTab } from './OffersTab';
import { setMerchantApproval, getMerchantApproval } from '../lib/db';

type AdminTab = 'OVERVIEW' | 'B2B' | 'B2B2C' | 'B2B_REPORTS' | 'B2B2C_REPORTS' | 'CONTACT' | 'OFFERS' | 'LOGS';

export function AdminPanel() {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<AdminTab>('OVERVIEW');
  // Mobile drawer state. Declared up here (before any early-returns)
  // so hook order is stable on every render — React error #310 fires
  // if a hook moves from "called" to "not called" across renders.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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

  const readOnly = isReadOnlyAdminEmail(user.email);

  const setTabAndCloseNav = (newTab: AdminTab) => {
    setTab(newTab);
    setMobileNavOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#FBFBFA]">
      {readOnly && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-xs sm:text-sm px-4 py-2 text-center">
          View-only access — you can browse everything, but changes are disabled.
        </div>
      )}
      {/* Mobile top bar — hamburger + title. Hidden on md+ where the
          fixed sidebar provides navigation. */}
      <div className="md:hidden sticky top-0 z-30 bg-white border-b notion-border px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => setMobileNavOpen(true)}
          className="p-1.5 -ml-1.5 hover:bg-[#F7F7F5] rounded transition"
          aria-label="Open navigation"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-amber-600" />
          <span className="text-xs font-bold uppercase tracking-widest text-amber-700">Admin</span>
        </div>
        <div className="w-7" /> {/* spacer to center the title */}
      </div>

      {/* Mobile drawer backdrop */}
      {mobileNavOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-40 backdrop-blur-sm"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Sidebar — fixed on desktop, drawer on mobile */}
      <aside className={`
        w-60 bg-[#F7F7F5] border-r notion-border fixed inset-y-0 left-0 z-50 flex flex-col
        transition-transform duration-300
        ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="p-5 border-b notion-border flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-bold uppercase tracking-widest text-amber-700">Admin</span>
            </div>
            <div className="text-sm font-semibold">Stampfix Platform</div>
          </div>
          {/* Close button (mobile only) */}
          <button
            onClick={() => setMobileNavOpen(false)}
            className="md:hidden p-1 -mr-1 hover:bg-white rounded transition"
            aria-label="Close navigation"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {([
            ['OVERVIEW', LayoutDashboard, 'Overview'],
            ['B2B', Users, 'B2B Clients'],
            ['B2B2C', UserCircle, 'B2B2C Clients'],
            ['B2B_REPORTS', MessageSquare, 'B2B Reports'],
            ['B2B2C_REPORTS', MessageSquare, 'B2B2C Reports'],
            ['CONTACT', Mail, 'Contact Inquiries'],
            ['OFFERS', Tag, 'Offers'],
            ['LOGS', Activity, 'Logs'],
          ] as const).map(([id, Icon, label]) => (
            <button
              key={id}
              onClick={() => setTabAndCloseNav(id)}
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

      {/* Main — no left margin on mobile, 240px on desktop. Reduced
          padding on mobile so tables get more room. */}
      <main className="md:ml-60 p-4 md:p-8 max-w-7xl">
        {tab === 'OVERVIEW' && <OverviewTab />}
        {tab === 'B2B' && <B2BTab />}
        {tab === 'B2B2C' && <B2B2CTab />}
        {tab === 'B2B_REPORTS' && <ReportsTab source="merchant" title="B2B Reports" subtitle="Tickets submitted by merchants." />}
        {tab === 'B2B2C_REPORTS' && <ReportsTab source="customer" title="B2B2C Reports" subtitle="Tickets submitted by end-customers." />}
        {tab === 'CONTACT' && <ContactTab />}
        {tab === 'LOGS' && <LogsTab />}
        {tab === 'OFFERS' && <OffersTab />}
      </main>
    </div>
  );
}

// =====================================================================
// OVERVIEW
// =====================================================================

type RangePreset = 'today' | 'yesterday' | '7d' | '30d' | 'this_month' | 'last_month' | 'custom';

function OverviewTab() {
  const [preset, setPreset] = useState<RangePreset>('30d');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [data, setData] = useState<RangedKPIs | null>(null);
  const [loading, setLoading] = useState(true);

  // Resolve the chosen preset into actual from/to dates.
  const { fromDate, toDate, label } = useMemo(() => {
    return resolveRange(preset, customFrom, customTo);
  }, [preset, customFrom, customTo]);

  useEffect(() => {
    setLoading(true);
    fetchRangedKPIs(fromDate, toDate)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [fromDate, toDate]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-serif-display font-semibold mb-1">Overview</h1>
        <p className="text-gray-500 text-sm">Platform KPIs for {label}.</p>
      </header>

      {/* Date range picker — single source of truth for everything below */}
      <div className="bg-white border notion-border rounded-lg p-4 space-y-3 md:sticky md:top-0 z-10">
        <div className="flex flex-wrap gap-2 items-center">
          {([
            ['today', 'Today'],
            ['yesterday', 'Yesterday'],
            ['7d', 'Last 7 days'],
            ['30d', 'Last 30 days'],
            ['this_month', 'This month'],
            ['last_month', 'Last month'],
            ['custom', 'Custom'],
          ] as const).map(([id, lbl]) => (
            <button
              key={id}
              onClick={() => setPreset(id)}
              className={`text-xs px-3 py-1.5 rounded-md border transition ${
                preset === id ? 'bg-[#37352F] text-white border-[#37352F]' : 'bg-white notion-border hover:bg-[#F7F7F5]'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex items-center gap-2 text-sm pt-2 border-t notion-border">
            <label className="text-xs text-gray-500">From:</label>
            <input
              type="date" value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              max={customTo || undefined}
              className="bg-[#F7F7F5] border notion-border rounded px-2 py-1 text-xs"
            />
            <label className="text-xs text-gray-500 ml-2">To:</label>
            <input
              type="date" value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              min={customFrom || undefined}
              className="bg-[#F7F7F5] border notion-border rounded px-2 py-1 text-xs"
            />
          </div>
        )}
        <div className="text-[11px] text-gray-400">
          Showing data from <strong className="text-[#37352F]">{fromDate.toLocaleDateString()}</strong> to <strong className="text-[#37352F]">{toDate.toLocaleDateString()}</strong>
          {data && ` · ${data.range_days} day${data.range_days === 1 ? '' : 's'}`}
        </div>
      </div>

      {loading || !data ? <Loader /> : (
        <>
          {/* Open-work banner */}
          {(data.open_tickets > 0 || data.new_contact_messages > 0) && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <div className="flex-1 text-sm">
                <strong>You have unfinished work.</strong>
                {data.open_tickets > 0 && ` ${data.open_tickets} open ticket${data.open_tickets === 1 ? '' : 's'}.`}
                {data.new_contact_messages > 0 && ` ${data.new_contact_messages} new contact inquir${data.new_contact_messages === 1 ? 'y' : 'ies'}.`}
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <KPIContainer title="Merchant signups" block={data.signups} accent="bg-blue-50 text-blue-700" />
            <KPIContainer title="New customer cards" block={data.customers} accent="bg-purple-50 text-purple-700" />
            <KPIContainer title="Stamping activity" block={data.activity} accent="bg-orange-50 text-orange-700" />
            <KPIContainer title="Rewards redeemed" block={data.rewards} accent="bg-green-50 text-green-700" />
          </div>
        </>
      )}
    </div>
  );
}

/** A KPI tile: total + delta vs prior window + daily distribution chart. */
function KPIContainer({ title, block, accent }: { title: string; block: KPIBlock; accent: string }) {
  let deltaPct: number | null = null;
  if (block.prev === 0 && block.total === 0) deltaPct = null;
  else if (block.prev === 0) deltaPct = 100;
  else deltaPct = ((block.total - block.prev) / block.prev) * 100;

  const max = Math.max(1, ...block.daily.map((d) => d.count));

  return (
    <div className="bg-white border notion-border rounded-lg p-5 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <div className={`inline-block text-[10px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded ${accent}`}>{title}</div>
          <div className="text-3xl font-bold mt-2">{block.total.toLocaleString()}</div>
        </div>
        {deltaPct !== null && (
          <div className={`text-xs font-medium ${
            deltaPct >= 5 ? 'text-green-600'
              : deltaPct <= -5 ? 'text-red-600'
              : 'text-gray-400'
          }`}>
            {deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(0)}% vs prior
          </div>
        )}
      </div>
      <div>
        <div className="flex items-end gap-0.5 h-16">
          {block.daily.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col justify-end" title={`${d.date}: ${d.count}`}>
              <div
                className="bg-[#37352F] rounded-t opacity-80 hover:opacity-100 transition-all"
                style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count > 0 ? '2px' : '0' }}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[9px] text-gray-400 font-medium mt-1">
          <span>{block.daily[0] ? new Date(block.daily[0].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</span>
          <span>{block.daily[block.daily.length - 1] ? new Date(block.daily[block.daily.length - 1].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</span>
        </div>
      </div>
      <div className="text-xs text-gray-500 pt-2 border-t notion-border">
        Prior period: <strong className="text-[#37352F]">{block.prev.toLocaleString()}</strong>
      </div>
    </div>
  );
}

/** Resolves a preset (or custom from/to) into actual Date objects. */
function resolveRange(preset: RangePreset, customFrom: string, customTo: string): { fromDate: Date; toDate: Date; label: string } {
  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case 'today':
      return { fromDate: startOfToday, toDate: endOfToday, label: 'today' };
    case 'yesterday': {
      const start = new Date(startOfToday); start.setDate(start.getDate() - 1);
      const end = new Date(start); end.setHours(23, 59, 59, 999);
      return { fromDate: start, toDate: end, label: 'yesterday' };
    }
    case '7d': {
      const start = new Date(startOfToday); start.setDate(start.getDate() - 6);
      return { fromDate: start, toDate: endOfToday, label: 'the last 7 days' };
    }
    case '30d': {
      const start = new Date(startOfToday); start.setDate(start.getDate() - 29);
      return { fromDate: start, toDate: endOfToday, label: 'the last 30 days' };
    }
    case 'this_month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { fromDate: start, toDate: endOfToday, label: 'this month' };
    }
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { fromDate: start, toDate: end, label: 'last month' };
    }
    case 'custom': {
      const start = customFrom ? new Date(customFrom + 'T00:00:00') : (() => { const d = new Date(startOfToday); d.setDate(d.getDate() - 29); return d; })();
      const end = customTo ? new Date(customTo + 'T23:59:59') : endOfToday;
      return { fromDate: start, toDate: end, label: 'the selected range' };
    }
  }
}

// =====================================================================
// B2B CLIENTS (merchants)
// =====================================================================

function B2BTab() {
  const [rows, setRows] = useState<MerchantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [stripeMrr, setStripeMrr] = useState<StripeMrr | null>(null);

  const load = async (s = '') => {
    setLoading(true);
    try { setRows(await listMerchants(s, 200)); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(''); fetchStripeMrr().then(setStripeMrr).catch(() => {}); }, []);

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
        <p className="text-gray-500 text-sm">All merchants. Click any row for full detail and admin notes.</p>
      </header>

      {stripeMrr && (
        <div className="bg-white border notion-border rounded-lg p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-gray-400 font-bold mb-0.5">Live MRR · from Stripe</div>
            <div className="text-2xl font-bold text-gray-900">
              {((stripeMrr.currency || 'cad').toUpperCase() === 'EUR' ? '€' : 'CA$')}{(stripeMrr.mrr_cents / 100).toFixed(2)}
              <span className="text-sm font-normal text-gray-400"> /mo</span>
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5">Exact, from active Stripe subscriptions (excludes comped merchants).</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-widest text-gray-400 font-bold mb-0.5">Active subs</div>
            <div className="text-2xl font-bold text-gray-900">{stripeMrr.active_subscriptions}</div>
          </div>
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); load(search.trim()); }} className="flex gap-2">
        <div className="flex-1 flex items-center bg-white border notion-border rounded-md px-3">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="STF-0001, email, business name, or registered company..."
            className="flex-1 px-2 py-2 bg-transparent outline-none text-sm"
          />
        </div>
        <button type="submit" className="bg-[#37352F] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-opacity-90">
          Search
        </button>
      </form>

      {loading ? <Loader /> : rows.length === 0 ? <Empty msg="No merchants found." /> : (
        <div className="bg-white border notion-border rounded-lg overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-[#F7F7F5] text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Code</th>
                <th className="px-3 py-2 text-left">Business / contact</th>
                <th className="px-2 py-2 text-left">Country</th>
                <th className="px-2 py-2 text-left">Plan</th>
                <th className="px-2 py-2 text-left">Status</th>
                <th className="px-2 py-2 text-right">Customers</th>
                <th className="px-2 py-2 text-right">MRR</th>
                <th className="px-2 py-2 text-right">Total</th>
                <th className="px-2 py-2 text-left">Joined on</th>
                <th className="px-2 py-2 text-left">Last login</th>
                <th className="px-2 py-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const isOpen = expandedId === m.id;
                return (
                  <Fragment key={m.id}>
                    <tr
                      onClick={() => setExpandedId(isOpen ? null : m.id)}
                      className="border-t notion-border hover:bg-[#FBFBFA] align-top cursor-pointer"
                    >
                      <td className="px-3 py-3 font-mono text-xs whitespace-nowrap">{m.merchant_code}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div>
                            <div className="font-medium truncate max-w-[220px]">{m.business_name || '—'}</div>
                            <div className="text-xs text-gray-500 truncate max-w-[220px]">{m.email}</div>
                            {m.phone && <div className="text-xs text-gray-500 truncate max-w-[220px]">📞 {m.phone}</div>}
                            {m.registered_company_name && (
                              <div className="text-[10px] text-gray-400 truncate max-w-[220px]" title={m.registered_company_name}>
                                {m.registered_company_name}
                              </div>
                            )}
                          </div>
                          {m.is_platform_admin && <span className="text-[10px] font-bold uppercase bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">Admin</span>}
                          {m.admin_notes && <span title={m.admin_notes} className="text-[10px] text-gray-400">📝</span>}
                        </div>
                      </td>
                      <td className="px-2 py-3 text-gray-500 text-xs">{m.country ?? '—'}</td>
                      <td className="px-2 py-3">
                        <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                          m.plan === 'pro' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                        }`}>{m.plan.toUpperCase()}</span>
                      </td>
                      <td className="px-2 py-3"><StatusBadge status={m.status} /></td>
                      <td className="px-2 py-3 text-right font-medium text-sm">{m.card_count}</td>
                      <td className="px-2 py-3 text-right text-xs text-gray-600">{formatCents(m.estimated_mrr_cents, m.country)}</td>
                      <td className="px-2 py-3 text-right text-xs text-gray-600">{formatCents(m.estimated_total_cents, m.country)}</td>
                      <td className="px-2 py-3 text-xs text-gray-500 whitespace-nowrap">{new Date(m.created_at).toLocaleDateString()}</td>
                      <td className="px-2 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {m.last_login_at ? relativeTime(new Date(m.last_login_at)) : 'Never'}
                      </td>
                      <td className="px-2 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-0.5">
                          {busyId === m.id ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                            <>
                              <IconButton
                                title={m.plan === 'pro' ? 'Downgrade to Free' : 'Comp Pro'}
                                onClick={() => handlePlanToggle(m)}
                              >
                                {m.plan === 'pro' ? <ArrowDownCircle className="w-4 h-4 text-gray-500" /> : <ArrowUpCircle className="w-4 h-4 text-amber-600" />}
                              </IconButton>
                              {m.status !== 'frozen' && (
                                <IconButton title="Freeze (stop stamping)" onClick={() => handleStatus(m, 'frozen')}>
                                  <Snowflake className="w-4 h-4 text-blue-500" />
                                </IconButton>
                              )}
                              {m.status !== 'blocked' && (
                                <IconButton title="Block (account disabled)" onClick={() => handleStatus(m, 'blocked')}>
                                  <Ban className="w-4 h-4 text-red-500" />
                                </IconButton>
                              )}
                              {m.status !== 'active' && (
                                <IconButton title="Reactivate" onClick={() => handleStatus(m, 'active')}>
                                  <RotateCcw className="w-4 h-4 text-green-600" />
                                </IconButton>
                              )}
                              <IconButton title="Delete account" onClick={() => handleStatus(m, 'deleted')}>
                                <Trash2 className="w-4 h-4 text-red-600" />
                              </IconButton>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-[#F7F7F5]">
                        <td colSpan={11} className="px-4 py-4">
                          <MerchantDetailPanel merchant={m} onChanged={() => load(search)} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Expanded detail panel showing comprehensive info + editable admin notes. */
function MerchantDetailPanel({ merchant, onChanged }: { merchant: MerchantRow; onChanged: () => void }) {
  const [notes, setNotes] = useState(merchant.admin_notes ?? '');
  const [approval, setApproval] = useState<'pending' | 'approved' | 'rejected' | null>(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  useEffect(() => { getMerchantApproval(merchant.id).then(setApproval).catch(() => {}); }, [merchant.id]);
  const changeApproval = async (status: 'pending' | 'approved' | 'rejected') => {
    setApprovalBusy(true);
    try { await setMerchantApproval(merchant.id, status); setApproval(status); onChanged(); }
    catch (e) { alert(e instanceof Error ? e.message : 'Failed to update approval'); }
    finally { setApprovalBusy(false); }
  };
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const save = async () => {
    setSaving(true);
    try {
      await setMerchantNotes(merchant.id, notes.trim());
      setSavedAt(Date.now());
      onChanged();
      setTimeout(() => setSavedAt(null), 2000);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
      {/* Identity */}
      <div className="bg-white border notion-border rounded p-3 space-y-1.5">
        <div className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Identity</div>
        <DetailRow label="Code" value={<span className="font-mono">{merchant.merchant_code}</span>} />
        <DetailRow label="Business" value={merchant.business_name || '—'} />
        <DetailRow label="Registered" value={merchant.registered_company_name || <span className="text-gray-400 italic">Not set</span>} />
        <DetailRow label="Email" value={merchant.email} />
        <DetailRow label="Phone" value={merchant.phone || <span className="text-gray-400 italic">Not provided</span>} />
        <DetailRow label="Country" value={merchant.country ?? '—'} />
      </div>
      {/* Activity */}
      <div className="bg-white border notion-border rounded p-3 space-y-1.5">
        <div className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Activity</div>
        <DetailRow label="Joined" value={new Date(merchant.created_at).toLocaleString()} />
        <DetailRow label="Active since" value={
          merchant.first_activity_at
            ? new Date(merchant.first_activity_at).toLocaleString()
            : <span className="text-gray-400 italic">No customer activity yet</span>
        } />
        <DetailRow label="Last login" value={
          merchant.last_login_at
            ? new Date(merchant.last_login_at).toLocaleString()
            : <span className="text-gray-400 italic">Never</span>
        } />
        <DetailRow label="Customers (active)" value={merchant.card_count.toString()} />
        <DetailRow label="Activity (7d)" value={merchant.recent_activity_count.toString()} />
      </div>
      {/* Account approval */}
      <div className="bg-white border notion-border rounded p-3 space-y-2 md:col-span-3">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Account approval</div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
            approval === 'approved' ? 'bg-green-100 text-green-700'
              : approval === 'rejected' ? 'bg-red-100 text-red-700'
              : 'bg-amber-100 text-amber-700'
          }`}>{approval ?? 'pending'}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => changeApproval('approved')} disabled={approvalBusy || approval === 'approved'}
            className="bg-green-600 text-white text-xs px-3 py-1.5 rounded hover:bg-green-700 disabled:opacity-40">Approve</button>
          <button onClick={() => changeApproval('rejected')} disabled={approvalBusy || approval === 'rejected'}
            className="bg-red-600 text-white text-xs px-3 py-1.5 rounded hover:bg-red-700 disabled:opacity-40">Reject</button>
          {approval && approval !== 'pending' && (
            <button onClick={() => changeApproval('pending')} disabled={approvalBusy}
              className="border notion-border text-xs px-3 py-1.5 rounded hover:bg-gray-50">Reset to pending</button>
          )}
        </div>
      </div>
      {/* Billing */}
      <div className="bg-white border notion-border rounded p-3 space-y-1.5">
        <div className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Billing</div>
        <DetailRow label="Plan" value={
          <span className={`font-semibold ${merchant.plan === 'pro' ? 'text-amber-700' : 'text-gray-600'}`}>
            {merchant.plan.toUpperCase()}
          </span>
        } />
        <DetailRow label="Plan started" value={
          merchant.plan_started_at
            ? new Date(merchant.plan_started_at).toLocaleDateString()
            : <span className="text-gray-400 italic">—</span>
        } />
        <DetailRow label="Est. MRR" value={formatCents(merchant.estimated_mrr_cents, merchant.country)} />
        <DetailRow label="Est. total revenue" value={formatCents(merchant.estimated_total_cents, merchant.country)} />
        <div className="pt-1 border-t notion-border text-[10px] text-gray-400 italic">
          Revenue is an estimate. For exact figures, check Stripe.
        </div>
      </div>
      {/* Admin notes */}
      <div className="bg-white border notion-border rounded p-3 space-y-2 md:col-span-3">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Admin notes (internal only)</div>
          <div className="flex items-center gap-2">
            {savedAt && <span className="text-[10px] text-green-600">✓ Saved</span>}
            <button
              onClick={save}
              disabled={saving}
              className="bg-[#37352F] text-white text-xs px-3 py-1 rounded hover:bg-opacity-90 disabled:opacity-50 flex items-center gap-1"
            >
              {saving && <Loader2 className="w-3 h-3 animate-spin" />}
              Save notes
            </button>
          </div>
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Internal notes — only platform admins can see this. e.g. 'Called Tuesday, follow up Thursday' or 'Comp Pro for 3 months, ends June 1'"
          className="w-full bg-[#F7F7F5] border notion-border rounded px-2 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-[#37352F]/20"
        />
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gray-500 whitespace-nowrap">{label}</span>
      <span className="text-gray-900 text-right truncate">{value}</span>
    </div>
  );
}

/** Format cents into a localized currency string based on merchant country. */
function formatCents(cents: number, country: string | null): string {
  if (!cents) return '—';
  const amount = cents / 100;
  if (country === 'CA') return `CA$${amount.toFixed(0)}`;
  return `€${amount.toFixed(0)}`;
}

function B2B2CTab() {
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [merchants, setMerchants] = useState<MerchantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [merchantFilter, setMerchantFilter] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
        <p className="text-gray-500 text-sm">Customers across the platform. Click a row to see card-by-card detail.</p>
      </header>

      <div className="flex gap-2 flex-wrap">
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="flex-1 flex gap-2 min-w-[300px]">
          <div className="flex-1 flex items-center bg-white border notion-border rounded-md px-3">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="SF00001, email, or name..."
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
        <div className="bg-white border notion-border rounded-lg overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-[#F7F7F5] text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">ID</th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Email</th>
                <th className="px-2 py-2 text-left">Joined on</th>
                <th className="px-2 py-2 text-right">Cards</th>
                <th className="px-3 py-2 text-left">Current campaigns</th>
                <th className="px-2 py-2 text-right">Stamps</th>
                <th className="px-2 py-2 text-right">Rewards</th>
                <th className="px-2 py-2 text-left">Last stamp</th>
                <th className="px-2 py-2 text-left">Last login</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const isOpen = expandedId === c.customer_id;
                return (
                  <Fragment key={c.customer_id}>
                    <tr
                      onClick={() => setExpandedId(isOpen ? null : c.customer_id)}
                      className="border-t notion-border hover:bg-[#FBFBFA] align-top cursor-pointer"
                    >
                      <td className="px-3 py-3 font-mono text-xs whitespace-nowrap">
                        {c.customer_code}
                        {c.any_deletion_pending && (
                          <span className="ml-1 inline-block w-1.5 h-1.5 bg-red-500 rounded-full align-middle" title="Deletion pending on at least one card" />
                        )}
                      </td>
                      <td className="px-3 py-3 font-medium text-sm">{c.customer_name || '—'}</td>
                      <td className="px-3 py-3 text-xs text-gray-600">
                        {c.email || '—'}
                        {c.phone && <div className="text-gray-400">📞 {c.phone}</div>}
                      </td>
                      <td className="px-2 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {new Date(c.active_since).toLocaleDateString()}
                      </td>
                      <td className="px-2 py-3 text-right font-medium text-sm">{c.cards_in_wallet}</td>
                      <td className="px-3 py-3 text-xs text-gray-600">
                        {(c.cards_detail ?? []).slice(0, 2).map((d, i) => (
                          <div key={i} className="truncate max-w-[220px]" title={`${d.merchant_name}: ${d.current_offer} (${d.current_stamps}/${d.max_stamps ?? '?'})`}>
                            <span className="font-medium">{d.merchant_name}:</span>{' '}
                            <span className="text-gray-500">{d.current_stamps}/{d.max_stamps ?? '?'}</span>
                          </div>
                        ))}
                        {(c.cards_detail ?? []).length > 2 && (
                          <div className="text-[10px] text-gray-400">+ {(c.cards_detail ?? []).length - 2} more</div>
                        )}
                      </td>
                      <td className="px-2 py-3 text-right text-gray-500 text-sm">{c.total_stamps}</td>
                      <td className="px-2 py-3 text-right text-gray-500 text-sm">{c.total_rewards_redeemed}</td>
                      <td className="px-2 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {c.last_stamp_at ? (
                          <div>
                            <div>{relativeTime(new Date(c.last_stamp_at))}</div>
                            {c.last_stamp_merchant && <div className="text-[10px] text-gray-400 truncate max-w-[140px]">at {c.last_stamp_merchant}</div>}
                          </div>
                        ) : '—'}
                      </td>
                      <td className="px-2 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {c.last_login_at ? relativeTime(new Date(c.last_login_at)) : 'Never'}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-[#F7F7F5]">
                        <td colSpan={10} className="px-4 py-4">
                          <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Card-by-card detail</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {(c.cards_detail ?? []).map((d) => (
                              <div key={d.card_id} className="bg-white border notion-border rounded p-3 text-xs space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold">{d.merchant_name}</span>
                                  {d.deletion_pending && <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[10px] uppercase">Pending deletion</span>}
                                </div>
                                <div className="text-gray-700">{d.current_offer}</div>
                                {d.campaign_offer && d.campaign_offer !== d.current_offer && (
                                  <div className="text-[10px] text-amber-600 italic" title="Merchant changed the offer since this customer joined. Auto-migrates on next reward redemption.">
                                    Joined under: "{d.campaign_offer}"
                                  </div>
                                )}
                                <div className="flex items-center gap-2 pt-1">
                                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-[#37352F]" style={{ width: `${d.max_stamps ? (d.current_stamps / d.max_stamps) * 100 : 0}%` }} />
                                  </div>
                                  <span className="text-gray-500 whitespace-nowrap">{d.current_stamps}/{d.max_stamps ?? '?'}</span>
                                </div>
                                <div className="text-[10px] text-gray-400 pt-1">
                                  {(() => { const jd = d.joined_at ? new Date(d.joined_at) : null; const ok = jd && !Number.isNaN(jd.getTime()); const r = d.rewards_redeemed ?? 0; return `${ok ? `Joined ${jd!.toLocaleDateString()} · ` : ''}${r} reward${r === 1 ? '' : 's'} redeemed`; })()}
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


function relativeTime(d: Date): string {
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
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

// ============================================================
// Logs — read-only monitoring across activity, wallet errors,
// signups and scheduled-job runs. All data comes from existing
// tables via admin RPCs (see stampfix_admin_logs.sql).
// ============================================================
type LogSub = 'ACTIVITY' | 'WALLET' | 'SIGNUPS' | 'JOBS';

const ACTIVITY_TYPES = ['', 'STAMP', 'REDEEM', 'JOIN', 'BLOCK', 'UNBLOCK'] as const;

function typeBadge(type: string): string {
  switch (type) {
    case 'STAMP': return 'bg-green-50 text-green-700 border-green-200';
    case 'REDEEM': return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'JOIN': return 'bg-purple-50 text-purple-700 border-purple-200';
    case 'BLOCK': return 'bg-red-50 text-red-700 border-red-200';
    default: return 'bg-gray-50 text-gray-600 border-gray-200';
  }
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function LogsTab() {
  const [sub, setSub] = useState<LogSub>('ACTIVITY');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [refreshTick, setRefreshTick] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [activity, setActivity] = useState<ActivityLogRow[]>([]);
  const [walletErrors, setWalletErrors] = useState<WalletErrorRow[]>([]);
  const [signups, setSignups] = useState<SignupRow[]>([]);
  const [jobs, setJobs] = useState<JobRunRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        if (sub === 'ACTIVITY') { const d = await fetchActivityLog(200, typeFilter || null); if (!cancelled) setActivity(d); }
        else if (sub === 'WALLET') { const d = await fetchWalletErrors(150); if (!cancelled) setWalletErrors(d); }
        else if (sub === 'SIGNUPS') { const d = await fetchRecentSignups(150); if (!cancelled) setSignups(d); }
        else { const d = await fetchJobRuns(80); if (!cancelled) setJobs(d); }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sub, typeFilter, refreshTick]);

  const SUBS: [LogSub, string][] = [
    ['ACTIVITY', 'Activity'],
    ['WALLET', 'Wallet errors'],
    ['SIGNUPS', 'New signups'],
    ['JOBS', 'System jobs'],
  ];

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1">
        <h1 className="text-2xl font-serif-display font-semibold">Logs</h1>
        <button
          onClick={() => setRefreshTick((t) => t + 1)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#37352F] border notion-border rounded-md px-3 py-1.5 transition"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-5">Everything worth watching, in one place. Read-only.</p>

      {/* sub-tabs */}
      <div className="flex flex-wrap gap-1.5 mb-4 border-b notion-border">
        {SUBS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setSub(id)}
            className={`px-3 py-2 text-sm rounded-t-md -mb-px border-b-2 transition ${
              sub === id ? 'border-[#37352F] text-[#37352F] font-medium' : 'border-transparent text-gray-500 hover:text-[#37352F]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* activity type filter */}
      {sub === 'ACTIVITY' && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {ACTIVITY_TYPES.map((t) => (
            <button
              key={t || 'ALL'}
              onClick={() => setTypeFilter(t)}
              className={`text-xs px-2.5 py-1 rounded-full border transition ${
                typeFilter === t ? 'bg-[#37352F] text-white border-[#37352F]' : 'bg-white text-gray-600 notion-border hover:border-[#37352F]'
              }`}
            >
              {t || 'All'}
            </button>
          ))}
        </div>
      )}

      {err && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-4 py-3 mb-4">{err}</div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 text-sm py-10 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="border notion-border rounded-lg overflow-x-auto">
          {sub === 'ACTIVITY' && (
            <table className="w-full text-sm">
              <thead className="bg-[#F7F7F5] text-gray-500 text-left text-xs uppercase tracking-wider">
                <tr><th className="px-3 py-2">Time</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Business</th><th className="px-3 py-2">Source</th></tr>
              </thead>
              <tbody className="divide-y notion-border">
                {activity.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-400">No activity yet.</td></tr>}
                {activity.map((r, i) => (
                  <tr key={i} className="hover:bg-[#FBFBFA]">
                    <td className="px-3 py-2 whitespace-nowrap text-gray-500">{fmtTime(r.created_at)}</td>
                    <td className="px-3 py-2"><span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${typeBadge(r.type)}`}>{r.type}</span></td>
                    <td className="px-3 py-2">{r.customer_name ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{r.business_name ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-400">{r.source ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {sub === 'WALLET' && (
            <table className="w-full text-sm">
              <thead className="bg-[#F7F7F5] text-gray-500 text-left text-xs uppercase tracking-wider">
                <tr><th className="px-3 py-2">Time</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Detail</th></tr>
              </thead>
              <tbody className="divide-y notion-border">
                {walletErrors.length === 0 && <tr><td colSpan={3} className="px-3 py-8 text-center text-gray-400">No wallet/edge errors in the recent window. 🎉</td></tr>}
                {walletErrors.map((r, i) => (
                  <tr key={i} className="hover:bg-[#FBFBFA]">
                    <td className="px-3 py-2 whitespace-nowrap text-gray-500">{fmtTime(r.created)}</td>
                    <td className="px-3 py-2"><span className="text-[11px] font-medium px-2 py-0.5 rounded-full border bg-red-50 text-red-700 border-red-200">{r.status_code ?? 'ERR'}</span></td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-600 break-all">{r.detail ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {sub === 'SIGNUPS' && (
            <table className="w-full text-sm">
              <thead className="bg-[#F7F7F5] text-gray-500 text-left text-xs uppercase tracking-wider">
                <tr><th className="px-3 py-2">Joined</th><th className="px-3 py-2">Business</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Plan</th></tr>
              </thead>
              <tbody className="divide-y notion-border">
                {signups.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-gray-400">No signups yet.</td></tr>}
                {signups.map((r, i) => (
                  <tr key={i} className="hover:bg-[#FBFBFA]">
                    <td className="px-3 py-2 whitespace-nowrap text-gray-500">{fmtTime(r.created_at)}</td>
                    <td className="px-3 py-2">{r.business_name ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{r.email ?? '—'}</td>
                    <td className="px-3 py-2"><span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${r.plan === 'pro' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>{r.plan}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {sub === 'JOBS' && (
            <table className="w-full text-sm">
              <thead className="bg-[#F7F7F5] text-gray-500 text-left text-xs uppercase tracking-wider">
                <tr><th className="px-3 py-2">Time</th><th className="px-3 py-2">Job</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Result</th></tr>
              </thead>
              <tbody className="divide-y notion-border">
                {jobs.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-gray-400">No job runs yet (or pg_cron not enabled).</td></tr>}
                {jobs.map((r, i) => (
                  <tr key={i} className="hover:bg-[#FBFBFA]">
                    <td className="px-3 py-2 whitespace-nowrap text-gray-500">{fmtTime(r.start_time)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.jobname ?? '—'}</td>
                    <td className="px-3 py-2"><span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${r.status === 'succeeded' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>{r.status ?? '—'}</span></td>
                    <td className="px-3 py-2 text-gray-500 text-xs break-all">{r.return_message ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
