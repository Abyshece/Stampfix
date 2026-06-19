import { useState } from 'react';
import QRCode from 'react-qr-code';
import {
  X, ArrowRight, ArrowLeft, Check, Loader2, Printer, Smartphone, ScanLine, Sparkles,
} from 'lucide-react';
import type { Campaign, Location, OnboardingState } from '../types';

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

  const handleDownloadPoster = async () => {
    // Trigger a print preview the same way the Share tab does, but
    // inline here so the wizard owns the moment.
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups so we can open the printable poster.');
      return;
    }
    const qrEl = document.getElementById('wizard-qr-code');
    const qrHtml = qrEl?.outerHTML ?? '';
    const locLine = primaryLocation
      ? `<p class="loc-line">${primaryLocation.name}</p>`
      : '';
    printWindow.document.write(`
      <html><head><title>${campaign.businessName} Poster</title>
      <style>
        @page { size: A4 portrait; margin: 0; }
        body { font-family: -apple-system, sans-serif; margin: 0; height: 100vh;
               display: flex; flex-direction: column; align-items: center;
               justify-content: center; background: white; text-align: center; }
        .poster-container { border: 8px solid #37352F; padding: 80px 100px;
                            border-radius: 40px; max-width: 80%; box-sizing: border-box; }
        h1 { font-size: 48px; color: #37352F; margin-bottom: 20px; font-weight: 800; line-height: 1.1; }
        p.subtitle { font-size: 24px; color: #666; margin-top: 0; margin-bottom: 50px; }
        .qr-box { margin: 30px auto; width: 350px; height: 350px; }
        .qr-box svg { width: 100%; height: 100%; }
        .footer-name { font-size: 32px; font-weight: 700; margin-top: 40px; color: #37352F; }
        .loc-line { font-size: 22px; color: #888; margin-top: -20px; margin-bottom: 30px; }
      </style></head><body>
        <div class="poster-container">
          <h1>Join ${campaign.businessName}</h1>
          ${locLine}
          <p class="subtitle">Scan to collect stamps &amp; rewards</p>
          <div class="qr-box">${qrHtml}</div>
          <div class="footer-name">${campaign.businessName}</div>
        </div>
        <script>window.onload = () => { setTimeout(() => window.print(), 500); };</script>
      </body></html>
    `);
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
              joinUrl={joinUrl}
              businessName={campaign.businessName}
              locationName={primaryLocation?.name ?? null}
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

function PrintStep({
  joinUrl, businessName, locationName, alreadyDone, onDownload,
}: { joinUrl: string; businessName: string; locationName: string | null; alreadyDone: boolean; onDownload: () => Promise<void> }) {
  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <div className="w-12 h-12 bg-[#F7F7F5] rounded-full mx-auto flex items-center justify-center border notion-border mb-2">
          <Printer className="w-5 h-5 text-[#37352F]" />
        </div>
        <h2 className="text-2xl font-serif-display font-semibold">Print your join QR</h2>
        <p className="text-gray-500 text-sm max-w-md mx-auto">
          Customers scan this once to sign up. Put it by your till.
        </p>
      </div>

      <div className="bg-white border notion-border rounded-lg p-6 flex flex-col items-center text-center space-y-4">
        <div className="space-y-1">
          <h3 className="font-semibold">Join {businessName}</h3>
          {locationName && <p className="text-xs text-gray-500">{locationName}</p>}
        </div>
        <div className="p-3 border-2 border-dashed border-gray-200 rounded-lg">
          <QRCode value={joinUrl} size={140} />
        </div>
        <button
          onClick={onDownload}
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
        <strong>Tip:</strong> If you have multiple locations, you can download a separate poster for each one later from Settings → Share & Promote.
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
