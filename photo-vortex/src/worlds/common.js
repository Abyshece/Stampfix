import * as THREE from 'three';
import { cardAspect } from '../photos.js';

export const TAU = Math.PI * 2;
export const PLANE = new THREE.PlaneGeometry(1, 1);
const DIM = new THREE.Color('#33423c');
const WHITE = new THREE.Color('#ffffff');

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const clamp01 = (v) => clamp(v, 0, 1);
export const smooth = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
export const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The back of each print shows plain paper instead of a mirrored photo.
function paperBack(shader) {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <opaque_fragment>',
    `#include <opaque_fragment>
    if (!gl_FrontFacing) { gl_FragColor.rgb = vec3(0.62, 0.60, 0.55) * (0.3 + 0.7 * diffuse.r); }`,
  );
}

export function makePhotoMesh(photo) {
  const mat = new THREE.MeshBasicMaterial({ color: DIM.clone(), side: THREE.DoubleSide });
  mat.onBeforeCompile = paperBack;
  mat.customProgramCacheKey = () => 'pv-photo';
  const mesh = new THREE.Mesh(PLANE, mat);
  mesh.userData = { kind: 'photo', photo, fade: 0, hover: 0, size: 1, cardAspect: cardAspect(photo.aspect) };
  return mesh;
}

export function sizeMesh(mesh, size) {
  const ud = mesh.userData;
  ud.size = size;
  const a = ud.cardAspect;
  if (a >= 1) mesh.scale.set(size, size / a, 1);
  else mesh.scale.set(size * a, size, 1);
}

// Attach the texture once it has loaded and fade the print in from dark.
// Returns the hover-scaled size so worlds can apply it.
export function tickPhotoMesh(mesh, dt, hovered) {
  const ud = mesh.userData;
  const p = ud.photo;
  const mat = mesh.material;
  if (!p.texture && mat.map) {
    // The texture was let go to save memory; show the blank print until it is back.
    mat.map = null;
    mat.needsUpdate = true;
    mat.color.copy(DIM);
    ud.fade = 0;
  }
  if (p.texture && mat.map !== p.texture) {
    mat.map = p.texture;
    mat.needsUpdate = true;
    const img = p.texture.image;
    if (img && img.width) ud.cardAspect = img.width / img.height;
    ud.fade = 0.001;
  }
  if (ud.fade > 0 && ud.fade < 1) {
    ud.fade = Math.min(1, ud.fade + dt * 1.5);
    mat.color.copy(DIM).lerp(WHITE, ud.fade * ud.fade * (3 - 2 * ud.fade));
  }
  ud.hover = smooth(ud.hover, hovered ? 1 : 0, 10, dt);
  // Prints waiting for their photo stay small and dim, then grow in as they arrive.
  const f = ud.fade >= 1 ? 1 : ud.fade * ud.fade * (3 - 2 * ud.fade);
  const s = ud.size * (0.5 + 0.5 * f) * (1 + 0.22 * ud.hover);
  const a = ud.cardAspect;
  if (a >= 1) mesh.scale.set(s, s / a, 1);
  else mesh.scale.set(s * a, s, 1);
}

export function disposeGroup(group) {
  group.traverse((o) => {
    if (o.geometry && o.geometry !== PLANE) o.geometry.dispose();
    const m = o.material;
    if (m) {
      (Array.isArray(m) ? m : [m]).forEach((mm) => {
        if (mm.userData?.ownMap && mm.map) mm.map.dispose();
        mm.dispose();
      });
    }
  });
  group.removeFromParent();
}
