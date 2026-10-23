// Cute toons built from simple shapes, and their Twisted copies (bigger, darker, glowing eyes, a jagged grin).
import * as THREE from 'three';
import { TOON } from './data.js';

const mats = new Map();
function mat(color, o = {}) {
  const k = color + JSON.stringify(o);
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...o }));
  return mats.get(k);
}
const dark = (c, k) => new THREE.Color(c).lerp(new THREE.Color(0x1a0a22), k).getHex();

export function makeToon(id, twisted = false) {
  const t = TOON[id] || TOON.bun;
  const c1 = twisted ? dark(t.color, 0.68) : t.color, c2 = twisted ? dark(t.color2, 0.62) : t.color2;
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const M = mat(c1), M2 = mat(c2), black = mat(0x150a18, { roughness: 0.3 });
  const add = (geo, m, x, y, z, parent = body) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); parent.add(o); return o; };
  // legs and arms hang from their tops so they can swing
  const limb = (x, y, len, r, m) => { const p = new THREE.Group(); p.position.set(x, y, 0); body.add(p); add(new THREE.CapsuleGeometry(r, len, 4, 8), m, 0, -len / 2 - r * 0.4, 0, p); return p; };
  const legL = limb(-0.28, 0.85, 0.45, 0.17, M2), legR = limb(0.28, 0.85, 0.45, 0.17, M2);
  add(new THREE.CapsuleGeometry(0.42, 0.55, 6, 12), M, 0, 1.2, 0);
  const armL = limb(-0.58, 1.55, 0.4, 0.13, M), armR = limb(0.58, 1.55, 0.4, 0.13, M);
  armL.rotation.z = 0.35; armR.rotation.z = -0.35;
  // the head: big and round
  const head = new THREE.Group(); head.position.set(0, 2.25, 0); body.add(head);
  const glass = id === 'pip';
  add(new THREE.SphereGeometry(0.62, 20, 16), glass ? mat(twisted ? 0x40506a : 0xbfe8ff, { transparent: true, opacity: 0.55, roughness: 0.1 }) : M, 0, 0, 0, head);
  if (glass) for (let i = 0; i < 9; i++) add(new THREE.SphereGeometry(0.12, 8, 6), mat([0xff5a4a, 0xffd23a, 0x5ab0ff, 0x7ad87a, 0xff8fd8][i % 5]), Math.sin(i * 2.4) * 0.35, -0.3 + (i % 3) * 0.12, Math.cos(i * 2.4) * 0.35, head);
  // ears and hats
  if (t.ears === 'bunny') for (const s of [-1, 1]) { const e = add(new THREE.CapsuleGeometry(0.13, 0.7, 4, 8), M, s * 0.25, 0.85, 0, head); e.rotation.z = -s * 0.18; add(new THREE.CapsuleGeometry(0.07, 0.5, 4, 8), M2, s * 0.25, 0.85, 0.07, head).rotation.z = -s * 0.18; }
  if (t.ears === 'gear') { const g = add(new THREE.TorusGeometry(0.3, 0.09, 6, 16), M2, 0, 0.72, 0, head); g.rotation.x = Math.PI / 2; for (let i = 0; i < 8; i++) add(new THREE.BoxGeometry(0.12, 0.12, 0.12), M2, Math.cos(i * 0.785) * 0.4, 0.72, Math.sin(i * 0.785) * 0.4, head); add(new THREE.CylinderGeometry(0.03, 0.03, 0.4), black, 0.3, 0.8, 0, head); add(new THREE.SphereGeometry(0.08), mat(0xff4a4a, { emissive: 0xff2a2a, emissiveIntensity: 0.6 }), 0.3, 1.02, 0, head); }
  if (t.ears === 'petals') for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, p = add(new THREE.SphereGeometry(0.3, 10, 8), M2, Math.cos(a) * 0.72, Math.sin(a) * 0.72, -0.12, head); p.scale.set(1, 1, 0.35); }
  if (t.ears === 'star') for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + Math.PI / 2, p = add(new THREE.ConeGeometry(0.22, 0.5, 8), M2, Math.cos(a) * 0.72, Math.sin(a) * 0.72, -0.05, head); p.rotation.z = a - Math.PI / 2; }
  if (t.ears === 'fluff') for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; add(new THREE.SphereGeometry(0.24, 10, 8), mat(twisted ? 0x6a6070 : 0xffffff), Math.cos(a) * 0.55, 0.35 + Math.sin(i * 1.7) * 0.12, Math.sin(a) * 0.4 - 0.05, head); }
  if (t.ears === 'gumball') { add(new THREE.CylinderGeometry(0.2, 0.25, 0.18, 12), mat(twisted ? 0x5a2020 : 0xff5a4a), 0, 0.66, 0, head); add(new THREE.BoxGeometry(0.3, 0.06, 0.04), black, 0, 1.1, 0.42); }
  // the face
  const eyes = [];
  if (!twisted) {
    for (const s of [-1, 1]) { const e = add(new THREE.SphereGeometry(0.1, 10, 8), black, s * 0.22, 0.08, 0.55, head); e.scale.set(0.8, 1.2, 0.6); add(new THREE.SphereGeometry(0.035, 6, 6), mat(0xffffff), s * 0.22 + 0.03, 0.14, 0.62, head); eyes.push(e); }
    const smile = add(new THREE.TorusGeometry(0.14, 0.025, 6, 12, Math.PI), black, 0, -0.12, 0.58, head); smile.rotation.z = Math.PI;
    for (const s of [-1, 1]) { const b = add(new THREE.SphereGeometry(0.08, 8, 6), mat(0xff9ab8), s * 0.36, -0.08, 0.5, head); b.scale.z = 0.3; }
  } else {
    const glow = mat(0xffffff, { emissive: 0xff3a5a, emissiveIntensity: 2.2 });
    for (const s of [-1, 1]) { const e = add(new THREE.SphereGeometry(0.13, 10, 8), glow, s * 0.24, 0.12, 0.54, head); eyes.push(e); }
    add(new THREE.BoxGeometry(0.62, 0.2, 0.1), black, 0, -0.2, 0.56, head);
    for (let i = 0; i < 6; i++) { const tooth = add(new THREE.ConeGeometry(0.045, 0.12, 4), mat(0xfff8e0), -0.25 + i * 0.1, -0.13, 0.62, head); tooth.rotation.z = Math.PI; }
    // ink drips
    for (let i = 0; i < 6; i++) { const a = i * 1.05; add(new THREE.CapsuleGeometry(0.05, 0.25 + (i % 3) * 0.12, 4, 6), mat(0x12061a, { roughness: 0.15 }), Math.cos(a) * 0.5, -0.45, Math.sin(a) * 0.45, head); }
  }
  body.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  root.scale.setScalar(twisted ? 1.45 : 1);
  root.userData = { body, head, legL, legR, armL, armR, eyes, phase: 0, twisted };
  return root;
}

// speed: 0..1 walking, 1+ running; mood: 'chase' bobs harder
export function animToon(g, dt, speed, mood = '') {
  const u = g.userData;
  u.phase += dt * (4 + speed * 9);
  const s = Math.min(1, speed);
  const sw = Math.sin(u.phase) * 0.8 * s;
  u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
  u.armL.rotation.x = -sw * 0.8; u.armR.rotation.x = sw * 0.8;
  u.body.position.y = Math.abs(Math.sin(u.phase)) * 0.12 * s + Math.sin(u.phase * 0.25) * 0.03;
  u.head.rotation.z = mood === 'chase' ? Math.sin(u.phase * 2) * 0.12 : Math.sin(u.phase * 0.3) * 0.04;
  if (mood === 'stun') u.head.rotation.y = Math.sin(u.phase * 1.5) * 0.4; else u.head.rotation.y *= 0.9;
}

// a machine: a chunky box with pipes, a gauge that fills with ichor, and a lamp that turns green when it runs
export function makeMachine() {
  const g = new THREE.Group();
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
  add(new THREE.BoxGeometry(1.7, 1.6, 1.7), mat(0x6a5a7a, { metalness: 0.3 }), 0, 0.8, 0);
  add(new THREE.BoxGeometry(1.8, 0.2, 1.8), mat(0x3a2e48), 0, 1.65, 0);
  for (const s of [-1, 1]) { const p = add(new THREE.CylinderGeometry(0.12, 0.12, 2.2, 8), mat(0xb08a4a, { metalness: 0.6 }), s * 0.65, 1.1, -0.65); p.rotation.z = s * 0.1; }
  add(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 16), mat(0xfff4dc), 0, 1.0, 0.86).rotation.x = Math.PI / 2;
  const tube = add(new THREE.CylinderGeometry(0.22, 0.22, 1.2, 12), mat(0xddeeff, { transparent: true, opacity: 0.35 }), 0.55, 2.3, 0.3);
  const fill = add(new THREE.CylinderGeometry(0.18, 0.18, 1.18, 12), mat(0x7a3ad8, { emissive: 0x5a1ab8, emissiveIntensity: 0.8 }), 0.55, 2.3, 0.3);
  const lampM = new THREE.MeshStandardMaterial({ color: 0xff4a4a, emissive: 0xff2a2a, emissiveIntensity: 1.2 });
  const lamp = add(new THREE.SphereGeometry(0.2, 12, 8), lampM, -0.4, 1.95, 0.3);
  g.userData = { fill, lamp, tube, done: false };
  return g;
}
export function setMachine(g, p) {
  const u = g.userData, k = Math.max(0.02, Math.min(1, p / 100));
  u.fill.scale.y = k; u.fill.position.y = 2.3 - (1 - k) * 0.59;
  const done = p >= 100;
  if (done !== u.done) { u.done = done; u.lamp.material.color.setHex(done ? 0x5aff7a : 0xff4a4a); u.lamp.material.emissive.setHex(done ? 0x2aff5a : 0xff2a2a); u.fill.material = mat(done ? 0x4ae87a : 0x7a3ad8, { emissive: done ? 0x2ac85a : 0x5a1ab8, emissiveIntensity: 0.8 }); }
}
export const sharedMat = mat;
