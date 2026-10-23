// Twisted Tower: the toons you play, the Twisteds that hunt you, the shop's items.
// Stats run 1–5 stars. derive() turns them into numbers the game uses.

export const TOONS = [
  { id: 'bun', name: ['小兔邦', 'Bun'], color: 0xff8fb8, color2: 0xfff2f6, ears: 'bunny',
    stats: { hp: 3, speed: 5, stamina: 3, stealth: 2, skill: 3, extract: 2 },
    ab: { id: 'dash', cd: 20, name: ['衝刺', 'Dash'], desc: ['一下子跑得飛快（2 秒）', 'A burst of speed (2 s)'] } },
  { id: 'gear', name: ['齒輪仔', 'Cog'], color: 0x9aa8b8, color2: 0xffc94a, ears: 'gear',
    stats: { hp: 3, speed: 2, stamina: 3, stealth: 3, skill: 3, extract: 5 },
    ab: { id: 'overclock', cd: 30, name: ['超頻', 'Overclock'], desc: ['身邊的機器立刻 +15%', 'The machine next to you gets +15% at once'] } },
  { id: 'petal', name: ['花瓣', 'Petal'], color: 0xffd23a, color2: 0xff7aa8, ears: 'petals',
    stats: { hp: 3, speed: 3, stamina: 3, stealth: 3, skill: 3, extract: 3 },
    ab: { id: 'heal', cd: 45, name: ['治療', 'Heal'], desc: ['自己和附近隊友各回 1 顆愛心', 'You and nearby teammates heal 1 heart'] } },
  { id: 'comet', name: ['小彗星', 'Comet'], color: 0x5ab0ff, color2: 0xfff07a, ears: 'star',
    stats: { hp: 2, speed: 4, stamina: 4, stealth: 3, skill: 5, extract: 3 },
    ab: { id: 'reveal', cd: 35, name: ['星光透視', 'Starsight'], desc: ['8 秒內在地圖上看到所有扭曲怪', 'See every Twisted on the map for 8 s'] } },
  { id: 'mopsy', name: ['綿綿', 'Mopsy'], color: 0xf4f0ea, color2: 0x6a5a8a, ears: 'fluff',
    stats: { hp: 3, speed: 3, stamina: 3, stealth: 5, skill: 2, extract: 3 },
    ab: { id: 'hide', cd: 35, name: ['躲進棉花', 'Fluff Hide'], desc: ['5 秒內扭曲怪看不到你', 'Twisteds can’t see you for 5 s'] } },
  { id: 'pip', name: ['波波', 'Pip'], color: 0xff5a4a, color2: 0x7ad8ff, ears: 'gumball',
    stats: { hp: 4, speed: 3, stamina: 2, stealth: 2, skill: 3, extract: 3 },
    ab: { id: 'decoy', cd: 30, name: ['彈珠誘餌', 'Gumball Decoy'], desc: ['丟出彈珠，把扭曲怪引過去', 'Throw a gumball that lures Twisteds away'] } },
];
export const TOON = Object.fromEntries(TOONS.map((t) => [t.id, t]));

export const STAT_NAMES = {
  hp: ['愛心', 'Hearts'], speed: ['速度', 'Speed'], stamina: ['體力', 'Stamina'],
  stealth: ['隱密', 'Stealth'], skill: ['技巧', 'Skill checks'], extract: ['萃取', 'Extraction'],
};

export function derive(t) {
  const s = t.stats;
  return {
    hearts: s.hp,
    walk: 4.4 + 0.35 * s.speed,               // studs a second
    sprint: (4.4 + 0.35 * s.speed) * 1.55,
    stamMax: 50 + 18 * s.stamina,             // a sprint drains 25 a second
    stealth: 1.35 - 0.13 * s.stealth,         // how far away a Twisted notices you (×)
    zone: 24 + 9 * s.skill,                   // the skill check's good arc, degrees
    rate: 1.8 + 0.55 * s.extract,             // % of a machine a second
  };
}

// the Twisteds: each is a twisted copy of a toon, with its own way of hunting
export const TWISTED = {
  stalker: { toon: 'petal', name: ['扭曲花瓣', 'Twisted Petal'], walk: 3.4, chase: 5.8, sense: 11, dmg: 1, desc: ['看得很遠', 'Sees far'] },
  roamer: { toon: 'pip', name: ['扭曲波波', 'Twisted Pip'], walk: 5.0, chase: 6.2, sense: 6.5, dmg: 1, desc: ['到處亂逛', 'Never stops wandering'] },
  sprinter: { toon: 'bun', name: ['扭曲小兔', 'Twisted Bun'], walk: 3.6, chase: 7.4, sense: 7, dmg: 1, desc: ['追起來超快', 'Very fast in a chase'] },
  listener: { toon: 'comet', name: ['扭曲彗星', 'Twisted Comet'], walk: 3.4, chase: 6.2, sense: 7, dmg: 1, hears: true, desc: ['聽得到整層樓的失誤聲', 'Hears every missed skill check'] },
  brute: { toon: 'gear', name: ['扭曲齒輪', 'Twisted Cog'], walk: 3.0, chase: 5.3, sense: 8.5, dmg: 2, desc: ['很慢，但一下扣 2 顆心', 'Slow, but hits for 2 hearts'] },
  phantom: { toon: 'mopsy', name: ['扭曲綿綿', 'Twisted Mopsy'], walk: 3.4, chase: 6.2, sense: 8, dmg: 1, ghost: true, desc: ['靠近才看得到', 'Invisible until close'] },
};
export const TW_TYPES = Object.keys(TWISTED);
// which Twisteds can appear on a floor: new ones join as you go deeper
export const twistedPool = (fl) => TW_TYPES.slice(0, Math.min(TW_TYPES.length, 1 + fl));

// items: three pockets; found on the floor or bought in the elevator shop with ichor
export const ITEMS = {
  bandage: { icon: '🩹', price: 14, name: ['繃帶', 'Bandage'], desc: ['回 1 顆愛心', 'Heal 1 heart'] },
  candy: { icon: '🍬', price: 9, name: ['加速糖', 'Speedy Candy'], desc: ['6 秒內跑得更快', 'Faster for 6 s'] },
  soda: { icon: '🥤', price: 7, name: ['體力汽水', 'Stamina Soda'], desc: ['體力全滿', 'Refill stamina'] },
  smoke: { icon: '💨', price: 11, name: ['煙霧彈', 'Smoke Puff'], desc: ['4 秒內扭曲怪看不到你', 'Twisteds can’t see you for 4 s'] },
  gum: { icon: '🫧', price: 10, name: ['專注泡泡糖', 'Focus Gum'], desc: ['接下來 3 次技巧檢定自動完美', 'Your next 3 skill checks are perfect'] },
  toy: { icon: '🧸', price: 9, name: ['發條玩具', 'Wind-up Toy'], desc: ['放下來吸引扭曲怪', 'Put it down to lure Twisteds'] },
};
export const ITEM_IDS = Object.keys(ITEMS);

export const SAYS = [
  ['這邊！', 'Over here!'], ['快跑！', 'Run!'], ['救命！', 'Help!'], ['我在修機器', 'Fixing a machine'],
  ['電梯開了！', 'Elevator’s open!'], ['小心怪物', 'Twisted nearby'], ['謝謝！', 'Thanks!'], ['加油！', 'You got this!'],
];
