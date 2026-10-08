'use strict';
/* Mutant Academy: Survivors — a Vampire Survivors-style auto-battler, presented
   like a Sega Mega Drive cartridge: a low-res framebuffer scaled up by whole
   pixels, a 9-bit (512-colour) palette, bitmap fonts, blue RPG windows, d-pad
   menus and an FM-synth soundtrack.
   Sprites: Calciumtrice (CC-BY 3.0) · tiles: Buch (CC0) · cat: Shepardskin (CC0)
   — see assets/CREDITS.md. Serve or open index.html to play. */

// ---------- framebuffer ----------
// The canvas IS the console screen: W×H "dots", CSS-scaled by a whole number of
// device pixels with image-rendering: pixelated. One dot = one sprite pixel =
// PX world units, so every gameplay number (speeds, radii, ranges) is unchanged.
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
const PX = 2;
const MIN_LINES = 240;            // at least a PAL Mega Drive's worth of lines
let W = 320, H = 240, VW = W * PX, VH = H * PX;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const dw = Math.max(1, Math.floor(window.innerWidth * dpr));
  const dh = Math.max(1, Math.floor(window.innerHeight * dpr));
  const dot = Math.max(1, Math.floor(Math.min(dw, dh) / MIN_LINES));
  W = Math.max(160, Math.floor(dw / dot));
  H = Math.max(120, Math.floor(dh / dot));
  canvas.width = W;
  canvas.height = H;
  canvas.style.width = (W * dot / dpr) + 'px';
  canvas.style.height = (H * dot / dpr) + 'px';
  canvas.style.left = (Math.floor((dw - W * dot) / 2) / dpr) + 'px';
  canvas.style.top = (Math.floor((dh - H * dot) / 2) / dpr) + 'px';
  VW = W * PX;
  VH = H * PX;
  ctx.imageSmoothingEnabled = false;
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
// deterministic 2D hash for world decoration
function hash2(x, y) {
  let n = (x * 374761393 + y * 668265263) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
}
const REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
let uiTime = 0;                                  // wall clock for blinks & attract mode
const blink = hz => Math.floor(uiTime * hz) % 2 === 0;
let scene = 'loading';                           // loading | error | title | select | play | over

// ---------- palette: every colour is Mega Drive-legal (3 bits per channel) ----------
const C = {
  black: '#000000', white: '#FFFFFF', lgrey: '#B6B6B6', grey: '#6D6D6D', dgrey: '#494949',
  yellow: '#FFDB00', gold: '#FFB600', orange: '#FF9200', red: '#FF2400',
  green: '#24DB24', cyan: '#49DBFF', blue: '#2449FF', purple: '#B649FF',
  selBar: '#2449DB', pipOff: '#242449',
};
const GOLD_GRAD = ['#FFFF6D', '#FFB600', '#FF6D00'];
const RED_GRAD = ['#FF9292', '#FF2400', '#920000'];
const CYAN_GRAD = ['#DBFFFF', '#49DBFF', '#2449DB'];
const TIER_COLS = ['#FFFFB6', '#FFDB00', '#FF9200', '#FF2400'];
const WIN_BANDS = ['#0000DB', '#0000B6', '#000092', '#00006D', '#000049']; // monotonic blue ramp
const MD_LEVELS = [0, 36, 73, 109, 146, 182, 219, 255];

// ---------- sound: square-wave PSG sfx + 2-operator FM music, like the YM2612 ----------
// Every sound routes through one master gain so mute is total.
let audioCtx = null, masterGain = null, muted = false;
function audioOut() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.connect(audioCtx.destination);
    masterGain.gain.value = muted ? 0 : 1;
  }
  return masterGain;
}
function setMuted(m) {
  muted = m;
  music.on = !m;
  try { if (masterGain) masterGain.gain.value = m ? 0 : 1; } catch (e) {}
}
// tab hidden -> total silence; back -> resume unless muted
document.addEventListener('visibilitychange', () => {
  try {
    if (!audioCtx) return;
    if (document.hidden) audioCtx.suspend();
    else if (!muted) audioCtx.resume();
  } catch (e) {}
});
function sfx(freq, dur, type = 'square', vol = 0.06, slide = 0) {
  try {
    if (muted) return;
    const out = audioOut();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    if (slide) o.frequency.linearRampToValueAtTime(freq + slide, audioCtx.currentTime + dur);
    g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.connect(g); g.connect(out);
    o.start(); o.stop(audioCtx.currentTime + dur);
  } catch (e) { /* audio unavailable — fine */ }
}
function jingle(notes, step = 0.12, vol = 0.06) {
  notes.forEach((f, i) => setTimeout(() => sfx(f, step * 1.4, 'square', vol), i * step * 1000));
}
const sndHit = () => sfx(rand(180, 240), 0.06, 'square', 0.025);
const sndHurt = () => sfx(110, 0.2, 'sawtooth', 0.08, -40);
const sndCoin = () => { sfx(988, 0.06, 'square', 0.05); setTimeout(() => sfx(1319, 0.14, 'square', 0.05), 60); };
const sndCrit = () => sfx(150, 0.12, 'square', 0.07, -60);
const sndLevel = () => jingle([440, 660, 880], 0.09);
const sndBoss = () => sfx(70, 0.7, 'sawtooth', 0.1, -20);
const sndStreak = () => jingle([330, 494, 659], 0.08, 0.07);
const sndNuke = () => sfx(60, 1.2, 'sawtooth', 0.14, 500);
const sndChest = () => jingle([523, 659, 784, 1047, 1319], 0.11, 0.07);
const sndMove = () => sfx(880, 0.03, 'square', 0.03);
const sndOk = () => jingle([660, 990], 0.05, 0.05);
const sndTick = () => sfx(1200, 0.02, 'square', 0.025);
const sndGameOver = () => jingle([392, 349, 311, 262, 196], 0.2);
const sndClear = () => jingle([523, 659, 784, 1047, 784, 1047, 1319], 0.11);

const music = { on: true, started: false, step: 0, nextT: 0, timer: null };
// A harmonic minor flavour: dark, driving
const M_BASS = [55, 55, 0, 55, 82.4, 0, 55, 0, 65.4, 65.4, 0, 65.4, 49, 0, 61.7, 0]; // A1 E2 C2 G1 B1
const M_ARP = [220, 261.6, 329.6, 261.6, 220, 329.6, 392, 329.6,
  261.6, 329.6, 415.3, 329.6, 246.9, 293.7, 370, 293.7]; // Am / C / E arps
function musicTick() {
  if (!music.on || muted || !audioCtx) return;
  const bpm = 138, stepDur = 60 / bpm / 4;
  // never play catch-up after mute/background throttling — snap to now
  if (music.nextT < audioCtx.currentTime - 0.1) music.nextT = audioCtx.currentTime + 0.05;
  while (music.nextT < audioCtx.currentTime + 0.18) {
    const s = music.step % 16, bar = Math.floor(music.step / 16) % 4;
    const t = music.nextT;
    if (s % 4 === 0) beep(t, 90, 0.11, 'sine', 0.16, -55);          // kick
    if (s === 4 || s === 12) noiseHit(t, 0.07, 0.07);                 // snare
    if (s % 2 === 1) noiseHit(t, 0.025, 0.02);                        // hats
    const b = M_BASS[s];
    if (b) fm(t, bar === 3 ? b * 0.75 : b, stepDur * 0.95, 0.13, 1, 2.4, 0.09);  // FM slap bass
    const intense = scene === 'play' && state.time > 300;
    if (intense || s % 2 === 0) {
      const a = M_ARP[(s + bar * 4) % 16];
      fm(t, intense ? a * 2 : a, stepDur * 0.85, 0.045, 2, 1.4, 0.07);  // FM brass lead
    }
    music.step++;
    music.nextT += stepDur;
  }
}
// 2-operator FM voice: a sine modulator bends a sine carrier; the modulation
// index decays fast, giving the bright attack / mellow tail of Mega Drive FM.
function fm(t, freq, dur, vol, ratio, index, decay) {
  try {
    const out = audioOut();
    const car = audioCtx.createOscillator(), mod = audioCtx.createOscillator();
    const depth = audioCtx.createGain(), amp = audioCtx.createGain();
    car.frequency.setValueAtTime(freq, t);
    mod.frequency.setValueAtTime(freq * ratio, t);
    const d0 = freq * ratio * index;
    depth.gain.setValueAtTime(d0, t);
    depth.gain.exponentialRampToValueAtTime(Math.max(1, d0 * 0.12), t + decay);
    amp.gain.setValueAtTime(vol, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + dur);
    mod.connect(depth); depth.connect(car.frequency);
    car.connect(amp); amp.connect(out);
    mod.start(t); car.start(t);
    mod.stop(t + dur + 0.02); car.stop(t + dur + 0.02);
  } catch (e) {}
}
function beep(t, freq, dur, type, vol, slide = 0) {
  try {
    const out = audioOut();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.linearRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(out);
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
    src.connect(g); g.connect(audioOut());
    src.start(t); src.stop(t + dur + 0.02);
  } catch (e) {}
}
function startMusic() {
  try {
    audioOut();
    // iframes and strict autoplay policies hand us a suspended context —
    // resume now (we're inside a key/tap handler) and again on any later gesture
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (music.started) return;
    music.started = true;
    music.nextT = audioCtx.currentTime + 0.1;
    music.timer = setInterval(musicTick, 60);
  } catch (e) {}
}
function stopMusic() {
  if (music.timer) { clearInterval(music.timer); music.timer = null; }
}
function unlockAudio() {
  try { if (audioCtx && audioCtx.state === 'suspended' && !muted) audioCtx.resume(); } catch (e) {}
}
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

// ---------- bitmap fonts ----------
// 5×7 uppercase font on a 6-dot advance (monospace, like an 8×8 tile font).
const FONT5 = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.....', '..#..'],
  ',': ['.....', '.....', '.....', '.....', '.....', '..#..', '.#...'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  ':': ['.....', '.....', '..#..', '.....', '.....', '..#..', '.....'],
  "'": ['..#..', '..#..', '.....', '.....', '.....', '.....', '.....'],
  '-': ['.....', '.....', '.....', '.###.', '.....', '.....', '.....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '%': ['##..#', '##..#', '...#.', '..#..', '.#...', '#..##', '#..##'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  '>': ['.#...', '..#..', '...#.', '....#', '...#.', '..#..', '.#...'],
  '<': ['...#.', '..#..', '.#...', '#....', '.#...', '..#..', '...#.'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
};
const FONT_CHARS = Object.keys(FONT5);
const FONT_IDX = new Map(FONT_CHARS.map((c, i) => [c, i]));
// 3×5 digit font for damage numbers
const DIG3 = {
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['###', '..#', '###', '#..', '###'], 3: ['###', '..#', '.##', '..#', '###'],
  4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '###', '..#', '###'],
  6: ['###', '#..', '###', '#.#', '###'], 7: ['###', '..#', '..#', '.#.', '.#.'],
  8: ['###', '#.#', '###', '#.#', '###'], 9: ['###', '#.#', '###', '..#', '###'],
  '+': ['...', '.#.', '###', '.#.', '...'], '-': ['...', '...', '###', '...', '...'],
  '!': ['.#.', '.#.', '.#.', '...', '.#.'],
};
const DIG_CHARS = Object.keys(DIG3);
const DIG_IDX = new Map(DIG_CHARS.map((c, i) => [c, i]));

function atlasFor(cache, chars, glyphs, gw, gh, color) {
  let c = cache.get(color);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = chars.length * gw; c.height = gh;
  const g = c.getContext('2d');
  g.fillStyle = color;
  chars.forEach((ch, i) => {
    const rows = glyphs[ch];
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      if (rows[y][x] === '#') g.fillRect(i * gw + x, y, 1, 1);
    }
  });
  cache.set(color, c);
  return c;
}
const fontCache = new Map(), digCache = new Map();
const fontAtlas = color => atlasFor(fontCache, FONT_CHARS, FONT5, 5, 7, color);
const digAtlas = color => atlasFor(digCache, DIG_CHARS, DIG3, 3, 5, color);

// Uppercase + map typographic punctuation onto the glyph set; anything left
// unmapped is reported once so a missing glyph can never slip in silently.
const warnedChars = new Set();
function norm(str) {
  const s = String(str).toUpperCase()
    .replace(/[’‘]/g, "'").replace(/[—–]/g, '-').replace(/×/g, 'X')
    .replace(/→/g, '>').replace(/&/g, '+');
  let out = '';
  for (const ch of s) {
    if (ch === ' ' || FONT_IDX.has(ch)) out += ch;
    else {
      if (!warnedChars.has(ch)) { warnedChars.add(ch); console.warn('font: no glyph for', JSON.stringify(ch)); }
      out += '?';
    }
  }
  return out;
}
const textW = (s, sc = 1) => (s.length ? s.length * 6 - 1 : 0) * sc;
const DIRS8 = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
function glyphs(s, x, y, color, sc) {
  const atlas = fontAtlas(color);
  for (let i = 0; i < s.length; i++) {
    const idx = FONT_IDX.get(s[i]);
    if (idx !== undefined) ctx.drawImage(atlas, idx * 5, 0, 5, 7, x + i * 6 * sc, y, 5 * sc, 7 * sc);
  }
}
// cartridge-logo banding: top / middle / bottom rows in three colours
function gradGlyphs(s, x, y, cols, sc) {
  [[0, 2], [2, 3], [5, 2]].forEach(([r0, rh], bi) => {
    const atlas = fontAtlas(cols[bi]);
    for (let i = 0; i < s.length; i++) {
      const idx = FONT_IDX.get(s[i]);
      if (idx !== undefined) {
        ctx.drawImage(atlas, idx * 5, r0, 5, rh, x + i * 6 * sc, y + r0 * sc, 5 * sc, rh * sc);
      }
    }
  });
}
function drawText(str, x, y, color = C.white, o = {}) {
  const s = norm(str), sc = o.scale || 1, w = textW(s, sc);
  const x0 = Math.round(o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x);
  const y0 = Math.round(y);
  if (o.drop) for (const [dx, dy] of DIRS8) glyphs(s, x0 + (dx + 1) * sc, y0 + (dy + 1) * sc, o.drop, sc);
  if (o.outline) for (const [dx, dy] of DIRS8) glyphs(s, x0 + dx * sc, y0 + dy * sc, o.outline, sc);
  else if (o.shadow !== false) glyphs(s, x0 + sc, y0 + sc, o.shadowColor || C.black, sc);
  if (o.grad) gradGlyphs(s, x0, y0, o.grad, sc); else glyphs(s, x0, y0, color, sc);
  return w;
}
function drawNum(str, x, y, color, sc = 1, align = 'center') {
  str = String(str);
  const w = (str.length * 4 - 1) * sc;
  const x0 = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x);
  const y0 = Math.round(y);
  for (const [atlas, off] of [[digAtlas(C.black), sc], [digAtlas(color), 0]]) {
    for (let i = 0; i < str.length; i++) {
      const idx = DIG_IDX.get(str[i]);
      if (idx !== undefined) ctx.drawImage(atlas, idx * 3, 0, 3, 5, x0 + i * 4 * sc + off, y0 + off, 3 * sc, 5 * sc);
    }
  }
}
function wrapText(str, maxW) {
  const maxChars = Math.max(1, Math.floor((maxW + 1) / 6));
  const lines = [];
  let cur = '';
  for (const word of norm(str).split(' ')) {
    const t = cur ? cur + ' ' + word : word;
    if (t.length <= maxChars) cur = t;
    else { if (cur) lines.push(cur); cur = word.slice(0, maxChars); }
  }
  if (cur) lines.push(cur);
  return lines;
}

// ---------- pixel primitives (integer coordinates only — no anti-aliasing) ----------
function rect(x, y, w, h, c) {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
function line(x0, y0, x1, y1, c, s = 1) {           // Bresenham
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  ctx.fillStyle = c;
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let guard = 0; guard < 2000; guard++) {
    ctx.fillRect(x0, y0, s, s);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
function ring(cx, cy, r, c) {                         // midpoint circle
  cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
  if (r <= 0) return;
  ctx.fillStyle = c;
  let x = r, y = 0, err = 1 - r;
  while (x >= y) {
    ctx.fillRect(cx + x, cy + y, 1, 1); ctx.fillRect(cx + y, cy + x, 1, 1);
    ctx.fillRect(cx - y, cy + x, 1, 1); ctx.fillRect(cx - x, cy + y, 1, 1);
    ctx.fillRect(cx - x, cy - y, 1, 1); ctx.fillRect(cx - y, cy - x, 1, 1);
    ctx.fillRect(cx + y, cy - x, 1, 1); ctx.fillRect(cx + x, cy - y, 1, 1);
    y++;
    if (err < 0) err += 2 * y + 1;
    else { x--; err += 2 * (y - x) + 1; }
  }
}
function disc(cx, cy, r, c) {                         // filled circle by scanlines
  cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
  if (r <= 0) return;
  ctx.fillStyle = c;
  for (let dy = -r; dy <= r; dy++) {
    const hw = Math.floor(Math.sqrt(r * r - dy * dy + r * 0.8));
    ctx.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1);
  }
}
function arcDots(cx, cy, r, a0, a1, c, s = 1) {
  if (r <= 0) return;
  ctx.fillStyle = c;
  const n = Math.max(2, Math.ceil((a1 - a0) * r));
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * i / n;
    ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), s, s);
  }
}
// RPG text window: black edge, light border, stepped blue gradient, cut corners
function drawWindow(x, y, w, h, o = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const bands = o.bands || WIN_BANDS, ih = h - 4, n = bands.length;
  for (let i = 0; i < n; i++) {
    const y0 = y + 2 + Math.floor(ih * i / n), y1 = y + 2 + Math.floor(ih * (i + 1) / n);
    rect(x + 2, y0, w - 4, y1 - y0, bands[i]);
  }
  const edge = o.edge || C.black, border = o.border || '#DBDBDB';
  rect(x + 1, y, w - 2, 1, edge); rect(x + 1, y + h - 1, w - 2, 1, edge);
  rect(x, y + 1, 1, h - 2, edge); rect(x + w - 1, y + 1, 1, h - 2, edge);
  rect(x + 1, y + 1, w - 2, 1, border); rect(x + 1, y + h - 2, w - 2, 1, border);
  rect(x + 1, y + 1, 1, h - 2, border); rect(x + w - 2, y + 1, 1, h - 2, border);
}
const dim = () => rect(0, 0, W, H, 'rgba(0,0,0,0.5)');

// ---------- pixel-art sprites authored as strings ----------
const IP = {           // icon palette
  K: '#000000', W: '#FFFFFF', L: '#B6B6B6', G: '#6D6D6D', D: '#494949',
  R: '#FF2400', Y: '#FFDB00', O: '#FF9200', N: '#24DB24', n: '#006D00',
  C: '#49DBFF', B: '#2449FF', P: '#B649FF', S: '#B66D24', s: '#6D2400',
};
const ICON_ROWS = {
  optic: ['..........', '.KKKK.....', 'KRRRRKKKKK', 'KRWWRRRRRR', 'KRWWWWWWWW',
    'KRWWWWWWWW', 'KRWWRRRRRR', 'KRRRRKKKKK', '.KKKK.....', '..........'],
  claws: ['.W..W..W..', '.WL.WL.WL.', '.WL.WL.WL.', '.WL.WL.WL.', '.WL.WL.WL.',
    'KWLKWLKWLK', 'KSSSSSSSSK', 'KSsSsSsSSK', 'KSSSSSSSSK', '.KKKKKKKK.'],
  storm: ['.....KKKK.', '....KYYYK.', '...KYYYK..', '..KYYYK...', '.KYYYYYYK.',
    '.KKKKYYYK.', '....KYYK..', '...KYYK...', '..KYK.....', '..KK......'],
  orbs: ['......KKK.', '.....KNNNK', '...KKKNWNK', '..KNNNKKK.', '.KNWNNNnK.',
    '.KNNNNNnK.', '.KNNNNnnK.', '.KnNNnnnK.', '..KnnnnK..', '...KKKK...'],
  nova: ['..KKKKKK..', '.KPPPPPPK.', 'KPKKKKKKPK', 'KPK....KPK', 'KPK.WP.KPK',
    'KPK.PP.KPK', 'KPK....KPK', 'KPKKKKKKPK', '.KPPPPPPK.', '..KKKKKK..'],
  cards: ['....KKKKKK', '....KPPPPK', 'KKKKKKKPPK', 'KWWWWWKPPK', 'KWWRWWKPPK',
    'KWRRRWKPPK', 'KWWRWWKKKK', 'KWWWWWK...', 'KWWWWWK...', 'KKKKKKK...'],
  boots: ['...KKKK...', '...KBBK...', '...KBBK...', '...KBBK...', '...KBBKKK.',
    '...KBBBBBK', 'C.KBBBBBBK', 'CCKWWWWWWK', '..KKKKKKKK', '..........'],
  vitality: ['..........', '.KKK.KKK..', 'KRRRKRRRK.', 'KRWRRRRRK.', 'KRRRRRRRK.',
    '.KRRRRRK..', '..KRRRK...', '...KRK....', '....K.....', '..........'],
  regen: ['...KKKK...', '...KNNK...', '...KNNK...', 'KKKKNNKKKK', 'KWNNNNNNNK',
    'KNNNNNNNNK', 'KKKKNNKKKK', '...KNNK...', '...KNNK...', '...KKKK...'],
  magnet: ['KKK....KKK', 'KLK....KLK', 'KLK....KLK', 'KRK....KRK', 'KRK....KRK',
    'KRK....KRK', 'KRRK..KRRK', '.KRRKKRRK.', '..KRRRRK..', '...KKKK...'],
  power: ['....KK....', '...KYYK...', '...KYYK...', 'KKKKYYKKKK', 'KOYYWYYYOK',
    '.KOYYYYOK.', '..KYYYYK..', '.KYYKKYYK.', '.KYK..KYK.', '.KK....KK.'],
  focus: ['...KKKK...', '.KKRRRRKK.', '.KRWWWWRK.', 'KRWRRRRWRK', 'KRWRWWRWRK',
    'KRWRWWRWRK', 'KRWRRRRWRK', '.KRWWWWRK.', '.KKRRRRKK.', '...KKKK...'],
  plating: ['KKKKKKKKKK', 'KWLLLLLLGK', 'KWLLLLLLGK', 'KLLLLLLLGK', 'KLLLLLLGGK',
    '.KLLLLLGK.', '.KLLLLGGK.', '..KLLLGK..', '...KLGK...', '....KK....'],
  heal: ['.KKKKKKKK.', 'KWWWWWWWWK', 'KWWWRRWWWK', 'KWWWRRWWWK', 'KWRRRRRRWK',
    'KWRRRRRRWK', 'KWWWRRWWWK', 'KWWWRRWWWK', 'KLLLLLLLLK', '.KKKKKKKK.'],
  gold: ['..KKKKKK..', '.KYYYYYYK.', 'KYWYYYYYOK', 'KYYYOOYYOK', 'KYYOYYOYOK',
    'KYYOYYOYOK', 'KYYYOOYYOK', 'KYYYYYYOOK', '.KOOOOOOK.', '..KKKKKK..'],
};
const COIN_ROWS = [
  ['..KKKK..', '.KYYYYK.', 'KYWYYYOK', 'KYWYYYOK', 'KYYYYYOK', 'KYYYYOOK', '.KOOOOK.', '..KKKK..'],
  ['...KK...', '..KYYK..', '..KWYK..', '..KWYK..', '..KYOK..', '..KYOK..', '..KOOK..', '...KK...'],
  ['...KK...', '...YK...', '...YK...', '...YK...', '...OK...', '...OK...', '...OK...', '...KK...'],
];
const BOMB_ROWS = [
  ['.......Y.', '......KW.', '.....K...', '..KKKKK..', '.KDDDDDK.', 'KDLDDDDDK', 'KDLDDDDDK', 'KDDDDDDDK', '.KDDDDDK.', '..KKKKK..'],
  ['.......W.', '......KY.', '.....K...', '..KKKKK..', '.KDDDDDK.', 'KDLDDDDDK', 'KDLDDDDDK', 'KDDDDDDDK', '.KDDDDDK.', '..KKKKK..'],
];
const CHEST_ROWS = ['.KKKKKKKKKKKK.', 'KSSSSSSSSSSSSK', 'KSYSSSSSSSSYSK', 'KSSSSSSSSSSSSK',
  'KKKKKKKKKKKKKK', 'KYYYYYKKYYYYYK', 'KSSSSSKYKSSSSK', 'KSYSSSKKKSSYSK', 'KSSSSSSSSSSSSK',
  'KssssssssssssK', '.KKKKKKKKKKKK.'];
const ORB_ROWS = ['..KKK..', '.KNNNK.', 'KNWNNnK', 'KNNNNnK', 'KNNNnnK', '.KnnnK.', '..KKK..'];
const CARD_ROWS = [
  ['KKKKK', 'KWWWK', 'KWRWK', 'KRRRK', 'KWRWK', 'KWWWK', 'KKKKK'],
  ['.KKK.', '.KWK.', '.KRK.', '.KRK.', '.KRK.', '.KWK.', '.KKK.'],
  ['KKKKK', 'KPPPK', 'KPWPK', 'KPPPK', 'KPWPK', 'KPPPK', 'KKKKK'],
];
const CURSOR_ROWS = ['Y....', 'YY...', 'YYY..', 'YYYY.', 'YYY..', 'YY...', 'Y....'];
const SPK_ON_ROWS = ['...W...W.', '..WW.W..W', 'WWWW..W.W', 'WWWW..W.W', 'WWWW..W.W', '..WW.W..W', '...W...W.'];
const SPK_OFF_ROWS = ['...W.....', '..WW.....', 'WWWW.R.R.', 'WWWW..R..', 'WWWW.R.R.', '..WW.....', '...W.....'];
const PAUSE_ROWS = ['..WW.WW..', '..WW.WW..', '..WW.WW..', '..WW.WW..', '..WW.WW..', '..WW.WW..', '..WW.WW..'];
const GEM_ROWS = {
  small: ['..K..', '.KHK.', 'KHAAK', 'KAAAK', 'KADAK', '.KDK.', '..K..'],
  mid: ['...K...', '..KHK..', '.KHAAK.', 'KHAAAAK', 'KAAAAAK', 'KAADAAK', '.KADDK.', '..KDK..', '...K...'],
  big: ['....K....', '...KHK...', '..KHAAK..', '.KHAAAAK.', 'KHAAAAAAK', 'KAAAAAAAK',
    'KAAAADAAK', '.KAADDAK.', '..KADDK..', '...KDK...', '....K....'],
};
const GEM_PALS = {
  green: { K: '#004900', H: '#DBFFDB', A: '#24DB49', D: '#009224' },
  blue: { K: '#000049', H: '#DBFFFF', A: '#49B6FF', D: '#2449B6' },
  gold: { K: '#492400', H: '#FFFFDB', A: '#FFDB24', D: '#DB6D00' },
  ruby: { K: '#490000', H: '#FFDBDB', A: '#FF2449', D: '#920024' },
};

function pixmap(rows, pal, name) {
  const h = rows.length, w = rows[0].length;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  rows.forEach((row, y) => {
    if (row.length !== w) console.error(`pixmap ${name}: row ${y} is ${row.length} wide, expected ${w}`);
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      if (!pal[ch]) { console.error(`pixmap ${name}: no colour for "${ch}"`); continue; }
      g.fillStyle = pal[ch];
      g.fillRect(x, y, 1, 1);
    }
  });
  return c;
}
const ICONS = {}, GEMS = {};
let COIN = [], BOMB = [], CHEST = null, ORB = null, CARD = [], CURSOR = null, CURSOR_SH = null;
let SPK_ON = null, SPK_OFF = null, PAUSE_IC = null;
function compilePixmaps() {
  for (const [k, rows] of Object.entries(ICON_ROWS)) ICONS[k] = pixmap(rows, IP, 'icon:' + k);
  COIN = COIN_ROWS.map((r, i) => pixmap(r, IP, 'coin' + i));
  BOMB = BOMB_ROWS.map((r, i) => pixmap(r, IP, 'bomb' + i));
  CHEST = pixmap(CHEST_ROWS, IP, 'chest');
  ORB = pixmap(ORB_ROWS, IP, 'orb');
  CARD = CARD_ROWS.map((r, i) => pixmap(r, IP, 'card' + i));
  CURSOR = pixmap(CURSOR_ROWS, IP, 'cursor');
  CURSOR_SH = pixmap(CURSOR_ROWS, { Y: C.black }, 'cursor-shadow');
  SPK_ON = pixmap(SPK_ON_ROWS, IP, 'speaker-on');
  SPK_OFF = pixmap(SPK_OFF_ROWS, IP, 'speaker-off');
  PAUSE_IC = pixmap(PAUSE_ROWS, IP, 'pause');
  GEMS.green = pixmap(GEM_ROWS.small, GEM_PALS.green, 'gem-green');
  GEMS.blue = pixmap(GEM_ROWS.mid, GEM_PALS.blue, 'gem-blue');
  GEMS.gold = pixmap(GEM_ROWS.mid, GEM_PALS.gold, 'gem-gold');
  GEMS.ruby = pixmap(GEM_ROWS.big, GEM_PALS.ruby, 'gem-ruby');
}
compilePixmaps();
const gemSprite = v => (v >= 8 ? GEMS.ruby : v >= 5 ? GEMS.gold : v >= 3 ? GEMS.blue : GEMS.green);
function drawCursor(x, y) {
  ctx.drawImage(CURSOR_SH, Math.round(x) + 1, Math.round(y) + 1);
  ctx.drawImage(CURSOR, Math.round(x), Math.round(y));
}
// rank pips: filled = current rank, blinking = the rank you're about to get
function pips(x, y, filled, next = filled, size = 1) {
  for (let i = 0; i < MAX_LEVEL; i++) {
    const col = i < filled ? C.yellow : (i < next && blink(4)) ? C.white : C.pipOff;
    rect(x + i * (size + 1), y, size, size, col);
  }
}

// ---------- assets: load, palette-quantize, palette-swap ----------
const ASSET_FILES = ['warrior', 'wizard', 'ranger', 'rogue', 'cleric',
  'slime', 'goblin', 'skeleton', 'orc', 'minotaur', 'tiles', 'biski'];
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

// Snap every pixel to the Mega Drive's 512 colours with hard alpha. Reading
// pixels fails on file:// pages (tainted canvas) — then the art is left as-is.
let mdPaletteApplied = true;
function mdQuantize(c) {
  try {
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height), a = d.data;
    for (let i = 0; i < a.length; i += 4) {
      if (a[i + 3] < 128) { a[i + 3] = 0; continue; }
      a[i + 3] = 255;
      a[i] = MD_LEVELS[Math.round(a[i] * 7 / 255)];
      a[i + 1] = MD_LEVELS[Math.round(a[i + 1] * 7 / 255)];
      a[i + 2] = MD_LEVELS[Math.round(a[i + 2] * 7 / 255)];
    }
    g.putImageData(d, 0, 0);
    return true;
  } catch (e) {
    return false;
  }
}
function bakeSheet(img, filter) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  if (filter) g.filter = filter;
  g.drawImage(img, 0, 0);
  if (!mdQuantize(c)) mdPaletteApplied = false;
  return c;
}
function silhouette(src, color) {   // hit-flash palette: every opaque pixel -> one colour
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}
const SPR = {};   // file -> { base, white, elite?, boss2?, boss3? }
// the black cat needs a small lift so her shading survives the 9-bit palette
const BAKE_FILTERS = { biski: 'brightness(1.6)' };
function prepareSprites() {
  for (const name of ASSET_FILES) {
    const set = SPR[name] = { base: bakeSheet(assets[name], BAKE_FILTERS[name] || null) };
    set.white = silhouette(set.base, C.white);
  }
  // palette-swapped variants, the way cartridges reused one sprite for a tougher foe
  for (const f of ['slime', 'skeleton', 'goblin', 'orc']) {
    SPR[f].elite = bakeSheet(assets[f], 'saturate(2.2) brightness(1.15)');
  }
  SPR.minotaur.boss2 = bakeSheet(assets.minotaur, 'hue-rotate(140deg) saturate(1.4)');
  SPR.minotaur.boss3 = bakeSheet(assets.minotaur, 'hue-rotate(250deg) saturate(1.6)');
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
  biski:    { file: 'biski',    size: 32, rows: STD }, // Shepardskin's CC0 cat, repacked
};

const SCALE = 2; // world units per sprite pixel (= 1 dot)

// camera, in dots
let camX = 0, camY = 0;
const toDX = wx => Math.round(wx / PX) - camX;
const toDY = wy => Math.round(wy / PX) - camY;

// Draw a sheet frame with its feet anchored at world (wx, wgy).
function drawSprite(sheetKey, anim, frame, wx, wgy, flip, wscale = SCALE, variant = null) {
  const def = SHEETS[sheetKey], set = SPR[def.file];
  if (!set) return;
  const img = (variant && set[variant]) || set.base;
  const s = def.size, k = wscale / PX;
  const dw = Math.round(s * k);
  const left = toDX(wx) - (dw >> 1);
  const top = toDY(wgy) - dw + Math.round(3 * k);   // sprites sit ~3px above the cell bottom
  if (left > W || top > H || left + dw < 0 || top + dw < 0) return;
  const row = def.rows[anim] ?? def.rows.idle;
  if (flip) {
    ctx.save();
    ctx.translate(left + dw, top);
    ctx.scale(-1, 1);
    ctx.drawImage(img, frame * s, row * s, s, s, 0, 0, dw, dw);
    ctx.restore();
  } else {
    ctx.drawImage(img, frame * s, row * s, s, s, left, top, dw, dw);
  }
}
function animFrame(animT, anim) {
  if (anim === 'death') return Math.min(9, Math.floor(animT * 12));
  if (anim === 'attack') return Math.floor(animT * 20) % 10;
  return Math.floor(animT * 10) % 10;
}

// hard-edged half-dark ovals: the Mega Drive's shadow/highlight mode
const shadowCache = new Map();
function shadowSprite(rx) {
  rx = Math.max(3, Math.round(rx));
  let c = shadowCache.get(rx);
  if (c) return c;
  const ry = Math.max(1, Math.round(rx * 0.32));
  c = document.createElement('canvas');
  c.width = rx * 2 + 1; c.height = ry * 2 + 1;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.4)';
  for (let dy = -ry; dy <= ry; dy++) {
    const hw = Math.round(rx * Math.sqrt(1 - (dy / (ry + 0.5)) ** 2));
    g.fillRect(rx - hw, ry + dy, hw * 2 + 1, 1);
  }
  shadowCache.set(rx, c);
  return c;
}
function drawShadowAt(wx, wy, rWorld) {
  const s = shadowSprite(rWorld / PX);
  const x = toDX(wx), y = toDY(wy);
  if (x < -s.width || x > W + s.width || y < -s.height || y > H + s.height) return;
  ctx.drawImage(s, x - (s.width >> 1), y - (s.height >> 1));
}
// stepped torch-light pools, added on top of the floor
const lightCache = new Map();
function lightSprite(r) {
  let c = lightCache.get(r);
  if (c) return c;
  const ry = Math.round(r * 0.62);
  c = document.createElement('canvas');
  c.width = r * 2 + 1; c.height = ry * 2 + 1;
  const g = c.getContext('2d');
  for (const [k, a] of [[1, 0.03], [0.7, 0.04], [0.42, 0.05]]) {
    g.fillStyle = `rgba(255,146,0,${a})`;
    const rx2 = r * k, ry2 = Math.max(1, Math.floor(ry * k));
    for (let dy = -ry2; dy <= ry2; dy++) {
      const hw = Math.round(rx2 * Math.sqrt(1 - (dy / (ry2 + 0.5)) ** 2));
      g.fillRect(r - hw, ry + dy, hw * 2 + 1, 1);
    }
  }
  lightCache.set(r, c);
  return c;
}

// ---------- floor, obstacles & braziers (Buch dungeon tileset, 16px tiles) ----------
const T = 16, TILE = T * SCALE; // 32 world units = 16 dots
const FLOOR_TILES = [
  [3, 3], [4, 3], [3, 4], [4, 4], [5, 4], [4, 5], [5, 5], [3, 3], [4, 4], [3, 4],
  [4, 3], [5, 5], [4, 4], [3, 3], [5, 3], [3, 5], // speckled variants, kept rare
];

// deterministic environment: solid crate/barrel obstacles + destructible braziers
function obstacleAt(ix, iy) { const h = hash2(ix * 13 + 7, iy * 17 + 3); return h % 67 === 0 ? h : 0; }
function brazierAt(ix, iy) { const h = hash2(ix * 3 + 1, iy * 5 + 9); return h % 131 === 0 ? h : 0; }
const BRAZIER_HP = 26;
const brazierDamageMap = new Map(); // "ix,iy" -> damage taken
const brazierHitAt = new Map();     // "ix,iy" -> uiTime of the last hit (for shake + flash)
const brazierDead = new Set();

function scanEnv() {
  // rebuild the nearby obstacle/brazier lists once per frame
  const M = 120;
  const x0 = Math.floor((player.x - VW / 2 - M) / TILE), x1 = Math.ceil((player.x + VW / 2 + M) / TILE);
  const y0 = Math.floor((player.y - VH / 2 - M) / TILE), y1 = Math.ceil((player.y + VH / 2 + M) / TILE);
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
  brazierHitAt.set(bz.key, uiTime);
  effects.push({ type: 'boom', x: bz.x, y: bz.y - 16, radius: 18, life: 0.15, maxLife: 0.15 });
  if (cur < BRAZIER_HP) return;
  brazierDead.add(bz.key);
  brazierDamageMap.delete(bz.key);
  const roll = Math.random();
  if (roll < 0.45) pickups.push({ x: bz.x, y: bz.y, type: 'gold', v: randInt(15, 40) });
  else if (roll < 0.70) pickups.push({ x: bz.x, y: bz.y, type: 'med' });
  else if (roll < 0.85) gems.push({ x: bz.x, y: bz.y, v: 8 });
  else if (roll < 0.96) pickups.push({ x: bz.x, y: bz.y, type: 'vac' });
  else pickups.push({ x: bz.x, y: bz.y, type: 'nuke' });
  effects.push({ type: 'boom', x: bz.x, y: bz.y - 10, radius: 40, life: 0.3, maxLife: 0.3 });
  sfx(400, 0.15, 'triangle', 0.07, -150);
}

function drawFloor() {
  const img = SPR.tiles.base;
  const ix0 = Math.floor(camX / T), iy0 = Math.floor(camY / T);
  const ix1 = Math.floor((camX + W) / T), iy1 = Math.floor((camY + H) / T);
  for (let iy = iy0; iy <= iy1; iy++) {
    for (let ix = ix0; ix <= ix1; ix++) {
      const [tx, ty] = FLOOR_TILES[hash2(ix, iy) % FLOOR_TILES.length];
      ctx.drawImage(img, tx * T, ty * T, T, T, ix * T - camX, iy * T - camY, T, T);
    }
  }
}

function drawObstacle(o) {
  const img = SPR.tiles.base, x = toDX(o.x), y = toDY(o.y);
  if (x < -40 || x > W + 40 || y < -40 || y > H + 40) return;
  if (o.kind === 0) { // 2x2 crate stack
    for (const [ox, oy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
      ctx.drawImage(img, 9 * T, (7 + ((ox + oy) & 1)) * T, T, T, x + ox * T, y + oy * T, T, T);
    }
  } else { // barrel pair
    ctx.drawImage(img, 12 * T, 7 * T, T, T, x - T, y - T / 2, T, T);
    ctx.drawImage(img, 12 * T, 7 * T, T, T, x, y - T / 2 - 2, T, T);
  }
}

function drawBrazier(bz) {
  const y = toDY(bz.y);
  let x = toDX(bz.x);
  if (x < -20 || x > W + 20 || y < -40 || y > H + 20) return;
  const since = uiTime - (brazierHitAt.get(bz.key) ?? -9);
  if (since < 0.15) x += blink(30) ? 1 : -1;                 // judder when struck
  const img = since < 0.06 ? SPR.tiles.white : SPR.tiles.base; // one-frame white flash
  ctx.drawImage(img, 12 * T, 8 * T, T, 2 * T, x - T / 2, y - T - T / 2, T, 2 * T);
}
function drawBrazierLight(bz) {
  const x = toDX(bz.x), y = toDY(bz.y) - 10;
  if (x < -50 || x > W + 50 || y < -50 || y > H + 50) return;
  const l = lightSprite(Math.floor(uiTime * 6 + bz.x) % 3 === 0 ? 34 : 36);
  ctx.drawImage(l, x - (l.width >> 1), y - (l.height >> 1));
}

// ---------- game constants ----------
const WIN_TIME = 15 * 60;           // survive this long to win
const MAX_WEAPONS = 4, MAX_PASSIVES = 4, MAX_LEVEL = 5;

// ---------- state ----------
const state = {
  running: false, won: false,
  time: 0, kills: 0, level: 1, xp: 0, xpNeed: 5, gold: 0, goldShown: 0,
  spawnTimer: 0, bossesSpawned: 0, eventsFired: 0, elitesSpawned: 0,
  shake: 0, flash: 0, killTimes: [], streakTier: 0,
  hitstop: 0, lastGemT: -9, gemCombo: 0, heartT: 0,
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
  facing: { x: 1, y: 0 }, hurtCd: 0, color: '#FFDB00', name: '',
  sprite: 'ranger', face: 1, moving: false, animT: 0, attackAge: 99,
  critChance: 0.12, drawScale: SCALE,
  weapons: [], passives: {},
};

const enemies = [], corpses = [], bullets = [], gems = [], effects = [], texts = [], pickups = [];

// ---------- kill burst particles ----------
// pixel-square debris with velocity + gravity; every 4th particle is a white spark
const particles = [];
function burstParticles(x, y, color, n) {
  if (particles.length > 500) n = Math.min(n, 3); // stay light during mass purges
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), sp = rand(40, 190);
    particles.push({
      x: x + rand(-4, 4), y: y + rand(-4, 4),
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rand(40, 130), // upward bias
      size: rand(2, 4.5), color: i % 4 === 3 ? C.white : color,
      life: rand(0.35, 0.6), maxLife: 0.6,
    });
  }
}

// ---------- weapons ----------
const WEAPON_DEFS = {
  optic: {
    name: 'Optic Blast',
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
          kind: 'optic', pierce: w.level >= 4 ? 1 : 0,
        });
      }
      sfx(520, 0.05, 'square', 0.03);
      return true;
    },
  },
  claws: {
    name: 'Adamant Claws',
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
    name: 'Storm Call',
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
    name: 'Magno Orbs',
    desc: 'Magnetically levitated shards orbit and shred on contact.',
    cd: 0, // continuous — handled in update
    fire() { return false; },
    passiveOrbit: true,
  },
  nova: {
    name: 'Psi Nova',
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
    name: 'Kinetic Cards',
    desc: 'Charged playing cards that detonate on impact.',
    cd: 1.3,
    fire(w) {
      const n = 1 + Math.floor(w.level / 2); // 1,2,2,3,3
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU);
        bullets.push({
          x: player.x, y: player.y - 14, vx: Math.cos(a) * 340, vy: Math.sin(a) * 340,
          r: 6, dmg: (14 + w.level * 6) * player.dmgMult, life: 1.4,
          kind: 'card', aoe: 55 + w.level * 8,
        });
      }
      sfx(660, 0.05, 'triangle', 0.03);
      return true;
    },
  },
};

// ---------- passives ----------
const PASSIVE_DEFS = {
  boots: { name: 'Blur Boots', desc: '+12% movement speed per rank.',
    apply() { player.speed *= 1.12; } },
  vitality: { name: 'Healing Factor', desc: '+25 max HP and heals 25 per rank.',
    apply() { player.maxHp += 25; player.hp = Math.min(player.maxHp, player.hp + 25); } },
  regen: { name: 'Regeneration', desc: 'Recover +0.6 HP per second per rank.',
    apply() { player.regen += 0.6; } },
  magnet: { name: 'Psychic Pull', desc: '+35% gene-shard pickup radius per rank.',
    apply() { player.magnetR *= 1.35; } },
  power: { name: 'Omega Gene', desc: '+12% damage on all powers per rank.',
    apply() { player.dmgMult *= 1.12; } },
  focus: { name: 'Combat Focus', desc: 'Powers recharge 10% faster per rank.',
    apply() { player.cdMult *= 0.9; } },
  plating: { name: 'Steel Skin', desc: 'Blocks 2 damage from every hit per rank.',
    apply() { player.armor += 2; } },
};
const HEAL_DEF = { name: 'Field Medkit', desc: 'Everything is maxed out. Restore 50 HP instead.' };

// ---------- heroes (Danger Room avatars) ----------
const HEROES = [
  { id: 'visor', name: 'Visor', sprite: 'ranger', color: '#FF4949',
    tag: 'Ranged striker', desc: 'Leader of the class. Optic Blast snipes the nearest threat. Balanced all-rounder.',
    weapon: 'optic', mods: () => {} },
  { id: 'wildcat', name: 'Wildcat', sprite: 'warrior', color: '#FFDB00',
    tag: 'Melee brawler', desc: 'Adamant Claws shred everything in reach. Tough, and heals fast.',
    weapon: 'claws', mods: () => { player.maxHp += 30; player.hp += 30; player.regen += 0.4; } },
  { id: 'skywitch', name: 'Sky Witch', sprite: 'wizard', color: '#49DBFF',
    tag: 'Area caster', desc: 'Storm Call drops lightning on the horde. Huge pickup aura, but fragile.',
    weapon: 'storm', mods: () => { player.magnetR *= 1.6; player.maxHp -= 15; player.hp -= 15; } },
  { id: 'ace', name: 'Ace', sprite: 'rogue', color: '#B649FF',
    tag: 'Skirmisher', desc: 'Kinetic Cards explode on impact. Quick on the feet.',
    weapon: 'cards', mods: () => { player.speed *= 1.12; } },
  { id: 'mender', name: 'Mender', sprite: 'cleric', color: '#24DB24',
    tag: 'Psi tank', desc: 'Psi Nova pulses damage all around. Regenerates fast.',
    weapon: 'nova', mods: () => { player.regen += 1.0; player.maxHp += 10; player.hp += 10; } },
  { id: 'biski', name: 'Biski', sprite: 'biski', color: '#9292FF', drawScale: 2.5,
    tag: 'Lucky familiar', desc: "The academy's black cat. Claws, obviously. Fastest hero, big crits, only 75 HP.",
    weapon: 'claws', mods: () => {
      player.speed *= 1.2; player.magnetR *= 1.3; player.critChance = 0.22;
      player.maxHp -= 25; player.hp -= 25;
    } },
];
// Read each hero's real stats by running their mods on a scratch copy of the
// base player — the select screen can never disagree with the game.
function heroStats(h) {
  const keys = ['maxHp', 'hp', 'regen', 'magnetR', 'speed', 'critChance'];
  const keep = {};
  for (const k of keys) keep[k] = player[k];
  Object.assign(player, { maxHp: 100, hp: 100, regen: 0, magnetR: 70, speed: 160, critChance: 0.12 });
  h.mods();
  const out = { hp: player.maxHp, speed: player.speed, crit: player.critChance, regen: player.regen };
  Object.assign(player, keep);
  return out;
}
const HERO_STATS = HEROES.map(heroStats);
const STAT_ROWS = ['hp', 'speed', 'crit', 'regen'].map(k => {
  const vals = HERO_STATS.map(s => s[k]);
  return { k, lo: Math.min(...vals), hi: Math.max(...vals) };
});
const STAT_LABELS = { hp: 'HP', speed: 'SPEED', crit: 'LUCK', regen: 'REGEN' };

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
  slime:    { sprite: 'slime',    name: 'TRAINING OOZE', hp: 8,   speed: 60,  dmg: 8,  r: 10, xp: 1, move: 'hop', pop: '#49DB49' },
  skeleton: { sprite: 'skeleton', name: 'BONE WALKER',   hp: 26,  speed: 68,  dmg: 12, r: 11, xp: 2, move: 'zigzag', pop: '#DBDBDB' },
  goblin:   { sprite: 'goblin',   name: 'GREMLIN',       hp: 18,  speed: 92,  dmg: 10, r: 10, xp: 2, move: 'straight', pop: '#92B649' },
  blueslime:{ sprite: 'slimeB',   name: 'FROST OOZE',    hp: 45,  speed: 66,  dmg: 14, r: 11, xp: 3, move: 'hop', pop: '#49B6FF' },
  brute:    { sprite: 'orcA',     name: 'PIT BRUTE',     hp: 110, speed: 52,  dmg: 20, r: 13, xp: 5, move: 'charge', pop: '#92DB6D' },
  redslime: { sprite: 'slimeR',   name: 'MAGMA OOZE',    hp: 75,  speed: 62,  dmg: 18, r: 11, xp: 4, move: 'hop', pop: '#FF4949' },
  raider:   { sprite: 'goblinB',  name: 'NIGHT RAIDER',  hp: 70,  speed: 108, dmg: 16, r: 10, xp: 5, move: 'orbit', pop: '#B692FF' },
  orc:      { sprite: 'orc',      name: 'WAR CHIEF',     hp: 180, speed: 50,  dmg: 26, r: 13, xp: 7, move: 'charge', pop: '#92DB6D' },
  voltslime:{ sprite: 'slimeY',   name: 'VOLT OOZE',     hp: 60,  speed: 95,  dmg: 18, r: 11, xp: 6, move: 'hop', pop: '#FFFF49' },
};
// Bosses scale by whole dots only (2x, 2x, 3x) so their pixels stay square;
// collision radii grow to match the bigger bodies.
const BOSSES = [
  { at: 300, name: 'MINOTAUR PROTOCOL MK-I', hp: 900, speed: 50, dmg: 25, r: 40,
    xp: 50, scale: 4, variant: null },
  { at: 600, name: 'MINOTAUR PROTOCOL MK-II', hp: 2600, speed: 55, dmg: 32, r: 44,
    xp: 90, scale: 4, variant: 'boss2' },
  { at: 840, name: 'OMEGA MINOTAUR', hp: 6500, speed: 60, dmg: 42, r: 60,
    xp: 150, scale: 6, variant: 'boss3' },
];

function hpScale() {
  const m = state.time / 60;
  return 1 + m * 0.5 + m * m * 0.045; // steeper than linear — late waves must threaten
}
function dmgScale() { return 1 + (state.time / 60) * 0.06; }
function spdScale() { return 1 + (state.time / 60) * 0.02; }

function spawnRadius() { return Math.max(VW, VH) / 2 + 80; }

function makeEnemy(kind, x, y, opts = {}) {
  const t = ENEMY_TYPES[kind];
  const hpMul = (opts.hpMul ?? 1) * rand(0.85, 1.25);
  const hp = t.hp * hpScale() * hpMul;
  return {
    x, y, hp, maxHp: hp,
    speed: t.speed * spdScale() * rand(0.9, 1.1) * (opts.spdMul ?? 1),
    dmg: t.dmg * dmgScale(), r: Math.round(t.r * (opts.rMul ?? 1)), xp: Math.ceil(t.xp * (opts.xpMul ?? 1)),
    sprite: t.sprite, scale: (opts.scale ?? SCALE), variant: opts.variant ?? null,
    move: t.move, boss: false, elite: !!opts.elite, sweep: opts.sweep ?? null,
    flash: -1, animT: rand(0, 10), chargeT: rand(0, 4), pop: t.pop,
    orbitSign: Math.random() < 0.5 ? 1 : -1,
  };
}

const seenTypes = new Set();
function announceType(kind) {
  if (seenTypes.has(kind)) return;
  seenTypes.add(kind);
  if (kind === 'slime') return; // opening fodder needs no fanfare
  announce(`NEW THREAT: ${ENEMY_TYPES[kind].name}`, C.orange, 2.0, 2);
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
    { hpMul: 12, xpMul: 6, scale: SCALE * 2, rMul: 1.8, spdMul: 0.85, elite: true, variant: 'elite' });
  enemies.push(e);
  announce(`ELITE ${ENEMY_TYPES[kind].name}!`, C.gold, 2.0, 3);
}

// ring event: a circle of weak fodder closes in — carve your way out
function spawnRing() {
  const wave = currentWave();
  const kind = wave.types[0];
  const n = 42, d = Math.min(VW, VH) / 2 + 60;
  for (let i = 0; i < n; i++) {
    const a = (TAU * i) / n;
    enemies.push(makeEnemy(kind, player.x + Math.cos(a) * d, player.y + Math.sin(a) * d,
      { hpMul: 0.5, spdMul: 1.35, xpMul: 1 }));
  }
  announce('SURROUNDED!', C.orange, 1.6, 3);
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
  announce('HORDE INCOMING!', C.cyan, 1.6, 3);
  sfx(180, 0.5, 'sawtooth', 0.07, 120);
}

function spawnBoss(def) {
  const a = rand(0, TAU);
  const d = Math.max(VW, VH) / 2 + 100;
  enemies.push({
    x: player.x + Math.cos(a) * d, y: player.y + Math.sin(a) * d,
    hp: def.hp, maxHp: def.hp, speed: def.speed, dmg: def.dmg, r: def.r,
    xp: def.xp, sprite: 'minotaur', scale: def.scale, variant: def.variant,
    boss: true, name: def.name, flash: -1, animT: rand(0, 10), pop: '#FF9200',
  });
  announce('WARNING!', C.red, 2.6, 5, def.name, true);
  sndBoss();
  state.shake = 12;
}

let lastHitSnd = 0;
function damageEnemy(e, dmg) {
  const crit = Math.random() < player.critChance;
  if (crit) dmg *= 2.2;
  e.hp -= dmg;
  // white hit-flash, rate-limited: a target under constant fire still shows its sprite
  if (e.flash < -0.08) e.flash = 0.06;
  // cap floating numbers so mass hits stay readable — crits always get theirs
  if (crit ? texts.length < 60 : texts.length < 16) popNum(e.x + rand(-8, 8), e.y - e.r - 20, Math.round(dmg), crit);
  const now = performance.now();
  if (now - lastHitSnd > 40) {
    lastHitSnd = now;
    if (crit) sndCrit(); else sndHit();
  }
  if (e.hp <= 0) {
    if (crit) state.hitstop = Math.max(state.hitstop, 0.035); // crit kills snap
    killEnemy(e);
  }
}

function trackStreak() {
  const now = state.time;
  state.killTimes.push(now);
  while (state.killTimes.length && state.killTimes[0] < now - 3) state.killTimes.shift();
  const n = state.killTimes.length;
  const tier = n >= 90 ? 3 : n >= 45 ? 2 : n >= 20 ? 1 : 0;
  if (tier > state.streakTier) {
    const label = ['', 'RAMPAGE!', 'MASSACRE!!', 'ANNIHILATION!!!'][tier];
    announce(`${label} X${n}`, TIER_COLS[tier], 1.4, 1);
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
  corpses.push({ sprite: e.sprite, scale: e.scale, variant: e.variant,
    x: e.x, groundY: groundYOf(e), flip: player.x < e.x, animT: 0 });
  burstParticles(e.x, e.y - e.r * 0.5, e.pop || '#B66D24', e.boss ? 26 : e.elite ? 16 : 8);
  if (e.boss || e.elite) {
    state.hitstop = Math.max(state.hitstop, 0.12); // big kill, big freeze-frame
    for (let g = 0; g < 8; g++) {
      const a = rand(0, TAU), d = rand(10, 60);
      gems.push({ x: e.x + Math.cos(a) * d, y: e.y + Math.sin(a) * d, v: Math.ceil(e.xp / 8) });
    }
    pickups.push({ x: e.x, y: e.y, type: 'chest' }); // jackpot time
    state.shake = 8;
  } else {
    gems.push({ x: e.x, y: e.y, v: e.xp });
    if (Math.random() < 0.04) pickups.push({ x: e.x + rand(-8, 8), y: e.y + rand(-8, 8), type: 'gold', v: randInt(5, 15) });
    if (gems.length > 450) {
      const old = gems.shift();
      gems[Math.floor(Math.random() * gems.length)].v += old.v;
    }
  }
}

function groundYOf(e) { return e.y + e.r * 0.9; }

// ---------- player damage / xp ----------
function hurtPlayer(dmg) {
  if (player.hurtCd > 0) return;
  const taken = Math.max(1, dmg - player.armor);
  player.hp -= taken;
  player.hurtCd = 0.5;
  state.shake = Math.max(state.shake, 5);
  popNum(player.x, player.y - 40, '-' + Math.round(taken), false, C.red);
  sndHurt();
  if (player.hp <= 0) endGame(false);
}

function gainXp(v) {
  state.xp += v;
  while (state.xp >= state.xpNeed) {
    state.xp -= state.xpNeed;
    state.level++;
    // fast first levels (VS hands you level 2 in seconds), steeper later
    state.xpNeed = Math.floor(5 + state.level * 6 + state.level * state.level * 0.55);
    sndLevel();
    state.flash = Math.max(state.flash, 0.35);
    pushMenu({ type: 'levelup' });   // one choice per level, even on multi-level jumps
  }
}

// ---------- floating world text & banners ----------
function popNum(x, y, v, crit, color) {
  texts.push({ kind: 'num', x, y, str: String(v), crit, color: color || (crit ? C.orange : C.white),
    life: crit ? 0.7 : 0.5, maxLife: crit ? 0.7 : 0.5, vy: crit ? -60 : -45 });
}
function popText(x, y, str, color) {
  texts.push({ kind: 'txt', x, y, str, color, life: 0.8, maxLife: 0.8, vy: -40 });
}
// One banner slot, priority-queued — big moments never pile on top of each other.
const banners = [];
function announce(text, color = C.yellow, dur = 1.6, prio = 1, sub = null, siren = false) {
  text = norm(text);
  if (banners.some(b => b.text === text)) return;
  const b = { text, color, dur, prio, sub: sub && norm(sub), siren, t: 0 };
  if (banners.length && prio > banners[0].prio) banners.unshift(b);
  else if (banners.length < 4) banners.push(b);
  else if (prio >= banners[banners.length - 1].prio) banners[banners.length - 1] = b;
}

// ---------- in-game windows: level-up / chest / pause (front of queue is active) ----------
const menus = [];
let menuLock = 0;        // brief input lockout so a held key can't pick for you
function pushMenu(m) {
  menus.push(m);
  if (menus.length === 1) openMenu(m);
}
function openMenu(m) {
  menuLock = 0.25;
  touch.active = false; touch.dx = touch.dy = 0; touch.id = null;
  m.sel = 0;
  if (m.type === 'levelup') m.choices = upgradeChoices();
  else if (m.type === 'chest') rollChest(m);
}
function closeMenu() {
  menus.shift();
  if (menus.length) openMenu(menus[0]);
}
function openPause() {
  if (scene === 'play' && !menus.length) { pushMenu({ type: 'pause' }); sndMove(); }
}

function upgradeChoices() {
  const opts = [];
  for (const w of player.weapons) {
    if (w.level < MAX_LEVEL) opts.push({ kind: 'weapon', id: w.id, rank: w.level, isNew: false });
  }
  if (player.weapons.length < MAX_WEAPONS) {
    for (const id of Object.keys(WEAPON_DEFS)) {
      if (!player.weapons.find(w => w.id === id)) opts.push({ kind: 'weapon', id, rank: 0, isNew: true });
    }
  }
  for (const id of Object.keys(PASSIVE_DEFS)) {
    const rank = player.passives[id] || 0;
    const isNew = rank === 0;
    if (isNew && Object.keys(player.passives).length >= MAX_PASSIVES) continue;
    if (rank >= MAX_LEVEL) continue;
    opts.push({ kind: 'passive', id, rank, isNew });
  }
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  const picked = opts.slice(0, 3);
  if (!picked.length) picked.push({ kind: 'heal', id: 'heal', rank: 0, isNew: false });
  return picked;
}
const optDef = o => (o.kind === 'weapon' ? WEAPON_DEFS[o.id] : o.kind === 'passive' ? PASSIVE_DEFS[o.id] : HEAL_DEF);
function applyChoice(o) {
  if (o.kind === 'weapon') addWeapon(o.id);
  else if (o.kind === 'passive') addPassive(o.id);
  else player.hp = Math.min(player.maxHp, player.hp + 50);
}

// chest jackpot (the slot-machine moment): rewards are rolled when it opens
function chestUpgrade() {
  const opts = [];
  for (const w of player.weapons) if (w.level < MAX_LEVEL) opts.push({ kind: 'weapon', id: w.id });
  for (const [id, rank] of Object.entries(player.passives)) if (rank < MAX_LEVEL) opts.push({ kind: 'passive', id });
  return opts.length ? pick(opts) : null;
}
function rollChest(m) {
  sndChest();
  state.flash = 0.3;
  const roll = Math.random();
  const n = roll < 0.6 ? 1 : roll < 0.92 ? 3 : 5; // jackpot odds, VS-style
  m.goldBonus = randInt(20, 60) * n;
  state.gold += m.goldBonus;
  m.rewards = [];
  for (let i = 0; i < n; i++) {
    const up = chestUpgrade();
    if (up) {
      if (up.kind === 'weapon') addWeapon(up.id); else addPassive(up.id);
      const def = up.kind === 'weapon' ? WEAPON_DEFS[up.id] : PASSIVE_DEFS[up.id];
      const rank = up.kind === 'weapon' ? player.weapons.find(w => w.id === up.id).level : player.passives[up.id];
      m.rewards.push({ icon: up.id, name: def.name, rank });
    } else {
      const extra = randInt(30, 80);
      state.gold += extra;
      m.rewards.push({ icon: 'gold', name: `+${extra} gold`, rank: 0 });
    }
  }
  m.t = 0;
  m.shown = 0;
}
const chestDone = m => m.shown >= m.rewards.length;

function menuTick(dt) {
  menuLock = Math.max(0, menuLock - dt);
  const m = menus[0];
  if (scene !== 'play' || !m || m.type !== 'chest') return;
  m.t += dt;
  const target = Math.min(m.rewards.length, Math.max(0, Math.floor((m.t - 0.35) / 0.45) + 1));
  if (target > m.shown) { m.shown = target; sfx(600 + target * 140, 0.15, 'square', 0.07); }
}
function menuKey(k) {
  const m = menus[0];
  if (m.type === 'pause' && (k === 'p' || k === 'escape')) { closeMenu(); sndMove(); return; }
  const up = k === 'arrowup' || k === 'w', down = k === 'arrowdown' || k === 's';
  if (up || down) {
    const n = m.type === 'levelup' ? m.choices.length : m.type === 'pause' ? 3 : 0;
    if (n) { m.sel = (m.sel + (up ? -1 : 1) + n) % n; sndMove(); }
    return;
  }
  if (OK_KEYS.has(k)) menuConfirm(m);
}
function menuConfirm(m) {
  if (menuLock > 0) return;
  if (m.type === 'levelup') { applyChoice(m.choices[m.sel]); sndOk(); closeMenu(); }
  else if (m.type === 'chest') {
    if (!chestDone(m)) m.t = 99;          // skip the reveal
    else { sndOk(); closeMenu(); }
  } else if (m.type === 'pause') {
    if (m.sel === 0) { sndOk(); closeMenu(); }
    else if (m.sel === 1) { setMuted(!muted); sndOk(); }
    else location.reload();
  }
}

// ---------- scenes: title / select / results ----------
let selIndex = 0;
let tally = null;
let bootError = '';
function toSelect() {
  scene = 'select';
  startMusic();
  sndOk();
}
function startGame(h) {
  player.name = h.name;
  player.color = h.color;
  player.sprite = h.sprite;
  player.drawScale = h.drawScale || SCALE;
  player.speed = 160; // rebase before hero mods
  addWeapon(h.weapon);
  h.mods();
  scene = 'play';
  state.running = true;
  startMusic();
  sndOk();
  announce('READY... GO!', C.yellow, 1.6, 1);
}
function endGame(won) {
  if (scene === 'over') return;
  scene = 'over';
  state.won = won;
  menus.length = 0;
  banners.length = 0;
  stopMusic();
  if (won) sndClear(); else sndGameOver();
  tally = {
    t: 0, tickT: 0, done: false,
    lines: [
      { label: 'TIME', target: Math.floor(state.time), fmt: fmtTime },
      { label: 'KILLS', target: state.kills },
      { label: 'LEVEL', target: state.level },
      { label: 'GOLD', target: state.gold },
    ],
  };
}
function updateTally(dt) {
  tally.t += dt;
  const end = 0.3 + tally.lines.length * 0.8;
  if (tally.t > 0.3 && tally.t < end) {
    tally.tickT -= dt;
    if (tally.tickT <= 0) { tally.tickT = 0.05; sndTick(); }
  }
  if (tally.t >= end && !tally.done) { tally.done = true; sndOk(); }
}
function tallyValue(i) {
  const f = clamp((tally.t - 0.3 - i * 0.8) / 0.7, 0, 1);
  return Math.floor(tally.lines[i].target * f);
}

// ---------- input ----------
const keys = {};
const OK_KEYS = new Set(['enter', ' ', 'z', 'j']);
const GAME_KEYS = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'enter']);
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (GAME_KEYS.has(k) && !e.ctrlKey && !e.metaKey && !e.altKey) e.preventDefault();
  if (e.repeat) return;               // menus react to fresh presses only
  if (k === 'm') { setMuted(!muted); return; }
  uiKey(k);
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

function uiKey(k) {
  if (scene === 'title') { toSelect(); return; }
  if (scene === 'select') {
    const n = HEROES.length;
    if (k === 'arrowleft' || k === 'a') { selIndex = (selIndex + n - 1) % n; sndMove(); }
    else if (k === 'arrowright' || k === 'd') { selIndex = (selIndex + 1) % n; sndMove(); }
    else if (k === 'arrowup' || k === 'w') { selIndex = (selIndex + n - 3) % n; sndMove(); }
    else if (k === 'arrowdown' || k === 's') { selIndex = (selIndex + 3) % n; sndMove(); }
    else if (OK_KEYS.has(k)) startGame(HEROES[selIndex]);
    return;
  }
  if (scene === 'play') {
    if (menus.length) menuKey(k);
    else if (k === 'p' || k === 'escape') openPause();
    return;
  }
  if (scene === 'over' && OK_KEYS.has(k)) {
    if (!tally.done) tally.t = 99;
    else location.reload();
  }
}

// Pointer: menus are hit-tested against regions registered during the last
// render; in play, touch/pen drags drive a virtual joystick.
let hits = [];
const addHit = (x, y, w, h, id) => hits.push({ x, y, w, h, id });
function toBuf(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
}
function hitAt(p) {
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i];
    if (p.x >= h.x && p.x < h.x + h.w && p.y >= h.y && p.y < h.y + h.h) return h.id;
  }
  return null;
}
function onHit(id, down) {
  const [kind, arg] = id.split(':');
  const i = Number(arg);
  if (kind === 'any' || kind === 'start') { if (down) uiKey('enter'); return; }
  if (kind === 'icon') {
    if (!down) return;
    if (arg === 'sound') setMuted(!muted); else openPause();
    return;
  }
  // first touch selects, touching the selected item confirms (mouse hover selects)
  if (kind === 'hero') {
    if (i === selIndex) { if (down) uiKey('enter'); }
    else { selIndex = i; sndMove(); }
    return;
  }
  if (kind === 'row') {
    const m = menus[0];
    if (!m) return;
    if (i === m.sel) { if (down) menuConfirm(m); }
    else { m.sel = i; sndMove(); }
  }
}
const touch = { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0 };
canvas.addEventListener('pointerdown', e => {
  e.preventDefault();
  canvas.focus();
  const p = toBuf(e), id = hitAt(p);
  if (scene === 'play' && !menus.length) {
    if (id && id.startsWith('icon:')) { onHit(id, true); return; }
    if (e.pointerType !== 'mouse') {
      touch.active = true; touch.id = e.pointerId;
      touch.ox = p.x; touch.oy = p.y; touch.dx = 0; touch.dy = 0;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    }
    return;
  }
  if (id) onHit(id, true);
});
canvas.addEventListener('pointermove', e => {
  const p = toBuf(e);
  if (touch.active && e.pointerId === touch.id) { touch.dx = p.x - touch.ox; touch.dy = p.y - touch.oy; return; }
  if (e.pointerType === 'mouse') {
    const id = hitAt(p);
    if (id && (id.startsWith('hero:') || id.startsWith('row:'))) onHit(id, false);
  }
});
const endTouch = e => {
  if (e.pointerId === touch.id) { touch.active = false; touch.id = null; touch.dx = touch.dy = 0; }
};
canvas.addEventListener('pointerup', endTouch);
canvas.addEventListener('pointercancel', endTouch);

function moveInput() {
  let mx = 0, my = 0;
  if (keys['w'] || keys['arrowup']) my -= 1;
  if (keys['s'] || keys['arrowdown']) my += 1;
  if (keys['a'] || keys['arrowleft']) mx -= 1;
  if (keys['d'] || keys['arrowright']) mx += 1;
  if (touch.active) {
    const len = Math.hypot(touch.dx, touch.dy);
    if (len > 3) { mx = touch.dx / len; my = touch.dy / len; }
  }
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }
  return { mx, my };
}

// ---------- update ----------
function update(dt) {
  if (state.hitstop > 0) { state.hitstop -= dt; return; } // freeze-frame
  state.time += dt;
  if (state.time >= WIN_TIME) { endGame(true); return; }
  scanEnv();
  state.goldShown += (state.gold - state.goldShown) * Math.min(1, dt * 10);
  // low-HP heartbeat
  if (player.hp / player.maxHp < 0.3) {
    state.heartT -= dt;
    if (state.heartT <= 0) { state.heartT = 0.75; sfx(58, 0.13, 'sine', 0.1); }
  }

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
    e.flash = Math.max(-1, e.flash - dt);
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
    if (!e.boss && !e.sweep && d > Math.max(VW, VH) * 1.2) {
      const a = rand(0, TAU), sd = spawnRadius();
      e.x = player.x + Math.cos(a) * sd;
      e.y = player.y + Math.sin(a) * sd;
    }
    // solid obstacles push enemies out
    resolveObstacles(e);
  }
  resolveObstacles(player);

  // corpses play their death animation then flicker out
  for (let i = corpses.length - 1; i >= 0; i--) {
    corpses[i].animT += dt;
    if (corpses[i].animT > 1.15) corpses.splice(i, 1);
  }

  // kill burst debris: fly, fall, expire
  for (let i = particles.length - 1; i >= 0; i--) {
    const pt = particles[i];
    pt.vy += 500 * dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.life -= dt;
    if (pt.life <= 0) { particles[i] = particles[particles.length - 1]; particles.pop(); }
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
      // rapid pickups climb the scale — a gem field becomes an arpeggio
      if (state.time - state.lastGemT < 0.6) state.gemCombo = Math.min(state.gemCombo + 1, 24);
      else state.gemCombo = 0;
      state.lastGemT = state.time;
      sfx(520 * Math.pow(2, state.gemCombo / 12), 0.07, 'sine', 0.05, 150);
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
      popText(player.x, player.y - 44, '+40 HP', C.green);
      sfx(500, 0.15, 'sine', 0.06, 200);
    } else if (p.type === 'gold') {
      state.gold += p.v;
      popText(player.x, player.y - 44, `+${p.v} GOLD`, C.yellow);
      sndCoin();
    } else if (p.type === 'vac') {
      for (const g of gems) g.vacuum = true;
      announce('PSYCHIC VACUUM!', C.cyan, 1.2, 4);
      sfx(300, 0.5, 'sine', 0.08, 700);
      state.flash = Math.max(state.flash, 0.25);
    } else if (p.type === 'nuke') {
      // hard-light purge: everything non-boss on the field dies
      state.flash = 0.6;
      state.shake = 14;
      sndNuke();
      announce('SYSTEM PURGE!', C.white, 1.4, 4);
      for (const e of [...enemies]) if (!e.boss) killEnemy(e);
    } else if (p.type === 'chest') {
      pushMenu({ type: 'chest' });
    }
  }

  // effects, floating text, banner
  for (let i = effects.length - 1; i >= 0; i--) {
    effects[i].life -= dt;
    if (effects[i].life <= 0) effects.splice(i, 1);
  }
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i];
    t.life -= dt; t.y += t.vy * dt;
    if (t.life <= 0) texts.splice(i, 1);
  }
  if (banners.length) {
    banners[0].t += dt;
    if (banners[0].t >= banners[0].dur) banners.shift();
  }
  state.shake = Math.max(0, state.shake - dt * 30);
  state.flash = Math.max(0, state.flash - dt * 1.5);
}

// ---------- render: world ----------
function renderWorld() {
  let shx = 0, shy = 0;
  if (state.shake > 0.5 && !REDUCED) {
    shx = Math.round(rand(-state.shake, state.shake) / 3);
    shy = Math.round(rand(-state.shake, state.shake) / 3);
  }
  camX = Math.round(player.x / PX) - (W >> 1) + shx;
  camY = Math.round(player.y / PX) - (H >> 1) + shy;

  drawFloor();
  ctx.globalCompositeOperation = 'lighter';
  for (const bz of state.brazList || []) drawBrazierLight(bz);
  ctx.globalCompositeOperation = 'source-over';

  // gems, with an occasional twinkle
  const tw = Math.floor(uiTime * 8);
  for (const g of gems) {
    const x = toDX(g.x), y = toDY(g.y);
    if (x < -8 || x > W + 8 || y < -8 || y > H + 8) continue;
    const s = gemSprite(g.v);
    ctx.drawImage(s, x - (s.width >> 1), y - (s.height >> 1));
    if ((tw + (g.x | 0)) % 29 === 0) rect(x - 1, y - (s.height >> 1) - 1, 1, 1, C.white);
  }

  // pickups
  for (const p of pickups) {
    const x = toDX(p.x), y = toDY(p.y);
    if (x < -16 || x > W + 16 || y < -16 || y > H + 16) continue;
    const bob = Math.round(Math.sin(uiTime * 4 + p.x) * 1.5);
    if (p.type === 'med') ctx.drawImage(ICONS.heal, x - 5, y - 5 + bob);
    else if (p.type === 'gold') {
      const f = (((Math.floor(uiTime * 10) + (p.x | 0)) % 4) + 4) % 4;   // face, half, edge, half (mirrored)
      if (f === 3) {
        ctx.save(); ctx.translate(x + 4, y - 4 + bob); ctx.scale(-1, 1);
        ctx.drawImage(COIN[1], 0, 0); ctx.restore();
      } else ctx.drawImage(COIN[f], x - 4, y - 4 + bob);
    } else if (p.type === 'vac') {
      ring(x, y + bob, blink(4) ? 8 : 9, C.cyan);
      ctx.drawImage(ICONS.magnet, x - 5, y - 5 + bob);
    } else if (p.type === 'nuke') {
      ring(x, y + bob, blink(6) ? 8 : 10, blink(3) ? C.white : C.red);
      ctx.drawImage(BOMB[blink(6) ? 0 : 1], x - 4, y - 5 + bob);
    } else if (p.type === 'chest') {
      ring(x, y, blink(3) ? 11 : 12, C.yellow);
      ctx.drawImage(CHEST, x - 7, y - 6);
      if (blink(5)) rect(x + 3, y - 7, 1, 1, C.white);
    }
  }

  // corpses (death animations), flickering out like old hardware sprites
  for (const c of corpses) {
    if (c.animT > 0.85 && blink(15)) continue;
    drawSprite(c.sprite, 'death', Math.min(9, Math.floor(c.animT * 12)), c.x, c.groundY, c.flip, c.scale, c.variant);
  }

  // shadows first, so no shadow ever lands on a sprite
  for (const e of enemies) drawShadowAt(e.x, groundYOf(e), e.r * 0.9);
  drawShadowAt(player.x, player.y + 20, 13);

  // living entities + solid props, y-sorted (painter's algorithm)
  const drawables = [];
  for (const o of state.obsList || []) drawables.push({ y: o.y + TILE / 2, draw() { drawObstacle(o); } });
  for (const bz of state.brazList || []) drawables.push({ y: bz.y + 8, draw() { drawBrazier(bz); } });
  for (const e of enemies) {
    drawables.push({ y: groundYOf(e), draw() {
      const near = dist2(e.x, e.y, player.x, player.y) < (e.r + player.r + 26) ** 2;
      const anim = near ? 'attack' : 'walk';
      drawSprite(e.sprite, anim, animFrame(e.animT, anim), e.x, groundYOf(e), player.x < e.x,
        e.scale, e.flash > 0 ? 'white' : e.variant);
    } });
  }
  const hurtBlink = player.hurtCd > 0 && Math.floor(uiTime * 20) % 2 === 0;
  drawables.push({ y: player.y + 20, draw() {
    if (hurtBlink) return;
    const anim = player.attackAge < 0.45 ? 'attack' : (player.moving ? 'walk' : 'idle');
    const frame = anim === 'attack' ? Math.min(9, Math.floor(player.attackAge / 0.45 * 10))
      : animFrame(player.animT, anim);
    drawSprite(player.sprite, anim, frame, player.x, player.y + 20, player.face < 0, player.drawScale);
  } });
  drawables.sort((a, b) => a.y - b.y);
  for (const d of drawables) d.draw();

  // kill burst debris
  for (const pt of particles) {
    if (pt.life < 0.12 && blink(20)) continue;
    const s = Math.max(1, Math.round(pt.size * (0.5 + (pt.life / pt.maxLife) * 0.7) / PX));
    rect(toDX(pt.x), toDY(pt.y), s, s, pt.color);
  }

  // projectiles
  for (const b of bullets) {
    const x = toDX(b.x), y = toDY(b.y);
    if (x < -8 || x > W + 8 || y < -8 || y > H + 8) continue;
    if (b.kind === 'card') {
      const f = [0, 1, 2, 1][Math.floor(b.life * 16) % 4];
      ctx.drawImage(CARD[f], x - 2, y - 3);
    } else {
      const sp = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / sp, uy = b.vy / sp;
      line(x - ux * 6, y - uy * 6, x, y, C.red, 2);
      rect(x, y, 2, 2, C.white);
    }
  }
  for (const wp of player.weapons) {
    if (!wp.orbPos) continue;
    for (const o of wp.orbPos) ctx.drawImage(ORB, toDX(o.x) - 3, toDY(o.y) - 3);
  }

  // power effects, drawn as stepped pixel art
  for (const fx of effects) {
    const p = fx.life / fx.maxLife;
    const cx = toDX(fx.x), cy = toDY(fx.y);
    if (fx.type === 'slash') {
      const r = fx.range / PX, a0 = fx.a - fx.arc / 2, a1 = fx.a + fx.arc / 2;
      const cols = p > 0.66 ? [C.white, '#FFFFB6', '#FFDB49'] : p > 0.33 ? ['#FFFFB6', '#FFDB00'] : ['#FFB600'];
      cols.forEach((c, k) => arcDots(cx, cy, r - k * 3, a0, a1, c, 2));
    } else if (fx.type === 'bolt') {
      if (!fx.path) {
        fx.path = [];
        for (let s = 0; s <= 6; s++) fx.path.push([s === 6 ? 0 : Math.round(rand(-9, 9)), -130 + s * (130 / 6)]);
      }
      const core = p > 0.5 ? C.white : C.cyan, edge = p > 0.5 ? C.cyan : C.blue;
      for (let s = 0; s < 6; s++) {
        const [ax, ay] = fx.path[s], [bx, by] = fx.path[s + 1];
        line(cx + ax - 1, cy + ay, cx + bx - 1, cy + by, edge);
        line(cx + ax + 1, cy + ay, cx + bx + 1, cy + by, edge);
        line(cx + ax, cy + ay, cx + bx, cy + by, core);
      }
      disc(cx, cy, 3 + Math.round(4 * p), edge);
      disc(cx, cy, 1 + Math.round(2 * p), core);
    } else if (fx.type === 'nova') {
      const rr = (fx.radius / PX) * (1 - p);
      const col = p > 0.6 ? C.white : p > 0.3 ? '#DB92FF' : '#9249DB';
      ring(cx, cy, rr, col); ring(cx, cy, rr + 1, col);
      ring(cx, cy, rr * 0.75, '#6D24B6');
    } else if (fx.type === 'boom') {
      const R = (fx.radius / PX) * (1 - p * 0.5);
      if (p < 0.3) { ring(cx, cy, R, C.orange); ring(cx, cy, R - 1, '#DB2400'); }
      else {
        disc(cx, cy, R, '#DB2400');
        disc(cx, cy, R * 0.7, C.orange);
        disc(cx, cy, R * 0.4, '#FFFF49');
        if (p > 0.6) disc(cx, cy, R * 0.15, C.white);
      }
    }
  }

  // floating numbers & text
  for (const t of texts) {
    if (t.life < 0.15 && blink(20)) continue;
    const x = toDX(t.x), y = toDY(t.y);
    if (t.kind === 'num') drawNum(t.str, x, y, t.color, t.crit ? 2 : 1);
    else drawText(t.str, x, y, t.color, { align: 'center' });
  }
}

// ---------- render: HUD ----------
function renderHUD() {
  // experience bar across the top edge
  rect(0, 0, W, 4, C.black);
  const xw = Math.round(W * clamp(state.xp / state.xpNeed, 0, 1));
  rect(0, 0, xw, 3, '#2492FF');
  rect(0, 0, xw, 1, '#B6DBFF');

  // name, level, life bar (Streets of Rage) + TIME/KILLS/GOLD stack (Sonic)
  const x = 6;
  const nw = drawText(player.name, x, 8, C.white);
  drawText('LV' + state.level, x + nw + 6, 8, C.yellow);
  const frac = clamp(player.hp / player.maxHp, 0, 1), bw = 64, by = 18;
  rect(x, by, bw + 2, 7, C.black);
  rect(x + 1, by + 1, bw, 5, C.pipOff);
  const low = frac < 0.3;
  if (!(low && blink(4))) {
    const fw = Math.round(bw * frac);
    rect(x + 1, by + 1, fw, 5, frac > 0.5 ? C.yellow : low ? C.red : C.orange);
    rect(x + 1, by + 1, fw, 1, '#FFFFB6');
  }
  for (let i = 8; i < bw; i += 8) rect(x + 1 + i, by + 1, 1, 5, C.black);
  drawNum(Math.max(0, Math.ceil(player.hp)), x + bw + 6, by + 1, low ? C.red : C.white, 1, 'left');
  [['TIME', fmtTime(state.time)], ['KILLS', state.kills], ['GOLD', Math.round(state.goldShown)]]
    .forEach(([label, val], i) => {
      drawText(label, x, 30 + i * 10, C.yellow);
      drawText(String(val), x + 36, 30 + i * 10, C.white);
    });

  renderCornerIcons(true);

  // live combo counter during a frenzy
  const comboN = state.killTimes.length;
  if (comboN >= 10) {
    const col = TIER_COLS[state.streakTier];
    drawText('COMBO', W - 6, 22, col, { align: 'right' });
    drawText(String(comboN), W - 6, 31, col, { align: 'right', scale: 2, outline: C.black });
  }

  // boss life bar: top centre on wide screens, above the loadout on narrow ones
  const boss = enemies.find(e => e.boss);
  if (boss) {
    const narrow = W < 360;
    const bbw = narrow ? W - 24 : clamp(W - 220, 90, 200), bx = Math.round((W - bbw) / 2);
    const bty = narrow ? H - 42 : 8;
    drawText(boss.name, W / 2, bty, blink(2) ? C.white : C.lgrey, { align: 'center' });
    rect(bx - 1, bty + 9, bbw + 2, 6, C.black);
    rect(bx, bty + 10, bbw, 4, '#490000');
    const hw = Math.round(bbw * clamp(boss.hp / boss.maxHp, 0, 1));
    rect(bx, bty + 10, hw, 4, C.red);
    rect(bx, bty + 10, hw, 1, '#FF9292');
  }

  // loadout: power icons, then trait icons, rank pips beneath
  let lx = 6;
  const ly = H - 18;
  const slot = (key, rank) => {
    rect(lx - 1, ly - 1, 12, 16, 'rgba(0,0,0,0.5)');
    ctx.drawImage(ICONS[key], lx, ly);
    pips(lx, ly + 12, rank);
    lx += 13;
  };
  for (const w of player.weapons) slot(w.id, w.level);
  if (Object.keys(player.passives).length) lx += 4;
  for (const [id, rank] of Object.entries(player.passives)) slot(id, rank);
}
function renderCornerIcons(withPause) {
  const y = 6;
  const box = (bx, img, id) => {
    drawWindow(bx, y, 13, 11, { bands: ['#000049'], border: C.grey });
    ctx.drawImage(img, bx + 2, y + 2);
    addHit(bx - 3, y - 3, 19, 17, id);
  };
  box(W - 17, muted ? SPK_OFF : SPK_ON, 'icon:sound');
  if (withPause) box(W - 32, PAUSE_IC, 'icon:pause');
}
function renderBanner() {
  const b = banners[0];
  if (!b) return;
  if (b.dur - b.t < 0.3 && blink(12)) return;
  const sc = textW(b.text, 2) <= W - 16 ? 2 : 1;
  const x0 = Math.round((W - textW(b.text, sc)) / 2), y = Math.round(H * 0.3);
  const shown = b.text.slice(0, Math.min(b.text.length, Math.floor(b.t * 50) + 1)); // quick type-in
  const col = b.siren && blink(6) ? C.white : b.color;
  drawText(shown, x0, y, col, { scale: sc, outline: C.black });
  if (b.sub) drawText(b.sub, W / 2, y + 7 * sc + 5, C.white, { align: 'center' });
}
function renderJoystick() {
  if (!touch.active) return;
  ring(touch.ox, touch.oy, 14, 'rgba(255,255,255,0.6)');
  const len = Math.hypot(touch.dx, touch.dy) || 1, k = Math.min(len, 14) / len;
  disc(touch.ox + touch.dx * k, touch.oy + touch.dy * k, 5, 'rgba(255,255,255,0.5)');
}

// ---------- render: in-game windows ----------
function menuWidth(max) { return Math.min(W - 16, max); }
function windowTitle(text, x, y, ww, grad) {
  const sc = textW(norm(text), 2) <= ww - 12 ? 2 : 1;
  drawText(text, x + ww / 2, y, C.white, { scale: sc, align: 'center', outline: C.black, grad });
  return 7 * sc;
}
function renderLevelUp(m) {
  dim();
  const ww = menuWidth(280), x = Math.round((W - ww) / 2), rowH = 18;
  const sel = m.choices[m.sel];
  const lines = wrapText(optDef(sel).desc, ww - 16);
  const headH = 7 * (textW('LEVEL UP!', 2) <= ww - 12 ? 2 : 1);
  const mainH = 8 + headH + 8 + m.choices.length * rowH + 4;
  const descH = 8 + lines.length * 9 + 4;
  const y = Math.max(6, Math.round((H - (mainH + 4 + descH)) / 2));
  drawWindow(x, y, ww, mainH);
  windowTitle('LEVEL UP!', x, y + 7, ww, GOLD_GRAD);
  let ry = y + 8 + headH + 8;
  m.choices.forEach((o, i) => {
    const on = i === m.sel, def = optDef(o);
    if (on) {
      rect(x + 3, ry, ww - 6, rowH - 2, C.selBar);
      if (blink(3)) drawCursor(x + 5, ry + 4);
    }
    ctx.drawImage(ICONS[o.kind === 'heal' ? 'heal' : o.id], x + 13, ry + 3);
    drawText(def.name, x + 28, ry + 5, on ? C.white : C.lgrey);
    if (o.kind === 'heal') drawText('+50 HP', x + ww - 8, ry + 5, C.green, { align: 'right' });
    else if (o.isNew) drawText('NEW!', x + ww - 8, ry + 5, blink(4) ? C.green : C.yellow, { align: 'right' });
    else pips(x + ww - 27, ry + 6, o.rank, o.rank + 1, 3);
    addHit(x + 3, ry, ww - 6, rowH - 2, 'row:' + i);
    ry += rowH;
  });
  const dy = y + mainH + 4;
  drawWindow(x, dy, ww, descH);
  lines.forEach((ln, i) => drawText(ln, x + 8, dy + 6 + i * 9, C.white));
}
function renderChest(m) {
  dim();
  const ww = menuWidth(260), x = Math.round((W - ww) / 2), rowH = 14;
  const headH = 14;
  const h = 8 + headH + 8 + m.rewards.length * rowH + 6 + 10 + 12;
  const y = Math.max(6, Math.round((H - h) / 2));
  drawWindow(x, y, ww, h);
  const jackpot = m.rewards.length === 5;
  windowTitle(jackpot ? 'JACKPOT!' : 'TREASURE!', x, y + 7, ww, blink(4) ? GOLD_GRAD : CYAN_GRAD);
  let ry = y + 8 + headH + 8;
  for (let i = 0; i < m.shown; i++) {
    const r = m.rewards[i];
    ctx.drawImage(ICONS[r.icon], x + 10, ry);
    drawText(r.name, x + 25, ry + 2, C.white);
    if (r.rank) pips(x + ww - 27, ry + 3, r.rank, r.rank, 3);
    ry += rowH;
  }
  ry = y + 8 + headH + 8 + m.rewards.length * rowH + 4;
  if (chestDone(m)) {
    drawText(`+${m.goldBonus} GOLD`, x + ww / 2, ry, C.yellow, { align: 'center' });
    if (blink(2)) drawText('PRESS START', x + ww / 2, ry + 12, C.white, { align: 'center' });
  }
  addHit(0, 0, W, H, 'any');
}
function renderPause(m) {
  dim();
  const ww = menuWidth(300), x = Math.round((W - ww) / 2);
  const two = ww >= 270;
  const ws = player.weapons, ps = Object.entries(player.passives);
  const rows = two ? Math.max(ws.length, ps.length, 1) : ws.length + ps.length + 1;
  const opts = ['RESUME', `SOUND: ${muted ? 'OFF' : 'ON'}`, 'QUIT TO TITLE'];
  const h = 8 + 14 + 8 + 10 + rows * 13 + 8 + opts.length * 14 + 4;
  const y = Math.max(6, Math.round((H - h) / 2));
  drawWindow(x, y, ww, h);
  windowTitle('PAUSE', x, y + 7, ww, CYAN_GRAD);
  const top = y + 30;
  const cw = two ? Math.floor((ww - 16) / 2) : ww - 16;
  const entry = (cx, cy, icon, name, rank) => {
    ctx.drawImage(ICONS[icon], cx, cy);
    const room = Math.floor((cw - 13 - 32) / 6);
    drawText(norm(name).slice(0, room), cx + 13, cy + 2, C.white);
    pips(cx + cw - 28, cy + 3, rank, rank, 3);   // 8-dot gutter before the next column
  };
  if (two) {
    drawText('POWERS', x + 8, top, C.cyan);
    drawText('TRAITS', x + 8 + cw, top, C.cyan);
    ws.forEach((w, i) => entry(x + 8, top + 10 + i * 13, w.id, WEAPON_DEFS[w.id].name, w.level));
    ps.forEach(([id, r], i) => entry(x + 8 + cw, top + 10 + i * 13, id, PASSIVE_DEFS[id].name, r));
  } else {
    drawText('LOADOUT', x + 8, top, C.cyan);
    const all = ws.map(w => [w.id, WEAPON_DEFS[w.id].name, w.level])
      .concat(ps.map(([id, r]) => [id, PASSIVE_DEFS[id].name, r]));
    all.forEach(([id, name, r], i) => entry(x + 8, top + 10 + i * 13, id, name, r));
  }
  let oy = top + 10 + rows * 13 + 6;
  opts.forEach((label, i) => {
    const on = i === m.sel;
    if (on) {
      rect(x + 3, oy - 3, ww - 6, 13, C.selBar);
      if (blink(3)) drawCursor(x + 8, oy - 0);
    }
    drawText(label, x + 20, oy, on ? C.white : C.lgrey);
    addHit(x + 3, oy - 3, ww - 6, 13, 'row:' + i);
    oy += 14;
  });
}

// ---------- render: title / select / results / boot ----------
const PARADE = ['ranger', 'warrior', 'wizard', 'rogue', 'cleric', 'biski', null, null,
  'slime', 'skeleton', 'goblin', 'slimeR', 'orcA'];
function drawParade(gy) {
  const spacing = 26, span = PARADE.length * spacing;
  const head = (uiTime * 32) % (W + span);
  PARADE.forEach((key, i) => {
    if (!key) return;
    const x = Math.round(head - i * spacing);
    if (x < -24 || x > W + 24) return;
    const def = SHEETS[key], img = SPR[def.file].base, s = def.size;
    const k = key === 'biski' ? 1.25 : 1, dw = Math.round(s * k);
    const sh = shadowSprite(6);
    ctx.drawImage(sh, x - (sh.width >> 1), gy - (sh.height >> 1));
    const frame = Math.floor(uiTime * 10 + i * 3) % 10;
    ctx.drawImage(img, frame * s, def.rows.walk * s, s, s, x - (dw >> 1), gy - dw + Math.round(3 * k), dw, dw);
  });
}
// a clipped window onto the arena floor (tiles at 1x or 2x), optionally dimmed
function arenaPatch(x, y, w, h, k, dark) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const ts = T * k;
  for (let iy = 0; iy * ts < h; iy++) {
    for (let ix = 0; ix * ts < w; ix++) {
      const [tx, ty] = FLOOR_TILES[hash2(ix + 40, iy + 40) % 7];   // plain tiles only
      ctx.drawImage(SPR.tiles.base, tx * T, ty * T, T, T, x + ix * ts, y + iy * ts, ts, ts);
    }
  }
  if (dark) rect(x, y, w, h, `rgba(0,0,0,${dark})`);
  ctx.restore();
}
function attractBackdrop(darkness) {
  camX = Math.floor(uiTime * 14);
  camY = Math.floor(uiTime * 6);
  drawFloor();
  rect(0, 0, W, H, `rgba(0,0,0,${darkness})`);
}
function renderTitle() {
  attractBackdrop(0.55);
  drawParade(H - 26);
  const l1 = 'MUTANT ACADEMY', l2 = 'SURVIVORS';
  const sc = [3, 2, 1].find(s => textW(l1, s) <= W - 16) || 1;
  const sc2 = [4, 3, 2, 1].find(s => s <= sc + 1 && textW(l2, s) <= W - 16) || 1;
  const y1 = Math.round(H * 0.15), y2 = y1 + 7 * sc + 7;
  // raster band behind the logo: scanline stripes between cyan edge lines
  const top = y1 - 10, bot = y2 + 7 * sc2 + 9;
  rect(0, top, W, bot - top, '#000049');
  for (let y = top + 2; y < bot; y += 4) rect(0, y, W, 1, '#00006D');
  rect(0, top - 2, W, 1, '#2449DB'); rect(0, top - 1, W, 1, C.cyan);
  rect(0, bot, W, 1, C.cyan); rect(0, bot + 1, W, 1, '#2449DB');
  drawText(l1, W / 2, y1, C.white, { scale: sc, align: 'center', outline: C.black, drop: '#6D0000', grad: GOLD_GRAD });
  drawText(l2, W / 2, y2, C.white, { scale: sc2, align: 'center', outline: C.black, drop: '#000024', grad: CYAN_GRAD });
  const ty = bot + 10;
  drawText('THE DANGER ROOM HAS GONE ROGUE.', W / 2, ty, C.lgrey, { align: 'center' });
  drawText('SURVIVE INFERNO PROTOCOL FOR 15:00', W / 2, ty + 10, C.lgrey, { align: 'center' });
  if (blink(2)) drawText('PRESS START', W / 2, Math.round(H * 0.66), C.yellow, { align: 'center' });
  drawText('ART: CALCIUMTRICE / BUCH / SHEPARDSKIN', W / 2, H - 10, C.grey, { align: 'center', shadow: false });
  addHit(0, 0, W, H, 'any');
}
function selectLayout() {
  const cell = 46, gap = 4, gw = cell * 3 + gap * 2, gh = cell * 2 + gap;
  const titleScale = textW('SELECT YOUR HERO', 2) <= W - 16 ? 2 : 1;
  const wide = W >= 340;
  const pw = wide ? W - (8 + gw + 8) - 8 : W - 16;
  // the panel fits the longest description, so it never jumps between heroes
  const descLines = Math.max(...HEROES.map(h => wrapText(h.desc, pw - 12).length));
  const ph = 117 + descLines * 9;
  const top = 8 + 7 * titleScale + 10, avail = H - top - 18;
  if (wide) {
    const y = top + Math.max(0, Math.floor((avail - Math.max(gh, ph)) / 2));
    return { cell, gap, titleScale, gx: 8, gy: y, px: 8 + gw + 8, py: y, pw, ph };
  }
  // tall portrait screens: sit under the title rather than floating mid-screen
  const y = top + Math.min(16, Math.max(0, Math.floor((avail - (gh + 8 + ph)) / 2)));
  return { cell, gap, titleScale, gx: Math.round((W - gw) / 2), gy: y, px: 8, py: y + gh + 8, pw, ph };
}
function renderSelect() {
  attractBackdrop(0.6);
  const L = selectLayout();
  drawText('SELECT YOUR HERO', W / 2, 8, C.white,
    { scale: L.titleScale, align: 'center', outline: C.black, grad: GOLD_GRAD });
  HEROES.forEach((h, i) => {
    const bx = L.gx + (i % 3) * (L.cell + L.gap), by = L.gy + Math.floor(i / 3) * (L.cell + L.gap);
    const on = i === selIndex;
    drawWindow(bx, by, L.cell, L.cell, { border: on ? (blink(4) ? C.yellow : C.white) : C.grey });
    arenaPatch(bx + 2, by + 2, L.cell - 4, L.cell - 4, 1, on ? 0 : 0.35);
    const def = SHEETS[h.sprite], s = def.size, anim = on ? 'walk' : 'idle';
    const frame = Math.floor(uiTime * 10 + i * 2) % 10;
    ctx.drawImage(SPR[def.file].base, frame * s, def.rows[anim] * s, s, s, bx + 7, by + 9, s, s);
    addHit(bx, by, L.cell, L.cell, 'hero:' + i);
  });

  // detail panel for the highlighted hero
  const h = HEROES[selIndex], st = HERO_STATS[selIndex];
  drawWindow(L.px, L.py, L.pw, L.ph);
  const x0 = L.px + 6, y0 = L.py + 6;
  rect(x0, y0, 68, 68, C.black);
  arenaPatch(x0 + 1, y0 + 1, 66, 66, 2, 0);
  const def = SHEETS[h.sprite], s = def.size;
  const sh = shadowSprite(14);
  ctx.drawImage(sh, x0 + 34 - (sh.width >> 1), y0 + 60 - (sh.height >> 1));
  ctx.drawImage(SPR[def.file].base, (Math.floor(uiTime * 10) % 10) * s, def.rows.walk * s, s, s, x0 + 2, y0 + 2, 64, 64);
  const tx = x0 + 74, tw = L.pw - (tx - L.px) - 6;
  const nsc = textW(norm(h.name), 2) <= tw ? 2 : 1;
  drawText(h.name, tx, y0 + 2, C.white, { scale: nsc, outline: C.black, grad: GOLD_GRAD });
  drawText(h.tag, tx, y0 + 4 + 7 * nsc + 3, C.cyan);
  let sy = y0 + 4 + 7 * nsc + 15;
  for (const row of STAT_ROWS) {
    drawText(STAT_LABELS[row.k], tx, sy, C.yellow);
    const f = row.hi > row.lo ? (st[row.k] - row.lo) / (row.hi - row.lo) : 0.5;
    const segs = 3 + Math.round(f * 5);    // baseline stats read as average, not empty
    for (let i = 0; i < 8; i++) rect(tx + 36 + i * 4, sy + 1, 3, 5, i < segs ? h.color : C.pipOff);
    sy += 10;
  }
  const dy = Math.max(y0 + 74, sy + 2);
  drawText('POWER: ' + WEAPON_DEFS[h.weapon].name, x0, dy, C.green);
  wrapText(h.desc, L.pw - 12).forEach((ln, i) => drawText(ln, x0, dy + 11 + i * 9, C.white));
  const bw = 52, bh = 15, bxs = L.px + L.pw - bw - 6, bys = L.py + L.ph - bh - 6;
  drawWindow(bxs, bys, bw, bh, { bands: ['#B62400', '#920000'], border: blink(2) ? C.yellow : C.white });
  drawText('START', bxs + bw / 2, bys + 4, C.white, { align: 'center' });
  addHit(bxs, bys, bw, bh, 'start');
  drawText(W >= 340 ? 'ARROWS: CHOOSE   ENTER: START   M: SOUND' : 'TAP A HERO, THEN START',
    W / 2, H - 12, C.grey, { align: 'center' });
  renderCornerIcons(false);
}
function renderResults() {
  rect(0, 0, W, H, 'rgba(0,0,0,0.6)');
  const won = state.won, title = won ? 'STAGE CLEAR!' : 'GAME OVER';
  const sc = [3, 2, 1].find(s => textW(title, s) <= W - 16) || 1;
  const ty = Math.round(H * 0.14);
  drawText(title, W / 2, ty, C.white,
    { scale: sc, align: 'center', outline: C.black, drop: won ? '#6D0000' : '#240000', grad: won ? GOLD_GRAD : RED_GRAD });
  const ww = menuWidth(200), wx = Math.round((W - ww) / 2);
  const wh = 18 + tally.lines.length * 14 + 22, wy = ty + 7 * sc + 14;
  drawWindow(wx, wy, ww, wh);
  drawText(player.name, W / 2, wy + 7, C.cyan, { align: 'center' });
  tally.lines.forEach((ln, i) => {
    const y = wy + 21 + i * 14, v = tallyValue(i);
    drawText(ln.label, wx + 12, y, C.yellow);
    drawText(ln.fmt ? ln.fmt(v) : String(v), wx + ww - 12, y, C.white, { align: 'right' });
  });
  if (tally.done && blink(2)) drawText('PRESS START', W / 2, wy + wh - 13, C.white, { align: 'center' });
  addHit(0, 0, W, H, 'any');
}
function renderBoot() {
  if (scene === 'loading') {
    drawText('LOADING' + '...'.slice(0, Math.floor(uiTime * 3) % 4), W / 2 - 24, H / 2 - 4, C.white);
    return;
  }
  const lines = ['COULD NOT LOAD THE SPRITES.', bootError, '', 'SERVE THE GAME FOLDER OVER HTTP,',
    'E.G. NPX HTTP-SERVER GAME', 'AND OPEN THE ADDRESS IT PRINTS.'];
  lines.forEach((ln, i) => {
    wrapText(ln, W - 16).forEach((w, j) => drawText(w, W / 2, H / 2 - 30 + i * 10 + j * 9,
      i === 0 ? C.red : C.lgrey, { align: 'center' }));
  });
}

function render() {
  hits = [];
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  rect(0, 0, W, H, C.black);
  if (scene === 'loading' || scene === 'error') { renderBoot(); return; }
  if (scene === 'title') { renderTitle(); return; }
  if (scene === 'select') { renderSelect(); return; }
  renderWorld();
  if (scene === 'play') {
    renderHUD();
    renderBanner();
  }
  // stepped full-screen flash on level-ups, chests and purges
  if (state.flash > 0.05 && !REDUCED) rect(0, 0, W, H, `rgba(255,255,255,${state.flash > 0.3 ? 0.4 : 0.2})`);
  if (scene === 'play') {
    const m = menus[0];
    if (m) {
      if (m.type === 'levelup') renderLevelUp(m);
      else if (m.type === 'chest') renderChest(m);
      else renderPause(m);
    } else renderJoystick();
  } else if (scene === 'over') renderResults();
}

// ---------- main loop ----------
let lastT = 0;
function loop(t) {
  const dt = Math.min(0.05, Math.max(0, (t - lastT) / 1000));
  lastT = t;
  uiTime += dt;
  if (scene === 'play' && !menus.length) update(dt);
  else if (scene === 'over') updateTally(dt);
  menuTick(dt);
  render();
  requestAnimationFrame(loop);
}

loadAssets().then(() => {
  prepareSprites();
  scene = 'title';
}).catch(err => {
  bootError = err.message;
  scene = 'error';
});
requestAnimationFrame(loop);
