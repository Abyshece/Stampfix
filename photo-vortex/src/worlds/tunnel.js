import * as THREE from 'three';
import {
  TAU, clamp, clamp01, smooth, smoothstep, easeInOut, mulberry,
  makePhotoMesh, sizeMesh, tickPhotoMesh, disposeGroup,
} from './common.js';
import { gradientTexture, ringGlowTexture, glowTexture, gateLabelTexture } from '../textures.js';

// The Time Tunnel: fly forward through a winding tunnel lined with your photos,
// oldest first. Every year is a glowing gate you pass through; the tunnel ends today.

const K = 8; // photos per ring
const RING = 2.2; // distance between rings
const GAP = 9; // extra room around each year gate
const WALL = 5.6;
const CRUISE = 1.7;
const UP = new THREE.Vector3(0, 1, 0);

export class TunnelWorld {
  constructor(photos, years, opts = {}) {
    this.name = 'tunnel';
    this.photos = photos;
    this.years = years;
    this.opts = opts;
    this.reduced = opts.reducedMotion;
    this.pickables = [];
    this.slots = [];
    this.gates = [];
    this.autoplay = !this.reduced;
    this.s = 2;
    this.v = 0;
    this.fly = null;
    this.clock = 0;
    this.endWait = 0;
    this.px = 0; this.py = 0; this.tpx = 0; this.tpy = 0;
    this.fov = 60;
    this.flash = 0;
    this.hovered = null;
    this.focused = null;
    this._f = { p: new THREE.Vector3(), t: new THREE.Vector3(), n: new THREE.Vector3(), b: new THREE.Vector3() };
    this._g = { p: new THREE.Vector3(), t: new THREE.Vector3(), n: new THREE.Vector3(), b: new THREE.Vector3() };
    this._look = new THREE.Vector3();
  }

  mount(engine) {
    this.engine = engine;
    const { scene } = engine;
    this.bg = gradientTexture(['#03050b', '#070b1a', '#0b1228', '#070b1a']);
    scene.background = this.bg;
    scene.fog = new THREE.FogExp2(0x060914, 0.042);
    this.group = new THREE.Group();
    scene.add(this.group);
    this.layout();
    this.buildPath();
    this.placeSlots();
    this.buildGates();
    this.buildWall();
    this.buildStreaks();
    this.resize();
  }

  layout() {
    const rnd = mulberry(11);
    const N = this.photos.length;
    const slots = Math.max(N, 96);
    let s = 16;
    let inRing = 0;
    let ring = 0;
    let cur = null;
    for (let i = 0; i < slots; i++) {
      const photo = this.photos[Math.min(N - 1, Math.floor((i * N) / slots))];
      if (photo.year !== cur) {
        if (cur !== null) s += RING;
        const yr = this.years.find((y) => y.year === photo.year);
        this.gates.push({ year: photo.year, s, color: yr?.color || '#ffffff', count: yr?.count || 0 });
        s += GAP * 0.55;
        inRing = 0;
        ring++;
        cur = photo.year;
      } else if (inRing >= K) {
        s += RING;
        inRing = 0;
        ring++;
      }
      const mesh = makePhotoMesh(photo);
      sizeMesh(mesh, 1.3 + rnd() * 0.35);
      this.group.add(mesh);
      this.pickables.push(mesh);
      this.slots.push({
        photo,
        mesh,
        s: s + (rnd() - 0.5) * 0.7,
        phi: (inRing / K) * TAU + ring * 0.45 + (rnd() - 0.5) * 0.25,
        rad: 3.1 + rnd() * 0.75,
        phase: rnd() * TAU,
        c: new THREE.Vector3(), n: new THREE.Vector3(), b: new THREE.Vector3(), look: new THREE.Vector3(),
      });
      inRing++;
    }
    this.endS = s + 16;
    this.length = this.endS + 40;
  }

  buildPath() {
    const pts = [];
    const step = 16;
    const n = Math.ceil(this.length / step) + 3;
    for (let k = 0; k < n; k++) {
      pts.push(new THREE.Vector3(Math.sin(k * 0.55) * 4.5 + Math.sin(k * 0.23) * 3, Math.cos(k * 0.41) * 2.6, -k * step));
    }
    this.curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    this.curve.arcLengthDivisions = n * 24;
    this.total = this.curve.getLength();
  }

  frameAt(s, out) {
    const u = clamp(s / this.total, 0, 1);
    this.curve.getPointAt(u, out.p);
    this.curve.getTangentAt(u, out.t);
    out.n.copy(UP).addScaledVector(out.t, -out.t.dot(UP)).normalize();
    out.b.crossVectors(out.t, out.n);
    return out;
  }

  placeSlots() {
    const f = this._f;
    const g = this._g;
    for (const sl of this.slots) {
      this.frameAt(sl.s, f);
      sl.c.copy(f.p);
      sl.n.copy(f.n);
      sl.b.copy(f.b);
      // Each print turns toward the traveller coming down the tunnel.
      this.frameAt(sl.s - 7, g);
      sl.look.copy(g.p);
    }
  }

  buildGates() {
    const f = this._f;
    const ringTex = ringGlowTexture();
    for (const g of this.gates) {
      this.frameAt(g.s, f);
      const color = new THREE.Color(g.color);
      const ahead = f.p.clone().add(f.t);
      const behind = f.p.clone().sub(f.t);

      const torus = new THREE.Mesh(new THREE.TorusGeometry(WALL - 1.2, 0.05, 8, 120), new THREE.MeshBasicMaterial({ color }));
      torus.position.copy(f.p);
      torus.lookAt(ahead);

      const hm = new THREE.MeshBasicMaterial({ map: ringTex, color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(2 * WALL + 1.5, 2 * WALL + 1.5), hm);
      halo.position.copy(f.p);
      halo.lookAt(ahead);

      const { texture, aspect } = gateLabelTexture(g.year, `${g.count} photo${g.count === 1 ? '' : 's'}`, g.color);
      const lm = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, fog: false, opacity: 0 });
      lm.userData.ownMap = true;
      const label = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 6.2 / aspect), lm);
      label.position.copy(f.p);
      label.lookAt(behind);
      label.userData = { kind: 'year', year: g.year };

      this.group.add(torus, halo, label);
      this.pickables.push(label);
      Object.assign(g, { torus, halo, label });
    }
    hmUserDataOwn(this.gates[0]?.halo);

    // Today, at the end of the tunnel.
    this.frameAt(this.endS, f);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xfff6e0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    glow.material.userData.ownMap = true;
    glow.scale.setScalar(16);
    glow.position.copy(f.p).addScaledVector(f.t, 3);
    const { texture, aspect } = gateLabelTexture('Today', 'Click to fly back to the start', '#ffe7a8');
    const em = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, fog: false, opacity: 0 });
    em.userData.ownMap = true;
    const endLabel = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 6.2 / aspect), em);
    endLabel.position.copy(f.p);
    endLabel.lookAt(f.p.clone().sub(f.t));
    endLabel.userData = { kind: 'restart' };
    this.group.add(glow, endLabel);
    this.pickables.push(endLabel);
    this.endLabel = endLabel;
  }

  buildWall() {
    const segs = Math.floor(this.total / 1.5);
    const geo = new THREE.TubeGeometry(this.curve, segs, WALL, 24, false);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color('#7cc4ff') }, uRepeat: { value: new THREE.Vector2(this.total / 3, 24) } },
      vertexShader: `
        varying vec2 vUv; varying float vD;
        void main() {
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vD = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uColor; uniform vec2 uRepeat; varying vec2 vUv; varying float vD;
        void main() {
          vec2 c = vUv * uRepeat;
          vec2 gr = abs(fract(c - 0.5) - 0.5) / fwidth(c);
          float line = 1.0 - min(min(gr.x, gr.y), 1.0);
          float fade = smoothstep(75.0, 6.0, vD);
          gl_FragColor = vec4(uColor, line * fade * 0.16);
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.group.add(new THREE.Mesh(geo, mat));
  }

  buildStreaks() {
    const rnd = mulberry(5);
    const n = Math.floor(this.total * (this.reduced ? 1.2 : 2.6));
    const pos = new Float32Array(n * 6);
    const dir = new Float32Array(n * 6);
    const end = new Float32Array(n * 2);
    const f = this._f;
    for (let i = 0; i < n; i++) {
      this.frameAt(rnd() * this.total, f);
      const a = rnd() * TAU;
      const r = 1.2 + rnd() * 9;
      const x = f.p.x + (f.n.x * Math.cos(a) + f.b.x * Math.sin(a)) * r;
      const y = f.p.y + (f.n.y * Math.cos(a) + f.b.y * Math.sin(a)) * r;
      const z = f.p.z + (f.n.z * Math.cos(a) + f.b.z * Math.sin(a)) * r;
      for (let k = 0; k < 2; k++) {
        pos.set([x, y, z], i * 6 + k * 3);
        dir.set([f.t.x, f.t.y, f.t.z], i * 6 + k * 3);
        end[i * 2 + k] = k;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
    geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.streakMat = new THREE.ShaderMaterial({
      uniforms: { uStretch: { value: 0.3 }, uColor: { value: new THREE.Color('#d6e8ff') } },
      vertexShader: `
        attribute vec3 aDir; attribute float aEnd; uniform float uStretch; varying float vA;
        void main() {
          vec3 p = position - aDir * uStretch * aEnd;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float d = -mv.z;
          vA = smoothstep(70.0, 12.0, d) * smoothstep(0.5, 3.0, d) * mix(1.0, 0.15, aEnd);
        }`,
      fragmentShader: `
        uniform vec3 uColor; varying float vA;
        void main() { gl_FragColor = vec4(uColor, vA * 0.75); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.group.add(new THREE.LineSegments(geo, this.streakMat));
  }

  resize() {}

  // ---- input -------------------------------------------------------------

  begin() { this.idle = 0; }

  onWheel(d) {
    this.fly = null;
    this.v = clamp(this.v + d * 0.012, -14, 24);
  }

  onDrag(dx, dy) {
    this.fly = null;
    this.v = clamp(this.v - dy * 0.06, -14, 24);
    this.tpx = clamp(this.tpx + dx * 0.004, -1, 1);
  }

  onPointer(nx, ny) {
    this.tpx = nx * 0.9;
    this.tpy = -ny * 0.6;
  }

  setHover(obj) { this.hovered = obj; }

  flyTo(target, dur) {
    const to = clamp(target, 1, this.endS - 6);
    this.fly = { from: this.s, to, t0: this.clock, dur: dur || 1.2 + Math.min(Math.abs(to - this.s) / 60, 2.6) };
  }

  flyToYear(year) {
    const g = this.gates.find((k) => k.year === year);
    if (g) this.flyTo(g.s - 13);
  }

  onYearClick(year) {
    const g = this.gates.find((k) => k.year === year);
    if (g) this.flyTo(g.s + 4); // straight through the gate
  }

  onRestart() { this.flyTo(2, 3.2); }

  currentYear() {
    let y = this.gates[0]?.year;
    for (const g of this.gates) if (g.s <= this.s + 4) y = g.year;
    return y;
  }

  focus(mesh) {
    this.unfocus();
    this.focused = mesh;
    if (mesh) mesh.visible = false;
  }

  unfocus() {
    if (this.focused) this.focused.visible = true;
    this.focused = null;
  }

  meshFor(photo) {
    let best = null;
    let bd = Infinity;
    for (const sl of this.slots) {
      if (sl.photo !== photo) continue;
      const d = Math.abs(sl.s - this.s - 6);
      if (d < bd) { bd = d; best = sl.mesh; }
    }
    return best;
  }

  speed() { return Math.abs(this.v); }

  // Photos just ahead load first; ones already behind you go last.
  priorityOrder() {
    const at = (this.fly ? this.fly.to : this.s) + 14;
    const key = (sl) => (sl.s < this.s - 6 ? 1e6 : 0) + Math.abs(sl.s - at);
    const seen = new Set();
    const out = [];
    for (const sl of this.slots.slice().sort((a, b) => key(a) - key(b))) {
      if (!seen.has(sl.photo)) { seen.add(sl.photo); out.push(sl.photo); }
    }
    return out;
  }

  // ---- frame ---------------------------------------------------------------

  update(dt, wdt, time) {
    const cam = this.engine.camera;
    this.clock += dt;
    const cruise = this.autoplay && !this.focused ? CRUISE : 0;

    if (this.fly) {
      const k = clamp01((this.clock - this.fly.t0) / this.fly.dur);
      const prev = this.s;
      this.s = this.fly.from + (this.fly.to - this.fly.from) * easeInOut(k);
      this.v = (this.s - prev) / Math.max(dt, 1e-3);
      if (k >= 1) { this.fly = null; this.v = cruise; }
    } else {
      this.v = smooth(this.v, cruise, this.focused ? 3 : 0.8, dt);
      this.s += this.v * dt;
    }
    if (this.s > this.endS - 6) {
      this.s = this.endS - 6;
      if (this.v > 0) this.v = 0;
      this.endWait += dt;
      if (this.autoplay && this.endWait > 5 && !this.fly && !this.focused) this.onRestart();
    } else {
      this.endWait = 0;
    }
    if (this.s < 1) { this.s = 1; if (this.v < 0) this.v = 0; }

    this.px = smooth(this.px, this.tpx, 2.5, dt);
    this.py = smooth(this.py, this.tpy, 2.5, dt);
    const f = this.frameAt(this.s, this._f);
    cam.position.copy(f.p).addScaledVector(f.n, this.py * 0.9).addScaledVector(f.b, this.px * 1.2);
    const g = this.frameAt(this.s + 7, this._g);
    this._look.copy(g.p).addScaledVector(g.n, this.py * 0.4).addScaledVector(g.b, this.px * 0.5);
    cam.up.copy(f.n);
    cam.lookAt(this._look);
    cam.rotateZ(Math.sin(this.clock * 0.13) * 0.05);

    const speed = Math.abs(this.v);
    const fov = 60 + clamp(speed - CRUISE, 0, 22) * 1.05;
    this.fov = smooth(this.fov, fov, 4, dt);
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
    this.streakMat.uniforms.uStretch.value = 0.25 + speed * 0.16;

    for (const sl of this.slots) {
      const m = sl.mesh;
      const ds = sl.s - this.s;
      const show = ds > -8 && ds < 95;
      if (!show) {
        if (m.visible && m !== this.focused) m.visible = false;
        continue;
      }
      if (m !== this.focused) m.visible = true;
      const phi = sl.phi + time * 0.05;
      const r = sl.rad + 0.12 * Math.sin(time * 0.8 + sl.phase);
      const c = Math.cos(phi) * r;
      const s = Math.sin(phi) * r;
      m.position.set(
        sl.c.x + sl.n.x * c + sl.b.x * s,
        sl.c.y + sl.n.y * c + sl.b.y * s,
        sl.c.z + sl.n.z * c + sl.b.z * s,
      );
      m.lookAt(sl.look);
      m.rotateZ(0.08 * Math.sin(time * 0.5 + sl.phase));
      this.opts.store.want(sl.photo);
      tickPhotoMesh(m, dt, m === this.hovered);
    }

    let next = true; // only the next gate ahead shows its year at full strength
    for (const gt of this.gates) {
      const d = gt.s - this.s;
      let op = smoothstep(48, 20, d) * smoothstep(2.5, 9, d);
      if (d > 2.5) { if (!next) op *= 0.15; next = false; }
      gt.label.material.opacity = op;
      gt.label.visible = op > 0.01;
      gt.label.userData.pickable = op > 0.3;
    }
    const de = this.endS - this.s;
    this.endLabel.material.opacity = smoothstep(50, 18, de);
    this.flash = 0;
  }

  dispose() {
    disposeGroup(this.group);
    this.bg.dispose();
    this.engine.scene.fog = null;
  }
}

function hmUserDataOwn(mesh) {
  if (mesh) mesh.material.userData.ownMap = true;
}
