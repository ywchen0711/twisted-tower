// node tools/test.mjs: floors are connected and fair; bots can play a run through the host from start to finish
import { genFloor, field, stepOn, collide, tileOf, inElevator, TILE, WALL } from '../js/map.js';
import { Host } from '../js/host.js';
import { TOONS, derive } from '../js/data.js';

let fails = 0;
const ok = (name, cond, info = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${info ? '  ' + info : ''}`); if (!cond) fails++; };

// 1. every floor: all open tiles reachable from the elevator, every machine reachable, pickups on open floor
{
  let bad = 0, n = 0;
  for (let seed = 1; seed <= 120; seed++) for (const fl of [0, 1, 2, 3, 5, 8, 12]) for (const np of [1, 4, 8]) {
    const W = genFloor(seed * 7919, fl, np); n++;
    const d = field(W, tileOf(W.elev.x), tileOf(W.elev.z));
    let open = 0, reach = 0;
    for (let i = 0; i < W.grid.length; i++) if (!W.grid[i]) { open++; if (d[i] >= 0) reach++; }
    const mOk = W.machines.every((m) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => d[(m.ty + dy) * W.N + m.tx + dx] >= 0));
    const pOk = [...W.items, ...W.ichor].every((p) => d[tileOf(p.z) * W.N + tileOf(p.x)] >= 0);
    if (open !== reach || !mOk || !pOk || (fl > 0 && W.machines.length < W.need)) { bad++; if (bad < 4) console.log('   bad floor', seed, fl, np, open, reach, mOk, pOk); }
  }
  ok('floors are connected', bad === 0, `${n} floors, ${bad} bad`);
}

// 2. a run with bots: they fix machines, run from Twisteds (a little), ride the elevator, shop, and go deeper until they fall
function playRun(nBots, seed) {
  const events = [];
  const H = new Host((e) => events.push(e));
  H.r = (() => { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
  const toons = TOONS.slice(0, nBots);
  const bots = toons.map((t, i) => ({ id: 'b' + i, t, D: derive(t), x: 0, z: 0, hp: t.stats.hp, dead: false, el: true, ex: -1, inv: 0 }));
  const ids = bots.map((b) => b.id);
  const place = () => { bots.forEach((b, i) => { b.x = H.W.elev.x - 1.5 + (i % 3) * 1.5; b.z = H.W.elev.z - 1 + Math.floor(i / 3) * 1.5; b.ex = -1; }); };
  H.startRun(ids); place();
  let t = 0, maxFl = 0, hits = 0, machines = 0, lastFl = 1;
  const dt = 1 / 20;
  while (t < 60 * 25) {
    t += dt;
    const S = H.S;
    if (S.ph === 'floor') {
      if (S.fl !== lastFl) { lastFl = S.fl; place(); for (const b of bots) if (b.dead) { b.dead = false; b.hp = 1; } }
      maxFl = Math.max(maxFl, S.fl);
      for (const b of bots) {
        if (b.dead) continue;
        b.inv -= dt;
        // where to go: the elevator once it is open, else the nearest unfinished machine; run if a Twisted is close
        let goal;
        let near = H.tws.find((w) => { const d = Math.hypot(w.x - b.x, w.z - b.z); return (w.st === 'chase' && w.tgt === b.id && d < 12) || (w.st !== 'stun' && !(w.ign === b.id && w.ignT > 0) && d < 6); });
        if (near) { b.scared = 3; b.from = near; } else if ((b.scared = (b.scared || 0) - dt) > 0) near = b.from;
        if (S.el.o) goal = H.W.elev;
        else {
          const ms = H.W.machines.map((m, i) => ({ m, i })).filter(({ i }) => S.mp[i] < 100);
          ms.sort((a, c) => (S.mp[c.i] - S.mp[a.i]) * 0.8 + Math.hypot(a.m.x - b.x, a.m.z - b.z) - Math.hypot(c.m.x - b.x, c.m.z - b.z));
          if (b.m == null || S.mp[b.m] >= 100) { const taken = bots.filter((o) => o !== b && !o.dead).map((o) => o.m); const pick = ms.find(({ i }) => !taken.includes(i)) || ms[0]; b.m = pick ? pick.i : null; }
          goal = b.m != null ? H.W.machines[b.m] : H.W.elev;
        }
        const dGoal = Math.hypot(goal.x - b.x, goal.z - b.z);
        const working = !S.el.o && dGoal < 2.4 && !near;
        b.ex = working ? H.W.machines.indexOf(goal) : -1;
        if (working) H.handle({ k: 'ex', m: b.ex, a: b.D.rate * dt * 1.1 }, b.id);
        else if (near && !(S.el.o && Math.hypot(goal.x - b.x, goal.z - b.z) < 10)) {
          // flee: head for the room farthest from the Twisted by path (re-planned every 2 s)
          if (!b.flee || b.fleeFrom !== near || b.fleeT <= 0) {
            const f = field(H.W, tileOf(near.x), tileOf(near.z)), at = (rm) => f[tileOf(rm.cz + 2) * H.W.N + tileOf(rm.cx + 2)];
            const rm = H.W.rooms.reduce((a, c) => (at(c) > at(a) ? c : a));
            b.flee = field(H.W, tileOf(rm.cx + 2), tileOf(rm.cz + 2)); b.fleeFrom = near; b.fleeT = 2;
          }
          b.fleeT -= dt;
          const best = stepOn(H.W, b.flee, b.x, b.z);
          if (!best) b.fleeT = 0;
          if (best) { const dx = best[0] - b.x, dz = best[1] - b.z, d = Math.hypot(dx, dz) || 1, sp = b.D.sprint * (b.inv > 0 ? 1.4 : 1) * dt; [b.x, b.z] = collide(H.W, b.x + dx / d * Math.min(d, sp), b.z + dz / d * Math.min(d, sp), 0.6); }
        } else if (!(S.el.o && inElevator(H.W, b.x, b.z))) {
          const f = field(H.W, tileOf(goal.x), tileOf(goal.z)), nx = stepOn(H.W, f, b.x, b.z) || [goal.x, goal.z];
          const dx = nx[0] - b.x, dz = nx[1] - b.z, d = Math.hypot(dx, dz) || 1, sp = (near ? b.D.sprint : b.D.walk) * dt;
          [b.x, b.z] = collide(H.W, b.x + dx / d * Math.min(d, sp), b.z + dz / d * Math.min(d, sp), 0.6);
        }
        b.el = inElevator(H.W, b.x, b.z);
      }
    }
    const players = bots.map((b) => ({ id: b.id, x: b.x, z: b.z, dead: b.dead, el: b.el, hid: false, sm: b.D.stealth, spr: false, ex: b.ex }));
    H.step(dt, players, ids, false);
    if (process.env.TRACE && nBots === 1 && Math.round(t * 20) % 10 === 0 && t > 8 && t < 40) { const b = bots[0], w = H.tws[0]; console.log('   t', t.toFixed(1), 'bot', b.x.toFixed(1), b.z.toFixed(1), 'ex', b.ex, 'sc', (b.scared || 0).toFixed(1), '| tw', w.x.toFixed(1), w.z.toFixed(1), w.st, w.type, 'd', Math.hypot(w.x - b.x, w.z - b.z).toFixed(1)); }
    for (const e of events.splice(0)) {
      if (e.k === 'hit') { const b = bots.find((x) => x.id === e.to); if (process.env.DBG && b) { const w = H.tws.reduce((a, c) => Math.hypot(c.x - b.x, c.z - b.z) < Math.hypot(a.x - b.x, a.z - b.z) ? c : a); console.log('   hit', b.id, t.toFixed(1), e.ty, 'bot', b.x.toFixed(1), b.z.toFixed(1), 'ex', b.ex, 'scared', (b.scared || 0).toFixed(1), 'inv', b.inv.toFixed(1), 'tw', w.x.toFixed(1), w.z.toFixed(1), w.st); } if (b && !b.dead && (b.inv <= 0 || e.dmg >= 99)) { b.hp -= e.dmg; b.inv = 2.5; hits++; if (b.hp <= 0) b.dead = true; } }
      if (e.k === 'mdone') machines++;
      if (e.k === 'cleared') for (const id of ids) H.handle({ k: 'ready' }, id);
      if (e.k === 'over') return { maxFl, hits, machines, t: Math.round(t), over: true };
    }
  }
  return { maxFl, hits, machines, t: Math.round(t), over: false };
}
const runs = [];
for (const [n, seed] of [[1, 11], [2, 22], [4, 33], [4, 44], [6, 55]]) runs.push({ n, ...playRun(n, seed) });
for (const r of runs) console.log(`   ${r.n} bots: reached floor ${r.maxFl}, ${r.machines} machines, ${r.hits} hits, ${r.t}s${r.over ? ', all fell' : ''}`);
ok('most bot teams clear the first floor', runs.filter((r) => r.maxFl >= 2).length >= 3, runs.map((r) => r.maxFl).join(','));
ok('the Twisteds are a real danger', runs.every((r) => r.hits > 0));
ok('runs end when everyone falls (within 25 min)', runs.filter((r) => r.over).length >= 3, `${runs.filter((r) => r.over).length}/5 ended`);

// 3. a new host picks up where the old one left off
{
  const H = new Host(); H.startRun(['a', 'b']); H.handle({ k: 'ex', m: 0, a: 30 }, 'a'); H.step(9, [{ id: 'a', x: H.W.elev.x, z: H.W.elev.z, dead: false, el: true, ex: -1, sm: 1 }]);
  const H2 = new Host(); H2.load(H.snap());
  ok('host hand-over keeps the floor', H2.S.fl === 1 && H2.S.mp[0] === 30 && H2.tws.length === H.tws.length && H2.W.machines.length === H.W.machines.length);
}
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
