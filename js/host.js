// The host: one player's browser runs the shared part of the game: the Twisteds, the machines, who picked up what,
// the elevator and the floors. Everyone else just shows what the host sends. No DOM here, so tests can run it in node.
import { genFloor, field, stepOn, collide, sees, tileOf, rng } from './map.js';
import { TWISTED, TW_TYPES, twistedPool } from './data.js';

export const GRACE = 10;          // seconds before the Twisteds start moving on a new floor
export const SHOP_T = 25;        // seconds in the elevator shop
export const ELEV_T = 30;        // once someone is in the open elevator, it leaves after this long
const ST = ['wander', 'chase', 'look', 'stun'];

export class Host {
  constructor(emit = () => {}) {
    this.emit = emit;
    this.r = rng((Date.now() ^ (Math.random() * 1e9)) >>> 0);
    this.S = { ph: 'lobby', fl: 0, seed: 1, np: 1, need: 0, mp: [], tk: [], ti: [], tw: [], el: { o: 0, t: -1 }, t: 0, run: [], ready: [] };
    this.W = genFloor(1, 0, 1);
    this.tws = []; this.fields = new Map(); this.fieldT = 0; this.lobbyT = 0;
  }
  // take over from a host who left, using the last state they sent
  load(S) {
    this.S = JSON.parse(JSON.stringify(S)); this.S.ready = this.S.ready || [];
    this.W = genFloor(S.seed, S.fl, S.np);
    this.tws = (S.tw || []).map((a) => ({ x: a[0], z: a[1], yaw: a[2], type: TW_TYPES[a[3]], st: 'wander', t: 0, cd: 1, lost: 0, gx: null, gz: null, tgt: null }));
  }
  startRun(ids) { this.S.fl = 0; this.nextFloor(ids); }
  nextFloor(ids) {
    const S = this.S;
    S.fl++; S.seed = 1 + Math.floor(this.r() * 1e9); S.np = Math.max(1, ids.length); S.run = [...ids];
    this.W = genFloor(S.seed, S.fl, S.np);
    S.need = this.W.need; S.mp = this.W.machines.map(() => 0); S.tk = []; S.ti = []; S.el = { o: 0, t: -1 };
    S.ph = 'floor'; S.t = 0; S.ready = [];
    // the Twisteds for this floor
    const n = Math.min(8, Math.ceil(S.fl * 0.6) + Math.floor(S.np / 3));
    const pool = twistedPool(S.fl).map((x) => [this.r(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    this.tws = [];
    for (let k = 0; k < n; k++) {
      const sp = this.W.spawns[k % this.W.spawns.length];
      this.tws.push({ x: sp.x + (k >= this.W.spawns.length ? -3 : 0), z: sp.z, yaw: 0, type: pool[k % pool.length], st: 'wander', t: 0, cd: 0, lost: 0, gx: null, gz: null, tgt: null });
    }
    this.fields.clear();
    this.emit({ k: 'floor', fl: S.fl, seed: S.seed });
  }
  // players: [{ id, x, z, dead, el (in the elevator), hid, sm (stealth ×), spr (sprinting), ex (machine or -1) }]
  // present: ids of everyone in the room; readyAll: everyone pressed ready in the lobby
  step(dt, players, present = players.map((p) => p.id), readyAll = false) {
    const S = this.S;
    S.t += dt;
    if (S.ph === 'lobby') {
      this.lobbyT = readyAll && present.length ? this.lobbyT + dt : 0;
      S.cd = readyAll ? Math.max(0, Math.ceil(3 - this.lobbyT)) : 0;
      if (this.lobbyT >= 3) { this.lobbyT = 0; this.startRun(present); }
    } else if (S.ph === 'floor') this.stepFloor(dt, players);
    else if (S.ph === 'shop') {
      const waiting = present.filter((id) => !S.ready.includes(id));
      if (S.t >= SHOP_T || (present.length && !waiting.length)) this.nextFloor(present);
    } else if (S.ph === 'over' && S.t >= 9) {
      S.ph = 'lobby'; S.fl = 0; S.t = 0; S.run = []; S.tw = []; S.mp = []; S.need = 0; S.ready = []; this.tws = [];
      S.seed = 1; this.W = genFloor(1, 0, 1); this.emit({ k: 'lobby' });
    }
    S.tw = this.tws.map((w) => [+w.x.toFixed(2), +w.z.toFixed(2), +w.yaw.toFixed(2), TW_TYPES.indexOf(w.type), ST.indexOf(w.st)]);
  }
  stepFloor(dt, players) {
    const S = this.S, W = this.W;
    const live = players.filter((p) => S.run.includes(p.id) && !p.dead);
    if (!live.length) { if (S.t > 1.5) { S.ph = 'over'; S.t = 0; this.tws = []; this.emit({ k: 'over', fl: S.fl }); } return; }
    // the elevator opens once enough machines run; it leaves 30 s after the first toon steps in (2 s once everyone is in)
    const done = S.mp.filter((v) => v >= 100).length;
    if (done >= S.need && !S.el.o) { S.el.o = 1; S.el.t = -1; this.emit({ k: 'elev' }); }
    if (S.el.o) {
      const inside = live.filter((p) => p.el);
      if (inside.length && S.el.t < 0) S.el.t = ELEV_T;
      if (S.el.t >= 0) {
        if (inside.length === live.length) S.el.t = Math.min(S.el.t, 2);
        S.el.t -= dt;
        if (S.el.t <= 0) {
          for (const p of live) if (!p.el) this.emit({ k: 'hit', to: p.id, dmg: 99, why: 'left' });
          const safe = inside.map((p) => p.id);
          S.ph = 'shop'; S.t = 0; S.ready = []; this.tws = [];
          this.emit({ k: 'cleared', fl: S.fl, safe, bonus: 8 + S.fl * 3 });
          return;
        }
      }
    }
    if (S.t < GRACE) return;
    this.fieldT -= dt; if (this.fieldT <= 0) { this.fields.clear(); this.fieldT = 0.45; }
    const prey = live.filter((p) => !p.el && !p.hid);
    const boost = 1 + Math.min(0.25, 0.025 * (S.fl - 1)) + (S.el.o ? 0.1 : 0);
    for (const w of this.tws) this.stepTwisted(w, dt, prey, boost);
  }
  goalField(gx, gz) {
    const tx = tileOf(gx), ty = tileOf(gz), k = ty * this.W.N + tx;
    let f = this.fields.get(k); if (!f) { f = field(this.W, tx, ty); this.fields.set(k, f); }
    return f;
  }
  pickWander(w) {
    const rooms = this.W.rooms.filter((rm) => rm.i !== this.W.elevRoom);
    const rm = rooms[Math.floor(this.r() * rooms.length)];
    w.gx = rm.cx + (this.r() < 0.5 ? -3 : 3); w.gz = rm.cz + (this.r() < 0.5 ? -3 : 3);
  }
  stepTwisted(w, dt, prey, boost) {
    const D = TWISTED[w.type], W = this.W;
    w.cd -= dt; if (w.ignT > 0) w.ignT -= dt;
    if (w.st === 'stun') { w.t -= dt; if (w.t <= 0) { w.st = 'wander'; w.gx = null; } return; }
    // who can it notice? sprinting and working machines are loud; stealthy toons are hard to spot; a chase is hard to shake
    let best = null, bd = 1e9;
    for (const p of prey) {
      if (w.ignT > 0 && w.ign === p.id) continue;      // it just hit this one: it goes looking for someone else
      const d = Math.hypot(p.x - w.x, p.z - w.z);
      let rad = D.sense * (p.sm || 1) * (p.spr ? 1.35 : 1) * (p.ex >= 0 ? 1.25 : 1);
      if (w.st === 'chase' && w.tgt === p.id) rad *= 1.4;
      if ((d < 2.5 || d < rad) && d < bd && (d < 2.5 || sees(W, w.x, w.z, p.x, p.z))) { bd = d; best = p; }
    }
    if (best) {
      if (w.st !== 'chase' || w.tgt !== best.id) this.emit({ k: 'spot', to: best.id, ty: w.type });
      w.st = 'chase'; w.tgt = best.id; w.gx = best.x; w.gz = best.z; w.lost = 0;
    } else if (w.st === 'chase') { w.lost += dt; if (w.lost > 1.2) { w.st = 'look'; w.t = 4; } }
    if (w.st === 'look') { w.t -= dt; if (w.t <= 0) { w.st = 'wander'; w.gx = null; } }
    if (w.gx == null) this.pickWander(w);
    // walk the distance field toward the goal
    const speed = (w.st === 'chase' ? D.chase : D.walk) * boost;
    const dg = Math.hypot(w.gx - w.x, w.gz - w.z);
    if (dg < 1.1) { if (w.st === 'wander') this.pickWander(w); }
    else {
      let tx = w.gx, tz = w.gz;
      if (!(dg < 4 && sees(W, w.x, w.z, w.gx, w.gz))) { const nx = stepOn(W, this.goalField(w.gx, w.gz), w.x, w.z); if (nx) [tx, tz] = nx; }
      const dx = tx - w.x, dz = tz - w.z, d = Math.hypot(dx, dz) || 1, m = Math.min(d, speed * dt);
      [w.x, w.z] = collide(W, w.x + (dx / d) * m, w.z + (dz / d) * m, 0.6);
      const want = Math.atan2(dx, dz); w.yaw += Math.atan2(Math.sin(want - w.yaw), Math.cos(want - w.yaw)) * Math.min(1, dt * 10);
    }
    // a hit: then it stops to gloat, which gives the toon a moment to run
    for (const p of prey) {
      if (w.cd <= 0 && !(w.ignT > 0 && w.ign === p.id) && Math.hypot(p.x - w.x, p.z - w.z) < 1.35) {
        this.emit({ k: 'hit', to: p.id, dmg: D.dmg, ty: w.type });
        w.st = 'stun'; w.t = 2.5; w.cd = 2.5; w.tgt = null; w.ign = p.id; w.ignT = 7; break;
      }
    }
  }
  // requests from players
  handle(q, from) {
    const S = this.S;
    if (q.k === 'ex' && S.ph === 'floor') {
      const m = q.m | 0; if (m < 0 || m >= S.mp.length || S.mp[m] >= 100) return;
      const a = Math.max(-12, Math.min(30, +q.a || 0));
      S.mp[m] = Math.max(0, Math.min(100, S.mp[m] + a));
      if (S.mp[m] >= 100) this.emit({ k: 'mdone', m, by: from, done: S.mp.filter((v) => v >= 100).length });
    } else if ((q.k === 'noise' || q.k === 'decoy') && S.ph === 'floor') {
      for (const w of this.tws) {
        const D = TWISTED[w.type], d = Math.hypot(q.x - w.x, q.z - w.z);
        if (w.st === 'stun') continue;
        if (q.k === 'decoy' ? d < 32 : w.st !== 'chase' && (D.hears || d < 28)) { w.st = 'look'; w.gx = q.x; w.gz = q.z; w.t = q.k === 'decoy' ? 7 : 5; w.tgt = null; }
      }
    } else if (q.k === 'take' && S.ph === 'floor') {
      const list = q.kind === 'item' ? S.tk : S.ti, max = q.kind === 'item' ? this.W.items.length : this.W.ichor.length;
      const i = q.i | 0; if (i < 0 || i >= max || list.includes(i)) return;
      list.push(i); this.emit({ k: 'took', kind: q.kind, i, by: from });
    } else if (q.k === 'ready' && S.ph === 'shop') { if (!S.ready.includes(from)) S.ready.push(from); }
  }
  snap() { const S = this.S; return { ph: S.ph, fl: S.fl, seed: S.seed, np: S.np, need: S.need, mp: S.mp.map((v) => Math.round(v * 10) / 10), tk: S.tk, ti: S.ti, tw: S.tw, el: { o: S.el.o, t: Math.round(S.el.t * 10) / 10 }, t: Math.round(S.t * 10) / 10, run: S.run, ready: S.ready, cd: S.cd || 0 }; }
}
