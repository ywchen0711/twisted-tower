// Twisted Tower: the client. Moves your toon, draws the floor, runs skill checks, the HUD, lobby and shop,
// and (if you are the host) runs the shared game in host.js.
import * as THREE from 'three';
import { TOONS, TOON, derive, TWISTED, TW_TYPES, ITEMS, ITEM_IDS, SAYS, STAT_NAMES } from './data.js?v=1';
import { genFloor, collide, inElevator, THEMES, TILE, T, WALL, CRATE } from './map.js?v=1';
import { Host, SHOP_T, GRACE } from './host.js?v=1';
import { makeToon, animToon, makeMachine, setMachine, sharedMat } from './models.js?v=1';
import { net, myId, isHost, setMe, connect, leave, sendState, sendWorld, request, hostEvent, peerEvent, newCode, cleanCode, cleanName } from './net.js?v=1';
import { sfx } from './audio.js?v=1';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer: coarse)').matches || params.has('touch');
const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ------------------------------------------------------------------ save + text
const SAVE_KEY = 'tt_save_v1';
const save = (() => {
  const d = { name: '', toon: 'bun', room: 'public', lastCode: '', lang: /^zh/i.test(navigator.language || '') ? 'zh' : 'en', best: 0, sound: true };
  try { return { ...d, ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') }; } catch (e) { return d; }
})();
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* private mode */ } };
const qLang = (location.search.match(/[?&]lang=(zh|en)(?![a-z])/) || [])[1]; if (qLang) { save.lang = qLang; persist(); }
if (cleanCode(params.get('room')).length === 4) { save.room = save.lastCode = cleanCode(params.get('room')); persist(); }
if (!TOON[save.toon]) save.toon = 'bun';
const li = () => (save.lang === 'zh' ? 0 : 1);
const tx = (pair) => pair[li()];
const STR = {
  zh: {
    title: '扭曲大樓', sub: '和朋友一起往下闖：修好機器、躲開扭曲怪、在電梯關門前回來！', name: '你的暱稱', nameTip: '別人會看到這個名字，不要用真實的全名喔',
    pick: '選擇你的卡通角色', with: '和誰一起玩', public: '🌍 公開房間', private: '🔒 私人房間', solo: '🙂 自己玩', newRoom: '建立新房間', join: '加入', code: '代碼',
    publicTip: '和任何正在公開房間的玩家一起玩', privateTip: (c) => `把代碼 ${c} 告訴朋友，輸入同一個代碼就能一起玩`, soloTip: '不連線，只有你自己（一樣有扭曲怪！）',
    play: '進入大樓', lobby: '電梯大廳', ready: '我準備好了！', unready: '等一下', waitAll: '大家都準備好就出發', starting: (n) => `${n} 秒後出發！`,
    host: '房主', you: '你', change: '換角色', leaveRoom: '離開', copy: '複製邀請連結', copied: '✔ 已複製', connecting: '連線中…', offline: '連不上線，改成自己玩',
    floor: (n) => `第 ${n} 層`, machines: (d, n) => `機器 ${d} / ${n}`, elevOpen: '🛗 電梯開了！快回電梯！', elevGo: (t) => `🛗 電梯 ${t} 秒後關門！`,
    shop: '電梯商店', shopSub: '用萃取到的墨汁買道具，下一層會更難！', buy: '買', full: '口袋滿了', cont: '準備好了', waitOthers: '等其他人…', shopLeft: (t) => `${t} 秒後下一層`,
    over: '全員倒下了…', overSub: (n) => `你們闖到了第 ${n} 層`, best: (n) => `最佳紀錄：第 ${n} 層`, back: '回到電梯大廳…',
    hurt: '好痛！', dead: '你倒下了…下一層會復活', left: '你沒趕上電梯…', spectate: (n) => `觀戰中：${n}（點一下換人）`, waitNext: '這一層進行中，下一層就能加入', spotted: '被發現了！快跑！',
    mdone: (n, d, m) => `⚙ ${n} 修好了一台機器（${d}/${m}）`, cleared: (f) => `🎉 第 ${f} 層過關！`, bonus: (b) => `+${b} 墨汁`,
    needMachine: '要站在機器旁邊才能用', pocketFull: '口袋滿了！', got: (n) => `撿到 ${n}`, healed: '❤ 回復了 1 顆愛心',
    skill: isTouch ? '點一下！' : '按空白鍵！', great: '完美！', good: '不錯！', miss: '失誤！怪物聽到了…',
    help: '怎麼玩', helpBody: [
      '每一層都有好幾台機器。站在機器旁邊不動就會開始萃取墨汁；出現圓圈時，指針轉到白色區域按空白鍵（手機點圓圈），黃色區域是完美。失誤會發出聲音，把扭曲怪引過來！',
      '修好足夠的機器，電梯就會打開。第一個人進電梯後 30 秒關門，沒趕上的人會倒下。',
      '扭曲怪看到你就會追。按住 Shift（手機按 🏃）衝刺，但體力有限。被打到會掉愛心，愛心沒了就倒下，下一層才會復活。',
      '撿地上的墨汁 💧 和道具。數字鍵 1–3 用道具，Q 用角色的特殊能力。每過一層可以在電梯商店買道具。',
      '每個角色能力不同：速度、體力、隱密（怪物多近才發現你）、技巧（圓圈的白色區域大小）、萃取速度。',
    ],
    pcKeys: 'WASD 移動 · Shift 衝刺 · 空白鍵 技巧檢定 · Q 能力 · 1–3 道具 · C 說話', touchKeys: '左邊搖桿移動 · 🏃 衝刺 · 點圓圈 技巧檢定',
    says: SAYS.map((x) => x[0]),
  },
  en: {
    title: 'Twisted Tower', sub: 'Head down with friends: fix the machines, dodge the Twisteds, and make it back before the elevator leaves!', name: 'Your nickname', nameTip: 'Others will see this name. Don’t use your real full name',
    pick: 'Pick your toon', with: 'Play with', public: '🌍 Public', private: '🔒 Private room', solo: '🙂 Solo', newRoom: 'New room', join: 'Join', code: 'Code',
    publicTip: 'Play with anyone in the public room', privateTip: (c) => `Tell your friends the code ${c}; everyone with the same code plays together`, soloTip: 'Offline, just you (the Twisteds still come!)',
    play: 'Enter the tower', lobby: 'Elevator lobby', ready: 'I’m ready!', unready: 'Wait', waitAll: 'We go when everyone is ready', starting: (n) => `Going down in ${n}…`,
    host: 'host', you: 'you', change: 'Change toon', leaveRoom: 'Leave', copy: 'Copy invite link', copied: '✔ Copied', connecting: 'Connecting…', offline: 'Couldn’t connect, playing solo',
    floor: (n) => `Floor ${n}`, machines: (d, n) => `Machines ${d} / ${n}`, elevOpen: '🛗 The elevator is open! Get back!', elevGo: (t) => `🛗 Elevator leaves in ${t}!`,
    shop: 'Elevator shop', shopSub: 'Spend your ichor on items. The next floor is harder!', buy: 'Buy', full: 'Pockets full', cont: 'Ready', waitOthers: 'Waiting for the others…', shopLeft: (t) => `Next floor in ${t}`,
    over: 'Everyone fell…', overSub: (n) => `You reached floor ${n}`, best: (n) => `Best: floor ${n}`, back: 'Back to the lobby…',
    hurt: 'Ouch!', dead: 'You fell… you’ll be back next floor', left: 'You missed the elevator…', spectate: (n) => `Watching ${n} (tap to switch)`, waitNext: 'A floor is under way; you join on the next one', spotted: 'Spotted! Run!',
    mdone: (n, d, m) => `⚙ ${n} fixed a machine (${d}/${m})`, cleared: (f) => `🎉 Floor ${f} cleared!`, bonus: (b) => `+${b} ichor`,
    needMachine: 'Stand next to a machine to use this', pocketFull: 'Your pockets are full!', got: (n) => `Got ${n}`, healed: '❤ Healed 1 heart',
    skill: isTouch ? 'Tap!' : 'Press Space!', great: 'Great!', good: 'Good!', miss: 'Missed! The Twisteds heard that…',
    help: 'How to play', helpBody: [
      'Each floor has machines. Stand still next to one to extract ichor; when the ring appears, press Space (or tap the ring) while the needle is in the white zone. The yellow part is a Great. A miss makes a noise that draws the Twisteds!',
      'Fix enough machines and the elevator opens. It leaves 30 seconds after the first toon steps in; anyone left behind falls.',
      'Twisteds chase you when they see you. Hold Shift (🏃 on a phone) to sprint while your stamina lasts. A hit costs a heart; with no hearts you fall until the next floor.',
      'Pick up ichor 💧 and items. Keys 1–3 use items, Q uses your toon’s ability. After each floor you can shop in the elevator.',
      'Every toon is different: speed, stamina, stealth (how close a Twisted must be to notice you), skill (the size of the white zone) and extraction speed.',
    ],
    pcKeys: 'WASD move · Shift sprint · Space skill check · Q ability · 1–3 items · C chat', touchKeys: 'Left stick to move · 🏃 sprint · tap the ring for skill checks',
    says: SAYS.map((x) => x[1]),
  },
};
const tr = () => STR[save.lang];

// ------------------------------------------------------------------ renderer / scene
const renderer = new THREE.WebGLRenderer({ canvas: $('cv'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x150c22);
scene.fog = new THREE.Fog(0x150c22, 28, 56);
const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 200);
scene.add(new THREE.HemisphereLight(0xc8b0ff, 0x2a1a30, 1.15));
const moon = new THREE.DirectionalLight(0x9a8aff, 0.55); moon.position.set(-20, 40, 10); scene.add(moon);
const lantern = new THREE.PointLight(0xffe0b0, 55, 24, 1.2); scene.add(lantern);
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

function textSprite(text, { scale = 1, bg = 'rgba(20,10,34,.72)', color = '#fff', font = 40 } = {}) {
  const c = document.createElement('canvas'), x = c.getContext('2d');
  x.font = `900 ${font}px "Nunito", "Noto Sans TC", sans-serif`;
  const w = Math.ceil(x.measureText(text).width + 30), h = Math.ceil(font * 1.5);
  c.width = w; c.height = h;
  x.font = `900 ${font}px "Nunito", "Noto Sans TC", sans-serif`;
  if (bg) { x.fillStyle = bg; x.beginPath(); x.roundRect ? x.roundRect(0, 0, w, h, h / 2) : x.rect(0, 0, w, h); x.fill(); }
  x.fillStyle = color; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, depthTest: false }));
  s.scale.set((w / 70) * scale, (h / 70) * scale, 1); s.renderOrder = 10;
  return s;
}
const dropSprite = (s) => { if (s && s.parent) s.parent.remove(s); if (s) { s.material.map.dispose(); s.material.dispose(); } };

// ------------------------------------------------------------------ the world on screen
const G = { group: null, W: null, key: '', machines: [], items: [], ichor: [], beam: null, elevSign: null, tw: [], peers: new Map(), decoys: [], mini: null };
function buildWorld(seed, fl, np) {
  const key = `${seed}|${fl}|${np}`;
  if (key === G.key) return;
  G.key = key;
  if (G.group) { scene.remove(G.group); G.group.traverse((o) => { if (o.geometry && !o.userData.keep) o.geometry.dispose(); }); }
  for (const p of G.peers.values()) dropPeer(p);
  G.peers.clear(); G.tw.forEach((t) => t.mesh.parent && t.mesh.parent.remove(t.mesh)); G.tw = [];
  const W = genFloor(seed, fl, np); G.W = W;
  const group = new THREE.Group(); G.group = group; scene.add(group);
  const N = W.N, size = N * TILE;
  const roomAt = (tx, ty) => W.rooms[Math.min(W.R - 1, Math.floor(ty / T)) * W.R + Math.min(W.R - 1, Math.floor(tx / T))];
  // the floor: one canvas, 16 px per tile
  const px = 16, cv = document.createElement('canvas'); cv.width = cv.height = N * px;
  const x = cv.getContext('2d');
  for (let ty = 0; ty < N; ty++) for (let tx2 = 0; tx2 < N; tx2++) {
    const th = THEMES[roomAt(tx2, ty).theme];
    x.fillStyle = (tx2 + ty) % 2 ? th.floor : th.floor2; x.fillRect(tx2 * px, ty * px, px, px);
    if (th.name === 'carpet') { x.fillStyle = 'rgba(255,220,150,.18)'; x.fillRect(tx2 * px + 6, ty * px + 6, 4, 4); }
    if (th.name === 'library' || th.name === 'parlor') { x.fillStyle = 'rgba(0,0,0,.08)'; x.fillRect(tx2 * px, ty * px + 7, px, 1); }
  }
  const ftex = new THREE.CanvasTexture(cv); ftex.colorSpace = THREE.SRGBColorSpace; ftex.magFilter = THREE.NearestFilter;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: ftex, roughness: 0.85 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(size / 2, 0, size / 2); group.add(floor);
  // walls and crates, instanced
  const walls = [], crates = [];
  for (let ty = 0; ty < N; ty++) for (let tx2 = 0; tx2 < N; tx2++) { const v = W.grid[ty * N + tx2]; if (v === WALL) walls.push([tx2, ty]); else if (v === CRATE) crates.push([tx2, ty]); }
  const wm = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE, 2.0, TILE), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), walls.length);
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  walls.forEach(([a, b], i) => { m4.makeTranslation(a * TILE + 1, 1.0, b * TILE + 1); wm.setMatrixAt(i, m4); col.set(THEMES[roomAt(Math.max(0, a - 1), Math.max(0, b - 1)).theme].wall).offsetHSL(0, 0, ((a * 7 + b * 13) % 5) * 0.012); wm.setColorAt(i, col); });
  group.add(wm);
  const wt = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE + 0.02, 0.2, TILE + 0.02), new THREE.MeshStandardMaterial({ color: 0x9a82c0, roughness: 0.6 }), walls.length);
  walls.forEach(([a, b], i) => { m4.makeTranslation(a * TILE + 1, 2.1, b * TILE + 1); wt.setMatrixAt(i, m4); }); group.add(wt);
  if (crates.length) {
    const cm = new THREE.InstancedMesh(new THREE.BoxGeometry(1.7, 1.3, 1.7), new THREE.MeshStandardMaterial({ color: 0xc08a4a, roughness: 0.8 }), crates.length);
    crates.forEach(([a, b], i) => { m4.makeRotationY(((a * 31 + b * 17) % 7) * 0.08).setPosition(a * TILE + 1, 0.65, b * TILE + 1); cm.setMatrixAt(i, m4); }); group.add(cm);
  }
  // machines, items, ichor
  G.machines = W.machines.map((m) => { const g = makeMachine(); g.position.set(m.x, 0, m.z); g.rotation.y = ((m.tx * 3 + m.ty) % 4) * Math.PI / 2; group.add(g); return g; });
  G.items = W.items.map((it) => {
    const g = new THREE.Group(); g.position.set(it.x, 0, it.z);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), sharedMat(0x5ad8c8, { emissive: 0x1a6a60, emissiveIntensity: 0.6 })); box.position.y = 0.5; box.userData.keep = true; g.add(box);
    const s = textSprite(ITEMS[it.kind].icon, { bg: null, font: 56, scale: 0.75 }); s.position.y = 1.6; g.add(s);
    g.userData = { box, s }; group.add(g); return g;
  });
  const ig = new THREE.SphereGeometry(0.28, 12, 10); ig.userData = {};
  G.ichor = W.ichor.map((p) => { const m = new THREE.Mesh(ig, sharedMat(0x3a1a5a, { emissive: 0x8a3aff, emissiveIntensity: 0.9, roughness: 0.15 })); m.position.set(p.x, 0.4, p.z); m.scale.setScalar(0.8 + p.v * 0.2); m.userData.keep = true; group.add(m); return m; });
  // the elevator: a striped platform, a back wall with doors, a beam of light when it opens
  const E = W.elev;
  const plat = new THREE.Mesh(new THREE.BoxGeometry(6, 0.16, 6), sharedMat(0x8a8aa8, { metalness: 0.15, roughness: 0.7 })); plat.position.set(E.x, 0.08, E.z); group.add(plat);
  for (const [dx, dz, w, d] of [[0, -3, 6.2, 0.3], [0, 3, 6.2, 0.3], [-3, 0, 0.3, 6.2], [3, 0, 0.3, 6.2]]) { const s = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, d), sharedMat(0xffd23a, { emissive: 0x6a5000, emissiveIntensity: 0.4 })); s.position.set(E.x + dx, 0.1, E.z + dz); group.add(s); }
  const back = new THREE.Mesh(new THREE.BoxGeometry(5, 3.4, 0.4), sharedMat(0x5a4a7a, { metalness: 0.4 })); back.position.set(E.x, 1.7, E.z - 3.3); group.add(back);
  for (const s of [-1, 1]) { const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.8, 0.1), sharedMat(0xc8c8e0, { metalness: 0.7, roughness: 0.25 })); door.position.set(E.x + s * 0.82, 1.5, E.z - 3.06); group.add(door); }
  G.beam = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 14, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x7affc8, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
  G.beam.position.set(E.x, 7, E.z); G.beam.visible = false; group.add(G.beam);
  G.elevSign = textSprite(save.lang === 'zh' ? '🛗 電梯' : '🛗 ELEVATOR', { scale: 0.9, bg: 'rgba(40,20,70,.85)' }); G.elevSign.position.set(E.x, 4.2, E.z - 3.3); group.add(G.elevSign);
  // the minimap's base picture
  const mc = document.createElement('canvas'); mc.width = mc.height = N * 4; const mx = mc.getContext('2d');
  for (let ty = 0; ty < N; ty++) for (let tx2 = 0; tx2 < N; tx2++) { const v = W.grid[ty * N + tx2]; mx.fillStyle = v === WALL ? '#0e0818' : v === CRATE ? '#3a2a1a' : THEMES[roomAt(tx2, ty).theme].floor2; mx.fillRect(tx2 * 4, ty * 4, 4, 4); }
  G.mini = mc;
  if (me.needSpawn) spawnMe();
}
function spawnMe() {
  const E = G.W.elev;
  [me.x, me.z] = [E.x + (Math.random() - 0.5) * 3, E.z + (Math.random() - 0.5) * 2 + 0.5];
  me.yaw = 0; me.ex = -1; me.needSpawn = false; skill.on = false; $('skill').hidden = true;
  cam.x = me.x; cam.z = me.z;
}

// ------------------------------------------------------------------ me
const me = { x: 0, z: 0, yaw: 0, hp: 3, dead: false, stam: 100, inv: [null, null, null], ichor: 0, cd: 0, ex: -1, exAcc: 0, exSend: 0, skT: 3,
  fx: { dash: 0, candy: 0, hide: 0, gum: 0, inv: 0, boost: 0, reveal: 0 }, needSpawn: true, sprint: false, speed: 0, inRun: false, avatar: null, label: null, bubble: null, bubbleT: 0, spec: 0 };
const D = () => derive(TOON[save.toon]);
const cam = { x: 0, z: 0 };
let S = null, host = null;            // the latest shared world; the host simulation if it is me
let started = false;

function myAvatar() {
  if (me.avatar && me.avatar.userData.toon === save.toon) return;
  if (me.avatar) scene.remove(me.avatar);
  me.avatar = makeToon(save.toon); me.avatar.userData.toon = save.toon; scene.add(me.avatar);
  if (me.label) dropSprite(me.label);
  me.label = textSprite(save.name || tx(TOON[save.toon].name), { scale: 0.5 }); me.label.position.y = 3.6; me.avatar.add(me.label);
}

// ------------------------------------------------------------------ input
const keys = new Set();
addEventListener('keydown', (e) => {
  if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
  keys.add(e.code);
  if (!started) return;
  if (e.code === 'Space') { e.preventDefault(); pressSkill(); }
  if (e.code === 'KeyQ') useAbility();
  if (/^Digit[1-3]$/.test(e.code)) useItem(+e.code.slice(5) - 1);
  if (e.code === 'KeyC') toggleChat();
  if (e.code === 'Escape') { $('chat').hidden = true; $('help').hidden = true; }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
const stick = { id: null, ox: 0, oy: 0, mx: 0, mz: 0, run: false };
$('cv').addEventListener('pointerdown', (e) => {
  sfx.unlock();
  if (!isTouch && e.pointerType === 'mouse') { if (me.dead || !me.inRun) me.spec++; return; }
  if (e.clientX < innerWidth * 0.5 && stick.id === null) {
    stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.mx = stick.mz = 0;
    const st = $('stick'); st.style.left = (e.clientX - 60) + 'px'; st.style.top = (e.clientY - 60) + 'px'; st.classList.add('on');
  } else if (me.dead || !me.inRun) me.spec++;
});
addEventListener('pointermove', (e) => {
  if (e.pointerId !== stick.id) return;
  let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy; const d = Math.hypot(dx, dy), m = 55;
  if (d > m) { dx *= m / d; dy *= m / d; }
  stick.mx = dx / m; stick.mz = dy / m;
  $('knob').style.transform = `translate(${dx}px, ${dy}px)`;
});
for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, (e) => { if (e.pointerId === stick.id) { stick.id = null; stick.mx = stick.mz = 0; $('stick').classList.remove('on'); $('knob').style.transform = ''; } });
const runB = $('bRun');
runB.addEventListener('pointerdown', (e) => { e.preventDefault(); stick.run = true; runB.classList.add('on'); });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) runB.addEventListener(ev, () => { stick.run = false; runB.classList.remove('on'); });
function inputVec() {
  let mx = 0, mz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) mz -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) mz += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
  mx += stick.mx; mz += stick.mz;
  const d = Math.hypot(mx, mz); if (d > 1) { mx /= d; mz /= d; }
  return { mx, mz, run: keys.has('ShiftLeft') || keys.has('ShiftRight') || stick.run };
}

// ------------------------------------------------------------------ skill checks
const skill = { on: false, ang: 0, start: 0, width: 40 };
const skc = $('skc').getContext('2d');
function openSkill() {
  if (me.fx.gum > 0) { me.fx.gum--; resolveSkill('great'); return; }
  skill.on = true; skill.ang = 0; skill.width = D().zone; skill.start = 120 + Math.random() * (220 - skill.width);
  $('skill').hidden = false; sfx.play('check');
}
function pressSkill() {
  if (!skill.on) return;
  const a = skill.ang, s = skill.start, w = skill.width;
  resolveSkill(a >= s && a <= s + w * 0.3 ? 'great' : a >= s && a <= s + w ? 'good' : 'miss');
}
function resolveSkill(res) {
  skill.on = false; $('skill').hidden = true;
  me.skT = 2.2 + Math.random() * 2.8;
  if (me.ex < 0) return;
  if (res === 'great') { me.exAcc += 6; sfx.play('great'); pop(tr().great, '#ffd23a'); }
  else if (res === 'good') { me.exAcc += 3; sfx.play('good'); pop(tr().good, '#fff'); }
  else { me.exAcc -= 6; sfx.play('fail'); pop(tr().miss, '#ff6a6a'); request({ k: 'noise', x: me.x, z: me.z }); shake = 0.3; }
}
function drawSkill() {
  const c = skc, R = 90, cx = 110, cy = 110, rad = (d) => (d - 90) * Math.PI / 180;
  c.clearRect(0, 0, 220, 220);
  c.lineWidth = 16; c.strokeStyle = 'rgba(20,10,34,.85)'; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = '#fff'; c.beginPath(); c.arc(cx, cy, R, rad(skill.start), rad(skill.start + skill.width)); c.stroke();
  c.strokeStyle = '#ffd23a'; c.beginPath(); c.arc(cx, cy, R, rad(skill.start), rad(skill.start + skill.width * 0.3)); c.stroke();
  const a = rad(skill.ang);
  c.strokeStyle = '#ff4a6a'; c.lineWidth = 6; c.lineCap = 'round'; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * (R + 10), cy + Math.sin(a) * (R + 10)); c.stroke();
  c.fillStyle = '#ff4a6a'; c.beginPath(); c.arc(cx, cy, 8, 0, Math.PI * 2); c.fill();
}
$('skill').addEventListener('pointerdown', (e) => { e.preventDefault(); pressSkill(); });

// ------------------------------------------------------------------ abilities and items
function nearMachine(maxD = 2.8) {
  if (!S || S.ph !== 'floor' || !G.W) return -1;
  let best = -1, bd = maxD;
  G.W.machines.forEach((m, i) => { const d = Math.hypot(m.x - me.x, m.z - me.z); if (d < bd && (S.mp[i] || 0) < 100) { bd = d; best = i; } });
  return best;
}
function canAct() { return started && S && S.ph === 'floor' && me.inRun && !me.dead; }
function useAbility() {
  if (!canAct() || me.cd > 0) return;
  const ab = TOON[save.toon].ab;
  if (ab.id === 'dash') me.fx.dash = 2;
  else if (ab.id === 'overclock') { const m = nearMachine(3.2); if (m < 0) { msg(tr().needMachine); return; } request({ k: 'ex', m, a: 15 }); }
  else if (ab.id === 'heal') { heal(1); peerEvent({ k: 'heal', x: me.x, z: me.z }); }
  else if (ab.id === 'reveal') me.fx.reveal = 8;
  else if (ab.id === 'hide') me.fx.hide = 5;
  else if (ab.id === 'decoy') { const x = me.x + Math.sin(me.yaw) * 7, z = me.z + Math.cos(me.yaw) * 7; dropDecoy(x, z); }
  me.cd = ab.cd; sfx.play('ability');
  pop(tx(ab.name), '#7affc8');
}
function dropDecoy(x, z) {
  const [cx, cz] = collide(G.W, x, z, 0.5);
  request({ k: 'decoy', x: cx, z: cz });
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), sharedMat(0xff5a4a, { emissive: 0xff2a2a, emissiveIntensity: 0.7 }));
  m.position.set(cx, 0.4, cz); G.group.add(m); G.decoys.push({ m, t: 7 });
}
function heal(n) { const mh = D().hearts; if (me.hp < mh) { me.hp = Math.min(mh, me.hp + n); msg(tr().healed); } }
function useItem(i) {
  const id = me.inv[i]; if (!id || !canAct()) return;
  if (id === 'bandage') { if (me.hp >= D().hearts) return; heal(1); }
  else if (id === 'candy') me.fx.candy = 6;
  else if (id === 'soda') me.stam = D().stamMax;
  else if (id === 'smoke') me.fx.hide = 4;
  else if (id === 'gum') me.fx.gum = 3;
  else if (id === 'toy') dropDecoy(me.x, me.z);
  me.inv[i] = null; sfx.play('item'); pop(ITEMS[id].icon + ' ' + tx(ITEMS[id].name), '#7affc8');
}
function addItem(id) { const i = me.inv.indexOf(null); if (i < 0) return false; me.inv[i] = id; return true; }

// ------------------------------------------------------------------ network
net.onRoster = () => {
  if (isHost() && !host) { host = new Host(hostEvent); if (S && S.ph) host.load(S); }
  else if (!isHost() && host) host = null;
  renderLobby();
};
// a dropped or failed connection: try again a few times, then play solo
let retries = 0, wantRoom = null;
net.onStatus = (s) => {
  if (s === 'on') retries = 0;
  if (s === 'error' && started && wantRoom) {
    if (++retries <= 3) setTimeout(() => { if (started && wantRoom) connect(wantRoom); }, 1500 * retries);
    else { msg(tr().offline, 3000); wantRoom = null; connect(null); }
  }
  renderLobby();
};
setInterval(() => { if (started && wantRoom && net.status === 'connecting' && performance.now() - connT > 12000) { connT = performance.now(); connect(wantRoom); } }, 3000);
let connT = 0;
net.onWorld = (w) => { S = w; };
net.onRequest = (q, from) => { if (host) host.handle(q, from); };
net.onEvent = (e) => {
  const t = tr(), id = myId();
  if (e.k === 'floor') {
    me.needSpawn = true; me.ex = -1;
    if (e.fl === 1) { me.hp = D().hearts; me.ichor = 0; me.inv = [null, null, null]; me.dead = false; me.cd = 0; }
    else if (me.dead) { me.dead = false; me.hp = 1; }
    for (const k of Object.keys(me.fx)) me.fx[k] = 0;
    me.stam = D().stamMax;
    $('shop').hidden = true;
    banner(t.floor(e.fl));
  } else if (e.k === 'hit' && e.to === id) {
    if (me.dead || !me.inRun) return;
    if (e.why === 'left') { me.hp = 0; me.dead = true; msg(t.left, 3000); sfx.play('hit'); return; }
    if (me.fx.inv > 0) return;
    me.hp -= e.dmg; me.fx.inv = 2.5; me.fx.boost = 2.5; sfx.play('hit'); flash(); shake = 0.5;
    if (me.hp <= 0) { me.hp = 0; me.dead = true; me.ex = -1; skill.on = false; $('skill').hidden = true; msg(t.dead, 3500); } else msg(t.hurt, 1200);
  } else if (e.k === 'spot' && e.to === id) { if (performance.now() - (spotT || 0) > 6000) { spotT = performance.now(); sfx.play('spot'); msg(t.spotted, 1500); } }
  else if (e.k === 'mdone') { sfx.play('mdone'); feed(t.mdone(nameOf(e.by), e.done, S ? S.need : '?')); }
  else if (e.k === 'elev') { sfx.play('elev'); banner(t.elevOpen); }
  else if (e.k === 'took' && e.by === id) {
    if (e.kind === 'ichor') { const v = G.W && G.W.ichor[e.i] ? G.W.ichor[e.i].v : 1; me.ichor += v; sfx.play('pick'); }
    else { const it = G.W && G.W.items[e.i]; if (it && addItem(it.kind)) { sfx.play('item'); pop(tr().got(ITEMS[it.kind].icon + ' ' + tx(ITEMS[it.kind].name)), '#7affc8'); } }
  } else if (e.k === 'cleared') {
    if (e.safe.includes(id)) { me.ichor += e.bonus; banner(t.cleared(e.fl) + '  ' + t.bonus(e.bonus)); }
    sfx.play('elev'); me.ex = -1; skill.on = false; $('skill').hidden = true; shopReady = false;
  } else if (e.k === 'over') {
    if (e.fl > save.best) { save.best = e.fl; persist(); }
    sfx.play('over'); overFl = e.fl;
  } else if (e.k === 'lobby') { me.needSpawn = true; me.dead = false; me.hp = D().hearts; setMe({ ready: false }); amReady = false; }
};
net.onPeer = (p, from) => {
  if (p.k === 'heal' && from !== myId() && me.inRun && !me.dead && Math.hypot(p.x - me.x, p.z - me.z) < 8) heal(1);
  if (p.k === 'say') { const t = tr().says[p.i]; if (!t) return; if (from === myId()) bubbleOn(me, t); else { const q = G.peers.get(from); if (q) bubbleOn(q, t); } }
};
let spotT = 0, overFl = 0, shopReady = false, amReady = false;
const nameOf = (id) => (id === myId() ? (save.name || tx(TOON[save.toon].name)) : ((net.roster.find((r) => r.id === id) || {}).n || (net.peers.get(id) || { s: {} }).s.n || '?'));

// other players' toons
function peerFor(id, s) {
  let p = G.peers.get(id);
  if (p && p.toon !== s.toon) { dropPeer(p); G.peers.delete(id); p = null; }
  if (!p) {
    const av = makeToon(TOON[s.toon] ? s.toon : 'bun'); G.group.add(av);
    const label = textSprite(s.n || '?', { scale: 0.5 }); label.position.y = 3.6; av.add(label);
    p = { id, toon: s.toon, n: s.n, avatar: av, label, bubble: null, bubbleT: 0, x: s.x, z: s.z, yaw: s.yaw || 0 };
    av.position.set(s.x, 0, s.z); G.peers.set(id, p);
  }
  if (p.n !== s.n) { p.n = s.n; dropSprite(p.label); p.label = textSprite(s.n || '?', { scale: 0.5 }); p.label.position.y = 3.6; p.avatar.add(p.label); }
  return p;
}
function dropPeer(p) { if (p.avatar.parent) p.avatar.parent.remove(p.avatar); dropSprite(p.label); dropSprite(p.bubble); }
function bubbleOn(who, text) {
  if (!who.avatar) return;
  dropSprite(who.bubble);
  who.bubble = textSprite(text, { scale: 0.6, bg: 'rgba(255,255,255,.95)', color: '#2a1440' }); who.bubble.position.y = 4.5; who.avatar.add(who.bubble); who.bubbleT = 3.5;
}

// ------------------------------------------------------------------ the loop
let last = performance.now(), shake = 0, hudT = 0, beatT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  if (started) update(dt, now);
  renderer.render(scene, camera);
}
function playersForHost() {
  const out = [], tNow = Date.now();
  if (started) out.push({ id: myId(), x: me.x, z: me.z, dead: me.dead || !me.inRun, el: G.W ? inElevator(G.W, me.x, me.z) : false, hid: me.fx.hide > 0, sm: D().stealth, spr: me.sprint, ex: me.ex });
  for (const [id, p] of net.peers) {
    const s = p.s; if (tNow - p.t > 10000 || !s) continue;
    out.push({ id, x: s.x, z: s.z, dead: !!s.dead || !s.run, el: !!s.el, hid: !!s.hid, sm: s.sm || 1, spr: !!s.spr, ex: s.ex ?? -1 });
  }
  return out;
}
function update(dt, now) {
  // the shared world
  if (host) {
    const present = net.roster.length ? net.roster.map((r) => r.id) : [myId()];
    const readyAll = net.roster.length > 0 && net.roster.every((r) => r.ready);
    host.step(dt, playersForHost(), present, readyAll);
    S = host.snap(); sendWorld(S, now);
  }
  if (!S) { buildWorld(1, 0, 1); }
  else if (S.ph === 'lobby' || S.ph === 'over' && !G.W) buildWorld(1, 0, 1);
  else buildWorld(S.seed, S.fl, S.np);
  const W = G.W, ph = S ? S.ph : 'lobby';
  me.inRun = ph === 'lobby' ? true : !!(S && S.run && S.run.includes(myId()));
  if (ph === 'lobby' && me.dead) me.dead = false;
  const alive = me.inRun && !me.dead;
  const d = D();
  // timers
  for (const k of ['dash', 'candy', 'hide', 'inv', 'boost', 'reveal']) if (me.fx[k] > 0) me.fx[k] = Math.max(0, me.fx[k] - dt);
  if (me.cd > 0) me.cd = Math.max(0, me.cd - dt);
  // moving
  const inp = inputVec(), moving = Math.hypot(inp.mx, inp.mz) > 0.15;
  const canMove = alive && (ph === 'floor' || ph === 'lobby') && $('help').hidden;
  me.sprint = false; me.speed = 0;
  if (canMove && moving) {
    let sp = d.walk;
    if (inp.run && me.stam > 0) { sp = d.sprint; me.sprint = true; me.stam = Math.max(0, me.stam - 25 * dt); }
    sp *= (me.fx.candy > 0 ? 1.35 : 1) * (me.fx.dash > 0 ? 1.8 : 1) * (me.fx.boost > 0 ? 1.4 : 1);
    const nx = me.x + inp.mx * sp * dt, nz = me.z + inp.mz * sp * dt;
    [me.x, me.z] = collide(W, nx, nz, 0.6);
    const want = Math.atan2(inp.mx, inp.mz); me.yaw += Math.atan2(Math.sin(want - me.yaw), Math.cos(want - me.yaw)) * Math.min(1, dt * 14);
    me.speed = sp / d.walk * Math.hypot(inp.mx, inp.mz);
  }
  if (!me.sprint) me.stam = Math.min(d.stamMax, me.stam + (moving ? 10 : 18) * dt);
  // working a machine: stand still next to it
  const m = alive && ph === 'floor' && !moving ? nearMachine() : -1;
  if (m !== me.ex) { me.ex = m; if (skill.on && m < 0) { skill.on = false; $('skill').hidden = true; } }
  if (me.ex >= 0) {
    me.exAcc += d.rate * dt;
    if (!skill.on && (me.skT -= dt) <= 0) openSkill();
    if ((me.exSend -= dt) <= 0 && me.exAcc !== 0) { request({ k: 'ex', m: me.ex, a: +me.exAcc.toFixed(2) }); me.exAcc = 0; me.exSend = 0.25; }
  } else me.exAcc = 0;
  if (skill.on) { skill.ang += dt * 360 / 1.15; if (skill.ang > 360) resolveSkill('miss'); else drawSkill(); }
  // picking things up
  if (alive && ph === 'floor' && W) {
    W.ichor.forEach((p, i) => { if (!S.ti.includes(i) && !pending.has('c' + i) && Math.hypot(p.x - me.x, p.z - me.z) < 1.3) { pending.set('c' + i, now); request({ k: 'take', kind: 'ichor', i }); } });
    W.items.forEach((p, i) => { if (!S.tk.includes(i) && !pending.has('i' + i) && me.inv.includes(null) && Math.hypot(p.x - me.x, p.z - me.z) < 1.4) { pending.set('i' + i, now); request({ k: 'take', kind: 'item', i }); } });
    for (const [k, t0] of pending) if (now - t0 > 2500) pending.delete(k);
  }
  // tell the others
  if (started) sendState({ n: save.name || tx(TOON[save.toon].name), toon: save.toon, x: +me.x.toFixed(2), z: +me.z.toFixed(2), yaw: +me.yaw.toFixed(2), sp: +me.speed.toFixed(2), hp: me.hp, dead: me.dead ? 1 : 0, run: me.inRun ? 1 : 0,
    el: W && inElevator(W, me.x, me.z) ? 1 : 0, ex: me.ex, hid: me.fx.hide > 0 ? 1 : 0, sm: +d.stealth.toFixed(2), spr: me.sprint ? 1 : 0 }, now);
  // ---- drawing
  myAvatar();
  me.avatar.visible = alive || ph === 'lobby';
  me.avatar.position.set(me.x, 0, me.z); me.avatar.rotation.y = me.yaw;
  animToon(me.avatar, dt, me.speed);
  if (me.fx.hide > 0) me.avatar.visible = Math.sin(now / 70) > -0.3;
  if (me.fx.inv > 0 && me.fx.hide <= 0) me.avatar.visible = Math.sin(now / 50) > 0;
  if (me.bubble && (me.bubbleT -= dt) <= 0) { dropSprite(me.bubble); me.bubble = null; }
  // other players
  const seen = new Set(), tNow = Date.now();
  for (const [id, p] of net.peers) {
    const s = p.s; if (!s || tNow - p.t > 10000) continue;
    seen.add(id);
    const q = peerFor(id, s), k = Math.min(1, dt * 10);
    q.x += (s.x - q.x) * k; q.z += (s.z - q.z) * k; if (Math.hypot(s.x - q.x, s.z - q.z) > 10) { q.x = s.x; q.z = s.z; }
    q.yaw += Math.atan2(Math.sin(s.yaw - q.yaw), Math.cos(s.yaw - q.yaw)) * k;
    q.avatar.position.set(q.x, 0, q.z); q.avatar.rotation.y = q.yaw;
    q.avatar.visible = ph === 'lobby' || (s.run && !s.dead);
    if (s.hid && q.avatar.visible) q.avatar.visible = Math.sin(now / 70) > -0.3;
    animToon(q.avatar, dt, s.sp || 0);
    if (q.bubble && (q.bubbleT -= dt) <= 0) { dropSprite(q.bubble); q.bubble = null; }
  }
  for (const [id, q] of G.peers) if (!seen.has(id)) { dropPeer(q); G.peers.delete(id); }
  // the Twisteds
  const tws = S && S.ph === 'floor' ? S.tw : [];
  while (G.tw.length > tws.length) { const t = G.tw.pop(); if (t.mesh.parent) t.mesh.parent.remove(t.mesh); }
  let nearest = 1e9;
  tws.forEach((a, i) => {
    const type = TW_TYPES[a[3]]; let t = G.tw[i];
    if (!t || t.type !== type) { if (t && t.mesh.parent) t.mesh.parent.remove(t.mesh); t = { type, mesh: makeToon(TWISTED[type].toon, true), x: a[0], z: a[1], yaw: a[2] }; t.mesh.position.set(a[0], 0, a[1]); G.group.add(t.mesh); G.tw[i] = t; }
    const k = host ? 1 : Math.min(1, dt * 8);
    const px = t.x, pz = t.z;
    t.x += (a[0] - t.x) * k; t.z += (a[1] - t.z) * k; t.yaw += Math.atan2(Math.sin(a[2] - t.yaw), Math.cos(a[2] - t.yaw)) * k;
    t.mesh.position.set(t.x, 0, t.z); t.mesh.rotation.y = t.yaw;
    const st = ['wander', 'chase', 'look', 'stun'][a[4]];
    animToon(t.mesh, dt, Math.min(1.4, Math.hypot(t.x - px, t.z - pz) / Math.max(dt, 1e-3) / 4), st);
    const dd = Math.hypot(t.x - me.x, t.z - me.z);
    t.mesh.visible = !TWISTED[type].ghost || dd < 9 || me.fx.reveal > 0 || st === 'chase' && dd < 13;
    if (st === 'chase' || dd < 10) nearest = Math.min(nearest, dd);
  });
  // machines, pickups, elevator
  if (W && S && S.ph !== 'lobby') {
    G.machines.forEach((g, i) => setMachine(g, S.mp ? S.mp[i] || 0 : 0));
    G.items.forEach((g, i) => { g.visible = !S.tk || !S.tk.includes(i); g.userData.box.rotation.y += dt; g.userData.s.position.y = 1.6 + Math.sin(now / 300 + i) * 0.12; });
    G.ichor.forEach((g, i) => { g.visible = !S.ti || !S.ti.includes(i); g.position.y = 0.45 + Math.sin(now / 400 + i * 1.7) * 0.12; });
    G.beam.visible = !!(S.el && S.el.o); if (G.beam.visible) G.beam.material.opacity = 0.12 + Math.sin(now / 200) * 0.05;
  } else if (G.beam) G.beam.visible = false;
  for (let i = G.decoys.length - 1; i >= 0; i--) { const dcy = G.decoys[i]; dcy.t -= dt; dcy.m.position.y = 0.4 + Math.abs(Math.sin(now / 150)) * 0.5; if (dcy.t <= 0) { dcy.m.parent && dcy.m.parent.remove(dcy.m); G.decoys.splice(i, 1); } }
  // heartbeat when a Twisted is close
  if (alive && ph === 'floor' && nearest < 16) { beatT -= dt; if (beatT <= 0) { sfx.play('beat'); beatT = 0.35 + (nearest / 16) * 0.9; } }
  $('vign').style.opacity = alive && ph === 'floor' ? Math.max(0, 1 - nearest / 14).toFixed(2) : 0;
  // camera: follow me, or a teammate while I wait
  let fx = me.x, fz = me.z;
  if (!alive && ph === 'floor') {
    const live = [...G.peers.values()].filter((q) => q.avatar.visible);
    if (live.length) { const q = live[me.spec % live.length]; fx = q.x; fz = q.z; $('spec').textContent = tr().spectate(q.n || '?'); }
    $('spec').hidden = false; if (!me.inRun) $('spec').textContent = tr().waitNext + (live.length ? ' · ' + $('spec').textContent : '');
  } else $('spec').hidden = true;
  cam.x += (fx - cam.x) * Math.min(1, dt * 6); cam.z += (fz - cam.z) * Math.min(1, dt * 6);
  shake = Math.max(0, shake - dt);
  const sx = shake > 0 ? (Math.random() - 0.5) * shake : 0;
  const zoom = camera.aspect < 1 ? 1.35 : 1;
  camera.position.set(cam.x + sx, 22 * zoom, cam.z + 11 * zoom); camera.lookAt(cam.x, 0, cam.z - 1);
  lantern.position.set(fx, 6.5, fz);
  // the HUD, ten times a second
  if ((hudT -= dt) <= 0) { hudT = 0.1; drawHud(); drawMini(); }
}
const pending = new Map();

// ------------------------------------------------------------------ HUD
function drawHud() {
  const t = tr(), ph = S ? S.ph : 'lobby', d = D();
  $('hud').classList.toggle('lobbyMode', ph === 'lobby');
  $('floorL').textContent = ph === 'lobby' ? t.lobby : t.floor(S.fl);
  $('machL').textContent = ph === 'floor' ? '⚙ ' + t.machines(S.mp.filter((v) => v >= 100).length, S.need) : '';
  $('ichorL').textContent = '💧 ' + me.ichor;
  $('hearts').innerHTML = ph === 'lobby' ? '' : Array.from({ length: d.hearts }, (_, i) => `<span class="${i < me.hp ? '' : 'lost'}">❤</span>`).join('');
  $('stam').firstElementChild.style.width = (me.stam / d.stamMax * 100) + '%';
  $('stam').classList.toggle('low', me.stam < 15);
  const el = S && S.el;
  if (ph === 'floor' && el && el.o) { $('elevBan').hidden = false; $('elevBan').textContent = el.t >= 0 ? t.elevGo(Math.ceil(el.t)) : t.elevOpen; $('elevBan').classList.toggle('hurry', el.t >= 0 && el.t < 10); }
  else if (ph === 'floor' && S.t < GRACE) { $('elevBan').hidden = false; $('elevBan').textContent = '⏳ ' + Math.ceil(GRACE - S.t); $('elevBan').classList.remove('hurry'); }
  else $('elevBan').hidden = true;
  const ab = TOON[save.toon].ab;
  $('ab').innerHTML = `<b>${tx(ab.name)}</b><small>${isTouch ? '' : 'Q'}</small>` + (me.cd > 0 ? `<i>${Math.ceil(me.cd)}</i>` : '');
  $('ab').classList.toggle('cool', me.cd > 0);
  $('inv').querySelectorAll('button').forEach((b, i) => { const id = me.inv[i]; b.innerHTML = id ? `${ITEMS[id].icon}<small>${i + 1}</small>` : `<small>${i + 1}</small>`; b.title = id ? tx(ITEMS[id].name) + ' · ' + tx(ITEMS[id].desc) : ''; });
  $('bar').hidden = ph !== 'floor' || !me.inRun || me.dead;
  // overlays by phase
  $('lobby').hidden = ph !== 'lobby'; if (ph === 'lobby') renderLobby(true);
  $('shop').hidden = ph !== 'shop'; if (ph === 'shop') renderShop();
  $('over').hidden = ph !== 'over'; if (ph === 'over') renderOver();
}
function drawMini() {
  const c = $('mini'), x = c.getContext('2d');
  if (!G.mini || !G.W || !S || S.ph !== 'floor') { c.hidden = true; return; }
  c.hidden = false;
  const W = G.W, k = c.width / (W.N * TILE);
  x.clearRect(0, 0, c.width, c.height); x.globalAlpha = 0.9; x.drawImage(G.mini, 0, 0, c.width, c.height); x.globalAlpha = 1;
  const dot = (px, pz, r, col, stroke) => { x.fillStyle = col; x.beginPath(); x.arc(px * k, pz * k, r, 0, Math.PI * 2); x.fill(); if (stroke) { x.strokeStyle = stroke; x.lineWidth = 1.5; x.stroke(); } };
  const blink = Math.sin(performance.now() / 180) > 0;
  x.fillStyle = S.el.o ? (blink ? '#7affc8' : '#2a8a6a') : '#5a8aff'; x.fillRect((W.elev.x - 3) * k, (W.elev.z - 3) * k, 6 * k, 6 * k);
  W.machines.forEach((m, i) => dot(m.x, m.z, 4, S.mp[i] >= 100 ? '#4ae87a' : '#ffd23a', '#000'));
  if (me.fx.reveal > 0) for (const t of G.tw) dot(t.x, t.z, 4, '#ff3a5a', '#fff');
  for (const q of G.peers.values()) if (q.avatar.visible) dot(q.x, q.z, 3.5, '#' + new THREE.Color(TOON[q.toon] ? TOON[q.toon].color : 0xffffff).getHexString(), '#fff');
  if (me.inRun && !me.dead) { x.save(); x.translate(me.x * k, me.z * k); x.rotate(-me.yaw + Math.PI); x.fillStyle = '#fff'; x.beginPath(); x.moveTo(0, -6); x.lineTo(4.5, 5); x.lineTo(-4.5, 5); x.closePath(); x.fill(); x.restore(); }
}
function msg(text, ms = 1800) { const el = $('msg'); el.textContent = text; el.classList.add('on'); clearTimeout(msg._t); msg._t = setTimeout(() => el.classList.remove('on'), ms); }
function banner(text) { const el = $('banner'); el.textContent = text; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); }
function pop(text, color) { const el = document.createElement('div'); el.className = 'pop'; el.textContent = text; el.style.color = color; $('pops').appendChild(el); setTimeout(() => el.remove(), 1200); }
function feed(text) { const el = document.createElement('div'); el.className = 'fi'; el.textContent = text; $('feed').appendChild(el); setTimeout(() => el.classList.add('out'), 4000); setTimeout(() => el.remove(), 4600); }
function flash() { const f = $('flash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }
$('ab').addEventListener('pointerdown', (e) => { e.preventDefault(); useAbility(); });
$('inv').querySelectorAll('button').forEach((b, i) => b.addEventListener('pointerdown', (e) => { e.preventDefault(); useItem(i); }));

// chat: preset phrases only
function toggleChat() {
  const c = $('chat'); c.hidden = !c.hidden;
  if (!c.hidden) { c.innerHTML = tr().says.map((s, i) => `<button data-i="${i}">${esc(s)}</button>`).join(''); c.querySelectorAll('button').forEach((b) => b.onclick = () => { peerEvent({ k: 'say', i: +b.dataset.i }); c.hidden = true; sfx.play('click'); }); }
}
$('bChat').onclick = () => { sfx.unlock(); toggleChat(); };

// ------------------------------------------------------------------ lobby, shop, game over
function renderLobby(quiet) {
  if (!started) return;
  const t = tr(), el = $('lobbyBody');
  const sig = JSON.stringify([net.status, net.roster, net.hostId, save.lang, S && S.cd, amReady, save.room]);
  if (quiet && sig === renderLobby.sig) return; renderLobby.sig = sig;
  const list = net.roster.length ? net.roster : [{ id: myId(), n: save.name, toon: save.toon, ready: amReady }];
  const priv = net.room && net.room !== 'public';
  const all = list.length && list.every((r) => r.ready);
  el.innerHTML = `<h2>${t.lobby}</h2>
    <div class="room">${net.status === 'solo' ? t.solo : net.status === 'on' ? (priv ? `${t.private} <b class="code">${net.room}</b>` : t.public) : net.status === 'connecting' ? t.connecting : t.offline}
      ${priv ? `<button id="lCopy" class="ghost">${t.copy}</button>` : ''}</div>
    <ul class="roster">${list.map((r) => `<li class="${r.ready ? 'rdy' : ''}"><img src="${toonIcon(r.toon)}" alt=""><b>${esc(r.n || '?')}</b>${r.id === myId() ? `<small>${t.you}</small>` : ''}${r.id === net.hostId && list.length > 1 ? `<small>👑 ${t.host}</small>` : ''}<span>${r.ready ? '✔' : '…'}</span></li>`).join('')}</ul>
    <p class="hint">${all && S && S.cd ? `<b class="go">${t.starting(S.cd)}</b>` : t.waitAll}</p>
    <div class="row"><button id="lReady" class="big ${amReady ? 'off' : ''}">${amReady ? t.unready : t.ready}</button></div>
    <div class="row"><button id="lToon" class="ghost">${t.change}</button><button id="lLeave" class="ghost">${t.leaveRoom}</button></div>`;
  $('lReady').onclick = () => { sfx.unlock(); sfx.play('click'); amReady = !amReady; setMe({ ready: amReady }); renderLobby(); };
  $('lToon').onclick = () => { amReady = false; setMe({ ready: false }); openTitle(true); };
  $('lLeave').onclick = () => { wantRoom = null; leave(); host = null; S = null; started = false; G.key = ''; openTitle(); };
  if ($('lCopy')) $('lCopy').onclick = () => { const link = `${location.origin}${location.pathname}?room=${net.room}`; try { navigator.clipboard.writeText(link).then(() => { $('lCopy').textContent = t.copied; }, () => msg(link, 5000)); } catch (e) { msg(link, 5000); } };
}
function renderShop() {
  const t = tr(), left = Math.max(0, Math.ceil(SHOP_T - S.t));
  const sig = JSON.stringify([me.ichor, me.inv, shopReady, left, save.lang]);
  if (sig === renderShop.sig) return; renderShop.sig = sig;
  $('shopBody').innerHTML = `<h2>🛗 ${t.shop}</h2><p>${t.shopSub}</p><div class="wallet">💧 ${me.ichor}</div>
    <div class="items">${ITEM_IDS.map((id) => { const it = ITEMS[id], can = me.ichor >= it.price && me.inv.includes(null); return `<button data-id="${id}" class="${can ? '' : 'no'}"><span class="ic">${it.icon}</span><b>${tx(it.name)}</b><small>${tx(it.desc)}</small><span class="pr">💧 ${it.price}</span></button>`; }).join('')}</div>
    <div class="pockets">${me.inv.map((id) => `<span>${id ? ITEMS[id].icon : ''}</span>`).join('')}</div>
    <p class="hint">${shopReady ? t.waitOthers : ''} ${t.shopLeft(left)}</p>
    <button id="sCont" class="big ${shopReady ? 'off' : ''}">${t.cont}</button>`;
  $('shopBody').querySelectorAll('[data-id]').forEach((b) => b.onclick = () => {
    const it = ITEMS[b.dataset.id];
    if (!me.inv.includes(null)) { msg(t.pocketFull); return; }
    if (me.ichor < it.price) return;
    me.ichor -= it.price; addItem(b.dataset.id); sfx.play('buy'); renderShop.sig = '';
  });
  $('sCont').onclick = () => { if (shopReady) return; shopReady = true; request({ k: 'ready' }); sfx.play('click'); renderShop.sig = ''; };
}
function renderOver() {
  const t = tr(), fl = overFl || (S && S.fl) || 0;
  $('overBody').innerHTML = `<h2>${t.over}</h2><p class="big">${t.overSub(fl)}</p><p>${t.best(Math.max(save.best, fl))}</p><p class="hint">${t.back}</p>`;
}

// ------------------------------------------------------------------ title screen
const iconCache = {};
function toonIcon(id) {
  if (!TOON[id]) id = 'bun';
  if (iconCache[id]) return iconCache[id];
  const r = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true }); r.setSize(128, 128); r.outputColorSpace = THREE.SRGBColorSpace;
  const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0x6a5a8a, 2.2)); const dl = new THREE.DirectionalLight(0xffffff, 1.2); dl.position.set(2, 3, 4); sc.add(dl);
  const m = makeToon(id); sc.add(m); m.rotation.y = 0.35;
  const c = new THREE.PerspectiveCamera(32, 1, 0.1, 50); c.position.set(0, 2.1, 6.4); c.lookAt(0, 1.75, 0);
  r.render(sc, c); iconCache[id] = r.domElement.toDataURL(); r.dispose(); r.forceContextLoss && r.forceContextLoss();
  return iconCache[id];
}
function openTitle(changeOnly = false) {
  $('title').hidden = false; $('title').classList.toggle('changeOnly', !!changeOnly); renderTitle();
}
function renderTitle() {
  const t = tr();
  $('tTitle').textContent = t.title; $('tSub').textContent = t.sub;
  $('tNameL').textContent = t.name; $('tNameTip').textContent = t.nameTip; $('tPick').textContent = t.pick; $('tWith').textContent = t.with;
  if (document.activeElement !== $('tName')) $('tName').value = save.name;
  $('tName').placeholder = tx(TOON[save.toon].name);
  $('tToons').innerHTML = TOONS.map((x) => `<button data-t="${x.id}" class="${x.id === save.toon ? 'sel' : ''}"><img src="${toonIcon(x.id)}" alt=""><b>${tx(x.name)}</b></button>`).join('');
  $('tToons').querySelectorAll('button').forEach((b) => b.onclick = () => { save.toon = b.dataset.t; persist(); sfx.unlock(); sfx.play('click'); renderTitle(); setMe({ toon: save.toon }); });
  const T0 = TOON[save.toon];
  $('tStats').innerHTML = `<div class="ab"><b>${tx(T0.ab.name)}</b> · ${tx(T0.ab.desc)}</div>` + Object.entries(STAT_NAMES).map(([k, n]) => `<div class="st"><span>${tx(n)}</span><i>${'★'.repeat(T0.stats[k])}<em>${'★'.repeat(5 - T0.stats[k])}</em></i></div>`).join('');
  const mode = save.room === 'public' || save.room === 'solo' ? save.room : 'private';
  $('tRooms').innerHTML = [['public', t.public], ['private', t.private], ['solo', t.solo]].map(([m, l]) => `<button data-m="${m}" class="${m === mode ? 'sel' : ''}">${l}</button>`).join('');
  $('tRooms').querySelectorAll('button').forEach((b) => b.onclick = () => { const m = b.dataset.m; save.room = m === 'private' ? (save.lastCode = save.lastCode || newCode()) : m; persist(); sfx.play('click'); renderTitle(); });
  $('tPriv').hidden = mode !== 'private';
  $('tCodeNow').textContent = mode === 'private' ? save.room : '';
  $('tNew').textContent = t.newRoom; $('tJoin').textContent = t.join; $('tCode').placeholder = t.code;
  $('tRoomTip').textContent = mode === 'public' ? t.publicTip : mode === 'solo' ? t.soloTip : t.privateTip(save.room);
  $('tPlay').textContent = $('title').classList.contains('changeOnly') ? '✔' : '▶ ' + t.play;
  $('tKeys').textContent = isTouch ? t.touchKeys : t.pcKeys;
  $('bLang').textContent = save.lang === 'zh' ? 'EN' : '中';
  document.documentElement.lang = save.lang === 'zh' ? 'zh-Hant' : 'en';
}
$('tName').addEventListener('input', () => { save.name = cleanName($('tName').value); persist(); });
$('tNew').onclick = () => { save.room = save.lastCode = newCode(); persist(); renderTitle(); };
$('tJoin').onclick = () => { const c = cleanCode($('tCode').value); if (c.length !== 4) { $('tCode').classList.add('bad'); setTimeout(() => $('tCode').classList.remove('bad'), 600); return; } save.room = save.lastCode = c; persist(); $('tCode').value = ''; renderTitle(); };
$('tCode').addEventListener('input', () => { const v = cleanCode($('tCode').value); if ($('tCode').value !== v) $('tCode').value = v; });
$('tPlay').onclick = () => {
  sfx.unlock(); sfx.play('click');
  save.name = cleanName($('tName').value) || save.name; persist();
  const changeOnly = $('title').classList.contains('changeOnly');
  $('title').hidden = true;
  setMe({ n: save.name || tx(TOON[save.toon].name), toon: save.toon, ready: false }); amReady = false;
  if (me.label) { dropSprite(me.label); me.label = null; me.avatar && scene.remove(me.avatar); me.avatar = null; }
  if (changeOnly && started) return;
  started = true; me.needSpawn = true; S = null; host = null; G.key = '';
  wantRoom = save.room === 'solo' ? null : save.room; retries = 0; connT = performance.now();
  connect(wantRoom);
};
$('bLang').onclick = () => { save.lang = save.lang === 'zh' ? 'en' : 'zh'; persist(); renderTitle(); renderLobby.sig = ''; renderShop.sig = ''; if (G.elevSign) G.key = ''; };
$('bSound').onclick = () => { save.sound = !save.sound; persist(); sfx.on = save.sound; $('bSound').textContent = save.sound ? '🔊' : '🔇'; };
$('bHelp').onclick = () => { const t = tr(); $('helpBody').innerHTML = `<h2>${t.help}</h2>` + t.helpBody.map((p) => `<p>${p}</p>`).join('') + `<p class="hint">${isTouch ? t.touchKeys : t.pcKeys}</p>` + `<h3>${save.lang === 'zh' ? '扭曲怪' : 'The Twisteds'}</h3><ul class="tws">${Object.values(TWISTED).map((w) => `<li><b>${tx(w.name)}</b> · ${tx(w.desc)}</li>`).join('')}</ul>`; $('help').hidden = false; };
$('help').addEventListener('pointerdown', (e) => { if (e.target.id === 'help' || e.target.classList.contains('closeX')) $('help').hidden = true; });
sfx.on = save.sound; $('bSound').textContent = save.sound ? '🔊' : '🔇';
document.body.classList.toggle('touch', isTouch);

// ------------------------------------------------------------------ boot
buildWorld(1, 0, 1); spawnMe(); myAvatar();
openTitle();
requestAnimationFrame(frame);
if (params.has('play')) $('tPlay').onclick();
window.TT = { G, me, net, get S() { return S; }, get host() { return host; }, save, useAbility, useItem, pressSkill };
