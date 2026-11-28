import * as THREE from 'three';

export const FONT_DISPLAY = '"Instrument Serif", Georgia, "Times New Roman", serif';
export const FONT_UI = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Vertical sky gradient used as scene.background (stops listed top to bottom).
export function gradientTexture(stops) {
  const [c, g] = canvas(4, 512);
  const grd = g.createLinearGradient(0, 0, 0, 512);
  stops.forEach((s, i) => grd.addColorStop(i / (stops.length - 1), s));
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 512);
  return tex(c);
}

export function glowTexture(size = 128) {
  const [c, g] = canvas(size, size);
  const r = size / 2;
  const grd = g.createRadialGradient(r, r, 0, r, r, r);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.18, 'rgba(255,255,255,.55)');
  grd.addColorStop(0.5, 'rgba(255,255,255,.12)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return tex(c);
}

// A soft halo shaped like a ring, for the tunnel's year gates.
export function ringGlowTexture(size = 256) {
  const [c, g] = canvas(size, size);
  const r = size / 2;
  const grd = g.createRadialGradient(r, r, 0, r, r, r);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.62, 'rgba(255,255,255,0)');
  grd.addColorStop(0.8, 'rgba(255,255,255,.75)');
  grd.addColorStop(0.88, 'rgba(255,255,255,.18)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return tex(c);
}

// Lumpy dust cloud built from overlapping soft blobs.
export function cloudTexture(size = 256, seed = 3) {
  const [c, g] = canvas(size, size);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 22; i++) {
    const a = rnd() * Math.PI * 2;
    const d = rnd() * size * 0.22;
    const x = size / 2 + Math.cos(a) * d;
    const y = size / 2 + Math.sin(a) * d;
    const rr = size * (0.12 + rnd() * 0.2);
    const grd = g.createRadialGradient(x, y, 0, x, y, rr);
    grd.addColorStop(0, `rgba(255,255,255,${0.16 + rnd() * 0.18})`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
  }
  return tex(c);
}

// Horizontal falloff for the glowing beam around the pole.
export function beamTexture() {
  const [c, g] = canvas(64, 4);
  const grd = g.createLinearGradient(0, 0, 64, 0);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.38, 'rgba(255,255,255,.18)');
  grd.addColorStop(0.5, 'rgba(255,255,255,.9)');
  grd.addColorStop(0.62, 'rgba(255,255,255,.18)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 4);
  return tex(c);
}

export function groundTexture() {
  const [c, g] = canvas(256, 256);
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(26,30,24,1)');
  grd.addColorStop(0.18, 'rgba(58,60,46,.9)');
  grd.addColorStop(0.32, 'rgba(30,36,30,.85)');
  grd.addColorStop(1, 'rgba(20,26,22,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  return tex(c);
}

// Year label that hangs off the pole: big year, photo count underneath.
export function poleLabelTexture(year, sub, color) {
  const [c, g] = canvas(640, 256);
  g.shadowColor = 'rgba(0,0,0,.55)';
  g.shadowBlur = 18;
  g.strokeStyle = color;
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(0, 118);
  g.lineTo(26, 118);
  g.stroke();
  g.fillStyle = '#ffffff';
  g.font = `400 164px ${FONT_DISPLAY}`;
  g.textBaseline = 'alphabetic';
  g.fillText(String(year), 40, 158);
  g.fillStyle = color;
  g.font = `600 50px ${FONT_UI}`;
  g.fillText(sub, 46, 228);
  const t = tex(c);
  return { texture: t, aspect: 640 / 256 };
}

// Large year title floating inside each tunnel gate.
export function gateLabelTexture(title, sub, color) {
  const [c, g] = canvas(1024, 440);
  g.textAlign = 'center';
  g.shadowColor = color;
  g.shadowBlur = 42;
  g.fillStyle = '#ffffff';
  g.font = `400 300px ${FONT_DISPLAY}`;
  g.fillText(String(title), 512, 300);
  g.shadowBlur = 12;
  g.shadowColor = 'rgba(0,0,0,.6)';
  g.fillStyle = color;
  g.font = `500 44px ${FONT_UI}`;
  g.fillText(sub, 512, 390);
  const t = tex(c);
  return { texture: t, aspect: 1024 / 440 };
}
