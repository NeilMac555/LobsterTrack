'use strict';
/* Mutant Academy: Survivors — a Vampire Survivors-style auto-battler.
   The Danger Room is running INFERNO PROTOCOL with real pixel-art sprites
   (Calciumtrice CC-BY 3.0, tiles by Buch CC0 — see assets/CREDITS.md).
   Serve or open index.html to play. */

// ---------- canvas ----------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// ---------- helpers ----------
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function fmtTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
// deterministic 2D hash for world decoration
function hash2(x, y) {
  let n = (x * 374761393 + y * 668265263) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
}

// ---------- tiny synth sfx ----------
let audioCtx = null;
function sfx(freq, dur, type = 'square', vol = 0.06, slide = 0) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    if (slide) o.frequency.linearRampToValueAtTime(freq + slide, audioCtx.currentTime + dur);
    g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + dur);
  } catch (e) { /* audio unavailable — fine */ }
}
const sndHit = () => sfx(rand(180, 240), 0.06, 'square', 0.025);
const sndHurt = () => sfx(110, 0.2, 'sawtooth', 0.08, -40);
const sndGem = () => sfx(rand(700, 900), 0.07, 'sine', 0.05, 200);
const sndCoin = () => { sfx(988, 0.06, 'square', 0.05); setTimeout(() => sfx(1319, 0.14, 'square', 0.05), 60); };
const sndCrit = () => sfx(150, 0.12, 'square', 0.07, -60);
const sndLevel = () => { sfx(440, 0.12, 'square', 0.06); setTimeout(() => sfx(660, 0.12, 'square', 0.06), 90); setTimeout(() => sfx(880, 0.2, 'square', 0.06), 180); };
const sndBoss = () => sfx(70, 0.7, 'sawtooth', 0.1, -20);
const sndStreak = () => { sfx(330, 0.1, 'square', 0.07); setTimeout(() => sfx(494, 0.1, 'square', 0.07), 80); setTimeout(() => sfx(659, 0.22, 'square', 0.08), 160); };
const sndNuke = () => sfx(60, 1.2, 'sawtooth', 0.14, 500);
const sndChest = () => { [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => sfx(f, 0.18, 'square', 0.07), i * 110)); };

// ---------- chiptune music (procedural WebAudio sequencer, no assets) ----------
const music = { on: true, started: false, step: 0, nextT: 0, timer: null };
// A harmonic minor flavour: dark, driving
const M_BASS = [55, 55, 0, 55, 82.4, 0, 55, 0, 65.4, 65.4, 0, 65.4, 49, 0, 61.7, 0]; // A1 E2 C2 G1 B1
const M_ARP = [220, 261.6, 329.6, 261.6, 220, 329.6, 392, 329.6,
  261.6, 329.6, 415.3, 329.6, 246.9, 293.7, 370, 293.7]; // Am / C / E arps
function musicTick() {
  if (!music.on || !audioCtx) return;
  const bpm = 138, stepDur = 60 / bpm / 4;
  while (music.nextT < audioCtx.currentTime + 0.18) {
    const s = music.step % 16, bar = Math.floor(music.step / 16) % 4;
    const t = music.nextT;
    // kick on quarters, snare-ish noise on 2 & 4
    if (s % 4 === 0) beep(t, 90, 0.11, 'sine', 0.16, -55);
    if (s === 4 || s === 12) noiseHit(t, 0.06, 0.06);
    if (s % 2 === 1) noiseHit(t, 0.025, 0.025); // hats
    const b = M_BASS[s];
    if (b) beep(t, bar === 3 ? b * 0.75 : b, stepDur * 0.9, 'triangle', 0.12);
    const intense = state.time > 300;
    if (intense || s % 2 === 0) {
      const a = M_ARP[(s + bar * 4) % 16];
      beep(t, intense ? a * 2 : a, stepDur * 0.8, 'square', 0.028);
    }
    music.step++;
    music.nextT += stepDur;
  }
}
function beep(t, freq, dur, type, vol, slide = 0) {
  try {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.linearRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  } catch (e) {}
}
let noiseBuf = null;
function noiseHit(t, dur, vol) {
  try {
    if (!noiseBuf) {
      noiseBuf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.2, audioCtx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = audioCtx.createBufferSource(), g = audioCtx.createGain();
    src.buffer = noiseBuf;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(g); g.connect(audioCtx.destination);
    src.start(t); src.stop(t + dur + 0.02);
  } catch (e) {}
}
function startMusic() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (music.started) return;
    music.started = true;
    music.nextT = audioCtx.currentTime + 0.1;
    music.timer = setInterval(musicTick, 60);
  } catch (e) {}
}

// ---------- assets & sprite atlas ----------
const ASSET_FILES = ['warrior', 'wizard', 'ranger', 'rogue', 'cleric',
  'slime', 'goblin', 'skeleton', 'orc', 'minotaur', 'tiles'];
const assets = {};
function loadAssets() {
  return Promise.all(ASSET_FILES.map(name => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => { assets[name] = img; res(); };
    img.onerror = () => rej(new Error('failed to load assets/' + name + '.png'));
    // EMBEDDED_ASSETS lets a single-file bundle (e.g. the published demo) inline
    // the sheets as data URIs instead of fetching from assets/
    img.src = (typeof EMBEDDED_ASSETS !== 'undefined' && EMBEDDED_ASSETS[name]) || ('assets/' + name + '.png');
  })));
}

// Every sheet is 10 frames per row. rows map anim -> row index.
const STD = { idle: 0, walk: 2, attack: 3, death: 4 };
const SHEETS = {
  warrior:  { file: 'warrior',  size: 32, rows: STD },
  wizard:   { file: 'wizard',   size: 32, rows: STD },
  ranger:   { file: 'ranger',   size: 32, rows: STD },
  rogue:    { file: 'rogue',    size: 32, rows: STD },
  cleric:   { file: 'cleric',   size: 32, rows: STD },
  slime:    { file: 'slime',    size: 32, rows: { idle: 0, walk: 1, attack: 3, death: 4 } },
  slimeB:   { file: 'slime',    size: 32, rows: { idle: 5, walk: 6, attack: 8, death: 9 } },
  slimeR:   { file: 'slime',    size: 32, rows: { idle: 10, walk: 11, attack: 13, death: 14 } },
  slimeY:   { file: 'slime',    size: 32, rows: { idle: 15, walk: 16, attack: 18, death: 19 } },
  goblin:   { file: 'goblin',   size: 32, rows: STD },
  goblinB:  { file: 'goblin',   size: 32, rows: { idle: 5, walk: 7, attack: 8, death: 9 } },
  skeleton: { file: 'skeleton', size: 32, rows: STD },
  orcA:     { file: 'orc',      size: 32, rows: STD },
  orc:      { file: 'orc',      size: 32, rows: { idle: 5, walk: 7, attack: 8, death: 9 } },
  minotaur: { file: 'minotaur', size: 48, rows: { idle: 0, walk: 1, attack: 3, death: 4 } },
};

const SCALE = 2; // 1 sprite pixel = 2 world pixels

// Draw a sheet frame with its feet anchored at (x, groundY).
function drawSprite(sheetKey, anim, frame, x, groundY, flip, scale = SCALE, tint = null) {
  const def = SHEETS[sheetKey];
  const img = assets[def.file];
  if (!img) return;
  const s = def.size;
  const row = def.rows[anim] ?? def.rows.idle;
  ctx.save();
  ctx.translate(x, groundY);
  if (flip) ctx.scale(-1, 1);
  if (tint) ctx.filter = tint;
  // sprites sit ~3px above the cell bottom
  ctx.drawImage(img, frame * s, row * s, s, s,
    -s * scale / 2, -s * scale + 3 * scale, s * scale, s * scale);
  ctx.restore();
}
function animFrame(animT, anim) {
  if (anim === 'death') return Math.min(9, Math.floor(animT * 12));
  if (anim === 'attack') return Math.floor(animT * 20) % 10;
  return Math.floor(animT * 10) % 10;
}
function drawShadow(c, x, y, r) {
  c.fillStyle = 'rgba(0,0,0,0.3)';
  c.beginPath(); c.ellipse(x, y, r, r * 0.3, 0, 0, TAU); c.fill();
}

// ---------- floor, obstacles & braziers (Buch dungeon tileset, 16px tiles) ----------
const T = 16, TILE = T * SCALE; // 32px world tiles
const FLOOR_TILES = [
  [3, 3], [4, 3], [3, 4], [4, 4], [5, 4], [4, 5], [5, 5], [3, 3], [4, 4], [3, 4],
  [5, 3], [3, 5], // speckled variants, kept rare
];

// deterministic environment: solid crate/barrel obstacles + destructible braziers
function obstacleAt(ix, iy) { const h = hash2(ix * 13 + 7, iy * 17 + 3); return h % 67 === 0 ? h : 0; }
function brazierAt(ix, iy) { const h = hash2(ix * 3 + 1, iy * 5 + 9); return h % 131 === 0 ? h : 0; }
const BRAZIER_HP = 26;
const brazierDamageMap = new Map(); // "ix,iy" -> damage taken
const brazierDead = new Set();

function scanEnv() {
  // rebuild the nearby obstacle/brazier lists once per frame
  const w = canvas.width, h = canvas.height, M = 120;
  const x0 = Math.floor((player.x - w / 2 - M) / TILE), x1 = Math.ceil((player.x + w / 2 + M) / TILE);
  const y0 = Math.floor((player.y - h / 2 - M) / TILE), y1 = Math.ceil((player.y + h / 2 + M) / TILE);
  const obs = [], braz = [];
  for (let iy = y0; iy <= y1; iy++) {
    for (let ix = x0; ix <= x1; ix++) {
      const oh = obstacleAt(ix, iy);
      if (oh) {
        obs.push({ x: ix * TILE + TILE, y: iy * TILE + TILE / 2, r: oh % 2 ? 26 : 30, kind: oh % 2 });
        continue;
      }
      if (brazierAt(ix, iy)) {
        const key = ix + ',' + iy;
        if (!brazierDead.has(key)) {
          braz.push({ key, x: ix * TILE + TILE / 2, y: iy * TILE + TILE / 2, r: 14 });
        }
      }
    }
  }
  state.obsList = obs;
  state.brazList = braz;
}

function resolveObstacles(ent) {
  if (!state.obsList) return;
  const er = ent.r || 12;
  for (const o of state.obsList) {
    const dx = ent.x - o.x, dy = ent.y - o.y;
    const min = o.r + er;
    const d2 = dx * dx + dy * dy;
    if (d2 < min * min && d2 > 0.01) {
      const d = Math.sqrt(d2);
      ent.x = o.x + (dx / d) * min;
      ent.y = o.y + (dy / d) * min;
    }
  }
}

// braziers are the slot-machine lamps: break one, get a prize
function damageBrazier(bz, dmg) {
  const cur = (brazierDamageMap.get(bz.key) || 0) + dmg;
  brazierDamageMap.set(bz.key, cur);
  effects.push({ type: 'boom', x: bz.x, y: bz.y - 16, radius: 18, life: 0.15, maxLife: 0.15 });
  if (cur < BRAZIER_HP) return;
  brazierDead.add(bz.key);
  brazierDamageMap.delete(bz.key);
  const roll = Math.random();
  if (roll < 0.45) pickups.push({ x: bz.x, y: bz.y, type: 'gold', v: randInt_(15, 40) });
  else if (roll < 0.70) pickups.push({ x: bz.x, y: bz.y, type: 'med' });
  else if (roll < 0.85) gems.push({ x: bz.x, y: bz.y, v: 8 });
  else if (roll < 0.96) pickups.push({ x: bz.x, y: bz.y, type: 'vac' });
  else pickups.push({ x: bz.x, y: bz.y, type: 'nuke' });
  effects.push({ type: 'boom', x: bz.x, y: bz.y - 10, radius: 40, life: 0.3, maxLife: 0.3 });
  sfx(400, 0.15, 'triangle', 0.07, -150);
}

function drawFloor(camX, camY, w, h) {
  const img = assets.tiles;
  const x0 = Math.floor(camX / TILE), y0 = Math.floor(camY / TILE);
  const x1 = Math.ceil((camX + w) / TILE), y1 = Math.ceil((camY + h) / TILE);
  for (let iy = y0; iy <= y1; iy++) {
    for (let ix = x0; ix <= x1; ix++) {
      const hsh = hash2(ix, iy);
      const [tx, ty] = FLOOR_TILES[hsh % FLOOR_TILES.length];
      ctx.drawImage(img, tx * T, ty * T, T, T, ix * TILE, iy * TILE, TILE, TILE);
    }
  }
}

function drawObstacle(o) {
  const img = assets.tiles;
  if (o.kind === 0) { // 2x2 crate stack
    for (const [ox, oy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
      ctx.drawImage(img, 9 * T, (7 + (ox + oy & 1)) * T, T, T,
        o.x + ox * TILE, o.y - TILE / 2 + oy * TILE + TILE / 2, TILE, TILE);
    }
  } else { // barrel pair
    ctx.drawImage(img, 12 * T, 7 * T, T, T, o.x - TILE, o.y - TILE / 2, TILE, TILE);
    ctx.drawImage(img, 12 * T, 7 * T, T, T, o.x, o.y - TILE / 2 - 4, TILE, TILE);
  }
}

function drawBrazier(bz) {
  const img = assets.tiles;
  ctx.drawImage(img, 12 * T, 8 * T, T, 2 * T, bz.x - TILE / 2, bz.y - TILE - TILE / 2, TILE, 2 * TILE);
  const flicker = 0.5 + Math.sin(state.time * 9 + bz.x) * 0.15;
  const grad = ctx.createRadialGradient(bz.x, bz.y - TILE / 2, 4, bz.x, bz.y - TILE / 2, 80);
  grad.addColorStop(0, `rgba(255,170,60,${0.24 * flicker})`);
  grad.addColorStop(1, 'rgba(255,170,60,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(bz.x - 80, bz.y - TILE / 2 - 80, 160, 160);
  if (brazierDamageMap.get(bz.key) > 0) { // cracked once hit
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(bz.x - 6, bz.y - 8, 12, 4);
  }
}

// ---------- game constants ----------
const WIN_TIME = 15 * 60;           // survive this long to win
const MAX_WEAPONS = 4, MAX_PASSIVES = 4, MAX_LEVEL = 5;

// ---------- state ----------
const state = {
  running: false, paused: false, over: false,
  time: 0, kills: 0, level: 1, xp: 0, xpNeed: 10, gold: 0,
  spawnTimer: 0, bossesSpawned: 0, eventsFired: 0, elitesSpawned: 0,
  shake: 0, flash: 0, killTimes: [], streakTier: 0,
};

// VS-style wave table: one entry per minute. `min` is the enemy-count quota —
// below it the spawner force-fills, so the screen is never quiet.
// Each minute headlines a NEW, visually distinct enemy (first type = most common).
const WAVES = [
  { types: ['slime'],                          min: 14,  interval: 0.9 },
  { types: ['skeleton', 'slime'],              min: 24,  interval: 0.8 },
  { types: ['goblin', 'skeleton'],             min: 34,  interval: 0.7 },
  { types: ['blueslime', 'goblin', 'skeleton'], min: 45, interval: 0.6 },
  { types: ['brute', 'blueslime', 'skeleton'], min: 56,  interval: 0.55 },
  { types: ['brute', 'goblin', 'blueslime'],   min: 68,  interval: 0.5 },
  { types: ['redslime', 'brute', 'skeleton'],  min: 80,  interval: 0.45 },
  { types: ['raider', 'redslime', 'blueslime'], min: 92, interval: 0.42 },
  { types: ['raider', 'brute', 'redslime'],    min: 105, interval: 0.4 },
  { types: ['orc', 'raider', 'redslime'],      min: 120, interval: 0.36 },
  { types: ['orc', 'raider', 'blueslime'],     min: 135, interval: 0.33 },
  { types: ['voltslime', 'orc', 'raider'],     min: 150, interval: 0.3 },
  { types: ['voltslime', 'orc', 'redslime'],   min: 165, interval: 0.28 },
  { types: ['orc', 'voltslime', 'raider'],     min: 185, interval: 0.26 },
  { types: ['voltslime', 'orc', 'redslime'],   min: 205, interval: 0.25 },
];
function currentWave() { return WAVES[Math.min(WAVES.length - 1, Math.floor(state.time / 60))]; }

// map events: every 30s, alternating a converging ring and a screen-sweeping swarm
const EVENT_PERIOD = 30;

const player = {
  x: 0, y: 0, r: 14, speed: 150, hp: 100, maxHp: 100,
  regen: 0, armor: 0, magnetR: 70, dmgMult: 1, cdMult: 1,
  facing: { x: 1, y: 0 }, hurtCd: 0, color: '#ffd23e', name: '',
  sprite: 'ranger', face: 1, moving: false, animT: 0, attackAge: 99,
  weapons: [], passives: {},
};

const enemies = [], corpses = [], bullets = [], gems = [], effects = [], texts = [], pickups = [];

// ---------- weapons ----------
const WEAPON_DEFS = {
  optic: {
    name: 'Optic Blast', icon: '\u{1F453}',
    desc: 'Fires a searing energy beam at the nearest threat.',
    cd: 0.9,
    fire(w) {
      const n = 1 + Math.floor((w.level - 1) / 2); // 1,1,2,2,3
      const targets = nearestEnemies(n);
      if (!targets.length) return false;
      for (const t of targets) {
        const a = Math.atan2(t.y - player.y, t.x - player.x);
        bullets.push({
          x: player.x, y: player.y - 14, vx: Math.cos(a) * 560, vy: Math.sin(a) * 560,
          r: 5, dmg: (10 + w.level * 5) * player.dmgMult, life: 1.2,
          color: '#ff4444', pierce: w.level >= 4 ? 1 : 0,
        });
      }
      sfx(520, 0.05, 'square', 0.03);
      return true;
    },
  },
  claws: {
    name: 'Adamant Claws', icon: '\u{1FA93}',
    desc: 'A savage melee slash in the direction you move.',
    cd: 1.0,
    fire(w) {
      const range = 85 + w.level * 15;
      const arc = (100 + w.level * 12) * Math.PI / 180;
      const fa = Math.atan2(player.facing.y, player.facing.x);
      const dirs = w.level >= 5 ? [fa, fa + Math.PI] : [fa];
      let hitAny = false;
      for (const dir of dirs) {
        effects.push({ type: 'slash', x: player.x, y: player.y, a: dir, arc, range, life: 0.18, maxLife: 0.18 });
        for (const e of enemies) {
          if (dist2(e.x, e.y, player.x, player.y) > (range + e.r) ** 2) continue;
          let da = Math.atan2(e.y - player.y, e.x - player.x) - dir;
          while (da > Math.PI) da -= TAU;
          while (da < -Math.PI) da += TAU;
          if (Math.abs(da) < arc / 2) {
            damageEnemy(e, (16 + w.level * 8) * player.dmgMult);
            e.x += Math.cos(dir) * 14; e.y += Math.sin(dir) * 14; // knockback
            hitAny = true;
          }
        }
        for (const bz of state.brazList || []) {
          if (dist2(bz.x, bz.y, player.x, player.y) < (range + 14) ** 2) damageBrazier(bz, 20);
        }
      }
      if (hitAny) sfx(300, 0.06, 'sawtooth', 0.04);
      return true;
    },
  },
  storm: {
    name: 'Storm Call', icon: '⚡',
    desc: 'Lightning hammers random enemies near you.',
    cd: 2.2,
    fire(w) {
      const bolts = 1 + w.level;
      const inRange = enemies.filter(e => dist2(e.x, e.y, player.x, player.y) < 380 ** 2);
      if (!inRange.length) return false;
      for (let i = 0; i < bolts; i++) {
        const t = pick(inRange);
        damageEnemy(t, (20 + w.level * 9) * player.dmgMult);
        effects.push({ type: 'bolt', x: t.x, y: t.y, life: 0.22, maxLife: 0.22 });
      }
      sfx(1200, 0.1, 'sawtooth', 0.035, -600);
      return true;
    },
  },
  orbs: {
    name: 'Magno Orbs', icon: '\u{1FAA8}',
    desc: 'Magnetically levitated shards orbit and shred on contact.',
    cd: 0, // continuous — handled in update
    fire() { return false; },
    passiveOrbit: true,
  },
  nova: {
    name: 'Psi Nova', icon: '\u{1F52E}',
    desc: 'A telepathic shockwave ripples out, hitting everything.',
    cd: 3.4,
    fire(w) {
      const radius = 150 + w.level * 35;
      effects.push({ type: 'nova', x: player.x, y: player.y, radius, life: 0.4, maxLife: 0.4 });
      for (const e of enemies) {
        if (dist2(e.x, e.y, player.x, player.y) < (radius + e.r) ** 2) {
          damageEnemy(e, (14 + w.level * 7) * player.dmgMult);
        }
      }
      for (const bz of state.brazList || []) {
        if (dist2(bz.x, bz.y, player.x, player.y) < (radius + 14) ** 2) damageBrazier(bz, 15);
      }
      sfx(200, 0.3, 'sine', 0.07, 150);
      return true;
    },
  },
  cards: {
    name: 'Kinetic Cards', icon: '\u{1F0CF}',
    desc: 'Charged playing cards that detonate on impact.',
    cd: 1.3,
    fire(w) {
      const n = 1 + Math.floor(w.level / 2); // 1,2,2,3,3
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU);
        bullets.push({
          x: player.x, y: player.y - 14, vx: Math.cos(a) * 340, vy: Math.sin(a) * 340,
          r: 6, dmg: (14 + w.level * 6) * player.dmgMult, life: 1.4,
          color: '#d477ff', aoe: 55 + w.level * 8, spin: true,
        });
      }
      sfx(660, 0.05, 'triangle', 0.03);
      return true;
    },
  },
};

// ---------- passives ----------
const PASSIVE_DEFS = {
  boots: { name: 'Blur Boots', icon: '\u{1F45F}', desc: '+12% movement speed per rank.',
    apply() { player.speed *= 1.12; } },
  vitality: { name: 'Healing Factor', icon: '❤️', desc: '+25 max HP and heals 25 per rank.',
    apply() { player.maxHp += 25; player.hp = Math.min(player.maxHp, player.hp + 25); } },
  regen: { name: 'Regeneration', icon: '\u{1F9EC}', desc: 'Recover +0.6 HP per second per rank.',
    apply() { player.regen += 0.6; } },
  magnet: { name: 'Psychic Pull', icon: '\u{1F9F2}', desc: '+35% gene-shard pickup radius per rank.',
    apply() { player.magnetR *= 1.35; } },
  power: { name: 'Omega Gene', icon: '\u{1F4A5}', desc: '+12% damage on all powers per rank.',
    apply() { player.dmgMult *= 1.12; } },
  focus: { name: 'Combat Focus', icon: '\u{1F3AF}', desc: 'Powers recharge 10% faster per rank.',
    apply() { player.cdMult *= 0.9; } },
  plating: { name: 'Steel Skin', icon: '\u{1F6E1}️', desc: 'Blocks 2 damage from every hit per rank.',
    apply() { player.armor += 2; } },
};

// ---------- heroes (Danger Room avatars) ----------
const HEROES = [
  { id: 'visor', name: 'Visor', sprite: 'ranger', color: '#ff5555',
    tag: 'Ranged striker', desc: 'Leader of the class. Optic Blast snipes the nearest threat. Balanced stats.',
    weapon: 'optic', mods: () => {} },
  { id: 'wildcat', name: 'Wildcat', sprite: 'warrior', color: '#f4c542',
    tag: 'Melee brawler', desc: 'Adamant Claws shred everything in reach. Tougher (+30 HP), heals faster.',
    weapon: 'claws', mods: () => { player.maxHp += 30; player.hp += 30; player.regen += 0.4; } },
  { id: 'skywitch', name: 'Sky Witch', sprite: 'wizard', color: '#7fd4ff',
    tag: 'Area caster', desc: 'Storm Call drops lightning on the horde. Wide pickup aura, fragile (-15 HP).',
    weapon: 'storm', mods: () => { player.magnetR *= 1.6; player.maxHp -= 15; player.hp -= 15; } },
  { id: 'ace', name: 'Ace', sprite: 'rogue', color: '#d477ff',
    tag: 'Skirmisher', desc: 'Kinetic Cards detonate on impact. Moves 12% faster.',
    weapon: 'cards', mods: () => { player.speed *= 1.12; } },
  { id: 'mender', name: 'Mender', sprite: 'cleric', color: '#5fd47f',
    tag: 'Psi tank', desc: 'Psi Nova pulses damage all around. Strong regeneration (+1 HP/s).',
    weapon: 'nova', mods: () => { player.regen += 1.0; player.maxHp += 10; player.hp += 10; } },
];

// ---------- weapon/passive management ----------
function addWeapon(id) {
  const w = player.weapons.find(w => w.id === id);
  if (w) { w.level = Math.min(MAX_LEVEL, w.level + 1); }
  else player.weapons.push({ id, level: 1, timer: 0, orbitA: 0 });
}
function addPassive(id) {
  player.passives[id] = (player.passives[id] || 0) + 1;
  PASSIVE_DEFS[id].apply();
}

function nearestEnemies(n) {
  return enemies
    .map(e => ({ e, d: dist2(e.x, e.y, player.x, player.y) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map(o => o.e);
}

// ---------- enemies ----------
// Nine visually distinct threats — one new face (and colour) per wave.
// move: hop = pulsing lunges, zigzag = weaving, charge = windup then rush,
//       orbit = circles you at mid range, then bleeds inward
const ENEMY_TYPES = {
  slime:    { sprite: 'slime',    name: 'TRAINING OOZE', hp: 8,   speed: 60,  dmg: 8,  r: 10, xp: 1, move: 'hop' },
  skeleton: { sprite: 'skeleton', name: 'BONE WALKER',   hp: 26,  speed: 68,  dmg: 12, r: 11, xp: 2, move: 'zigzag' },
  goblin:   { sprite: 'goblin',   name: 'GREMLIN',       hp: 18,  speed: 92,  dmg: 10, r: 10, xp: 2, move: 'straight' },
  blueslime:{ sprite: 'slimeB',   name: 'FROST OOZE',    hp: 45,  speed: 66,  dmg: 14, r: 11, xp: 3, move: 'hop' },
  brute:    { sprite: 'orcA',     name: 'PIT BRUTE',     hp: 110, speed: 52,  dmg: 20, r: 13, xp: 5, move: 'charge' },
  redslime: { sprite: 'slimeR',   name: 'MAGMA OOZE',    hp: 75,  speed: 62,  dmg: 18, r: 11, xp: 4, move: 'hop' },
  raider:   { sprite: 'goblinB',  name: 'NIGHT RAIDER',  hp: 70,  speed: 108, dmg: 16, r: 10, xp: 5, move: 'orbit' },
  orc:      { sprite: 'orc',      name: 'WAR CHIEF',     hp: 180, speed: 50,  dmg: 26, r: 13, xp: 7, move: 'charge' },
  voltslime:{ sprite: 'slimeY',   name: 'VOLT OOZE',     hp: 60,  speed: 95,  dmg: 18, r: 11, xp: 6, move: 'hop' },
};
const BOSSES = [
  { at: 300, name: 'MINOTAUR PROTOCOL MK-I', hp: 900, speed: 50, dmg: 25, r: 26,
    xp: 50, scale: 2.2, tint: null },
  { at: 600, name: 'MINOTAUR PROTOCOL MK-II', hp: 2600, speed: 55, dmg: 32, r: 32,
    xp: 90, scale: 2.8, tint: 'hue-rotate(140deg) saturate(1.4)' },
  { at: 840, name: 'OMEGA MINOTAUR', hp: 6500, speed: 60, dmg: 42, r: 40,
    xp: 150, scale: 3.6, tint: 'hue-rotate(250deg) saturate(1.6)' },
];

function hpScale() {
  const m = state.time / 60;
  return 1 + m * 0.5 + m * m * 0.045; // steeper than linear — late waves must threaten
}
function dmgScale() { return 1 + (state.time / 60) * 0.06; }
function spdScale() { return 1 + (state.time / 60) * 0.02; }

function spawnRadius() { return Math.max(canvas.width, canvas.height) / 2 + 80; }

function makeEnemy(kind, x, y, opts = {}) {
  const t = ENEMY_TYPES[kind];
  const hpMul = (opts.hpMul ?? 1) * rand(0.85, 1.25);
  const hp = t.hp * hpScale() * hpMul;
  return {
    x, y, hp, maxHp: hp,
    speed: t.speed * spdScale() * rand(0.9, 1.1) * (opts.spdMul ?? 1),
    dmg: t.dmg * dmgScale(), r: t.r, xp: Math.ceil(t.xp * (opts.xpMul ?? 1)),
    sprite: t.sprite, scale: (opts.scale ?? SCALE), tint: opts.tint ?? null,
    move: t.move, boss: false, elite: !!opts.elite, sweep: opts.sweep ?? null,
    flash: 0, animT: rand(0, 10), chargeT: rand(0, 4),
    orbitSign: Math.random() < 0.5 ? 1 : -1,
  };
}

const seenTypes = new Set();
function announceType(kind) {
  if (seenTypes.has(kind)) return;
  seenTypes.add(kind);
  if (kind === 'slime') return; // opening fodder needs no fanfare
  texts.push({ x: player.x, y: player.y - 130, str: `NEW THREAT: ${ENEMY_TYPES[kind].name}`,
    color: '#ff9a5a', life: 2.2, vy: -8, big: true });
  sfx(160, 0.35, 'sawtooth', 0.07, 60);
}

function pickWeighted(types) {
  return Math.random() < 0.55 ? types[0] : pick(types);
}

function spawnEnemy(kind) {
  if (enemies.length > 500) return;
  announceType(kind);
  const a = rand(0, TAU), d = spawnRadius();
  enemies.push(makeEnemy(kind, player.x + Math.cos(a) * d, player.y + Math.sin(a) * d));
}

function spawnElite() {
  const wave = currentWave();
  const kind = pick(wave.types);
  const a = rand(0, TAU), d = spawnRadius();
  const e = makeEnemy(kind, player.x + Math.cos(a) * d, player.y + Math.sin(a) * d,
    { hpMul: 12, xpMul: 6, scale: SCALE * 1.5, spdMul: 0.85, elite: true,
      tint: 'saturate(2.2) brightness(1.15)' });
  enemies.push(e);
  texts.push({ x: player.x, y: player.y - 100, str: `⚠ ELITE ${ENEMY_TYPES[kind].name} ⚠`,
    color: '#ffb040', life: 2, vy: -12, big: true });
}

// ring event: a circle of weak fodder closes in — carve your way out
function spawnRing() {
  const wave = currentWave();
  const kind = wave.types[0];
  const n = 42, d = Math.min(canvas.width, canvas.height) / 2 + 60;
  for (let i = 0; i < n; i++) {
    const a = (TAU * i) / n;
    enemies.push(makeEnemy(kind, player.x + Math.cos(a) * d, player.y + Math.sin(a) * d,
      { hpMul: 0.5, spdMul: 1.35, xpMul: 1 }));
  }
  texts.push({ x: player.x, y: player.y - 100, str: '⚠ SURROUNDED ⚠', color: '#ff7040', life: 1.6, vy: -12, big: true });
  sfx(220, 0.4, 'sawtooth', 0.08, -80);
}

// sweep event: a wall of 1-hit fodder charges across the screen — mow them down
function spawnSweep() {
  const a = rand(0, TAU);
  const dirX = -Math.cos(a), dirY = -Math.sin(a);
  const d = spawnRadius() + 40;
  const cx = player.x + Math.cos(a) * d, cy = player.y + Math.sin(a) * d;
  const px = -dirY, py = dirX; // perpendicular
  const spd = 170;
  for (let i = -14; i <= 14; i++) {
    const e = makeEnemy('skeleton', cx + px * i * 34 + rand(-10, 10), cy + py * i * 34 + rand(-10, 10),
      { hpMul: 0.06, xpMul: 1, spdMul: 1 });
    e.sweep = { vx: dirX * spd, vy: dirY * spd, life: 14 };
    enemies.push(e);
  }
  texts.push({ x: player.x, y: player.y - 100, str: '⚠ HORDE INCOMING ⚠', color: '#7fd4ff', life: 1.6, vy: -12, big: true });
  sfx(180, 0.5, 'sawtooth', 0.07, 120);
}

function spawnBoss(def) {
  const a = rand(0, TAU);
  const d = Math.max(canvas.width, canvas.height) / 2 + 100;
  enemies.push({
    x: player.x + Math.cos(a) * d, y: player.y + Math.sin(a) * d,
    hp: def.hp, maxHp: def.hp, speed: def.speed, dmg: def.dmg, r: def.r,
    xp: def.xp, sprite: 'minotaur', scale: def.scale, tint: def.tint,
    boss: true, name: def.name, flash: 0, animT: rand(0, 10),
  });
  texts.push({ x: player.x, y: player.y - 120, str: `⚠ ${def.name} INBOUND ⚠`,
    color: '#ff4040', life: 2.5, vy: -10, big: true });
  sndBoss();
  state.shake = 12;
}

let lastHitSnd = 0;
function damageEnemy(e, dmg) {
  const crit = Math.random() < 0.12;
  if (crit) dmg *= 2.2;
  e.hp -= dmg;
  e.flash = 0.1;
  // cap floating-text and sfx churn so mass hits don't tank the frame rate
  if (texts.length < 90 || crit) {
    texts.push({ x: e.x + rand(-8, 8), y: e.y - e.r - 20, str: Math.round(dmg).toString(),
      color: crit ? '#ff9030' : '#ffe28a', life: crit ? 0.8 : 0.6, vy: crit ? -70 : -50, big: crit });
  }
  const now = performance.now();
  if (now - lastHitSnd > 40) {
    lastHitSnd = now;
    if (crit) sndCrit(); else sndHit();
  }
  if (e.hp <= 0) killEnemy(e);
}

function trackStreak() {
  const now = state.time;
  state.killTimes.push(now);
  while (state.killTimes.length && state.killTimes[0] < now - 3) state.killTimes.shift();
  const n = state.killTimes.length;
  const tier = n >= 90 ? 3 : n >= 45 ? 2 : n >= 20 ? 1 : 0;
  if (tier > state.streakTier) {
    const label = ['', 'RAMPAGE!', 'MASSACRE!!', 'ANNIHILATION!!!'][tier];
    texts.push({ x: player.x, y: player.y - 70, str: `${label} x${n}`,
      color: '#ffd23e', life: 1.4, vy: -30, big: true });
    sndStreak();
    state.shake = Math.max(state.shake, 4 + tier * 2);
  }
  state.streakTier = tier;
}

function killEnemy(e) {
  const i = enemies.indexOf(e);
  if (i === -1) return;
  enemies.splice(i, 1);
  state.kills++;
  trackStreak();
  corpses.push({ sprite: e.sprite, scale: e.scale, tint: e.tint,
    x: e.x, y: e.y, groundY: groundYOf(e), flip: player.x < e.x, animT: 0 });
  if (e.boss || e.elite) {
    for (let g = 0; g < 8; g++) {
      const a = rand(0, TAU), d = rand(10, 60);
      gems.push({ x: e.x + Math.cos(a) * d, y: e.y + Math.sin(a) * d, v: Math.ceil(e.xp / 8) });
    }
    pickups.push({ x: e.x, y: e.y, type: 'chest' }); // jackpot time
    state.shake = 8;
  } else {
    gems.push({ x: e.x, y: e.y, v: e.xp });
    if (Math.random() < 0.04) pickups.push({ x: e.x + rand(-8, 8), y: e.y + rand(-8, 8), type: 'gold', v: randInt_(5, 15) });
    if (gems.length > 450) {
      const old = gems.shift();
      gems[Math.floor(Math.random() * gems.length)].v += old.v;
    }
  }
}
function randInt_(a, b) { return Math.floor(rand(a, b + 1)); }

function groundYOf(e) { return e.y + e.r * 0.9; }

// ---------- player damage / xp ----------
function hurtPlayer(dmg) {
  if (player.hurtCd > 0) return;
  const taken = Math.max(1, dmg - player.armor);
  player.hp -= taken;
  player.hurtCd = 0.5;
  state.shake = Math.max(state.shake, 5);
  texts.push({ x: player.x, y: player.y - 40, str: `-${Math.round(taken)}`, color: '#ff6060', life: 0.7, vy: -40 });
  sndHurt();
  if (player.hp <= 0) endGame(false);
}

function gainXp(v) {
  state.xp += v;
  while (state.xp >= state.xpNeed) {
    state.xp -= state.xpNeed;
    state.level++;
    state.xpNeed = Math.floor(10 + state.level * 7 + state.level * state.level * 0.5);
    sndLevel();
    showLevelUp();
  }
}

// ---------- level-up UI ----------
const levelupScreen = document.getElementById('levelup-screen');
const levelupCards = document.getElementById('levelup-cards');

function upgradeChoices() {
  const opts = [];
  for (const w of player.weapons) {
    if (w.level < MAX_LEVEL) {
      const def = WEAPON_DEFS[w.id];
      opts.push({ kind: 'weapon', id: w.id, title: `${def.name} → Rank ${w.level + 1}`,
        icon: def.icon, tag: 'power up', desc: def.desc });
    }
  }
  if (player.weapons.length < MAX_WEAPONS) {
    for (const id of Object.keys(WEAPON_DEFS)) {
      if (!player.weapons.find(w => w.id === id)) {
        const def = WEAPON_DEFS[id];
        opts.push({ kind: 'weapon', id, title: def.name, icon: def.icon, tag: 'new power', desc: def.desc });
      }
    }
  }
  for (const id of Object.keys(PASSIVE_DEFS)) {
    const rank = player.passives[id] || 0;
    const isNew = rank === 0;
    if (isNew && Object.keys(player.passives).length >= MAX_PASSIVES) continue;
    if (rank >= MAX_LEVEL) continue;
    const def = PASSIVE_DEFS[id];
    opts.push({ kind: 'passive', id, title: isNew ? def.name : `${def.name} → Rank ${rank + 1}`,
      icon: def.icon, tag: isNew ? 'new trait' : 'trait up', desc: def.desc });
  }
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  const picked = opts.slice(0, 3);
  if (!picked.length) {
    picked.push({ kind: 'heal', title: 'Field Medkit', icon: '\u{1F3E5}', tag: 'recovery',
      desc: 'Everything is maxed out. Restore 50 HP instead.' });
  }
  return picked;
}

// ---------- chest jackpot (the slot-machine moment) ----------
const chestScreen = document.getElementById('chest-screen');
const chestRewards = document.getElementById('chest-rewards');
const chestGoldEl = document.getElementById('chest-gold');
const chestContinue = document.getElementById('chest-continue');

function chestUpgrade() {
  const opts = [];
  for (const w of player.weapons) if (w.level < MAX_LEVEL) opts.push({ kind: 'weapon', id: w.id });
  for (const [id, rank] of Object.entries(player.passives)) if (rank < MAX_LEVEL) opts.push({ kind: 'passive', id });
  return opts.length ? pick(opts) : null;
}

function openChest() {
  state.paused = true;
  sndChest();
  state.flash = 0.3;
  const roll = Math.random();
  const n = roll < 0.6 ? 1 : roll < 0.92 ? 3 : 5; // jackpot odds, VS-style
  const goldBonus = randInt_(20, 60) * n;
  state.gold += goldBonus;
  chestRewards.innerHTML = '';
  chestContinue.classList.add('hidden');
  chestGoldEl.innerHTML = '';
  const rewards = [];
  for (let i = 0; i < n; i++) {
    const up = chestUpgrade();
    if (up) {
      if (up.kind === 'weapon') addWeapon(up.id); else addPassive(up.id);
      const def = up.kind === 'weapon' ? WEAPON_DEFS[up.id] : PASSIVE_DEFS[up.id];
      const rank = up.kind === 'weapon'
        ? player.weapons.find(w => w.id === up.id).level
        : player.passives[up.id];
      rewards.push({ icon: def.icon, title: `${def.name} → Rank ${rank}`, tag: 'upgraded' });
    } else {
      const extra = randInt_(30, 80);
      state.gold += extra;
      rewards.push({ icon: '\u{1FA99}', title: `+${extra} gold`, tag: 'bonus' });
    }
  }
  rewards.forEach((rw, i) => {
    setTimeout(() => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.textAlign = 'center';
      card.innerHTML = `<div class="icon">${rw.icon}</div><div class="tag">${rw.tag}</div><h3>${rw.title}</h3>`;
      chestRewards.appendChild(card);
      sfx(600 + i * 140, 0.15, 'square', 0.07);
      if (i === rewards.length - 1) {
        chestGoldEl.innerHTML = `\u{1FA99} +${goldBonus} gold`;
        chestContinue.classList.remove('hidden');
      }
    }, 350 + i * 450);
  });
  chestScreen.classList.remove('hidden');
}
chestContinue.onclick = () => {
  chestScreen.classList.add('hidden');
  if (levelupScreen.classList.contains('hidden')) state.paused = false;
};

function showLevelUp() {
  state.paused = true;
  state.flash = Math.max(state.flash, 0.35);
  levelupCards.innerHTML = '';
  for (const opt of upgradeChoices()) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<div class="icon">${opt.icon}</div><div class="tag">${opt.tag}</div>
      <h3>${opt.title}</h3><p>${opt.desc}</p>`;
    card.onclick = () => {
      if (opt.kind === 'weapon') addWeapon(opt.id);
      else if (opt.kind === 'passive') addPassive(opt.id);
      else player.hp = Math.min(player.maxHp, player.hp + 50);
      levelupScreen.classList.add('hidden');
      if (chestScreen.classList.contains('hidden')) state.paused = false;
    };
    levelupCards.appendChild(card);
  }
  levelupScreen.classList.remove('hidden');
}

// ---------- input ----------
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  if (e.key === 'm' || e.key === 'M') music.on = !music.on;
  if ((e.key === 'p' || e.key === 'Escape') && state.running && !state.over
      && levelupScreen.classList.contains('hidden')
      && chestScreen.classList.contains('hidden')) {
    togglePause();
  }
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

// touch joystick
const touch = { active: false, ox: 0, oy: 0, dx: 0, dy: 0 };
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  const t = e.touches[0];
  touch.active = true; touch.ox = t.clientX; touch.oy = t.clientY; touch.dx = 0; touch.dy = 0;
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  const t = e.touches[0];
  touch.dx = t.clientX - touch.ox; touch.dy = t.clientY - touch.oy;
}, { passive: false });
canvas.addEventListener('touchend', e => { e.preventDefault(); touch.active = false; touch.dx = touch.dy = 0; }, { passive: false });

function moveInput() {
  let mx = 0, my = 0;
  if (keys['w'] || keys['arrowup']) my -= 1;
  if (keys['s'] || keys['arrowdown']) my += 1;
  if (keys['a'] || keys['arrowleft']) mx -= 1;
  if (keys['d'] || keys['arrowright']) mx += 1;
  if (touch.active) {
    const len = Math.hypot(touch.dx, touch.dy);
    if (len > 8) { mx = touch.dx / len; my = touch.dy / len; }
  }
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }
  return { mx, my };
}

// ---------- pause ----------
const pauseScreen = document.getElementById('pause-screen');
const pauseLoadout = document.getElementById('pause-loadout');
function togglePause() {
  state.paused = !state.paused;
  if (state.paused) {
    pauseLoadout.innerHTML = '';
    for (const w of player.weapons) {
      const def = WEAPON_DEFS[w.id];
      pauseLoadout.innerHTML += `<div class="card"><div class="icon">${def.icon}</div>
        <h3>${def.name}</h3><p>Rank ${w.level}</p></div>`;
    }
    for (const [id, rank] of Object.entries(player.passives)) {
      const def = PASSIVE_DEFS[id];
      pauseLoadout.innerHTML += `<div class="card"><div class="icon">${def.icon}</div>
        <h3>${def.name}</h3><p>Rank ${rank}</p></div>`;
    }
    pauseScreen.classList.remove('hidden');
  } else {
    pauseScreen.classList.add('hidden');
  }
}
window.togglePause = togglePause;

// ---------- end / win ----------
function endGame(won) {
  state.over = true;
  state.running = false;
  if (music.timer) { clearInterval(music.timer); music.timer = null; }
  const title = document.getElementById('end-title');
  const stats = document.getElementById('end-stats');
  title.textContent = won ? 'SIMULATION CLEARED — YOU WIN' : 'SIMULATION FAILED';
  title.style.color = won ? '#5fd47f' : '#ff5050';
  stats.innerHTML = `<b>${player.name}</b> survived <b>${fmtTime(state.time)}</b> &middot; ` +
    `level <b>${state.level}</b> &middot; <b>${state.kills}</b> constructs destroyed &middot; ` +
    `\u{1FA99} <b>${state.gold}</b> gold`;
  document.getElementById('end-screen').classList.remove('hidden');
}

// ---------- update ----------
function update(dt) {
  state.time += dt;
  if (state.time >= WIN_TIME) { endGame(true); return; }
  scanEnv();

  // VS-style wave spawner: keep the quota filled, then trickle one of each type
  const wave = currentWave();
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    state.spawnTimer = wave.interval;
    const alive = enemies.length;
    if (alive < wave.min) {
      const deficit = Math.min(10, wave.min - alive);
      for (let i = 0; i < deficit; i++) spawnEnemy(pickWeighted(wave.types));
    } else {
      for (const kind of wave.types) spawnEnemy(kind);
    }
  }
  // map events: ring / sweep alternating every 30s (skip the first quiet minute)
  const eventDue = Math.floor((state.time - 45) / EVENT_PERIOD);
  if (eventDue >= state.eventsFired && state.time > 45) {
    state.eventsFired = eventDue + 1;
    if (eventDue % 2 === 0) spawnRing(); else spawnSweep();
  }
  // one elite per minute from 1:30 — walking chest with a health bar
  const eliteDue = Math.floor((state.time - 90) / 60);
  if (state.time > 90 && eliteDue >= state.elitesSpawned) {
    state.elitesSpawned = eliteDue + 1;
    spawnElite();
  }
  while (state.bossesSpawned < BOSSES.length && state.time >= BOSSES[state.bossesSpawned].at) {
    spawnBoss(BOSSES[state.bossesSpawned]);
    state.bossesSpawned++;
  }

  // player movement + animation clocks
  const { mx, my } = moveInput();
  player.x += mx * player.speed * dt;
  player.y += my * player.speed * dt;
  if (mx || my) { player.facing.x = mx; player.facing.y = my; }
  player.moving = !!(mx || my);
  if (mx) player.face = mx > 0 ? 1 : -1;
  player.animT += dt;
  player.attackAge += dt;
  player.hurtCd = Math.max(0, player.hurtCd - dt);
  player.hp = Math.min(player.maxHp, player.hp + player.regen * dt);

  // weapons
  for (const w of player.weapons) {
    const def = WEAPON_DEFS[w.id];
    if (def.passiveOrbit) {
      const count = 1 + w.level;
      const radius = 70 + w.level * 10;
      const spd = 2.4 + w.level * 0.25;
      w.orbitA += spd * dt;
      w.tick = (w.tick || 0) - dt;
      const canHit = w.tick <= 0;
      w.orbPos = [];
      for (let i = 0; i < count; i++) {
        const a = w.orbitA + (TAU * i) / count;
        const ox = player.x + Math.cos(a) * radius, oy = player.y + Math.sin(a) * radius;
        w.orbPos.push({ x: ox, y: oy });
        if (canHit) {
          for (const e of enemies) {
            if (dist2(e.x, e.y, ox, oy) < (e.r + 9) ** 2) {
              damageEnemy(e, (8 + w.level * 5) * player.dmgMult);
            }
          }
        }
      }
      if (canHit) w.tick = 0.25;
      continue;
    }
    w.timer -= dt;
    if (w.timer <= 0) {
      if (def.fire(w)) { w.timer = def.cd * player.cdMult; player.attackAge = 0; }
      else w.timer = 0.1; // no target yet — retry soon
    }
  }

  // bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    let dead = b.life <= 0;
    if (!dead) {
      for (const bz of state.brazList || []) {
        if (dist2(bz.x, bz.y, b.x, b.y) < (14 + b.r) ** 2) { damageBrazier(bz, b.dmg); dead = true; break; }
      }
    }
    if (!dead) {
      for (let j = 0; j < enemies.length; j++) {
        const e = enemies[j];
        if (dist2(e.x, e.y, b.x, b.y) < (e.r + b.r) ** 2) {
          if (b.aoe) {
            effects.push({ type: 'boom', x: b.x, y: b.y, radius: b.aoe, life: 0.25, maxLife: 0.25 });
            for (const e2 of [...enemies]) {
              if (dist2(e2.x, e2.y, b.x, b.y) < (b.aoe + e2.r) ** 2) damageEnemy(e2, b.dmg);
            }
            dead = true;
          } else {
            damageEnemy(e, b.dmg);
            if (b.pierce > 0) b.pierce--;
            else dead = true;
          }
          break;
        }
      }
    }
    if (dead) { bullets[i] = bullets[bullets.length - 1]; bullets.pop(); }
  }

  // enemies chase player — each archetype moves differently
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    const dx = player.x - e.x, dy = player.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    e.flash = Math.max(0, e.flash - dt);
    e.animT += dt;
    if (e.sweep) {
      // swarm fodder: fixed heading, ignores the player, expires off-map
      e.x += e.sweep.vx * dt; e.y += e.sweep.vy * dt;
      e.sweep.life -= dt;
      if (e.sweep.life <= 0) { enemies[i] = enemies[enemies.length - 1]; enemies.pop(); continue; }
    } else {
      let spd = e.speed, px = dx / d, py = dy / d;
      if (e.move === 'hop') {
        spd *= Math.max(0.05, Math.sin(e.animT * 5)) * 1.7; // lunge... rest... lunge
      } else if (e.move === 'zigzag') {
        const sway = Math.sin(e.animT * 3.2) * 0.7;
        const nx = px - py * sway, ny = py + px * sway;
        const nl = Math.hypot(nx, ny) || 1;
        px = nx / nl; py = ny / nl;
      } else if (e.move === 'charge') {
        e.chargeT = (e.chargeT + dt) % 4;
        if (e.chargeT < 2.2) spd *= 0.55;        // prowl
        else if (e.chargeT < 2.8) spd = 0;       // windup — telegraphed
        else spd *= 2.6;                          // RUSH
      } else if (e.move === 'orbit' && d < 240) {
        // circle at mid range, bleeding inward — flanks instead of beelines
        const tx = -py * e.orbitSign, ty = px * e.orbitSign;
        const inward = d > 90 ? 0.35 : 0.9;
        const nx = tx * (1 - inward) + px * inward, ny = ty * (1 - inward) + py * inward;
        const nl = Math.hypot(nx, ny) || 1;
        px = nx / nl; py = ny / nl;
      }
      e.x += px * spd * dt;
      e.y += py * spd * dt;
    }
    if (d < e.r + player.r) hurtPlayer(e.dmg);
    // never despawn — like VS, stragglers teleport to a fresh angle and rejoin the hunt
    if (!e.boss && !e.sweep && d > Math.max(canvas.width, canvas.height) * 1.2) {
      const a = rand(0, TAU), sd = spawnRadius();
      e.x = player.x + Math.cos(a) * sd;
      e.y = player.y + Math.sin(a) * sd;
    }
    // solid obstacles push enemies out
    resolveObstacles(e);
  }
  resolveObstacles(player);

  // corpses play their death animation then fade
  for (let i = corpses.length - 1; i >= 0; i--) {
    corpses[i].animT += dt;
    if (corpses[i].animT > 1.15) corpses.splice(i, 1);
  }

  // gems
  for (let i = gems.length - 1; i >= 0; i--) {
    const g = gems[i];
    const d2 = dist2(g.x, g.y, player.x, player.y);
    if (g.vacuum) {
      const d = Math.sqrt(d2) || 1;
      const pull = 1100 * dt;
      g.x += ((player.x - g.x) / d) * pull;
      g.y += ((player.y - g.y) / d) * pull;
    } else if (d2 < player.magnetR ** 2) {
      const d = Math.sqrt(d2) || 1;
      const pull = 420 * dt;
      g.x += ((player.x - g.x) / d) * pull;
      g.y += ((player.y - g.y) / d) * pull;
    }
    if (d2 < (player.r + 10) ** 2) {
      gainXp(g.v);
      sndGem();
      gems[i] = gems[gems.length - 1]; gems.pop();
    }
  }

  // pickups
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    if (dist2(p.x, p.y, player.x, player.y) >= (player.r + 14) ** 2) continue;
    pickups.splice(i, 1);
    if (p.type === 'med') {
      player.hp = Math.min(player.maxHp, player.hp + 40);
      texts.push({ x: player.x, y: player.y - 44, str: '+40 HP', color: '#5fd47f', life: 0.8, vy: -40 });
      sfx(500, 0.15, 'sine', 0.06, 200);
    } else if (p.type === 'gold') {
      state.gold += p.v;
      texts.push({ x: player.x, y: player.y - 44, str: `+${p.v} gold`, color: '#ffd23e', life: 0.7, vy: -40 });
      sndCoin();
    } else if (p.type === 'vac') {
      for (const g of gems) g.vacuum = true;
      texts.push({ x: player.x, y: player.y - 50, str: 'PSYCHIC VACUUM!', color: '#7fd4ff', life: 1.2, vy: -30, big: true });
      sfx(300, 0.5, 'sine', 0.08, 700);
      state.flash = Math.max(state.flash, 0.25);
    } else if (p.type === 'nuke') {
      // hard-light purge: everything non-boss on the field dies
      state.flash = 0.6;
      state.shake = 14;
      sndNuke();
      texts.push({ x: player.x, y: player.y - 50, str: 'SYSTEM PURGE!', color: '#ffffff', life: 1.4, vy: -30, big: true });
      for (const e of [...enemies]) if (!e.boss) killEnemy(e);
    } else if (p.type === 'chest') {
      openChest();
    }
  }

  // effects & floating text
  for (let i = effects.length - 1; i >= 0; i--) {
    effects[i].life -= dt;
    if (effects[i].life <= 0) effects.splice(i, 1);
  }
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i];
    t.life -= dt; t.y += t.vy * dt;
    if (t.life <= 0) texts.splice(i, 1);
  }
  state.shake = Math.max(0, state.shake - dt * 30);
  state.flash = Math.max(0, state.flash - dt * 1.5);
}

// ---------- render ----------
function render() {
  const w = canvas.width, h = canvas.height;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#0e0e1c';
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  const shx = state.shake ? rand(-state.shake, state.shake) : 0;
  const shy = state.shake ? rand(-state.shake, state.shake) : 0;
  const camX = player.x - w / 2 + shx, camY = player.y - h / 2 + shy;
  ctx.translate(-camX, -camY);

  drawFloor(camX, camY, w, h);

  // gems
  for (const g of gems) {
    const pulse = 1 + Math.sin(state.time * 6 + g.x) * 0.15;
    ctx.fillStyle = g.v >= 5 ? 'rgba(255,210,62,0.25)' : g.v >= 3 ? 'rgba(127,212,255,0.25)' : 'rgba(95,212,127,0.25)';
    ctx.beginPath(); ctx.arc(g.x, g.y, 9 * pulse, 0, TAU); ctx.fill();
    ctx.fillStyle = g.v >= 5 ? '#ffd23e' : g.v >= 3 ? '#7fd4ff' : '#5fd47f';
    ctx.beginPath();
    ctx.moveTo(g.x, g.y - 6); ctx.lineTo(g.x + 5, g.y); ctx.lineTo(g.x, g.y + 6); ctx.lineTo(g.x - 5, g.y);
    ctx.closePath(); ctx.fill();
  }

  // pickups
  for (const p of pickups) {
    const bob = Math.sin(state.time * 4 + p.x) * 3;
    if (p.type === 'med') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(p.x - 10, p.y - 10 + bob, 20, 20);
      ctx.fillStyle = '#e33';
      ctx.fillRect(p.x - 7, p.y - 2.5 + bob, 14, 5);
      ctx.fillRect(p.x - 2.5, p.y - 7 + bob, 5, 14);
    } else if (p.type === 'gold') {
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath(); ctx.arc(p.x, p.y + bob, 7, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#a07800'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y + bob, 4, 0, TAU); ctx.stroke();
    } else if (p.type === 'vac') {
      ctx.strokeStyle = '#7fd4ff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y + bob, 10, 0.4, TAU - 0.6); ctx.stroke();
      ctx.fillStyle = '#7fd4ff';
      ctx.fillRect(p.x - 2, p.y + bob - 16, 4, 8);
    } else if (p.type === 'nuke') {
      const pulse = 1 + Math.sin(state.time * 8) * 0.25;
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath(); ctx.arc(p.x, p.y + bob, 14 * pulse, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(p.x, p.y + bob, 8, 0, TAU); ctx.fill();
    } else if (p.type === 'chest') {
      const glow = 0.4 + Math.sin(state.time * 6) * 0.2;
      ctx.fillStyle = `rgba(255,210,62,${glow})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, 22, 0, TAU); ctx.fill();
      ctx.fillStyle = '#8a5a20';
      ctx.fillRect(p.x - 12, p.y - 8 + bob * 0.5, 24, 16);
      ctx.fillStyle = '#c8862f';
      ctx.fillRect(p.x - 12, p.y - 8 + bob * 0.5, 24, 6);
      ctx.fillStyle = '#ffd23e';
      ctx.fillRect(p.x - 2, p.y - 4 + bob * 0.5, 4, 6);
    }
  }

  // corpses (death animations, flat on the ground)
  for (const c of corpses) {
    ctx.globalAlpha = c.animT > 0.85 ? clamp((1.15 - c.animT) / 0.3, 0, 1) : 1;
    drawSprite(c.sprite, 'death', Math.min(9, Math.floor(c.animT * 12)),
      c.x, c.groundY, c.flip, c.scale, c.tint);
    ctx.globalAlpha = 1;
  }

  // living entities + solid props, y-sorted (painter's algorithm)
  const drawables = [];
  for (const o of state.obsList || []) {
    drawables.push({ y: o.y + TILE / 2, draw() { drawObstacle(o); } });
  }
  for (const bz of state.brazList || []) {
    drawables.push({ y: bz.y + 8, draw() { drawBrazier(bz); } });
  }
  for (const e of enemies) {
    drawables.push({ y: groundYOf(e), draw() {
      drawShadow(ctx, e.x, groundYOf(e), e.r * 0.9);
      const near = dist2(e.x, e.y, player.x, player.y) < (e.r + player.r + 26) ** 2;
      const anim = near ? 'attack' : 'walk';
      let tint = e.tint;
      if (e.flash > 0) tint = (tint ? tint + ' ' : '') + 'brightness(2.4) saturate(0.5)';
      drawSprite(e.sprite, anim, animFrame(e.animT, anim), e.x, groundYOf(e), player.x < e.x, e.scale, tint);
      if (e.boss) {
        const top = groundYOf(e) - SHEETS[e.sprite].size * e.scale;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(e.x - e.r, top - 12, e.r * 2, 6);
        ctx.fillStyle = '#ff4040';
        ctx.fillRect(e.x - e.r, top - 12, e.r * 2 * (e.hp / e.maxHp), 6);
      }
    } });
  }
  const blink = player.hurtCd > 0 && Math.floor(state.time * 20) % 2 === 0;
  drawables.push({ y: player.y + 20, draw() {
    if (blink) return;
    drawShadow(ctx, player.x, player.y + 20, 13);
    const anim = player.attackAge < 0.45 ? 'attack' : (player.moving ? 'walk' : 'idle');
    const frame = anim === 'attack' ? Math.min(9, Math.floor(player.attackAge / 0.45 * 10))
      : animFrame(player.animT, anim);
    drawSprite(player.sprite, anim, frame, player.x, player.y + 20, player.face < 0);
  } });
  drawables.sort((a, b) => a.y - b.y);
  for (const d of drawables) d.draw();

  // bullets
  for (const b of bullets) {
    ctx.fillStyle = b.color;
    if (b.spin) {
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.life * 15);
      ctx.fillRect(-5, -7, 10, 14); ctx.restore();
    } else {
      ctx.save();
      ctx.shadowColor = b.color; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath(); ctx.arc(b.x - b.vx * 0.008, b.y - b.vy * 0.008, b.r * 0.5, 0, TAU); ctx.fill();
    }
  }

  // orbiting orbs
  for (const wp of player.weapons) {
    if (wp.orbPos) {
      for (const o of wp.orbPos) {
        ctx.fillStyle = '#5fd47f';
        ctx.beginPath(); ctx.arc(o.x, o.y, 9, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(95,212,127,0.35)';
        ctx.beginPath(); ctx.arc(o.x, o.y, 13, 0, TAU); ctx.stroke();
      }
    }
  }

  // effects
  for (const fx of effects) {
    const p = fx.life / fx.maxLife;
    if (fx.type === 'slash') {
      ctx.fillStyle = `rgba(255, 255, 220, ${0.45 * p})`;
      ctx.beginPath();
      ctx.moveTo(fx.x, fx.y);
      ctx.arc(fx.x, fx.y, fx.range, fx.a - fx.arc / 2, fx.a + fx.arc / 2);
      ctx.closePath(); ctx.fill();
    } else if (fx.type === 'bolt') {
      ctx.strokeStyle = `rgba(180, 220, 255, ${p})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      let bx = fx.x, by = fx.y - 260;
      ctx.moveTo(bx, by);
      for (let s = 0; s < 5; s++) {
        bx = fx.x + rand(-18, 18); by += 52;
        ctx.lineTo(bx, by);
      }
      ctx.lineTo(fx.x, fx.y);
      ctx.stroke();
      ctx.fillStyle = `rgba(220, 240, 255, ${p * 0.7})`;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, 14 * p + 4, 0, TAU); ctx.fill();
    } else if (fx.type === 'nova') {
      ctx.strokeStyle = `rgba(212, 119, 255, ${p})`;
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.radius * (1 - p), 0, TAU); ctx.stroke();
    } else if (fx.type === 'boom') {
      ctx.fillStyle = `rgba(255, 170, 60, ${0.5 * p})`;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.radius * (1 - p * 0.5), 0, TAU); ctx.fill();
    }
  }

  // floating texts
  ctx.textAlign = 'center';
  for (const t of texts) {
    ctx.globalAlpha = clamp(t.life * 2, 0, 1);
    ctx.fillStyle = t.color;
    ctx.font = t.big ? 'bold 26px sans-serif' : 'bold 13px sans-serif';
    ctx.fillText(t.str, t.x, t.y);
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  // dopamine flash (level-ups, chests, purges)
  if (state.flash > 0) {
    ctx.fillStyle = `rgba(255,255,240,${Math.min(0.55, state.flash)})`;
    ctx.fillRect(0, 0, w, h);
  }

  // vignette
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  // ---------- HUD ----------
  const hpw = Math.min(320, w * 0.4);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(16, 16, hpw, 18);
  ctx.fillStyle = player.hp / player.maxHp > 0.3 ? '#5fd47f' : '#ff5050';
  ctx.fillRect(16, 16, hpw * clamp(player.hp / player.maxHp, 0, 1), 18);
  ctx.strokeStyle = '#556'; ctx.strokeRect(16, 16, hpw, 18);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(`${Math.ceil(player.hp)} / ${player.maxHp}`, 22, 30);

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, w, 8);
  ctx.fillStyle = '#7fd4ff';
  ctx.fillRect(0, 0, w * clamp(state.xp / state.xpNeed, 0, 1), 8);

  ctx.textAlign = 'center';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.fillText(fmtTime(state.time), w / 2, 46);
  ctx.font = '13px sans-serif';
  ctx.fillStyle = '#aab';
  ctx.fillText(`LV ${state.level}   ⚔ ${state.kills}`, w / 2, 66);

  // gold counter, top right
  ctx.textAlign = 'right';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillStyle = '#ffd23e';
  ctx.fillText(`\u{1FA99} ${state.gold}`, w - 20, 32);

  if (touch.active) {
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(touch.ox, touch.oy, 40, 0, TAU); ctx.stroke();
    const len = Math.hypot(touch.dx, touch.dy) || 1;
    const kx = touch.ox + (touch.dx / len) * Math.min(len, 40);
    const ky = touch.oy + (touch.dy / len) * Math.min(len, 40);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(kx, ky, 16, 0, TAU); ctx.fill();
  }
}

// ---------- main loop ----------
let lastT = 0;
function loop(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000);
  lastT = t;
  if (state.running && !state.paused && !state.over) update(dt);
  if (state.running || state.over) render();
  requestAnimationFrame(loop);
}

// ---------- hero select ----------
function portraitCanvas(hDef) {
  const pc = document.createElement('canvas');
  pc.width = pc.height = 108;
  const g = pc.getContext('2d');
  g.imageSmoothingEnabled = false;
  const grad = g.createRadialGradient(54, 46, 6, 54, 54, 56);
  grad.addColorStop(0, hDef.color + '4d');
  grad.addColorStop(1, 'rgba(10,10,25,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 108, 108);
  g.strokeStyle = hDef.color + '99';
  g.lineWidth = 3;
  g.beginPath(); g.arc(54, 54, 49, 0, TAU); g.stroke();
  const def = SHEETS[hDef.sprite];
  const img = assets[def.file];
  g.drawImage(img, 0, def.rows.idle * def.size, def.size, def.size, 6, 6, 96, 96);
  return pc;
}

function buildHeroSelect() {
  const holder = document.getElementById('hero-cards');
  holder.innerHTML = '';
  for (const hDef of HEROES) {
    const card = document.createElement('div');
    card.className = 'card';
    const pc = portraitCanvas(hDef);
    pc.style.cssText = 'display:block;margin:0 auto 4px';
    card.appendChild(pc);
    const info = document.createElement('div');
    info.innerHTML = `<div class="tag" style="text-align:center">${hDef.tag}</div>
      <h3 style="text-align:center">${hDef.name}</h3><p>${hDef.desc}</p>`;
    card.appendChild(info);
    card.onclick = () => startGame(hDef);
    holder.appendChild(card);
  }
}

function startGame(hDef) {
  player.name = hDef.name;
  player.color = hDef.color;
  player.sprite = hDef.sprite;
  player.speed = 160; // rebase before hero mods
  addWeapon(hDef.weapon);
  hDef.mods();
  document.getElementById('start-screen').classList.add('hidden');
  startMusic();
  state.running = true;
}

loadAssets().then(() => {
  buildHeroSelect();
  requestAnimationFrame(loop);
}).catch(err => {
  const el = document.querySelector('#start-screen .subtitle');
  if (el) el.innerHTML = `<b style="color:#ff6060">Failed to load sprite assets (${err.message}).</b><br>
    If you opened this via file://, some browsers block local images — try
    <code>npx http-server game/</code> and open the served URL instead.`;
});
