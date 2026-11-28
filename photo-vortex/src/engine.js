import * as THREE from 'three';

// One renderer and camera shared by every world. A world is an object with
// mount(engine), update(dt, worldDt, worldTime), dispose() and a list of pickables.
export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.05, 500);
    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.world = null;
    this.time = 0;
    this.timeScale = 1;
    this.targetTimeScale = 1;
    this.shift = 0; // horizontal view offset in px (moves the scene right of the intro text)
    this.targetShift = 0;
    this.onFrame = null;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.renderer.setAnimationLoop(() => this.frame());
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.applyShift();
    this.world?.resize?.();
  }

  applyShift() {
    if (Math.abs(this.shift) < 0.5) this.camera.clearViewOffset();
    else this.camera.setViewOffset(this.width, this.height, -this.shift, 0, this.width, this.height);
    this.camera.updateProjectionMatrix();
  }

  setWorld(world) {
    if (this.world) this.world.dispose();
    this.world = world;
    world.mount(this);
  }

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const target = Math.min(this.targetTimeScale, this.world?.timeScale ?? 1);
    this.timeScale += (target - this.timeScale) * (1 - Math.exp(-dt * 4));
    const wdt = dt * this.timeScale;
    this.time += wdt;
    if (Math.abs(this.shift - this.targetShift) > 0.5) {
      this.shift += (this.targetShift - this.shift) * (1 - Math.exp(-dt * 2.5));
      this.applyShift();
    } else if (this.shift !== this.targetShift) {
      this.shift = this.targetShift;
      this.applyShift();
    }
    if (this.world) this.world.update(dt, wdt, this.time);
    this.onFrame?.(dt);
    this.renderer.render(this.scene, this.camera);
  }

  pick(clientX, clientY) {
    if (!this.world) return null;
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    let best = null;
    const hits = this.raycaster.intersectObjects(this.world.pickables, false);
    for (const h of hits) {
      const o = h.object;
      if (!o.visible || o.userData.pickable === false) continue;
      if (o.material?.opacity !== undefined && o.material.transparent && o.material.opacity < 0.2) continue;
      best = { object: o, distance: h.distance };
      break;
    }
    // Worlds drawn on the GPU (the photo wall) answer picks with their own maths.
    const w = this.world.pick?.(this.raycaster);
    if (w && (!best || w.distance < best.distance)) best = w;
    return best ? best.object : null;
  }

  // Screen rectangle around a photo mesh, for the fly-out animation into the viewer.
  screenRectOf(mesh) {
    if (!mesh) return null;
    mesh.updateMatrixWorld();
    const v = new THREE.Vector3();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [cx, cy] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
      v.set(cx, cy, 0).applyMatrix4(mesh.matrixWorld).project(this.camera);
      if (v.z < -1 || v.z > 1) return null;
      const x = ((v.x + 1) / 2) * this.width;
      const y = ((1 - v.y) / 2) * this.height;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    if (x1 < 0 || y1 < 0 || x0 > this.width || y0 > this.height) return null;
    return { left: x0, top: y0, width: x1 - x0, height: y1 - y0 };
  }
}
