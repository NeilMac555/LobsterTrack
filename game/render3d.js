// ---------- 3D renderer (Three.js) ----------
// The 3D graphics mode. The game itself doesn't change: every frame this reads the game's state (the hero,
// the monsters, the map, the props) and draws the act as a lit, shadowed 3D scene:
//   - Act I: KayKit floor tiles and walls built from the map grid (walls between the camera and the hero drop
//     to half height, so nothing hides you). Acts II-V: the 2D floor art lies on the ground and the walls rise
//     as rock (sandstone, jungle cliff, reef, obsidian);
//   - animated heroes and monsters (KayKit adventurers and skeletons; Quaternius and Kenney creatures), with
//     weapons in hand where they have hands;
//   - each act's obstacles, statues, braziers and pots as 3D props, plus a little scattered dressing;
//   - the 2D renderer's flat layer (blood, pools, rings, gems, pickups, flat effects, and outside Act I the floor
//     itself) painted onto a texture on the ground; anything standing that has no model yet is a billboard;
//   - per-act light: a lantern over the hero in the crypt, sun on the dunes, canopy shade, deep-sea blue, hellfire;
//     the scene's fires and blasts as point lights, fog and bloom.
// Models: KayKit by Kay Lousberg, Quaternius, Kenney (all CC0). Engine: three.js (MIT).
// It runs alongside game.js, a classic script, and reads that script's top-level bindings by name.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const BASE = window.ASSET_BASE_3D || 'assets/3d/';
const EXT = window.ASSET_EXT_3D || '.glb';   // hosts that won't serve .glb get the same models as glTF JSON (.gltf.json)
const CELL = MC / PX;          // dots per map cell
const KIT = CELL / 4;          // dungeon pieces: one 4 m KayKit tile spans one cell
const MAN = 14;                // characters: dots per metre
const WALL_H = 4 * KIT;        // a full wall, in dots
const MAX_ACTORS = 100;        // the nearest monsters get a model; any more stand as billboards
const SHADOW_R = 230;          // only models this close to the hero cast shadows (each caster is drawn again for the light)
// Adaptive quality: if frames are slow, step down (sharpness, then shadows, then bloom); still too slow, hand the
// world back to the HD renderer. ?q=fixed keeps full quality (tests).
const ADAPT = new URLSearchParams(location.search).get('q') !== 'fixed';
const CAM = { fov: 34, pitch: 47 * Math.PI / 180, aim: 14, zoom: 1.02 };

// Heroes: the closest KayKit stand-ins (Neil is the Barbarian without his bear hat, Zoe a small hatless Mage).
// Biski has no model yet and stays a sprite.
const HERO = {
  visor: { m: 'ranger', atk: 'Ranged_Magic_Shoot' },
  wildcat: { m: 'barbarian', r: 'axe_1handed', l: 'axe_1handed', atk: 'Melee_1H_Attack_Chop' },
  skywitch: { m: 'mage', r: 'staff', atk: 'Ranged_Magic_Spellcasting' },
  ace: { m: 'rogue', r: 'dagger', atk: 'Throw' },
  mender: { m: 'knight', r: 'sword_1handed', l: 'shield_round', atk: 'Melee_1H_Attack_Chop' },
  neil: { m: 'barbarian', hide: ['Barbarian_BearHat'], atk: 'Throw' },
  zoe: { m: 'mage', hide: ['Mage_Hat'], s: 0.8, atk: 'Throw' },
  ana: { m: 'rogue_hooded', hide: ['RogueHooded_Mask'], atk: 'Throw' },
  karate: { m: 'rogue_hooded', atk: 'Throw' },
};
// Monsters with a model, by kind (bosses by key).
//   m: a KayKit Rig_Medium character (shared animations; `skel` plays the skeletons' own walk, idle and death)
//   g: a creature file in creatures/ with its own animations (Quaternius, Kenney), h: its height in dots,
//   hover: dots off the ground (on top of the game's own flying height), tint: a colour multiplied in, paint: one set,
//   glow: a constant ember of its own
const FOE = {
  skeleton: { m: 'skeleton_minion', r: 'Skeleton_Blade', skel: true },
  knight: { m: 'skeleton_warrior', r: 'Skeleton_Axe', l: 'Skeleton_Shield_Small_A', skel: true },
  assassin: { m: 'skeleton_rogue', r: 'dagger', l: 'dagger', skel: true },
  shaman: { m: 'skeleton_mage', r: 'Skeleton_Staff', skel: true, atk: 'Ranged_Magic_Spellcasting' },
  guard: { m: 'knight', r: 'sword_1handed', l: 'shield_round', tint: 0x7f8fb0 },
  raider: { m: 'barbarian', r: 'axe_1handed', tint: 0xc8907a },
  orc: { m: 'barbarian', r: 'axe_2handed', tint: 0x86c070, atk: 'Melee_2H_Attack_Chop' },
  brute: { m: 'barbarian', r: 'axe_2handed', s: 1.3, tint: 0xa8a070, atk: 'Melee_2H_Attack_Chop' },
  butcher: { m: 'barbarian', r: 'axe_2handed', tint: 0xffa090, hide: ['Barbarian_BearHat'], atk: 'Melee_2H_Attack_Chop' },
  golem: { g: 'k-skeleton', h: 26, tint: 0x8a96a8 },
  goblin: { g: 'k-keeper', h: 20, tint: 0x90c070 },
  bat: { g: 'bat', h: 14, hover: 10 },
  devilkin: { g: 'bat', h: 18, hover: 12, tint: 0xff6a50 },
  imp: { g: 'dragon', h: 20, hover: 6, tint: 0xff7a5a },
  hellbeast: { g: 'dragon', h: 44, hover: 4, tint: 0xb03a20 },
  devil: { g: 'dragon', h: 118, hover: 8, paint: 0xb8241a, glow: 0x3a0800 },
  blueslime: { g: 'slime', h: 14, tint: 0x7ab0ff }, redslime: { g: 'slime', h: 14, tint: 0xff7060 }, voltslime: { g: 'slime', h: 15, tint: 0xfff070 },
  scarab: { g: 'spider', h: 14, paint: 0xb8862e },   // the spider is near-black: repainted rather than tinted
  crab: { g: 'spider', h: 16, paint: 0xd0502c },
  fly: { g: 'wasp', h: 12, hover: 10, tint: 0xa0c070 },
  mosquito: { g: 'wasp', h: 8, hover: 12, tint: 0x7a6a5a },
  snake: { g: 'snake', h: 10 },
  eel: { g: 'snake', h: 10, hover: 4, tint: 0x70b0ff },
  maggot: { g: 'snake', h: 10, tint: 0xf4e4b8 },
  maggotqueen: { g: 'snake_angry', h: 64, paint: 0xe6d6a4 },
  frog: { g: 'frog', h: 14 },
  lizard: { g: 'raptor', h: 20, tint: 0x90c868 },
  wolf: { g: 'raptor', h: 24, tint: 0x7a4040 },
  piranha: { g: 'fish1', h: 7, hover: 8, tint: 0xff9080 },
  shark: { g: 'shark', h: 18, hover: 8 },
  ghoul: { g: 'k-zombie', h: 28, tint: 0xffa070 },
  cultist: { g: 'k-vampire', h: 28, tint: 0xff7070 },
  banshee: { g: 'k-ghost', h: 28, hover: 4 },
  nightmare: { g: 'horse', h: 34, tint: 0x3a2a2a },
};
// Act I's obstacles (by kind) and map props (by prop code) as dungeon pieces
const OBS_PIECES = ['column', 'pillar_decorated', 'rubble_large', 'table_long_broken', 'barrel_large', 'crates_stacked', 'chest_gold', 'pillar'];
const MAP_PIECES = ['pillar_decorated', 'column', 'barrel_large', 'crates_stacked', 'table_medium_broken', 'rubble_half', 'candle_triple',
  'sword_shield_broken', 'keg', 'box_large', 'candle_lit', 'shelf_small_candles', 'chest', 'barrel_small', 'rubble_large', 'pillar'];
const POT_PIECES = ['barrel_small', 'keg', 'box_small', 'bottle_A_green'];
const FLOOR_PIECES = [['floor_tile_large', 70], ['floor_tile_large_rocks', 14], ['floor_dirt_large', 10], ['floor_tile_big_grate', 3]];
const WALL_PIECES = [['wall', 78], ['wall_cracked', 16], ['wall_broken', 6]];

// Acts II-V. A piece is [name, height in dots, tint]; a tint is a colour multiplied into every material, or
// { materialName: colour } to repaint named materials (Kenney's cliff blocks: 'grass' on top, 'dirt' down the sides).
// (Kenney's statues are dark grey: they're repainted, { set }, rather than multiplied)
const SAND = { set: 0xd8c39a }, JADE = { set: 0x4f9f8c }, OBSID = { set: 0x5a3c36 }, MOSS = { set: 0x86a286 };
const ACT = {
  2: {   // the Burning Sands: sandstone ridges, palms and statues under a hard sun
    wall: ['cliff_block_rock', { grass: 0xe2c286, dirt: 0xc89a62 }], wallH: [1.1, 1.7],
    obs: [['palm-detailed-bend', 74], ['tree_palmTall', 70], ['palm-detailed-straight', 76], ['statue_column', 40, SAND], ['rocks-sand-a', 22]],
    map: [['statue_column', 38, SAND], ['statue_columnDamaged', 30, SAND], ['statue_column', 38, SAND], ['statue_block', 26, SAND], ['statue_ring', 30, SAND],
      ['rocks-sand-b', 16], ['statue_obelisk', 44, SAND], ['altar-stone', 18, SAND], ['statue_head', 30, SAND], ['statue_head', 30, SAND], ['statue_column', 38, SAND],
      ['statue_columnDamaged', 30, SAND], ['stone_largeA', 18, SAND], ['rocks-sand-c', 14], ['urn-round', 16, SAND], ['stone_largeB', 18, SAND]],
    pots: [['pot_large', 16], ['pot_small', 12]], scatter: [['rocks-sand-c', 7, 26], ['cactus_short', 18, 60], ['cactus_tall', 28, 90]],
    light: { amb: [0xfff0dc, 0.9], hemi: [0xfff3cf, 0xb48654, 0.7], sun: [0xfff1d2, 2.5], lamp: 0, fog: 0xe7cf98, fogK: [1.3, 2.4], exposure: 0.85, glow: 0x111111, day: 1 },
  },
  3: {   // the Strangling Jungle: green cliffs, giant trees, ferns, mushrooms
    wall: ['cliff_block_rock', { grass: 0x4f8f3a, dirt: 0x6a5238 }], wallH: [1.0, 1.6],
    obs: [['Tree_1_A_Color1', 120], ['Tree_2_A_Color1', 116], ['Tree_3_A_Color1', 112], ['Tree_4_A_Color1', 120], ['tree_fat', 96], ['plant_bushLarge', 30]],
    map: [['Tree_1_A_Color1', 100], ['Tree_3_A_Color1', 96], ['Tree_2_A_Color1', 100], ['Rock_1_A_Color1', 18], ['statue_head', 30, MOSS], ['statue_ring', 28, MOSS],
      ['mushroom_redGroup', 14], ['statue_head', 30, MOSS], ['statue_head', 30, 0xc08050], ['statue_block', 26, MOSS], ['statue_column', 38, MOSS],
      ['statue_columnDamaged', 30, MOSS], ['log_large', 12], ['log_large', 12], ['stump_old', 14], ['Bush_2_A_Color1', 22]],
    pots: [['pot_large', 16], ['pot_small', 12]], scatter: [['Grass_1_A_Color1', 10, 7], ['Bush_1_A_Color1', 16, 24], ['mushroom_tanGroup', 9, 40], ['mushroom_redTall', 12, 70]],
    light: { amb: [0x3e5a38, 0.7], hemi: [0xb6e09a, 0x1c2a12, 0.55], sun: [0xe2ffbc, 1.5], lamp: 1.8, fog: 0x0c1c0c, fogK: [1.0, 1.9], exposure: 1.1, glow: 0x222222 },
  },
  4: {   // the Drowned Depths: reef walls, jade idols, coral, seaweed, a wreck
    wall: ['cliff_block_stone', 0x6a9aa8], wallH: [1.0, 1.5],
    obs: [['statue_obelisk', 52, JADE], ['statue_column', 46, JADE], ['rock_tallA', 40, 0x7a8f9a], ['cannon', 16, 0x9ab0c0], ['Bush_4_A_Color1', 28, 0xd070c0], ['grass_large', 40, 0x2a6a4a]],
    map: [['statue_head', 30, JADE], ['statue_head', 30, JADE], ['rock_largeA', 20, 0x8aa0b0], ['statue_head', 30, JADE], ['statue_column', 38, JADE], ['statue_columnDamaged', 30, JADE],
      ['urn-round', 16, JADE], ['urn-round', 16, JADE], ['statue_head', 30, JADE], ['statue_head', 30, JADE], ['statue_ring', 30, 0x8ad0ff], ['statue_column', 38, JADE],
      ['statue_block', 26, JADE], ['urn-round', 16, JADE], ['ship-wreck', 46, 0x7a8a96], ['stone_largeA', 18, 0x8aa0b0]],
    pots: [['barrel', 14], ['chest', 12], ['bottle-large', 12]], scatter: [['grass_large', 20, 18, 0x2f7a52], ['Bush_4_A_Color1', 12, 34, 0xff7a6a], ['Bush_1_A_Color1', 12, 50, 0xc06ad0], ['rocks-b', 8, 60, 0x8aa0b0]],
    light: { amb: [0x2a5a8c, 0.55], hemi: [0x6ab8f0, 0x061a26, 0.5], sun: [0x8fd8ff, 0.8], lamp: 2.4, lampCol: 0xa8f0ff, fog: 0x05223c, fogK: [0.8, 1.6], exposure: 0.85, glow: 0x111418 },
  },
  5: {   // the Gates of Hell: obsidian, fire altars, gates, bones
    wall: ['cliff_block_stone', 0x4a2a28], wallH: [1.1, 1.8],
    obs: [['fire-basket', 26, 0x6a4a40], ['crypt-small', 48, OBSID], ['pillar-obelisk', 46, OBSID], ['altar-stone', 22, OBSID], ['fire-basket', 26, 0x6a4a40], ['crypt-small', 48, OBSID]],
    map: [['statue_head', 30, OBSID], ['statue_head', 30, OBSID], ['statue_head', 30, OBSID], ['fire-basket', 26], ['pillar-obelisk', 44, OBSID], ['crypt-small', 44, OBSID],
      ['tree_dead_medium', 40], ['gravestone-round', 18, OBSID], ['fire-basket', 26], ['fire-basket', 26], ['fire-basket', 26], ['crypt-small', 44, OBSID],
      ['altar-stone', 18, OBSID], ['debris', 8], ['debris', 8], ['column-large', 46, OBSID]],
    pots: [['urn-round', 14, 0x8a5a4a], ['coffin', 12, 0x8a5a4a]], scatter: [['bone_A', 4, 20], ['skull', 5, 44], ['ribcage', 9, 70], ['tree_dead_large', 60, 160], ['post_skull', 26, 120]],
    light: { amb: [0x7a2614, 1.15], hemi: [0xff7a4a, 0x2a0606, 0.6], sun: [0xff7038, 1.0], lamp: 3.4, lampCol: 0xffb878, fog: 0x220602, fogK: [1.0, 1.9], exposure: 1.3, glow: 0x553322 },
  },
};
const ACT1_LIGHT = { amb: [0x3a3458, 0.32], hemi: [0x6a5f98, 0x120a0a, 0.18], sun: [0, 0], lamp: 3.4, lampCol: 0xffdcb0, fog: 0x000000, fogK: [0.95, 1.75], exposure: 1.15, glow: 0x333333 };

const pickW = (list, h) => { const t = list.reduce((s, [, w]) => s + w, 0); let r = h % t; for (const [k, w] of list) { if ((r -= w) < 0) return k; } return list[0][0]; };
const hashC = (x, y) => hash2(x * 31 + 7, y * 17 + 11);
const CREATURES = [...new Set(Object.values(FOE).filter(s => s.g).map(s => s.g))];

export async function init3D() {
  const R = new Renderer3D();
  await R.load();
  R.loadOutdoors();   // Acts II-V and the creatures, in the background: until they arrive those acts draw in HD
  return R;
}

class Renderer3D {
  constructor() {
    const cv = document.createElement('canvas');
    cv.id = 'r3d';
    cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:absolute;display:block;pointer-events:none;visibility:hidden';
    canvas.parentNode.insertBefore(cv, canvas);
    this.canvas = cv;
    const r = this.gl = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.15;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.Fog(0x000000, 300, 700);
    this.camera = new THREE.PerspectiveCamera(CAM.fov, 4 / 3, 8, 4000);
    this.size = '';
    this.actors = new Map();      // entity -> Actor
    this.dying = [];              // actors playing their death after the monster is gone
    this.pools = new Map();       // spec key -> free Actors
    this.want = new Set();        // entities with a model this frame
    this.obsSet = new Set();      // obstacles and map props, all drawn as 3D pieces
    this.lastT = uiTime;
    this.mapKey = '';
    this.act = 0;
    this.outdoors = false;        // Acts II-V's pieces and the creatures, once loaded
    this.quality = 0; this.off = false; this.slow = { t: 0, n: 0, sum: 0, last: 0 };
    this.modeledSprites = new Set();
    this.loader = new GLTFLoader();
  }
  get(f) { return this.loader.loadAsync(BASE + f.replace(/\.glb$/, EXT)); }

  async load() {
    const models = [...new Set([...Object.values(HERO), ...Object.values(FOE)].filter(s => s.m).map(s => s.m))];
    const [dungeon, weapons, anims, ...chars] = await Promise.all([this.get('dungeon.glb'), this.get('weapons.glb'), this.get('anim-medium.glb'), ...models.map(m => this.get(m + '.glb'))]);
    this.tpl = new Map(models.map((m, i) => [m, chars[i]]));
    this.clips = new Map(anims.animations.map(a => [a.name, a]));
    this.pieces = new Map();
    for (const n of dungeon.scene.children) this.pieces.set(n.name, n);
    dungeon.scene.traverse(o => { if (o.isMesh && !o.material._crypt) { o.material.color.multiply(new THREE.Color(0x8c8a9a)); o.material._crypt = true; } });
    this.weapons = new Map();
    for (const n of weapons.scene.children) this.weapons.set(n.name, n);
    this.creatures = new Map();
    this.markModeled();
    this.build();
  }
  async loadOutdoors() {
    try {
      const [nature, ...cr] = await Promise.all([this.get('nature.glb'), ...CREATURES.map(c => this.get('creatures/' + c + '.glb'))]);
      for (const g of [nature, ...cr]) unmetal(g.scene);
      for (const n of nature.scene.children) this.pieces.set(n.name, n);
      CREATURES.forEach((c, i) => this.creatures.set(c, prepCreature(cr[i])));
      this.outdoors = true;
      this.markModeled();
    } catch (e) { console.warn('3D: outdoor acts unavailable:', e && e.message); }
  }
  // the 2D pass leaves out the death sprites of anything that dies as a model
  markModeled() {
    this.modeledSprites = new Set(Object.keys(FOE).filter(k => ENEMY_TYPES[k] && this.specReady(FOE[k])).map(k => ENEMY_TYPES[k].sprite));
  }
  specReady(spec) { return spec.m ? this.tpl.has(spec.m) : this.creatures.has(spec.g); }

  build() {
    const S = this.scene;
    // light: a fill, a lantern over the hero (shadows indoors), a sun (shadows outdoors), point lights for fires and blasts
    this.amb = new THREE.AmbientLight(0xffffff, 0.3);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 0.2);
    S.add(this.amb, this.hemi);
    const lamp = this.lamp = new THREE.SpotLight(0xffe2b8, 3.4, 560, 0.62, 0.85, 0);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(2048, 2048);
    lamp.shadow.camera.near = 20; lamp.shadow.camera.far = 700;
    lamp.shadow.bias = -0.0004; lamp.shadow.normalBias = 0.6;
    S.add(lamp, lamp.target);
    const sun = this.sun = new THREE.DirectionalLight(0xffffff, 0);
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -420, right: 420, top: 420, bottom: -420, near: 10, far: 1600 });
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.8;
    S.add(sun, sun.target);
    this.points = [];
    for (let i = 0; i < 10; i++) { const p = new THREE.PointLight(0xffffff, 0, 100, 0); S.add(p); this.points.push(p); }
    // instanced floor, walls, caps and props (Act I's are made now; the other acts' on first use)
    this.kits = new Map();
    for (const [n] of FLOOR_PIECES) this.kit(n, null, 1600).receive();
    for (const [n] of WALL_PIECES) this.kit(n, null, 1600).cast().receive();
    this.kit('wall_half', null, 400).cast().receive();
    this.kit('torch_mounted', null, 200);
    for (const n of new Set([...OBS_PIECES, ...MAP_PIECES, ...POT_PIECES, 'torch_lit'])) this.kit(n, null, 200).cast().receive();
    const capGeo = new THREE.PlaneGeometry(CELL, CELL).rotateX(-Math.PI / 2);
    this.caps = new THREE.InstancedMesh(capGeo, new THREE.MeshLambertMaterial({ color: 0x2b2735 }), 2000);
    this.caps.frustumCulled = false;
    S.add(this.caps);
    // the flat layer from the 2D renderer, lying just above the floor
    this.ovTex = new THREE.CanvasTexture(document.createElement('canvas'));
    this.ovTex.colorSpace = THREE.SRGBColorSpace;
    this.ovTex.minFilter = THREE.LinearFilter; this.ovTex.magFilter = THREE.LinearFilter; this.ovTex.generateMipmaps = false;
    // lit like the floor it lies on, with a faint glow of its own so gems and effects still read in the dark
    this.overlay = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ map: this.ovTex, emissiveMap: this.ovTex, emissive: 0x333333, transparent: true, depthWrite: false }));
    this.overlay.receiveShadow = true;
    this.overlay.renderOrder = 2;
    this.overlay.frustumCulled = false;
    S.add(this.overlay);
    this.bills = new Billboards(S);
    // projectiles: a glowing orb at hand height over each shot's flat sprite (bloom does the rest)
    this.orbs = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), 1500);
    this.orbs.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(1500 * 3), 3);
    this.orbs.frustumCulled = false;
    S.add(this.orbs);
    // post: bloom on the bright stuff, then tone mapping and sRGB
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.gl, rt);
    this.composer.addPass(new RenderPass(S, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.45, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  // one instanced kit per (piece, tint), made on first use; the tint gets its own copies of the materials
  kit(name, tint, max = 400) {
    const key = name + '|' + JSON.stringify(tint ?? null);
    let k = this.kits.get(key);
    if (k) return k;
    const src = this.pieces.get(name);
    if (!src) return null;
    k = new Kit(tint == null ? src : tintClone(src, tint), max);
    this.kits.set(key, k);
    this.scene.add(k.group);
    return k;
  }

  supports(act) { return !this.off && (act === 1 || (this.outdoors && !!ACT[act])); }
  // average real frame time over ~2.5 s of play; over 40 ms, drop a quality step
  adapt() {
    const now = performance.now(), s = this.slow, dt = s.last ? now - s.last : 0;
    s.last = now;
    if (!ADAPT || !dt || dt > 1500 || scene !== 'play' || menus.length) return;   // (a long gap is a hidden tab, not a slow frame)
    s.sum += dt; s.n++;
    if (s.sum < 2500) return;
    const avg = s.sum / s.n;
    s.sum = 0; s.n = 0;
    if (avg < 40) return;
    this.quality++;
    if (this.quality === 1) { this.gl.setPixelRatio(1); this.composer.setPixelRatio(1); this.size = ''; this.pr = 1; }
    else if (this.quality === 2) { this.gl.shadowMap.enabled = false; this.lamp.castShadow = false; this.sun.castShadow = false; }
    else if (this.quality === 3) this.bloom.enabled = false;
    else { this.off = true; console.warn('3D: too slow here, switching to HD'); }
  }
  has(x) { return this.want.has(x) || this.obsSet.has(x); }   // drawn here, so the 2D pass leaves it out
  modeledSprite(s) { return this.modeledSprites.has(s); }
  project(x, z, h = 0) {
    const v = new THREE.Vector3(x, h, z).project(this.camera);
    return [Math.round((v.x * 0.5 + 0.5) * W), Math.round((0.5 - v.y * 0.5) * H)];
  }

  // the backing canvas follows #game's on-screen box
  fit() {
    const st = canvas.style, key = st.width + st.height + st.left + st.top;
    if (key === this.size) return;
    this.size = key;
    Object.assign(this.canvas.style, { width: st.width, height: st.height, left: st.left, top: st.top });
    const w = parseFloat(st.width), h = parseFloat(st.height), pr = this.pr || Math.min(window.devicePixelRatio || 1, 2);
    this.gl.setPixelRatio(pr);
    this.gl.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // a new act: its light, fog and sky; its pieces come and go with buildMap / placeProps
  enterAct(act) {
    this.act = act;
    this.mapKey = '';
    const L = act === 1 ? ACT1_LIGHT : ACT[act].light;
    this.L = L;
    this.amb.color.setHex(L.amb[0]); this.amb.intensity = L.amb[1];
    this.hemi.color.setHex(L.hemi[0]); this.hemi.groundColor.setHex(L.hemi[1]); this.hemi.intensity = L.hemi[2];
    this.sun.color.setHex(L.sun[0]); this.sun.intensity = L.sun[1];
    this.lamp.intensity = L.lamp;
    const shadows = this.quality < 2;
    this.sun.castShadow = shadows && L.sun[1] > 0 && !L.lamp;   // one shadow-casting light at a time
    this.lamp.castShadow = shadows && L.lamp > 0;
    this.scene.fog.color.setHex(L.fog);
    this.scene.background.setHex(L.fog);
    this.gl.toneMappingExposure = L.exposure;
    this.overlay.material.emissive.setHex(L.glow);
    for (const k of this.kits.values()) { k.begin(); k.end(); }
    this.caps.count = 0;
  }

  frame() {
    this.adapt();
    this.fit();
    if (state.act !== this.act) this.enterAct(state.act);
    const dt = Math.min(0.1, Math.max(0, uiTime - this.lastT));
    this.lastT = uiTime;
    const px = player.x / PX, pz = player.y / PX;
    // camera: behind and above the hero, a three-quarter view looking down at about 47 degrees
    const D = H * CAM.zoom / (2 * Math.tan(CAM.fov * Math.PI / 360));
    let sx = 0, sz = 0;
    if (state.shake > 0.5 && !REDUCED) { sx = rand(-state.shake, state.shake) / 3; sz = rand(-state.shake, state.shake) / 3; }
    this.camera.position.set(px + sx, D * Math.sin(CAM.pitch), pz + D * Math.cos(CAM.pitch) + sz);
    this.camera.lookAt(px + sx, CAM.aim, pz + sz - 6);
    this.camera.updateMatrixWorld();
    this.scene.fog.near = D * this.L.fogK[0]; this.scene.fog.far = D * this.L.fogK[1];
    // which monsters get a model: the nearest ones with a model to show
    this.pickActors();
    // the patch of floor in view, painted by the 2D renderer
    const fp = this.footprint(D * 1.8);
    const g = ground3D(fp.x, fp.y, fp.w, fp.h);
    if (this.ovTex.image !== g.canvas) this.ovTex.image = g.canvas;
    this.ovTex.needsUpdate = true;
    this.overlay.position.set(fp.x + fp.w / 2, 0.7, fp.y + fp.h / 2);
    this.overlay.scale.set(fp.w, 1, fp.h);
    if (this.act === 1) this.buildCrypt(fp); else this.buildOutdoors(fp);
    this.placeProps();
    this.syncActors(dt);
    this.bills.draw(g.bbs, this.camera, px, pz, this.L.day || 0);
    this.placeOrbs();
    this.light(px, pz);
    this.composer.render();
  }

  // the floor rectangle (in dots) the camera sees, out to the fog
  footprint(maxD) {
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    const o = this.camera.position, v = new THREE.Vector3();
    for (const [nx, ny] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 1]]) {
      v.set(nx, ny, 0.5).unproject(this.camera).sub(o).normalize();
      const t = Math.min(v.y < -1e-3 ? -o.y / v.y : 1e9, maxD);
      const gx = o.x + v.x * t, gz = o.z + v.z * t;
      x0 = Math.min(x0, gx); x1 = Math.max(x1, gx); z0 = Math.min(z0, gz); z1 = Math.max(z1, gz);
    }
    const pad = 24;
    x0 = Math.floor(x0 - pad); z0 = Math.floor(z0 - pad); x1 = Math.ceil(x1 + pad); z1 = Math.ceil(z1 + pad);
    // cap the painted area (it is redrawn every frame)
    const w = Math.min(x1 - x0, 1400), h = Math.min(z1 - z0, 1000);
    return { x: Math.round((x0 + x1 - w) / 2), y: Math.round((z0 + z1 - h) / 2), w, h };
  }
  cellRange(fp) {
    const pcx = Math.floor(player.x / MC), pcz = Math.floor(player.y / MC);
    const r = { cx0: Math.floor(fp.x / CELL) - 1, cz0: Math.floor(fp.y / CELL) - 1, cx1: Math.ceil((fp.x + fp.w) / CELL) + 1, cz1: Math.ceil((fp.y + fp.h) / CELL) + 1, pcx, pcz };
    const key = [r.cx0, r.cz0, r.cx1, r.cz1, pcx, pcz, mapSeed, state.act].join();
    if (key === this.mapKey) return null;
    this.mapKey = key;
    return r;
  }
  // between the camera and the hero (a few cells south of you): walls and ridges are cut down
  cut(x, z, r) { return z > r.pcz && z <= r.pcz + 4 && Math.abs(x - r.pcx) <= 4; }

  // Act I: floor tiles, walls, wall tops and wall torches
  buildCrypt(fp) {
    const r = this.cellRange(fp);
    if (!r) return;
    for (const k of this.kits.values()) k.begin();
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const wallLook = (x, z) => { const t = cellType(cellAt(x, z)); return t === T_WA || t === T_WB; };
    let caps = 0;
    this.torches = [];
    for (let z = r.cz0; z <= r.cz1; z++) for (let x = r.cx0; x <= r.cx1; x++) {
      const t = cellType(cellAt(x, z)), h = hashC(x, z);
      const ccx = (x + 0.5) * CELL, ccz = (z + 0.5) * CELL;
      if (t === T_WA || t === T_WB) {
        const cut = this.cut(x, z, r);
        const wh = cut ? WALL_H / 2 : WALL_H;
        m.compose(p.set(ccx, wh, ccz), q.identity(), s.set(1, 1, 1));
        this.caps.setMatrixAt(caps++, m);
        for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          if (wallLook(x + dx, z + dz)) continue;
          const off = CELL / 2 - KIT * 0.5;
          q.setFromAxisAngle(up, Math.atan2(dx, dz));
          m.compose(p.set(ccx + dx * off, 0, ccz + dz * off), q, s.set(KIT, KIT, KIT));
          const hh = hashC(x * 3 + dx, z * 3 + dz);
          this.kit(cut ? 'wall_half' : pickW(WALL_PIECES, hh)).add(m);
          if (!cut && hh % 9 === 0) {   // a torch on the wall now and then
            m.compose(p.set(ccx + dx * (CELL / 2), WALL_H * 0.55, ccz + dz * (CELL / 2)), q, s.set(KIT, KIT, KIT));
            this.kit('torch_mounted').add(m);
            this.torches.push([ccx + dx * (CELL / 2 + 6), ccz + dz * (CELL / 2 + 6)]);
          }
        }
        continue;
      }
      if (t === T_LA || t === T_LB) continue;   // liquid: painted on the flat layer
      q.setFromAxisAngle(up, ((h >>> 3) & 3) * Math.PI / 2);
      m.compose(p.set(ccx, 0, ccz), q, s.set(KIT, KIT, KIT));
      this.kit(pickW(FLOOR_PIECES, h)).add(m);
    }
    this.caps.count = caps;
    this.caps.instanceMatrix.needsUpdate = true;
    this.endStatic();
  }

  // Acts II-V: rock blocks for the walls (each a little taller or shorter), and scattered dressing on open ground
  buildOutdoors(fp) {
    const r = this.cellRange(fp);
    if (!r) return;
    const A = ACT[this.act];
    for (const k of this.kits.values()) k.begin();
    this.torches = [];
    const wk = this.kit(A.wall[0], A.wall[1], 2400).cast().receive();
    for (let z = r.cz0; z <= r.cz1; z++) for (let x = r.cx0; x <= r.cx1; x++) {
      const c = cellAt(x, z), t = cellType(c), h = hashC(x, z);
      const ccx = (x + 0.5) * CELL, ccz = (z + 0.5) * CELL;
      if (t === T_WA || t === T_WB) {
        const k = A.wallH[0] + ((h >>> 5) % 100) / 100 * (A.wallH[1] - A.wallH[0]);
        wk.place(ccx, ccz, 0, CELL / wk.size.x, (this.cut(x, z, r) ? 0.45 : k) * CELL / wk.size.y, CELL / wk.size.z);
        continue;
      }
      if (t !== T_FLOOR && t !== T_FA && t !== T_FB) continue;   // liquids and bridges: painted
      if (c >> 8) continue;                                       // a map prop stands here
      for (const [name, ht, every, tint] of A.scatter) {           // every Nth cell (by hash) gets one
        if ((h >>> 7) % every) continue;
        const sk = this.kit(name, tint ?? null, 1200);
        if (!sk) break;
        const ox = ((h >>> 11) % 17 - 8) * CELL / 24, oz = ((h >>> 15) % 17 - 8) * CELL / 24;
        sk.place(ccx + ox, ccz + oz, (h % 360) * Math.PI / 180, ht / sk.size.y);
        break;
      }
    }
    this.endStatic();
  }
  endStatic() { for (const k of this.kits.values()) if (!k.dynamic) k.end(); }

  // obstacles, map props, braziers and pots: rebuilt every frame (pots break, braziers go out)
  placeProps() {
    const dyn = [];
    const use = (name, tint) => { const k = this.kit(name, tint ?? null, 300); if (k && !k.dynamic) { k.dynamic = true; k.cast().receive(); } if (k && !dyn.includes(k)) { dyn.push(k); } return k; };
    for (const k of this.kits.values()) if (k.dynamic) k.begin();
    const A = ACT[this.act];
    for (const o of state.obsList || []) {
      const h = hash2(Math.round(o.x), Math.round(o.y)), yaw = (h % 4) * Math.PI / 2;
      if (!A) { const k = use(o.mapProp ? MAP_PIECES[o.mapProp % MAP_PIECES.length] : OBS_PIECES[o.kind % OBS_PIECES.length]); k && k.place(o.x / PX, o.y / PX, yaw, KIT, KIT, KIT, true); continue; }
      const [name, ht, tint] = o.mapProp ? A.map[(o.mapProp - 1) % A.map.length] : A.obs[o.kind % A.obs.length];
      const k = use(name, tint);
      if (k) k.place(o.x / PX, o.y / PX, (h % 360) * Math.PI / 180, ht / k.size.y);
    }
    for (const bz of state.brazList || []) {
      const h = hash2(Math.round(bz.x), Math.round(bz.y));
      if (bz.pot) {
        if (!A) { const k = use(POT_PIECES[h % POT_PIECES.length]); k && k.place(bz.x / PX, bz.y / PX, (h % 8) * Math.PI / 4, KIT * 0.8, KIT * 0.8, KIT * 0.8, true); continue; }
        const [name, ht, tint] = A.pots[h % A.pots.length];
        const k = use(name, tint);
        if (k) k.place(bz.x / PX, bz.y / PX, (h % 8) * Math.PI / 4, ht / k.size.y);
      } else {
        const k = use('torch_lit');
        if (k) k.place(bz.x / PX, bz.y / PX, 0, KIT * 1.3, KIT * 1.3, KIT * 1.3, true);
      }
    }
    for (const k of this.kits.values()) if (k.dynamic) k.end();
  }

  placeOrbs() {
    const m = new THREE.Matrix4(), c = new THREE.Color(), o = this.orbs;
    let n = 0;
    const put = (x, y, h, r, col, k = 2.2) => {
      if (n >= 1500) return;
      m.makeScale(r, r, r).setPosition(x / PX, h, y / PX);
      o.setMatrixAt(n, m);
      o.setColorAt(n, c.setHex(col).multiplyScalar(k));
      n++;
    };
    for (const b of bullets) {
      const h = 12 + (b.h || 0) / PX;
      if (b.kind === 'hammer') put(b.x, b.y, h, 3.2, 0x5aa0ff);
      else if (b.kind === 'acid') put(b.x, b.y, h, 2, 0x8cff3c);
      else if (b.kind === 'sushi') put(b.x, b.y, h, b.mega ? 7 : 2, 0xff8a4a, 1.4);
      else if (b.kind === 'card') put(b.x, b.y, h, 1.8, 0xd070ff);
      else if (b.kind === 'star') put(b.x, b.y, h, 1.6, 0xffffff, 1.6);
      else if (b.kind === 'glaive') put(b.x, b.y, h, 2.4, 0xffa040);
      else if (b.kind === 'bubble') put(b.x, b.y, h, 2, 0x9ff0ff);
      else put(b.x, b.y, h, 1.7, 0xff5a3a);
    }
    for (const b of ebullets) put(b.x, b.y, 12, b.style === 'acid' ? 2.4 : 2.8, b.style === 'acid' ? 0x9cff2a : b.style === 'thorn' ? 0x3c8a2a : 0xff7a20, b.style === 'thorn' ? 1 : 2.4);
    o.count = n;
    o.instanceMatrix.needsUpdate = true;
    if (o.instanceColor) o.instanceColor.needsUpdate = true;
  }

  pickActors() {
    this.obsSet = new Set(state.obsList || []);
    this.want.clear();
    if (HERO[player.heroId]) this.want.add(player);
    const cand = [];
    for (const e of enemies) { const sp = FOE[e.boss ? e.key : e.kind]; if (sp && !e.burrowed && this.specReady(sp)) cand.push(e); }
    if (cand.length > MAX_ACTORS) {
      for (const e of cand) e._d = dist2(e.x, e.y, player.x, player.y);
      cand.sort((a, b) => a._d - b._d).length = MAX_ACTORS;
    }
    for (const e of cand) this.want.add(e);
  }

  actorFor(spec, key) {
    const pool = this.pools.get(key);
    const a = (pool && pool.pop()) || new Actor(this, spec, key);
    this.scene.add(a.holder);
    return a;
  }
  release(a) {
    this.scene.remove(a.holder);
    a.reset();
    if (!this.pools.has(a.key)) this.pools.set(a.key, []);
    this.pools.get(a.key).push(a);
  }

  syncActors(dt) {
    const alive = new Set(enemies);
    for (const [ent, a] of this.actors) {
      if (this.want.has(ent)) continue;
      this.actors.delete(ent);
      if (ent !== player && !alive.has(ent) && !ent.sweep && !ent.treasure) { a.die(); this.dying.push(a); }   // killed: play the death out
      else this.release(a);
    }
    for (const ent of this.want) {
      let a = this.actors.get(ent);
      const spec = ent === player ? HERO[player.heroId] : FOE[ent.boss ? ent.key : ent.kind];
      const key = ent === player ? 'hero:' + player.heroId : ent.boss ? 'boss:' + ent.key : 'foe:' + ent.kind;
      if (!a || a.key !== key) { if (a) this.release(a); a = this.actorFor(spec, key); this.actors.set(ent, a); a.place(ent, true); }
      if (ent === player) a.updateHero(dt); else a.updateFoe(ent, dt);
    }
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const a = this.dying[i];
      a.mixer.update(dt);
      a.deadT += dt;
      if (a.deadT > 1.2) a.holder.position.y -= dt * 18;   // then sink into the floor
      if (a.deadT > 2.2) { this.dying.splice(i, 1); this.release(a); }
    }
  }

  // the act's key light (a lantern over the hero, or the sun), and the brightest nearby fires, blasts and glows
  light(px, pz) {
    const L = this.lamp, Lc = this.L;
    L.position.set(px + 30, 260, pz + 90);
    L.target.position.set(px, 0, pz);
    L.target.updateMatrixWorld();
    L.color.setHex(state.berserkT > 0 ? 0xff7060 : Lc.lampCol || 0xffffff);
    if (this.sun.intensity > 0) {   // a high sun from the upper left; its shadow box follows the hero
      this.sun.position.set(px - 260, 620, pz - 160);
      this.sun.target.position.set(px, 0, pz);
      this.sun.target.updateMatrixWorld();
    }
    const cand = [];
    sceneLights((wx, wy, r, k) => {
      const x = wx / PX, z = wy / PX, d = Math.hypot(x - px, z - pz);
      if (k === 'hero' || d > 520) return;
      cand.push({ x, z, r: r * 1.6, k, score: r / (60 + d) });
    });
    for (const [x, z] of this.torches || []) { const d = Math.hypot(x - px, z - pz); if (d < 520) cand.push({ x, z, r: 70, k: 'fire', score: 0.5 / (60 + d) }); }
    cand.sort((a, b) => b.score - a.score);
    const day = this.act === 2;
    this.points.forEach((p, i) => {
      const c = cand[i];
      if (!c || (day && c.k === 'fire')) { p.intensity = 0; return; }   // no torchlight needed under the desert sun
      const col = LIGHT_COL[c.k] || [1, 0.9, 0.7], fl = c.k === 'fire' ? 0.85 + Math.sin(uiTime * 13 + c.x) * 0.15 : 1;
      p.color.setRGB(Math.min(1, col[0]), Math.min(1, col[1]), Math.min(1, col[2]));
      p.position.set(c.x, c.k === 'fire' ? 22 : 14, c.z);
      p.distance = c.r;
      p.intensity = 2.2 * fl;
    });
  }
}

// Kenney's and the converted models' materials leave metalness unset, which glTF reads as fully metallic:
// with nothing to reflect they'd render near-black. They're plain painted surfaces.
function unmetal(root) {
  root.traverse(o => { if (!o.isMesh) return; for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m.metalness === 1 && !m.metalnessMap) m.metalness = 0; });
}

// a piece with its own copies of the materials, recoloured: a number multiplies every colour in, { set } repaints
// them all, any other object repaints the materials it names (and multiplies its '*' into the rest)
function tintClone(src, tint) {
  const node = src.clone();
  node.traverse(o => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const out = mats.map(m => {
      const c = m.clone();
      if (typeof tint === 'number') c.color.multiply(new THREE.Color(tint));
      else if (tint.set !== undefined) c.color.setHex(tint.set);
      else if (tint[m.name] !== undefined) c.color.setHex(tint[m.name]);
      else if (tint['*'] !== undefined) c.color.multiply(new THREE.Color(tint['*']));
      return c;
    });
    o.material = Array.isArray(o.material) ? out : out[0];
  });
  node.parent = src.parent;   // same place in the file, so the offsets match the original
  return node;
}

// instanced copies of one packed piece (every mesh inside it, at its offset); size: its bounding box in its own units
class Kit {
  constructor(node, max) {
    this.group = new THREE.Group();
    this.parts = [];
    this.n = 0;
    this.max = max;
    (node.parent || node).updateMatrixWorld(true);
    node.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(node.matrixWorld).invert();
    const box = new THREE.Box3();
    node.traverse(o => {
      if (!o.isMesh) return;
      const local = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      box.union(o.geometry.boundingBox.clone().applyMatrix4(local));
      const im = new THREE.InstancedMesh(o.geometry, o.material, max);
      im.count = 0;
      im.frustumCulled = false;
      this.group.add(im);
      this.parts.push({ im, local });
    });
    this.size = box.getSize(new THREE.Vector3());
    if (!this.size.y) this.size.set(1, 1, 1);
    this.minY = box.min.y;
    this.tmp = new THREE.Matrix4();
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.p = new THREE.Vector3(); this.s = new THREE.Vector3();
  }
  cast() { for (const p of this.parts) p.im.castShadow = true; return this; }
  receive() { for (const p of this.parts) p.im.receiveShadow = true; return this; }
  begin() { this.n = 0; }
  add(m) {
    if (this.n >= this.max) return;
    for (const p of this.parts) p.im.setMatrixAt(this.n, this.tmp.multiplyMatrices(m, p.local));
    this.n++;
  }
  // stand one on the ground at (x, z), turned by yaw, scaled (uniformly, or per axis); `raw` keeps the
  // piece's own origin instead of sitting its lowest point on the floor
  place(x, z, yaw, sx, sy = sx, sz = sx, raw = false) {
    this.q.setFromAxisAngle(UP, yaw);
    this.m.compose(this.p.set(x, raw ? 0 : -this.minY * sy, z), this.q, this.s.set(sx, sy, sz));
    this.add(this.m);
  }
  end() { for (const p of this.parts) { p.im.count = this.n; p.im.instanceMatrix.needsUpdate = true; } }
}
const UP = new THREE.Vector3(0, 1, 0);

// a creature file: its height (to size it), and its clips found by name (each pack names them its own way)
function prepCreature(gltf) {
  gltf.scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(gltf.scene, true);   // precise: through the skin (converted FBX rigs carry the scale in their bones)
  const find = (...res) => { for (const re of res) { const c = gltf.animations.find(a => re.test(a.name)); if (c) return c; } return null; };
  const idle = find(/idle$/i, /\|idle/i, /^idle$/i, /flying$/i, /swim$/i);
  const move = find(/walk$/i, /^walk$/i, /_run$/i, /flying$/i, /swim$/i, /sprint/i) || idle;
  return { gltf, h: box.max.y - box.min.y || 1, minY: box.min.y,
    clips: { idle: idle || move, move, attack: find(/attack$/i, /attack-melee-right/i, /attack/i) || move, death: find(/death$/i, /^die$/i, /death/i, /die/i) } };
}

// a character: a skinned model, weapons in hand, its own animation mixer and materials (for flashes and tints)
class Actor {
  constructor(R, spec, key) {
    this.R = R; this.spec = spec; this.key = key;
    this.cr = spec.g ? R.creatures.get(spec.g) : null;
    this.glow = spec.glow !== undefined ? new THREE.Color(spec.glow) : null;
    this.root = SkeletonUtils.clone((this.cr ? this.cr.gltf : R.tpl.get(spec.m)).scene);
    this.mats = [];
    const tint = spec.tint !== undefined ? new THREE.Color(spec.tint) : null;
    this.casters = [];
    this.root.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true;
      this.casters.push(o);
      o.frustumCulled = false;
      if (spec.hide && spec.hide.includes(o.name)) { o.visible = false; return; }
      const mats = (Array.isArray(o.material) ? o.material : [o.material]).map(m => {
        const c = m.clone();
        if (spec.paint !== undefined) c.color.setHex(spec.paint);
        else if (tint) c.color.multiply(tint);
        if (!c.emissive) c.emissive = new THREE.Color(0);
        this.mats.push(c);
        return c;
      });
      o.material = Array.isArray(o.material) ? mats : mats[0];
    });
    for (const [slot, w] of [['handslot.r', spec.r], ['handslot.l', spec.l]]) {
      const bone = w && this.root.getObjectByName(slot), src = w && R.weapons.get(w);
      if (!bone || !src) continue;
      const wp = src.clone();
      wp.position.set(0, 0, 0); wp.rotation.set(0, 0, 0);
      wp.traverse(o => { if (o.isMesh) { o.castShadow = true; this.casters.push(o); } });
      bone.add(wp);
    }
    this.holder = new THREE.Group();
    this.holder.add(this.root);
    this.mixer = new THREE.AnimationMixer(this.root);
    this.reset();
  }
  reset() {
    this.mixer.stopAllAction();
    this.cur = null; this.clip = ''; this.deadT = 0;
    this.lx = null; this.lz = null; this.yaw = 0; this.flashK = -1;
    this.holder.position.y = 0;
  }
  // a KayKit clip by name, or (creatures) one of idle / move / attack / death
  play(name, once = false, speed = 1, fade = 0.18) {
    if (this.clip === name) { if (this.cur) this.cur.timeScale = speed; return; }
    const clip = this.cr ? this.cr.clips[name] : this.R.clips.get(name);
    if (!clip) return;
    const a = this.mixer.clipAction(clip);
    a.reset();
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.timeScale = speed;
    a.play();
    if (this.cur) this.cur.crossFadeTo(a, fade, false);
    this.cur = a; this.clip = name;
  }
  // put it where the entity is; turn to face where it's going
  place(e, snap) {
    const x = e.x / PX, z = e.y / PX;
    let vx = 0, vz = 0;
    if (this.lx !== null) { vx = x - this.lx; vz = z - this.lz; }
    this.lx = x; this.lz = z;
    const lift = (e.fly ? e.fly / PX + Math.sin(e.animT * 9) * 1.5 : 0) + (this.spec.hover ? this.spec.hover + Math.sin(e.animT * 4) * 1.2 : 0);
    this.holder.position.set(x, lift, z);
    return Math.hypot(vx, vz) > 0.05 && !snap ? Math.atan2(vx, vz) : null;
  }
  turnTo(yaw, dt, rate = 14) {
    let d = yaw - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * rate);
    this.root.rotation.y = this.yaw + (this.spec.rot || 0);
  }
  setFlash(k, col) {
    if (k === this.flashK && !col) return;
    this.flashK = k;
    for (const m of this.mats) { m.emissive.copy(col || WHITE).multiplyScalar(k); if (this.glow) m.emissive.add(this.glow); }
  }
  updateHero(dt) {
    const sc = MAN * (this.spec.s || 1);
    this.root.scale.setScalar(sc);
    this.place(player);
    this.turnTo(Math.atan2(player.facing.x, player.facing.y), dt);
    const atk = player.attackAge < 0.35 && !player.moving;
    if (player.moving) this.play('Running_A', false, 1.15);
    else if (atk) this.play(this.spec.atk || 'Throw', false, 1.6);
    else if (this.clip !== (this.spec.atk || 'Throw') || this.cur.time > this.cur.getClip().duration * 0.9) this.play('Idle_A');
    const hurt = player.hurtCd > 0.3 && state.berserkT <= 0;
    this.setFlash(state.berserkT > 0 ? 0.35 : hurt ? 0.6 : 0, state.berserkT > 0 ? RAGE : hurt ? HURT : null);
    this.mixer.update(dt);
  }
  updateFoe(e, dt) {
    const base = e.boss ? (this.cr ? 1 : e.r / 12) : (e.elite ? 1.9 : 1) * clamp(e.scale / SCALE, 0.8, 1.6);
    if (this.cr) this.root.scale.setScalar(this.spec.h / this.cr.h * base);
    else this.root.scale.setScalar(MAN * base * (this.spec.s || 1));
    const yaw = this.place(e);
    const cast = e.boss || dist2(e.x, e.y, player.x, player.y) < (SHADOW_R * PX) ** 2;
    if (cast !== this.cast) { this.cast = cast; for (const o of this.casters) o.castShadow = cast; }
    const d = Math.hypot(player.x - e.x, player.y - e.y);
    const near = d < e.r + player.r + 26;
    this.turnTo(near || yaw === null ? Math.atan2(player.x - e.x, player.y - e.y) : yaw, dt, 8);
    if (this.cr) {   // creatures: idle / move / attack from their own clips
      if (e.wind > 0 || e.casting > 0 || near) this.play('attack', false, 1.2, 0.12);
      else if (yaw !== null || e.fly || this.spec.hover) this.play('move', false, 1.2);
      else this.play('idle');
    } else {
      const skel = this.spec.skel;
      if (e.wind > 0 || e.casting > 0) this.play(this.spec.atk || 'Melee_2H_Attack_Chop', false, 1.4, 0.1);
      else if (near) this.play(this.spec.atk || 'Melee_1H_Attack_Chop', false, 1.2);
      else if (yaw !== null) this.play(skel ? 'Skeletons_Walking' : e.boss && e.chargeT > 2.8 ? 'Running_A' : 'Walking_A', false, skel ? 1.3 : 1.1);
      else this.play(skel ? 'Skeletons_Idle' : 'Idle_A');
    }
    if (e.flash > 0) this.setFlash(e.boss ? 0.18 : 0.4, WHITE);   // gentle: under constant fire it would strobe (and bloom)
    else if (e.freezeT > 0) this.setFlash(0.5, ICE);
    else if (e.elite) this.setFlash(0.12 + Math.sin(uiTime * 6) * 0.05, ELITE);
    else this.setFlash(0);
    this.mixer.update(dt);
  }
  die() {
    this.setFlash(0);
    if (this.cr) this.play('death', true, 1.2, 0.08);
    else this.play(this.spec.skel ? 'Skeletons_Death' : 'Death_A', true, 1.3, 0.08);
  }
}
const WHITE = new THREE.Color(1, 1, 1), ICE = new THREE.Color(0.5, 0.85, 1), ELITE = new THREE.Color(1, 0.55, 0.1);
const HURT = new THREE.Color(1, 0.2, 0.15), RAGE = new THREE.Color(1, 0.15, 0.1);

// billboards: sprites with no model yet, standing up and facing the camera, one instanced mesh per sheet
class Billboards {
  constructor(scene) {
    this.scene = scene;
    this.groups = new Map();
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0, 0.5, 1, 0], 3));
    this.geo.setIndex([0, 1, 2, 2, 1, 3]);
  }
  group(img) {
    let g = this.groups.get(img);
    if (g) return g;
    const tex = new THREE.Texture(img);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
    tex.flipY = false;
    tex.needsUpdate = true;
    const max = 600;
    const geo = this.geo.clone();
    const mk = (n, k) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(max * k), k); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(n, a); return a; };
    g = { tex, geo, pos: mk('iPos', 3), size: mk('iSize', 3), uv: mk('iUV', 4), flip: mk('iFlip', 1), n: 0, max };
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: tex }, uRight: { value: new THREE.Vector3() }, uUp: { value: new THREE.Vector3() }, uHero: { value: new THREE.Vector2() }, uDay: { value: 0 } },
      vertexShader: `attribute vec3 iPos; attribute vec3 iSize; attribute vec4 iUV; attribute float iFlip;
uniform vec3 uRight, uUp; uniform vec2 uHero; uniform float uDay; varying vec2 vUv; varying float vLit;
void main() {
  vec3 w = iPos + uRight * (position.x * iSize.x) + uUp * (position.y * iSize.y - iSize.z);
  vUv = vec2(mix(iUV.x, iUV.z, iFlip > 0.5 ? 0.5 - position.x : position.x + 0.5), mix(iUV.w, iUV.y, position.y));
  vLit = mix(1.0 - smoothstep(70.0, 210.0, distance(iPos.xz, uHero)) * 0.85, 1.0, uDay);   // by day, no lantern falloff
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`,
      fragmentShader: `uniform sampler2D uTex; varying vec2 vUv; varying float vLit;
void main() { vec4 t = texture2D(uTex, vUv); if (t.a < 0.5) discard; gl_FragColor = vec4(t.rgb * vLit, 1.0);
  #include <colorspace_fragment>
}`,
    });
    g.mat = mat;
    g.mesh = new THREE.Mesh(geo, mat);
    g.mesh.frustumCulled = false;
    g.mesh.renderOrder = 1;
    this.scene.add(g.mesh);
    this.groups.set(img, g);
    return g;
  }
  draw(list, cam, px, pz, day) {
    for (const g of this.groups.values()) g.n = 0;
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).normalize();
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1).normalize();
    for (const b of list || []) {
      const g = this.group(b.img);
      if (g.n >= g.max) continue;
      const r = b.img.hdRes || 1, iw = b.img.width, ih = b.img.height, i = g.n++;
      g.pos.setXYZ(i, b.x, b.lift || 0, b.z);
      g.size.setXYZ(i, b.w, b.h, b.foot || 0);
      g.uv.setXYZW(i, b.sx * r / iw, b.sy * r / ih, (b.sx + b.sw) * r / iw, (b.sy + b.sh) * r / ih);
      g.flip.setX(i, b.flip ? 1 : 0);
    }
    for (const g of this.groups.values()) {
      g.geo.instanceCount = g.n;
      g.mesh.visible = g.n > 0;
      if (!g.n) continue;
      for (const a of [g.pos, g.size, g.uv, g.flip]) a.needsUpdate = true;
      g.mat.uniforms.uRight.value.copy(right);
      g.mat.uniforms.uUp.value.copy(up);
      g.mat.uniforms.uHero.value.set(px, pz);
      g.mat.uniforms.uDay.value = day;
    }
  }
}
