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

// Sampled hurt voices, one per hero (Biski meows) — see assets/CREDITS.md.
// Decoded once audio is unlocked; until then (or on file:// pages) the synth thud stands in.
const VOICE_FILES = ['visor', 'wildcat', 'skywitch', 'ace', 'mender', 'biski', 'neil', 'zoe'];
const SFX_FILES = ['banshee-scream', 'butcher-roar'];   // assets/sfx/<name>.mp3
const voiceBuf = {};
let voicesRequested = false, lastVoiceT = -9;
function loadVoices() {
  if (voicesRequested || !audioCtx) return;
  voicesRequested = true;
  for (const id of VOICE_FILES) {
    const key = 'sfx/hurt-' + id;
    const url = (typeof EMBEDDED_ASSETS !== 'undefined' && EMBEDDED_ASSETS[key]) || ('assets/' + key + '.mp3');
    fetch(url).then(r => r.arrayBuffer())
      .then(buf => new Promise((res, rej) => audioCtx.decodeAudioData(buf, res, rej)))
      .then(decoded => { voiceBuf[id] = decoded; })
      .catch(() => {});
  }
  for (const name of SFX_FILES) {
    const key = 'sfx/' + name;
    const url = (typeof EMBEDDED_ASSETS !== 'undefined' && EMBEDDED_ASSETS[key]) || ('assets/' + key + '.mp3');
    fetch(url).then(r => r.arrayBuffer())
      .then(buf => new Promise((res, rej) => audioCtx.decodeAudioData(buf, res, rej)))
      .then(decoded => { sampleBuf[name] = decoded; })
      .catch(() => {});
  }
}
const sampleBuf = {};
function playSample(name, vol = 0.6) {
  try {
    if (muted || !sampleBuf[name]) return;
    const src = audioCtx.createBufferSource(), g = audioCtx.createGain();
    src.buffer = sampleBuf[name];
    g.gain.value = vol;
    src.connect(g); g.connect(audioOut());
    src.start();
  } catch (e) {}
}
function hurtVoice(id) {
  try {
    if (muted) return;
    const out = audioOut();
    loadVoices();
    sfx(90, 0.12, 'square', 0.05, -30);                     // body-hit thud under the voice
    const buf = voiceBuf[id], now = audioCtx.currentTime;
    if (!buf) { sndHurt(); return; }
    if (now - lastVoiceT < 0.4) return;                      // never stack voices
    lastVoiceT = now;
    const src = audioCtx.createBufferSource(), g = audioCtx.createGain();
    src.buffer = buf;
    src.playbackRate.value = rand(0.95, 1.06);               // a little variety per hit
    g.gain.value = 0.7;
    src.connect(g); g.connect(out);
    src.start();
  } catch (e) {}
}
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

const music = { on: true, started: false, step: 0, nextT: 0, timer: null, song: 1 };
// "Danger Room" — an original Saturday-morning-cartoon hero theme in E minor:
// orchestra-hit intro, brass-stab pushes, galloping octave bass, a rising brass
// melody, then a power-chord bridge. Written as 16th-note steps per bar.
const NOTE_IDX = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const hz = n => { const m = /^([A-G]#?)(\d)$/.exec(n); return 440 * Math.pow(2, (NOTE_IDX[m[1]] + (+m[2] + 1) * 12 - 69) / 12); };
// "E5:4 -:2 G5:6" -> [{ at, f, len }] (a "-" note is a rest)
function phrase(str) {
  let at = 0;
  return str.trim().split(/\s+/).map(tok => {
    const [n, l] = tok.split(':'), ev = { at, f: n === '-' ? 0 : hz(n), len: +l };
    at += +l;
    return ev;
  }).filter(e => e.f);
}
const CHORDS = {   // bass root + stab triad
  Em: { root: 'E2', tri: ['E4', 'G4', 'B4'] }, C: { root: 'C2', tri: ['C4', 'E4', 'G4'] },
  D: { root: 'D2', tri: ['D4', 'F#4', 'A4'] }, B: { root: 'B1', tri: ['B3', 'D#4', 'F#4'] },
  Am: { root: 'A1', tri: ['A3', 'C4', 'E4'] },
};
const MEL_A = ['E5:4 B4:2 E5:2 G5:6 F#5:2', 'E5:3 D5:3 B4:10', 'C5:4 E5:2 G5:2 C6:6 B5:2', 'G5:3 E5:3 G5:10',
  'A5:4 F#5:2 D5:2 A5:4 B5:2 C6:2', 'D6:6 C6:2 B5:4 A5:4', 'B5:4 A5:2 F#5:2 D#5:4 F#5:4', 'B4:8 -:8'];
const MEL_B = ['A4:2 C5:2 E5:4 D5:2 C5:2 B4:4', 'A4:6 E5:2 A5:8', 'G5:2 F#5:2 E5:4 B4:4 E5:4', 'G5:12 -:4',
  'E5:2 G5:2 C6:4 B5:2 A5:2 G5:4', 'F#5:4 A5:4 D6:8', 'D#6:4 B5:4 A5:4 F#5:4', 'B5:8 -:8'];
const STAB_INTRO = [0, 3, 6, 10, 12], STAB_PUSH = [14], STAB_END = [8, 11, 14];
// arrangement: each bar = chord, melody phrase, stab steps, feel; the loop restarts at LOOP_AT
const SONG = [];
['Em', 'Em', 'C', 'B'].forEach((c, i) => SONG.push({ c, stabs: STAB_INTRO, hit: i % 2 === 0, fill: i === 3, sec: 'intro' }));
const LOOP_AT = SONG.length;
const A_CH = ['Em', 'Em', 'C', 'C', 'D', 'D', 'B', 'B'], B_CH = ['Am', 'Am', 'Em', 'Em', 'C', 'D', 'B', 'B'];
A_CH.forEach((c, i) => SONG.push({ c, mel: phrase(MEL_A[i]), stabs: i === 7 ? STAB_END : STAB_PUSH, fill: i === 7, crash: i === 0, sec: 'A' }));
B_CH.forEach((c, i) => SONG.push({ c, mel: phrase(MEL_B[i]), stabs: i === 7 ? STAB_END : [], fill: i === 7, crash: i === 0, gtr: true, sec: 'B' }));
A_CH.forEach((c, i) => SONG.push({ c, mel: phrase(MEL_A[i]), stabs: i === 7 ? STAB_END : STAB_PUSH, fill: i === 7, crash: i === 0, oct: true, sec: 'A2' }));
const BASS_GALLOP = [0, 0, 12, 0, 0, 12, 0, 12];   // semitone offsets on the 8ths

function musicTick(ahead = 0.18) {   // ahead: how far to schedule (offline renders pass a long one)
  if (!music.on || muted || !audioCtx) return;
  if (music.song === 2) { desertTick(ahead); return; }
  if (music.song === 3) { jungleTick(ahead); return; }
  if (music.song === 4) { oceanTick(ahead); return; }
  const bpm = 152, sd = 60 / bpm / 4;
  // never play catch-up after mute/background throttling — snap to now
  if (music.nextT < audioCtx.currentTime - 0.1) music.nextT = audioCtx.currentTime + 0.05;
  while (music.nextT < audioCtx.currentTime + ahead) {
    const total = music.step, s = total % 16;
    let bi = Math.floor(total / 16);
    if (bi >= SONG.length) bi = LOOP_AT + (bi - LOOP_AT) % (SONG.length - LOOP_AT);
    const bar = SONG[bi], ch = CHORDS[bar.c], t = music.nextT;
    const intense = scene === 'play' && state.time > 300;
    // drums: driving rock beat, snare roll + tom run into each new section
    if (bar.crash && s === 0) noiseHit(t, 0.45, 0.06);
    if (s === 0 || s === 8 || s === 10 || (bar.sec !== 'intro' && s === 7)) beep(t, 90, 0.11, 'sine', 0.16, -55);
    if (bar.fill && s >= 8) {
      if (s % 2 === 0) beep(t, 200 - (s - 8) * 12, 0.14, 'sine', 0.12, -70);    // tom run
      else noiseHit(t, 0.05, 0.05);
    } else {
      if (s === 4 || s === 12) noiseHit(t, 0.08, 0.075);                       // snare
      if (s % 2 === 0) noiseHit(t, 0.02, s % 4 === 2 ? 0.03 : 0.018);         // hats
    }
    // orchestra hit: brassy low chord + noise burst
    if (bar.hit && s === 0) {
      noiseHit(t, 0.2, 0.08);
      for (const n of ch.tri) fm(t, hz(n) / 2, 0.4, 0.04, 1.5, 4, 0.18);
    }
    // galloping octave FM bass on the 8ths
    if (s % 2 === 0) {
      const off = bar.sec === 'intro' ? 0 : BASS_GALLOP[s / 2];
      fm(t, hz(ch.root) * Math.pow(2, off / 12), sd * 1.8, 0.12, 1, 2.4, 0.09);
    }
    // brass stabs: short bright triads
    if (bar.stabs && bar.stabs.includes(s)) for (const n of ch.tri) fm(t, hz(n), sd * 1.6, 0.03, 1, 3.5, 0.06);
    // bridge: buzzy palm-muted power chords (root + fifth) on the 8ths
    if (bar.gtr && s % 2 === 0) {
      const r = hz(ch.root) * 2;
      fm(t, r, sd * 1.5, 0.028, 1, 6, 0.05);
      fm(t, r * 1.4983, sd * 1.5, 0.022, 1, 6, 0.05);
    }
    // lead brass: two slightly detuned FM voices for a fat unison
    if (bar.mel) {
      for (const ev of bar.mel) {
        if (ev.at !== s) continue;
        const f = bar.oct ? ev.f * 2 : ev.f, dur = ev.len * sd * 0.95;
        fm(t, f, dur, 0.036, 1, 2.2, 0.3, true);
        fm(t, f * 1.004, dur, 0.026, 1, 1.6, 0.4, true);
        if (bar.oct) fm(t, ev.f, dur, 0.022, 1, 1.8, 0.3, true);
      }
    }
    // late game: a racing 16th arpeggio on top
    if (intense && bar.sec !== 'intro') {
      const n = ch.tri[[0, 1, 2, 1][s % 4]];
      fm(t, hz(n) * 4, sd * 0.8, 0.018, 2, 1.4, 0.05);
    }
    music.step++;
    music.nextT += sd;
  }
}
// "Burning Sands" — an original desert theme in D Hijaz (D Eb F# G A Bb C): doumbek in the
// maqsum rhythm (dum . tek . . tek dum . . . tek), riq jingles, a D/A drone, an oud ostinato,
// a ney melody with grace-note ornaments, then an oud solo. Sharps spell the flats (D# = Eb).
const HIJAZ_UP = { D: 'D#', 'D#': 'F#', 'F#': 'G', G: 'A', A: 'A#', 'A#': 'C', C: 'D' };
const upper = n => { const m = /^([A-G]#?)(\d)$/.exec(n), u = HIJAZ_UP[m[1]]; return u + (u === 'C' ? +m[2] + 1 : m[2]); };   // the octave number turns over at C
function phraseN(str) {   // like phrase() but keeps note names, for ornaments
  let at = 0;
  return str.trim().split(/\s+/).map(tok => { const [n, l] = tok.split(':'), ev = { at, n, len: +l }; at += +l; return ev; }).filter(e => e.n !== '-');
}
const OUD_RIFF = phraseN('D3:2 D#3:1 D3:1 F#3:2 G3:2 A3:2 G3:2 F#3:2 D#3:2');
const NEY_A = ['A4:4 A#4:2 A4:2 G4:4 F#4:4', 'G4:2 A4:2 A#4:2 C5:2 A4:8', 'D5:4 C5:2 A#4:2 A4:4 G4:2 F#4:2', 'G4:6 F#4:2 D#4:4 D4:4',
  'F#4:2 G4:2 A4:4 A#4:2 A4:2 G4:2 A4:2', 'A#4:4 C5:4 D5:8', 'D#5:2 D5:2 C5:2 A#4:2 A4:2 G4:2 F#4:2 G4:2', 'A4:8 D4:8'].map(phraseN);
const OUD_B = ['D5:2 D#5:2 F#5:2 G5:2 F#5:2 D#5:2 D5:4', 'C5:2 D5:2 D#5:4 D5:2 C5:2 A#4:4',
  'A4:2 A#4:2 C5:2 D5:2 C5:2 A#4:2 A4:4', 'G4:2 A4:2 A#4:2 A4:2 G4:2 F#4:2 D#4:2 D4:2'].map(phraseN);
const SONG2 = [{ sec: 'intro' }, { sec: 'intro', fill: true }];
const LOOP2_AT = SONG2.length;
NEY_A.forEach((mel, i) => SONG2.push({ sec: 'A', ney: mel, fill: i === 7 }));
OUD_B.forEach((mel, i) => SONG2.push({ sec: 'B', oud: mel, fill: i === 3 }));
OUD_B.forEach((mel, i) => SONG2.push({ sec: 'B2', oud: mel, ney: i % 2 ? null : NEY_A[i * 2], fill: i === 3 }));
const oud = (t, f, dur, vol) => { fm(t, f, dur, vol, 1, 2.6, 0.06); fm(t, f * 2, dur * 0.5, vol * 0.3, 1, 1.2, 0.03); };
function desertTick(ahead) {
  const bpm = 104, sd = 60 / bpm / 4;
  if (music.nextT < audioCtx.currentTime - 0.1) music.nextT = audioCtx.currentTime + 0.05;
  while (music.nextT < audioCtx.currentTime + ahead) {
    const s = music.step % 16;
    let bi = Math.floor(music.step / 16);
    if (bi >= SONG2.length) bi = LOOP2_AT + (bi - LOOP2_AT) % (SONG2.length - LOOP2_AT);
    const bar = SONG2[bi], t = music.nextT;
    // doumbek: maqsum. dum = deep drop, tek = sharp rim slap; tek-a-tek fills close a section
    if (s === 0 || s === 8) { beep(t, 130, 0.24, 'sine', 0.2, -75); noiseHit(t, 0.05, 0.03); }
    if (s === 2 || s === 6 || s === 12) { noiseHit(t, 0.04, 0.07); beep(t, 820, 0.03, 'square', 0.018); }
    if (bar.fill && s >= 13) { noiseHit(t, 0.03, 0.06); beep(t, 760, 0.025, 'square', 0.015); }
    if (s % 2 === 1 && !(bar.fill && s >= 13)) noiseHit(t, 0.025, 0.014);                   // riq jingles
    // drone: D + A under every bar
    if (s === 0) {
      fm(t, hz('D2'), 16 * sd, 0.05, 1, 0.7, 1.2, true);
      fm(t, hz('A2'), 16 * sd, 0.025, 1, 0.5, 1.2, true);
    }
    // oud: ostinato under the ney, melody in the solo sections
    const oudLine = bar.oud || OUD_RIFF;
    for (const ev of oudLine) {
      if (ev.at !== s) continue;
      oud(t, hz(ev.n), Math.min(0.5, ev.len * sd * 1.6), bar.oud ? 0.06 : 0.045);
      if (bar.oud && ev.len >= 4) oud(t + sd, hz(ev.n), 0.2, 0.035);                    // tremolo pick
    }
    // ney: breathy flute with an upper-neighbour grace note before long notes
    if (bar.ney) {
      for (const ev of bar.ney) {
        if (ev.at !== s) continue;
        const dur = ev.len * sd * 0.95;
        if (ev.len >= 4) fm(t, hz(upper(ev.n)), 0.06, 0.03, 1, 0.5, 0.05, true);
        const t0 = ev.len >= 4 ? t + 0.05 : t;
        fm(t0, hz(ev.n), dur, 0.045, 1, 0.55, 0.4, true);
        fm(t0, hz(ev.n) * 2.003, dur, 0.008, 1, 0.2, 0.4, true);                            // breath
      }
    }
    // late game: double-time riq
    if (scene === 'play' && state.time > 300 && s % 2 === 0) noiseHit(t, 0.02, 0.012);
    music.step++;
    music.nextT += sd;
  }
}
// "Green Hell" — an original jungle theme in A minor pentatonic over Am-G-F-G: log drums and
// a shaker, a syncopated marimba ostinato, a breathy wooden flute, a marimba call-and-response
// solo, bird calls in the canopy and frogs croaking in the undergrowth.
const JUNGLE_CH = [{ root: 'A1', tri: ['A3', 'C4', 'E4'] }, { root: 'G1', tri: ['G3', 'B3', 'D4'] },
  { root: 'F1', tri: ['F3', 'A3', 'C4'] }, { root: 'G1', tri: ['G3', 'B3', 'D4'] }];
const MARIMBA_STEPS = [0, 3, 6, 8, 10, 13];        // 3-3-2-2-3 clave-ish syncopation
const MARIMBA_ARP = [0, 2, 1, 2, 0, 1];             // which chord tone on each hit
const FLUTE_A = ['E5:6 D5:2 C5:4 A4:4', 'G4:6 A4:2 D5:8', 'C5:4 A4:2 G4:2 F4:4 G4:4', 'A4:4 C5:4 D5:4 E5:4',
  'G5:6 E5:2 D5:4 C5:4', 'D5:6 B4:2 G4:8', 'A4:2 C5:2 D5:2 E5:2 G5:4 E5:4', 'A5:12 -:4'].map(phrase);
const MARIMBA_B = ['A4:2 C5:2 E5:2 C5:2 -:4 G5:2 E5:2', 'D5:2 B4:2 G4:4 -:4 A4:2 B4:2', 'C5:2 A4:2 F4:2 A4:2 -:4 C5:2 E5:2',
  'D5:2 E5:2 G5:2 E5:2 D5:4 B4:4'].map(phrase);
const SONG3 = [{ sec: 'intro' }, { sec: 'intro', fill: true }];
const LOOP3_AT = SONG3.length;
FLUTE_A.forEach((mel, i) => SONG3.push({ sec: 'A', flute: mel, fill: i === 7 }));
MARIMBA_B.forEach((mel, i) => SONG3.push({ sec: 'B', solo: mel, fill: i === 3 }));
MARIMBA_B.forEach((mel, i) => SONG3.push({ sec: 'B2', solo: mel, flute: FLUTE_A[i * 2 + 1], fill: i === 3 }));
// FM marimba: a 4:1 modulator with a very fast index decay gives the struck-wood "tok"
const marimba = (t, f, vol) => { fm(t, f, 0.32, vol, 4, 2.2, 0.025); fm(t, f, 0.22, vol * 0.5, 1, 0.4, 0.05); };
function jungleTick(ahead) {
  const bpm = 116, sd = 60 / bpm / 4;
  if (music.nextT < audioCtx.currentTime - 0.1) music.nextT = audioCtx.currentTime + 0.05;
  while (music.nextT < audioCtx.currentTime + ahead) {
    const s = music.step % 16, bar16 = Math.floor(music.step / 16);
    let bi = bar16;
    if (bi >= SONG3.length) bi = LOOP3_AT + (bi - LOOP3_AT) % (SONG3.length - LOOP3_AT);
    const bar = SONG3[bi], ch = JUNGLE_CH[bar16 % 4], t = music.nextT;
    // log drums: deep boom, a mid answer and a high slit-drum knock; tumbling run into each section
    if (s === 0 || s === 6 || s === 10) beep(t, 95, 0.3, 'sine', 0.2, -50);
    if (s === 3 || s === 8 || s === 14) beep(t, 150, 0.16, 'sine', 0.12, -60);
    if (s === 12) { beep(t, 260, 0.08, 'sine', 0.08, -90); beep(t, 1300, 0.012, 'square', 0.02); }
    if (bar.fill && s >= 8 && s % 2 === 0) beep(t, 300 - (s - 8) * 25, 0.12, 'sine', 0.12, -80);
    noiseHit(t, 0.02, s % 4 === 2 ? 0.03 : 0.012);                                  // shaker, offbeat push
    // bass on the chord roots, a pulse that ducks with the boom
    if (s === 0 || s === 7 || s === 10) fm(t, hz(ch.root) * (s === 7 ? 2 : 1), sd * 2.5, 0.11, 1, 1.4, 0.12);
    // marimba ostinato (out in the intro's first bar, softer under the solo)
    if (!(bar.sec === 'intro' && bar16 === 0) && MARIMBA_STEPS.includes(s)) {
      const k = MARIMBA_STEPS.indexOf(s);
      marimba(t, hz(ch.tri[MARIMBA_ARP[k]]) * (k === 3 ? 2 : 1), bar.solo ? 0.03 : 0.045);
    }
    // marimba solo with a tremolo on long notes
    if (bar.solo) for (const ev of bar.solo) {
      if (ev.at !== s) continue;
      marimba(t, ev.f, 0.06);
      if (ev.len >= 4) { marimba(t + sd, ev.f, 0.035); marimba(t + 2 * sd, ev.f, 0.025); }
    }
    // wooden flute: breathy FM with a scoop up into long notes
    if (bar.flute) for (const ev of bar.flute) {
      if (ev.at !== s) continue;
      const dur = ev.len * sd * 0.95;
      if (ev.len >= 4) fm(t, ev.f * 0.94, 0.05, 0.025, 1, 0.4, 0.05, true);
      const t0 = ev.len >= 4 ? t + 0.04 : t;
      fm(t0, ev.f, dur, 0.042, 1, 0.45, 0.4, true);
      fm(t0, ev.f * 3.002, dur, 0.006, 1, 0.2, 0.4, true);                              // breath
    }
    // canopy: a bird's three-chirp call every other bar, a frog croak answering
    if (bar16 % 2 === 1 && (s === 4 || s === 5 || s === 6)) beep(t, 2300 + (s - 4) * 300, 0.07, 'sine', 0.018, 1100);
    if (bar16 % 4 === 2 && s === 14) { beep(t, 70, 0.12, 'square', 0.03, 30); beep(t + 0.14, 66, 0.12, 'square', 0.025, 30); }
    // late game: the drummers double up
    if (scene === 'play' && state.time > 480 && s % 2 === 1) beep(t, 190, 0.06, 'sine', 0.06, -60);
    music.step++;
    music.nextT += sd;
  }
}
// "Drowned Depths" — an original undersea theme in D dorian over Dm9-Bbmaj7-Fmaj7-Cadd9 (sharps spell
// the flats): a cascading glass-bell arpeggio, a slow ocarina melody, a warm sub bass, rising bubbles,
// a whale call in the second section and a soft heartbeat kick.
const OCEAN_CH = [{ root: 'D2', arp: ['D4', 'F4', 'A4', 'C5', 'E5'] }, { root: 'A#1', arp: ['A#3', 'D4', 'F4', 'A4', 'C5'] },
  { root: 'F2', arp: ['F4', 'A4', 'C5', 'E5', 'G5'] }, { root: 'C2', arp: ['C4', 'E4', 'G4', 'D5', 'E5'] }];
const ARP_ORDER = [0, 1, 2, 3, 4, 3, 2, 1];          // up and back down on the 8ths
const OCARINA_A = ['A4:8 G4:4 F4:4', 'D4:12 -:4', 'C5:6 A4:2 G4:8', 'E4:12 -:4',
  'F4:4 G4:4 A4:4 C5:4', 'D5:8 C5:4 A4:4', 'G4:4 A4:4 C5:4 B4:4', 'A4:16'].map(phrase);
const OCARINA_B = ['D5:8 E5:4 F5:4', 'D5:12 -:4', 'C5:4 D5:4 F5:4 A5:4', 'G5:12 -:4'].map(phrase);
const SONG4 = [{ sec: 'intro' }, { sec: 'intro' }];
const LOOP4_AT = SONG4.length;
OCARINA_A.forEach(mel => SONG4.push({ sec: 'A', mel }));
OCARINA_B.forEach((mel, i) => SONG4.push({ sec: 'B', mel, whale: i === 0 }));
OCARINA_B.forEach((mel, i) => SONG4.push({ sec: 'B2', mel, oct: true }));
function oceanTick(ahead) {
  const bpm = 92, sd = 60 / bpm / 4;
  if (music.nextT < audioCtx.currentTime - 0.1) music.nextT = audioCtx.currentTime + 0.05;
  while (music.nextT < audioCtx.currentTime + ahead) {
    const s = music.step % 16, bar16 = Math.floor(music.step / 16);
    let bi = bar16;
    if (bi >= SONG4.length) bi = LOOP4_AT + (bi - LOOP4_AT) % (SONG4.length - LOOP4_AT);
    const bar = SONG4[bi], ch = OCEAN_CH[bar16 % 4], t = music.nextT;
    // heartbeat kick + a hushed shaker
    if (bar.sec !== 'intro' && (s === 0 || s === 3)) beep(t, s ? 62 : 70, 0.22, 'sine', s ? 0.09 : 0.14, -30);
    if (bar.sec !== 'intro' && s % 4 === 2) noiseHit(t, 0.03, 0.012);
    // sub bass: root on 1 and the "and" of 3, a long swell
    if (s === 0 || s === 10) fm(t, hz(ch.root), sd * (s ? 5 : 9), 0.07, 1, 0.8, 0.3, true);
    // glass-bell arpeggio on the 8ths (an inharmonic 3.5 ratio rings like struck glass)
    if (s % 2 === 0) {
      const n = ch.arp[ARP_ORDER[s / 2]];
      fm(t, hz(n), 0.6, bar.sec === 'intro' ? 0.024 : 0.019, 3.5, 1.2, 0.25);
      fm(t + sd * 3, hz(n) * 2, 0.4, 0.008, 3.5, 0.8, 0.2);                       // a faint echo an octave up
    }
    // ocarina: soft, slow-swelling FM with a breath on top
    if (bar.mel) for (const ev of bar.mel) {
      if (ev.at !== s) continue;
      const f = bar.oct ? ev.f * 2 : ev.f, dur = ev.len * sd * 0.97;
      fm(t, f, dur, 0.036, 1, 0.35, 0.6, true);
      fm(t, f * 2.002, dur, 0.007, 1, 0.15, 0.6, true);
      if (bar.oct) fm(t, ev.f, dur, 0.02, 1, 0.3, 0.6, true);
    }
    // bubbles: little rising blips, a different pair each bar
    const b1 = (bar16 * 5) % 16, b2 = (bar16 * 11 + 7) % 16;
    if (s === b1 || s === b2) { beep(t, 500 + (bar16 % 3) * 120, 0.08, 'sine', 0.02, 900); beep(t + 0.07, 800 + (bar16 % 3) * 120, 0.06, 'sine', 0.014, 900); }
    // whale call: a long low glide up and back, once per B section
    if (bar.whale && s === 4) { beep(t, 180, 1.6, 'sine', 0.035, 140); beep(t + 1.6, 320, 1.4, 'sine', 0.025, -160); }
    // late game: the bass starts to pulse on the 8ths
    if (scene === 'play' && state.time > 600 && s % 2 === 0 && s !== 0 && s !== 10) fm(t, hz(ch.root), sd * 1.5, 0.05, 1, 1, 0.1);
    music.step++;
    music.nextT += sd;
  }
}

// 2-operator FM voice: a sine modulator bends a sine carrier; the modulation
// index decays fast, giving the bright attack / mellow tail of Mega Drive FM.
// brass = horn envelope: quick swell, held body, brightness that follows the swell
function fm(t, freq, dur, vol, ratio, index, decay, brass = false) {
  try {
    const out = audioOut();
    const car = audioCtx.createOscillator(), mod = audioCtx.createOscillator();
    const depth = audioCtx.createGain(), amp = audioCtx.createGain();
    amp.gain.value = 0;   // gains default to 1: start silent or the first sample can pop
    car.frequency.setValueAtTime(freq, t);
    mod.frequency.setValueAtTime(freq * ratio, t);
    const d0 = freq * ratio * index;
    let end = t + dur;
    if (brass) {
      const hold = Math.max(t + 0.05, t + dur - 0.05);
      depth.gain.setValueAtTime(d0 * 0.25, t);
      depth.gain.linearRampToValueAtTime(d0, t + 0.04);
      depth.gain.exponentialRampToValueAtTime(Math.max(1, d0 * 0.45), t + 0.04 + decay);
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.linearRampToValueAtTime(vol, t + 0.03);
      amp.gain.linearRampToValueAtTime(vol * 0.7, hold);
      amp.gain.exponentialRampToValueAtTime(0.001, hold + 0.09);
      end = hold + 0.09;
    } else {
      depth.gain.setValueAtTime(d0, t);
      depth.gain.exponentialRampToValueAtTime(Math.max(1, d0 * 0.12), t + decay);
      amp.gain.setValueAtTime(vol, t);
      amp.gain.exponentialRampToValueAtTime(0.001, end);
    }
    mod.connect(depth); depth.connect(car.frequency);
    car.connect(amp); amp.connect(out);
    mod.start(t); car.start(t);
    mod.stop(end + 0.02); car.stop(end + 0.02);
  } catch (e) {}
}
function beep(t, freq, dur, type, vol, slide = 0) {
  try {
    const out = audioOut();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.linearRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.value = 0;
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
    g.gain.value = 0;
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
  loadVoices();
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
  T: '#DB9249', F: '#FFDB92',
};
// health food, Castlevania wall-meat style: fish 25%, floor chicken 50%, medipack 100%
const FOOD_ROWS = {
  fish: ['...KKKKKK...KK', '..KBBBBBBK.KCK', '.KCWKCCCBBKKCK', 'KCCKCCCCCCCCK.',
    'KCCCCCLCCCCCK.', '.KLLLLLLLLKKCK', '..KLLLLLLK.KCK', '...KKKKKK...KK'],
  chicken: ['..........KK..', '.........KWWK.', '....KKKK.KWK..', '..KKFFTTKTK...',
    '.KFFTTTTTTK...', 'KFTTTTTTTTSK..', 'KTTTTTTTTSSK..', 'KTTTTTTSSSSK..',
    '.KSSSSSSSssK..', 'KWWKKKKKKKKWWK', '.KLLLLLLLLLLK.', '..KKKKKKKKKK..'],
  medkit: ['...KKKKKK...', '...KK..KK...', 'KKKKKKKKKKKK', 'KWWWWRRWWWWK',
    'KWWWWRRWWWWK', 'KWWRRRRRRWWK', 'KWWRRRRRRWWK', 'KWWWWRRWWWWK',
    'KLLLLRRLLLLK', 'KKKKKKKKKKKK'],
};
const FOOD = {
  fish:    { name: 'FISH',          heal: 0.25, col: '#49DBFF' },
  chicken: { name: 'FLOOR CHICKEN', heal: 0.50, col: '#FFB600' },
  medkit:  { name: 'MEDIPACK',      heal: 1.00, col: '#24DB24' },
};
// mostly fish, sometimes chicken, rarely the full medipack
function rollFood(rich = false) {
  const r = Math.random();
  if (rich) return r < 0.35 ? 'fish' : r < 0.8 ? 'chicken' : 'medkit';
  return r < 0.6 ? 'fish' : r < 0.9 ? 'chicken' : 'medkit';
}
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
const ICONS = {}, GEMS = {}, FOOD_IMG = {};
let COIN = [], BOMB = [], CHEST = null, ORB = null, CARD = [], CURSOR = null, CURSOR_SH = null;
let SPK_ON = null, SPK_OFF = null, PAUSE_IC = null;
function compilePixmaps() {
  for (const [k, rows] of Object.entries(ICON_ROWS)) ICONS[k] = pixmap(rows, IP, 'icon:' + k);
  for (const [k, rows] of Object.entries(FOOD_ROWS)) FOOD_IMG[k] = pixmap(rows, IP, 'food:' + k);
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
  'slime', 'goblin', 'skeleton', 'orc', 'minotaur', 'tiles', 'biski',
  'bat', 'imp', 'scarab', 'shaman', 'hound', 'guard', 'knight', 'skills',
  'assassin', 'mech', 'burger', 'lizdoc', 'feral', 'neil', 'zoe', 'crypt', 'butcher', 'banshee', 'golem',
  'desert', 'fly', 'maggot', 'lizard', 'orb',
  'jungle', 'snake', 'treant', 'plant', 'mosquito', 'monkey', 'frog'];
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
const SPR = {};   // file -> { base, white, elite?, boss2?, boss3?, rage? }
// berserk palette: the hero's own shading pushed into blood red (baked on first use)
function rageSheet(file) {
  const set = SPR[file];
  if (set.rage) return set.rage;
  const c = document.createElement('canvas');
  c.width = set.base.width; c.height = set.base.height;
  const g = c.getContext('2d');
  g.drawImage(set.base, 0, 0);
  try {
    const d = g.getImageData(0, 0, c.width, c.height), a = d.data;
    for (let i = 0; i < a.length; i += 4) {
      if (!a[i + 3]) continue;
      const L = (0.3 * a[i] + 0.59 * a[i + 1] + 0.11 * a[i + 2]) / 255;
      const q = v => MD_LEVELS[Math.max(0, Math.min(7, Math.round(v * 7 / 255)))];
      a[i] = q(a[i] * 0.5 + 255 * Math.min(1, L * 1.4 + 0.25) * 0.5);
      a[i + 1] = q(a[i + 1] * 0.5);
      a[i + 2] = q(a[i + 2] * 0.4);
    }
    g.putImageData(d, 0, 0);
  } catch (e) {   // tainted canvas (file://): a flat red silhouette still reads as rage
    set.ghost = silhouette(set.base, '#920000');
    return (set.rage = silhouette(set.base, C.red));
  }
  set.ghost = silhouette(set.base, '#920000');   // afterimages
  return (set.rage = c);
}
// the black cat needs a small lift so her shading survives the 9-bit palette
const BAKE_FILTERS = { biski: 'brightness(1.6)' };
function prepareSprites() {
  for (const name of ASSET_FILES) {
    const set = SPR[name] = { base: bakeSheet(assets[name], BAKE_FILTERS[name] || null) };
    set.white = silhouette(set.base, C.white);
    set.shade = silhouette(set.base, '#000000');   // bestiary: not met yet
  }
  // palette-swapped variants, the way cartridges reused one sprite for a tougher foe
  for (const f of ['slime', 'skeleton', 'goblin', 'orc', 'bat', 'imp', 'scarab', 'shaman', 'guard',
    'assassin', 'burger', 'lizdoc', 'feral', 'banshee', 'golem', 'fly', 'maggot', 'lizard',
    'snake', 'treant', 'plant', 'mosquito', 'monkey', 'frog']) {
    SPR[f].elite = bakeSheet(assets[f], 'saturate(2.2) brightness(1.15)');
  }
  SPR.minotaur.boss2 = bakeSheet(assets.minotaur, 'hue-rotate(140deg) saturate(1.4)');
  SPR.minotaur.boss3 = bakeSheet(assets.minotaur, 'hue-rotate(250deg) saturate(1.6)');
}

// Sheets are 10 frames per row unless `frames` says otherwise; cells are square.
// rows map anim -> row index.
const STD = { idle: 0, walk: 2, attack: 3, death: 4 };
const CAST = { idle: 0, cast: 1, walk: 2, attack: 3, death: 4 };
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
  // the demon roster (see assets/CREDITS.md for sources + edits)
  bat:      { file: 'bat',      size: 32, rows: STD },
  imp:      { file: 'imp',      size: 32, rows: STD },
  shaman:   { file: 'shaman',   size: 32, rows: CAST },
  guard:    { file: 'guard',    size: 32, rows: STD },
  scarab:   { file: 'scarab',   size: 36, rows: STD, frames: { idle: 1, walk: 6, attack: 6, death: 2 } },
  hound:    { file: 'hound',    size: 68, rows: STD, frames: { idle: 6, walk: 5, attack: 6, death: 3 } },
  knight:   { file: 'knight',   size: 64, rows: STD, frames: { idle: 4, walk: 8, attack: 5, death: 6 } },
  assassin: { file: 'assassin', size: 32, rows: STD },
  mech:     { file: 'mech',     size: 72, rows: STD, frames: { idle: 1, walk: 6, attack: 3, death: 2 } },
  burger:   { file: 'burger',   size: 40, rows: STD, frames: { idle: 1, walk: 6, attack: 6, death: 4 } },
  lizdoc:   { file: 'lizdoc',   size: 32, rows: STD, frames: { idle: 2, walk: 6, attack: 4, death: 2 } },
  feral:    { file: 'feral',    size: 32, rows: STD },
  // LPC-generator heroes, downscaled to 40px cells (see assets/CREDITS.md)
  neil:     { file: 'neil',       size: 40, rows: STD, frames: { idle: 1, walk: 8, attack: 7, death: 6 } },
  zoe:      { file: 'zoe',        size: 40, rows: STD, frames: { idle: 1, walk: 8, attack: 6, death: 1 } },
  butcher:  { file: 'butcher',  size: 96, rows: STD, frames: { idle: 1, walk: 8, attack: 10, death: 6 } },
  banshee:  { file: 'banshee',  size: 40, rows: STD, frames: { idle: 1, walk: 4, attack: 4, death: 2 } },
  golem:    { file: 'golem',    size: 48, rows: STD, frames: { idle: 1, walk: 7, attack: 7, death: 7 } },
  // Act II: the Burning Sands
  fly:      { file: 'fly',      size: 32, rows: STD, frames: { idle: 1, walk: 8, attack: 7, death: 3 } },
  maggot:   { file: 'maggot',   size: 32, rows: STD, frames: { idle: 1, walk: 4, attack: 12, death: 8 } },
  lizard:   { file: 'lizard',   size: 40, rows: STD, frames: { idle: 1, walk: 8, attack: 5, death: 6 } },
  // Act III jungle
  snake:    { file: 'snake',    size: 64, rows: STD, frames: { idle: 10, walk: 10, attack: 10, death: 10 } },
  treant:   { file: 'treant',   size: 64, rows: STD, frames: { idle: 1, walk: 4, attack: 4, death: 4 } },
  plant:    { file: 'plant',    size: 64, rows: STD, frames: { idle: 1, walk: 4, attack: 7, death: 10 } },
  mosquito: { file: 'mosquito', size: 24, rows: STD, frames: { idle: 1, walk: 4, attack: 3, death: 3 } },
  monkey:   { file: 'monkey',   size: 44, rows: STD, frames: { idle: 1, walk: 8, attack: 4, death: 4 } },
  frog:     { file: 'frog',     size: 208, rows: { idle: 0, air: 1, walk: 2, attack: 3, death: 4 },   // air = [rising, falling]
              frames: { idle: 1, air: 2, walk: 5, attack: 10, death: 3 } },
};
// painted skill icons (assets/skills.png): row 0 = 32x32, row 1 = 16x16, in this order
const SKILL_ORDER = ['optic', 'claws', 'storm', 'orbs', 'nova', 'cards', 'boots', 'vitality',
  'regen', 'magnet', 'power', 'focus', 'plating', 'heal', 'hammer', 'sushi'];
// projectile sprites on the sheet's bottom row (y=48): hammer 14px, nigiri 16px, maki 16px
const PROJ = { hammer: [0, 49, 14, 14], nigiri: [16, 48, 16, 16], maki: [32, 48, 16, 16] };
// draw a projectile centred on (x, y), turned in quarter steps so pixels stay square
function drawProj(key, x, y, quarter = 0) {
  if (!SPR.skills) return;
  const [sx, sy, w, h] = PROJ[key];
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate((quarter % 4) * Math.PI / 2);
  ctx.drawImage(SPR.skills.base, sx, sy, w, h, -(w >> 1), -(h >> 1), w, h);
  ctx.restore();
}
function drawSkill(id, x, y, size = 32) {
  const i = SKILL_ORDER.indexOf(id);
  if (i < 0 || !SPR.skills) {                 // gold etc. keep their pixel icons
    const ic = ICONS[id];
    if (ic) ctx.drawImage(ic, Math.round(x + (size - ic.width) / 2), Math.round(y + (size - ic.height) / 2));
    return;
  }
  const img = SPR.skills.base;
  if (size >= 32) ctx.drawImage(img, i * 32, 0, 32, 32, x, y, 32, 32);
  else ctx.drawImage(img, i * 32, 32, 16, 16, x, y, 16, 16);
}
const frameCount = (key, anim) => SHEETS[key].frames?.[anim] ?? 10;

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
// death plays once at 12fps; attack loops twice a second; idle/walk at 10fps
function animFrame(animT, anim, key) {
  const n = key ? frameCount(key, anim) : 10;
  if (anim === 'death') return Math.min(n - 1, Math.floor(animT * 12));
  if (anim === 'attack') return Math.floor(animT * n * 2) % n;
  return Math.floor(animT * 10) % n;
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
  const M = 230;   // jungle trees stand ~200 units tall: scan far enough below the screen
  const x0 = Math.floor((player.x - VW / 2 - M) / TILE), x1 = Math.ceil((player.x + VW / 2 + M) / TILE);
  const y0 = Math.floor((player.y - VH / 2 - M) / TILE), y1 = Math.ceil((player.y + VH / 2 + M) / TILE);
  const obs = [], braz = [];
  for (let iy = y0; iy <= y1; iy++) {
    for (let ix = x0; ix <= x1; ix++) {
      const oh = obstacleAt(ix, iy);
      if (oh) {
        const kind = (oh >>> 3) % 8;
        obs.push({ x: ix * TILE + TILE / 2, y: iy * TILE + TILE / 2, r: state.act === 4 ? OCEAN_R[kind % 6] : state.act === 3 ? JUNGLE_R[kind % 6] : state.act === 2 ? DESERT_R[kind % 5] : PROP_R[kind], kind });
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
  if (roll < 0.40) pickups.push({ x: bz.x, y: bz.y, type: 'gold', v: randInt(15, 40) });
  else if (roll < 0.70) pickups.push({ x: bz.x, y: bz.y, type: 'food', food: rollFood(true) });
  else if (roll < 0.85) gems.push({ x: bz.x, y: bz.y, v: 8 });
  else if (roll < 0.94) pickups.push({ x: bz.x, y: bz.y, type: 'vac' });
  else if (roll < 0.97 || orbOnFloor()) pickups.push({ x: bz.x, y: bz.y, type: 'nuke' });
  else pickups.push({ x: bz.x, y: bz.y, type: 'berserk' });
  effects.push({ type: 'boom', x: bz.x, y: bz.y - 10, radius: 40, life: 0.3, maxLife: 0.3 });
  sfx(400, 0.15, 'triangle', 0.07, -150);
}

// Sanctuary cathedral floor (Dungeon Crawl Stone Soup CC0 tiles, 32px): worn grey cobbles, the odd
// blood-soaked stone, and blood/bone decals scattered on top.
const CT = 32;
function cryptTile(ix, iy) {
  const h = hash2(ix, iy);   // unsigned: shift with >>> so indices never go negative
  if (h % 13 === 0) { const k = (h >>> 5) % 5; return k === 0 ? [7, 0] : [k - 1, 1]; }   // bloody cobbles
  return [(h >>> 4) % 7, 0];                                                           // clean cobbles
}
function drawCryptTiles(x, y, w, h, ts, ox, oy) {   // tiles of size ts covering a screen rect
  const img = SPR.crypt.base;
  const ix0 = Math.floor(ox / ts), iy0 = Math.floor(oy / ts);
  for (let iy = iy0; iy * ts - oy < h; iy++) {
    for (let ix = ix0; ix * ts - ox < w; ix++) {
      const [tx, ty] = cryptTile(ix, iy);
      ctx.drawImage(img, tx * CT, ty * CT, CT, CT, x + ix * ts - ox, y + iy * ts - oy, ts, ts);
    }
  }
}
// Act II desert: rippled sand (CC0 desert tileset), bones/stones/scrub decals, palm & ruin props
function drawDesertFloor() {
  const img = SPR.desert.base;
  const ix0 = Math.floor(camX / CT), iy0 = Math.floor(camY / CT);
  for (let iy = iy0; iy * CT - camY < H; iy++) {
    for (let ix = ix0; ix * CT - camX < W; ix++) {
      const t = (hash2(ix, iy) >>> 4) % 16;
      ctx.drawImage(img, (t % 8) * CT, (t >> 3) * CT, CT, CT, ix * CT - camX, iy * CT - camY, CT, CT);
    }
  }
  for (let iy = iy0 - 1; iy * CT - camY < H; iy++) {
    for (let ix = ix0 - 1; ix * CT - camX < W; ix++) {
      const h = hash2(ix * 7 + 3, iy * 11 + 5);
      if (h % 13) continue;
      const d = (h >>> 4) % 7, dx = ((h >>> 8) % 17) - 8, dy = ((h >>> 13) % 17) - 8;
      ctx.drawImage(img, d * CT, 128, CT, CT, ix * CT - camX + dx, iy * CT - camY + dy, CT, CT);
    }
  }
}
const DESERT_R = [8, 8, 8, 11, 15];   // palms (trunks), sandstone pillar, rock pile
// Act III jungle: DCSS grass floor; LPC Jungle trees, a giant fern and undergrowth decals
// (16 floor tiles in rows 0-1, six 80x112 props at y=64, eight 32px decals at y=176)
function drawJungleFloor() {
  const img = SPR.jungle.base;
  const ix0 = Math.floor(camX / CT), iy0 = Math.floor(camY / CT);
  for (let iy = iy0; iy * CT - camY < H; iy++) {
    for (let ix = ix0; ix * CT - camX < W; ix++) {
      const t = (hash2(ix, iy) >>> 4) % 16;
      ctx.drawImage(img, (t % 8) * CT, (t >> 3) * CT, CT, CT, ix * CT - camX, iy * CT - camY, CT, CT);
    }
  }
  for (let iy = iy0 - 1; iy * CT - camY < H; iy++) {
    for (let ix = ix0 - 1; ix * CT - camX < W; ix++) {
      const h = hash2(ix * 7 + 3, iy * 11 + 5);
      if (h % 4) continue;                       // the undergrowth is thick
      const d = (h >>> 4) % 8, dx = ((h >>> 8) % 17) - 8, dy = ((h >>> 13) % 17) - 8;
      ctx.drawImage(img, d * CT, 176, CT, CT, ix * CT - camX + dx, iy * CT - camY + dy, CT, CT);
    }
  }
}
const JUNGLE_R = [10, 12, 14, 12, 9, 14];   // tree trunks and buttress roots, then the giant fern
// Act IV seabed: same sheet layout as the jungle (16 floor tiles, six 80x112 props at y=64, decals at y=176)
function drawOceanFloor() {
  const img = SPR.ocean.base;
  const ix0 = Math.floor(camX / CT), iy0 = Math.floor(camY / CT);
  for (let iy = iy0; iy * CT - camY < H; iy++) {
    for (let ix = ix0; ix * CT - camX < W; ix++) {
      const t = (hash2(ix, iy) >>> 4) % 16;
      ctx.drawImage(img, (t % 8) * CT, (t >> 3) * CT, CT, CT, ix * CT - camX, iy * CT - camY, CT, CT);
    }
  }
  for (let iy = iy0 - 1; iy * CT - camY < H; iy++) {
    for (let ix = ix0 - 1; ix * CT - camX < W; ix++) {
      const h = hash2(ix * 7 + 3, iy * 11 + 5);
      if (h % 6) continue;
      const d = (h >>> 4) % 8, dx = ((h >>> 8) % 17) - 8, dy = ((h >>> 13) % 17) - 8;
      ctx.drawImage(img, d * CT, 176, CT, CT, ix * CT - camX + dx, iy * CT - camY + dy, CT, CT);
    }
  }
}
const OCEAN_R = [12, 12, 12, 14, 14, 16];
function drawFloor() {
  if (state.act === 4) { drawOceanFloor(); return; }
  if (state.act === 3) { drawJungleFloor(); return; }
  if (state.act === 2) { drawDesertFloor(); return; }
  drawCryptTiles(0, 0, W, H, CT, camX, camY);
  // decals: blood splatter, puddles and the odd bone
  const img = SPR.crypt.base;
  const ix0 = Math.floor(camX / CT) - 1, iy0 = Math.floor(camY / CT) - 1;
  const ix1 = Math.floor((camX + W) / CT), iy1 = Math.floor((camY + H) / CT);
  for (let iy = iy0; iy <= iy1; iy++) {
    for (let ix = ix0; ix <= ix1; ix++) {
      const h = hash2(ix * 7 + 3, iy * 11 + 5);
      if (h % 6) continue;
      const d = (h >>> 4) % 8, dx = ((h >>> 8) % 17) - 8, dy = ((h >>> 13) % 17) - 8;
      ctx.drawImage(img, d * CT, 3 * CT, CT, CT, ix * CT - camX + dx, iy * CT - camY + dy, CT, CT);
    }
  }
}

// solid props: crumbled columns, demonic statues, a sarcophagus, the blood fountain
const PROP_R = [11, 11, 14, 14, 14, 13, 16, 11];
function drawObstacle(o) {
  const x = toDX(o.x), y = toDY(o.y);
  if (x < -48 || x > W + 48 || y < -20 || y > H + 120) return;
  if (state.act >= 3) { ctx.drawImage(SPR[state.act === 4 ? 'ocean' : 'jungle'].base, (o.kind % 6) * 80, 64, 80, 112, x - 40, y - 102, 80, 112); return; }
  if (state.act === 2) { ctx.drawImage(SPR.desert.base, (o.kind % 5) * 48, 64, 48, 64, x - 24, y - 60, 48, 64); return; }
  ctx.drawImage(SPR.crypt.base, o.kind * CT, 2 * CT, CT, CT, x - CT / 2, y - CT + 6, CT, CT);
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
  hitstop: 0, lastGemT: -9, gemCombo: 0, heartT: 0, foodT: 35,
  act: 1, portalT: 0, berserkT: 0,
  ally: null, wildAxo: null, allyT: 0, inkT: 0,
};
// Act II: after this many level-ups' worth of levels a town portal carries you to the desert
const ACT2_LEVEL = 5;   // = 4 level-ups
const ACT3_LEVEL = 10;  // the jungle
const ACT4_LEVEL = 15;  // the ocean
const ACT_LEVEL = { 2: ACT2_LEVEL, 3: ACT3_LEVEL };   // Act IV (ACT4_LEVEL) is switched on once its creatures land
const ACT_NAMES = { 2: ['ACT II', 'THE BURNING SANDS'], 3: ['ACT III', 'THE STRANGLING JUNGLE'], 4: ['ACT IV', 'THE DROWNED DEPTHS'] };
const ACT_COL = { 2: '#FFDB00', 3: '#24DB24', 4: '#49DBFF' };
const ROMAN = ['', 'I', 'II', 'III', 'IV'];
const PORTAL_TIME = 1.8;

// Berserk orb (a nod to DOOM's berserk pack): 30s of invulnerability, speed and amplified powers
const BERSERK_TIME = 30;
const BERSERK = { speed: 1.75, dmg: 3, cd: 0.4 };
const amp = () => state.berserkT > 0 ? 1.5 : 1;    // area of every blast, slash and orbit
const ampN = () => state.berserkT > 0 ? 1 : 0;     // one extra projectile per volley
const orbOnFloor = () => state.berserkT > 0 || pickups.some(p => p.type === 'berserk');

// VS-style wave table: one entry per minute. `min` is the enemy-count quota —
// below it the spawner force-fills, so the screen is never quiet.
// Each minute headlines a NEW, visually distinct enemy (first type = most common).
const WAVES = [
  // the opening minutes ease you in; the quota ramps to full pressure by 5:00
  { types: ['golem'],                            min: 9,   interval: 1.3 },
  { types: ['bat', 'golem'],                     min: 14,  interval: 1.15 },
  { types: ['feral', 'skeleton', 'bat'],         min: 22,  interval: 0.95 },
  { types: ['imp', 'skeleton', 'goblin'],        min: 36,  interval: 0.7 },
  { types: ['burger', 'scarab', 'imp'],          min: 50,  interval: 0.6 },
  { types: ['banshee', 'blueslime', 'burger'],   min: 68,  interval: 0.5 },
  { types: ['shaman', 'imp', 'feral'],           min: 80,  interval: 0.45 },
  { types: ['wolf', 'redslime', 'assassin'],     min: 92,  interval: 0.42 },
  { types: ['lizdoc', 'guard', 'wolf'],          min: 105, interval: 0.4 },
  { types: ['brute', 'lizdoc', 'shaman'],        min: 120, interval: 0.36 },
  { types: ['raider', 'assassin', 'banshee', 'scarab'], min: 135, interval: 0.33 },
  { types: ['knight', 'raider', 'burger'],       min: 150, interval: 0.3 },
  { types: ['mech', 'orc', 'guard', 'bat'],      min: 165, interval: 0.28 },
  { types: ['voltslime', 'wolf', 'knight', 'assassin'], min: 185, interval: 0.26 },
  { types: ['mech', 'knight', 'wolf', 'shaman', 'lizdoc', 'banshee', 'voltslime'], min: 205, interval: 0.25 },
];
// Act II keeps the same per-minute pressure but swaps in the desert roster (scarab-led)
const ACT2_TYPES = [
  ['scarab', 'fly'],
  ['scarab', 'fly'],
  ['scarab', 'lizard', 'fly'],
  ['fly', 'scarab', 'lizard'],
  ['maggot', 'scarab', 'fly'],
  ['scarab', 'lizard', 'maggot'],
  ['scarab', 'shaman', 'fly', 'maggot'],
  ['lizard', 'wolf', 'scarab'],
  ['scarab', 'guard', 'maggot', 'fly'],
  ['fly', 'lizard', 'assassin', 'scarab'],
  ['scarab', 'banshee', 'maggot', 'lizard'],
  ['lizard', 'knight', 'scarab', 'fly'],
  ['scarab', 'mech', 'maggot', 'lizard'],
  ['scarab', 'lizard', 'maggot', 'fly', 'knight'],
  ['scarab', 'lizard', 'maggot', 'fly', 'mech', 'banshee'],
];
// Act III: the jungle. Mosquito swarms and vipers first, then man-eaters, monkeys, frogs and treants
const ACT3_TYPES = [ ['snake','mosquito'], ['snake','mosquito'], ['snake','plant','mosquito'], ['snake','monkey','mosquito'],
  ['monkey','snake','plant','mosquito'], ['frog','snake','monkey','mosquito'], ['snake','treant','frog','mosquito'],
  ['frog','monkey','plant','mosquito'], ['treant','snake','frog','mosquito'], ['monkey','treant','plant','frog'],
  ['snake','frog','monkey','banshee','mosquito'], ['treant','frog','monkey','knight','mosquito'],
  ['monkey','snake','treant','frog','plant'], ['treant','frog','monkey','snake','mosquito','plant'],
  ['frog','treant','monkey','snake','mosquito','plant','mech'] ];
// Act IV: the ocean. Piranha shoals and crabs first, then jellyfish, eels, octopuses and sharks
const ACT4_TYPES = [ ['piranha','crab'], ['piranha','crab'], ['piranha','jelly','crab'], ['crab','eel','piranha'],
  ['jelly','piranha','eel','crab'], ['octopus','piranha','crab'], ['eel','jelly','octopus','piranha'],
  ['shark','piranha','crab'], ['octopus','eel','shark','piranha'], ['jelly','shark','octopus','crab'],
  ['shark','eel','piranha','jelly','octopus'], ['octopus','shark','crab','eel','piranha'],
  ['shark','jelly','octopus','eel','crab'], ['shark','octopus','eel','jelly','piranha','crab'],
  ['shark','octopus','eel','jelly','piranha','crab','knight'] ];
function currentWave() {
  const m = Math.min(WAVES.length - 1, Math.floor(state.time / 60));
  if (state.act === 4) return { min: WAVES[m].min, interval: WAVES[m].interval, types: ACT4_TYPES[m] };
  if (state.act === 3) return { min: WAVES[m].min, interval: WAVES[m].interval, types: ACT3_TYPES[m] };
  return state.act === 2 ? { min: WAVES[m].min, interval: WAVES[m].interval, types: ACT2_TYPES[m] } : WAVES[m];
}

// map events: every 30s, alternating a converging ring and a screen-sweeping swarm
const EVENT_PERIOD = 30;

const player = {
  x: 0, y: 0, r: 14, speed: 150, hp: 100, maxHp: 100,
  regen: 0, armor: 0, magnetR: 70, dmgMult: 1, cdMult: 1,
  facing: { x: 1, y: 0 }, hurtCd: 0, fearT: 0, poisonT: 0, poisonTick: 0, color: '#FFDB00', name: '',
  sprite: 'ranger', face: 1, moving: false, animT: 0, attackAge: 99,
  critChance: 0.12, drawScale: SCALE,
  weapons: [], passives: {},
};

const enemies = [], corpses = [], bullets = [], gems = [], effects = [], texts = [], pickups = [];
const ebullets = [];   // enemy fireballs

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
      const n = 1 + Math.floor((w.level - 1) / 2) + ampN(); // 1,1,2,2,3
      const targets = nearestEnemies(n);
      if (!targets.length) return false;
      for (const t of targets) {
        const a = Math.atan2(t.y - player.y, t.x - player.x);
        bullets.push({
          x: player.x, y: player.y - 14, vx: Math.cos(a) * 560, vy: Math.sin(a) * 560,
          r: 5 * amp(), dmg: (10 + w.level * 5) * player.dmgMult, life: 1.2,
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
      const range = (85 + w.level * 15) * amp();
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
      const bolts = (1 + w.level) * (1 + ampN());
      const inRange = enemies.filter(e => dist2(e.x, e.y, player.x, player.y) < (380 * amp()) ** 2);
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
      const radius = (150 + w.level * 35) * amp();
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
  hammer: {
    name: 'Blessed Hammer',
    desc: 'Holy hammers spiral out from where you stand, smashing everything they pass.',
    cd: 1.2,
    fire(w) {
      const n = 1 + Math.floor((w.level - 1) / 2) + ampN(); // 1,1,2,2,3
      w.spin = (w.spin || 0) + 2.1;                // each cast starts at a new angle
      for (let i = 0; i < n; i++) {
        bullets.push({ kind: 'hammer', cx: player.x, cy: player.y - 10, a0: w.spin + (TAU * i) / n,
          t: 0, life: 1.35, x: player.x, y: player.y, r: (9 + w.level) * amp(),
          dmg: (14 + w.level * 7) * player.dmgMult, hit: new Set(), hitBz: new Set() });
      }
      sfx(880, 0.14, 'triangle', 0.03, 300);
      return true;
    },
  },
  sushi: {
    name: 'Exploding Sushi',
    desc: 'Lobs sushi at the nearest threats. It explodes where it lands.',
    cd: 1.5,
    fire(w) {
      const targets = nearestEnemies(6);
      if (!targets.length) return false;
      const n = 1 + Math.floor(w.level / 2) + ampN(); // 1,2,2,3,3
      for (let i = 0; i < n; i++) {
        const t = targets[i % targets.length];
        bullets.push({ kind: 'sushi', sx: player.x, sy: player.y - 14, tx: t.x + rand(-14, 14), ty: t.y + rand(-14, 14),
          t: 0, T: 0.55 + i * 0.08, x: player.x, y: player.y, h: 0, r: 0, maki: Math.random() < 0.5,
          dmg: (20 + w.level * 8) * player.dmgMult, aoe: (44 + w.level * 7) * amp(), life: 2 });
      }
      sfx(520, 0.08, 'triangle', 0.03, 260);
      return true;
    },
  },
  cards: {
    name: 'Kinetic Cards',
    desc: 'Charged playing cards that detonate on impact.',
    cd: 1.3,
    fire(w) {
      const n = 1 + Math.floor(w.level / 2) + ampN(); // 1,2,2,3,3
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU);
        bullets.push({
          x: player.x, y: player.y - 14, vx: Math.cos(a) * 340, vy: Math.sin(a) * 340,
          r: 6, dmg: (14 + w.level * 6) * player.dmgMult, life: 1.4,
          kind: 'card', aoe: (55 + w.level * 8) * amp(),
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
  { id: 'neil', name: 'Neil', sprite: 'neil', color: '#FFB66D',
    tag: 'Holy bruiser', desc: 'A regular bald, bearded bloke in a T-shirt and jeans. His Blessed Hammers spiral out and grind down crowds. Tough, a bit slow.',
    weapon: 'hammer', mods: () => { player.maxHp += 25; player.hp += 25; player.armor += 1; player.speed *= 0.94; } },
  { id: 'zoe', name: 'Zoe', sprite: 'zoe', color: '#FF49B6',
    tag: 'Sushi bomber', desc: 'Nine years old, glasses, pink tee and trainers. Lobs exploding sushi. Small, quick and fragile.',
    weapon: 'sushi', mods: () => { player.speed *= 1.1; player.magnetR *= 1.2; player.maxHp -= 20; player.hp -= 20; } },
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
// Sixteen visually distinct threats — one new face (and colour) per wave.
// move: hop = pulsing lunges, zigzag = weaving, charge = windup then rush,
//       orbit = circles you at mid range, then bleeds inward,
//       flutter = fast erratic weave (flies over props), skitter = dart-and-freeze,
//       scuttle = slow sidelong crawl, caster = keeps its distance and lobs fireballs,
//       pounce = crouch, then a long locked-direction leap,
//       blink = teleports to your flank after a puff of smoke,
//       rooted = never moves (bites and spits), slither = S-curve crawl, then a coiled strike
// healer = patches up nearby enemies; bolt = what a caster shoots; poison = touch poisons you (and dies in a toxic cloud)
// cap = most of that kind alive at once (big or ranged foes would swamp the screen)
const ENEMY_TYPES = {
  bat:      { sprite: 'bat',      name: 'BAT DEMON',       hp: 10,  speed: 115, dmg: 7,  r: 9,  xp: 1, move: 'flutter', pop: '#B692FF', fly: 14 },
  imp:      { sprite: 'imp',      name: 'DEMON IMP',       hp: 22,  speed: 96,  dmg: 11, r: 10, xp: 2, move: 'skitter', pop: '#DB2424' },
  scarab:   { sprite: 'scarab',   name: 'SCARAB DEMON',    hp: 40,  speed: 70,  dmg: 13, r: 12, xp: 3, move: 'scuttle', pop: '#FFB600' },
  shaman:   { sprite: 'shaman',   name: 'FALLEN SHAMAN',   hp: 38,  speed: 62,  dmg: 10, r: 10, xp: 4, move: 'caster',  pop: '#2492B6', cap: 8 },
  wolf:     { sprite: 'hound',    name: 'DEMON WOLF',      hp: 60,  speed: 92,  dmg: 17, r: 14, xp: 5, move: 'pounce',  pop: '#FF6D00', cap: 16 },
  guard:    { sprite: 'guard',    name: 'INFERNAL GUARD',  hp: 120, speed: 58,  dmg: 20, r: 12, xp: 6, move: 'straight', pop: '#DB4949' },
  knight:   { sprite: 'knight',   name: 'OBLIVION KNIGHT', hp: 320, speed: 44,  dmg: 30, r: 18, xp: 10, move: 'charge', pop: '#6D49B6', cap: 6 },
  feral:    { sprite: 'feral',    name: 'FERAL CAT',       hp: 16,  speed: 120, dmg: 9,  r: 9,  xp: 2, move: 'pounce',  pop: '#FF9224' },
  burger:   { sprite: 'burger',   name: 'MAN-EATING BURGER', hp: 55, speed: 78, dmg: 15, r: 12, xp: 4, move: 'hop',     pop: '#DBB66D' },
  assassin: { sprite: 'assassin', name: 'ASSASSIN',        hp: 45,  speed: 100, dmg: 20, r: 10, xp: 5, move: 'blink',   pop: '#6D49B6', cap: 10 },
  lizdoc:   { sprite: 'lizdoc',   name: 'LIZARD DOCTOR',   hp: 80,  speed: 66,  dmg: 12, r: 10, xp: 6, move: 'zigzag',  pop: '#49DB49', cap: 6, healer: true },
  fly:      { sprite: 'fly',      name: 'GIANT FLY',       hp: 14,  speed: 125, dmg: 8,  r: 9,  xp: 2, move: 'flutter', pop: '#6D6D49', fly: 12 },
  maggot:   { sprite: 'maggot',   name: 'GIANT MAGGOT',    hp: 50,  speed: 70,  dmg: 10, r: 11, xp: 4, move: 'caster',  pop: '#DBDB92', bolt: 'acid', cap: 10 },
  lizard:   { sprite: 'lizard',   name: 'LEAPING LIZARD',  hp: 30,  speed: 130, dmg: 13, r: 10, xp: 3, move: 'pounce',  pop: '#49B649', reckless: true },
  // Act III jungle
  snake:    { sprite: 'snake',    name: 'JUNGLE VIPER',    hp: 26,  speed: 115, dmg: 12, r: 9,  xp: 3, move: 'slither', pop: '#FFDB00' },
  mosquito: { sprite: 'mosquito', name: 'MOSQUITO SWARM',  hp: 5,   speed: 150, dmg: 4,  r: 6,  xp: 1, move: 'flutter', pop: '#920000', fly: 14, cap: 70, swarm: [5, 8] },
  plant:    { sprite: 'plant',    name: 'MAN-EATER',       hp: 90,  speed: 0,   dmg: 16, r: 14, xp: 6, move: 'rooted',  pop: '#B624B6', bolt: 'thorn', cap: 8 },
  monkey:   { sprite: 'monkey',   name: 'DEMON MONKEY',    hp: 34,  speed: 140, dmg: 10, r: 10, xp: 4, move: 'caster',  pop: '#DB2424', bolt: 'coconut', cap: 12 },
  frog:     { sprite: 'frog',     name: 'GIANT POISON FROG', hp: 70, speed: 95, dmg: 10, r: 15, xp: 6, move: 'hop',     pop: '#4992FF', poison: true, cap: 14, scale: 0.75 },
  treant:   { sprite: 'treant',   name: 'VINE TREANT',     hp: 260, speed: 40,  dmg: 26, r: 16, xp: 10, move: 'straight', pop: '#49B624', cap: 10 },
  banshee:  { sprite: 'banshee',  name: 'SCREAMING BANSHEE', hp: 40, speed: 82, dmg: 10, r: 10, xp: 5, move: 'banshee', pop: '#B6DBFF', fly: 10, cap: 8 },
  mech:     { sprite: 'mech',     name: 'SENTINEL MECH',   hp: 420, speed: 40,  dmg: 22, r: 18, xp: 12, move: 'caster', pop: '#2449FF', cap: 4, bolt: 'laser' },
  golem:    { sprite: 'golem',    name: 'IRON GOLEM',    hp: 10,  speed: 54,  dmg: 8,  r: 10, xp: 1, move: 'straight', pop: '#B6A48C' },
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
// key = bestiary id (kept stable so saved bestiaries survive new bosses); sorted by `at`
const BOSSES = [
  { key: 'boss0', at: 300, name: 'MINOTAUR PROTOCOL MK-I', hp: 900, speed: 50, dmg: 25, r: 40,
    xp: 50, scale: 4, variant: null, sprite: 'minotaur' },
  // the Butcher: Diablo homage. Prowls, braces, then rushes in swinging the cleaver
  { key: 'butcher', at: 450, name: 'THE BUTCHER', hp: 1800, speed: 62, dmg: 34, r: 30,
    xp: 70, scale: 4, variant: null, sprite: 'butcher', move: 'charge', intro: 'AH... FRESH MEAT!', roar: 'butcher-roar' },
  { key: 'boss1', at: 600, name: 'MINOTAUR PROTOCOL MK-II', hp: 2600, speed: 55, dmg: 32, r: 44,
    xp: 90, scale: 4, variant: 'boss2', sprite: 'minotaur' },
  { key: 'boss2', at: 840, name: 'OMEGA MINOTAUR', hp: 6500, speed: 60, dmg: 42, r: 60,
    xp: 150, scale: 6, variant: 'boss3', sprite: 'minotaur' },
];

function hpScale() {
  const m = state.time / 60;
  return 1 + m * 0.5 + m * m * 0.045; // steeper than linear — late waves must threaten
}
function dmgScale() { return 1 + (state.time / 60) * 0.06; }
function spdScale() { return 1 + (state.time / 60) * 0.02; }

function spawnRadius() { return Math.max(VW, VH) / 2 + 80; }

// ---------- bestiary: who you've met and how many you've killed ----------
// Kept in this browser's localStorage; the game works the same without it.
const BEST_KEY = 'mutant-academy-bestiary';
let bestiary = { seen: {}, kills: {} }, bestDirty = false;
try {
  const j = JSON.parse(localStorage.getItem(BEST_KEY) || 'null');
  if (j && j.seen && j.kills) bestiary = j;
} catch (e) {}
function bestSeen(k) { if (!bestiary.seen[k]) { bestiary.seen[k] = 1; bestDirty = true; } }
function bestKill(k) { bestiary.kills[k] = (bestiary.kills[k] || 0) + 1; bestiary.seen[k] = 1; bestDirty = true; }
function saveBestiary() {
  if (!bestDirty) return;
  bestDirty = false;
  try { localStorage.setItem(BEST_KEY, JSON.stringify(bestiary)); } catch (e) {}
}
setInterval(saveBestiary, 4000);
window.addEventListener('pagehide', saveBestiary);

const BEST_DESC = {
  golem: 'Clanking iron constructs that plod straight at you. Opening fodder, but they come in numbers.',
  bat: 'Erratic flier that weaves fast and flies straight over crates.',
  skeleton: 'Shambles in on a swaying zigzag. Slippery to aim at.',
  goblin: 'Quick and fragile. Runs straight at you.',
  imp: 'Darts forward, freezes, darts again. Time your shots.',
  scarab: 'Armoured beetle that crawls in sideways like a crab.',
  blueslime: 'A tougher ooze with the same lunging hops.',
  shaman: 'Keeps its distance and hurls fireballs. It stands still to cast: punish it.',
  redslime: 'Hot-tempered ooze that hits hard.',
  wolf: 'Crouches for a beat, then leaps. Sidestep the pounce.',
  guard: 'Armoured imp. Slow, tough and relentless.',
  brute: 'Prowls, freezes to wind up, then charges. Watch for the pause.',
  raider: 'Circles you at range, then darts in from the flank.',
  knight: 'A giant of living stone. Winds up, then charges through anything.',
  orc: 'Heavy charger with a brutal hit. Respect the wind-up.',
  voltslime: 'Fast, crackling ooze. Late-game swarm filler.',
  feral: 'Half-starved alley cats. Fast, fragile, and they pounce in packs.',
  burger: 'A cheeseburger that bites back. Chomps forward in hungry hops.',
  assassin: 'Stalks in, vanishes in smoke and reappears at your back. Keep moving.',
  lizdoc: 'Mad reptile surgeon. Heals every monster near it: kill it first.',
  mech: 'Heavy combat robot. Keeps its distance and fires laser bolts. Explodes.',
  boss0: 'The first protocol boss. Tramples in at 5:00. Drops a treasure chest.',
  butcher: 'Ah... fresh meat! A blood-soaked brute with a cleaver. Stalks, braces, then charges. Arrives at 7:30.',
  fly: 'Bloated desert flies the size of dogs. They swarm in fast and erratic.',
  maggot: 'Burrows under the sand, then rears up to spit acid. Hard to pin down.',
  lizard: 'Reckless desert lizardfolk. They leap at you again and again, barely pausing.',
  snake: 'A golden viper. It slithers in S-curves, coils, then strikes faster than you can blink.',
  mosquito: 'Never alone: they come in clouds of six to eight. Weak, fast and everywhere.',
  plant: 'A rooted man-eater that bursts up from the undergrowth. Bites anything in reach and spits poison thorns.',
  monkey: 'A shrieking demon ape. Keeps its distance, circles you and hurls coconuts.',
  frog: 'A giant poison dart frog. Its touch poisons you, and it bursts into a toxic cloud when it dies.',
  treant: 'A walking tangle of jungle vines. Slow, enormous and very, very hard to cut down.',
  banshee: 'A wailing ghost. Her scream hurts and leaves you terrified (slowed). Kill her before she screams.',
  boss1: 'Upgraded Minotaur with far more armour. Arrives at 10:00.',
  boss2: 'The final protocol. Three times the size. Arrives at 14:00.',
};
const firstWave = kind => { const i = WAVES.findIndex(w => w.types.includes(kind)); return i < 0 ? 99 : i; };
// the act a creature first turns up in (1 = the cathedral)
const actOf = kind => WAVES.some(w => w.types.includes(kind)) ? 1 : ACT2_TYPES.some(t => t.includes(kind)) ? 2
  : ACT3_TYPES.some(t => t.includes(kind)) ? 3 : 4;
const ACT_TABLE = { 2: () => ACT2_TYPES, 3: () => ACT3_TYPES, 4: () => ACT4_TYPES };
const firstActWave = (kind, table) => { const i = table.findIndex(t => t.includes(kind)); return i < 0 ? 99 : i; };
// every enemy in order of first appearance (act by act), then the bosses
const BEST_ENTRIES = Object.keys(ENEMY_TYPES)
  .sort((a, b) => actOf(a) - actOf(b) || firstWave(a) - firstWave(b)
    || (actOf(a) > 1 ? firstActWave(a, ACT_TABLE[actOf(a)]()) - firstActWave(b, ACT_TABLE[actOf(b)]()) : 0)
    || ENEMY_TYPES[a].hp - ENEMY_TYPES[b].hp)
  .map(k => {
    const t = ENEMY_TYPES[k];
    return { key: k, name: t.name, sheet: t.sprite, variant: null, hp: t.hp, speed: t.speed, dmg: t.dmg,
      xp: t.xp, at: firstWave(k) * 60, boss: false, act: actOf(k) };
  })
  .concat(BOSSES.map(b => ({ key: b.key, name: b.name, sheet: b.sprite, variant: b.variant,
    hp: b.hp, speed: b.speed, dmg: b.dmg, xp: b.xp, at: b.at, boss: true })));

function makeEnemy(kind, x, y, opts = {}) {
  const t = ENEMY_TYPES[kind];
  bestSeen(kind);
  const hpMul = (opts.hpMul ?? 1) * rand(0.85, 1.25);
  const hp = t.hp * hpScale() * hpMul;
  return {
    x, y, hp, maxHp: hp,
    speed: t.speed * spdScale() * rand(0.9, 1.1) * (opts.spdMul ?? 1),
    dmg: t.dmg * dmgScale(), r: Math.round(t.r * (opts.rMul ?? 1)), xp: Math.ceil(t.xp * (opts.xpMul ?? 1)),
    sprite: t.sprite, scale: (opts.scale ?? SCALE) * (t.scale ?? 1), variant: opts.variant ?? null,
    move: t.move, boss: false, elite: !!opts.elite, sweep: opts.sweep ?? null,
    flash: -1, animT: rand(0, 10), chargeT: rand(0, 4), pop: t.pop,
    orbitSign: Math.random() < 0.5 ? 1 : -1,
    kind, fly: t.fly || 0,
    castT: rand(1.5, 3), casting: 0,       // caster: cooldown, windup left
    leapCd: rand(0.5, 2), leapT: 0, crouch: 0, lx: 0, ly: 0, // pounce
    blinkCd: rand(2, 4), fade: 0, healT: rand(1, 3), bolt: t.bolt || 'fire', healer: !!t.healer,
    screamCd: rand(2, 4), screaming: 0, reckless: !!t.reckless, poison: !!t.poison, shock: !!t.shock,
  };
}
const CAST_WINDUP = 0.6, LEAP_TIME = 0.42;
// shaman fireball, mech laser, maggot acid, man-eater thorns, demon-monkey coconuts
const BOLTS = {
  fire:    { hy: 8,  spd: 150, r: 6, dmg: 1.2 },
  laser:   { hy: 30, spd: 230, r: 5, dmg: 1 },
  acid:    { hy: 18, spd: 175, r: 6, dmg: 1.2 },
  thorn:   { hy: 20, spd: 240, r: 4, dmg: 0.8, n: 3 },   // a three-thorn fan
  coconut: { hy: 22, spd: 165, r: 6, dmg: 1.1 },
  ink:     { hy: 14, spd: 170, r: 7, dmg: 0.6 },   // octopus: blots out your view
};
function shootFireball(e) {
  const B = BOLTS[e.bolt] || BOLTS.fire;
  const dx = player.x - e.x, dy = player.y - (e.y - B.hy), d = Math.hypot(dx, dy) || 1;
  if (ebullets.length > 60) return;
  const n = B.n || 1, a0 = Math.atan2(dy, dx);
  for (let i = 0; i < n; i++) {
    const a = a0 + (i - (n - 1) / 2) * 0.22;
    ebullets.push({ x: e.x + (dx > 0 ? 8 : -8), y: e.y - B.hy, vx: Math.cos(a) * B.spd, vy: Math.sin(a) * B.spd,
      r: B.r, dmg: e.dmg * B.dmg, life: 3.5, t: 0, style: e.bolt || 'fire', poison: e.bolt === 'thorn' });
  }
  if (e.bolt === 'laser') sfx(1400, 0.12, 'square', 0.03, -900);
  else if (e.bolt === 'acid') sfx(220, 0.14, 'square', 0.035, -120);
  else if (e.bolt === 'thorn') sfx(1800, 0.06, 'square', 0.025, -1200);
  else if (e.bolt === 'ink') sfx(160, 0.2, 'sine', 0.05, -80);
  else if (e.bolt === 'coconut') { sfx(520, 0.1, 'triangle', 0.04, 300); sfx(880, 0.08, 'square', 0.02, 400); }   // monkey shriek
  else sfx(330, 0.18, 'sawtooth', 0.035, -200);
}
// poison: a damage-over-time that ignores the hurt cooldown (frogs, man-eater thorns, toxic clouds)
function poisonPlayer(secs = 4) {
  if (state.berserkT > 0) return;
  if (player.poisonT <= 0) { popText(player.x, player.y - 52, 'POISONED!', '#92FF24'); sfx(180, 0.25, 'square', 0.04, -60); }
  player.poisonT = Math.max(player.poisonT || 0, secs);
}
// man-eaters erupt from the undergrowth a short way off, ahead of you more often than not
function rootedSpot(e) {
  const fa = Math.atan2(player.facing.y, player.facing.x);
  const a = Math.random() < 0.6 ? fa + rand(-0.9, 0.9) : rand(0, TAU), d = rand(150, 240);
  e.x = player.x + Math.cos(a) * d; e.y = player.y + Math.sin(a) * d;
  resolveObstacles(e);
  burstParticles(e.x, e.y, '#246D00', 8);
  burstParticles(e.x, e.y, '#6D4924', 5);
}
let lastScreamSnd = -9;
function bansheeScream(e, d) {
  effects.push({ type: 'scream', x: e.x, y: e.y - 16, radius: 150, life: 0.55, maxLife: 0.55 });
  if (uiTime - lastScreamSnd > 1.3) { lastScreamSnd = uiTime; playSample('banshee-scream', 0.55); }
  if (d < 150) {
    hurtPlayer(e.dmg * 1.4);
    if (player.fearT <= 0) popText(player.x, player.y - 52, 'TERRIFIED!', '#B6DBFF');
    player.fearT = 1.6;
    state.shake = Math.max(state.shake, 4);
  }
}
const countKind = kind => { let n = 0; for (const e of enemies) if (e.kind === kind) n++; return n; };

const seenTypes = new Set();
function announceType(kind) {
  if (seenTypes.has(kind)) return;
  seenTypes.add(kind);
  if (kind === 'golem') return; // opening fodder needs no fanfare
  announce(`NEW THREAT: ${ENEMY_TYPES[kind].name}`, C.orange, 2.0, 2);
  sfx(160, 0.35, 'sawtooth', 0.07, 60);
}

function pickWeighted(types) {
  return Math.random() < 0.55 ? types[0] : pick(types);
}

function spawnEnemy(kind) {
  if (enemies.length > 500) return;
  const cap = ENEMY_TYPES[kind].cap;
  if (cap && countKind(kind) >= cap) {   // at its cap: send uncapped wave fodder instead
    kind = currentWave().types.find(k => !ENEMY_TYPES[k].cap);
    if (!kind) return;
  }
  announceType(kind);
  const a = rand(0, TAU), d = spawnRadius();
  const x = player.x + Math.cos(a) * d, y = player.y + Math.sin(a) * d;
  const sw = ENEMY_TYPES[kind].swarm;
  if (sw) {   // mosquitoes and piranhas never come alone
    const n = randInt(sw[0], sw[1]);
    for (let i = 0; i < n; i++) enemies.push(makeEnemy(kind, x + rand(-30, 30), y + rand(-30, 30)));
    return;
  }
  const e = makeEnemy(kind, x, y);
  if (e.move === 'rooted') rootedSpot(e);
  enemies.push(e);
}

function spawnElite() {
  const wave = currentWave();
  // only sheets with a baked elite palette (the oversized wolf/knight never go 2x)
  const ok = wave.types.filter(k => SPR[SHEETS[ENEMY_TYPES[k].sprite].file].elite);
  const kind = pick(ok.length ? ok : ['skeleton']);
  const a = rand(0, TAU), d = spawnRadius();
  const e = makeEnemy(kind, player.x + Math.cos(a) * d, player.y + Math.sin(a) * d,
    { hpMul: 12, xpMul: 6, scale: SCALE * 2, rMul: 1.8, spdMul: 0.85, elite: true, variant: 'elite' });
  enemies.push(e);
  announce(`ELITE ${ENEMY_TYPES[kind].name}!`, C.gold, 2.0, 3);
}

// ring event: a circle of weak fodder closes in — carve your way out
function spawnRing() {
  const wave = currentWave();
  const kind = wave.types.find(k => !ENEMY_TYPES[k].cap); // no rings of casters/knights
  const n = clamp(24 + Math.floor(state.time / 60) * 6, 24, 42), d = Math.min(VW, VH) / 2 + 60; // small rings early
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
    const e = makeEnemy(['skeleton', 'skeleton', 'fly', 'mosquito', 'piranha'][state.act], cx + px * i * 34 + rand(-10, 10), cy + py * i * 34 + rand(-10, 10),
      { hpMul: 0.06, xpMul: 1, spdMul: 1 });
    e.sweep = { vx: dirX * spd, vy: dirY * spd, life: 14 };
    enemies.push(e);
  }
  announce('HORDE INCOMING!', C.cyan, 1.6, 3);
  sfx(180, 0.5, 'sawtooth', 0.07, 120);
}

function startBerserk() {
  if (state.berserkT <= 0) {           // stacking orbs refills the clock; the boosts apply once
    player.speed *= BERSERK.speed; player.dmgMult *= BERSERK.dmg; player.cdMult *= BERSERK.cd;
    for (const w of player.weapons) w.timer = Math.min(w.timer || 0, 0.05);   // unleash everything now
  }
  state.berserkT = BERSERK_TIME;
  player.hp = player.maxHp;            // like the pack it's named after: full health too
  player.fearT = 0; player.poisonT = 0;
  state.flash = 1; state.shake = 16; state.hitstop = Math.max(state.hitstop, 0.15);
  announce('BERSERK!', C.red, 2.4, 5, 'RIP AND TEAR');
  burstParticles(player.x, player.y - 14, '#FF2400', 30);
  effects.push({ type: 'nova', x: player.x, y: player.y, radius: 260, life: 0.5, maxLife: 0.5 });
  sndBerserk();
}
function endBerserk() {
  state.berserkT = 0;
  player.speed /= BERSERK.speed; player.dmgMult /= BERSERK.dmg; player.cdMult /= BERSERK.cd;
  player.hurtCd = Math.max(player.hurtCd, 1.2);   // a moment's grace as the rage fades
  announce('THE RAGE FADES', C.grey, 1.4, 3);
  sfx(330, 0.6, 'sawtooth', 0.05, -250);
}
// berserk stinger: detuned FM power-chord stabs over a noise crash and a rising roar
function sndBerserk() {
  try {
    if (muted || !audioCtx) return;
    const t = audioCtx.currentTime + 0.02;
    noiseHit(t, 0.18, 0.25);
    beep(t, 55, 0.9, 'sawtooth', 0.09, 110);
    const stabs = [[0, 82.4], [0.13, 82.4], [0.26, 98], [0.39, 82.4], [0.52, 110], [0.65, 116.5]];
    for (const [dt, f] of stabs) {
      fm(t + 0.1 + dt, f, 0.12, 0.09, 1, 5, 0.1, true);
      fm(t + 0.1 + dt, f * 1.498, 0.12, 0.06, 1, 4, 0.1, true);   // the fifth
      fm(t + 0.1 + dt, f * 2.01, 0.12, 0.04, 2, 3, 0.08, true);
      noiseHit(t + 0.1 + dt, 0.05, 0.1);
    }
  } catch (e) {}
}
// ---- the axolotl mercenary (Act IV): one waits somewhere on the seabed now and then; swim up to it
// and it signs on for ALLY_TIME seconds, hunting the nearest threat with bites and bubble shots
const ALLY_TIME = 45;
function updateAxolotl(dt) {
  if (!state.ally && !state.wildAxo) {
    state.allyT -= dt;
    if (state.allyT <= 0) {
      const a = rand(0, TAU), d = rand(220, 300);
      state.wildAxo = { x: player.x + Math.cos(a) * d, y: player.y + Math.sin(a) * d, r: 12, animT: 0, life: 45 };
      resolveObstacles(state.wildAxo);
      announce('AN AXOLOTL WANTS TO HELP!', '#FF92DB', 2.2, 3, 'FIND IT AND IT WILL FIGHT FOR YOU');
      sfx(1200, 0.08, 'sine', 0.04, 600); setTimeout(() => sfx(1500, 0.1, 'sine', 0.04, 700), 110);
    }
  }
  const w = state.wildAxo;
  if (w) {
    w.animT += dt; w.life -= dt;
    if (dist2(w.x, w.y, player.x, player.y) < 44 * 44) hireAxolotl();
    else if (w.life <= 0) { burstParticles(w.x, w.y, '#B6DBFF', 8); state.wildAxo = null; state.allyT = rand(20, 30); }
  }
  const al = state.ally;
  if (!al) return;
  al.t -= dt; al.animT += dt; al.cd -= dt; al.biteCd -= dt; al.attackAge += dt;
  let tgt = null, best = 280 * 280;
  for (const e of enemies) {
    if (e.sweep) continue;
    const q = dist2(e.x, e.y, al.x, al.y);
    if (q < best && dist2(e.x, e.y, player.x, player.y) < 320 * 320) { best = q; tgt = e; }
  }
  // hunt the target, or swim back to heel at the hero's side
  const gx = tgt ? tgt.x : player.x - player.face * 46, gy = tgt ? tgt.y : player.y + 12;
  const dx = gx - al.x, dy = gy - al.y, d = Math.hypot(dx, dy) || 1;
  const spd = (tgt ? 240 : 210) * Math.min(1, d / 50);
  al.moving = d > 6;
  if (al.moving) { al.x += dx / d * spd * dt; al.y += dy / d * spd * dt; }
  if (Math.abs(dx) > 3) al.face = dx < 0 ? -1 : 1;
  if (dist2(al.x, al.y, player.x, player.y) > 420 * 420) {   // never lost: pops back beside you
    al.x = player.x - player.face * 46; al.y = player.y + 12;
    burstParticles(al.x, al.y - 8, '#B6DBFF', 8);
  }
  const power = (1 + state.level * 0.08) * player.dmgMult;
  if (tgt && best < (tgt.r + 16) ** 2 && al.biteCd <= 0) {
    damageEnemy(tgt, 22 * power);
    al.biteCd = 0.45; al.attackAge = 0;
    sfx(700, 0.05, 'square', 0.025, -300);
  } else if (tgt && al.cd <= 0 && best > 60 * 60) {
    const a = Math.atan2(tgt.y - (al.y - 8), tgt.x - al.x);
    bullets.push({ kind: 'bubble', x: al.x, y: al.y - 8, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300,
      r: 6, dmg: 14 * power, life: 1.3, pierce: 1 });
    al.cd = 0.8 * player.cdMult; al.attackAge = 0;
    sfx(600, 0.08, 'sine', 0.03, 700);
  }
  if (al.t <= 0) {
    burstParticles(al.x, al.y - 8, '#FF92DB', 12);
    announce('THE AXOLOTL SWIMS OFF', '#FF92DB', 1.6, 2, 'IT MAY COME BACK...');
    state.ally = null; state.allyT = rand(35, 55);
  }
}
function hireAxolotl() {
  const w = state.wildAxo;
  state.ally = { x: w.x, y: w.y, t: ALLY_TIME, animT: 0, cd: 0.3, biteCd: 0, attackAge: 9, face: 1, moving: false };
  state.wildAxo = null;
  burstParticles(w.x, w.y - 8, '#FF92DB', 16);
  announce('AXOLOTL JOINS YOU!', '#FF92DB', 2.2, 4, `MERCENARY FOR ${ALLY_TIME} SECONDS`);
  jingle([784, 988, 1175, 1568], 0.08, 0.05);
}
function openPortal() {
  state.portalT = PORTAL_TIME;
  announce('A PORTAL OPENS...', C.cyan, 1.6, 4);
  sfx(220, 1.4, 'sine', 0.07, 660);
  sfx(330, 1.4, 'triangle', 0.04, 990);
}
function enterAct(n) {
  state.act = n;
  state.portalT = -1;                       // done: never reopens
  // bosses and elites follow you through; the rest of the old act's rabble stays behind
  const followers = enemies.filter(e => e.boss || e.elite);
  enemies.length = 0; ebullets.length = 0; corpses.length = 0;
  for (const e of followers) {
    const a = rand(0, TAU), d = spawnRadius();
    e.x = player.x + Math.cos(a) * d; e.y = player.y + Math.sin(a) * d;
    enemies.push(e);
  }
  brazierDead.clear(); brazierDamageMap.clear();
  state.spawnTimer = 1.2;
  state.flash = 1;
  state.shake = 6;
  banners.length = 0;                       // stale "new threat" news from the old act
  announce(ACT_NAMES[n][0], ACT_COL[n], 3, 5, ACT_NAMES[n][1]);
  state.allyT = rand(20, 30);               // the ocean's axolotl turns up a little after you arrive
  music.song = n; music.step = 0;           // each act's theme starts from its intro
  sfx(880, 0.5, 'sine', 0.06, -500);
}
function spawnBoss(def) {
  const a = rand(0, TAU);
  const d = Math.max(VW, VH) / 2 + 100;
  bestSeen(def.key);
  enemies.push({
    bestKey: def.key, kind: def.key,
    x: player.x + Math.cos(a) * d, y: player.y + Math.sin(a) * d,
    hp: def.hp, maxHp: def.hp, speed: def.speed, dmg: def.dmg, r: def.r,
    xp: def.xp, sprite: def.sprite, scale: def.scale, variant: def.variant,
    boss: true, name: def.name, flash: -1, animT: rand(0, 10), pop: def.sprite === 'butcher' ? '#B60000' : '#FF9200',
    move: def.move, chargeT: 0, orbitSign: 1, fly: 0,
  });
  announce(def.intro || 'WARNING!', C.red, 2.6, 5, def.name, true);
  sndBoss();
  if (def.roar) playSample(def.roar, 0.9);
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
  bestKill(e.boss ? e.bestKey : e.kind);
  trackStreak();
  corpses.push({ sprite: e.sprite, scale: e.scale, variant: e.variant,
    x: e.x, groundY: groundYOf(e), flip: player.x < e.x, animT: 0 });
  burstParticles(e.x, e.y - e.r * 0.5, e.pop || '#B66D24', e.boss ? 26 : e.elite ? 16 : 8);
  if (e.poison) {   // poison frogs burst into a lingering toxic cloud
    effects.push({ type: 'toxic', x: e.x, y: e.y, radius: e.elite ? 80 : 46, life: 3, maxLife: 3 });
    burstParticles(e.x, e.y - 8, '#92FF24', 10);
    sfx(140, 0.3, 'square', 0.04, -60);
  }
  if (e.kind === 'mech') {   // mechs go out with a bang
    effects.push({ type: 'boom', x: e.x, y: e.y - 20, radius: 46, life: 0.35, maxLife: 0.35 });
    burstParticles(e.x, e.y - 24, '#FF9200', 14);
    state.shake = Math.max(state.shake, 6);
    sfx(80, 0.4, 'sawtooth', 0.08, -40);
  }
  if (e.boss || e.elite) {
    state.hitstop = Math.max(state.hitstop, 0.12); // big kill, big freeze-frame
    for (let g = 0; g < 8; g++) {
      const a = rand(0, TAU), d = rand(10, 60);
      gems.push({ x: e.x + Math.cos(a) * d, y: e.y + Math.sin(a) * d, v: Math.ceil(e.xp / 8) });
    }
    pickups.push({ x: e.x, y: e.y, type: 'chest' }); // jackpot time
    if (e.elite && Math.random() < 0.5) pickups.push({ x: e.x + 22, y: e.y + 6, type: 'food', food: rollFood(true) });
    if (!orbOnFloor() && (e.boss || Math.random() < 0.3)) pickups.push({ x: e.x - 22, y: e.y + 6, type: 'berserk' });
    state.shake = 8;
  } else {
    gems.push({ x: e.x, y: e.y, v: e.xp });
    const r = Math.random();
    if (r < 0.04) pickups.push({ x: e.x + rand(-8, 8), y: e.y + rand(-8, 8), type: 'gold', v: randInt(5, 15) });
    else if (r < 0.046 && !e.sweep) pickups.push({ x: e.x + rand(-8, 8), y: e.y + rand(-8, 8), type: 'food', food: rollFood() });
    else if (r < 0.0472 && state.time > 45 && !orbOnFloor()) pickups.push({ x: e.x, y: e.y, type: 'berserk' });   // rare: ~1 in 830 kills
    if (gems.length > 450) {
      const old = gems.shift();
      gems[Math.floor(Math.random() * gems.length)].v += old.v;
    }
  }
}

function groundYOf(e) { return e.y + e.r * 0.9; }

// ---------- player damage / xp ----------
function hurtPlayer(dmg) {
  if (player.hurtCd > 0 || state.berserkT > 0) return;
  const taken = Math.max(1, dmg - player.armor);
  player.hp -= taken;
  player.hurtCd = 0.5;
  state.shake = Math.max(state.shake, 5);
  popNum(player.x, player.y - 40, '-' + Math.round(taken), false, C.red);
  hurtVoice(player.heroId);
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
let selIndex = 0, titleSel = 0, bestSel = 0;
let tally = null;
function openBestiary() { scene = 'bestiary'; saveBestiary(); sndOk(); }
function closeBestiary() { scene = 'title'; sndMove(); }
let bootError = '';
function toSelect() {
  scene = 'select';
  startMusic();
  sndOk();
}
function startGame(h) {
  player.name = h.name;
  player.heroId = h.id;
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
  saveBestiary();
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
  if (scene === 'title') {
    if (k === 'arrowup' || k === 'w' || k === 'arrowdown' || k === 's') { titleSel ^= 1; sndMove(); }
    else if (k === 'b') openBestiary();
    else if (OK_KEYS.has(k)) { if (titleSel === 1) openBestiary(); else toSelect(); }
    return;
  }
  if (scene === 'bestiary') {
    const n = BEST_ENTRIES.length, cols = bestLayout().cols;
    if (k === 'arrowleft' || k === 'a') { bestSel = (bestSel + n - 1) % n; sndMove(); }
    else if (k === 'arrowright' || k === 'd') { bestSel = (bestSel + 1) % n; sndMove(); }
    else if (k === 'arrowup' || k === 'w') { bestSel = (bestSel - cols + n * cols) % n; sndMove(); }
    else if (k === 'arrowdown' || k === 's') { bestSel = (bestSel + cols) % n; sndMove(); }
    else if (k === 'escape' || k === 'backspace' || k === 'b' || OK_KEYS.has(k)) closeBestiary();
    return;
  }
  if (scene === 'select') {
    const n = HEROES.length;
    if (k === 'arrowleft' || k === 'a') { selIndex = (selIndex + n - 1) % n; sndMove(); }
    else if (k === 'arrowright' || k === 'd') { selIndex = (selIndex + 1) % n; sndMove(); }
    else if (k === 'arrowup' || k === 'w') { selIndex = (selIndex + n - SEL_COLS) % n; sndMove(); }
    else if (k === 'arrowdown' || k === 's') { selIndex = (selIndex + SEL_COLS) % n; sndMove(); }
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
  if (kind === 'back') { if (down) closeBestiary(); return; }
  if (kind === 'title') {
    if (i === titleSel) { if (down) uiKey('enter'); }
    else { titleSel = i; sndMove(); if (down) uiKey('enter'); }   // a tap on an item means it
    return;
  }
  if (kind === 'best') {
    if (i !== bestSel) { bestSel = i; sndMove(); }
    return;
  }
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
    if (id && /^(hero|row|title|best):/.test(id)) onHit(id, false);
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

  // Act II: the town portal opens once you've levelled enough, then carries you through
  if (ACT_LEVEL[state.act + 1] && state.level >= ACT_LEVEL[state.act + 1] && state.portalT <= 0) openPortal();
  if (state.portalT > 0) {
    state.portalT -= dt;
    player.hurtCd = Math.max(player.hurtCd, 0.2);              // safe while stepping through
    if (Math.random() < 0.6) burstParticles(player.x + rand(-14, 14), player.y + rand(-10, 20), Math.random() < 0.5 ? '#49B6FF' : '#DBFFFF', 1);
    if (state.portalT <= 0) enterAct(state.act + 1);
  }

  // VS-style wave spawner: keep the quota filled, then trickle one of each type
  const wave = currentWave();
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0 && state.portalT <= 0) {
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
  if (eventDue >= state.eventsFired && state.time > 45 && state.portalT <= 0) {
    state.eventsFired = eventDue + 1;
    if (eventDue % 2 === 0) spawnRing(); else spawnSweep();
  }
  // one elite per minute from 1:30 — walking chest with a health bar
  const eliteDue = Math.floor((state.time - 90) / 60);
  if (state.time > 90 && eliteDue >= state.elitesSpawned && state.portalT <= 0) {
    state.elitesSpawned = eliteDue + 1;
    spawnElite();
  }
  while (state.portalT <= 0 && state.bossesSpawned < BOSSES.length && state.time >= BOSSES[state.bossesSpawned].at) {
    spawnBoss(BOSSES[state.bossesSpawned]);
    state.bossesSpawned++;
  }
  // a snack turns up on the floor nearby every 40-55s (never more than 4 lying around)
  state.foodT -= dt;
  if (state.foodT <= 0) {
    state.foodT = rand(40, 55);
    if (pickups.filter(p => p.type === 'food').length < 4) {
      const a = rand(0, TAU), d = rand(110, 190);
      const p = { x: player.x + Math.cos(a) * d, y: player.y + Math.sin(a) * d, r: 10, type: 'food', food: rollFood() };
      resolveObstacles(p);
      pickups.push(p);
      effects.push({ type: 'boom', x: p.x, y: p.y, radius: 16, life: 0.3, maxLife: 0.3 });
    }
  }

  // player movement + animation clocks
  const { mx, my } = moveInput();
  player.fearT = Math.max(0, (player.fearT || 0) - dt);
  state.inkT = Math.max(0, state.inkT - dt);
  if (state.act === 4) updateAxolotl(dt);
  for (const fx of effects) {
    if (fx.type === 'toxic' && fx.life > 0.4 && dist2(fx.x, fx.y, player.x, player.y) < (fx.radius + player.r * 0.5) ** 2) poisonPlayer(2);
  }
  if (player.poisonT > 0) {
    player.poisonT -= dt;
    player.poisonTick -= dt;
    if (state.berserkT > 0) player.poisonT = 0;
    else if (player.poisonTick <= 0) {
      player.poisonTick = 0.5;
      const dmg = Math.max(1, Math.round(player.maxHp * 0.015));
      player.hp -= dmg;
      popNum(player.x + rand(-8, 8), player.y - 36, '-' + dmg, false, '#92FF24');
      burstParticles(player.x, player.y - 10, '#92FF24', 2);
      if (player.hp <= 0) endGame(false);
    }
  }
  if (state.berserkT > 0) {
    const was = state.berserkT;
    state.berserkT -= dt;
    if (state.berserkT <= 3 && Math.ceil(state.berserkT) < Math.ceil(was)) sfx(880, 0.08, 'square', 0.04);   // last 3s: tick, tick, tick
    if (Math.random() < 0.5) burstParticles(player.x + rand(-10, 10), player.y + rand(-24, 12), Math.random() < 0.6 ? '#FF2400' : '#FFB600', 1);
    if (state.berserkT <= 0) endBerserk();
    state.trailT = (state.trailT || 0) - dt;
    if (state.trailT <= 0) {
      state.trailT = 0.05;
      state.trail = (state.trail || []).slice(-5);
      if (player.moving) state.trail.push({ x: player.x, y: player.y, flip: player.face < 0, frame: animFrame(player.animT, 'walk', player.sprite) });
      else state.trail.shift();
    }
  } else state.trail = [];
  const spd = player.speed * (player.fearT > 0 && state.berserkT <= 0 ? 0.55 : 1);   // banshee terror slows you
  player.x += mx * spd * dt;
  player.y += my * spd * dt;
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
      const count = 1 + w.level + ampN() * 2;
      const radius = (70 + w.level * 10) * amp();
      const spd = (2.4 + w.level * 0.25) * (1 + ampN());
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
      if (canHit) w.tick = 0.25 * player.cdMult;
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
    if (b.kind === 'hammer' || b.kind === 'sushi') {
      if (updateSpecialBullet(b, dt)) { bullets[i] = bullets[bullets.length - 1]; bullets.pop(); }
      continue;
    }
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
      } else if (e.move === 'flutter') {
        // erratic bat flight: fast double-frequency weave
        const sway = Math.sin(e.animT * 7 + e.orbitSign) * 0.8 + Math.sin(e.animT * 2.3) * 0.4;
        const nx = px - py * sway, ny = py + px * sway;
        const nl = Math.hypot(nx, ny) || 1;
        px = nx / nl; py = ny / nl;
      } else if (e.move === 'skitter') {
        spd *= Math.sin(e.animT * 6 + e.orbitSign) > -0.3 ? 1.35 : 0.1; // dart... freeze... dart
      } else if (e.move === 'scuttle') {
        const sway = Math.sin(e.animT * 1.4) * 0.45 * e.orbitSign;   // crab-like sidelong crawl
        const nx = px - py * sway, ny = py + px * sway;
        const nl = Math.hypot(nx, ny) || 1;
        px = nx / nl; py = ny / nl;
      } else if (e.move === 'caster') {
        // hold the 150-230 band, strafing; stand still to cast
        if (d < 150) { px = -px; py = -py; spd *= 0.7; }
        else if (d < 230) {
          const tx = -py * e.orbitSign, ty = px * e.orbitSign;
          px = tx; py = ty; spd *= 0.4;
        }
        e.castT -= dt;
        if (e.casting > 0) {
          spd = 0;
          e.casting -= dt;
          if (e.casting <= 0) shootFireball(e);
        } else if (e.castT <= 0 && d < 330) {
          e.casting = CAST_WINDUP;
          e.castT = rand(2.4, 3.2);
        }
      } else if (e.move === 'banshee') {
        // slow wailing drift; inside 170 she stops, shudders, then SCREAMS
        const sway = Math.sin(e.animT * 2.2 + e.orbitSign) * 0.9;
        const nx = px - py * sway, ny = py + px * sway, nl = Math.hypot(nx, ny) || 1;
        px = nx / nl; py = ny / nl;
        e.screamCd -= dt;
        if (e.screaming > 0) {
          spd = 0;
          e.screaming -= dt;
          if (e.screaming <= 0) bansheeScream(e, d);
        } else if (e.screamCd <= 0 && d < 170) {
          e.screaming = 0.55;
          e.screamCd = rand(4, 6);
        }
      } else if (e.move === 'blink') {
        // stalk in, then vanish in smoke and reappear at your flank
        e.blinkCd -= dt;
        if (e.blinkCd <= 0 && d < 260 && d > 70) {
          burstParticles(e.x, e.y - 10, '#6D49B6', 6);
          const back = Math.atan2(-player.facing.y, -player.facing.x) + rand(-1, 1);
          e.x = player.x + Math.cos(back) * 75; e.y = player.y + Math.sin(back) * 75;
          burstParticles(e.x, e.y - 10, '#B692FF', 6);
          e.fade = 0.3; e.blinkCd = rand(3, 4.5);
          sfx(900, 0.08, 'square', 0.025, -600);
        }
        if (e.fade > 0) { e.fade -= dt; spd = 0; }
      } else if (e.move === 'rooted') {
        // man-eater: never moves; snaps at anything in reach and spits poison thorns
        spd = 0;
        e.castT -= dt;
        if (e.casting > 0) {
          e.casting -= dt;
          if (e.casting <= 0) shootFireball(e);
        } else if (e.castT <= 0 && d < 280 && d > 50) {
          e.casting = CAST_WINDUP;
          e.castT = rand(2.2, 3.0);
        }
      } else if (e.move === 'slither') {
        // viper: S-curve slither, then a coiled pause and a lightning strike
        e.leapCd -= dt;
        if (e.leapT > 0) {
          e.leapT -= dt;
          px = e.lx; py = e.ly; spd *= 2.4;
        } else if (e.crouch > 0) {
          e.crouch -= dt;
          spd = 0;
          if (e.crouch <= 0) { e.leapT = LEAP_TIME; e.lx = px; e.ly = py; sfx(1100, 0.08, 'sawtooth', 0.02, -700); }
        } else {
          const sway = Math.sin(e.animT * 5 + e.orbitSign) * 0.85;
          const nx = px - py * sway, ny = py + px * sway, nl = Math.hypot(nx, ny) || 1;
          px = nx / nl; py = ny / nl;
          if (e.leapCd <= 0 && d < 100) { e.crouch = 0.22; e.leapCd = rand(1.5, 2.2); spd = 0; }
        }
      } else if (e.move === 'pounce') {
        e.leapCd -= dt;
        if (e.leapT > 0) {                     // mid-air: locked heading, no steering
          e.leapT -= dt;
          px = e.lx; py = e.ly; spd *= e.reckless ? 3.6 : 3.2;
        } else if (e.crouch > 0) {             // telegraph: freeze for a beat
          e.crouch -= dt;
          spd = 0;
          if (e.crouch <= 0) { e.leapT = LEAP_TIME; e.lx = px; e.ly = py; }
        } else if (e.leapCd <= 0 && d < (e.reckless ? 230 : 160)) {
          e.crouch = e.reckless ? 0.12 : 0.28;
          e.leapCd = e.reckless ? rand(0.8, 1.2) : rand(2.0, 2.6);
          spd = 0;
        }
      }
      e.x += px * spd * dt;
      e.y += py * spd * dt;
    }
    if (e.healer) {   // lizard doctor: patches up everything nearby every 3s
      e.healT -= dt;
      if (e.healT <= 0) {
        e.healT = 3;
        let n = 0;
        for (const o of enemies) {
          if (o === e || o.boss || o.hp >= o.maxHp || dist2(o.x, o.y, e.x, e.y) > 110 * 110) continue;
          o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.25);
          if (n++ < 6) burstParticles(o.x, o.y - o.r, '#24DB24', 3);
        }
        if (n) effects.push({ type: 'heal', x: e.x, y: e.y, radius: 110, life: 0.35, maxLife: 0.35 });
      }
    }
    if (d < e.r + player.r) {
      if (state.berserkT > 0) {   // berserk: you are the hazard now — touching things hurts THEM
        e.ramT = (e.ramT || 0) - dt;
        if (e.ramT <= 0) {
          e.ramT = 0.2;
          damageEnemy(e, 25 * player.dmgMult);
          const k = 26 / Math.max(1, d);
          e.x += (e.x - player.x) * k; e.y += (e.y - player.y) * k;
        }
      } else {
        hurtPlayer(e.dmg);
        if (e.poison) poisonPlayer();
        if (e.shock && state.berserkT <= 0) {   // jellyfish and eels: a jolt that leaves you sluggish
          if (player.fearT <= 0.2) { popText(player.x, player.y - 52, 'ZAPPED!', '#FFFF49'); effects.push({ type: 'bolt', x: player.x, y: player.y, life: 0.18, maxLife: 0.18 }); sfx(1600, 0.12, 'sawtooth', 0.03, -1200); }
          player.fearT = Math.max(player.fearT, 0.9);
        }
      }
    }
    // never despawn — like VS, stragglers teleport to a fresh angle and rejoin the hunt
    if (e.move === 'rooted' && !e.elite && d > Math.max(VW, VH) * 0.9) rootedSpot(e);
    else if (!e.boss && !e.sweep && d > Math.max(VW, VH) * 1.2) {
      const a = rand(0, TAU), sd = spawnRadius();
      e.x = player.x + Math.cos(a) * sd;
      e.y = player.y + Math.sin(a) * sd;
    }
    // solid obstacles push enemies out (fliers pass over)
    if (!e.fly) resolveObstacles(e);
  }
  resolveObstacles(player);

  // enemy fireballs: fly straight, burn on contact, fizzle on props
  for (let i = ebullets.length - 1; i >= 0; i--) {
    const b = ebullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; b.t += dt;
    let dead = b.life <= 0;
    if (!dead && dist2(b.x, b.y, player.x, player.y) < (player.r + b.r) ** 2) {
      hurtPlayer(b.dmg);
      if (b.poison) poisonPlayer(2.5);
      if (b.style === 'ink' && state.berserkT <= 0) {
        if (state.inkT <= 0) popText(player.x, player.y - 52, 'INKED!', '#9292DB');
        state.inkT = 2.6;
      }
      burstParticles(b.x, b.y, b.style === 'coconut' ? '#924900' : b.style === 'thorn' ? '#49B600' : '#FF9200', 5);
      dead = true;
    }
    if (!dead) {
      for (const o of state.obsList || []) {
        if (dist2(o.x, o.y, b.x, b.y) < (o.r + b.r) ** 2) { dead = true; break; }
      }
    }
    if (dead) { ebullets[i] = ebullets[ebullets.length - 1]; ebullets.pop(); }
  }

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
    // food waits on the floor until you actually need it
    if (p.type === 'food' && player.hp >= player.maxHp && player.poisonT <= 0) continue;
    pickups.splice(i, 1);
    if (p.type === 'food') {
      const f = FOOD[p.food];
      const gain = Math.min(player.maxHp - player.hp, Math.round(player.maxHp * f.heal));
      player.hp += gain;
      player.poisonT = 0;   // any food settles the poison
      popText(player.x, player.y - 44, `${f.name} +${gain}`, C.green);
      burstParticles(p.x, p.y - 4, f.col, p.food === 'medkit' ? 14 : 8);
      sfx(440, 0.09, 'square', 0.05, 220);
      setTimeout(() => sfx(660, 0.12, 'square', 0.05, 330), 80);
      if (p.food === 'medkit') {
        setTimeout(() => sfx(990, 0.18, 'square', 0.05, 200), 170);
        state.flash = Math.max(state.flash, 0.2);
      }
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
      ebullets.length = 0;
    } else if (p.type === 'chest') {
      pushMenu({ type: 'chest' });
    } else if (p.type === 'berserk') {
      startBerserk();
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

// Blessed Hammer: a widening spiral around the cast point; pierces, hits each target once.
// Exploding Sushi: lobbed in an arc, detonates where it lands. Returns true when finished.
function updateSpecialBullet(b, dt) {
  b.t += dt;
  if (b.kind === 'hammer') {
    const rr = 8 + 100 * b.t, ang = b.a0 + 5.2 * b.t;
    b.x = b.cx + Math.cos(ang) * rr;
    b.y = b.cy + Math.sin(ang) * rr * 0.85;
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      if (!e || b.hit.has(e) || dist2(e.x, e.y, b.x, b.y) >= (e.r + b.r) ** 2) continue;
      b.hit.add(e);
      damageEnemy(e, b.dmg);
    }
    for (const bz of state.brazList || []) {
      if (!b.hitBz.has(bz.key) && dist2(bz.x, bz.y, b.x, b.y) < (14 + b.r) ** 2) { b.hitBz.add(bz.key); damageBrazier(bz, 10); }
    }
    return b.t >= b.life;
  }
  // sushi
  const p = Math.min(1, b.t / b.T);
  b.x = b.sx + (b.tx - b.sx) * p;
  b.y = b.sy + (b.ty - b.sy) * p;
  b.h = Math.sin(p * Math.PI) * (36 + Math.hypot(b.tx - b.sx, b.ty - b.sy) * 0.15);
  if (p < 1) return false;
  effects.push({ type: 'boom', x: b.x, y: b.y, radius: b.aoe, life: 0.3, maxLife: 0.3 });
  burstParticles(b.x, b.y, '#FFFFFF', 6);               // rice
  burstParticles(b.x, b.y, b.maki ? '#24DB49' : '#FF6D49', 5);
  for (let j = enemies.length - 1; j >= 0; j--) {
    const e = enemies[j];
    if (e && dist2(e.x, e.y, b.x, b.y) < (b.aoe + e.r) ** 2) damageEnemy(e, b.dmg);
  }
  for (const bz of state.brazList || []) {
    if (dist2(bz.x, bz.y, b.x, b.y) < (b.aoe + 14) ** 2) damageBrazier(bz, 15);
  }
  sfx(120, 0.25, 'sawtooth', 0.05, -60);
  return true;
}

// ---------- Diablo-style light radius ----------
// The world is drawn, then a darkness layer goes on top with stepped holes punched out
// around the hero, torches, fireballs and explosions (and a glint for every drop).
const DARKNESS = 0.68;
let darkCv = null, darkG = null;
const glowCache = new Map();
function glowSprite(r) {
  r = Math.max(2, Math.round(r));
  let c = glowCache.get(r);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = r * 2 + 1;
  const g = c.getContext('2d'), d = g.createImageData(c.width, c.height);
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    const q = Math.hypot(x - r, (y - r) * 1.15) / r;   // slightly squat, like Diablo's ellipse
    const a = q < 0.45 ? 255 : q < 0.65 ? 215 : q < 0.82 ? 150 : q < 1 ? 75 : 0;
    d.data[(y * c.width + x) * 4 + 3] = a;
  }
  g.putImageData(d, 0, 0);
  glowCache.set(r, c);
  return c;
}
function renderDarkness() {
  if (state.act === 2) return;   // the desert is sun-bleached daylight
  if (!darkCv || darkCv.width !== W || darkCv.height !== H) {
    darkCv = document.createElement('canvas'); darkCv.width = W; darkCv.height = H;
    darkG = darkCv.getContext('2d');
  }
  const g = darkG;
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, W, H);
  // the jungle is canopy shade (green-black, lighter) rather than crypt dark
  g.fillStyle = state.act === 4 ? 'rgba(0,14,40,0.55)' : state.act === 3 ? 'rgba(0,18,6,0.5)' : `rgba(6,0,10,${DARKNESS})`;
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'destination-out';
  const punch = (wx, wy, r) => {
    const s = glowSprite(r), x = toDX(wx), y = toDY(wy);
    if (x < -s.width || x > W + s.width || y < -s.height || y > H + s.height) return;
    g.drawImage(s, x - (s.width >> 1), y - (s.height >> 1));
  };
  const flick = Math.floor(uiTime * 8) % 3;
  if (state.act === 4) {   // caustics: rippling pools of surface light drift slowly across the seabed
    const S = 130, drift = uiTime * 9, sx0 = Math.floor((player.x - VW / 2 - drift) / S) - 1, sy0 = Math.floor((player.y - VH / 2) / S) - 1;
    for (let sy = sy0; sy * S < player.y + VH / 2 + S; sy++) for (let sx = sx0; sx * S + drift < player.x + VW / 2 + S; sx++) {
      const h = hash2(sx * 3 + 7, sy * 13 + 1);
      if (h % 2) continue;
      const wob = Math.sin(uiTime * 1.3 + (h % 7)) * 5;
      punch(sx * S + drift + (h >>> 5) % S, sy * S + (h >>> 11) % S, 22 + (h >>> 17) % 18 + wob);
    }
  }
  if (state.act === 3) {   // dappled sunlight: shafts break through the canopy at fixed spots
    const S = 150, sx0 = Math.floor((player.x - VW / 2) / S) - 1, sy0 = Math.floor((player.y - VH / 2) / S) - 1;
    for (let sy = sy0; sy * S < player.y + VH / 2 + S; sy++) for (let sx = sx0; sx * S < player.x + VW / 2 + S; sx++) {
      const h = hash2(sx * 5 + 1, sy * 9 + 2);
      if (h % 3) continue;
      punch(sx * S + (h >>> 5) % S, sy * S + (h >>> 11) % S, 26 + (h >>> 17) % 22);
    }
  }
  punch(player.x, player.y - 10, (state.berserkT > 0 ? 140 : 112) + flick * 2);
  for (const bz of state.brazList || []) punch(bz.x, bz.y - 12, 42 + ((Math.floor(uiTime * 7 + bz.x) % 3) * 2));
  for (const b of ebullets) punch(b.x, b.y, b.style === 'laser' ? 12 : 22);
  for (const fx of effects) if (fx.type === 'boom' || fx.type === 'bolt' || fx.type === 'nova') punch(fx.x, fx.y, Math.max(16, (fx.radius || 30) / PX));
  for (const b of bullets) if (b.kind === 'hammer' || b.kind === 'bubble') punch(b.x, b.y, 14);
  if (state.ally) punch(state.ally.x, state.ally.y - 8, 34);
  if (state.wildAxo) punch(state.wildAxo.x, state.wildAxo.y - 8, 40);
  for (let i = 0; i < gems.length && i < 220; i++) punch(gems[i].x, gems[i].y, 5);
  for (const p of pickups) punch(p.x, p.y, p.type === 'berserk' ? 34 + (Math.floor(uiTime * 6) % 2) * 3 : 11);
  if (state.portalT > 0) punch(player.x, player.y, 60);
  g.globalCompositeOperation = 'source-over';
  ctx.drawImage(darkCv, 0, 0);
}

// Diablo-style town portal: a tall blue oval that swirls open around the hero
function drawPortal() {
  const x = toDX(player.x), y = toDY(player.y) - 4;
  const p = 1 - state.portalT / PORTAL_TIME, grow = Math.min(1, p * 3);
  const rx = Math.round(14 * grow), ry = Math.round(24 * grow);
  if (rx < 1) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 4; k++) {
    const s = 1 - k * 0.22, ph = uiTime * 6 + k;
    ctx.fillStyle = ['rgba(36,73,255,0.35)', 'rgba(73,146,255,0.35)', 'rgba(146,219,255,0.4)', 'rgba(219,255,255,0.5)'][k];
    for (let dy = -Math.round(ry * s); dy <= Math.round(ry * s); dy++) {
      const hw = Math.round(rx * s * Math.sqrt(Math.max(0, 1 - (dy / (ry * s + 0.5)) ** 2)) * (1 + 0.12 * Math.sin(ph + dy * 0.4)));
      ctx.fillRect(x - hw, y + dy, hw * 2 + 1, 1);
    }
  }
  ctx.restore();
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
    if (p.type === 'food') {
      const img = FOOD_IMG[p.food];
      drawShadowAt(p.x, p.y + 10, 7);
      ctx.drawImage(img, x - (img.width >> 1), y - (img.height >> 1) + bob);
      if ((Math.floor(uiTime * 6) + (p.x | 0)) % 11 === 0) rect(x - 3, y - (img.height >> 1) + bob, 1, 1, C.white);
    } else if (p.type === 'gold') {
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
    } else if (p.type === 'berserk') {   // the glowing blood-red orb
      const pulse = Math.floor(uiTime * 6) % 4, fr = [0, 1, 2, 1][pulse];
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = ['rgba(146,0,0,0.3)', 'rgba(219,36,0,0.3)', 'rgba(255,109,36,0.3)'][k];
        const rr = 18 - k * 4 + (pulse === 2 ? 1 : 0);
        for (let dy = -rr; dy <= rr; dy++) {
          const hw = Math.round(Math.sqrt(rr * rr - dy * dy));
          ctx.fillRect(x - hw, y + bob + dy, hw * 2 + 1, 1);
        }
      }
      ctx.restore();
      drawShadowAt(p.x, p.y + 22, 8);
      ctx.drawImage(SPR.orb.base, fr * 20, 0, 20, 20, x - 10, y - 10 + bob, 20, 20);
      if (blink(5)) rect(x - 4 + (pulse & 1) * 7, y - 6 + bob, 1, 1, C.white);
    } else if (p.type === 'chest') {
      ring(x, y, blink(3) ? 11 : 12, C.yellow);
      ctx.drawImage(CHEST, x - 7, y - 6);
      if (blink(5)) rect(x + 3, y - 7, 1, 1, C.white);
    }
  }

  // corpses (death animations), flickering out like old hardware sprites
  for (const c of corpses) {
    if (c.animT > 0.85 && blink(15)) continue;
    drawSprite(c.sprite, 'death', animFrame(c.animT, 'death', c.sprite), c.x, c.groundY, c.flip, c.scale, c.variant);
  }

  // shadows first, so no shadow ever lands on a sprite
  for (const e of enemies) drawShadowAt(e.x, groundYOf(e), e.r * 0.9);
  drawShadowAt(player.x, player.y + 20, 13);

  // living entities + solid props, y-sorted (painter's algorithm)
  const drawables = [];
  for (const o of state.obsList || []) drawables.push({ y: o.y + 4, draw() { drawObstacle(o); } });
  for (const bz of state.brazList || []) drawables.push({ y: bz.y + 8, draw() { drawBrazier(bz); } });
  for (const e of enemies) {
    drawables.push({ y: groundYOf(e), draw() {
      const near = dist2(e.x, e.y, player.x, player.y) < (e.r + player.r + 26) ** 2;
      let anim = near ? 'attack' : 'walk', frame;
      if (e.fade > 0 && blink(20)) return;       // assassin materialising
      const shriek = e.screaming > 0 && blink(16);  // banshee drawing breath
      if (e.casting > 0) {                       // windup: shaman fire-gesture row, mech brace
        anim = SHEETS[e.sprite].rows.cast !== undefined ? 'cast' : 'attack';
        const n = frameCount(e.sprite, anim);
        frame = Math.min(n - 1, Math.floor((1 - e.casting / CAST_WINDUP) * n));
      } else if (e.leapT > 0 || e.crouch > 0) {  // pouncers: jump row across crouch + leap
        anim = 'attack';
        const n = frameCount(e.sprite, 'attack');
        const p = e.crouch > 0 ? 0 : 1 - e.leapT / LEAP_TIME;
        frame = e.crouch > 0 ? 0 : Math.min(n - 1, 1 + Math.floor(p * (n - 1)));
      } else if (e.move === 'pounce' && anim === 'attack') {
        anim = 'walk';                           // the jump row only plays for real leaps
      } else if (e.kind === 'frog' && anim !== 'attack' && Math.sin(e.animT * 5) > 0.05) {
        anim = 'air';                            // mid-hop (synced to the 'hop' lunge): rising, then falling
        frame = Math.cos(e.animT * 5) > 0 ? 0 : 1;
      }
      if (frame === undefined) frame = animFrame(e.animT, anim, e.sprite);
      const lift = e.fly ? e.fly + Math.round(Math.sin(e.animT * 9) * 3) : anim === 'air' ? Math.round(Math.sin(e.animT * 5) * 26) : 0;
      drawSprite(e.sprite, anim, frame, e.x, groundYOf(e) - lift, e.lx && e.leapT > 0 ? e.lx < 0 : player.x < e.x,
        e.scale, e.flash > 0 || shriek ? 'white' : e.variant);
    } });
  }
  const hurtBlink = player.hurtCd > 0 && state.berserkT <= 0 && Math.floor(uiTime * 20) % 2 === 0;
  const rage = state.berserkT > 0;
  if (rage) {                          // afterimages, flickered on alternate frames like old hardware
    if (!SPR[SHEETS[player.sprite].file].rage) rageSheet(SHEETS[player.sprite].file);
    const tr = state.trail || [];
    for (let i = tr.length - 2; i >= 0; i -= 2) {   // every other sample, nearest one skipped
      const t = tr[i];
      if ((Math.floor(uiTime * 30) + i) % 2) continue;
      drawables.push({ y: t.y + 19, draw() { drawSprite(player.sprite, 'walk', t.frame, t.x, t.y + 20, t.flip, player.drawScale, 'ghost'); } });
    }
  }
  const axoDraw = (o, anim, frame, flip) => drawSprite('axolotl', anim, frame, o.x, o.y + 12, flip);
  if (state.wildAxo) {
    const w = state.wildAxo;
    drawables.push({ y: w.y + 12, draw() {
      if (w.life < 4 && blink(10)) return;
      const bob = Math.round(Math.sin(w.animT * 3) * 2);
      axoDraw({ x: w.x, y: w.y + bob }, 'idle', animFrame(w.animT, 'idle', 'axolotl'), player.x < w.x);
      const hx = toDX(w.x), hy = toDY(w.y) - 30 + bob;   // a pink "!" calls you over
      if (blink(3)) { rect(hx - 1, hy - 6, 3, 5, '#FF92DB'); rect(hx - 1, hy + 1, 3, 2, '#FF92DB'); }
    } });
  }
  if (state.ally) {
    const al = state.ally;
    drawables.push({ y: al.y + 12, draw() {
      if (al.t < 4 && blink(10)) return;   // contract running out
      const anim = al.attackAge < 0.3 ? 'attack' : al.moving ? 'walk' : 'idle';
      const n = frameCount('axolotl', anim);
      const frame = anim === 'attack' ? Math.min(n - 1, Math.floor(al.attackAge / 0.3 * n)) : animFrame(al.animT, anim, 'axolotl');
      axoDraw(al, anim, frame, al.face < 0);
    } });
  }
  drawables.push({ y: player.y + 20, draw() {
    if (hurtBlink) return;
    const anim = player.attackAge < 0.45 ? 'attack' : (player.moving ? 'walk' : 'idle');
    const n = frameCount(player.sprite, anim);
    const frame = anim === 'attack' ? Math.min(n - 1, Math.floor(player.attackAge / 0.45 * n))
      : animFrame(player.animT, anim, player.sprite);
    // berserk: the hero burns red, flaring back to normal colours as the last seconds run out
    const red = rage && !(state.berserkT < 3 && blink(6));
    drawSprite(player.sprite, anim, frame, player.x, player.y + 20, player.face < 0, player.drawScale, red ? 'rage' : null);
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
    if (b.kind === 'hammer') {   // glowing holy hammer, tumbling in quarter turns
      ctx.globalCompositeOperation = 'lighter';   // holy glow, like Diablo II's blessed hammers
      disc(x, y, 7, 'rgba(73,146,255,0.45)');
      disc(x, y, 4, 'rgba(182,219,255,0.5)');
      ctx.globalCompositeOperation = 'source-over';
      drawProj('hammer', x, y, Math.floor(b.t * 14));
      continue;
    }
    if (b.kind === 'sushi') {    // lobbed: shadow on the floor, sushi up in the arc
      const hy = Math.round(b.h / PX);
      rect(x - 3, y + 1, 7, 2, 'rgba(0,0,0,0.4)');
      drawProj(b.maki ? 'maki' : 'nigiri', x, y - hy, Math.floor(b.t * 10));
      continue;
    }
    if (b.kind === 'bubble') {   // axolotl spit: a wobbling bubble with a highlight
      const r = 3 + (Math.floor(b.life * 12) % 2);
      ring(x, y, r, '#B6FFFF');
      rect(x - 1, y - 2, 1, 1, C.white);
      continue;
    }
    if (b.kind === 'card') {
      const f = [0, 1, 2, 1][Math.floor(b.life * 16) % 4];
      ctx.drawImage(CARD[f], x - 2, y - 3);
    } else {
      const sp = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / sp, uy = b.vy / sp;
      line(x - ux * 6, y - uy * 6, x, y, C.red, 2);
      rect(x, y, 2, 2, C.white);
    }
  }
  // shaman fireballs: flickering 3-ring core with an ember trail
  for (const b of ebullets) {
    const x = toDX(b.x), y = toDY(b.y);
    if (x < -8 || x > W + 8 || y < -8 || y > H + 8) continue;
    const sp = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / sp, uy = b.vy / sp;
    if (b.style === 'acid') {    // maggot spit: a green glob with drips falling behind it
      for (let k = 1; k <= 3; k++) rect(x - ux * k * 3, y - uy * k * 3 + k, 2, 2, k === 1 ? '#92DB24' : '#496D00');
      disc(x, y, 3, '#496D00');
      disc(x, y, 2, '#B6FF24');
      rect(x - 1, y - 2, 1, 1, '#FFFFB6');
      continue;
    }
    if (b.style === 'thorn') {   // man-eater: a dark green spike, point first
      line(x - ux * 5, y - uy * 5, x, y, '#246D00', 2);
      rect(x, y, 1, 1, '#B6FF49');
      continue;
    }
    if (b.style === 'coconut') { // demon monkey: a tumbling brown nut
      disc(x, y, 3, '#492400');
      disc(x, y, 2, '#926D24');
      const sp = Math.floor(b.t * 12) % 4;
      rect(x - 1 + (sp & 1), y - 1 + (sp >> 1), 1, 1, '#DBB66D');
      continue;
    }
    if (b.style === 'laser') {   // mech: hot cyan streak with a white core
      line(x - ux * 9, y - uy * 9, x, y, C.blue, 3);
      line(x - ux * 7, y - uy * 7, x, y, C.cyan, 2);
      rect(x - 1, y - 1, 2, 2, C.white);
      continue;
    }
    for (let k = 3; k >= 1; k--) {
      if ((Math.floor(b.t * 20) + k) % 3 === 0) continue;
      rect(x - ux * k * 3, y - uy * k * 3, 2, 2, k === 1 ? C.orange : C.red);
    }
    const flick = Math.floor(b.t * 15) % 2;
    disc(x, y, 3 + flick, C.red);
    disc(x, y, 2, C.orange);
    rect(x - 1, y - 1, 2, 2, flick ? C.yellow : C.white);
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
    } else if (fx.type === 'scream') {   // banshee shriek: three pale rings racing outward
      for (let k = 0; k < 3; k++) {
        const q = Math.min(1, (1 - p) * 1.3 - k * 0.18);
        if (q > 0) ring(cx, cy, (fx.radius / PX) * q, k === 0 ? C.white : '#92B6DB');
      }
    } else if (fx.type === 'heal') {   // lizard doctor's pulse: a green ring expanding outward
      const rr = (fx.radius / PX) * (1 - p);
      ring(cx, cy, rr, p > 0.5 ? '#92FF92' : C.green);
    } else if (fx.type === 'toxic') {  // poison frog's death cloud: a squat green haze with rising bubbles
      if (p < 0.15 && blink(15)) continue;
      const rx = Math.round(fx.radius / PX), ry = Math.round(rx * 0.6);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 2; k++) {
        ctx.fillStyle = k ? 'rgba(73,182,0,0.22)' : 'rgba(36,109,0,0.3)';
        const sx = rx * (1 - k * 0.35), sy = ry * (1 - k * 0.35);
        for (let dy = -Math.round(sy); dy <= Math.round(sy); dy++) {
          const hw = Math.round(sx * Math.sqrt(Math.max(0, 1 - (dy / (sy + 0.5)) ** 2)) * (1 + 0.08 * Math.sin(uiTime * 5 + dy)));
          ctx.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1);
        }
      }
      ctx.restore();
      for (let k = 0; k < 4; k++) {
        const ph = (uiTime * 0.8 + k * 0.27 + fx.x * 0.01) % 1;
        rect(cx + Math.round(Math.sin(k * 2.3 + fx.y) * rx * 0.6), cy - Math.round(ph * ry * 2), 2, 2, ph > 0.7 ? '#DBFF92' : '#92FF24');
      }
    }
  }

  if (state.act === 4) {   // streams of bubbles rising off the seabed, anchored to the world
    const S = 90, x0 = Math.floor(camX * PX / S) - 1, y0 = Math.floor(camY * PX / S) - 1;
    for (let gy = y0; gy * S < (camY + H) * PX + S; gy++) for (let gx = x0; gx * S < (camX + W) * PX + S; gx++) {
      const h = hash2(gx * 11 + 5, gy * 7 + 3);
      if (h % 5) continue;
      for (let k = 0; k < 3; k++) {
        const ph = (uiTime * 0.35 + k / 3 + (h % 97) / 97) % 1;
        const bx = toDX(gx * S + (h >>> 6) % S + Math.sin(uiTime * 2 + k + h) * 3), by = toDY(gy * S + S - ph * S * 1.6);
        if (ph < 0.85 || blink(12)) ring(bx, by, k === 1 ? 2 : 1, '#92DBFF');
      }
    }
  }
  if (state.portalT > 0) drawPortal();
  renderDarkness();

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
    rect(x + 1, by + 1, fw, 5, player.poisonT > 0 ? '#49DB00' : frac > 0.5 ? C.yellow : low ? C.red : C.orange);
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

  // berserk countdown, under the stat stack
  if (state.berserkT > 0) {
    const f = clamp(state.berserkT / BERSERK_TIME, 0, 1), last = state.berserkT < 3;
    drawText('BERSERK', x, 62, last && blink(4) ? C.white : C.red);
    drawText(String(Math.ceil(state.berserkT)), x + 48, 62, C.white);
    rect(x, 71, bw + 2, 5, C.black);
    rect(x + 1, 72, Math.round(bw * f), 3, C.red);
    rect(x + 1, 72, Math.round(bw * f), 1, '#FF9292');
  }

  // the axolotl mercenary's contract, under the stats (below berserk if both run)
  if (state.ally) {
    const ay = state.berserkT > 0 ? 80 : 62, f = clamp(state.ally.t / ALLY_TIME, 0, 1);
    drawText('AXOLOTL', x, ay, '#FF92DB');
    drawText(String(Math.ceil(state.ally.t)), x + 48, ay, C.white);
    rect(x, ay + 9, bw + 2, 5, C.black);
    rect(x + 1, ay + 10, Math.round(bw * f), 3, '#FF6DB6');
  }
  if (state.wildAxo) {   // an arrow at the screen edge points the way to a waiting axolotl
    const wx = toDX(state.wildAxo.x), wy = toDY(state.wildAxo.y) - 8;
    if (wx < 8 || wx > W - 8 || wy < 8 || wy > H - 8) {
      const cx = W / 2, cy = H / 2, a = Math.atan2(wy - cy, wx - cx);
      const k = Math.min((W / 2 - 14) / Math.abs(Math.cos(a) || 1e-6), (H / 2 - 14) / Math.abs(Math.sin(a) || 1e-6));
      const ax = Math.round(cx + Math.cos(a) * k), ay2 = Math.round(cy + Math.sin(a) * k);
      if (blink(4)) {
        ctx.fillStyle = '#FF92DB';
        ctx.beginPath();
        ctx.moveTo(ax + Math.cos(a) * 6, ay2 + Math.sin(a) * 6);
        ctx.lineTo(ax + Math.cos(a + 2.5) * 6, ay2 + Math.sin(a + 2.5) * 6);
        ctx.lineTo(ax + Math.cos(a - 2.5) * 6, ay2 + Math.sin(a - 2.5) * 6);
        ctx.fill();
      }
    }
  }

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
  const ly = H - 23;
  const slot = (key, rank) => {
    rect(lx - 1, ly - 1, 18, 22, 'rgba(0,0,0,0.5)');
    drawSkill(key, lx, ly, 16);
    pips(lx + 2, ly + 18, rank);
    lx += 19;
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
// VS-style cards: a big framed painting per choice, its name, type and what it does
function renderLevelUp(m) {
  dim();
  const ww = menuWidth(300), x = Math.round((W - ww) / 2);
  const tx = x + 52, tw = ww - 60;
  const headH = 7 * (textW('LEVEL UP!', 2) <= ww - 12 ? 2 : 1);
  const rows = m.choices.map(o => {
    const lines = wrapText(optDef(o).desc, tw).slice(0, 3);
    return { o, lines, h: Math.max(40, 16 + lines.length * 9 + 4) };
  });
  const h = 8 + headH + 8 + rows.reduce((t, r) => t + r.h + 2, 0) + 4;
  const y = Math.max(4, Math.round((H - h) / 2));
  drawWindow(x, y, ww, h);
  windowTitle('LEVEL UP!', x, y + 7, ww, GOLD_GRAD);
  let ry = y + 8 + headH + 8;
  rows.forEach(({ o, lines, h: rh }, i) => {
    const on = i === m.sel, def = optDef(o);
    if (on) {
      rect(x + 3, ry, ww - 6, rh, C.selBar);
      if (blink(3)) drawCursor(x + 5, ry + Math.round(rh / 2) - 3);
    }
    // icon frame: gold when selected, steel otherwise, like an MD item box
    const ix = x + 13, iy = ry + Math.round((rh - 34) / 2);
    rect(ix - 1, iy - 1, 36, 36, C.black);
    rect(ix, iy, 34, 34, on ? C.yellow : C.grey);
    drawSkill(o.kind === 'heal' ? 'heal' : o.id, ix + 1, iy + 1, 32);
    drawText(def.name, tx, ry + 4, on ? C.white : C.lgrey);
    const kind = o.kind === 'weapon' ? 'POWER' : o.kind === 'passive' ? 'TRAIT' : 'HEAL';
    if (o.kind === 'heal') drawText('+50 HP', x + ww - 8, ry + 4, C.green, { align: 'right' });
    else if (o.isNew) drawText('NEW!', x + ww - 8, ry + 4, blink(4) ? C.green : C.yellow, { align: 'right' });
    else pips(x + ww - 27, ry + 5, o.rank, o.rank + 1, 3);
    const nameEnd = tx + textW(norm(def.name)) + 6;
    if (nameEnd + 30 < x + ww - 32) drawText(kind, nameEnd, ry + 4, o.kind === 'weapon' ? C.orange : C.cyan);
    lines.forEach((ln, k) => drawText(ln, tx, ry + 15 + k * 9, on ? C.white : C.lgrey));
    addHit(x + 3, ry, ww - 6, rh, 'row:' + i);
    ry += rh + 2;
  });
}
function renderChest(m) {
  dim();
  const ww = menuWidth(260), x = Math.round((W - ww) / 2), rowH = 18;
  const headH = 14;
  const h = 8 + headH + 8 + m.rewards.length * rowH + 6 + 10 + 12;
  const y = Math.max(6, Math.round((H - h) / 2));
  drawWindow(x, y, ww, h);
  const jackpot = m.rewards.length === 5;
  windowTitle(jackpot ? 'JACKPOT!' : 'TREASURE!', x, y + 7, ww, blink(4) ? GOLD_GRAD : CYAN_GRAD);
  let ry = y + 8 + headH + 8;
  for (let i = 0; i < m.shown; i++) {
    const r = m.rewards[i];
    drawSkill(r.icon, x + 8, ry - 3, 16);
    drawText(r.name, x + 28, ry + 2, C.white);
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
  const h = 8 + 14 + 8 + 10 + rows * 18 + 8 + opts.length * 14 + 4;
  const y = Math.max(6, Math.round((H - h) / 2));
  drawWindow(x, y, ww, h);
  windowTitle('PAUSE', x, y + 7, ww, CYAN_GRAD);
  const top = y + 30;
  const cw = two ? Math.floor((ww - 16) / 2) : ww - 16;
  const entry = (cx, cy, icon, name, rank) => {
    drawSkill(icon, cx, cy - 3, 16);
    const room = Math.floor((cw - 19 - 32) / 6);
    drawText(norm(name).slice(0, room), cx + 19, cy + 2, C.white);
    pips(cx + cw - 28, cy + 3, rank, rank, 3);   // 8-dot gutter before the next column
  };
  if (two) {
    drawText('POWERS', x + 8, top, C.cyan);
    drawText('TRAITS', x + 8 + cw, top, C.cyan);
    ws.forEach((w, i) => entry(x + 8, top + 14 + i * 18, w.id, WEAPON_DEFS[w.id].name, w.level));
    ps.forEach(([id, r], i) => entry(x + 8 + cw, top + 14 + i * 18, id, PASSIVE_DEFS[id].name, r));
  } else {
    drawText('LOADOUT', x + 8, top, C.cyan);
    const all = ws.map(w => [w.id, WEAPON_DEFS[w.id].name, w.level])
      .concat(ps.map(([id, r]) => [id, PASSIVE_DEFS[id].name, r]));
    all.forEach(([id, name, r], i) => entry(x + 8, top + 14 + i * 18, id, name, r));
  }
  let oy = top + 14 + rows * 18 + 2;
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
const PARADE = ['ranger', 'warrior', 'wizard', 'rogue', 'cleric', 'biski', 'neil', 'zoe', null, null,
  'golem', 'bat', 'imp', 'skeleton', 'scarab', 'shaman', 'hound', 'guard', 'knight'];
// big sheets need more room in the line-up
const paradeGap = key => (!key ? 26 : SHEETS[key].size > 40 ? 44 : SHEETS[key].size > 32 ? 32 : 26);
function drawParade(gy) {
  const span = PARADE.reduce((s, k) => s + paradeGap(k), 0);
  const head = (uiTime * 32) % (W + span);
  let off = 0;
  PARADE.forEach((key, i) => {
    const gap = paradeGap(key);
    off += gap;
    if (!key) return;
    const x = Math.round(head - off + gap / 2);
    if (x < -40 || x > W + 40) return;
    const def = SHEETS[key], img = SPR[def.file].base, s = def.size;
    const k = key === 'biski' ? 1.25 : 1, dw = Math.round(s * k);
    const sh = shadowSprite(s > 40 ? 10 : 6);
    ctx.drawImage(sh, x - (sh.width >> 1), gy - (sh.height >> 1));
    const frame = Math.floor(uiTime * 10 + i * 3) % frameCount(key, 'walk');
    const lift = key === 'bat' ? 7 : 0;
    ctx.drawImage(img, frame * s, def.rows.walk * s, s, s, x - (dw >> 1), gy - dw + Math.round(3 * k) - lift, dw, dw);
  });
}
// a clipped window onto the arena floor (tiles at 1x or 2x), optionally dimmed
function arenaPatch(x, y, w, h, k, dark) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  drawCryptTiles(x, y, w, h, CT * k / 2, 40 * CT * k / 2, 40 * CT * k / 2);
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
  drawText('SURVIVE THE CATHEDRAL FOR 15:00', W / 2, ty + 10, C.lgrey, { align: 'center' });
  // START GAME / BESTIARY, the classic title-screen pair
  const my = Math.round(H * 0.6), items = ['START GAME', 'BESTIARY'];
  addHit(0, 0, W, H, 'any');
  items.forEach((label, i) => {
    const y = my + i * 14, on = i === titleSel, w = textW(label);
    drawText(label, W / 2, y, on ? C.yellow : C.lgrey, { align: 'center' });
    if (on && blink(3)) drawCursor(Math.round(W / 2 - w / 2) - 10, y);
    addHit(Math.round(W / 2 - w / 2) - 14, y - 4, w + 28, 14, 'title:' + i);
  });
  const credit = 'ART: CALCIUMTRICE / ANSIMUZ / REDSHRIKE / BJERK / YURINIKOLAI / CRAFTPIX / DCSS / LPC / OPP / SHEPARDSKIN';
  if (credit.length * 6 < W - 8) drawText(credit, W / 2, H - 10, C.grey, { align: 'center', shadow: false });
  else {
    drawText('ART: CALCIUMTRICE / ANSIMUZ / BJERK / DCSS', W / 2, H - 20, C.grey, { align: 'center', shadow: false });
    drawText('REDSHRIKE / LPC / BUCH / SHEPARDSKIN', W / 2, H - 10, C.grey, { align: 'center', shadow: false });
  }
}
const SEL_COLS = 4;
// a hero's walk/idle frame fitted into a box: centred, feet on feetY, clipped to the box
function drawHeroIn(h, anim, frame, bx, by, bw, bh, k, feetY) {
  const def = SHEETS[h.sprite], s = def.size, dw = Math.round(s * k);
  ctx.save();
  ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.clip();
  ctx.drawImage(SPR[def.file].base, frame * s, def.rows[anim] * s, s, s,
    Math.round(bx + bw / 2 - dw / 2), Math.round(feetY - dw + 3 * k), dw, dw);
  ctx.restore();
}
function selectLayout() {
  const cell = 46, gap = 4, gw = cell * SEL_COLS + gap * (SEL_COLS - 1);
  const gh = cell * Math.ceil(HEROES.length / SEL_COLS) + gap * (Math.ceil(HEROES.length / SEL_COLS) - 1);
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
    const bx = L.gx + (i % SEL_COLS) * (L.cell + L.gap), by = L.gy + Math.floor(i / SEL_COLS) * (L.cell + L.gap);
    const on = i === selIndex;
    drawWindow(bx, by, L.cell, L.cell, { border: on ? (blink(4) ? C.yellow : C.white) : C.grey });
    arenaPatch(bx + 2, by + 2, L.cell - 4, L.cell - 4, 1, on ? 0 : 0.35);
    const anim = on ? 'walk' : 'idle';
    const frame = Math.floor(uiTime * 10 + i * 2) % frameCount(h.sprite, anim);
    drawHeroIn(h, anim, frame, bx + 2, by + 2, L.cell - 4, L.cell - 4, 1, by + 38);
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
  drawHeroIn(h, 'walk', Math.floor(uiTime * 10) % frameCount(h.sprite, 'walk'), x0 + 1, y0 + 1, 66, 66, 2, y0 + 60);
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
// ---------- bestiary screen ----------
function bestLayout() {
  const tile = 30, gap = 2, x0 = 8, pw = W - 16;
  const cols = Math.max(4, Math.floor((pw + gap) / (tile + gap)));
  const rows = Math.ceil(BEST_ENTRIES.length / cols);
  const textX = 6 + 68 + 6, descW = pw - 12;
  // panel fits the longest description so it never jumps between entries
  const descLines = Math.max(...BEST_ENTRIES.map(e => wrapText(BEST_DESC[e.key] || '', descW).length));
  const ph = 6 + 68 + 6 + descLines * 9 + 6;
  const gw = cols * (tile + gap) - gap, gh = rows * (tile + gap);
  // centre the whole page vertically on tall (portrait) screens
  const total = 20 + ph + 6 + gh + 4 + 13;
  const ty = Math.max(6, Math.floor((H - total) / 2)), py = ty + 20;
  return { tile, gap, cols, rows, px: x0, py, pw, ph, textX, descW, ty,
    gx: Math.round((W - gw) / 2), gy: py + ph + 6 };
}
const bestKnown = e => !!bestiary.seen[e.key];
// draw a sheet's walk cycle fitted into a box, feet on the box floor (clipped)
function drawBeastIn(e, bx, by, bw, bh, k, known, animate) {
  const def = SHEETS[e.sheet], s = def.size, set = SPR[def.file];
  const img = !known ? set.shade : (e.variant && set[e.variant]) || set.base;
  const anim = e.sheet === 'maggot' ? 'attack' : 'walk';   // the maggot's walk is a burrowed mound: show it risen
  const n = frameCount(e.sheet, anim);
  const frame = animate ? Math.floor(uiTime * 10) % n : (anim === 'attack' ? 4 : 0);
  const dw = Math.round(s * k);
  ctx.save();
  ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.clip();
  const lift = e.key === 'bat' ? Math.round(6 * k) : 0;
  ctx.drawImage(img, frame * s, def.rows[anim] * s, s, s,
    Math.round(bx + bw / 2 - dw / 2), Math.round(by + bh - 2 - dw + 3 * k) - lift, dw, dw);
  ctx.restore();
}
function renderBestiary() {
  attractBackdrop(0.7);
  const L = bestLayout();
  const found = BEST_ENTRIES.filter(bestKnown).length;
  const tsc = textW('BESTIARY', 2) <= W - 100 ? 2 : 1;
  drawText('BESTIARY', 8, L.ty, C.white, { scale: tsc, outline: C.black, grad: GOLD_GRAD });
  drawText(`FOUND ${found}/${BEST_ENTRIES.length}`, W - 8, L.ty + 3, found === BEST_ENTRIES.length ? C.yellow : C.cyan, { align: 'right' });

  // detail panel
  const e = BEST_ENTRIES[bestSel], known = bestKnown(e);
  drawWindow(L.px, L.py, L.pw, L.ph);
  const x0 = L.px + 6, y0 = L.py + 6;
  rect(x0, y0, 68, 68, C.black);
  arenaPatch(x0 + 1, y0 + 1, 66, 66, 2, known ? 0 : 0.2);
  const sh = shadowSprite(e.boss ? 18 : 12);
  ctx.drawImage(sh, x0 + 34 - (sh.width >> 1), y0 + 62 - (sh.height >> 1));
  const s = SHEETS[e.sheet].size;
  drawBeastIn(e, x0 + 1, y0 + 1, 66, 66, s <= 40 ? 2 : 1, known, true);
  const tx = L.px + L.textX, tw = L.pw - L.textX - 6;
  if (known) {
    const nsc = textW(norm(e.name), 2) <= tw ? 2 : 1;
    drawText(e.name, tx, y0 + 1, C.white, { scale: nsc, outline: C.black, grad: e.boss ? RED_GRAD : GOLD_GRAD });
    let sy = y0 + 4 + 7 * nsc + 3;
    drawText(e.boss ? `BOSS ${fmtTime(e.at)}` : e.act > 1 ? `FOUND IN ACT ${ROMAN[e.act]}` : `FIRST SEEN ${fmtTime(e.at)}`, tx, sy, e.boss ? C.red : ACT_COL[e.act] || C.cyan);
    sy += 10;
    const maxOf = f => Math.max(...BEST_ENTRIES.filter(q => !q.boss).map(q => q[f]));
    for (const [label, f, col] of [['HP', 'hp', C.green], ['SPD', 'speed', C.cyan], ['DMG', 'dmg', C.red]]) {
      drawText(label, tx, sy, C.yellow);
      const segs = e.boss ? 8 : Math.max(1, Math.round((e[f] / maxOf(f)) * 8));
      for (let i = 0; i < 8; i++) rect(tx + 24 + i * 4, sy + 1, 3, 5, i < segs ? col : C.pipOff);
      sy += 9;
    }
    const kills = bestiary.kills[e.key] || 0;
    drawText('KILLS', tx, sy + 1, C.yellow);
    drawText(String(kills), tx + 36, sy + 1, kills ? C.white : C.grey);
    wrapText(BEST_DESC[e.key] || '', L.descW).forEach((ln, i) => drawText(ln, x0, y0 + 74 + i * 9, C.white));
  } else {
    drawText('???', tx, y0 + 1, C.lgrey, { scale: 2, outline: C.black });
    drawText(e.boss ? 'BOSS' : 'NOT MET YET', tx, y0 + 22, C.grey);
    drawText(e.act > 1 ? `APPEARS IN ACT ${ROMAN[e.act]}` : `APPEARS ${fmtTime(e.at)}`, tx, y0 + 32, ACT_COL[e.act] || C.cyan);
    drawText('SURVIVE LONGER TO MEET IT.', x0, y0 + 74, C.lgrey);
  }

  // grid of portraits
  BEST_ENTRIES.forEach((q, i) => {
    const bx = L.gx + (i % L.cols) * (L.tile + L.gap), by = L.gy + Math.floor(i / L.cols) * (L.tile + L.gap);
    const on = i === bestSel, kn = bestKnown(q);
    drawWindow(bx, by, L.tile, L.tile, { border: on ? (blink(4) ? C.yellow : C.white) : (q.boss ? '#920000' : C.grey) });
    arenaPatch(bx + 2, by + 2, L.tile - 4, L.tile - 4, 1, on ? 0 : 0.35);
    const qs = SHEETS[q.sheet].size;
    drawBeastIn(q, bx + 2, by + 2, L.tile - 4, L.tile - 4, qs > 40 ? 0.5 : 1, kn, on);
    if (!kn) drawText('?', bx + L.tile - 8, by + 3, C.lgrey);
    addHit(bx, by, L.tile, L.tile, 'best:' + i);
  });

  // back button + hint
  const fy = Math.min(H - 16, L.gy + L.rows * (L.tile + L.gap) + 4);
  const bw = 44, bh = 13, bbx = W - bw - 8;
  drawWindow(bbx, fy, bw, bh, { border: blink(2) ? C.yellow : C.white });
  drawText('BACK', bbx + bw / 2, fy + 3, C.white, { align: 'center' });
  addHit(bbx - 2, fy - 2, bw + 4, bh + 4, 'back');
  if (W >= 300) drawText('ARROWS: BROWSE   ESC: BACK', 8, fy + 3, C.grey);
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
  if (scene === 'bestiary') { renderBestiary(); return; }
  renderWorld();
  if (scene === 'play') {
    renderHUD();
    renderBanner();
  }
  // stepped full-screen flash on level-ups, chests and purges
  if (state.flash > 0.05 && !REDUCED) rect(0, 0, W, H, `rgba(255,255,255,${state.flash > 0.3 ? 0.4 : 0.2})`);
  // octopus ink: dark blots smother the edges of the view, clearing from the outside in
  if (scene === 'play' && state.inkT > 0) {
    const k = Math.min(1, state.inkT / 1.2);
    for (let i = 0; i < 7; i++) {
      const bx = (hash2(i, 3) % 1000) / 1000 * W, by = (hash2(i, 7) % 1000) / 1000 * H;
      disc(Math.round(bx), Math.round(by), Math.round((30 + (hash2(i, 9) % 30)) * k), 'rgba(20,10,36,0.82)');
    }
  }
  // berserk: the whole screen runs red, with a throbbing border
  if (scene === 'play' && state.berserkT > 0) {
    rect(0, 0, W, H, 'rgba(182,0,0,0.16)');
    const b = Math.floor(uiTime * 4) % 2 ? 3 : 2;
    const col = 'rgba(255,0,0,0.35)';
    rect(0, 0, W, b, col); rect(0, H - b, W, b, col); rect(0, b, b, H - 2 * b, col); rect(W - b, b, b, H - 2 * b, col);
  }
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
