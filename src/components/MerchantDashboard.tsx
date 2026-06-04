import { useMemo, useState } from 'react';
import QRCode from 'react-qr-code';
import type { Campaign, UserCard, ActivityItem, Location, OnboardingState, MerchantBilling } from '../types';
import {
  ScanLine, Settings, Users, ChevronRight, Plus, Palette, Camera, X, Eye, Share, Menu,
  BarChart3, TrendingUp, Award, Upload, History, LogOut, Trash2, Ban, Search, CheckCircle2,
  RotateCcw, Smile, MoreHorizontal, ArrowRight, MapPin, Archive, Sparkles, Check,
} from 'lucide-react';
import { WalletCard } from './WalletCard';
import { QRScanner, parseCardQRPayload } from './QRScanner';
import { LocationsPanel } from './LocationsPanel';
import { UpgradeBanner } from './UpgradeBanner';
import { UpgradeModal } from './UpgradeModal';
import { AccountBilling } from './AccountBilling';
import { ComplianceSettings } from './ComplianceSettings';
import { PosterSettings } from './PosterSettings';
import { InsightsPanel } from './InsightsPanel';
import { buildPosterHtml, type PosterSize } from '../services/posterGenerator';

interface MerchantDashboardProps {
  campaign: Campaign;
  cards: UserCard[];
  activities: ActivityItem[];
  locations: Location[];
  activeLocationId: string | null;
  onboarding: OnboardingState;
  /** Merchant's current plan + Stripe state. Used to decide whether to show
   *  upgrade banners (free plan only) and which CTA to render. */
  billing: MerchantBilling;
  /** Merchant country, used for currency-aware pricing copy. */
  country?: 'DE' | 'CA' | null;
  onSetActiveLocation: (id: string | null) => void;
  onAddLocation: (name: string, address?: string) => Promise<void>;
  onUpdateLocation: (locationId: string, patch: { name?: string; address?: string; archived?: boolean }) => Promise<void>;
  onStampCard: (cardId: string) => void;
  onResetCard: (cardId: string) => void;
  /** Redeems a scanned signed token server-side. Returns the result so the
   *  scanner can show a toast. Throws if the token is invalid/expired/replayed. */
  onRedeemToken: (token: string) => Promise<{
    action: 'STAMP' | 'REDEEM';
    card: { id: string; customerName: string; currentStamps: number; rewardsRedeemed: number; status: 'ACTIVE' | 'BLOCKED' };
  }>;
  onUpdateCampaign: (patch: Partial<Campaign>) => void;
  onAddCustomer: (data: { firstName: string; surname: string; email: string }) => void;
  onDeleteCustomer: (cardId: string) => void;
  onBlockCustomer: (cardId: string) => void;
  onMarkOnboardingStep: (patch: Partial<OnboardingState>) => Promise<void>;
  onLogout: () => void;
}

type Tab = 'DASHBOARD' | 'CUSTOMERS' | 'ACTIVITY' | 'ANALYTICS' | 'PREVIEW' | 'SETTINGS' | 'SHARE';

const NOTION_COLORS = [
  { name: 'Default', hex: '#37352F' },
  { name: 'Gray', hex: '#9B9A97' },
  { name: 'Brown', hex: '#64473A' },
  { name: 'Orange', hex: '#D9730D' },
  { name: 'Yellow', hex: '#DFAB01' },
  { name: 'Green', hex: '#0F7B6C' },
  { name: 'Blue', hex: '#0B6E99' },
  { name: 'Purple', hex: '#6940A5' },
  { name: 'Pink', hex: '#AD1A72' },
  { name: 'Red', hex: '#E03E3E' },
];

const EMOJI_LIST = [
  '☕️', '🍔', '🍕', '🥗', '🍦', '🍩', '🍪', '🥐', '🥪', '🌮',
  '🍣', '🍱', '🍛', '🍜', '🍝', '🍷', '🍺', '🍸', '💇‍♀️', '💅',
  '💆‍♀️', '💈', '🏋️', '🧘', '🚲', '🚗', '📚', '🧸', '🎸', '🎮',
  '🧵', '🧶', '🎨', '📷', '💐', '🪴', '👗', '👠', '👓', '🛍️',
];

export function MerchantDashboard({
  campaign, cards, activities, locations, activeLocationId, onboarding, billing, country,
  onSetActiveLocation, onAddLocation, onUpdateLocation,
  onStampCard, onResetCard, onRedeemToken, onUpdateCampaign,
  onAddCustomer, onDeleteCustomer, onBlockCustomer, onMarkOnboardingStep, onLogout,
}: MerchantDashboardProps) {
  const [activeTab, setActiveTab] = useState<Tab>('DASHBOARD');
  const [showMobileMoreMenu, setShowMobileMoreMenu] = useState(false);

  // Buffered settings
  const [tempSettings, setTempSettings] = useState<Campaign>(campaign);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Scanner state
  const [manualId, setManualId] = useState('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanResult, setScanResult] = useState<{
    status: 'success' | 'error';
    card?: UserCard;
    message: string;
  } | null>(null);

  // Derived: non-archived locations, and the currently active one.
  const activeLocations = useMemo(() => locations.filter((l) => !l.archived), [locations]);
  const activeLocation = useMemo(
    () => activeLocations.find((l) => l.id === activeLocationId) ?? null,
    [activeLocations, activeLocationId],
  );

  // Upgrade UI state. The warning-state banner is dismissible per-session
  // (sessionStorage so it pops back if they refresh — they should see it
  // at least once per visit until they upgrade). The "at limit" banner
  // can NOT be dismissed because it reflects a real, ongoing block.
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [warningDismissed, setWarningDismissed] = useState(() =>
    sessionStorage.getItem('stampfix_upgrade_warning_dismissed') === '1',
  );
  const dismissWarning = () => {
    setWarningDismissed(true);
    sessionStorage.setItem('stampfix_upgrade_warning_dismissed', '1');
  };

  // Show banner only for free-plan merchants. Pro is unlimited so no nudges.
  const showBanner = billing.plan === 'free';

  // Customer list state
  const [customerSearch, setCustomerSearch] = useState('');
  const [isAddCustomerModalOpen, setIsAddCustomerModalOpen] = useState(false);
  const [newCustomerData, setNewCustomerData] = useState({ firstName: '', surname: '', email: '' });
  const [confirmAction, setConfirmAction] = useState<{
    type: 'DELETE' | 'BLOCK'; cardId: string; name: string;
  } | null>(null);

  // Preview
  const [previewStamps, setPreviewStamps] = useState(3);

  // -------------------- Handlers --------------------

  const handleTabChange = (tab: Tab) => {
    if (tab === 'SETTINGS') {
      setTempSettings(campaign);
      setSettingsSaved(false);
    }
    setActiveTab(tab);
    setShowMobileMoreMenu(false);
  };

  const handleManualStamp = () => {
    if (!manualId) return;
    const target = cards.find(
      (c) => c.id === manualId || c.email === manualId || c.id.startsWith(manualId),
    );
    if (!target) {
      setScanResult({ status: 'error', message: 'Customer not found' });
    } else if (target.status === 'BLOCKED') {
      setScanResult({ status: 'error', message: 'This card is blocked' });
    } else {
      onStampCard(target.id);
      const newStamps = target.currentStamps + 1;
      setScanResult({
        status: 'success',
        card: { ...target, currentStamps: newStamps },
        message: newStamps >= campaign.maxStamps ? 'Reward Unlocked!' : 'Stamp Added',
      });
      setManualId('');
    }
    setTimeout(() => setScanResult(null), 2500);
  };

  /**
   * Handles a decoded QR payload from the live scanner. We deliberately do
   * NOT close the scanner after a successful scan — a merchant stamping a
   * busy queue should be able to scan one customer after another without
   * tapping anything between.
   *
   * Two QR formats are supported:
   *  - Signed token (preferred, rotates every 30s) — sent to the server
   *    for verification + stamping. Server is authoritative.
   *  - Plain cardId (legacy, used by already-saved Google Wallet passes)
   *    — handled client-side as before. Still safe because RLS ensures
   *    merchants can only stamp cards in their own campaign, but it does
   *    NOT defend against screenshot replay. The token path does.
   */
  const handleScan = async (payload: string) => {
    const parsed = parseCardQRPayload(payload);
    if (!parsed) {
      setScanResult({ status: 'error', message: "That doesn't look like a Stampfix card" });
      setTimeout(() => setScanResult(null), 2500);
      return;
    }

    if (parsed.kind === 'token') {
      try {
        const result = await onRedeemToken(parsed.token);
        setScanResult({
          status: 'success',
          card: {
            id: result.card.id,
            campaignId: campaign.id,
            customerName: result.card.customerName,
            email: '',
            currentStamps: result.card.currentStamps,
            rewardsRedeemed: result.card.rewardsRedeemed,
            status: result.card.status,
            joinedAt: new Date(),
          },
          message: result.action === 'REDEEM'
            ? 'Reward Redeemed'
            : result.card.currentStamps >= campaign.maxStamps
              ? 'Reward Unlocked!'
              : 'Stamp Added',
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Stamp failed';
        setScanResult({ status: 'error', message: msg });
      }
      setTimeout(() => setScanResult(null), 2500);
      return;
    }

    // Legacy cardId path — for old Google Wallet passes that don't rotate.
    const target = cards.find((c) => c.id === parsed.cardId);
    if (!target) {
      setScanResult({ status: 'error', message: 'Card not from this campaign' });
      setTimeout(() => setScanResult(null), 2500);
      return;
    }
    if (target.status === 'BLOCKED') {
      setScanResult({ status: 'error', message: 'This card is blocked', card: target });
      setTimeout(() => setScanResult(null), 2500);
      return;
    }
    if (target.currentStamps >= campaign.maxStamps) {
      onResetCard(target.id);
      setScanResult({
        status: 'success',
        card: { ...target, currentStamps: 0, rewardsRedeemed: target.rewardsRedeemed + 1 },
        message: 'Reward Redeemed',
      });
    } else {
      onStampCard(target.id);
      const newStamps = target.currentStamps + 1;
      setScanResult({
        status: 'success',
        card: { ...target, currentStamps: newStamps },
        message: newStamps >= campaign.maxStamps ? 'Reward Unlocked!' : 'Stamp Added',
      });
    }
    setTimeout(() => setScanResult(null), 2500);
  };

  const handleSaveSettings = () => {
    onUpdateCampaign(tempSettings);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 3000);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) setTempSettings({ ...tempSettings, logoImage: ev.target.result as string });
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const handleAddCustomerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCustomerData.firstName && newCustomerData.email) {
      onAddCustomer(newCustomerData);
      setNewCustomerData({ firstName: '', surname: '', email: '' });
      setIsAddCustomerModalOpen(false);
    }
  };

  const handleConfirmAction = () => {
    if (!confirmAction) return;
    if (confirmAction.type === 'DELETE') onDeleteCustomer(confirmAction.cardId);
    else if (confirmAction.type === 'BLOCK') onBlockCustomer(confirmAction.cardId);
    setConfirmAction(null);
  };

  /** Download the new-format printable poster for a specific location.
   *  Size determines the paper format. The HTML template is generated
   *  by services/posterGenerator and includes the merchant's offer,
   *  branding color (or gradient from posterColor), icon, business name,
   *  and a per-location QR code. */
  const handleDownloadPoster = (location: Location | null, size: PosterSize = 'poster') => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow pop-ups to download the poster.');
      return;
    }
    const html = buildPosterHtml({
      campaign,
      location,
      size,
    });
    printWindow.document.write(html);
    printWindow.document.close();
    // Onboarding: downloading any poster from the Share tab counts as
    // the poster-downloaded milestone. Fire and forget.
    if (!onboarding.poster_downloaded) {
      onMarkOnboardingStep({ poster_downloaded: true });
    }
  };

  const filteredCards = useMemo(() => {
    const q = customerSearch.toLowerCase();
    if (!q) return cards;
    return cards.filter(
      (c) => c.customerName.toLowerCase().includes(q) || c.email.toLowerCase().includes(q),
    );
  }, [cards, customerSearch]);

  /** Per-location signup URL. The customer signup page reads ?location= and
   *  records it on their new card. The base ?campaign= alone still works
   *  and creates location-less signups. */
  const joinUrlForLocation = (locationId: string | null) =>
    locationId
      ? `${window.location.origin}/?campaign=${campaign.id}&location=${locationId}`
      : `${window.location.origin}/?campaign=${campaign.id}`;

  // -------------------- Render --------------------

  return (
    <div className="flex min-h-screen bg-white text-[#37352F] font-sans">
      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-white/80 backdrop-blur-md" onClick={() => setConfirmAction(null)} />
          <div className="relative bg-white border notion-border shadow-xl rounded-xl p-8 max-w-sm w-full text-center space-y-6 animate-in zoom-in-95 duration-200">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${
              confirmAction.type === 'DELETE' ? 'bg-red-50 text-red-500' : 'bg-orange-50 text-orange-500'
            }`}>
              {confirmAction.type === 'DELETE' ? <Trash2 className="w-8 h-8" /> : <Ban className="w-8 h-8" />}
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-serif-display font-semibold">Are you sure?</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                {confirmAction.type === 'DELETE'
                  ? `You are about to permanently delete ${confirmAction.name}. This cannot be undone.`
                  : `You are about to ${cards.find((c) => c.id === confirmAction.cardId)?.status === 'BLOCKED' ? 'unblock' : 'block'} ${confirmAction.name}.`}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setConfirmAction(null)} className="px-4 py-2.5 border notion-border rounded-md text-sm font-medium hover:bg-gray-50">Cancel</button>
              <button onClick={handleConfirmAction} className={`px-4 py-2.5 rounded-md text-sm font-medium text-white shadow-sm ${
                confirmAction.type === 'DELETE' ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-600 hover:bg-orange-700'
              }`}>
                {confirmAction.type === 'DELETE' ? 'Yes, Delete' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Customer Modal */}
      {isAddCustomerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setIsAddCustomerModalOpen(false)}></div>
          <div className="relative bg-white rounded-lg shadow-xl border notion-border w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b notion-border flex justify-between items-center bg-[#F7F7F5]">
              <h3 className="font-semibold text-sm">Add New Customer</h3>
              <button onClick={() => setIsAddCustomerModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddCustomerSubmit} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-gray-400 tracking-wider">First Name</label>
                <input autoFocus value={newCustomerData.firstName}
                  onChange={(e) => setNewCustomerData({ ...newCustomerData, firstName: e.target.value })}
                  className="w-full bg-[#F7F7F5] border notion-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-gray-400 tracking-wider">Surname</label>
                <input value={newCustomerData.surname}
                  onChange={(e) => setNewCustomerData({ ...newCustomerData, surname: e.target.value })}
                  className="w-full bg-[#F7F7F5] border notion-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-gray-400 tracking-wider">Email</label>
                <input type="email" value={newCustomerData.email}
                  onChange={(e) => setNewCustomerData({ ...newCustomerData, email: e.target.value })}
                  className="w-full bg-[#F7F7F5] border notion-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300" />
              </div>
              <button type="submit" disabled={!newCustomerData.firstName || !newCustomerData.email}
                className="w-full bg-[#37352F] text-white py-2.5 rounded text-sm font-medium hover:bg-opacity-90 transition disabled:opacity-50">
                Add Customer
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside className="w-64 bg-[#F7F7F5] border-r notion-border hidden md:flex flex-col fixed inset-y-0 left-0 z-40">
        <div className="p-4 flex items-center gap-2 font-semibold text-sm border-b notion-border h-[60px]">
          <div className="w-5 h-5 min-w-[20px] rounded text-white flex items-center justify-center text-xs"
            style={{ backgroundColor: campaign.primaryColor }}>
            {campaign.businessName.charAt(0)}
          </div>
          <span className="truncate">{campaign.businessName}</span>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          <div className="px-3 mb-2">
            <div className="text-xs font-semibold text-gray-400 mb-1 px-2">Workspace</div>
            {([
              ['DASHBOARD', ScanLine, 'Scanner'],
              ['CUSTOMERS', Users, 'Customers'],
              ['ACTIVITY', History, 'Activity'],
              ['ANALYTICS', BarChart3, 'Insights'],
              ['PREVIEW', Eye, 'Preview Card'],
              ['SHARE', Share, 'Share & Promote'],
              ['SETTINGS', Settings, 'Settings'],
            ] as const).map(([id, Icon, label]) => (
              <button key={id} onClick={() => handleTabChange(id)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition ${
                  activeTab === id ? 'bg-[#EFEFEE] font-medium' : 'hover:bg-[#EFEFEE] text-gray-600'
                }`}>
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>
        </div>

        {/* Pro upgrade CTA — free plan only. Sits above logout so it's
         *  always visible without being intrusive. Single click opens
         *  the same UpgradeModal used elsewhere. */}
        {billing.plan === 'free' && (
          <div className="px-3 pb-3">
            <button
              onClick={() => setShowUpgradeModal(true)}
              className="w-full text-left group bg-gradient-to-br from-[#37352F] to-[#1a1918] text-white rounded-lg p-3.5 shadow-sm hover:shadow-md transition-all hover:scale-[1.02]"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-6 h-6 rounded-full bg-amber-400/20 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                </div>
                <span className="text-sm font-semibold">Upgrade to Pro</span>
              </div>
              <p className="text-[11px] text-gray-300 leading-snug">
                Unlock unlimited customers and unlock more.
              </p>
              <div className="mt-2 text-[10px] font-medium text-amber-300 group-hover:text-amber-200 inline-flex items-center gap-0.5">
                See plans <ArrowRight className="w-3 h-3" />
              </div>
            </button>
          </div>
        )}

        <div className="p-3 border-t notion-border">
          <button onClick={onLogout} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-red-50 text-gray-600 hover:text-red-600">
            <LogOut className="w-4 h-4" /> Log out
          </button>
        </div>
      </aside>

      <main className="flex-1 p-6 md:p-12 md:pl-72 pb-24 md:pb-12 max-w-7xl mx-auto w-full min-w-0">
        {/* Mobile header */}
        <div className="md:hidden sticky top-0 z-10 bg-white/80 backdrop-blur-md flex justify-between items-center mb-6 py-4 border-b notion-border -mx-6 px-6">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded text-white flex items-center justify-center text-xs font-bold"
              style={{ backgroundColor: campaign.primaryColor }}>
              {campaign.businessName.charAt(0)}
            </div>
            <span className="font-semibold text-sm truncate max-w-[150px]">{campaign.businessName}</span>
          </div>
          <button onClick={onLogout} className="text-gray-400 p-1"><LogOut className="w-5 h-5" /></button>
        </div>

        <div className="hidden md:flex items-center text-sm text-gray-400 mb-6 gap-2">
          <span>{campaign.businessName}</span>
          <ChevronRight className="w-4 h-4" />
          <span className="text-[#37352F] font-medium capitalize">{activeTab.toLowerCase()}</span>
        </div>

        {/* --- DASHBOARD / SCANNER --- */}
        {activeTab === 'DASHBOARD' && (
          <div className="space-y-8 relative">
            <header>
              <h1 className="text-3xl md:text-4xl font-serif-display font-semibold mb-2">Scan Terminal</h1>
              <p className="text-gray-500 text-sm md:text-base">Ready to stamp. Point your device at a customer's card.</p>
            </header>

            {/* Get Started checklist — disappears once all three milestones are hit */}
            {!(onboarding.poster_downloaded && onboarding.test_signup_done && onboarding.first_stamp_given) && (
              <div className="bg-gradient-to-br from-[#F7F7F5] to-white border notion-border rounded-lg p-5 max-w-2xl">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-500" /> Get Started
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Three small steps to your first stamp.
                    </p>
                  </div>
                  <span className="text-xs font-medium text-gray-500">
                    {Number(!!onboarding.poster_downloaded) + Number(!!onboarding.test_signup_done) + Number(!!onboarding.first_stamp_given)} / 3
                  </span>
                </div>
                <div className="space-y-2">
                  <ChecklistItem
                    done={!!onboarding.poster_downloaded}
                    label="Download your QR poster"
                    actionLabel="Go to Share & Promote"
                    onClick={() => setActiveTab('SHARE')}
                  />
                  <ChecklistItem
                    done={!!onboarding.test_signup_done}
                    label="Try the customer flow yourself"
                    actionLabel="Open in new tab"
                    onClick={async () => {
                      const primary = activeLocations[0];
                      const url = primary
                        ? `${window.location.origin}/?campaign=${campaign.id}&location=${primary.id}`
                        : `${window.location.origin}/?campaign=${campaign.id}`;
                      window.open(url, '_blank');
                      await onMarkOnboardingStep({ test_signup_done: true });
                    }}
                  />
                  <ChecklistItem
                    done={!!onboarding.first_stamp_given}
                    label="Give your first stamp"
                    actionLabel="Open scanner"
                    onClick={() => setIsScannerOpen(true)}
                  />
                </div>
              </div>
            )}

            <div className="max-w-2xl">
              {/* Upgrade banner — sits above the scanner so it's seen the
               *  moment the merchant lands on Dashboard. Free plan only;
               *  hidden under 8/10 customers; warning at 8-9 (dismissible
               *  per session); hard block at 10 (not dismissible). */}
              {showBanner && cards.length >= 8 &&
               !(cards.length < 10 && warningDismissed) && (
                <div className="mb-4">
                  <UpgradeBanner
                    customerCount={cards.length}
                    country={country}
                    onUpgrade={() => setShowUpgradeModal(true)}
                    onDismiss={cards.length < 10 ? dismissWarning : undefined}
                  />
                </div>
              )}
              {/* Location picker — which branch is doing the stamping */}
              {activeLocations.length > 0 && (
                <div className="mb-4 flex items-center justify-between bg-white border notion-border rounded-lg px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-500">Stamping at</span>
                    <select
                      value={activeLocationId ?? ''}
                      onChange={(e) => onSetActiveLocation(e.target.value || null)}
                      className="font-medium text-[#37352F] bg-transparent focus:outline-none cursor-pointer"
                    >
                      {activeLocations.map((l) => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </select>
                  </div>
                  {activeLocations.length > 1 && (
                    <span className="text-[10px] uppercase tracking-wider text-gray-400">
                      {activeLocations.length} locations
                    </span>
                  )}
                </div>
              )}
              <div className="border notion-border rounded-xl bg-white shadow-sm p-4 flex flex-col justify-between min-h-[480px] relative overflow-hidden">
                {scanResult && (
                  <div className="absolute inset-0 z-20 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-300">
                    <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 shadow-sm border ${
                      scanResult.status === 'success' ? 'bg-green-50 border-green-100 text-green-600' : 'bg-red-50 border-red-100 text-red-500'
                    }`}>
                      {scanResult.status === 'success' ? <CheckCircle2 className="w-10 h-10" /> : <Ban className="w-10 h-10" />}
                    </div>
                    <h3 className="text-2xl font-serif-display font-semibold mb-2">{scanResult.message}</h3>
                    {scanResult.card && (
                      <div className="text-center space-y-1">
                        <p className="text-gray-900 font-medium">{scanResult.card.customerName}</p>
                        <p className="text-gray-500 text-sm">{scanResult.card.currentStamps} / {campaign.maxStamps} Stamps</p>
                      </div>
                    )}
                  </div>
                )}

                {isScannerOpen ? (
                  <div className="relative flex-1 h-[360px] rounded-lg overflow-hidden">
                    <QRScanner onScan={handleScan} onClose={() => setIsScannerOpen(false)} />
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6 bg-[#F7F7F5] rounded-lg border-2 border-dashed border-gray-200 hover:border-gray-300 hover:bg-[#F0F0EE] transition cursor-pointer group touch-manipulation active:scale-[0.98]" onClick={() => setIsScannerOpen(true)}>
                    <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-sm border notion-border group-hover:scale-105 transition duration-300">
                      <Camera className="w-8 h-8 text-gray-400 group-hover:text-[#37352F] transition" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-semibold text-lg">Tap to Activate Scanner</h3>
                      <p className="text-sm text-gray-400">Camera access required</p>
                    </div>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t notion-border">
                  <div className="flex gap-2">
                    <input
                      className="flex-1 bg-[#F7F7F5] border notion-border rounded px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                      placeholder="Or enter Customer ID / Email..."
                      value={manualId}
                      onChange={(e) => setManualId(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleManualStamp()}
                    />
                    <button onClick={handleManualStamp} className="text-white px-6 py-3 rounded text-sm font-medium hover:bg-opacity-90 transition shadow-sm active:scale-95"
                      style={{ backgroundColor: campaign.primaryColor }}>
                      Stamp
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- ACTIVITY --- */}
        {activeTab === 'ACTIVITY' && (
          <div className="space-y-6">
            <header>
              <h1 className="text-3xl md:text-4xl font-serif-display font-semibold mb-2">Recent Activity</h1>
              <p className="text-gray-500 text-sm md:text-base">History of recent stamps, redemptions, and new members.</p>
            </header>
            <div className="border notion-border rounded-lg bg-white">
              {activities.length === 0 ? (
                <div className="text-sm text-gray-400 italic p-8 text-center">No activity recorded yet.</div>
              ) : (
                <div className="divide-y notion-border">
                  {activities.map((act) => (
                    <div key={act.id} className="flex items-center justify-between p-4 hover:bg-[#F7F7F5] transition">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                          act.type === 'STAMP' ? 'bg-blue-50 text-blue-600' :
                          act.type === 'REDEEM' ? 'bg-green-50 text-green-600' :
                          act.type === 'JOIN' ? 'bg-gray-100 text-gray-600' :
                          'bg-orange-50 text-orange-600'
                        }`}>
                          {act.type === 'STAMP' ? '+' :
                            act.type === 'REDEEM' ? '★' :
                            act.type === 'JOIN' ? '👋' :
                            act.type === 'BLOCK' ? '🚫' : '✓'}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {act.type === 'STAMP' ? `Stamped ${act.customerName}` :
                              act.type === 'REDEEM' ? `Reward claimed by ${act.customerName}` :
                              act.type === 'JOIN' ? `${act.customerName} joined the program` :
                              act.type === 'BLOCK' ? `Blocked ${act.customerName}` :
                              `Unblocked ${act.customerName}`}
                          </div>
                          <div className="text-xs text-gray-500">{act.timestamp.toLocaleString()}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- CUSTOMERS --- */}
        {activeTab === 'CUSTOMERS' && (
          <div className="space-y-6">
            <header className="flex justify-between items-end">
              <div>
                <h1 className="text-3xl md:text-4xl font-serif-display font-semibold mb-2">Customers</h1>
                <p className="text-gray-500 text-sm md:text-base">Database of all loyalty program members.</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative hidden md:block">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="text" placeholder="Search customers..." value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="pl-9 pr-4 py-1.5 bg-white border notion-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 w-64" />
                </div>
                <button onClick={() => setIsAddCustomerModalOpen(true)} className="text-sm text-white px-3 py-2 rounded hover:bg-opacity-90 flex items-center gap-1 shadow-sm"
                  style={{ backgroundColor: campaign.primaryColor }}>
                  <Plus className="w-4 h-4" /> New
                </button>
              </div>
            </header>
            <div className="md:hidden mb-4 relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Search customers..." value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="pl-9 pr-4 py-2.5 bg-white border notion-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 w-full" />
            </div>

            <div className="border notion-border rounded-lg overflow-hidden bg-white">
              {/* Mobile list */}
              <div className="md:hidden divide-y notion-border">
                {filteredCards.map((card) => (
                  <div key={card.id} className="p-4 flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="font-medium text-sm">{card.customerName}</div>
                      <div className="text-xs text-gray-500">{card.email}</div>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        card.status === 'BLOCKED' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'
                      }`}>{card.currentStamps} Stamps</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {card.status !== 'BLOCKED' && (
                        <button onClick={() => onStampCard(card.id)} className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                          <Plus className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => setConfirmAction({ type: 'BLOCK', cardId: card.id, name: card.customerName })}
                        className="w-8 h-8 rounded-full bg-gray-50 text-gray-400 flex items-center justify-center">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                {filteredCards.length === 0 && (
                  <div className="p-8 text-center text-gray-400 italic text-sm">No customers found.</div>
                )}
              </div>

              {/* Desktop table */}
              <table className="w-full text-sm text-left min-w-[600px] hidden md:table">
                <thead className="bg-[#F7F7F5] text-gray-500 font-medium">
                  <tr>
                    <th className="px-4 py-3 border-b notion-border">Name</th>
                    <th className="px-4 py-3 border-b notion-border">Email</th>
                    <th className="px-4 py-3 border-b notion-border">Progress</th>
                    <th className="px-4 py-3 border-b notion-border">Redeemed</th>
                    <th className="px-4 py-3 border-b notion-border">Status</th>
                    <th className="px-4 py-3 border-b notion-border w-28">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y notion-border">
                  {filteredCards.map((card) => (
                    <tr key={card.id} className="hover:bg-[#F7F7F5]">
                      <td className="px-4 py-3 font-medium">{card.customerName}</td>
                      <td className="px-4 py-3 text-gray-500">{card.email || '-'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full" style={{
                              width: `${(card.currentStamps / campaign.maxStamps) * 100}%`,
                              backgroundColor: card.status === 'BLOCKED' ? '#ccc' : campaign.primaryColor,
                            }} />
                          </div>
                          <span className="text-xs text-gray-400">{card.currentStamps}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 font-mono">{card.rewardsRedeemed}</td>
                      <td className="px-4 py-3">
                        {card.status === 'BLOCKED' ? (
                          <span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider">Blocked</span>
                        ) : card.currentStamps >= campaign.maxStamps ? (
                          <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded text-xs font-medium">Reward Ready</span>
                        ) : (
                          <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-xs">Collecting</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {card.status !== 'BLOCKED' && (
                            <>
                              {card.currentStamps >= campaign.maxStamps ? (
                                <button onClick={() => onResetCard(card.id)} className="text-green-600 hover:underline text-xs font-medium">Redeem</button>
                              ) : (
                                <button onClick={() => onStampCard(card.id)} className="text-blue-600 hover:underline text-xs font-medium">+Stamp</button>
                              )}
                              <div className="h-4 w-px bg-gray-200 mx-1"></div>
                            </>
                          )}
                          <button onClick={() => setConfirmAction({ type: 'BLOCK', cardId: card.id, name: card.customerName })}
                            className="text-gray-400 hover:text-orange-500 transition" title={card.status === 'BLOCKED' ? 'Unblock' : 'Block'}>
                            <Ban className="w-4 h-4" />
                          </button>
                          <button onClick={() => setConfirmAction({ type: 'DELETE', cardId: card.id, name: card.customerName })}
                            className="text-gray-400 hover:text-red-500 transition" title="Delete">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredCards.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 italic">No customers found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- ANALYTICS --- */}
        {activeTab === 'ANALYTICS' && (
          <InsightsPanel
            campaign={campaign}
            cards={cards}
            activities={activities}
            locations={locations}
          />
        )}

        {/* --- PREVIEW --- */}
        {activeTab === 'PREVIEW' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <header>
              <h1 className="text-3xl md:text-4xl font-serif-display font-semibold mb-2">Card Preview</h1>
              <p className="text-gray-500 text-sm md:text-base">See what your customers see in their digital wallet.</p>
            </header>
            <div className="grid md:grid-cols-2 gap-12 items-start">
              <div className="bg-white p-6 rounded-lg border notion-border shadow-sm">
                <h3 className="font-medium mb-4 text-sm uppercase tracking-wider text-gray-400">Preview Options</h3>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Stamps Collected: {previewStamps}</label>
                    <input type="range" min={0} max={campaign.maxStamps} value={previewStamps}
                      onChange={(e) => setPreviewStamps(parseInt(e.target.value))}
                      className="w-full accent-[#37352F] cursor-pointer" />
                  </div>
                  <div className="p-4 bg-gray-50 rounded text-xs text-gray-500 leading-relaxed border notion-border">
                    Customers see this card in their Google Wallet on Android. Adjust the slider to preview different stamp counts.
                  </div>
                </div>
              </div>
              <div className="flex justify-center bg-[#F7F7F5] p-8 rounded-xl border notion-border">
                <div className="w-full max-w-[320px]">
                  <WalletCard
                    campaign={campaign}
                    card={{
                      id: 'preview-id',
                      campaignId: campaign.id,
                      currentStamps: previewStamps,
                      customerName: 'Customer Preview',
                      email: 'preview@example.com',
                      age: null,
                      rewardsRedeemed: 0,
                      joinedAt: new Date(),
                      status: 'ACTIVE',
                    }}
                    disableSave
                    staticQR
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- SHARE --- */}
        {activeTab === 'SHARE' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <header>
              <h1 className="text-3xl md:text-4xl font-serif-display font-semibold mb-2">Share & Promote</h1>
              <p className="text-gray-500 text-sm md:text-base">
                {activeLocations.length > 1
                  ? `Print a poster for each of your ${activeLocations.length} locations. Each QR records which branch a customer joined at.`
                  : 'Print this QR code so customers can join your program.'}
              </p>
            </header>

            <div className="grid md:grid-cols-2 gap-12 items-start">
              {/* Left column: one QR card per location. Falls back to a single
                  campaign-wide QR if there are no locations (defensive — every
                  campaign should have a "Main" after the migration). */}
              <div className="space-y-6">
                {(activeLocations.length > 0 ? activeLocations : [null]).map((loc) => {
                  const url = joinUrlForLocation(loc?.id ?? null);
                  const qrId = loc ? `share-qr-${loc.id}` : 'share-qr-code';
                  return (
                    <div key={loc?.id ?? 'campaign-wide'} className="bg-white p-8 rounded-lg border notion-border shadow-sm flex flex-col items-center text-center space-y-5">
                      <div className="space-y-1">
                        <h3 className="text-xl font-serif-display font-semibold">Join {campaign.businessName}</h3>
                        {loc && (
                          <p className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-gray-500 bg-[#F7F7F5] px-2.5 py-1 rounded-full border notion-border">
                            <MapPin className="w-3 h-3" /> {loc.name}
                          </p>
                        )}
                      </div>
                      <div className="p-4 bg-white border-2 border-dashed border-gray-200 rounded-xl max-w-[240px]">
                        <QRCode id={qrId} value={url} size={160} />
                      </div>
                      <div className="space-y-2 w-full pt-2">
                        <div className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-1">Download as</div>
                        <div className="grid grid-cols-3 gap-1.5">
                          <button onClick={() => handleDownloadPoster(loc, 'card')} className="bg-[#37352F] text-white py-2 px-1 rounded-md text-xs font-medium hover:bg-opacity-90 transition" title="Business card (85×55mm)">
                            Card
                          </button>
                          <button onClick={() => handleDownloadPoster(loc, 'pamphlet')} className="bg-[#37352F] text-white py-2 px-1 rounded-md text-xs font-medium hover:bg-opacity-90 transition" title="Pamphlet (A5 landscape)">
                            Pamphlet
                          </button>
                          <button onClick={() => handleDownloadPoster(loc, 'poster')} className="bg-[#37352F] text-white py-2 px-1 rounded-md text-xs font-medium hover:bg-opacity-90 transition" title="Poster (A4 portrait)">
                            Poster
                          </button>
                        </div>
                        <button onClick={() => navigator.clipboard.writeText(url)} className="w-full bg-white border notion-border text-[#37352F] py-2 rounded-md font-medium text-sm hover:bg-gray-50 transition">
                          Copy Link
                        </button>
                      </div>
                      <div className="text-[10px] text-gray-400 break-all">{url}</div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-6">
                <div className="bg-[#F7F7F5] p-6 rounded-lg border notion-border">
                  <h3 className="font-medium mb-2">How it works</h3>
                  <ul className="text-sm text-gray-600 space-y-3 list-disc pl-4">
                    <li>Customers scan the QR code at your checkout.</li>
                    <li>They enter their email; we send them a magic sign-in link.</li>
                    <li>They land on a page with their card and a "Save to Google Wallet" button.</li>
                    <li>You scan their card here on future visits to give stamps.</li>
                  </ul>
                </div>
                {activeLocations.length > 1 && (
                  <div className="bg-amber-50 p-6 rounded-lg border border-amber-100">
                    <h3 className="font-medium mb-2 text-amber-900">Multiple locations</h3>
                    <p className="text-sm text-amber-800">
                      Print a different poster for each branch. Customers' cards work everywhere — the per-location QR just records which branch they joined at, so you can see in Analytics which location is driving signups.
                    </p>
                  </div>
                )}
                <div className="bg-blue-50 p-6 rounded-lg border border-blue-100">
                  <h3 className="font-medium mb-2 text-blue-900">Try it yourself</h3>
                  <p className="text-sm text-blue-700 mb-4">Open the customer signup page in a new tab to preview the join flow.</p>
                  <a
                    href={joinUrlForLocation(activeLocations[0]?.id ?? null)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      if (!onboarding.test_signup_done) {
                        onMarkOnboardingStep({ test_signup_done: true });
                      }
                    }}
                    className="inline-flex bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition items-center gap-2"
                  >
                    Open Customer View <ArrowRight className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- SETTINGS --- */}
        {activeTab === 'SETTINGS' && (
          <div className="space-y-8">
            <header className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl md:text-4xl font-serif-display font-semibold mb-2">Settings</h1>
                <p className="text-gray-500 text-sm md:text-base">Configure campaign, branding, and integrations.</p>
              </div>
              {settingsSaved && (
                <div className="flex items-center gap-2 text-green-600 bg-green-50 px-3 py-1.5 rounded-full text-sm font-medium animate-in fade-in slide-in-from-top-2">
                  <CheckCircle2 className="w-4 h-4" /> Saved
                </div>
              )}
            </header>

            <AccountBilling
              billing={billing}
              country={country}
              cards={cards}
            />

            <LocationsPanel
              locations={locations}
              activeLocationId={activeLocationId}
              onAdd={onAddLocation}
              onUpdate={onUpdateLocation}
            />

            <ComplianceSettings merchantId={campaign.merchantId} />

            <PosterSettings
              campaign={campaign}
              onUpdated={(updated) => onUpdateCampaign({ posterColor: updated.posterColor })}
            />

            <div className="border notion-border rounded-lg p-6 space-y-8">
              <div>
                <h3 className="font-medium mb-4 flex items-center gap-2"><Settings className="w-4 h-4" /> General Configuration</h3>
                <div className="bg-blue-50 border border-blue-100 rounded-md p-3 mb-4 text-xs text-blue-800 leading-relaxed">
                  <strong>How offer changes work:</strong> When you change the offer title or
                  required stamps, only <strong>new customers</strong> get the updated offer.
                  Existing customers keep working toward the offer they originally signed up for.
                  Once they redeem their reward, their next cycle automatically uses your current offer.
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase">Business Name</label>
                    <input value={tempSettings.businessName}
                      onChange={(e) => setTempSettings({ ...tempSettings, businessName: e.target.value })}
                      className="w-full bg-[#F7F7F5] border notion-border rounded px-3 py-2 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase">Offer Title</label>
                    <input value={tempSettings.offerTitle}
                      onChange={(e) => setTempSettings({ ...tempSettings, offerTitle: e.target.value })}
                      className="w-full bg-[#F7F7F5] border notion-border rounded px-3 py-2 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase">Primary Color</label>
                    <select value={tempSettings.primaryColor}
                      onChange={(e) => setTempSettings({ ...tempSettings, primaryColor: e.target.value })}
                      className="w-full bg-[#F7F7F5] border notion-border rounded px-3 py-2 text-sm">
                      {NOTION_COLORS.map((c) => <option key={c.hex} value={c.hex}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase">Max Stamps</label>
                    <input type="number" min={3} max={20} value={tempSettings.maxStamps}
                      onChange={(e) => setTempSettings({ ...tempSettings, maxStamps: parseInt(e.target.value) || 6 })}
                      className="w-full bg-[#F7F7F5] border notion-border rounded px-3 py-2 text-sm" />
                  </div>
                </div>
              </div>

              <div className="border-t notion-border pt-6">
                <h3 className="font-medium mb-4 flex items-center gap-2"><Palette className="w-4 h-4" /> Branding Studio</h3>
                <div className="grid md:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="text-xs font-bold text-gray-400 uppercase">Card Pattern</label>
                    <div className="flex gap-2">
                      {(['solid', 'dots', 'grid'] as const).map((pattern) => (
                        <button key={pattern}
                          onClick={() => setTempSettings({ ...tempSettings, cardPattern: pattern })}
                          className={`flex-1 h-12 rounded border-2 transition relative overflow-hidden ${
                            tempSettings.cardPattern === pattern ? 'border-[#37352F] bg-[#F7F7F5]' : 'border-gray-200 bg-white'
                          }`}>
                          {pattern === 'dots' && (
                            <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '8px 8px' }} />
                          )}
                          {pattern === 'grid' && (
                            <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)', backgroundSize: '10px 10px' }} />
                          )}
                          <span className="text-xs font-medium relative z-10 bg-white/50 px-1 rounded capitalize">{pattern}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-1 relative">
                      <label className="text-xs font-bold text-gray-400 uppercase">Custom Icon</label>
                      <div className="flex gap-2">
                        <input value={tempSettings.customIcon}
                          onChange={(e) => setTempSettings({ ...tempSettings, customIcon: e.target.value })}
                          className="w-full bg-[#F7F7F5] border notion-border rounded px-3 py-2 text-sm" />
                        <button onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                          className="px-3 bg-white border notion-border rounded hover:bg-gray-50 transition flex items-center justify-center text-gray-500">
                          <Smile className="w-4 h-4" />
                        </button>
                      </div>
                      {showEmojiPicker && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setShowEmojiPicker(false)}></div>
                          <div className="absolute top-full right-0 mt-2 z-50 bg-white border notion-border shadow-xl rounded-lg p-2 w-64 h-64 overflow-y-auto grid grid-cols-5 gap-1">
                            {EMOJI_LIST.map((emoji) => (
                              <button key={emoji}
                                onClick={() => { setTempSettings({ ...tempSettings, customIcon: emoji }); setShowEmojiPicker(false); }}
                                className="w-10 h-10 flex items-center justify-center text-xl hover:bg-gray-100 rounded transition">
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase">Upload Logo</label>
                      <div className="flex gap-2 items-center">
                        <label className="flex-1 cursor-pointer bg-[#F7F7F5] border notion-border border-dashed rounded h-10 flex items-center justify-center text-xs text-gray-500 hover:bg-gray-100 transition">
                          <Upload className="w-3 h-3 mr-2" />
                          {tempSettings.logoImage ? 'Change File' : 'Choose File'}
                          <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                        </label>
                        {tempSettings.logoImage && (
                          <button onClick={() => setTempSettings({ ...tempSettings, logoImage: null })}
                            className="h-10 px-3 bg-red-50 text-red-500 rounded border border-red-100 text-xs hover:bg-red-100">
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t notion-border">
                <button onClick={() => setTempSettings(campaign)}
                  className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900 transition font-medium border border-transparent hover:border-gray-200 rounded">
                  Cancel
                </button>
                <button onClick={handleSaveSettings}
                  className="px-6 py-2 bg-[#37352F] text-white rounded text-sm font-medium hover:bg-opacity-90 transition shadow-sm">
                  Save Changes
                </button>
              </div>

              <div className="border-t notion-border pt-6 flex justify-between items-center">
                <div className="text-xs text-gray-400 flex items-center gap-2">
                  <RotateCcw className="w-3 h-3" /> Data synced to Supabase
                </div>
                <button onClick={onLogout} className="text-red-500 text-sm hover:underline flex items-center gap-1">
                  <LogOut className="w-3 h-3" /> Sign out
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Mobile Bottom Nav */}
      <div className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t notion-border z-50 pb-safe">
        <div className="flex justify-around items-center h-16">
          {([
            ['DASHBOARD', ScanLine, 'Scan'],
            ['CUSTOMERS', Users, 'People'],
            ['ANALYTICS', BarChart3, 'Insights'],
          ] as const).map(([id, Icon, label]) => (
            <button key={id} onClick={() => handleTabChange(id)}
              className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${
                activeTab === id ? 'text-[#37352F]' : 'text-gray-400'
              }`}>
              <Icon className="w-6 h-6" />
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          ))}
          <button onClick={() => setShowMobileMoreMenu(true)}
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${
              ['ACTIVITY', 'PREVIEW', 'SETTINGS', 'SHARE'].includes(activeTab) ? 'text-[#37352F]' : 'text-gray-400'
            }`}>
            <Menu className="w-6 h-6" />
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </div>

      {showMobileMoreMenu && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowMobileMoreMenu(false)} />
          <div className="bg-white rounded-t-xl p-4 animate-in slide-in-from-bottom duration-300 relative z-10 pb-8">
            <div className="w-12 h-1 bg-gray-200 rounded-full mx-auto mb-6"></div>
            <div className="grid grid-cols-4 gap-4 mb-4">
              {([
                ['ACTIVITY', History, 'Activity'],
                ['SHARE', Share, 'Share'],
                ['PREVIEW', Eye, 'Preview'],
                ['SETTINGS', Settings, 'Settings'],
              ] as const).map(([id, Icon, label]) => (
                <button key={id} onClick={() => handleTabChange(id)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border ${
                    activeTab === id ? 'bg-[#F7F7F5] border-[#37352F]' : 'bg-white border-transparent'
                  }`}>
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    activeTab === id ? 'bg-[#37352F] text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-medium">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Upgrade modal — rendered at the root so it overlays everything */}
      {showUpgradeModal && (
        <UpgradeModal country={country ?? null} onClose={() => setShowUpgradeModal(false)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Small subcomponents
// ---------------------------------------------------------------------

function MetricCard({ label, value, icon, color }: {
  label: string; value: number; icon: React.ReactNode; color: string;
}) {
  return (
    <div className="p-6 border notion-border rounded-lg bg-white shadow-sm flex items-start justify-between">
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">{label}</p>
        <h3 className="text-3xl font-serif-display font-semibold">{value}</h3>
      </div>
      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${color}`}>{icon}</div>
    </div>
  );
}

/**
 * Bucket activities into the last 7 days and show as bars.
 * Today is the rightmost bar.
 */
function ActivityBars({ activities }: { activities: ActivityItem[] }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days: { label: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(today.getDate() - i);
    const next = new Date(day);
    next.setDate(day.getDate() + 1);
    const count = activities.filter(
      (a) => a.timestamp >= day && a.timestamp < next && a.type === 'STAMP',
    ).length;
    days.push({
      label: day.toLocaleDateString('en-US', { weekday: 'short' }).charAt(0),
      count,
    });
  }
  const maxCount = Math.max(1, ...days.map((d) => d.count));
  return (
    <div className="flex items-end justify-between h-48 w-full gap-2">
      {days.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-2 group cursor-default">
          <div className="w-full bg-[#37352F] rounded-t-sm opacity-10 group-hover:opacity-100 transition-all relative"
            style={{ height: `${Math.max(4, (d.count / maxCount) * 100)}%` }}>
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap">
              {d.count} stamps
            </div>
          </div>
          <span className="text-xs text-gray-400 font-medium">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Single line in the "Get Started" checklist. Done state shows a green
 * check and strikes through. Undone state shows a tappable action button.
 */
function ChecklistItem({
  done, label, actionLabel, onClick,
}: { done: boolean; label: string; actionLabel: string; onClick: () => void | Promise<void> }) {
  return (
    <div className="flex items-center justify-between bg-white border notion-border rounded-md px-3 py-2.5 text-sm">
      <div className="flex items-center gap-2.5">
        <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
          done ? 'bg-green-500 text-white' : 'border-2 border-gray-300'
        }`}>
          {done && <Check className="w-3 h-3" strokeWidth={3} />}
        </div>
        <span className={done ? 'text-gray-400 line-through' : 'text-[#37352F]'}>{label}</span>
      </div>
      {!done && (
        <button
          onClick={onClick}
          className="text-xs text-[#37352F] font-medium hover:underline flex items-center gap-1"
        >
          {actionLabel} <ArrowRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
