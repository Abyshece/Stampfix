import * as THREE from 'three';
import { TAU, clamp, smooth, smoothstep, mulberry, disposeGroup } from './common.js';
import { gradientTexture, glowTexture, cloudTexture, beamTexture, poleLabelTexture } from '../textures.js';

// The Tornado: one continuous cylindrical wall of photos, packed edge to edge.
// The photos run in a spiral, newest at the top, each year opening with its year card,
// and the wall keeps going: after your oldest photo it starts again from the newest.
// The whole wall turns slowly with a twisting wave, like a tornado. Click a photo to fly
// up to it (its neighbours stay around it), or step inside to stand by the pole of years.

const SIZE = 1; // tile size
const GAP = 0.055; // gap between tiles
const PITCH = SIZE + GAP;
const BORDER = 0.028; // paper border of each tile
const HALF = 18; // rows drawn above and below the camera
const SPIN = 0.05; // rad/s
const TW_A = 0.22; // twist wave
const TW_K = 0.17;
const FOCUS_NEAR = 0.95;
const FOCUS_FAR = 6.5;

const vert = /* glsl */ `
  attribute vec4 aTile;  // theta0, y, atlas layer, tile index
  attribute vec4 aCell;  // atlas u, v, du, dv
  uniform float uR, uTime, uHover, uFocus, uCamY, uHalf;
  varying vec2 vUv; varying vec4 vCell; varying float vLayer, vDist, vEdge, vHi, vShade;
  void main() {
    float th = aTile.x + ${SPIN.toFixed(3)} * uTime + ${TW_A.toFixed(3)} * sin(aTile.y * ${TW_K.toFixed(3)} + uTime * 0.23);
    vec3 nrm = vec3(cos(th), 0.0, sin(th));
    vec3 tng = vec3(sin(th), 0.0, -cos(th));
    float hi = abs(aTile.w - uHover) < 0.5 ? 1.0 : 0.0;
    float keep = abs(aTile.w - uFocus) < 0.5 ? 0.0 : 1.0;
    float s = ${SIZE.toFixed(3)} * (1.0 + 0.08 * hi) * keep;
    vec3 c = nrm * (uR + 0.12 * hi) + vec3(0.0, aTile.y, 0.0);
    vec3 p = c + tng * position.x * s + vec3(0.0, position.y * s, 0.0);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    vUv = uv; vCell = aCell; vLayer = aTile.z; vDist = -mv.z; vHi = hi;
    vEdge = smoothstep(uHalf * 0.62, uHalf * 0.98, abs(aTile.y - uCamY));
    vShade = 0.55 + 0.45 * abs(dot(nrm, normalize(cameraPosition - c)));
  }`;

const frag = /* glsl */ `
  uniform sampler2D uA0, uA1, uA2, uA3, uA4, uA5, uA6, uA7;
  uniform vec3 uFog, uPaper, uEmpty; uniform float uFogD;
  varying vec2 vUv; varying vec4 vCell; varying float vLayer, vDist, vEdge, vHi, vShade;
  vec3 atlas(float L, vec2 uv, vec2 dx, vec2 dy) {
    if (L < 0.5) return textureGrad(uA0, uv, dx, dy).rgb;
    if (L < 1.5) return textureGrad(uA1, uv, dx, dy).rgb;
    if (L < 2.5) return textureGrad(uA2, uv, dx, dy).rgb;
    if (L < 3.5) return textureGrad(uA3, uv, dx, dy).rgb;
    if (L < 4.5) return textureGrad(uA4, uv, dx, dy).rgb;
    if (L < 5.5) return textureGrad(uA5, uv, dx, dy).rgb;
    if (L < 6.5) return textureGrad(uA6, uv, dx, dy).rgb;
    return textureGrad(uA7, uv, dx, dy).rgb;
  }
  void main() {
    vec2 uv = vUv;
    if (!gl_FrontFacing) uv.x = 1.0 - uv.x; // read correctly from inside the wall too
    vec2 inner = (uv - ${BORDER.toFixed(3)}) / (1.0 - ${(2 * BORDER).toFixed(3)});
    float inside = step(0.0, inner.x) * step(inner.x, 1.0) * step(0.0, inner.y) * step(inner.y, 1.0);
    vec2 auv = vCell.xy + clamp(inner, 0.0, 1.0) * vCell.zw;
    vec2 dx = dFdx(auv);
    vec2 dy = dFdy(auv);
    vec3 col = mix(uPaper, atlas(vLayer, auv, dx, dy), inside);
    // A photo still loading shows as a plain dim tile instead of an empty frame.
    vec3 mid = atlas(vLayer, vCell.xy + vCell.zw * 0.5, vec2(0.0), vec2(0.0));
    if (distance(mid, uEmpty) < 0.004) col = uEmpty * 1.15;
    col *= vShade * (1.0 + 0.18 * vHi);
    float f = 1.0 - exp(-uFogD * uFogD * vDist * vDist);
    gl_FragColor = vec4(mix(col, uFog, max(f, vEdge)), 1.0);
    #include <colorspace_fragment>
  }`;

const V3 = () => new THREE.Vector3();
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class TornadoWorld {
  constructor(photos, years, opts = {}) {
    this.name = 'tornado';
    this.photos = photos;
    this.years = years;
    this.opts = opts;
    this.store = opts.store;
    this.reduced = opts.reducedMotion;
    this.C = opts.compact ? 34 : 44;
    this.R = (this.C * PITCH) / TAU;
    this.pickables = [];
    this.mode = 'attract';
    this.orbit = 0.4;
    this.orbitT = 0.4;
    this.psi = 0;
    this.psiT = 0;
    this.transit = 0; // seconds of soft camera flight left after a big move
    this.pitch = 0;
    this.D = this.R + 6.5;
    this.camY = 0;
    this.camYT = 0;
    this.autoplay = !this.reduced;
    this.idle = 0;
    this.flash = 0;
    this.nextFlash = 8;
    this.flashQueue = [];
    this.focusT = null; // { i, fd, inside, prevD }
    this.pushIn = 0;
    this.hoverI = -1;
    this.hoveredObj = null;
    this.timeScale = 1;
    this.baseRow = -9999;
    this.camPos = new THREE.Vector3(0, 12, 24);
    this.camLook = new THREE.Vector3(0, -6, 0);
    this._a = V3(); this._b = V3(); this._n = V3(); this._t = V3(); this._m = new THREE.Matrix4();
  }

  // ---- the wall as maths -------------------------------------------------------------

  buildSequence() {
    const desc = this.photos.slice().reverse();
    const seq = [];
    let cur = null;
    for (const p of desc) {
      if (p.year !== cur) {
        cur = p.year;
        seq.push({ kind: 'year', year: this.years.find((y) => y.year === p.year) });
      }
      seq.push({ kind: 'photo', photo: p });
    }
    this.seq = seq;
    this.L = seq.length;
    this.photoIndex = new Map();
    seq.forEach((it, k) => { if (it.kind === 'photo') this.photoIndex.set(it.photo, k); });
  }

  item(i) { return this.seq[((i % this.L) + this.L) % this.L]; }
  tileY(i) { return (-i * PITCH) / this.C; }
  theta0(i) { return (-TAU * (i % this.C)) / this.C; }
  thetaAt(i, t) { return this.theta0(i) + SPIN * t + TW_A * Math.sin(this.tileY(i) * TW_K + t * 0.23); }

  tileFrame(i, t, c, n) {
    const th = this.thetaAt(i, t);
    n.set(Math.cos(th), 0, Math.sin(th));
    c.set(n.x * this.R, this.tileY(i), n.z * this.R);
  }

  indexAtY(y) { return Math.max(0, Math.round((-y * this.C) / PITCH)); }

  // The tile nearest to a world-space point on the cylinder. Each row is twisted a little
  // differently, so neighbouring columns and rows are all checked. Points in the thin gaps
  // snap to the closest tile; null means above the top of the wall.
  tileAt(p, t) {
    const alpha = Math.atan2(p.z, p.x);
    const th0 = alpha - SPIN * t - TW_A * Math.sin(p.y * TW_K + t * 0.23);
    const j0 = Math.round((-th0 * this.C) / TAU);
    let best = null;
    let bestD = 0.62;
    for (let dj = -1; dj <= 1; dj++) {
      const j = ((((j0 + dj) % this.C) + this.C) % this.C);
      const k0 = Math.round(((-p.y * this.C) / PITCH - j) / this.C);
      for (let dk = -1; dk <= 1; dk++) {
        const i = (k0 + dk) * this.C + j;
        if (i < 0) continue;
        const dv = Math.abs(this.tileY(i) - p.y);
        const d = wrapAngle(this.thetaAt(i, t) - alpha);
        const du = Math.abs(d) * this.R;
        const m = Math.max(du, dv);
        if (m < bestD) { bestD = m; best = i; }
      }
    }
    return best;
  }

  pick(raycaster) {
    const { origin: o, direction: d } = raycaster.ray;
    const a = d.x * d.x + d.z * d.z;
    if (a < 1e-8) return null;
    const b = 2 * (o.x * d.x + o.z * d.z);
    const c = o.x * o.x + o.z * o.z - this.R * this.R;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    const t = this.engine.time;
    for (const dist of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
      if (dist <= 0) continue;
      const p = this._a.copy(o).addScaledVector(d, dist);
      if (Math.abs(p.y - this.camY) > HALF * PITCH * 0.8) continue;
      const i = this.tileAt(p, t);
      if (i === null) continue; // above the wall: look on into the far side
      if (i === this.focusT?.i) return null;
      return { distance: dist, object: { userData: { kind: 'tile', i, item: this.item(i) }, visible: true } };
    }
    return null;
  }

  // ---- building --------------------------------------------------------------------------

  mount(engine) {
    this.engine = engine;
    const { scene, camera } = engine;
    this.bg = gradientTexture(['#111b18', '#1c2925', '#26342f', '#33433b']);
    scene.background = this.bg;
    scene.fog = null;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.buildSequence();
    this.buildWall();
    this.buildPole();
    this.buildOverlays();
    this.buildDust();
    this.buildClouds();
    camera.fov = 55;
    camera.updateProjectionMatrix();
    this.resize();
  }

  buildWall() {
    const plane = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = plane.index;
    geo.setAttribute('position', plane.getAttribute('position'));
    geo.setAttribute('uv', plane.getAttribute('uv'));
    this.maxInst = (2 * HALF + 2) * this.C;
    this.aTile = new THREE.InstancedBufferAttribute(new Float32Array(this.maxInst * 4), 4);
    this.aCell = new THREE.InstancedBufferAttribute(new Float32Array(this.maxInst * 4), 4);
    this.aTile.setUsage(THREE.DynamicDrawUsage);
    this.aCell.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aTile', this.aTile);
    geo.setAttribute('aCell', this.aCell);
    geo.instanceCount = 0;
    const blank = new THREE.DataTexture(new Uint8Array([52, 67, 61, 255]), 1, 1);
    blank.needsUpdate = true;
    this.blank = blank;
    const uniforms = {
      uR: { value: this.R }, uTime: { value: 0 }, uHover: { value: -1 }, uFocus: { value: -1 },
      uCamY: { value: 0 }, uHalf: { value: HALF * PITCH },
      uFog: { value: new THREE.Color('#1f2c28') }, uFogD: { value: 0.03 }, uPaper: { value: new THREE.Color('#e9e5dc') },
      uEmpty: { value: new THREE.Color('#34433d') },
    };
    for (let k = 0; k < 8; k++) uniforms[`uA${k}`] = { value: this.store.atlases[k]?.texture || blank };
    this.wallMat = new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, side: THREE.DoubleSide });
    this.wall = new THREE.Mesh(geo, this.wallMat);
    this.wall.frustumCulled = false;
    this.group.add(this.wall);
  }

  fillWindow(baseRow) {
    const r0 = Math.max(0, baseRow - HALF);
    const r1 = baseRow + HALF;
    const T = this.aTile.array;
    const Cc = this.aCell.array;
    let n = 0;
    this.windowYears = [];
    for (let i = r0 * this.C; i < (r1 + 1) * this.C && n < this.maxInst; i++, n++) {
      const it = this.item(i);
      const cell = it.kind === 'year' ? it.year.cell : it.photo.cell;
      T[n * 4] = this.theta0(i);
      T[n * 4 + 1] = this.tileY(i);
      T[n * 4 + 2] = cell.layer;
      T[n * 4 + 3] = i;
      Cc[n * 4] = cell.u; Cc[n * 4 + 1] = cell.v; Cc[n * 4 + 2] = cell.du; Cc[n * 4 + 3] = cell.dv;
      if (it.kind === 'year') this.windowYears.push({ i, year: it.year });
    }
    this.wall.geometry.instanceCount = n;
    this.aTile.needsUpdate = true;
    this.aCell.needsUpdate = true;
  }

  buildPole() {
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 2 * HALF * PITCH + 20, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xeefcf4 }),
    );
    const beamMat = new THREE.MeshBasicMaterial({
      map: beamTexture(), color: 0xc9f5e2, transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    beamMat.userData.ownMap = true;
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2 * HALF * PITCH + 20), beamMat);
    this.group.add(core, beam);
    this.pole = core;
    this.beam = beam;

    this.labelTex = new Map();
    for (const y of this.years) this.labelTex.set(y.year, poleLabelTexture(y.year, `${y.count} photo${y.count === 1 ? '' : 's'}`, y.color));
    const glow = glowTexture();
    this.marks = Array.from({ length: 10 }, () => {
      const lm = new THREE.SpriteMaterial({ transparent: true, depthWrite: false });
      const label = new THREE.Sprite(lm);
      label.center.set(0, 0.5);
      label.userData = { kind: 'year', year: null, hover: 0 };
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.032, 8, 48), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      ring.rotation.x = Math.PI / 2;
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.scale.setScalar(1.8);
      this.group.add(label, ring, halo);
      this.pickables.push(label);
      return { label, ring, halo, y: 0, active: false };
    });
    this.marks[0].halo.material.userData.ownMap = true;
  }

  buildOverlays() {
    // The photo you fly up to is lifted off the wall as a full print, in high resolution.
    this.hero = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.hero.matrixAutoUpdate = false;
    this.hero.visible = false;
    this.hero.userData = { kind: 'hero', photo: null };
    this.group.add(this.hero);
    this.pickables.push(this.hero);
    // Its neighbours get sharper copies laid over their tiles.
    this.nbrs = Array.from({ length: 14 }, () => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      m.matrixAutoUpdate = false;
      m.visible = false;
      this.group.add(m);
      return m;
    });
  }

  buildDust() {
    const n = this.reduced ? 1000 : 2200;
    const rnd = mulberry(19);
    const pos = new Float32Array(n * 3);
    const attr = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      pos[i * 3 + 1] = (rnd() - 0.5) * 60;
      attr[i * 4] = this.R * (0.25 + rnd() * 1.6);
      attr[i * 4 + 1] = rnd() * TAU;
      attr[i * 4 + 2] = (0.12 + rnd() * 0.45) * (rnd() < 0.5 ? 1 : 1.6);
      attr[i * 4 + 3] = 0.5 + rnd() * rnd() * 2.4;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aD', new THREE.BufferAttribute(attr, 4));
    this.dustMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uScale: { value: 300 }, uCamY: { value: 0 }, uColor: { value: new THREE.Color('#e4d7b4') } },
      vertexShader: `
        attribute vec4 aD; uniform float uTime, uScale, uCamY; varying float vA;
        void main() {
          float th = aD.y + aD.z * uTime;
          float y = uCamY + mod(position.y - uCamY + 30.0, 60.0) - 30.0 + sin(uTime * 0.5 + aD.y) * 0.3;
          vec4 mv = modelViewMatrix * vec4(cos(th) * aD.x, y, sin(th) * aD.x, 1.0);
          gl_Position = projectionMatrix * mv;
          float d = -mv.z;
          gl_PointSize = aD.w * uScale / max(d, 0.5);
          vA = exp(-0.0012 * d * d) * smoothstep(0.3, 2.0, d);
        }`,
      fragmentShader: `
        uniform vec3 uColor; varying float vA;
        void main() { gl_FragColor = vec4(uColor, smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)) * vA * 0.5); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, this.dustMat);
    pts.frustumCulled = false;
    this.group.add(pts);
  }

  buildClouds() {
    const rnd = mulberry(23);
    const tex = cloudTexture();
    this.clouds = [];
    for (let i = 0; i < (this.reduced ? 14 : 28); i++) {
      const m = new THREE.SpriteMaterial({ map: tex, color: 0xc4bea4, transparent: true, opacity: 0.06 + rnd() * 0.07, depthWrite: false, rotation: rnd() * TAU });
      if (i === 0) m.userData.ownMap = true;
      const sp = new THREE.Sprite(m);
      sp.scale.setScalar(7 + rnd() * 8);
      this.group.add(sp);
      this.clouds.push({ sp, y: (rnd() - 0.5) * 50, r: this.R * (1.5 + rnd() * 0.9), th: rnd() * TAU, w: SPIN * (1 + rnd() * 2) });
    }
  }

  resize() {
    if (this.dustMat) this.dustMat.uniforms.uScale.value = this.engine.height * 0.045;
  }

  // ---- input --------------------------------------------------------------------------

  begin() {
    if (this.mode !== 'attract') return;
    this.mode = 'outside';
    this.camYT = -2.5;
    this.idle = 0;
    this.transit = 2.2;
  }

  get inEye() { return this.mode === 'eye' && !this.focusT; }

  onWheel(d, ctrl) {
    if (this.mode === 'attract') return;
    this.idle = 0;
    if (this.focusT) {
      const f = this.focusT;
      if (d < 0 && f.fd <= FOCUS_NEAR + 0.01) {
        // Keep zooming in at the closest point and the photo opens full screen.
        this.pushIn -= d;
        if (this.pushIn > 220) { this.pushIn = 0; this.openHero(); }
        return;
      }
      this.pushIn = 0;
      f.fd = clamp(f.fd * Math.exp(d * 0.0016), FOCUS_NEAR, FOCUS_FAR + 0.5);
      if (f.fd > FOCUS_FAR) this.unfocus();
      return;
    }
    if (ctrl && this.mode === 'outside') { this.onZoom(Math.exp(-d * 0.004)); return; }
    this.camYT = Math.min(this.camYT - d * 0.012, 3);
  }

  onZoom(f) {
    if (this.focusT) { this.onWheel(-Math.log(f) / 0.0016); return; }
    if (this.mode === 'outside') this.D = clamp(this.D / f, this.R + 1.8, this.R + 26);
  }

  onDrag(dx, dy) {
    if (this.mode === 'attract') return;
    this.idle = 0;
    if (this.focusT) return;
    if (this.mode === 'eye') {
      this.psi -= dx * 0.004;
      this.psiT -= dx * 0.004;
      this.pitch = clamp(this.pitch + dy * 0.003, -0.7, 0.7);
    } else {
      this.orbit += dx * 0.005;
      this.orbitT += dx * 0.005;
      this.camYT = Math.min(this.camYT + dy * 0.035, 3);
    }
  }

  onPointer() {}

  setHover(hit) {
    this.hoveredObj = hit && hit.userData.kind === 'year' ? hit : null;
    this.hoverI = hit && hit.userData.kind === 'tile' && hit.userData.item.kind === 'photo' ? hit.userData.i : -1;
  }

  setEye(on) {
    if (this.mode === 'attract') this.begin();
    if (this.focusT) this.unfocus();
    const want = on ? 'eye' : 'outside';
    if (this.mode === want) return;
    if (on) { this.psi = this.psiT = this.orbit + Math.PI; this.pitch = 0.05; } else { this.orbit = this.orbitT = this.psi + Math.PI; }
    this.mode = want;
    this.transit = 2;
    this.idle = 0;
    this.opts.onMode?.(this.mode);
  }

  nearestIndexOf(k, around) {
    // Tile indices showing sequence position k are k + n*L; take the one nearest `around`.
    const n = Math.round((around - k) / this.L);
    return Math.max(k, k + n * this.L);
  }

  flyToYear(year) {
    const k = this.seq.findIndex((it) => it.kind === 'year' && it.year.year === year);
    if (k < 0) return;
    if (this.focusT) this.unfocus();
    this.begin();
    const i = this.nearestIndexOf(k, this.indexAtY(this.camY));
    this.camYT = this.tileY(i) - 2.2;
    // Turn to face the year's card, the short way round.
    const th = this.thetaAt(i, this.engine.time + 1.5);
    this.orbitT = this.orbit + wrapAngle(th - this.orbit);
    this.psiT = this.psi + wrapAngle(th - this.psi);
    this.idle = -4;
  }

  onYearClick(year) {
    this.flyToYear(year);
    if (this.mode !== 'eye') this.setEye(true);
  }

  // Fly up to a tile so it fills the middle of the view with its neighbours around it.
  focusTile(i) {
    const it = this.item(i);
    if (it.kind === 'year') { this.flyToYear(it.year.year); return; }
    this.begin();
    const inside = this.mode === 'eye';
    const asp = this.engine.camera.aspect;
    const fd = this.focusT ? this.focusT.fd : 2.6 * (asp < 1 ? Math.min(1.8, 1 / Math.pow(asp, 0.7)) : 1);
    if (!this.focusT) { this.prevD = this.D; this.transit = 2; }
    this.focusT = { i, fd, inside };
    this.pushIn = 0;
    this.idle = 0;
    this.setHero(it.photo);
    this.opts.onFocus?.(it.photo);
  }

  step(dx, dy) {
    if (!this.focusT) return false;
    const dir = dx !== 0 ? dx * (this.focusT.inside ? -1 : 1) : dy * this.C;
    let j = this.focusT.i + dir;
    if (j >= 0 && this.item(j).kind === 'year') j += dir;
    if (j < 0) return true;
    this.focusTile(j);
    return true;
  }

  unfocus() {
    const f = this.focusT;
    if (!f) return;
    const th = this.thetaAt(f.i, this.engine.time);
    this.camYT = this.tileY(f.i);
    if (f.inside) this.psi = this.psiT = th;
    else { this.orbit = this.orbitT = th; this.D = Math.max(this.prevD ?? this.R + 6.5, this.R + 5); }
    this.focusT = null;
    this.transit = 2;
    this.setHero(null);
    this.idle = 0;
    this.opts.onFocus?.(null);
  }

  setHero(photo) {
    if (this.heroPhoto === photo) return;
    this.heroPhoto = photo;
    this.hero.userData.photo = photo;
    if (this.heroHD) { this.heroHD.dispose(); this.heroHD = null; }
    this.hero.material.map = null;
    this.hero.material.needsUpdate = true;
    if (!photo) return;
    const token = (this.heroToken = (this.heroToken || 0) + 1);
    this.store.fullTexture(photo).then((t) => {
      if (token !== this.heroToken) { t.dispose(); return; }
      this.heroHD = t;
    }).catch(() => {});
  }

  openHero() {
    if (!this.heroPhoto) return;
    this.opts.onOpen?.(this.heroPhoto, this.hero);
  }

  // Keep the 3D focus in step with the full-screen viewer as you page through photos.
  onViewerShow(photo) {
    this.hero.userData.hiddenByViewer = true;
    if (this.heroPhoto === photo) return;
    const k = this.photoIndex.get(photo);
    if (k === undefined) return;
    const around = this.focusT ? this.focusT.i : this.indexAtY(this.camY);
    this.focusTile(this.nearestIndexOf(k, around));
  }

  onViewerClose() { this.hero.userData.hiddenByViewer = false; }

  meshFor(photo) { return this.heroPhoto === photo ? this.hero : null; }

  currentYear() {
    const i = this.focusT ? this.focusT.i : this.indexAtY(this.camY - 0.5);
    const it = this.item(i);
    return it.kind === 'year' ? it.year.year : it.photo.year;
  }

  speed() { return 0.4; }

  priorityOrder() {
    const center = this.focusT ? this.focusT.i : this.indexAtY(this.mode === 'attract' ? 0 : this.camYT);
    const seen = new Set();
    const out = [];
    const span = (HALF + 8) * this.C;
    for (let d = 0; d <= span; d++) {
      for (const i of d ? [center + d, center - d] : [center]) {
        if (i < 0) continue;
        const it = this.item(i);
        if (it.kind === 'photo' && !seen.has(it.photo)) { seen.add(it.photo); out.push(it.photo); }
      }
    }
    for (const p of this.photos) if (!seen.has(p)) out.push(p);
    return out;
  }

  // ---- frame ----------------------------------------------------------------------------

  placeOverlay(mesh, i, t, inside, lift, sx, sy) {
    this.tileFrame(i, t, this._a, this._n);
    const side = inside ? -1 : 1;
    const X = this._t.set(this._n.z, 0, -this._n.x).multiplyScalar(side);
    const Z = this._b.copy(this._n).multiplyScalar(side);
    const Y = new THREE.Vector3(0, 1, 0);
    this._m.makeBasis(X, Y, Z).scale(new THREE.Vector3(sx, sy, 1));
    this._m.setPosition(this._a.addScaledVector(Z, lift));
    mesh.matrix.copy(this._m);
    mesh.matrixWorldNeedsUpdate = true;
  }

  cropToSquare(mesh, tex) {
    if (mesh.userData.tex === tex) return;
    mesh.userData.tex = tex;
    const w = tex.image.width;
    const h = tex.image.height;
    const b = 0.0327 * Math.max(w, h);
    const iw = w - 2 * b;
    const ih = h - 2 * b;
    const s = Math.min(iw, ih);
    const sx = b + (iw - s) / 2;
    const sy = b + (ih - s) / 2;
    const u0 = sx / w, u1 = (sx + s) / w, v0 = 1 - (sy + s) / h, v1 = 1 - sy / h;
    const uv = mesh.geometry.getAttribute('uv');
    uv.array.set([u0, v1, u1, v1, u0, v0, u1, v0]);
    uv.needsUpdate = true;
    mesh.material.map = tex;
    mesh.material.needsUpdate = true;
  }

  update(dt, wdt, time) {
    const cam = this.engine.camera;
    const f = this.focusT;
    this.idle += dt;
    this.timeScale = f ? 0 : 1;

    if (this.autoplay && this.idle > 5 && this.mode !== 'attract' && !f) this.camYT -= 0.45 * dt;
    if (!f) {
      if (this.mode === 'attract') this.orbitT += dt * 0.05;
      else if (this.mode === 'outside') this.orbitT += dt * 0.02;
      else if (this.idle > 3) this.psiT += dt * 0.025;
    }
    this.orbit += wrapAngle(this.orbitT - this.orbit) * (1 - Math.exp(-2.2 * dt));
    this.psi += wrapAngle(this.psiT - this.psi) * (1 - Math.exp(-2.2 * dt));
    this.transit = Math.max(0, this.transit - dt);
    this.camY = smooth(this.camY, f ? this.tileY(f.i) : this.camYT, 2.4, dt);

    // Where the camera wants to be.
    const want = this._a;
    const look = this._b;
    if (f) {
      this.tileFrame(f.i, time, look, this._n);
      want.copy(look).addScaledVector(this._n, f.inside ? -f.fd : f.fd);
      want.y += 0.05;
    } else if (this.mode === 'eye') {
      const dx = Math.cos(this.psi);
      const dz = Math.sin(this.psi);
      want.set(-dx * this.R * 0.42, this.camY, -dz * this.R * 0.42);
      look.set(dx * this.R, this.camY + Math.sin(this.pitch) * this.R * 1.3, dz * this.R);
    } else if (this.mode === 'outside') {
      const k = cam.aspect < 1 ? Math.min(1.7, 1 / Math.pow(cam.aspect, 0.65)) : 1;
      const D = this.R + (this.D - this.R) * k;
      want.set(Math.cos(this.orbit) * D, this.camY + 0.9, Math.sin(this.orbit) * D);
      look.set(0, this.camY - 0.3, 0);
    } else {
      const far = cam.aspect < 1 ? 1.4 : 1;
      want.set(Math.cos(this.orbit) * 21 * far, 10 * far, Math.sin(this.orbit) * 21 * far);
      look.set(0, -9, 0);
    }
    const rate = this.transit > 0 ? (f ? 3.2 : 2.4) : 10;
    this.camPos.lerp(want, 1 - Math.exp(-rate * dt));
    this.camLook.lerp(look, 1 - Math.exp(-Math.min(rate * 1.4, 12) * dt));
    cam.position.copy(this.camPos);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.camLook);
    cam.updateMatrixWorld();

    // The visible stretch of the endless wall.
    const base = Math.max(0, Math.floor(-this.camY / PITCH));
    if (base !== this.baseRow) { this.baseRow = base; this.fillWindow(base); }
    const u = this.wallMat.uniforms;
    u.uTime.value = time;
    u.uCamY.value = this.camY;
    u.uHover.value = f ? -1 : this.hoverI;
    u.uFocus.value = f ? f.i : -1;
    for (let k = 0; k < 8; k++) u[`uA${k}`].value = this.store.atlases[k]?.texture || this.blank;

    // Close-up: lifted print plus sharper neighbours.
    this.updateOverlays(time);

    this.dustMat.uniforms.uTime.value = time;
    this.dustMat.uniforms.uCamY.value = this.camY;
    for (const c of this.clouds) {
      const th = c.th + c.w * time;
      const y = this.camY + ((((c.y - this.camY) % 50) + 75) % 50) - 25;
      c.sp.position.set(Math.cos(th) * c.r, y, Math.sin(th) * c.r);
    }

    // Pole, its glow and the year markers along it.
    const len = 2 * HALF * PITCH + 20;
    const top = Math.min(this.camY + len / 2, 6);
    const k = Math.max(0.05, (top - (this.camY - len / 2)) / len);
    this.pole.scale.y = this.beam.scale.y = k;
    this.pole.position.y = this.beam.position.y = top - (len * k) / 2;
    this.beam.rotation.y = Math.atan2(cam.position.x, cam.position.z);
    const right = this._t.setFromMatrixColumn(cam.matrixWorld, 0);
    const years = this.windowYears || [];
    this.marks.forEach((m, k) => {
      const wy = years[k];
      m.active = Boolean(wy);
      m.label.visible = m.ring.visible = m.halo.visible = m.active;
      if (!wy) return;
      const y = this.tileY(wy.i) + 0.4;
      const yr = wy.year;
      if (m.label.userData.year !== yr.year) {
        const t = this.labelTex.get(yr.year);
        m.label.material.map = t.texture;
        m.label.material.needsUpdate = true;
        m.label.userData.year = yr.year;
        m.label.userData.aspect = t.aspect;
        m.ring.material.color.set(yr.color);
        m.halo.material.color.set(yr.color);
      }
      const ud = m.label.userData;
      ud.hover = smooth(ud.hover, this.hoveredObj === m.label ? 1 : 0, 10, dt);
      const near = 1 - smoothstep(9, 16, Math.abs(y - this.camY));
      const close = smoothstep(2.5, 5, cam.position.distanceTo(m.label.position));
      m.label.material.opacity = (0.2 + 0.8 * near) * close;
      m.halo.material.opacity = close;
      const s = 1.3 * (1 + 0.15 * ud.hover);
      m.label.scale.set(s * ud.aspect, s, 1);
      m.label.position.set(right.x * 0.3, y, right.z * 0.3);
      m.ring.position.y = y;
      m.halo.position.y = y;
    });

    if (!this.reduced) {
      this.nextFlash -= dt;
      if (this.nextFlash <= 0 && !f) {
        this.flashQueue.push(0, 0.11, 0.26);
        this.nextFlash = 12 + Math.random() * 18;
      }
      for (let k = this.flashQueue.length - 1; k >= 0; k--) {
        this.flashQueue[k] -= dt;
        if (this.flashQueue[k] <= 0) { this.flash = 0.6 + Math.random() * 0.4; this.flashQueue.splice(k, 1); }
      }
      this.flash *= Math.exp(-dt * 9);
    }
  }

  updateOverlays(time) {
    const f = this.focusT;
    const store = this.store;
    let used = 0;
    if (f) {
      const p = this.heroPhoto;
      const tex = this.heroHD || store.want(p);
      this.hero.visible = Boolean(tex) && !this.hero.userData.hiddenByViewer;
      if (tex) {
        if (this.hero.material.map !== tex) { this.hero.material.map = tex; this.hero.material.needsUpdate = true; }
        const a = tex.image.width / tex.image.height;
        const L = 1.42;
        this.placeOverlay(this.hero, f.i, time, f.inside, 0.22, a >= 1 ? L : L * a, a >= 1 ? L / a : L);
      } else {
        // Until the print arrives, show the tile itself.
        this.wallMat.uniforms.uFocus.value = -1;
      }
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          if (!dr && !dc) continue;
          const j = f.i + dc + dr * this.C;
          if (j < 0 || used >= this.nbrs.length) continue;
          const it = this.item(j);
          if (it.kind !== 'photo') continue;
          const t = store.want(it.photo);
          if (!t) continue;
          const m = this.nbrs[used++];
          this.cropToSquare(m, t);
          const s = SIZE * (1 - 2 * BORDER);
          this.placeOverlay(m, j, time, f.inside, 0.004, s, s);
          m.visible = true;
        }
      }
    } else {
      this.hero.visible = false;
    }
    for (let k = used; k < this.nbrs.length; k++) this.nbrs[k].visible = false;
  }

  dispose() {
    this.setHero(null);
    this.blank.dispose();
    for (const t of this.labelTex.values()) t.texture.dispose();
    disposeGroup(this.group);
    this.bg.dispose();
  }
}
