// Full-screen photo viewer. A photo flies out of the 3D world into a print you can
// zoom and pan; zooming back out past the edge returns you to the vortex.

const FMT_DATE = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const FMT_TIME = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const EASE = 'cubic-bezier(.2,.85,.25,1)';

export class Viewer {
  constructor(root, hooks) {
    this.root = root;
    this.hooks = hooks; // { list(), getRect(photo), onShow(photo), onClose() }
    this.frame = root.querySelector('.v-frame');
    this.img = root.querySelector('.v-img');
    this.dateEl = root.querySelector('.v-date');
    this.metaEl = root.querySelector('.v-meta');
    this.isOpen = false;
    this.photo = null;
    this.z = { s: 1, x: 0, y: 0 };
    this.pointers = new Map();
    this.outPull = 0;
    this.token = 0;
    this.bind();
  }

  bind() {
    const r = this.root;
    r.querySelector('.v-backdrop').addEventListener('click', () => this.close());
    r.querySelector('.v-close').addEventListener('click', () => this.close());
    r.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const a = b.dataset.act;
      if (a === 'prev') this.step(-1);
      if (a === 'next') this.step(1);
      if (a === 'zoomin') this.zoomBy(1.6);
      if (a === 'zoomout') this.zoomBy(1 / 1.6);
    }));
    this.frame.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    r.addEventListener('wheel', (e) => { if (e.target === r || e.target.classList.contains('v-backdrop')) this.onWheel(e); }, { passive: false });
    this.frame.addEventListener('pointerdown', (e) => this.onDown(e));
    this.frame.addEventListener('pointermove', (e) => this.onMove(e));
    this.frame.addEventListener('pointerup', (e) => this.onUp(e));
    this.frame.addEventListener('pointercancel', (e) => this.onUp(e));
    this.frame.addEventListener('dblclick', (e) => {
      if (this.z.s > 1.05) this.setZoom(1, 0, 0, true);
      else this.zoomAt(e.clientX, e.clientY, 2.6, true);
    });
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.key === 'Escape') this.close();
      else if (e.key === 'ArrowLeft') this.step(-1);
      else if (e.key === 'ArrowRight') this.step(1);
      else if (e.key === '+' || e.key === '=') this.zoomBy(1.6);
      else if (e.key === '-') this.zoomBy(1 / 1.6);
      else return;
      e.preventDefault();
    });
    window.addEventListener('resize', () => { if (this.isOpen) this.layout(); });
  }

  fitRect(aspect) {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const gutter = Math.max(20, W * 0.04);
    const top = W < 640 ? 64 : 76;
    const bottom = W < 640 ? 150 : 120;
    const b = Math.round(Math.min(12, Math.max(6, W * 0.009)));
    const availW = W - gutter * 2;
    const availH = H - top - bottom;
    const iw = Math.max(40, Math.min(availW - 2 * b, (availH - 2 * b) * aspect));
    const ih = iw / aspect;
    const w = iw + 2 * b;
    const h = ih + 2 * b;
    return { left: (W - w) / 2, top: top + (availH - h) / 2, width: w, height: h, border: b };
  }

  layout() {
    const r = this.fitRect(this.photo.aspect);
    Object.assign(this.frame.style, {
      left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, borderWidth: `${r.border}px`,
    });
    this.rect = r;
    return r;
  }

  async open(photo, fromRect) {
    this.isOpen = true;
    this.root.hidden = false;
    this.root.getBoundingClientRect();
    this.root.classList.add('is-open');
    this.setPhoto(photo);
    const to = this.layout();
    this.flip(fromRect, to, false);
  }

  flip(fromRect, to, reverse, done) {
    const f = this.frame;
    const T = (r) => {
      const sx = r.width / to.width;
      const sy = r.height / to.height;
      return `translate(${r.left - to.left}px, ${r.top - to.top}px) scale(${sx}, ${sy})`;
    };
    const small = { left: to.left + to.width * 0.3, top: to.top + to.height * 0.3, width: to.width * 0.4, height: to.height * 0.4 };
    const from = fromRect || small;
    f.style.transition = 'none';
    f.style.opacity = reverse ? '1' : (fromRect ? '1' : '0');
    f.style.transform = reverse ? 'none' : T(from);
    f.getBoundingClientRect();
    const dur = reverse ? 0.6 : 0.75;
    f.style.transition = `transform ${dur}s ${EASE}, opacity ${dur * 0.6}s ease`;
    f.style.transform = reverse ? T(from) : 'none';
    f.style.opacity = reverse ? (fromRect ? '1' : '0') : '1';
    if (done) {
      let fired = false;
      const end = () => { if (!fired) { fired = true; done(); } };
      f.addEventListener('transitionend', end, { once: true });
      setTimeout(end, dur * 1000 + 80);
    }
  }

  setPhoto(photo) {
    this.photo = photo;
    const token = ++this.token;
    this.setZoom(1, 0, 0, false);
    this.img.removeAttribute('src');
    photo.thumbSrc().then((u) => { if (token === this.token && !this.img.src) this.img.src = u; }).catch(() => {});
    const list = this.hooks.list();
    const idx = list.indexOf(photo);
    this.dateEl.textContent = FMT_DATE.format(photo.date);
    const bits = [FMT_TIME.format(photo.date), photo.name];
    if (photo.isVideo) bits.push('video, still frame');
    bits.push(`${idx + 1} of ${list.length}`);
    this.metaEl.textContent = bits.join('   ');
    this.root.style.setProperty('--year', this.hooks.colorOf?.(photo) || '#fff');
    this.hooks.onShow?.(photo);
    photo.fullSrc()
      .then((u) => new Promise((res, rej) => {
        const im = new Image();
        im.crossOrigin = 'anonymous';
        im.onload = () => res(u);
        im.onerror = rej;
        im.src = u;
      }))
      .then((u) => { if (token === this.token) this.img.src = u; })
      .catch(() => {});
  }

  step(dir) {
    if (!this.isOpen) return;
    const list = this.hooks.list();
    const i = list.indexOf(this.photo) + dir;
    if (i < 0 || i >= list.length) return;
    const f = this.frame;
    f.style.transition = 'opacity .16s ease, transform .16s ease';
    f.style.opacity = '0';
    f.style.transform = `translateX(${dir * -24}px)`;
    setTimeout(() => {
      this.setPhoto(list[i]);
      this.layout();
      f.style.transition = 'none';
      f.style.transform = `translateX(${dir * 24}px)`;
      f.getBoundingClientRect();
      f.style.transition = `opacity .3s ease, transform .45s ${EASE}`;
      f.style.opacity = '1';
      f.style.transform = 'none';
    }, 170);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.token++;
    this.setZoom(1, 0, 0, true);
    this.root.classList.remove('is-open');
    const rect = this.hooks.getRect(this.photo);
    this.flip(rect, this.rect, true, () => {
      this.root.hidden = true;
      this.frame.style.transform = 'none';
      this.hooks.onClose?.(this.photo);
    });
  }

  // ---- zoom & pan ------------------------------------------------------------

  setZoom(s, x, y, animate) {
    const r = this.rect;
    if (r && s >= 1) {
      const mx = ((s - 1) * r.width) / 2 + 40;
      const my = ((s - 1) * r.height) / 2 + 40;
      x = Math.max(-mx, Math.min(mx, x));
      y = Math.max(-my, Math.min(my, y));
    } else {
      x = 0; y = 0;
    }
    this.z = { s, x, y };
    this.img.style.transition = animate ? `transform .35s ${EASE}` : 'none';
    this.img.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    this.root.classList.toggle('is-zoomed', s > 1.02);
  }

  zoomAt(cx, cy, s, animate) {
    const r = this.rect;
    const ox = cx - (r.left + r.width / 2);
    const oy = cy - (r.top + r.height / 2);
    const k = s / this.z.s;
    this.setZoom(s, ox - (ox - this.z.x) * k, oy - (oy - this.z.y) * k, animate);
  }

  zoomBy(k) {
    const r = this.rect;
    const s = Math.min(8, Math.max(1, this.z.s * k));
    this.zoomAt(r.left + r.width / 2, r.top + r.height / 2, s, true);
  }

  onWheel(e) {
    e.preventDefault();
    if (!this.isOpen) return;
    const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    if (this.z.s <= 1.001 && d > 0) {
      // Pulling out past the photo takes you back into the vortex.
      this.outPull += d;
      const k = Math.max(0.8, 1 - this.outPull / 900);
      this.img.style.transition = 'transform .12s linear';
      this.img.style.transform = `scale(${k})`;
      clearTimeout(this.pullTimer);
      this.pullTimer = setTimeout(() => { this.outPull = 0; this.setZoom(1, 0, 0, true); }, 260);
      if (this.outPull > 180) { this.outPull = 0; this.close(); }
      return;
    }
    this.outPull = 0;
    const s = Math.min(8, Math.max(1, this.z.s * Math.exp(-d * 0.0018)));
    this.zoomAt(e.clientX, e.clientY, s, false);
  }

  onDown(e) {
    this.frame.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.gesture = { x: e.clientX, y: e.clientY, z: { ...this.z }, dist: this.pinchDist(), t: performance.now() };
  }

  pinchDist() {
    const p = [...this.pointers.values()];
    if (p.length < 2) return 0;
    return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
  }

  onMove(e) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = this.gesture;
    if (!g) return;
    if (this.pointers.size >= 2) {
      const d = this.pinchDist();
      if (!g.dist) { g.dist = d; g.z = { ...this.z }; return; }
      const p = [...this.pointers.values()];
      const s = g.z.s * (d / g.dist);
      if (s < 0.82) { this.pointers.clear(); this.gesture = null; this.close(); return; }
      this.zoomAt((p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2, Math.min(8, Math.max(1, s)), false);
      return;
    }
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (this.z.s > 1.02) this.setZoom(this.z.s, g.z.x + dx, g.z.y + dy, false);
    else {
      this.frame.style.transition = 'none';
      this.frame.style.transform = `translate(${dx * 0.6}px, ${Math.max(0, dy) * 0.6}px)`;
    }
  }

  onUp(e) {
    this.pointers.delete(e.pointerId);
    const g = this.gesture;
    if (this.pointers.size > 0) return;
    this.gesture = null;
    if (!g || this.z.s > 1.02 || !this.isOpen) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    this.frame.style.transition = `transform .35s ${EASE}`;
    this.frame.style.transform = 'none';
    if (dy > 110 && Math.abs(dy) > Math.abs(dx)) this.close();
    else if (dx < -70) this.step(1);
    else if (dx > 70) this.step(-1);
  }
}
