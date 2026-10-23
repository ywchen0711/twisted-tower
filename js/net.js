// Playing together over Supabase Realtime (the same project the game site's saves use), no game server:
//   tt:<room>  broadcast  's' player states · 'w' the host's world · 'r' requests to the host · 'e' host events · 'p' player events
//              presence   who is here: { n: name, toon, since, ready }
// The player who has been in the room longest is the host. If they leave, the next one takes over.
// Solo play uses the same calls with no connection: you are the host.
const SB_URL = 'https://usoavddhglpbdpwwxium.supabase.co';
const SB_KEY = 'sb_publishable_HbbsnjG0GTwzfRgKyx1Aqg__JUOb24B';   // publishable: safe in the browser
const SB_LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm';

const me = { id: Math.random().toString(36).slice(2, 10), n: 'Toon', toon: 'bun', since: Date.now(), ready: false };
export const net = {
  room: null, status: 'off',            // off | solo | connecting | on | error
  roster: [], hostId: me.id,            // [{ id, n, toon, ready }]
  peers: new Map(),                     // id -> { s: latest state, t: when }
  onWorld: null, onEvent: null, onRequest: null, onPeer: null, onRoster: null, onStatus: null,
};
export const myId = () => me.id;
export const isHost = () => net.hostId === me.id;
let sb = null, lib = null, ch = null, joins = 0, pres = [], rosterSig = '';
// who is here: presence, plus anyone we are hearing from (presence can lag a few seconds); the oldest is the host
function merge() {
  const now = Date.now(), m = new Map();
  for (const r of pres) m.set(r.id, { id: r.id, n: r.n, toon: r.toon, since: r.since || 0, ready: !!r.ready });
  for (const [id, p] of net.peers) {
    if (now - p.t > 6000) continue;
    const r = m.get(id) || { id, since: p.s.since || 0 };
    r.n = p.s.n || r.n; r.toon = p.s.toon || r.toon; r.ready = !!p.s.rd; if (!r.since) r.since = p.s.since || 0;
    m.set(id, r);
  }
  m.set(me.id, { id: me.id, n: me.n, toon: me.toon, since: me.since, ready: me.ready });
  net.roster = [...m.values()].sort((a, b) => (a.since || 0) - (b.since || 0) || (a.id < b.id ? -1 : 1));
  net.hostId = net.roster[0].id;
  const sig = JSON.stringify(net.roster);
  if (sig !== rosterSig) { rosterSig = sig; if (net.onRoster) net.onRoster(net.roster); }
}
setInterval(() => { if (ch && net.status === 'on') merge(); }, 2000);
const status = (s) => { net.status = s; if (net.onStatus) net.onStatus(s); };
async function client() {
  if (!lib) lib = import(SB_LIB);
  const { createClient } = await lib;
  if (!sb) sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { params: { eventsPerSecond: 40 } } });
  return sb;
}
function soloRoster() { net.roster = [{ id: me.id, n: me.n, toon: me.toon, ready: me.ready }]; net.hostId = me.id; if (net.onRoster) net.onRoster(net.roster); }
export function setMe(o) {
  Object.assign(me, o);
  if (ch && net.status === 'on') { ch.track({ n: me.n, toon: me.toon, since: me.since, ready: me.ready }).catch(() => {}); merge(); lastS = 0; }
  else if (net.status === 'solo' || net.status === 'off') soloRoster();
}
export async function connect(room) {
  leave();
  const ticket = ++joins;
  if (!room) { net.room = null; status('solo'); soloRoster(); return; }
  net.room = room; status('connecting');
  let c;
  try { c = await client(); } catch (e) { lib = null; if (ticket === joins) { status('error'); soloRoster(); } return; }
  if (ticket !== joins) return;
  me.since = Date.now();
  const mine = c.channel(`tt:${room}`, { config: { broadcast: { self: false }, presence: { key: me.id } } });
  ch = mine;
  mine.on('presence', { event: 'sync' }, () => {
    if (ch !== mine) return;
    pres = Object.entries(mine.presenceState()).map(([id, metas]) => ({ id, ...(metas[metas.length - 1] || {}) }));
    merge();
  }).on('presence', { event: 'leave' }, ({ key }) => {
    if (ch !== mine) return;
    net.peers.delete(key); pres = pres.filter((r) => r.id !== key); merge();
  }).on('broadcast', { event: 's' }, ({ payload: p }) => {
    if (ch !== mine || !p || p.id === me.id) return;
    const old = net.peers.get(p.id);
    net.peers.set(p.id, { s: p, t: Date.now() });
    if (!old || old.s.rd !== p.rd || old.s.toon !== p.toon || old.s.n !== p.n) merge();
  }).on('broadcast', { event: 'w' }, ({ payload: p }) => {
    if (ch !== mine || !p || isHost() || p.from !== net.hostId) return;
    if (net.onWorld) net.onWorld(p.w);
  }).on('broadcast', { event: 'r' }, ({ payload: p }) => {
    if (ch !== mine || !p || !isHost()) return;
    if (net.onRequest) net.onRequest(p.q, p.from);
  }).on('broadcast', { event: 'e' }, ({ payload: p }) => {
    if (ch !== mine || !p || isHost()) return;
    if (net.onEvent) net.onEvent(p);
  }).on('broadcast', { event: 'p' }, ({ payload: p }) => {
    if (ch !== mine || !p) return;
    if (net.onPeer) net.onPeer(p, p.from);
  }).subscribe((s) => {
    if (ch !== mine) return;
    if (s === 'SUBSCRIBED') { status('on'); mine.track({ n: me.n, toon: me.toon, since: me.since, ready: me.ready }).catch(() => {}); }
    else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') status('error');
  });
}
export function leave() {
  joins++;
  if (sb && ch) sb.removeChannel(ch);
  ch = null; pres = []; rosterSig = ''; net.room = null; net.peers.clear(); net.roster = []; net.hostId = me.id; status('off');
}
const send = (event, payload) => { if (ch && net.status === 'on') ch.send({ type: 'broadcast', event, payload }).catch(() => {}); };
// my toon: ~10 a second while moving, once a second when still
let lastS = 0, lastKey = '';
export function sendState(s, now = performance.now()) {
  const key = `${s.x.toFixed(1)},${s.z.toFixed(1)},${s.hp},${s.dead},${s.ex},${s.hid},${s.el},${me.ready},${me.toon}`;
  if (now - lastS < (key === lastKey ? 1000 : 100)) return;
  lastS = now; lastKey = key;
  send('s', { id: me.id, since: me.since, rd: me.ready ? 1 : 0, ...s });
}
// the host's world, ~7 a second
let lastW = 0;
export function sendWorld(w, now = performance.now(), force = false) { if (!force && now - lastW < 140) return; lastW = now; send('w', { from: me.id, w }); }
// ask the host for something (the host answers its own questions directly)
export function request(q) { if (isHost()) { if (net.onRequest) net.onRequest(q, me.id); } else send('r', { from: me.id, q }); }
// the host tells everyone (itself included)
export function hostEvent(e) { send('e', e); if (net.onEvent) net.onEvent(e); }
// a player tells everyone (itself included): chat, heals
export function peerEvent(p) { const m = { ...p, from: me.id }; send('p', m); if (net.onPeer) net.onPeer(m, me.id); }
export function newCode() { const A = 'ABCDEFGHJKMNPQRSTUVWXYZ'; let s = ''; for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)]; return s; }
export const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
export const cleanName = (s) => String(s || '').replace(/https?:\/\/\S+|www\.\S+/gi, '').replace(/[<>{}]/g, '').trim().slice(0, 12);
