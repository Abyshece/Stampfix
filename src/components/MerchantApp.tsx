import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { Campaign, UserCard, ActivityItem, Location, OnboardingState, MerchantBilling, Plan } from '../types';
import { useAuth, signOut } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { getStaffSession } from '../services/staff';
import { useTranslation } from 'react-i18next';
import { StampReasonModal } from './StampReasonModal';
import {
  getCampaignByMerchant,
  listCardsForCampaign,
  listActivities,
  listActivityHistory,
  updateCampaign,
  merchantScan,
  type ScanResult,
  setCardStatus,
  deleteCard,
  createCard,
  listLocations,
  createLocation,
  updateLocation,
  getOnboardingState,
  setOnboardingFlag,
  getMerchantBilling,
  logMerchantActivity,
} from '../lib/db';
import { redeemStampToken } from '../services/stampToken';
import { scanErrorMessage, scanSuccessMessage, type ScanOutcome } from '../lib/scanOutcome';
import { MerchantOnboarding, consumePendingCampaign } from './MerchantOnboarding';
import { MerchantDashboard } from './MerchantDashboard';
import { BrandLoading } from './BrandLoading';
import { OnboardingWizard } from './OnboardingWizard';

interface MerchantAppProps {
  onLogout: () => void;
  /** When true, the onboarding screen opens on the login form rather than
   *  the signup form (used after a user confirms their email). */
  startOnLogin?: boolean;
}

/**
 * Loads the merchant's campaign, cards, and activities, and exposes
 * action handlers to the dashboard. Optimistically updates local state
 * after each action and refetches activities (cheap) — keeps the UI
 * snappy without needing a heavyweight data layer like react-query.
 */
export function MerchantApp({ onLogout, startOnLogin }: MerchantAppProps) {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [cards, setCards] = useState<UserCard[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [onboarding, setOnboarding] = useState<OnboardingState>({});
  const [billing, setBilling] = useState<MerchantBilling & { country: 'DE' | 'CA' | null }>({ plan: 'free', country: null });
  // Which location the scanner is "operating as" right now. Persisted per
  // device in localStorage so a barista's tablet remembers between shifts.
  const [activeLocationId, setActiveLocationIdState] = useState<string | null>(
    () => localStorage.getItem('stampfix_active_location_id'),
  );
  const setActiveLocationId = useCallback((id: string | null) => {
    setActiveLocationIdState(id);
    if (id) localStorage.setItem('stampfix_active_location_id', id);
    else localStorage.removeItem('stampfix_active_location_id');
  }, []);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Log one "login" activity per browser session for the admin activity feed.
  useEffect(() => {
    if (user && !sessionStorage.getItem('sf_login_logged')) {
      sessionStorage.setItem('sf_login_logged', '1');
      logMerchantActivity('login');
    }
  }, [user]);

  const loadAll = useCallback(async () => {
    if (!user) {
      // Signed out — the render shows the login form directly via the `!user`
      // check below, so keep loading=true. That way, the instant a user
      // appears (e.g. right after login) we show the loader instead of a
      // one-frame flash of the signup form, until loadAll fetches their data.
      setLoading(true);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      let c = await getCampaignByMerchant(user.id);
      // If the user just confirmed their email, they may have a pending
      // campaign config in sessionStorage from the signup form.
      if (!c) {
        const consumed = await consumePendingCampaign(user.id);
        if (consumed) c = await getCampaignByMerchant(user.id);
      }
      setCampaign(c);
      if (c) {
        const [cs, acts, locs, ob, bill] = await Promise.all([
          listCardsForCampaign(c.id),
          listActivityHistory(c.id),
          listLocations(c.id),
          getOnboardingState(user.id),
          getMerchantBilling(user.id),
        ]);
        setCards(cs);
        setActivities(acts);
        setLocations(locs);
        setOnboarding(ob);
        setBilling(bill);
        // If the persisted active location no longer exists (or there's
        // none yet), fall back to the first one. This keeps the scanner
        // always pointing somewhere sensible.
        const persisted = localStorage.getItem('stampfix_active_location_id');
        const stillValid = persisted && locs.some((l) => l.id === persisted && !l.archived);
        if (!stillValid) {
          const first = locs.find((l) => !l.archived);
          setActiveLocationId(first ? first.id : null);
        }
      } else {
        setCards([]);
        setActivities([]);
        setLocations([]);
        setOnboarding({});
      }
    } catch (err) {
      console.error('[merchant] loadAll failed:', err);
      // Show a retry screen. Falling back to the onboarding form (as before)
      // told an existing merchant to create their program again whenever the
      // network blipped.
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [user, setActiveLocationId]);

  // Silent card-only refresh (no loading screen) — used by the realtime/focus
  // sync so the merchant list stays fresh WITHOUT flashing the full-page loader
  // or interrupting the scan celebration.
  const refreshCards = useCallback(async () => {
    if (!campaign) return;
    try {
      setCards(await listCardsForCampaign(campaign.id));
    } catch (err) {
      console.error('[merchant] refreshCards failed:', err);
    }
  }, [campaign]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Keep the card list live so the merchant view never shows a stale count
  // (e.g. still 6/6 after a card already redeemed to 0). Refresh from the DB on
  // any realtime change to this campaign's cards, and whenever the tab regains
  // focus. If realtime isn't enabled on the project the subscription is a
  // harmless no-op and the focus refresh still keeps things fresh.
  useEffect(() => {
    if (!campaign) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => { void refreshCards(); }, 250);
    };
    const channel = supabase
      .channel(`cards-${campaign.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cards', filter: `campaign_id=eq.${campaign.id}` },
        refresh,
      )
      .subscribe();
    const onFocus = () => { if (document.visibilityState === 'visible') void refreshCards(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      if (t) clearTimeout(t);
      supabase.removeChannel(channel);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [campaign, refreshCards]);

  // Refresh activities after an action — they're the cheapest to refetch
  // and the source of truth (since the DB writes them).
  // Only the newest rows are fetched and merged in, so a stamp doesn't
  // reload the whole history.
  const refreshActivities = useCallback(async () => {
    if (!campaign) return;
    const fresh = await listActivities(campaign.id);
    const ids = new Set(fresh.map((a) => a.id));
    setActivities((prev) => [...fresh, ...prev.filter((a) => !ids.has(a.id))]);
  }, [campaign]);

  const handleMarkOnboardingStep = useCallback(
    async (patch: Partial<OnboardingState>) => {
      if (!user) return;
      // Optimistic local update so UI feels instant.
      setOnboarding((prev) => ({ ...prev, ...patch }));
      try {
        const updated = await setOnboardingFlag(user.id, patch);
        setOnboarding(updated);
      } catch (err) {
        console.warn('[onboarding] flag update failed:', err);
        // Best-effort; the wizard is non-critical.
      }
    },
    [user],
  );

  // Daily-limit prompt. runScan awaits the merchant's answer: a reason
  // (stamp anyway, recorded as an override) or null (cancelled).
  const [capPrompt, setCapPrompt] = useState<
    { customerName: string; stampsToday: number; cap: number; resolve: (reason: string | null) => void } | null
  >(null);
  const askReason = useCallback(
    (info: { customerName: string; stampsToday: number; cap: number }) =>
      new Promise<string | null>((resolve) => setCapPrompt({ ...info, resolve })),
    [],
  );

  /** Applies a scan result to the local card list, activity feed and onboarding. */
  const applyScan = useCallback((r: Extract<ScanResult, { ok: true }>) => {
    setCards((prev) => prev.map((c) => (c.id === r.card.id
      ? { ...c, currentStamps: r.card.currentStamps, rewardsRedeemed: r.card.rewardsRedeemed, status: r.card.status, maxStampsSnapshot: r.card.maxStamps }
      : c)));
    void refreshActivities();
    if (r.action === 'STAMP' && !onboarding.first_stamp_given) {
      handleMarkOnboardingStep({ first_stamp_given: true });
    }
  }, [refreshActivities, onboarding.first_stamp_given, handleMarkOnboardingStep]);

  /**
   * Every staff stamp and reward goes through here: the Wallet-QR scan, the
   * manual code box and the customer list. The server applies it atomically;
   * at the daily limit the merchant is asked for a reason first. Resolves
   * with what actually happened, so the dashboard only celebrates real stamps.
   */
  const runScan = useCallback(
    async (cardId: string, action: 'auto' | 'stamp' | 'redeem', source: 'qr' | 'manual_dashboard'): Promise<ScanOutcome> => {
      if (!campaign) return { ok: false, message: t('dash.shell.errStamp', { defaultValue: 'Stamp failed' }) };
      const base = { action, source, locationId: activeLocationId, campaignId: campaign.id } as const;
      try {
        let r = await merchantScan(cardId, base);
        if (!r.ok && r.error === 'daily_cap') {
          const reason = await askReason({
            customerName: r.card?.customerName || t('dash.shell.thisCustomer', { defaultValue: 'This customer' }),
            stampsToday: r.stampsToday ?? 0,
            cap: r.cap ?? 0,
          });
          if (!reason) return { ok: false, cancelled: true, message: '' };
          r = await merchantScan(cardId, { ...base, action: 'stamp', reason, override: true });
        }
        if (r.ok) {
          applyScan(r);
          return { ok: true, action: r.action, card: r.card, message: scanSuccessMessage(r) };
        }
        return { ok: false, message: scanErrorMessage(r.error, t) };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : t('dash.shell.errStamp', { defaultValue: 'Stamp failed' }) };
      }
    },
    [campaign, activeLocationId, askReason, applyScan],
  );

  const handleStampCard = useCallback(
    (cardId: string, source: 'qr' | 'manual_dashboard' = 'manual_dashboard') => runScan(cardId, 'stamp', source),
    [runScan],
  );
  const handleResetCard = useCallback(
    (cardId: string) => runScan(cardId, 'redeem', 'manual_dashboard'),
    [runScan],
  );
  const handleScanCard = useCallback(
    (cardId: string) => runScan(cardId, 'auto', 'qr'),
    [runScan],
  );

  const handleBlockCustomer = useCallback(
    async (cardId: string) => {
      const card = cards.find((c) => c.id === cardId);
      if (!card) return;
      const newStatus = card.status === 'BLOCKED' ? 'ACTIVE' : 'BLOCKED';
      try {
        const updated = await setCardStatus(cardId, newStatus);
        setCards((prev) => prev.map((c) => (c.id === cardId ? updated : c)));
        refreshActivities();
      } catch (err) {
        alert(err instanceof Error ? err.message : t('dash.shell.errStatus', { defaultValue: 'Status update failed' }));
      }
    },
    [cards, refreshActivities],
  );

  const handleDeleteCustomer = useCallback(
    async (cardId: string) => {
      try {
        await deleteCard(cardId);
        setCards((prev) => prev.filter((c) => c.id !== cardId));
        refreshActivities();
      } catch (err) {
        alert(err instanceof Error ? err.message : t('dash.shell.errDelete', { defaultValue: 'Delete failed' }));
      }
    },
    [refreshActivities],
  );

  const handleAddCustomer = useCallback(
    async (data: { firstName: string; surname: string; email: string }) => {
      if (!campaign) return;
      try {
        const created = await createCard({
          campaignId: campaign.id,
          customerName: `${data.firstName} ${data.surname}`.trim(),
          email: data.email,
        });
        setCards((prev) => [created, ...prev]);
        refreshActivities();
      } catch (err) {
        alert(err instanceof Error ? err.message : t('dash.shell.errAddCustomer', { defaultValue: 'Could not add customer' }));
      }
    },
    [campaign, refreshActivities],
  );


  /**
   * Redeems a signed stamp token via the Edge Function. Server is
   * authoritative — it verifies the signature, checks expiry/replay,
   * applies the stamp, and returns the updated card. We mirror that
   * update locally so the UI stays in sync without a full refetch, then
   * fire the wallet sync (best-effort).
   *
   * The active location id is sent along so the server can tag the
   * activity row with which branch did the stamping.
   */
  const handleRedeemToken = useCallback(
    async (token: string): Promise<ScanOutcome> => {
      if (!campaign) return { ok: false, message: t('dash.shell.errStamp', { defaultValue: 'Stamp failed' }) };
      try {
        const r = await redeemStampToken(token, activeLocationId, getStaffSession(campaign.id));
        if (r.ok) {
          applyScan(r);
          return { ok: true, action: r.action, card: r.card, message: scanSuccessMessage(r) };
        }
        if (r.error === 'daily_cap' && r.card?.id) {
          // The token is spent; continue with the card id (same checks, server-side).
          const reason = await askReason({
            customerName: r.card.customerName || t('dash.shell.thisCustomer', { defaultValue: 'This customer' }),
            stampsToday: r.stampsToday ?? 0,
            cap: r.cap ?? 0,
          });
          if (!reason) return { ok: false, cancelled: true, message: '' };
          const again = await merchantScan(r.card.id, {
            action: 'stamp', source: 'qr', locationId: activeLocationId, campaignId: campaign.id, reason, override: true,
          });
          if (again.ok) {
            applyScan(again);
            return { ok: true, action: again.action, card: again.card, message: scanSuccessMessage(again) };
          }
          return { ok: false, message: scanErrorMessage(again.error, t) };
        }
        return { ok: false, message: r.error === 'token' ? (r.message ?? 'Stamp failed') : scanErrorMessage(r.error, t) };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : t('dash.shell.errStamp', { defaultValue: 'Stamp failed' }) };
      }
    },
    [campaign, activeLocationId, askReason, applyScan],
  );

  // ----- Location handlers -----

  const handleAddLocation = useCallback(
    async (name: string, address?: string, latitude?: number | null, longitude?: number | null) => {
      if (!campaign) return;
      const created = await createLocation({ campaignId: campaign.id, name, address, latitude, longitude });
      setLocations((prev) => [...prev, created]);
      // If we didn't have an active location yet, the new one becomes active.
      if (!activeLocationId) setActiveLocationId(created.id);
    },
    [campaign, activeLocationId, setActiveLocationId],
  );

  const handleUpdateLocation = useCallback(
    async (locationId: string, patch: { name?: string; address?: string; latitude?: number | null; longitude?: number | null; archived?: boolean }) => {
      const updated = await updateLocation(locationId, patch);
      setLocations((prev) => prev.map((l) => (l.id === locationId ? updated : l)));
      // If the active location was archived, pick another one.
      if (updated.archived && activeLocationId === locationId) {
        const next = locations.find((l) => l.id !== locationId && !l.archived);
        setActiveLocationId(next ? next.id : null);
      }
    },
    [activeLocationId, locations, setActiveLocationId],
  );

  const handleUpdateCampaign = useCallback(
    async (patch: Partial<Campaign>): Promise<boolean> => {
      if (!campaign) return false;
      try {
        const updated = await updateCampaign(campaign.id, patch);
        setCampaign(updated);
        return true;
      } catch (err) {
        alert(err instanceof Error ? err.message : t('dash.shell.errUpdate', { defaultValue: 'Update failed' }));
        return false;
      }
    },
    [campaign],
  );

  const handleLogout = useCallback(async () => {
    await signOut();
    onLogout();
  }, [onLogout]);

  // A merchant who just finished signup must always land on the thank-you /
  // pending-review screen — never a flash of the loader, the dashboard, or a
  // remounted empty form. Signup briefly creates a session (then signs out),
  // which churns auth state and would otherwise race us into one of those.
  // While the just-registered flag is set (cleared when they hit "Sign in" on
  // the thank-you screen), hold on the onboarding component, whose own
  // initializer reads the same flag and renders the THANK_YOU step.
  let justRegistered = false;
  try { justRegistered = sessionStorage.getItem('sf_just_registered') === '1'; } catch { /* ignore */ }
  if (justRegistered) {
    return <MerchantOnboarding onComplete={loadAll} initialStep="FORM" onBack={onLogout} />;
  }

  // Auth still resolving (e.g. right after a refresh) — show the loader, not
  // the signup form. This useAuth instance starts with user=null until its
  // getSession() settles, which is what caused the "Create your workspace"
  // flash on reload.
  if (authLoading) {
    return <BrandLoading />;
  }

  if (!user) {
    return <MerchantOnboarding onComplete={loadAll} initialStep={startOnLogin ? 'LOGIN' : 'FORM'} onBack={onLogout} />;
  }

  if (loading) {
    return <BrandLoading />;
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-6 text-center">
        <div className="max-w-sm space-y-4">
          <h1 className="text-xl font-serif-display font-semibold">{t('dash.shell.loadFailedTitle', { defaultValue: 'We couldn’t load your dashboard' })}</h1>
          <p className="text-sm text-gray-500">{t('dash.shell.loadFailedBody', { defaultValue: 'Check your internet connection and try again. Your data is safe.' })}</p>
          <div className="flex gap-2 justify-center">
            <button onClick={() => void loadAll()} className="bg-[#37352F] text-white px-5 py-2.5 rounded-md text-sm font-medium hover:bg-opacity-90">
              {t('dash.shell.retry', { defaultValue: 'Try again' })}
            </button>
            <button onClick={() => void handleLogout()} className="px-5 py-2.5 rounded-md text-sm border notion-border hover:bg-[#F7F7F5]">
              {t('dash.shell.signOut', { defaultValue: 'Sign out' })}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!campaign) {
    return <MerchantOnboarding onComplete={loadAll} initialStep={startOnLogin ? 'LOGIN' : 'FORM'} onBack={onLogout} />;
  }

  // Show the first-run wizard when the merchant hasn't dismissed it AND
  // hasn't completed the core milestones. Once they've dismissed (or
  // completed) it, the dashboard's "Get Started" checklist takes over.
  const shouldShowWizard = campaign && !onboarding.wizard_dismissed;

  return (
    <>
      <MerchantDashboard
        campaign={campaign}
        cards={cards}
        activities={activities}
        locations={locations}
        activeLocationId={activeLocationId}
        onboarding={onboarding}
        billing={billing}
        country={billing.country}
        onSetActiveLocation={setActiveLocationId}
        onAddLocation={handleAddLocation}
        onUpdateLocation={handleUpdateLocation}
        onStampCard={handleStampCard}
        onScanCard={handleScanCard}
        onResetCard={handleResetCard}
        onRedeemToken={handleRedeemToken}
        onUpdateCampaign={handleUpdateCampaign}
        onAddCustomer={handleAddCustomer}
        onDeleteCustomer={handleDeleteCustomer}
        onBlockCustomer={handleBlockCustomer}
        onMarkOnboardingStep={handleMarkOnboardingStep}
        onLogout={handleLogout}
      />
      {shouldShowWizard && (
        <OnboardingWizard
          campaign={campaign}
          locations={locations}
          initialState={onboarding}
          onMarkStep={handleMarkOnboardingStep}
          onUpdateCampaign={handleUpdateCampaign}
          onClose={() => {
            // The wizard already saves wizard_dismissed=true to the server;
            // local state will sync via handleMarkOnboardingStep.
          }}
        />
      )}

      {capPrompt && (
        <StampReasonModal
          customerName={capPrompt.customerName}
          atCap
          stampsToday={capPrompt.stampsToday}
          cap={capPrompt.cap}
          onCancel={() => { capPrompt.resolve(null); setCapPrompt(null); }}
          onConfirm={(reason) => { capPrompt.resolve(reason); setCapPrompt(null); }}
        />
      )}
    </>
  );
}
