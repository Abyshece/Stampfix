import { useState, useMemo } from 'react';
import { Palette, Check, Loader2 } from 'lucide-react';
import type { Campaign } from '../types';
import { updateCampaign } from '../lib/db';
import { buildPosterHtml } from '../services/posterGenerator';
import { useToast } from './ToastProvider';

interface PosterSettingsProps {
  campaign: Campaign;
  onUpdated: (campaign: Campaign) => void;
}

/**
 * Three named presets the merchant can pick with one click. Each is a
 * solid hex; readable on white text, looks intentional in print.
 */
const PRESETS: Array<{ id: string; label: string; value: string }> = [
  { id: 'blue',  label: 'Royal Blue',  value: '#1E40AF' },
  { id: 'green', label: 'Forest',      value: '#16A34A' },
  { id: 'red',   label: 'Crimson',     value: '#DC2626' },
];

/**
 * Default starting colors for the custom gradient picker. Picked to
 * give a pleasant default if the merchant hasn't touched it yet.
 */
const GRAD_DEFAULTS = { from: '#1E40AF', to: '#7C3AED', angle: 135 };

/**
 * Settings panel that controls poster appearance.
 *
 * Three modes the merchant can choose:
 *   1. "Match my card" - posterColor is null, posters render with primaryColor
 *   2. A preset solid color - posterColor stores the hex (e.g. '#1E40AF')
 *   3. Custom gradient - posterColor stores a CSS gradient string
 *
 * On save, we just write to campaign.poster_color. The renderer in
 * posterGenerator.ts drops the value straight into `background:`, so
 * solids and gradients are treated identically.
 */
export function PosterSettings({ campaign, onUpdated }: PosterSettingsProps) {
  const stored = campaign.posterColor;

  // Detect what kind of value is currently saved.
  const initialMode: 'white' | 'preset' | 'gradient' =
    !stored ? 'white'
    : stored.startsWith('linear-gradient') ? 'gradient'
    : 'preset';

  const [mode, setMode] = useState<'white' | 'preset' | 'gradient'>(initialMode);
  const [presetValue, setPresetValue] = useState<string>(
    initialMode === 'preset' ? stored! : PRESETS[0].value,
  );
  const [gradFrom, setGradFrom] = useState<string>(parseGradient(stored)?.from ?? GRAD_DEFAULTS.from);
  const [gradTo,   setGradTo]   = useState<string>(parseGradient(stored)?.to   ?? GRAD_DEFAULTS.to);
  const [gradAngle, setGradAngle] = useState<number>(parseGradient(stored)?.angle ?? GRAD_DEFAULTS.angle);

  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const toast = useToast();

  /** The computed value we'll save, derived from the current mode. */
  const computedValue: string | null = useMemo(() => {
    if (mode === 'white') return null;
    if (mode === 'preset') return presetValue;
    return `linear-gradient(${gradAngle}deg, ${gradFrom} 0%, ${gradTo} 100%)`;
  }, [mode, presetValue, gradFrom, gradTo, gradAngle]);

  /** What the poster background actually IS right now (white by default). */
  const previewBg = computedValue ?? '#FFFFFF';
  // Readable text colour for the preview (dark on light, white on dark).
  const previewInk = pickInk(previewBg);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateCampaign(campaign.id, { posterColor: computedValue });
      onUpdated(updated);
      setSavedAt(Date.now());
      toast.success('Poster appearance saved');
      setTimeout(() => setSavedAt(null), 3000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not save poster color';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  /** Open a new tab showing the current preview value applied to a real poster. */
  const handlePreview = (size: 'card' | 'pamphlet' | 'poster') => {
    const html = buildPosterHtml({
      campaign,
      size,
      posterBgOverride: previewBg,
    });
    const win = window.open('', '_blank');
    if (!win) {
      alert('Please allow pop-ups to preview the poster');
      return;
    }
    win.document.write(html);
    win.document.close();
  };

  return (
    <div className="bg-white rounded-lg border notion-border p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Palette className="w-5 h-5 text-gray-500" /> Poster appearance
        </h3>
        <p className="text-sm text-gray-500 mt-1">
          Pick the background color for the printable posters customers see at your counter.
        </p>
      </div>

      {/* Live preview swatch — shows the user what they're saving */}
      <div
        className="rounded-lg h-24 border notion-border flex items-center justify-center font-serif-display text-2xl font-semibold tracking-wide shadow-inner"
        style={{ background: previewBg, color: previewInk }}
      >
        SCAN &amp; SAVE
      </div>

      {/* Mode selector */}
      <div className="space-y-3">
        <ModeRow
          active={mode === 'white'}
          onClick={() => setMode('white')}
          label="White (default)"
          hint="Clean white background — recommended for print."
          swatch="#FFFFFF"
        />
        <ModeRow
          active={mode === 'preset'}
          onClick={() => setMode('preset')}
          label="Pick a preset"
          hint="Three brand-friendly solid colors."
        >
          {mode === 'preset' && (
            <div className="flex gap-3 pt-3">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPresetValue(p.value)}
                  className={`flex-1 rounded-lg h-14 border-2 transition flex items-center justify-center ${
                    presetValue === p.value ? 'border-[#37352F] ring-2 ring-[#37352F]/20' : 'border-transparent'
                  }`}
                  style={{ background: p.value }}
                  aria-label={p.label}
                >
                  {presetValue === p.value && <Check className="w-5 h-5 text-white" strokeWidth={3} />}
                </button>
              ))}
            </div>
          )}
        </ModeRow>
        <ModeRow
          active={mode === 'gradient'}
          onClick={() => setMode('gradient')}
          label="Custom gradient"
          hint="Pick any two colors and an angle."
        >
          {mode === 'gradient' && (
            <div className="grid grid-cols-2 gap-3 pt-3">
              <ColorPicker label="From" value={gradFrom} onChange={setGradFrom} />
              <ColorPicker label="To"   value={gradTo}   onChange={setGradTo} />
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium text-gray-600 flex justify-between">
                  <span>Angle</span>
                  <span className="text-gray-400">{gradAngle}°</span>
                </label>
                <input
                  type="range" min={0} max={360} step={5}
                  value={gradAngle}
                  onChange={(e) => setGradAngle(Number(e.target.value))}
                  className="w-full accent-[#37352F]"
                />
              </div>
            </div>
          )}
        </ModeRow>
      </div>

      {/* Preview links */}
      <div className="flex flex-wrap gap-2 pt-2 border-t notion-border">
        <span className="text-xs text-gray-400 self-center mr-2">Preview at full size:</span>
        <button
          onClick={() => handlePreview('card')}
          className="text-xs px-3 py-1.5 rounded-md border notion-border hover:bg-[#F7F7F5] transition"
        >
          Business card
        </button>
        <button
          onClick={() => handlePreview('pamphlet')}
          className="text-xs px-3 py-1.5 rounded-md border notion-border hover:bg-[#F7F7F5] transition"
        >
          Pamphlet
        </button>
        <button
          onClick={() => handlePreview('poster')}
          className="text-xs px-3 py-1.5 rounded-md border notion-border hover:bg-[#F7F7F5] transition"
        >
          A4 poster
        </button>
      </div>

      {/* Save */}
      <div className="flex items-center justify-between pt-2">
        <div className="text-xs">
          {savedAt ? (
            <span className="text-green-600 flex items-center gap-1">
              <Check className="w-3 h-3" /> Saved
            </span>
          ) : (
            <span className="text-gray-400">Changes apply next time you download a poster.</span>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-[#37352F] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-opacity-90 transition disabled:opacity-50 flex items-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Save
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------

function ModeRow({
  active, onClick, label, hint, swatch, children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint?: string;
  swatch?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`border rounded-lg p-3 transition ${
      active ? 'border-[#37352F]/30 bg-[#F7F7F5]' : 'notion-border bg-white'
    }`}>
      <button
        onClick={onClick}
        className="w-full flex items-center gap-3 text-left"
      >
        <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
          active ? 'border-[#37352F]' : 'border-gray-300'
        }`}>
          {active && <div className="w-2 h-2 rounded-full bg-[#37352F]" />}
        </div>
        {swatch && (
          <div className="w-6 h-6 rounded border notion-border flex-shrink-0" style={{ background: swatch }} />
        )}
        <div className="flex-1">
          <div className="text-sm font-medium">{label}</div>
          {hint && <div className="text-xs text-gray-500">{hint}</div>}
        </div>
      </button>
      {children}
    </div>
  );
}

function ColorPicker({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-600">{label}</label>
      <div className="flex gap-2 items-center">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-12 h-10 rounded border notion-border cursor-pointer"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-white border notion-border rounded-md px-2 py-1.5 text-xs font-mono uppercase"
          maxLength={7}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------

/**
 * Picks a readable text colour for a background — dark ink on light
 * backgrounds, white on dark ones. For gradients it reads the first stop.
 */
function pickInk(bg: string): string {
  const m = /#([0-9a-fA-F]{6})/.exec(bg || '');
  if (!m) return '#1A1A1A';
  const n = parseInt(m[1], 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 150 ? '#1A1A1A' : '#FFFFFF';
}

/**
 * Extracts the `from`, `to`, and `angle` from a stored gradient string.
 * Returns null if the stored value isn't a recognisable gradient.
 *
 * Supports the format we write: `linear-gradient(135deg, #1E40AF 0%, #7C3AED 100%)`.
 * Other gradient shapes return null and the picker shows defaults.
 */
function parseGradient(stored?: string | null): { from: string; to: string; angle: number } | null {
  if (!stored || !stored.startsWith('linear-gradient')) return null;
  const match = stored.match(/linear-gradient\(\s*(\d+)deg\s*,\s*(#[0-9a-f]{6})\s*0%\s*,\s*(#[0-9a-f]{6})\s*100%\s*\)/i);
  if (!match) return null;
  return {
    angle: parseInt(match[1], 10),
    from: match[2],
    to: match[3],
  };
}
