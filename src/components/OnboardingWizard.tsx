import { useMemo, useState } from 'react';
import QRCode from 'react-qr-code';
import {
  X, ArrowRight, ArrowLeft, Check, Loader2, Printer, Smartphone, ScanLine, Sparkles,
} from 'lucide-react';
import type { Campaign, Location, OnboardingState } from '../types';
import { buildPosterHtml } from '../services/posterGenerator';

interface OnboardingWizardProps {
  campaign: Campaign;
  locations: Location[];
  initialState: OnboardingState;
  /** Called whenever a step's outcome should be saved to the server. */
  onMarkStep: (patch: Partial<OnboardingState>) => Promise<void>;
  /** Called to close the wizard (after completion or skip). */
  onClose: () => void;
}

type Step = 0 | 1 | 2 | 3;

/**
 * First-run wizard shown to brand-new merchants after signup. Walks
 * them from "what is this?" to "I've personally tested the customer
 * flow and given my first stamp" in ~3 minutes.
 *
 * Design decisions:
 *  - Skippable from every step (some merchants will explore on their own;
 *    that's fine — they'll see the dashboard checklist instead).
 *  - Each step persists its outcome to the server as soon as it's done,
 *    so closing the laptop mid-wizard doesn't lose progress.
 *  - The "test as customer" step uses the merchant's REAL QR — no fake
 *    demo data. If it works for them, they know it works for customers.
 */
export function OnboardingWizard({
  campaign,
  locations,
  initialState,
  onMarkStep,
  onClose,
}: OnboardingWizardProps) {
  const [step, setStep] = useState<Step>(0);
  const [saving, setSaving] = useState(false);

  const primaryLocation = locations.find((l) => !l.archived) ?? null;
  const joinUrl = primaryLocation
    ? `${window.location.origin}/?campaign=${campaign.id}&location=${primaryLocation.id}`
    : `${window.location.origin}/?campaign=${campaign.id}`;

  const goNext = () => setStep((s) => Math.min(3, s + 1) as Step);
  const goBack = () => setStep((s) => Math.max(0, s - 1) as Step);

  const handleSkip = async () => {
    setSaving(true);
    try {
      await onMarkStep({ wizard_dismissed: true });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      await onMarkStep({ wizard_dismissed: true });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadPoster = async (color: string) => {
    // Open the real designed pamphlet (same generator the Share tab uses),
    // tinted with the colour the merchant picked.
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups so we can open the printable poster.');
      return;
    }
    const html = buildPosterHtml({
      campaign,
      location: primaryLocation,
      size: 'pamphlet',
      posterBgOverride: color,
    });
    printWindow.document.write(html);
    printWindow.document.close();
    // Mark the step done as soon as the merchant initiates the download.
    await onMarkStep({ poster_downloaded: true });
  };

  const handleOpenCustomerView = async () => {
    window.open(joinUrl, '_blank');
    await onMarkStep({ test_signup_done: true });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wizard-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto relative">
        {/* Header */}
        <div className="sticky top-0 bg-white/95 backdrop-blur z-10 px-6 py-4 border-b notion-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? 'bg-[#37352F] w-8'
                    : i < step ? 'bg-[#37352F]/40 w-4'
                    : 'bg-gray-200 w-4'
                }`}
              />
            ))}
            <span className="ml-2 text-xs text-gray-400 font-medium">Step {step + 1} of 4</span>
          </div>
          <button
            onClick={handleSkip}
            disabled={saving}
            className="text-sm text-gray-400 hover:text-[#37352F] transition flex items-center gap-1"
          >
            Skip <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-8 py-10">
          {step === 0 && <WelcomeStep businessName={campaign.businessName} />}
          {step === 1 && (
            <PrintStep
              campaign={campaign}
              location={primaryLocation}
              alreadyDone={!!initialState.poster_downloaded}
              onDownload={handleDownloadPoster}
            />
          )}
          {step === 2 && (
            <TestStep
              alreadyDone={!!initialState.test_signup_done}
              onOpen={handleOpenCustomerView}
            />
          )}
          {step === 3 && <ScanTourStep />}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t notion-border px-6 py-4 flex items-center justify-between">
          <button
            onClick={goBack}
            disabled={step === 0 || saving}
            className="text-sm text-gray-500 hover:text-[#37352F] disabled:opacity-30 disabled:cursor-not-allowed transition flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          {step < 3 ? (
            <button
              onClick={goNext}
              disabled={saving}
              className="bg-[#37352F] text-white px-5 py-2 rounded-md font-medium text-sm hover:bg-opacity-90 transition flex items-center gap-2"
            >
              Continue <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={saving}
              className="bg-[#37352F] text-white px-5 py-2 rounded-md font-medium text-sm hover:bg-opacity-90 transition flex items-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Got it, take me to the dashboard
            </button>
          )}
        </div>

        {/* Hidden QR — referenced by the print preview window */}
        <div className="absolute -left-[9999px] top-0">
          <QRCode id="wizard-qr-code" value={joinUrl} size={160} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------

function WelcomeStep({ businessName }: { businessName: string }) {
  return (
    <div className="space-y-6 text-center">
      <div className="w-16 h-16 bg-[#F7F7F5] rounded-full mx-auto flex items-center justify-center border notion-border">
        <Sparkles className="w-7 h-7 text-[#37352F]" />
      </div>
      <div className="space-y-2">
        <h2 id="wizard-title" className="text-2xl md:text-3xl font-serif-display font-semibold">
          Welcome, {businessName}!
        </h2>
        <p className="text-gray-500 max-w-md mx-auto">
          Stampfix turns paper punch cards into a digital loyalty program that lives in your customers' phones.
        </p>
      </div>
      <div className="bg-[#F7F7F5] rounded-lg p-6 text-left space-y-3 border notion-border">
        <p className="text-sm font-semibold uppercase tracking-wider text-gray-500">Here's the flow:</p>
        <ol className="space-y-3 text-sm">
          <li className="flex gap-3">
            <span className="font-bold text-[#37352F] flex-shrink-0">1.</span>
            <span><strong>Print a QR poster</strong> — customers scan it once to sign up.</span>
          </li>
          <li className="flex gap-3">
            <span className="font-bold text-[#37352F] flex-shrink-0">2.</span>
            <span><strong>They get a digital card</strong> — saved to Apple or Google Wallet, no app to install.</span>
          </li>
          <li className="flex gap-3">
            <span className="font-bold text-[#37352F] flex-shrink-0">3.</span>
            <span><strong>You scan their card</strong> — to give a stamp when they visit.</span>
          </li>
          <li className="flex gap-3">
            <span className="font-bold text-[#37352F] flex-shrink-0">4.</span>
            <span><strong>They unlock rewards</strong> — automatic, no spreadsheet required.</span>
          </li>
        </ol>
      </div>
      <p className="text-xs text-gray-400">This will take about 3 minutes. You can skip and come back anytime.</p>
    </div>
  );
}

const POSTER_COLORS = ['#37352F', '#1D4ED8', '#047857', '#9D174D'];
const PREVIEW_SCALE = 0.34;
const PREVIEW_W = Math.round(1123 * PREVIEW_SCALE);
const PREVIEW_H = Math.round(794 * PREVIEW_SCALE);
// Strip the standalone-window chrome so only the pamphlet shows in the preview.
const PREVIEW_CSS =
  '.controls{display:none!important}' +
  '.size-card,.size-poster{display:none!important}' +
  '.size-pamphlet{margin:0!important;box-shadow:none!important;display:flex!important}' +
  'body{margin:0!important;overflow:hidden!important;background:#fff!important}';

function PrintStep({
  campaign, location, alreadyDone, onDownload,
}: {
  campaign: Campaign;
  location: Location | null;
  alreadyDone: boolean;
  onDownload: (color: string) => Promise<void>;
}) {
  const [posterColor, setPosterColor] = useState(POSTER_COLORS[0]);

  const previewHtml = useMemo(
    () =>
      buildPosterHtml({ campaign, location, size: 'pamphlet', posterBgOverride: posterColor })
        .replace('</head>', `<style>${PREVIEW_CSS}</style></head>`),
    [campaign, location, posterColor],
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <div className="w-12 h-12 bg-[#F7F7F5] rounded-full mx-auto flex items-center justify-center border notion-border mb-2">
          <Printer className="w-5 h-5 text-[#37352F]" />
        </div>
        <h2 className="text-2xl font-serif-display font-semibold">Print your join poster</h2>
        <p className="text-gray-500 text-sm max-w-md mx-auto">
          Put this by your till — customers scan the QR once to sign up. No app needed.
        </p>
      </div>

      <div className="bg-[#F7F7F5] border notion-border rounded-xl p-5 flex flex-col items-center space-y-4">
        <div
          className="rounded-lg overflow-hidden shadow-md bg-white"
          style={{ width: PREVIEW_W, height: PREVIEW_H }}
        >
          <iframe
            title="Pamphlet preview"
            srcDoc={previewHtml}
            scrolling="no"
            style={{
              width: 1123,
              height: 794,
              border: 0,
              transform: `scale(${PREVIEW_SCALE})`,
              transformOrigin: 'top left',
              pointerEvents: 'none',
            }}
          />
        </div>

        <div className="flex items-center gap-2.5">
          {POSTER_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setPosterColor(c)}
              aria-label={`Use ${c}`}
              className={`w-8 h-8 rounded-full border-2 border-white shadow-sm transition ${
                posterColor === c ? 'ring-2 ring-offset-2 ring-[#37352F] scale-110' : 'hover:scale-105'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <p className="text-xs text-gray-500 text-center max-w-xs">
          You can change the colour anytime to match your branding in Settings → Share &amp; Promote.
        </p>

        <button
          onClick={() => onDownload(posterColor)}
          className="bg-[#37352F] text-white px-5 py-2.5 rounded-md font-medium text-sm hover:bg-opacity-90 transition flex items-center gap-2"
        >
          <Printer className="w-4 h-4" /> {alreadyDone ? 'Download again' : 'Download poster (PDF)'}
        </button>
        {alreadyDone && (
          <div className="text-xs text-green-600 flex items-center gap-1">
            <Check className="w-3 h-3" /> Downloaded — you can move on
          </div>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800">
        <strong>Tip:</strong> Got multiple locations? Download a separate poster for each from Settings → Share &amp; Promote.
      </div>
    </div>
  );
}

function TestStep({
  alreadyDone, onOpen,
}: { alreadyDone: boolean; onOpen: () => Promise<void> }) {
  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <div className="w-12 h-12 bg-[#F7F7F5] rounded-full mx-auto flex items-center justify-center border notion-border mb-2">
          <Smartphone className="w-5 h-5 text-[#37352F]" />
        </div>
        <h2 className="text-2xl font-serif-display font-semibold">Try it as a customer</h2>
        <p className="text-gray-500 text-sm max-w-md mx-auto">
          The fastest way to understand your customers' experience is to live it once yourself.
        </p>
      </div>

      <div className="bg-[#F7F7F5] border notion-border rounded-lg p-6 space-y-4">
        <p className="text-sm font-semibold uppercase tracking-wider text-gray-500">What to do:</p>
        <ol className="space-y-3 text-sm">
          <li className="flex gap-3">
            <span className="font-bold text-[#37352F] flex-shrink-0">1.</span>
            <span>Click the button below to open the customer signup page in a new tab.</span>
          </li>
          <li className="flex gap-3">
            <span className="font-bold text-[#37352F] flex-shrink-0">2.</span>
            <span>Sign up with a personal email — you'll get a magic link to log in.</span>
          </li>
          <li className="flex gap-3">
            <span className="font-bold text-[#37352F] flex-shrink-0">3.</span>
            <span>You'll see your loyalty card with the rotating QR code. On iPhone, tap "Add to Apple Wallet"; on Android, "Save to Google Wallet".</span>
          </li>
        </ol>
      </div>

      <button
        onClick={onOpen}
        className="w-full bg-[#37352F] text-white py-3 rounded-md font-medium text-sm hover:bg-opacity-90 transition flex items-center justify-center gap-2"
      >
        {alreadyDone ? 'Open again' : 'Open customer signup'}  <ArrowRight className="w-4 h-4" />
      </button>

      {alreadyDone && (
        <div className="text-xs text-green-600 flex items-center justify-center gap-1">
          <Check className="w-3 h-3" /> Opened — finish the signup on that tab, then come back here
        </div>
      )}

      <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 text-xs text-amber-800">
        <strong>Note:</strong> Use a different email than the one you signed up with as a merchant. Otherwise you'll just sign back into the dashboard.
      </div>
    </div>
  );
}

function ScanTourStep() {
  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <div className="w-12 h-12 bg-[#F7F7F5] rounded-full mx-auto flex items-center justify-center border notion-border mb-2">
          <ScanLine className="w-5 h-5 text-[#37352F]" />
        </div>
        <h2 className="text-2xl font-serif-display font-semibold">Last thing — the scanner</h2>
        <p className="text-gray-500 text-sm max-w-md mx-auto">
          When a customer visits, here's how you give them a stamp.
        </p>
      </div>

      <div className="bg-[#F7F7F5] border notion-border rounded-lg p-6 space-y-4">
        <p className="text-sm font-semibold uppercase tracking-wider text-gray-500">How to stamp a customer:</p>
        <ol className="space-y-3 text-sm">
          <li className="flex gap-3">
            <span className="font-bold text-[#37352F] flex-shrink-0">1.</span>
            <span>Go to the <strong>Dashboard tab</strong> (the one you'll see when this closes).</span>
          </li>
          <li className="flex gap-3">
            <span className="font-bold text-[#37352F] flex-shrink-0">2.</span>
            <span>Tap <strong>Open Scanner</strong> — your camera turns on.</span>
          </li>
          <li className="flex gap-3">
            <span className="font-bold text-[#37352F] flex-shrink-0">3.</span>
            <span>The customer shows you their QR (from Apple Wallet, Google Wallet, or the web). Point your camera at it.</span>
          </li>
          <li className="flex gap-3">
            <span className="font-bold text-[#37352F] flex-shrink-0">4.</span>
            <span>That's it — a stamp is added. Keep scanning to stamp the next customer.</span>
          </li>
        </ol>
      </div>

      <div className="bg-green-50 border border-green-100 rounded-lg p-4 text-sm text-green-800">
        <strong>You're ready.</strong> The customer card you just made (in step 3) is real — show it to your own scanner to give yourself the first stamp.
      </div>
    </div>
  );
}
