'use strict';
/* Mutant Academy: Survivors — a Vampire Survivors-style auto-battler.
   Single-file canvas game, no dependencies. Open index.html to play. */

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
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function fmtTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
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
const sndLevel = () => { sfx(440, 0.12, 'square', 0.06); setTimeout(() => sfx(660, 0.12, 'square', 0.06), 90); setTimeout(() => sfx(880, 0.2, 'square', 0.06), 180); };
const sndBoss = () => sfx(70, 0.7, 'sawtooth', 0.1, -20);

// ---------- game constants ----------
const WIN_TIME = 15 * 60;           // survive this long to win
const MAX_WEAPONS = 4, MAX_PASSIVES = 4, MAX_LEVEL = 5;

// ---------- state ----------
const state = {
  running: false, paused: false, over: false,
  time: 0, kills: 0, level: 1, xp: 0, xpNeed: 10,
  spawnTimer: 0, bossesSpawned: 0,
  shake: 0,
};

const player = {
  x: 0, y: 0, r: 14, speed: 150, hp: 100, maxHp: 100,
  regen: 0, armor: 0, magnetR: 70, dmgMult: 1, cdMult: 1,
  facing: { x: 1, y: 0 }, hurtCd: 0, color: '#ffd23e', name: '',
  weapons: [], passives: {},
};

const enemies = [], bullets = [], gems = [], effects = [], texts = [], pickups = [];

// ---------- weapons ----------
// Each weapon: id, name, icon, desc, cd (base seconds), level, fire(w)
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
          x: player.x, y: player.y, vx: Math.cos(a) * 560, vy: Math.sin(a) * 560,
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
          x: player.x, y: player.y, vx: Math.cos(a) * 340, vy: Math.sin(a) * 340,
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

// ---------- heroes ----------
const HEROES = [
  { id: 'visor', name: 'Visor', icon: '\u{1F453}', color: '#ff5555',
    tag: 'Ranged striker', desc: 'Leader of the class. Starts with Optic Blast. Balanced stats.',
    weapon: 'optic', mods: () => {} },
  { id: 'wildcat', name: 'Wildcat', icon: '\u{1FA93}', color: '#f4c542',
    tag: 'Melee brawler', desc: 'Starts with Adamant Claws. Tougher (+30 HP) and heals faster.',
    weapon: 'claws', mods: () => { player.maxHp += 30; player.hp += 30; player.regen += 0.4; } },
  { id: 'skywitch', name: 'Sky Witch', icon: '⚡', color: '#e8e8ff',
    tag: 'Area caster', desc: 'Starts with Storm Call. Wider pickup aura, slightly fragile (-15 HP).',
    weapon: 'storm', mods: () => { player.magnetR *= 1.6; player.maxHp -= 15; player.hp -= 15; } },
  { id: 'polara', name: 'Polara', icon: '\u{1FAA8}', color: '#5fd47f',
    tag: 'Orbital defense', desc: 'Starts with Magno Orbs. Moves 10% faster.',
    weapon: 'orbs', mods: () => { player.speed *= 1.1; } },
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
const ENEMY_TYPES = {
  drone:   { hp: 8,   speed: 58, dmg: 8,  r: 11, xp: 1, color: '#8f7fff', from: 0 },
  brute:   { hp: 42,  speed: 36, dmg: 15, r: 19, xp: 3, color: '#ff7f7f', from: 120 },
  stalker: { hp: 20,  speed: 92, dmg: 10, r: 10, xp: 2, color: '#7fffd4', from: 300 },
  hulker:  { hp: 130, speed: 40, dmg: 22, r: 26, xp: 6, color: '#ffaa44', from: 480 },
};
const BOSSES = [
  { at: 300, name: 'SENTINEL MK-I',  hp: 900,  speed: 46, dmg: 25, r: 42, xp: 50, color: '#c060ff' },
  { at: 600, name: 'SENTINEL MK-II', hp: 2600, speed: 52, dmg: 32, r: 50, xp: 90, color: '#ff60c0' },
  { at: 840, name: 'OMEGA SENTINEL', hp: 6500, speed: 58, dmg: 42, r: 60, xp: 150, color: '#ff3030' },
];

function hpScale() { return 1 + (state.time / 60) * 0.35; }

function spawnEnemy() {
  if (enemies.length > 380) return;
  const available = Object.entries(ENEMY_TYPES).filter(([, t]) => state.time >= t.from);
  const [, t] = pick(available);
  const a = rand(0, TAU);
  const d = Math.max(canvas.width, canvas.height) / 2 + 80;
  enemies.push({
    x: player.x + Math.cos(a) * d, y: player.y + Math.sin(a) * d,
    hp: t.hp * hpScale(), maxHp: t.hp * hpScale(),
    speed: t.speed * rand(0.9, 1.1), dmg: t.dmg, r: t.r, xp: t.xp,
    color: t.color, boss: false, flash: 0,
  });
}

function spawnBoss(def) {
  const a = rand(0, TAU);
  const d = Math.max(canvas.width, canvas.height) / 2 + 100;
  enemies.push({
    x: player.x + Math.cos(a) * d, y: player.y + Math.sin(a) * d,
    hp: def.hp, maxHp: def.hp, speed: def.speed, dmg: def.dmg, r: def.r,
    xp: def.xp, color: def.color, boss: true, name: def.name, flash: 0,
  });
  texts.push({ x: player.x, y: player.y - 120, str: `⚠ ${def.name} INBOUND ⚠`,
    color: '#ff4040', life: 2.5, vy: -10, big: true });
  sndBoss();
  state.shake = 12;
}

function damageEnemy(e, dmg) {
  e.hp -= dmg;
  e.flash = 0.1;
  texts.push({ x: e.x + rand(-8, 8), y: e.y - e.r, str: Math.round(dmg).toString(),
    color: '#ffe28a', life: 0.6, vy: -50 });
  sndHit();
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  const i = enemies.indexOf(e);
  if (i === -1) return;
  enemies.splice(i, 1);
  state.kills++;
  effects.push({ type: 'pop', x: e.x, y: e.y, color: e.color, life: 0.25, maxLife: 0.25, r: e.r });
  if (e.boss) {
    // burst of gems + a med kit
    for (let g = 0; g < 10; g++) {
      const a = rand(0, TAU), d = rand(10, 60);
      gems.push({ x: e.x + Math.cos(a) * d, y: e.y + Math.sin(a) * d, v: Math.ceil(e.xp / 10) });
    }
    pickups.push({ x: e.x, y: e.y, type: 'med' });
    state.shake = 8;
  } else {
    gems.push({ x: e.x, y: e.y, v: e.xp });
    if (gems.length > 400) {
      const old = gems.shift();
      gems[Math.floor(Math.random() * gems.length)].v += old.v;
    }
  }
}

// ---------- player damage / xp ----------
function hurtPlayer(dmg) {
  if (player.hurtCd > 0) return;
  const taken = Math.max(1, dmg - player.armor);
  player.hp -= taken;
  player.hurtCd = 0.5;
  state.shake = Math.max(state.shake, 5);
  texts.push({ x: player.x, y: player.y - 20, str: `-${Math.round(taken)}`, color: '#ff6060', life: 0.7, vy: -40 });
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
  // shuffle, take 3
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

function showLevelUp() {
  state.paused = true;
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
      state.paused = false;
    };
    levelupCards.appendChild(card);
  }
  levelupScreen.classList.remove('hidden');
}

// ---------- input ----------
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  if ((e.key === 'p' || e.key === 'Escape') && state.running && !state.over
      && levelupScreen.classList.contains('hidden')) {
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
  const title = document.getElementById('end-title');
  const stats = document.getElementById('end-stats');
  title.textContent = won ? 'EVAC COMPLETE — YOU WIN' : 'THE ACADEMY HAS FALLEN';
  title.style.color = won ? '#5fd47f' : '#ff5050';
  stats.innerHTML = `<b>${player.name}</b> survived <b>${fmtTime(state.time)}</b> &middot; ` +
    `level <b>${state.level}</b> &middot; <b>${state.kills}</b> Sentinels destroyed`;
  document.getElementById('end-screen').classList.remove('hidden');
}

// ---------- update ----------
function update(dt) {
  state.time += dt;
  if (state.time >= WIN_TIME) { endGame(true); return; }

  // difficulty curve: spawn faster over time, in bigger batches
  const minute = state.time / 60;
  const interval = Math.max(0.14, 1.1 - minute * 0.065);
  const batch = 1 + Math.floor(minute / 3);
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    state.spawnTimer = interval;
    for (let i = 0; i < batch; i++) spawnEnemy();
  }
  while (state.bossesSpawned < BOSSES.length && state.time >= BOSSES[state.bossesSpawned].at) {
    spawnBoss(BOSSES[state.bossesSpawned]);
    state.bossesSpawned++;
  }

  // player movement
  const { mx, my } = moveInput();
  player.x += mx * player.speed * dt;
  player.y += my * player.speed * dt;
  if (mx || my) { player.facing.x = mx; player.facing.y = my; }
  player.hurtCd = Math.max(0, player.hurtCd - dt);
  player.hp = Math.min(player.maxHp, player.hp + player.regen * dt);

  // weapons
  for (const w of player.weapons) {
    const def = WEAPON_DEFS[w.id];
    if (def.passiveOrbit) {
      // Magno Orbs: continuous orbit, damage on contact with per-orb tick
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
      if (def.fire(w)) w.timer = def.cd * player.cdMult;
      else w.timer = 0.1; // no target yet — retry soon
    }
  }

  // bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    let dead = b.life <= 0;
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

  // enemies chase player
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    const dx = player.x - e.x, dy = player.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    e.x += (dx / d) * e.speed * dt;
    e.y += (dy / d) * e.speed * dt;
    e.flash = Math.max(0, e.flash - dt);
    if (d < e.r + player.r) hurtPlayer(e.dmg);
    // cull ordinary enemies that drift absurdly far (offscreen spawn churn)
    if (!e.boss && d > Math.max(canvas.width, canvas.height) * 1.8) {
      enemies[i] = enemies[enemies.length - 1]; enemies.pop();
    }
  }

  // gems
  for (let i = gems.length - 1; i >= 0; i--) {
    const g = gems[i];
    const d2 = dist2(g.x, g.y, player.x, player.y);
    if (d2 < player.magnetR ** 2) {
      const d = Math.sqrt(d2) || 1;
      const pull = 420 * dt;
      g.x += ((player.x - g.x) / d) * pull;
      g.y += ((player.y - g.y) / d) * pull;
    }
    if (d2 < (player.r + 8) ** 2) {
      gainXp(g.v);
      sndGem();
      gems[i] = gems[gems.length - 1]; gems.pop();
    }
  }

  // pickups (med kits)
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    if (dist2(p.x, p.y, player.x, player.y) < (player.r + 12) ** 2) {
      player.hp = Math.min(player.maxHp, player.hp + 40);
      texts.push({ x: player.x, y: player.y - 24, str: '+40', color: '#5fd47f', life: 0.8, vy: -40 });
      sfx(500, 0.15, 'sine', 0.06, 200);
      pickups.splice(i, 1);
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
}

// ---------- render ----------
function render() {
  const w = canvas.width, h = canvas.height;
  ctx.fillStyle = '#0e0e1c';
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  const shx = state.shake ? rand(-state.shake, state.shake) : 0;
  const shy = state.shake ? rand(-state.shake, state.shake) : 0;
  const camX = player.x - w / 2 + shx, camY = player.y - h / 2 + shy;
  ctx.translate(-camX, -camY);

  // background grid (academy training floor)
  const grid = 90;
  ctx.strokeStyle = 'rgba(80, 90, 140, 0.14)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let gx = Math.floor(camX / grid) * grid; gx < camX + w + grid; gx += grid) {
    ctx.moveTo(gx, camY); ctx.lineTo(gx, camY + h);
  }
  for (let gy = Math.floor(camY / grid) * grid; gy < camY + h + grid; gy += grid) {
    ctx.moveTo(camX, gy); ctx.lineTo(camX + w, gy);
  }
  ctx.stroke();

  // gems
  for (const g of gems) {
    ctx.fillStyle = g.v >= 5 ? '#ffd23e' : g.v >= 3 ? '#7fd4ff' : '#5fd47f';
    ctx.beginPath();
    ctx.moveTo(g.x, g.y - 6); ctx.lineTo(g.x + 5, g.y); ctx.lineTo(g.x, g.y + 6); ctx.lineTo(g.x - 5, g.y);
    ctx.closePath(); ctx.fill();
  }

  // pickups
  for (const p of pickups) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(p.x - 10, p.y - 10, 20, 20);
    ctx.fillStyle = '#e33';
    ctx.fillRect(p.x - 7, p.y - 2.5, 14, 5);
    ctx.fillRect(p.x - 2.5, p.y - 7, 5, 14);
  }

  // enemies
  for (const e of enemies) {
    ctx.fillStyle = e.flash > 0 ? '#ffffff' : e.color;
    ctx.beginPath();
    if (e.boss) {
      // sentinels are big angular diamonds
      ctx.moveTo(e.x, e.y - e.r); ctx.lineTo(e.x + e.r, e.y); ctx.lineTo(e.x, e.y + e.r); ctx.lineTo(e.x - e.r, e.y);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffee55';
      ctx.beginPath(); ctx.arc(e.x, e.y - e.r * 0.3, e.r * 0.18, 0, TAU); ctx.fill();
      // boss hp bar
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(e.x - e.r, e.y - e.r - 12, e.r * 2, 6);
      ctx.fillStyle = '#ff4040';
      ctx.fillRect(e.x - e.r, e.y - e.r - 12, e.r * 2 * (e.hp / e.maxHp), 6);
    } else {
      ctx.arc(e.x, e.y, e.r, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.arc(e.x - e.r * 0.3, e.y - e.r * 0.25, e.r * 0.18, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(e.x + e.r * 0.3, e.y - e.r * 0.25, e.r * 0.18, 0, TAU); ctx.fill();
    }
  }

  // bullets
  for (const b of bullets) {
    ctx.fillStyle = b.color;
    if (b.spin) {
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.life * 15);
      ctx.fillRect(-5, -7, 10, 14); ctx.restore();
    } else {
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath(); ctx.arc(b.x - b.vx * 0.01, b.y - b.vy * 0.01, b.r * 0.5, 0, TAU); ctx.fill();
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
    } else if (fx.type === 'pop') {
      ctx.fillStyle = fx.color;
      ctx.globalAlpha = p;
      for (let s = 0; s < 6; s++) {
        const a = (TAU * s) / 6;
        const d = fx.r * (1.6 - p);
        ctx.beginPath(); ctx.arc(fx.x + Math.cos(a) * d, fx.y + Math.sin(a) * d, 3, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  // player
  const blink = player.hurtCd > 0 && Math.floor(state.time * 20) % 2 === 0;
  if (!blink) {
    ctx.fillStyle = player.color;
    ctx.beginPath(); ctx.arc(player.x, player.y, player.r, 0, TAU); ctx.fill();
    // cape hint
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.arc(player.x - player.facing.x * 6, player.y - player.facing.y * 6, player.r * 0.75, 0, TAU);
    ctx.fill();
    // visor stripe
    ctx.fillStyle = '#101020';
    ctx.fillRect(player.x - player.r + 2, player.y - 4, player.r * 2 - 4, 5);
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

  // ---------- HUD ----------
  // hp bar
  const hpw = Math.min(320, w * 0.4);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(16, 16, hpw, 18);
  ctx.fillStyle = player.hp / player.maxHp > 0.3 ? '#5fd47f' : '#ff5050';
  ctx.fillRect(16, 16, hpw * clamp(player.hp / player.maxHp, 0, 1), 18);
  ctx.strokeStyle = '#556'; ctx.strokeRect(16, 16, hpw, 18);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(`${Math.ceil(player.hp)} / ${player.maxHp}`, 22, 30);

  // xp bar across top
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, w, 8);
  ctx.fillStyle = '#7fd4ff';
  ctx.fillRect(0, 0, w * clamp(state.xp / state.xpNeed, 0, 1), 8);

  // timer + stats
  ctx.textAlign = 'center';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.fillText(fmtTime(state.time), w / 2, 46);
  ctx.font = '13px sans-serif';
  ctx.fillStyle = '#aab';
  ctx.fillText(`LV ${state.level}   ⚔ ${state.kills}`, w / 2, 66);

  // touch joystick indicator
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
function buildHeroSelect() {
  const holder = document.getElementById('hero-cards');
  for (const hDef of HEROES) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<div class="icon">${hDef.icon}</div><div class="tag">${hDef.tag}</div>
      <h3>${hDef.name}</h3><p>${hDef.desc}</p>`;
    card.onclick = () => startGame(hDef);
    holder.appendChild(card);
  }
}

function startGame(hDef) {
  player.name = hDef.name;
  player.color = hDef.color;
  addWeapon(hDef.weapon);
  hDef.mods();
  document.getElementById('start-screen').classList.add('hidden');
  state.running = true;
}

buildHeroSelect();
requestAnimationFrame(loop);
