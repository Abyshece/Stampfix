import * as THREE from 'three';
import { CONFIG } from './config.js';
import { FONT_DISPLAY, FONT_UI } from './textures.js';

// Every year gets its own colour, used for its card in the wall, its ring on the pole,
// its gate in the tunnel and its dot in the year rail.
export const YEAR_COLORS = [
  '#ff8a5b', '#ffc145', '#e9ef6a', '#8be28b', '#4fd8c4',
  '#5bb4ff', '#9a8cff', '#d78bff', '#ff7eb6', '#ff6b6b',
];

const BORDER = 0.035; // white print border, as a share of the long side

// Atlas layout: each 2048px atlas holds 16 x 16 square crops of 128px.
export const ATLAS_SIZE = 2048;
export const CELL = 128;
export const PER_ROW = ATLAS_SIZE / CELL;
export const PER_ATLAS = PER_ROW * PER_ROW;
export const MAX_ATLASES = 8;
const EMPTY = '#34433d';

export function makePhoto(o) {
  return {
    ...o,
    year: o.date.getFullYear(),
    aspect: o.aspect || 1.5,
    texture: null,
    failed: false,
  };
}

// Width / height of the printed card (photo plus border).
export function cardAspect(a) {
  const w = a >= 1 ? 1 : a;
  const h = a >= 1 ? 1 / a : 1;
  return (w + 2 * BORDER) / (h + 2 * BORDER);
}

export function computeYears(photos) {
  const map = new Map();
  photos.forEach((p, i) => {
    const y = map.get(p.year) || { year: p.year, count: 0, first: i, last: i };
    y.count++;
    y.last = i;
    map.set(p.year, y);
  });
  const years = [...map.values()].sort((a, b) => a.year - b.year);
  const min = years.length ? years[0].year : 0;
  years.forEach((y) => { y.color = YEAR_COLORS[(y.year - min) % YEAR_COLORS.length]; });
  return years;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed'));
    img.src = url;
  });
}

function cardCanvas(img, maxSide) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const s = Math.min(1, maxSide / Math.max(iw, ih));
  const w = Math.max(2, Math.round(iw * s));
  const h = Math.max(2, Math.round(ih * s));
  const b = Math.round(Math.max(w, h) * BORDER);
  const c = document.createElement('canvas');
  c.width = w + 2 * b;
  c.height = h + 2 * b;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f1ea';
  g.fillRect(0, 0, c.width, c.height);
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, b, b, w, h);
  return c;
}

// A painted stand-in for a photo that would not load, so its place is never empty.
function fallbackImage(photo) {
  const W = 256;
  const H = Math.round(W / photo.aspect);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const hue = (photo.year * 47 + photo.date.getMonth() * 23) % 360;
  const grd = g.createLinearGradient(0, 0, W, H);
  grd.addColorStop(0, `hsl(${hue} 45% 38%)`);
  grd.addColorStop(1, `hsl(${(hue + 50) % 360} 50% 22%)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,255,255,.85)';
  g.font = `600 22px ${FONT_UI}`;
  g.fillText(photo.date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }), 16, H - 18);
  return c;
}

// Loads every photo once and keeps it in two forms:
//  - a 128px square crop in a shared atlas texture, for the dense photo wall;
//  - on request, a 320px print texture for close-ups and the tunnel (kept in a small cache).
export class PhotoStore {
  constructor(renderer) {
    this.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.atlases = [];
    this.atlasQueue = [];
    this.texQueue = [];
    this.active = 0;
    this.maxActive = 10;
    this.total = 0;
    this.done = 0;
    this.frame = 0;
    this.withTexture = new Set();
    this.texCap = CONFIG.maxPhotos > 1000 ? 320 : 180;
    this.lastUpload = 0;
    this.onProgress = null;
  }

  setPhotos(photos, years) {
    for (const a of this.atlases) a.texture.dispose();
    for (const p of this.withTexture) { p.texture?.dispose(); p.texture = null; }
    this.withTexture.clear();
    this.photos = photos;
    this.total = photos.length;
    this.done = 0;
    const cells = photos.length + years.length;
    const n = Math.min(MAX_ATLASES, Math.max(1, Math.ceil(cells / PER_ATLAS)));
    this.atlases = Array.from({ length: n }, () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = ATLAS_SIZE;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = EMPTY;
      ctx.fillRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = this.anisotropy;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      return { canvas, ctx, texture, dirty: false };
    });
    photos.forEach((p, k) => {
      p.cell = this.cellInfo(k);
      p.inAtlas = false;
      p.atlasLoading = false;
    });
    years.forEach((y, k) => {
      y.cell = this.cellInfo(photos.length + k);
      this.drawYearCard(y);
    });
    this.atlasQueue = photos.slice();
    this.pump();
  }

  cellInfo(k) {
    const layer = Math.min(MAX_ATLASES - 1, Math.floor(k / PER_ATLAS));
    const idx = k % PER_ATLAS;
    const col = idx % PER_ROW;
    const row = Math.floor(idx / PER_ROW);
    const inset = 2 / ATLAS_SIZE;
    const d = 1 / PER_ROW;
    // Canvas textures are flipped, so canvas row 0 sits at the top (v = 1).
    return { layer, col, row, u: col * d + inset, v: 1 - (row + 1) * d + inset, du: d - 2 * inset, dv: d - 2 * inset };
  }

  drawCell(cell, img) {
    const a = this.atlases[cell.layer];
    if (!a) return;
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const s = Math.min(iw, ih); // centre square crop
    a.ctx.imageSmoothingQuality = 'high';
    a.ctx.drawImage(img, (iw - s) / 2, (ih - s) / 2, s, s, cell.col * CELL, cell.row * CELL, CELL, CELL);
    a.dirty = true;
  }

  drawYearCard(y) {
    const a = this.atlases[y.cell.layer];
    if (!a) return;
    const g = a.ctx;
    const x = y.cell.col * CELL;
    const t = y.cell.row * CELL;
    const grd = g.createLinearGradient(x, t, x + CELL, t + CELL);
    grd.addColorStop(0, '#101815');
    grd.addColorStop(1, '#1d2a25');
    g.fillStyle = grd;
    g.fillRect(x, t, CELL, CELL);
    g.fillStyle = y.color;
    g.fillRect(x + 14, t + 92, 40, 4);
    g.fillStyle = '#ffffff';
    g.font = `400 50px ${FONT_DISPLAY}`;
    g.textBaseline = 'alphabetic';
    g.fillText(String(y.year), x + 12, t + 74);
    g.fillStyle = y.color;
    g.font = `600 13px ${FONT_UI}`;
    g.fillText(`${y.count} photo${y.count === 1 ? '' : 's'}`, x + 14, t + 116);
    a.dirty = true;
  }

  // The wall loads what is near the camera first.
  prioritize(order) {
    this.atlasQueue = order.filter((p) => !p.inAtlas && !p.atlasLoading);
    this.pump();
  }

  // Ask for the print texture of a photo; returns it once loaded.
  want(p) {
    p.lastWanted = this.frame;
    if (p.texture) return p.texture;
    if (!p.texLoading) {
      p.texLoading = true;
      this.texQueue.push(p);
      this.pump();
    }
    return null;
  }

  tick() {
    this.frame++;
    const now = performance.now();
    if (now - this.lastUpload > 180) {
      // One atlas upload at a time keeps loading smooth.
      const a = this.atlases.find((x) => x.dirty);
      if (a) {
        a.dirty = false;
        a.texture.needsUpdate = true;
        this.lastUpload = now;
      }
    }
    if (this.withTexture.size > this.texCap && this.frame % 30 === 0) {
      const old = [...this.withTexture]
        .filter((p) => p.lastWanted < this.frame - 90)
        .sort((x, y) => x.lastWanted - y.lastWanted);
      for (const p of old.slice(0, this.withTexture.size - this.texCap)) {
        p.texture.dispose();
        p.texture = null;
        this.withTexture.delete(p);
      }
    }
  }

  pump() {
    while (this.active < this.maxActive && (this.texQueue.length || this.atlasQueue.length)) {
      let p;
      let forTex = false;
      if (this.texQueue.length) {
        p = this.texQueue.pop(); // newest request first
        forTex = true;
        if (p.texture || p.lastWanted < this.frame - 60) { p.texLoading = false; continue; }
      } else {
        p = this.atlasQueue.shift();
        if (p.inAtlas || p.atlasLoading) continue;
      }
      if (!p.inAtlas) p.atlasLoading = true;
      this.active++;
      this.load(p, forTex).finally(() => {
        this.active--;
        this.pump();
      });
    }
  }

  async load(p, forTex) {
    let img;
    try {
      img = await loadImage(await p.thumbSrc());
      if (!p.aspectKnown) { p.aspect = (img.naturalWidth || 3) / (img.naturalHeight || 2); p.aspectKnown = true; }
    } catch {
      p.failed = true;
      img = fallbackImage(p);
    }
    if (!p.inAtlas && p.cell) {
      this.drawCell(p.cell, img);
      p.inAtlas = true;
      p.atlasLoading = false;
      this.done++;
      this.onProgress?.(this.done, this.total);
    }
    if ((forTex || p.lastWanted >= this.frame - 30) && !p.texture) {
      p.texture = this.toTexture(cardCanvas(img, CONFIG.thumbSize));
      this.withTexture.add(p);
    }
    p.texLoading = false;
  }

  toTexture(canvas) {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = this.anisotropy;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  }

  // Full-resolution print for the photo you are looking at closely.
  async fullTexture(p) {
    const img = await loadImage(await p.fullSrc());
    return this.toTexture(cardCanvas(img, 1600));
  }
}
