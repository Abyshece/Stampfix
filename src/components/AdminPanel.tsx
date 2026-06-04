import { useEffect, useState } from 'react';
import {
  LayoutDashboard, Users, AlertTriangle, Activity as ActivityIcon, Search,
  LogOut, Loader2, ChevronRight, ArrowUpCircle, ArrowDownCircle, Shield,
} from 'lucide-react';
import { useAuth, signOut } from '../lib/auth';
import {
  checkIsAdmin, fetchPlatformStats, listMerchants, fetchSuspicious,
  fetchAdminRecentActivity, setMerchantPlan,
  type PlatformStats, type MerchantRow, type SuspiciousRow, type ActivityRow,
} from '../services/admin';

type AdminTab = 'OVERVIEW' | 'MERCHANTS' | 'SUSPICIOUS' | 'ACTIVITY';

/**
 * Platform admin panel. Mounted at /admin.
 *
 * Access is gated client-side (is the user flagged as admin?) AND
 * server-side (every RPC checks the flag again). The client gate is
 * just for UX — even if someone reached /admin without being an admin,
 * the RPCs would return empty data.
 *
 * UI mirrors the merchant dashboard's visual language: sidebar nav,
 * Notion-y borders, dark #37352F brand color, same metric-card pattern
 * used in the Insights tab.
 */
export function AdminPanel() {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<AdminTab>('OVERVIEW');

  // Verify admin status once auth resolves.
  useEffect(() => {
    if (authLoading) return;
    if (!user) { setIsAdmin(false); return; }
    checkIsAdmin().then(setIsAdmin);
  }, [user, authLoading]);

  if (authLoading || isAdmin === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!user) {
    return <NotLoggedIn />;
  }

  if (!isAdmin) {
    return <NotAuthorized email={user.email ?? null} />;
  }

  return (
    <div className="min-h-screen bg-[#FBFBFA] flex">
      {/* Sidebar */}
      <aside className="w-60 bg-[#F7F7F5] border-r notion-border fixed inset-y-0 left-0 z-40 flex flex-col">
        <div className="p-5 border-b notion-border">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-4 h-4 text-amber-600" />
            <span className="text-xs font-bold uppercase tracking-widest text-amber-700">Admin</span>
          </div>
          <div className="text-sm font-semibold">Stampfix Platform</div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {([
            ['OVERVIEW', LayoutDashboard, 'Overview'],
            ['MERCHANTS', Users, 'Merchants'],
            ['SUSPICIOUS', AlertTriangle, 'Suspicious activity'],
            ['ACTIVITY', ActivityIcon, 'Recent activity'],
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

        <div className="p-3 border-t notion-border space-y-2">
          <a
            href="/"
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-gray-500 hover:text-[#37352F]"
          >
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

      <main className="ml-60 flex-1 p-8 max-w-6xl">
        {tab === 'OVERVIEW' && <OverviewTab />}
        {tab === 'MERCHANTS' && <MerchantsTab />}
        {tab === 'SUSPICIOUS' && <SuspiciousTab />}
        {tab === 'ACTIVITY' && <ActivityTab />}
      </main>
    </div>
  );
}

// =====================================================================
// OVERVIEW
// =====================================================================

function OverviewTab() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPlatformStats().then(setStats).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  }
  if (!stats) {
    return <div className="text-sm text-gray-500">No data.</div>;
  }

  const mrrEur = stats.mrr_eur_cents / 100;
  const mrrCad = stats.mrr_cad_cents / 100;
  const mrrOther = stats.mrr_other_cents / 100;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-serif-display font-semibold mb-1">Platform overview</h1>
        <p className="text-gray-500 text-sm">All merchants, all customers, at a glance.</p>
      </header>

      {/* Top row: merchants */}
      <Section title="Merchants">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Metric label="Total" value={stats.merchants_total} accent="text-[#37352F]" />
          <Metric label="Pro plan" value={stats.merchants_pro} accent="text-amber-600" />
          <Metric label="Free plan" value={stats.merchants_free} accent="text-gray-600" />
          <Metric label="New (7 days)" value={stats.new_merchants_7d} accent="text-green-600" />
        </div>
      </Section>

      {/* Customers + activity */}
      <Section title="Customers & activity">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Metric label="Active customer cards" value={stats.cards_active} accent="text-blue-600" />
          <Metric label="Blocked cards" value={stats.cards_blocked} accent="text-red-600" />
          <Metric label="Activity (24h)" value={stats.activities_24h} accent="text-orange-600" />
          <Metric label="Activity (7d)" value={stats.activities_7d} accent="text-purple-600" />
        </div>
      </Section>

      {/* Revenue */}
      <Section title="Estimated MRR">
        <p className="text-xs text-gray-500 -mt-3 mb-3">
          Calculated from Pro merchants × their country's price. Doesn't account for Stripe fees or discounts.
        </p>
        <div className="grid grid-cols-3 gap-4">
          <Metric label="MRR (Germany)" value={`€${mrrEur.toFixed(2)}`} accent="text-[#37352F]" />
          <Metric label="MRR (Canada)" value={`CA$${mrrCad.toFixed(2)}`} accent="text-[#37352F]" />
          <Metric label="MRR (other)" value={`€${mrrOther.toFixed(2)}`} accent="text-[#37352F]" />
        </div>
      </Section>

      {/* Infrastructure */}
      <Section title="Platform totals">
        <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
          <Metric label="Total campaigns" value={stats.campaigns_total} accent="text-gray-600" />
          <Metric label="Active locations" value={stats.locations_total} accent="text-gray-600" />
        </div>
      </Section>
    </div>
  );
}

// =====================================================================
// MERCHANTS
// =====================================================================

function MerchantsTab() {
  const [merchants, setMerchants] = useState<MerchantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async (s = '') => {
    setLoading(true);
    try {
      const data = await listMerchants(s, 100);
      setMerchants(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(''); }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    load(search.trim());
  };

  const handlePlanToggle = async (m: MerchantRow) => {
    const newPlan = m.plan === 'pro' ? 'free' : 'pro';
    if (!confirm(`Switch ${m.email} to ${newPlan.toUpperCase()}?`)) return;
    setBusyId(m.id);
    try {
      await setMerchantPlan(m.id, newPlan);
      await load(search);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-serif-display font-semibold mb-1">Merchants</h1>
        <p className="text-gray-500 text-sm">Sorted by customer count. Click a row to manage.</p>
      </header>

      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="flex-1 flex items-center bg-white border notion-border rounded-md px-3">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search email or business name..."
            className="flex-1 px-2 py-2 bg-transparent outline-none text-sm"
          />
        </div>
        <button type="submit" className="bg-[#37352F] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-opacity-90">
          Search
        </button>
      </form>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : merchants.length === 0 ? (
        <div className="text-sm text-gray-500 bg-white border notion-border rounded-lg p-8 text-center">
          No merchants found.
        </div>
      ) : (
        <div className="bg-white border notion-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#F7F7F5] text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left">Business / email</th>
                <th className="px-3 py-2 text-left">Country</th>
                <th className="px-3 py-2 text-left">Plan</th>
                <th className="px-3 py-2 text-right">Customers</th>
                <th className="px-3 py-2 text-right">Activity (7d)</th>
                <th className="px-3 py-2 text-left">Signed up</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {merchants.map((m) => (
                <tr key={m.id} className="border-t notion-border hover:bg-[#FBFBFA]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div>
                        <div className="font-medium truncate max-w-[220px]">{m.business_name || '—'}</div>
                        <div className="text-xs text-gray-500 truncate max-w-[220px]">{m.email}</div>
                      </div>
                      {m.is_platform_admin && (
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">
                          Admin
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-gray-500">{m.country ?? '—'}</td>
                  <td className="px-3 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                      m.plan === 'pro' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {m.plan.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-medium">{m.card_count}</td>
                  <td className="px-3 py-3 text-right text-gray-500">{m.recent_activity_count}</td>
                  <td className="px-3 py-3 text-xs text-gray-500">{new Date(m.created_at).toLocaleDateString()}</td>
                  <td className="px-3 py-3 text-right">
                    <button
                      onClick={() => handlePlanToggle(m)}
                      disabled={busyId === m.id}
                      className="text-xs px-2 py-1 rounded border notion-border hover:bg-[#F7F7F5] disabled:opacity-50 inline-flex items-center gap-1"
                      title={m.plan === 'pro' ? 'Downgrade to Free' : 'Comp Pro plan'}
                    >
                      {busyId === m.id ? <Loader2 className="w-3 h-3 animate-spin" />
                        : m.plan === 'pro' ? <ArrowDownCircle className="w-3 h-3" />
                        : <ArrowUpCircle className="w-3 h-3" />}
                      {m.plan === 'pro' ? 'Downgrade' : 'Comp Pro'}
                    </button>
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
// SUSPICIOUS
// =====================================================================

function SuspiciousTab() {
  const [rows, setRows] = useState<SuspiciousRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSuspicious().then(setRows).catch(console.error).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-serif-display font-semibold mb-1 flex items-center gap-2">
          <AlertTriangle className="w-7 h-7 text-amber-500" /> Suspicious activity
        </h1>
        <p className="text-gray-500 text-sm">Campaigns with &gt;20 stamps in the last hour. Worth investigating.</p>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : rows.length === 0 ? (
        <div className="bg-white border notion-border rounded-lg p-8 text-center">
          <div className="text-3xl mb-2">✅</div>
          <div className="font-medium text-sm">Nothing suspicious right now.</div>
          <div className="text-xs text-gray-500 mt-1">No campaigns with unusual stamp velocity in the last hour.</div>
        </div>
      ) : (
        <div className="bg-white border notion-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#F7F7F5] text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left">Business</th>
                <th className="px-3 py-2 text-right">Stamps (1h)</th>
                <th className="px-3 py-2 text-left">First stamp</th>
                <th className="px-3 py-2 text-left">Last stamp</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.campaign_id} className="border-t notion-border">
                  <td className="px-4 py-3 font-medium">{r.business_name}</td>
                  <td className="px-3 py-3 text-right font-bold text-red-600">{r.stamps_last_hour}</td>
                  <td className="px-3 py-3 text-xs text-gray-500">{new Date(r.first_stamp).toLocaleTimeString()}</td>
                  <td className="px-3 py-3 text-xs text-gray-500">{new Date(r.last_stamp).toLocaleTimeString()}</td>
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
// ACTIVITY
// =====================================================================

function ActivityTab() {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAdminRecentActivity(50).then(setRows).catch(console.error).finally(() => setLoading(false));
  }, []);

  const colors: Record<string, string> = {
    JOIN: 'bg-blue-50 text-blue-700',
    STAMP: 'bg-orange-50 text-orange-700',
    REDEEM: 'bg-green-50 text-green-700',
    BLOCK: 'bg-red-50 text-red-700',
    UNBLOCK: 'bg-gray-50 text-gray-700',
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-serif-display font-semibold mb-1">Recent activity</h1>
        <p className="text-gray-500 text-sm">Last 50 events across all merchants.</p>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-gray-500 bg-white border notion-border rounded-lg p-8 text-center">
          No activity yet.
        </div>
      ) : (
        <div className="bg-white border notion-border rounded-lg divide-y">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${colors[r.type] ?? 'bg-gray-100'}`}>
                {r.type}
              </span>
              <span className="flex-1 truncate">
                <strong>{r.customer_name || '—'}</strong>
                <span className="text-gray-400"> at </span>
                <span>{r.business_name}</span>
                {r.location_name && <span className="text-gray-400"> · {r.location_name}</span>}
              </span>
              <span className="text-xs text-gray-400 whitespace-nowrap">
                {new Date(r.created_at).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// Reusable bits
// =====================================================================

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs uppercase tracking-widest font-bold text-gray-400">{title}</h2>
      {children}
    </section>
  );
}

function Metric({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="bg-white border notion-border rounded-lg p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${accent}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </div>
  );
}

// =====================================================================
// States
// =====================================================================

function NotLoggedIn() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="max-w-sm text-center space-y-4">
        <Shield className="w-12 h-12 text-gray-300 mx-auto" />
        <h1 className="text-2xl font-serif-display font-semibold">Sign in required</h1>
        <p className="text-sm text-gray-500">
          The admin panel is only accessible to authorized platform admins. Please sign in to your merchant account first.
        </p>
        <a href="/" className="inline-block bg-[#37352F] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-opacity-90">
          Go to main site
        </a>
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
        <p className="text-sm text-gray-500">
          You're signed in as <strong className="text-[#37352F]">{email}</strong> but this account isn't a platform admin.
        </p>
        <a href="/" className="inline-block bg-[#37352F] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-opacity-90">
          Back to main site
        </a>
      </div>
    </div>
  );
}
