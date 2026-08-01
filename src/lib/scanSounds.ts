/**
 * Subtle synthesized tones for the scanner (Web Audio — no audio files).
 *
 * A stamp plays a warm 4-note C-major arpeggio; the reward-unlocking ("last")
 * stamp climbs one note higher and rings a touch longer; a redeem is the full
 * run plus a soft sparkle on top. All three share the same warm timbre and get
 * progressively happier.
 *
 * Note: iOS Safari does not route Web Audio through the ringer/mute switch, so
 * these can play even when the phone is on silent. They are deliberately quiet.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function audio(): { c: AudioContext; out: GainNode } | null {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (!master) {
      master = ctx.createGain();
      master.gain.value = 0.7; // overall level — kept subtle
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return { c: ctx, out: master };
  } catch {
    return null;
  }
}

/** One oscillator with a soft attack + exponential decay (bell/marimba envelope). */
function voice(
  c: AudioContext,
  out: GainNode,
  freq: number,
  t0: number,
  dur: number,
  peak: number,
  type: OscillatorType,
  filterHz: number | null,
): void {
  const t = c.currentTime + t0;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  let node: AudioNode = osc;
  if (filterHz) {
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = filterHz;
    osc.connect(lp);
    node = lp;
  }
  node.connect(g);
  g.connect(out);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

/** A warm note: fundamental (triangle, low-passed) + a soft octave shimmer. */
function ping(c: AudioContext, out: GainNode, freq: number, t0: number, dur: number, peak: number): void {
  voice(c, out, freq, t0, dur, peak, 'triangle', 2600);
  voice(c, out, freq * 2, t0, dur * 0.6, peak * 0.16, 'sine', null);
}

/** A buzzy, slightly harsh note (sawtooth + sub-octave) for the negative tone. */
function buzz(c: AudioContext, out: GainNode, freq: number, t0: number, dur: number, peak: number): void {
  voice(c, out, freq, t0, dur, peak, 'sawtooth', 1300);
  voice(c, out, freq / 2, t0, dur, peak * 0.55, 'square', 700);
}

export type ScanSound = 'stamp' | 'last' | 'redeem' | 'error';

/** Play the tone for a scan outcome. Safe to call anywhere; no-ops if audio is unavailable. */
export function playScanSound(kind: ScanSound): void {
  const a = audio();
  if (!a) return;
  const { c, out } = a;

  if (kind === 'error') {
    // "Wrong card" — two descending, dissonant low buzzes a tritone apart:
    // a firm, unmistakably-negative "nuh-uh".
    buzz(c, out, 220.0, 0, 0.26, 0.16);     // A3
    buzz(c, out, 155.56, 0.2, 0.52, 0.18);  // D#3 — tritone below, lower & longer
    return;
  }

  if (kind === 'stamp') {
    // C5 E5 G5 C6
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      ping(c, out, f, i * 0.075, i === 3 ? 0.4 : 0.16, 0.21),
    );
  } else if (kind === 'last') {
    // + E6, rings a little longer
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) =>
      ping(c, out, f, i * 0.07, i === 4 ? 0.52 : 0.15, 0.22),
    );
  } else {
    // full run to G6 + a high sparkle
    [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568.0].forEach((f, i) =>
      ping(c, out, f, i * 0.065, i === 5 ? 0.62 : 0.15, 0.22),
    );
    voice(c, out, 2093.0, 0.065 * 5 + 0.06, 0.6, 0.09, 'sine', null); // sparkle
  }
}
