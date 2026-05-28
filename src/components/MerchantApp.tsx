import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { Campaign, UserCard, ActivityItem } from '../types';
import { useAuth, signOut } from '../lib/auth';
import {
  getCampaignByMerchant,
  listCardsForCampaign,
  listActivities,
  updateCampaign,
  addStamp,
  redeemReward,
  setCardStatus,
  deleteCard,
  createCard,
} from '../lib/db';
import { syncWalletObject } from '../services/googleWallet';
import { MerchantOnboarding, consumePendingCampaign } from './MerchantOnboarding';
import { MerchantDashboard } from './MerchantDashboard';

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
  const { user } = useAuth();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [cards, setCards] = useState<UserCard[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);

  const loadAll = useCallback(async () => {
    if (!user) {
      // No user yet — make sure we're not stuck on a spinner. The auth
      // listener will eventually fire and re-run this effect with a user.
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      console.log('[merchant] loading campaign for user', user.id);
      let c = await getCampaignByMerchant(user.id);
      console.log('[merchant] got campaign:', c);
      // If the user just confirmed their email, they may have a pending
      // campaign config in sessionStorage from the signup form.
      if (!c) {
        const consumed = await consumePendingCampaign(user.id);
        console.log('[merchant] consumed pending campaign?', consumed);
        if (consumed) c = await getCampaignByMerchant(user.id);
      }
      setCampaign(c);
      if (c) {
        const [cs, acts] = await Promise.all([listCardsForCampaign(c.id), listActivities(c.id)]);
        setCards(cs);
        setActivities(acts);
      } else {
        setCards([]);
        setActivities([]);
      }
    } catch (err) {
      console.error('[merchant] loadAll failed:', err);
      // Don't leave the user stuck on a spinner if the DB is unreachable
      // or the schema isn't applied. Show the onboarding screen instead;
      // they can sign out from there.
      setCampaign(null);
      setCards([]);
      setActivities([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Refresh activities after an action — they're the cheapest to refetch
  // and the source of truth (since the DB writes them).
  const refreshActivities = useCallback(async () => {
    if (!campaign) return;
    const acts = await listActivities(campaign.id);
    setActivities(acts);
  }, [campaign]);

  const handleStampCard = useCallback(
    async (cardId: string) => {
      if (!campaign) return;
      try {
        const updated = await addStamp(cardId, campaign.maxStamps);
        setCards((prev) => prev.map((c) => (c.id === cardId ? updated : c)));
        refreshActivities();
        // Fire-and-forget: push the new stamp count to Google Wallet so
        // any pass the customer has already saved updates on their device.
        // No await — we don't want wallet latency to hold up the UI.
        syncWalletObject(cardId);
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Stamp failed');
      }
    },
    [campaign, refreshActivities],
  );

  const handleResetCard = useCallback(
    async (cardId: string) => {
      try {
        const updated = await redeemReward(cardId);
        setCards((prev) => prev.map((c) => (c.id === cardId ? updated : c)));
        refreshActivities();
        syncWalletObject(cardId);
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Reset failed');
      }
    },
    [refreshActivities],
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
        // Sync the pass state — blocked passes show INACTIVE in Wallet.
        syncWalletObject(cardId);
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Status update failed');
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
        alert(err instanceof Error ? err.message : 'Delete failed');
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
        alert(err instanceof Error ? err.message : 'Could not add customer');
      }
    },
    [campaign, refreshActivities],
  );

  const handleUpdateCampaign = useCallback(
    async (patch: Partial<Campaign>) => {
      if (!campaign) return;
      try {
        const updated = await updateCampaign(campaign.id, patch);
        setCampaign(updated);
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Update failed');
      }
    },
    [campaign],
  );

  const handleLogout = useCallback(async () => {
    await signOut();
    onLogout();
  }, [onLogout]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!campaign) {
    return <MerchantOnboarding onComplete={loadAll} initialStep={startOnLogin ? 'LOGIN' : 'FORM'} />;
  }

  return (
    <MerchantDashboard
      campaign={campaign}
      cards={cards}
      activities={activities}
      onStampCard={handleStampCard}
      onResetCard={handleResetCard}
      onUpdateCampaign={handleUpdateCampaign}
      onAddCustomer={handleAddCustomer}
      onDeleteCustomer={handleDeleteCustomer}
      onBlockCustomer={handleBlockCustomer}
      onLogout={handleLogout}
    />
  );
}
