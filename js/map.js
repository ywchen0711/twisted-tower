// A floor of the tower: a grid of rooms joined by doorways, built from tiles (2 studs each) so that the same seed
// gives every player exactly the same floor. Also: collision, line of sight and path-finding on those tiles.
export const T = 8;        // tiles per room side (tile 0 is the wall)
export const TILE = 2;     // studs per tile
export const WALL = 1, CRATE = 2, MACHINE = 3;

export function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export const roomsFor = (fl) => (fl <= 0 ? 2 : Math.min(6, 3 + Math.ceil(fl / 2)));
// how many machines must run before the elevator opens
export const needFor = (fl, np) => Math.min(10, 3 + Math.floor(np / 2) + Math.floor(fl / 3));
export const THEMES = [
  { floor: '#c9a46a', floor2: '#b8915a', wall: '#7a5a9a', name: 'parlor' },
  { floor: '#9ab8c8', floor2: '#88a8b8', wall: '#4a6a8a', name: 'tiles' },
  { floor: '#b86a6a', floor2: '#a85a5a', wall: '#5a3a5a', name: 'carpet' },
  { floor: '#9ac87a', floor2: '#88b86a', wall: '#4a7a5a', name: 'garden' },
  { floor: '#d8c89a', floor2: '#c8b888', wall: '#8a6a4a', name: 'library' },
  { floor: '#a89ac8', floor2: '#988ab8', wall: '#5a4a8a', name: 'toyroom' },
];

export function genFloor(seed, fl, np = 1) {
  const r = rng(seed * 31 + fl * 977 + 13);
  const R = roomsFor(fl), N = R * T + 1;
  const grid = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (x % T === 0 || y % T === 0) grid[y * N + x] = WALL;
  // rooms joined into a maze (every room reachable), plus some extra doors so there are loops to run around
  const key = (a, b) => (a < b ? a + ',' + b : b + ',' + a), links = new Set();
  const seen = new Set([0]), stack = [0];
  const nbrs = (i) => { const x = i % R, y = (i / R) | 0, o = []; if (x > 0) o.push(i - 1); if (x < R - 1) o.push(i + 1); if (y > 0) o.push(i - R); if (y < R - 1) o.push(i + R); return o; };
  while (stack.length) {
    const i = stack[stack.length - 1], open = nbrs(i).filter((j) => !seen.has(j));
    if (!open.length) { stack.pop(); continue; }
    const j = open[Math.floor(r() * open.length)]; links.add(key(i, j)); seen.add(j); stack.push(j);
  }
  for (let i = 0; i < R * R; i++) for (const j of nbrs(i)) if (j > i && !links.has(key(i, j)) && r() < 0.3) links.add(key(i, j));
  for (const k of links) {
    const [a, b] = k.split(',').map(Number), ax = a % R, ay = (a / R) | 0;
    if (b === a + 1) { const x = (ax + 1) * T; for (let y = ay * T + 3; y <= ay * T + 5; y++) grid[y * N + x] = 0; }
    else { const y = (ay + 1) * T; for (let x = ax * T + 3; x <= ax * T + 5; x++) grid[y * N + x] = 0; }
  }
  const linked = (a, b) => links.has(key(a, b));
  // the elevator sits in the middle room
  const ei = Math.floor(R / 2) + Math.floor(R / 2) * R;
  const rooms = [];
  const rd = new Map([[ei, 0]]), q = [ei];
  while (q.length) { const i = q.shift(); for (const j of nbrs(i)) if (linked(i, j) && !rd.has(j)) { rd.set(j, rd.get(i) + 1); q.push(j); } }
  for (let i = 0; i < R * R; i++) {
    const x = i % R, y = (i / R) | 0;
    rooms.push({ i, rx: x, ry: y, cx: (x * T + T / 2) * TILE + TILE / 2, cz: (y * T + T / 2) * TILE + TILE / 2, theme: Math.floor(r() * THEMES.length), dist: rd.get(i) || 0 });
  }
  const tileAt = (rx, ry, lx, ly) => [rx * T + lx, ry * T + ly];
  const C = (tx) => tx * TILE + TILE / 2;
  // crates in room corners (never in front of a door)
  // crates come in groups that touch a corner, so they can never wall a tile in
  const corners = [[[1, 1]], [[1, 1], [2, 1]], [[1, 1], [1, 2]], [[7, 7]], [[7, 7], [6, 7]], [[7, 7], [7, 6]], [[1, 7]], [[1, 7], [2, 7]], [[7, 1]], [[7, 1], [7, 2]]];
  for (const rm of rooms) {
    if (rm.i === ei || fl <= 0) continue;
    const n = Math.floor(r() * 4);
    for (let k = 0; k < n; k++) for (const [lx, ly] of corners[Math.floor(r() * corners.length)]) { const [tx, ty] = tileAt(rm.rx, rm.ry, lx, ly); grid[ty * N + tx] = CRATE; }
  }
  const W = { seed, fl, R, N, grid, rooms, links: [...links], elevRoom: ei, machines: [], items: [], ichor: [], spawns: [], need: 0 };
  W.elev = { x: rooms[ei].cx, z: rooms[ei].cz };
  if (fl <= 0) return W;
  // machines: one in the middle of a room, never the elevator's
  const need = needFor(fl, np), others = rooms.filter((rm) => rm.i !== ei);
  const shuffled = others.map((rm) => [r(), rm]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const mRooms = shuffled.slice(0, Math.min(others.length, need + 2));
  for (const rm of mRooms) { const [tx, ty] = tileAt(rm.rx, rm.ry, 4, 4); grid[ty * N + tx] = MACHINE; W.machines.push({ x: C(tx), z: C(ty), tx, ty, room: rm.i }); }
  W.need = Math.min(need, W.machines.length);
  // items and ichor on free floor tiles
  const free = [];
  for (const rm of others) for (let ly = 1; ly < T; ly++) for (let lx = 1; lx < T; lx++) { const [tx, ty] = tileAt(rm.rx, rm.ry, lx, ly); if (!grid[ty * N + tx] && (lx + ly) % 2 === 0 && !(lx === 4 && ly === 4)) free.push([tx, ty]); }
  const take = () => free.splice(Math.floor(r() * free.length), 1)[0];
  const ids = ['bandage', 'candy', 'soda', 'smoke', 'gum', 'toy', 'bandage', 'soda'];
  for (let k = 0; k < 3 + Math.floor(fl / 2); k++) { const [tx, ty] = take(); W.items.push({ x: C(tx), z: C(ty), kind: ids[Math.floor(r() * ids.length)] }); }
  for (let k = 0; k < 10 + R * 3; k++) { const [tx, ty] = take(); W.ichor.push({ x: C(tx) + (r() - 0.5), z: C(ty) + (r() - 0.5), v: 1 + Math.floor(r() * 3) }); }
  // the Twisteds come out of the rooms farthest from the elevator
  W.spawns = [...others].sort((a, b) => b.dist - a.dist).slice(0, 8).map((rm) => ({ x: rm.cx + 4, z: rm.cz + 4 }));
  return W;
}

export const tileOf = (v) => Math.floor(v / TILE);
export function blocked(W, tx, ty) { if (tx < 0 || ty < 0 || tx >= W.N || ty >= W.N) return true; return W.grid[ty * W.N + tx] !== 0; }
// push a circle (x, z, radius) out of solid tiles; returns the corrected position
export function collide(W, x, z, rad) {
  for (let pass = 0; pass < 2; pass++) {
    const tx0 = tileOf(x - rad), tx1 = tileOf(x + rad), ty0 = tileOf(z - rad), ty1 = tileOf(z + rad);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      if (!blocked(W, tx, ty)) continue;
      const bx0 = tx * TILE, bz0 = ty * TILE, nx = Math.max(bx0, Math.min(x, bx0 + TILE)), nz = Math.max(bz0, Math.min(z, bz0 + TILE));
      let dx = x - nx, dz = z - nz; const d = Math.hypot(dx, dz);
      if (d >= rad) continue;
      if (d < 1e-6) { // centre inside the tile: push out along the shallowest side
        const l = x - bx0, rr = bx0 + TILE - x, t = z - bz0, b = bz0 + TILE - z, m = Math.min(l, rr, t, b);
        if (m === l) x = bx0 - rad; else if (m === rr) x = bx0 + TILE + rad; else if (m === t) z = bz0 - rad; else z = bz0 + TILE + rad;
      } else { x = nx + (dx / d) * rad; z = nz + (dz / d) * rad; }
    }
  }
  return [x, z];
}
// can a Twisted at (x0,z0) see (x1,z1)? walls block sight, crates and machines don't
export function sees(W, x0, z0, x1, z1) {
  const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / 0.5);
  for (let i = 1; i < n; i++) { const t = i / n, tx = tileOf(x0 + (x1 - x0) * t), ty = tileOf(z0 + (z1 - z0) * t); if (W.grid[ty * W.N + tx] === WALL) return false; }
  return true;
}
// distance field (in tiles) to a goal tile, over walkable tiles: a Twisted walks downhill on it
export function field(W, gx, gy) {
  const N = W.N, d = new Int16Array(N * N).fill(-1), q = new Int32Array(N * N);
  let h = 0, t = 0;
  if (gx < 0 || gy < 0 || gx >= N || gy >= N) return d;
  d[gy * N + gx] = 0; q[t++] = gy * N + gx;
  while (h < t) {
    const i = q[h++], x = i % N, y = (i / N) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const j = ny * N + nx; if (d[j] >= 0 || W.grid[j]) continue;
      d[j] = d[i] + 1; q[t++] = j;
    }
  }
  return d;
}
// the next point to walk toward on a distance field (diagonals allowed when both sides are open)
export function stepOn(W, d, x, z) {
  const N = W.N, tx = tileOf(x), ty = tileOf(z), here = d[ty * N + tx];
  let best = null, bv = here < 0 ? 1e9 : here;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const nx = tx + dx, ny = ty + dy; if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
    const v = d[ny * N + nx]; if (v < 0) continue;
    if (dx && dy && (W.grid[ty * N + nx] || W.grid[ny * N + tx])) continue;
    const vv = v + (dx && dy ? 0.4 : 0);
    if (vv < bv) { bv = vv; best = [nx, ny]; }
  }
  return best ? [best[0] * TILE + TILE / 2, best[1] * TILE + TILE / 2] : null;
}
export const inElevator = (W, x, z) => Math.abs(x - W.elev.x) < 3.2 && Math.abs(z - W.elev.z) < 3.2;
