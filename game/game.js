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

// ---------- character sprites (all vector-drawn, no assets) ----------
function rrect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function line(c, x1, y1, x2, y2) {
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
}
function drawShadow(c, x, y, r) {
  c.fillStyle = 'rgba(0,0,0,0.28)';
  c.beginPath(); c.ellipse(x, y, r, r * 0.32, 0, 0, TAU); c.fill();
}

// Hero costume definitions. Characters are ~46px tall, drawn facing right
// around origin (head ~-18, feet ~+21); flip with ctx.scale(-1,1) outside.
const HERO_LOOKS = {
  visor: {
    suit: '#2b4fd4', pants: '#1a2f80', belt: '#ffd23e', boots: '#ffd23e',
    gloves: '#ffd23e', skin: '#e8b98a', hair: '#5a3a22', visor: '#ff3030',
  },
  wildcat: {
    suit: '#f4c542', pants: '#2b4fd4', belt: '#c0392b', boots: '#2b4fd4',
    gloves: '#2b4fd4', skin: '#e8b98a', mask: '#f4c542', maskTrim: '#15151f',
    maskEars: true, claws: '#dfe8f3',
  },
  skywitch: {
    suit: '#15151f', pants: '#15151f', belt: '#ffd23e', boots: '#ffd23e',
    gloves: '#15151f', skin: '#7a5230', hair: '#f5f5ff', longHair: true,
    cape: '#e8e8ff', eyes: '#cfe8ff',
  },
  polara: {
    suit: '#1f8a4d', pants: '#14663a', belt: '#6a2fb8', boots: '#6a2fb8',
    gloves: '#6a2fb8', skin: '#e8b98a', helmet: '#6a2fb8', cape: '#8a45d8',
  },
};

function drawCharacter(c, look, t, moving) {
  const step = moving ? Math.sin(t * 10) * 6 : 0;
  const armSwing = moving ? Math.sin(t * 10) * 4 : 0;
  const bob = moving ? Math.abs(Math.cos(t * 10)) * 1.5 : Math.sin(t * 2.5) * 0.8;
  c.save();
  c.lineCap = 'round';

  // cape flutters behind
  if (look.cape) {
    const flut = Math.sin(t * 6) * 2.5 + (moving ? 5 : 1);
    c.fillStyle = look.cape;
    c.beginPath();
    c.moveTo(-1, -14 - bob);
    c.quadraticCurveTo(-13, -2, -10 - flut, 20);
    c.quadraticCurveTo(-6, 14, -3, 14 - bob);
    c.closePath();
    c.fill();
  }
  // long hair flows behind the head
  if (look.longHair) {
    const hf = Math.sin(t * 5) * 2 + (moving ? 3 : 0);
    c.fillStyle = look.hair;
    c.beginPath();
    c.moveTo(2, -25 - bob);
    c.quadraticCurveTo(-10, -22 - bob, -8 - hf, -4);
    c.quadraticCurveTo(-4, -9, -1, -12 - bob);
    c.closePath();
    c.fill();
  }

  // back arm
  c.strokeStyle = look.suit;
  c.lineWidth = 4.5;
  line(c, -5, -8 - bob, -6 - armSwing, 3 - bob);
  c.fillStyle = look.gloves;
  c.beginPath(); c.arc(-6 - armSwing, 3 - bob, 2.8, 0, TAU); c.fill();

  // legs + boots
  c.strokeStyle = look.pants;
  c.lineWidth = 5;
  line(c, -3, 7 - bob, -3 - step, 20);
  line(c, 3, 7 - bob, 3 + step, 20);
  c.fillStyle = look.boots;
  c.beginPath(); c.arc(-3 - step, 20, 3, 0, TAU); c.fill();
  c.beginPath(); c.arc(3 + step, 20, 3, 0, TAU); c.fill();

  // torso + belt + chest badge
  c.fillStyle = look.suit;
  rrect(c, -7, -13 - bob, 14, 21, 5); c.fill();
  c.fillStyle = look.belt;
  c.fillRect(-7, 4 - bob, 14, 3.5);
  c.strokeStyle = 'rgba(0,0,0,0.35)';
  c.lineWidth = 1.5;
  c.beginPath(); c.arc(0, -6 - bob, 3.2, 0, TAU); c.stroke();
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.beginPath(); c.arc(0, -6 - bob, 1.4, 0, TAU); c.fill();

  // front arm
  c.strokeStyle = look.suit;
  c.lineWidth = 4.5;
  const hx = 7 + armSwing, hy = 3 - bob;
  line(c, 5, -8 - bob, hx, hy);
  c.fillStyle = look.gloves;
  c.beginPath(); c.arc(hx, hy, 2.8, 0, TAU); c.fill();
  // adamant claws from the front fist
  if (look.claws) {
    c.strokeStyle = look.claws;
    c.lineWidth = 1.6;
    line(c, hx + 1, hy - 1, hx + 11, hy - 5);
    line(c, hx + 2, hy, hx + 12, hy);
    line(c, hx + 1, hy + 1, hx + 11, hy + 5);
  }

  // head
  const hdy = -18 - bob;
  c.fillStyle = look.skin;
  c.beginPath(); c.arc(0, hdy, 7, 0, TAU); c.fill();

  if (look.maskEars) {
    // cowl over the skull (chin stays bare) with pointed ears
    c.fillStyle = look.mask;
    c.beginPath(); c.arc(0, hdy - 0.5, 7.3, Math.PI * 0.8, Math.PI * 2.2); c.fill();
    c.beginPath(); c.moveTo(-6.2, hdy - 3.5); c.lineTo(-4.6, hdy - 12); c.lineTo(-1.8, hdy - 6); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(6.2, hdy - 3.5); c.lineTo(4.6, hdy - 12); c.lineTo(1.8, hdy - 6); c.closePath(); c.fill();
    // dark eye-mask with angry white slits
    c.fillStyle = look.maskTrim;
    rrect(c, -6.4, hdy - 4.6, 12.8, 4.4, 2); c.fill();
    c.fillStyle = '#fff';
    c.beginPath(); c.moveTo(1, hdy - 1.6); c.lineTo(1.6, hdy - 3.8); c.lineTo(5, hdy - 3); c.lineTo(4.6, hdy - 1.6); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(-1, hdy - 1.6); c.lineTo(-1.6, hdy - 3.8); c.lineTo(-5, hdy - 3); c.lineTo(-4.6, hdy - 1.6); c.closePath(); c.fill();
  } else if (look.helmet) {
    // magno-helmet with crest fin
    c.fillStyle = look.helmet;
    c.beginPath(); c.arc(0, hdy - 0.5, 7.4, Math.PI * 0.95, Math.PI * 2.05); c.fill();
    c.fillRect(-1.2, hdy - 11.5, 2.4, 5);
    c.fillStyle = '#222';
    c.beginPath(); c.arc(2, hdy + 0.5, 1.1, 0, TAU); c.fill();
    c.beginPath(); c.arc(-1.5, hdy + 0.5, 1.1, 0, TAU); c.fill();
  } else if (look.visor) {
    // short hair up top + glowing ruby visor across the eyes
    c.fillStyle = look.hair;
    c.beginPath(); c.arc(0, hdy - 2.5, 6.6, Math.PI * 1.05, Math.PI * 1.95); c.fill();
    c.fillStyle = '#20242c';
    rrect(c, -7.4, hdy - 3, 14.8, 4.6, 2.2); c.fill();
    c.save();
    c.shadowColor = look.visor; c.shadowBlur = 7;
    c.fillStyle = look.visor;
    rrect(c, -6, hdy - 2.1, 12, 2.8, 1.4); c.fill();
    c.restore();
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.fillRect(-4.5, hdy - 1.7, 4, 0.9);
  } else {
    // bare face: hairline + eyes
    if (!look.longHair) {
      c.fillStyle = look.hair;
      c.beginPath(); c.arc(0, hdy - 1, 7.2, Math.PI * 1.02, Math.PI * 1.98); c.fill();
    } else {
      c.fillStyle = look.hair;
      c.beginPath(); c.arc(-1, hdy - 3, 6.8, Math.PI * 1.02, Math.PI * 1.92); c.fill();
    }
    c.fillStyle = look.eyes || '#222';
    c.beginPath(); c.arc(2.2, hdy - 0.5, 1.2, 0, TAU); c.fill();
    c.beginPath(); c.arc(-1.4, hdy - 0.5, 1.2, 0, TAU); c.fill();
  }
  c.restore();
}

// --- enemy robots ---
const DARK_METAL = '#262636', MID_METAL = '#3a3a52';

function drawDrone(c, accent, t, phase) {
  const bob = Math.sin(t * 6 + phase) * 2.5;
  c.save();
  c.translate(0, bob);
  // thruster flame
  c.fillStyle = `rgba(255,160,60,${0.5 + Math.sin(t * 30 + phase) * 0.3})`;
  c.beginPath(); c.moveTo(-3, 7); c.lineTo(0, 13 + Math.sin(t * 25) * 2); c.lineTo(3, 7); c.closePath(); c.fill();
  // stub wings
  c.fillStyle = MID_METAL;
  rrect(c, -13, -2, 6, 4, 1.5); c.fill();
  rrect(c, 7, -2, 6, 4, 1.5); c.fill();
  // hull
  c.fillStyle = DARK_METAL;
  rrect(c, -9, -7, 18, 14, 5); c.fill();
  c.fillStyle = accent;
  c.fillRect(-9, 1, 18, 3);
  // antenna
  c.strokeStyle = MID_METAL; c.lineWidth = 1.5;
  line(c, 0, -7, -2, -12);
  c.fillStyle = accent;
  c.beginPath(); c.arc(-2, -12.5, 1.5, 0, TAU); c.fill();
  // mono-eye with glow rings
  c.fillStyle = 'rgba(255,60,60,0.25)';
  c.beginPath(); c.arc(3, -1, 5.5, 0, TAU); c.fill();
  c.fillStyle = '#ff4040';
  c.beginPath(); c.arc(3, -1, 3, 0, TAU); c.fill();
  c.fillStyle = '#ffd0d0';
  c.beginPath(); c.arc(4, -2, 1, 0, TAU); c.fill();
  c.restore();
}

function drawStalker(c, accent, t, phase) {
  // scuttling legs (two pairs each side)
  c.strokeStyle = MID_METAL; c.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const side = i < 2 ? -1 : 1;
    const sc = Math.sin(t * 14 + phase + i * 1.7) * 3;
    const bx = side * 5, kx = side * 11, fx = side * (13 + sc * 0.5);
    line(c, bx, 0, kx, -4);
    line(c, kx, -4, fx, 7 + sc);
  }
  // low body
  c.fillStyle = DARK_METAL;
  c.beginPath(); c.ellipse(0, 0, 10, 6.5, 0, 0, TAU); c.fill();
  c.fillStyle = accent;
  c.beginPath(); c.ellipse(2, -2, 5, 3, 0, 0, TAU); c.fill();
  // eyes
  c.fillStyle = '#ff5050';
  c.beginPath(); c.arc(7, -1, 1.6, 0, TAU); c.fill();
  c.beginPath(); c.arc(4, 1.5, 1.2, 0, TAU); c.fill();
}

function drawMech(c, accent, s, t, phase, big) {
  // s scales the whole mech; design is ~40px tall at s=1
  c.save();
  c.scale(s, s);
  const stomp = Math.sin(t * 6 + phase) * 3;
  // legs
  c.strokeStyle = MID_METAL; c.lineWidth = 6; c.lineCap = 'round';
  line(c, -6, 6, -7, 17 + stomp * 0.4);
  line(c, 6, 6, 7, 17 - stomp * 0.4);
  c.fillStyle = DARK_METAL;
  rrect(c, -11, 15 + stomp * 0.4, 8, 5, 2); c.fill();
  rrect(c, 3, 15 - stomp * 0.4, 8, 5, 2); c.fill();
  // arms with fists
  const swing = Math.sin(t * 6 + phase) * 2;
  c.strokeStyle = DARK_METAL; c.lineWidth = 5;
  line(c, -11, -6, -14, 5 + swing);
  line(c, 11, -6, 14, 5 - swing);
  c.fillStyle = MID_METAL;
  c.beginPath(); c.arc(-14, 6 + swing, 3.5, 0, TAU); c.fill();
  c.beginPath(); c.arc(14, 6 - swing, 3.5, 0, TAU); c.fill();
  // torso
  c.fillStyle = DARK_METAL;
  rrect(c, -11, -12, 22, 20, 4); c.fill();
  c.fillStyle = accent;
  rrect(c, -7, -9, 14, 9, 2); c.fill();
  // rivets
  c.fillStyle = 'rgba(255,255,255,0.25)';
  for (const [rx, ry] of [[-9, -10], [9, -10], [-9, 5], [9, 5]]) {
    c.beginPath(); c.arc(rx, ry, 1, 0, TAU); c.fill();
  }
  if (big) {
    // shoulder pads + chest core
    c.fillStyle = MID_METAL;
    rrect(c, -16, -14, 7, 8, 2); c.fill();
    rrect(c, 9, -14, 7, 8, 2); c.fill();
    c.fillStyle = 'rgba(255,220,80,0.9)';
    c.beginPath(); c.arc(0, -4, 2.5 + Math.sin(t * 8) * 0.6, 0, TAU); c.fill();
  }
  // head dome + eyes
  c.fillStyle = MID_METAL;
  c.beginPath(); c.arc(0, -14, 6, Math.PI, TAU); c.fill();
  c.fillStyle = '#ff5050';
  c.beginPath(); c.arc(-2.5, -15, 1.5, 0, TAU); c.fill();
  c.beginPath(); c.arc(2.5, -15, 1.5, 0, TAU); c.fill();
  c.restore();
}

function drawSentinel(c, e, t) {
  // giant humanoid mech, ~2.4x e.r tall, tinted by the boss accent color
  const s = e.r / 30;
  const accent = e.color;
  c.save();
  c.scale(s, s);
  const stomp = Math.sin(t * 4) * 2.5;
  c.lineCap = 'round';
  // legs
  c.strokeStyle = DARK_METAL; c.lineWidth = 10;
  line(c, -9, 14, -11, 32 + stomp);
  line(c, 9, 14, 11, 32 - stomp);
  c.fillStyle = MID_METAL;
  rrect(c, -17, 30 + stomp, 12, 7, 3); c.fill();
  rrect(c, 5, 30 - stomp, 12, 7, 3); c.fill();
  // arms
  const swing = Math.sin(t * 4) * 3;
  c.strokeStyle = MID_METAL; c.lineWidth = 8;
  line(c, -17, -10, -21, 10 + swing);
  line(c, 17, -10, 21, 10 - swing);
  c.fillStyle = DARK_METAL;
  c.beginPath(); c.arc(-21, 12 + swing, 5.5, 0, TAU); c.fill();
  c.beginPath(); c.arc(21, 12 - swing, 5.5, 0, TAU); c.fill();
  // torso (tapered)
  c.fillStyle = DARK_METAL;
  c.beginPath();
  c.moveTo(-16, -18); c.lineTo(16, -18); c.lineTo(12, 16); c.lineTo(-12, 16);
  c.closePath(); c.fill();
  c.strokeStyle = accent; c.lineWidth = 2;
  c.stroke();
  // chest core (pulsing)
  c.save();
  c.shadowColor = accent; c.shadowBlur = 14;
  c.fillStyle = accent;
  c.beginPath(); c.arc(0, -4, 5 + Math.sin(t * 6) * 1.2, 0, TAU); c.fill();
  c.restore();
  c.fillStyle = 'rgba(255,255,255,0.85)';
  c.beginPath(); c.arc(0, -4, 2, 0, TAU); c.fill();
  // shoulder blocks
  c.fillStyle = MID_METAL;
  rrect(c, -24, -22, 11, 12, 3); c.fill();
  rrect(c, 13, -22, 11, 12, 3); c.fill();
  c.fillStyle = accent;
  c.fillRect(-24, -22, 11, 3);
  c.fillRect(13, -22, 11, 3);
  // head with glowing visor slit + fins
  c.fillStyle = DARK_METAL;
  rrect(c, -8, -32, 16, 13, 4); c.fill();
  c.fillStyle = accent;
  c.beginPath(); c.moveTo(-8, -28); c.lineTo(-13, -34); c.lineTo(-8, -32); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(8, -28); c.lineTo(13, -34); c.lineTo(8, -32); c.closePath(); c.fill();
  c.save();
  c.shadowColor = '#ffee55'; c.shadowBlur = 10;
  c.fillStyle = '#ffee55';
  c.fillRect(-5.5, -27.5, 11, 3);
  c.restore();
  c.restore();
}

function drawEnemySprite(c, e, t) {
  const kind = e.kind || 'drone';
  if (kind === 'drone') drawDrone(c, e.color, t, e.phase || 0);
  else if (kind === 'stalker') drawStalker(c, e.color, t, e.phase || 0);
  else if (kind === 'brute') drawMech(c, e.color, e.r / 20, t, e.phase || 0, false);
  else drawMech(c, e.color, e.r / 20, t, e.phase || 0, true); // hulker
}

// rendered portraits for the hero-select cards
function makePortrait(heroId, color) {
  const pc = document.createElement('canvas');
  pc.width = pc.height = 150;
  const g = pc.getContext('2d');
  const grad = g.createRadialGradient(75, 62, 8, 75, 75, 78);
  grad.addColorStop(0, color + '55');
  grad.addColorStop(1, 'rgba(10,10,25,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 150, 150);
  g.strokeStyle = color + '88';
  g.lineWidth = 3;
  g.beginPath(); g.arc(75, 75, 66, 0, TAU); g.stroke();
  g.translate(75, 80);
  g.scale(3, 3);
  drawCharacter(g, HERO_LOOKS[heroId], 0.35, true);
  return pc.toDataURL();
}

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
  heroId: 'visor', face: 1, moving: false,
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
  const [kind, t] = pick(available);
  const a = rand(0, TAU);
  const d = Math.max(canvas.width, canvas.height) / 2 + 80;
  enemies.push({
    x: player.x + Math.cos(a) * d, y: player.y + Math.sin(a) * d,
    hp: t.hp * hpScale(), maxHp: t.hp * hpScale(),
    speed: t.speed * rand(0.9, 1.1), dmg: t.dmg, r: t.r, xp: t.xp,
    color: t.color, boss: false, flash: 0, kind, phase: rand(0, TAU),
  });
}

function spawnBoss(def) {
  const a = rand(0, TAU);
  const d = Math.max(canvas.width, canvas.height) / 2 + 100;
  enemies.push({
    x: player.x + Math.cos(a) * d, y: player.y + Math.sin(a) * d,
    hp: def.hp, maxHp: def.hp, speed: def.speed, dmg: def.dmg, r: def.r,
    xp: def.xp, color: def.color, boss: true, name: def.name, flash: 0,
    phase: rand(0, TAU),
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
  player.moving = !!(mx || my);
  if (mx) player.face = mx > 0 ? 1 : -1;
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

  // enemies (vector-drawn robot sprites, facing the player)
  for (const e of enemies) {
    const groundY = e.boss ? e.y + e.r * 1.25 : e.y + (e.kind === 'drone' ? e.r + 6 : e.r * 0.85);
    drawShadow(ctx, e.x, groundY, e.boss ? e.r * 0.9 : e.r * 0.8);
    ctx.save();
    ctx.translate(e.x, e.y);
    if (player.x < e.x) ctx.scale(-1, 1);
    if (e.flash > 0) ctx.filter = 'brightness(2.4) saturate(0.4)';
    if (e.boss) drawSentinel(ctx, e, state.time);
    else drawEnemySprite(ctx, e, state.time);
    ctx.restore();
    if (e.boss) {
      const barY = e.y - e.r * 1.25 - 12;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(e.x - e.r, barY, e.r * 2, 6);
      ctx.fillStyle = '#ff4040';
      ctx.fillRect(e.x - e.r, barY, e.r * 2 * (e.hp / e.maxHp), 6);
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

  // player (vector-drawn hero with walk cycle)
  const blink = player.hurtCd > 0 && Math.floor(state.time * 20) % 2 === 0;
  if (!blink) {
    drawShadow(ctx, player.x, player.y + 21, 12);
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.scale(player.face, 1);
    drawCharacter(ctx, HERO_LOOKS[player.heroId], state.time, player.moving);
    ctx.restore();
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
    card.innerHTML = `<img src="${makePortrait(hDef.id, hDef.color)}" alt="${hDef.name}"
        style="width:96px;height:96px;display:block;margin:0 auto 4px">
      <div class="tag" style="text-align:center">${hDef.tag}</div>
      <h3 style="text-align:center">${hDef.name}</h3><p>${hDef.desc}</p>`;
    card.onclick = () => startGame(hDef);
    holder.appendChild(card);
  }
}

function startGame(hDef) {
  player.name = hDef.name;
  player.color = hDef.color;
  player.heroId = hDef.id;
  addWeapon(hDef.weapon);
  hDef.mods();
  document.getElementById('start-screen').classList.add('hidden');
  state.running = true;
}

buildHeroSelect();
requestAnimationFrame(loop);
