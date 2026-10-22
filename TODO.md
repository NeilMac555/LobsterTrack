# TODO

Lightweight kanban maintained by Claude Code. Read at the start of every
session; update before finishing (move cards, add new ones, trim Done).

## Now

- Mutant Academy 3D overhaul, phase 2 onwards: Acts II-V in 3D (desert,
  jungle with the KayKit Forest pack, ocean, hell: floors, walls, props),
  models for the remaining monsters (Quaternius CC0 packs downloaded:
  bat, slime, dragon, spider, frog, snake, wasp, rat, fish, shark; need
  FBX -> glTF conversion; Bestiary imp/puglin are glTF), a Biski cat
  model, 3D chests/gems/pickups, 3D effects for the powers (beams, novas,
  pools), 3D title and select screens. Not yet measured on a real GPU or
  phone: the test browser has no GPU (software rendering, ~1-4 fps), so
  the gameplay tests run with ?gfx=hd and 3d-test with ?gfx=3d&q=fixed.
- GitHub Pages: needs Settings -> Pages -> Source "GitHub Actions"; to
  deploy from the feature branch, allow it under Settings -> Environments
  -> github-pages (or merge to main). URL will be
  https://neilmac555.github.io/LobsterTrack/
- Mutant Academy PS1 3D: roll out to Acts II-V (lava/water as animated
  surfaces, bridges with height, tall trees); consider low-poly CC0 models
  (Kenney / Quaternius) for columns, coffins and statues; billboard
  pickups and projectiles; check phone performance on real hardware.
- Team name normalizer gaps: Bielefeld, Greuther Fürth, Holstein Kiel,
  Ajaccio unmapped (flagged during backfill).

## Next

- Mutant Academy select screen on 4:3 screens (e.g. 1280x960, W=320):
  the hero panel runs off the bottom and the hint text overlaps it. Not
  new; needs a compact layout for short, narrow screens. The new PERK
  lines and modifier buttons make the panel taller still.
- Mutant Academy economy: shop prices (about 10k gold to max everything)
  and challenge rewards are a first guess, not tuned against real runs.
  Watch how many runs a full shop takes; pots and the goblin are the
  easiest levers. Academy progress lives in browser localStorage only
  (lost if site data is cleared; not shared between devices).
- Mutant Academy tests: with random maps a couple of checks were flaky
  once each (sanctuary light radius, butcher chest). Act V's flake was a
  level-up menu pausing the game mid-test — fixed in the test (no
  level-ups, seeded map). Seed the map in the other tests too. The
  Neil/Zoe hero test had the same level-up flake; fixed the same way.
- Mutant Academy ability balance: in a rank-5 damage probe, Singularity
  and evolved Feral Frenzy / Full House are near the top, while Iron Halo
  and Plague Flask gain little over their base powers (Plague only pays
  off when things die). Tune after some
  real runs. Ultimates have no PS1-mode check yet beyond "no errors".
- Duplicate match rows from fixture reschedules: DB sweep found ~20
  pairs of matches (same two teams, commence_time <48h apart) across
  Ligue 1, Serie A, La Liga and Bundesliga — early-season fixtures
  getting a provisional kickoff slot swapped for a confirmed TV slot,
  which makes The Odds API issue a new event ID while the old one
  lingers in the feed. Only 2 of these (both Bundesliga) have actually
  broken so far (see Done entry below), but all ~20 pairs mean the
  same real-world fixture shows as two separate cards on league pages
  today. Needs a real dedup pass (pick canonical ID, likely by which
  one keeps getting fresh Pinnacle data, and hide/merge the other) —
  bigger than a quick patch, wasn't in scope for the Betfair-fallback
  bug fix.

## Later

- Mutant Academy maps: enemies still press against walls on screen (~2-10%
  of walkers at a time, worst in hell); real pathfinding (flow field to
  the hero) would fix it if it bothers players.
- Mutant Academy HD: more source re-packs where the 1x sheet shrank big
  art (LPC jungle trees 0.62x, treant 0.57x, monkey 0.69x, nightmare
  0.6x, ghoul 0.8x) — they're on the xBR baseline for now.

- Re-fit rho/drawInflation in xG mode once 2026/27 accumulates enough
  matches (fallback fit was rejected — see fit-v1.md).
- CL/UEL restoration: needs Elo-based cross-league strengths +
  competition-specific constants. Blocked until then.
- qualityWeight/spDiscount: fit or delete once shots/SP historical
  data exists (currently unfittable).

## Done

(newest first)

- Mutant Academy: 3D graphics mode for Act I (three.js + KayKit CC0: dungeon, heroes, skeletons, Butcher; lantern shadows, bloom; HD fallback), GitHub Pages workflow (9494030)
- Mutant Academy: bosses take 15% damage from ultimates, which had been deleting the Act I Butcher in one cast (c77234c)
- Mutant Academy: Academy shop and gold bank, challenge board, weighted level-ups with reroll/skip/banish, breakable pots, 5 new map events, a perk per hero, Hyper/Hurry modifiers (fa7cc37)
- Mutant Academy: 10 evolutions (rank-5 power + partner trait at a chest), 8 new powers, 7 new traits, an ultimate for each of the 10 heroes, 25 new CC-BY icons (bb842ab)
- Mutant Academy: PS1 3D graphics mode, prototype — Act I's cathedral in
  3D (WebGL2: ground plane from the 2D renderer, wall blocks with a
  cutaway, billboard sprites, light map, fog, dither, vertex wobble,
  affine warp); GRAPHICS cycles HD / PS1 3D / RETRO — `b585160`
- Mutant Academy: voiced retro story intro (7 letterboxed scenes, typed
  text read by Piper's public-domain "Norman" voice, bell + choir); plays
  before the first game and from STORY on the title, skippable — `1267488`
- Mutant Academy: Karateh Masta — unlockable hero (beat the game) who
  throws piercing ninja death stars; locked silhouette on the select
  screen, NEW HERO UNLOCKED on the results — `23fb1f6`
- Mutant Academy: sinister new jungle theme (A phrygian, war drums,
  drone, dissonant xylophone); jungle opened up — more rivers with deep
  channels and wooden bridges/footbridges, sunlit clearings, a third of
  the trees — `57df1b2`
- Mutant Academy: real act maps (seeded per run: roads, rivers, lakes,
  ridges, templated structures, one landmark per act; walls/deep liquid
  solid, water slows, lava burns, bog poisons; DCSS CC0 terrain sheets)
  and one hidden secret per act (Biski shrine, X marks the spot, idol +
  boulder, goldfish, quokka in hell; SECRETS n/5 in bestiary); bosses
  no longer drop berserk — `f067dfa`
- Mutant Academy: HD graphics mode (default; RETRO switch on title) —
  2x pixel-art sheets (xBR 2x baseline; icons, heroes, fire skull,
  devilkin, shark rebuilt from larger sources), WebGL coloured banded
  light map + bloom under an unlit HUD layer, 2D-darkness fallback —
  `33e7f58`
- Mutant Academy: per-act scaling — fewer, tougher monsters each act
  (on-screen Act III 62→37, IV 97→35, V 138→51), act quota caps, trickle
  cap, thinner events; steeper xp curve — `f845b83`
- Mutant Academy: Act V "The Gates of Hell" — Kraken opens hell; the
  Devil (final boss, level 25) and six hell minions (ansimuz CC0,
  Sevarihk CC-BY); bosses lit in the dark — `27396e6` (base `aeda639`)
- Mutant Academy: harder balance — far fewer health pickups, berserk
  20s; WIP Act V hell level, music, hellfire rain — `aeda639`
- Mutant Academy: new hero Ana (black glasses, blonde curls) with the
  Acid Flask weapon (shatters into burning puddles), icon + voice; hero
  select up/down now wrap within a column for the 9-hero grid — `8754b1b`
- Mutant Academy: act bosses — each act's level (5/10/15/20) summons a
  giant boss that must die before the portal opens (Butcher, Maggot
  Queen, Elder Treant, Kraken); beating the Kraken wins (survival timer
  and timed Minotaurs removed); HP tuned ~40s→~90s fights — `ca5ceb0`
- Mutant Academy: Act IV "The Drowned Depths" — third portal at level
  15; seabed with deep-water light and bubbles; piranha shoals, giant
  crabs, stinging jellyfish, electric eels, ink squids, great sharks;
  the axolotl mercenary (recoloured CC0 lizard — no licensed axolotl
  exists); "Drowned Depths" FM theme — `d8dd255` (WIP base `4e47bd0`)
- Mutant Academy: Act III swarming eased (spawner top-ups stop at the
  quota; swarms only on top-ups; lighter jungle quota and caps; softer
  frogs/poison); ring-event crash fixed; Zoe made overpowered and
  dressed in black — `9622935`
- Mutant Academy: Zoe restyled as an ordinary nine-year-old — wavy brown
  hair, glasses, pink tee, jeans, white trainers (LPC child parts; bare
  feet recoloured into shoes) — `50594a9`
- Mutant Academy: Act III "The Strangling Jungle" — second portal at
  level 10; LPC Jungle scenery with canopy shade; Vine Treants, rooted
  Man-Eaters (poison thorns), Mosquito Swarms, striking Jungle Vipers,
  coconut-throwing Demon Monkeys, Giant Poison Frogs (poison + toxic
  clouds); "Green Hell" FM jungle theme — `c5abf3a` (WIP base `5fb54c5`)
- Mutant Academy: Berserk orb — rare glowing red pickup (bosses, elites,
  ~1/830 kills, braziers) gives 30s invulnerability, full heal, x1.75
  speed, x3 damage, 2.5x fire rate, bigger/extra volleys and contact
  smashing; red palette, afterimages, HUD countdown — `356f3d7`
- Mutant Academy: Act II "The Burning Sands" — a portal after 4
  level-ups leads to a daylight desert (CC0 sand/palms/rocks) with
  scarabs, Giant Flies, acid-spitting Giant Maggots, reckless Leaping
  Lizards, bestiary entries and a Hijaz-maqam FM theme — `ff9a88b`
- Mutant Academy: Iron Golems (Redshrike's CC-BY LPC Golem, recoloured
  iron) replace the green Training Ooze as opening fodder; same stats,
  stomp/smash/crumble animations — `3e983cf`

- Mutant Academy Sanctuary pass: Diablo-style cathedral arena (DCSS CC0
  cobbles, blood/bone decals, columns/statues/sarcophagus props), darkness
  with a stepped light radius + torch/projectile lights, the Butcher boss
  at 7:30 (LPC-built, cleaver chop, "AH... FRESH MEAT!", troll roar),
  Screaming Banshees (scream = damage + terrified slow). Fixed black floor
  tiles from signed hash shifts — `053d394`

- Mutant Academy heroes Neil + Zoe: Neil (bald, beard, tee, jeans) with
  Diablo II-style Blessed Hammer spiral; Zoe (10, pigtails, glasses, punk
  black/red outfit) lobbing Exploding Sushi. LPC-generator art downscaled
  to 40px (CC-BY-SA, per-part credits in CREDITS-LPC.md), own hurt voices,
  4-wide select grid — `bfc4664`

- Mutant Academy enemy batch 2 + hero voices: Feral Cat, Man-Eating
  Burger, Assassin (blink to flank), Lizard Doctor (heals monsters),
  Sentinel Mech (laser, explodes) — licensed art repacked/recoloured,
  credited; bestiary now 24. Sampled CC0 hurt voice per hero, meow for
  Biski; bundle embeds the clips — `448f961`

- Mutant Academy bestiary + gentler opening: title menu START GAME /
  BESTIARY; 19 entries (16 enemies + 3 bosses) as silhouettes until met,
  then animated portrait, stats, first-seen time, kills, behaviour tip;
  saved in localStorage. Early waves eased (avg on screen min 1-4:
  24/49/45/45 -> 15/33/34/37), early rings 24 -> 42 by 3:00 — `30c8673`

- Mutant Academy skill art + theme: J. W. Bjerk's CC-BY painterly spell
  icons replace the 10px glyphs (level-up cards with framed 32px icon,
  name, POWER/TRAIT tag, inline description; 16px in chest/pause/HUD).
  Original E-minor 90s-cartoon-style hero theme (orchestra-hit intro,
  brass stabs, galloping FM bass, brass melody, power-chord bridge).
  Fixed audio click (gain nodes defaulted to 1 before their envelope) —
  `d05f939`

- Mutant Academy food + demon roster: fish/floor chicken/medipack heal
  25/50/100% (brazier, elite, rare-kill and timed floor drops; food waits
  while HP is full). Seven new enemies from sourced CC-BY art (Calciumtrice,
  Merry Dream Games, ansimuz, Redshrike — repacked/recoloured, credited):
  Bat Demon flier, Demon Imp, Scarab Demon, Fallen Shaman fireball caster,
  Demon Wolf pouncer, Infernal Guard, Oblivion Knight tank. Per-sheet frame
  counts/cell sizes, enemy projectiles, concurrency caps, new wave table.
  Tested desktop/laptop/touch/bundle + dedicated demon/food test — `a1457bf`

- Mutant Academy Mega Drive revamp: low-res integer-scaled framebuffer,
  512-colour palette quantization + palette-swap variants, bitmap fonts,
  all-canvas MD UI (title, d-pad select, RPG level-up/chest/pause
  windows, results tally), Sonic/SoR HUD, priority banner queue, pixel
  FX, FM-synth music. Fixed multi-level-up giving one choice, boss
  stuck white under fire, torch "glitch" line. Tested desktop/laptop/
  touch phone/file:///bundle — `cba30f5`
- Kill burst particles done properly: velocity+gravity pixel-square
  debris in per-enemy colours with white sparks, 8/16/26 per kill/
  elite/boss, 500-particle cap, 3.8ms/frame profiled — `8092b27`
- Dopamine pass (8 quick wins from VS review): first level-up in
  seconds (xpNeed 10->5, gentler curve) + LEVEL UP! popup, gem-pickup
  pitch combo (rising arpeggio), hit-stop freeze-frames on crit/elite/
  boss kills, per-enemy-colour kill burst particles, live COMBO x<n>
  wobble counter, tweened gold counter, low-HP red pulse + heartbeat,
  staggered spring-in level-up/chest cards, value-scaled gems —
  `cd61c24`
- Biski black-cat polish: fur recoloured to true black in the asset
  (eyes/ears keep colour), grey-making 1.5x tint dropped to 1.15,
  per-hero drawScale renders her 25% bigger — `3a79d00`
- Biski goes legit: replaced procedural cat with Shepardskin's CC0
  "Cat sprites" (OpenGameArt) — real animator frames incl. a 6-frame
  bounding gallop; extraction script segments/mirrors/repacks the
  contact sheet into game/assets/biski.png; brightness tint + portrait
  crop for readability; procedural cat code deleted — `43e55e6`
- Biski redraw after playtest feedback ("looks like a duck from the
  side"): full 32x32 procedural pixel art — real cat anatomy (skull +
  muzzle + fused triangular ears, S-curve tail, 4 gallop legs with
  near/far depth), fur texture post-process (outline, belly tone, back
  sheen, dithered highlights), amber eyes — `7da4b83`
- Mutant Academy: Biski the black cat added as 6th hero — hand-authored
  16x16 pixel-art frames (idle tail-swish, gallop, pounce with claw
  streaks, curl-up death) generated into a runtime spritesheet matching
  the Calciumtrice row layout; fastest hero, 22% crit (crit now a
  per-hero stat), 75 HP. Also master-mute fixes shipped earlier
  (`068882d`, `d07cb0b`) — `a2fd3b5`
- Mutant Academy enemy identity pass: roster was wall-to-wall green —
  now 9 visually distinct threats (green/white/blue/red/yellow/dark
  palette variants from the sheets), each wave headlines exactly one
  new enemy with a "NEW THREAT" banner, Night Raiders got flanking
  orbit movement, sweeps use white skeletons — `fcb3546`
- Mutant Academy VS-faithful overhaul: researched Vampire Survivors'
  real mechanics and rebuilt the loop — per-minute wave tables with
  min-enemy quotas, ring/sweep map events every 30s, elites dropping
  slot-machine treasure chests (1/3/5 upgrade jackpot + fanfare),
  psychic vacuum + screen-purge pickups, destructible braziers with
  loot, gold economy, crits, kill-streak banners, per-archetype enemy
  movement (hop/zigzag/charge), solid crate/barrel obstacles, steeper
  scaling with offscreen teleport-back, procedural chiptune music.
  Profiled 4.6ms/frame JS at 363 enemies — `9dd4506`
- Mutant Academy real art: swapped all hand-drawn art for professional
  animated pixel-art spritesheets (Calciumtrice CC-BY heroes/monsters,
  Buch CC0 dungeon tiles — credits in game/assets/CREDITS.md). New
  spritesheet animation engine (idle/walk/attack/death, y-sorting,
  corpse layer), tiled torch-lit dungeon floor with props, 5 heroes,
  6 enemy tiers, tinted minotaur bosses. Theme reframed as a rogue
  Danger Room "INFERNO PROTOCOL" sim (user chose pro fantasy art over
  DIY superhero sprites). Stress-tested at 350 enemies — `2936166`
- Mutant Academy sprites: replaced the placeholder circles/emoji with
  fully drawn animated vector characters — costumed heroes with walk
  cycles, capes, cowls and claws; robot enemy designs (drones, spider
  stalkers, mechs); giant Sentinel bosses with glowing cores; rendered
  portraits on the hero-select screen. Still zero image assets.
  Smoke-tested in headless Chromium, zero console errors — `0fad5b8`
- Mutant Academy: Survivors — standalone Vampire Survivors-style browser
  game in game/ (superhero/mutant themed, original characters). Zero
  dependencies, open game/index.html to play. 4 heroes, 6 upgradable
  powers, 7 passives, 3 Sentinel bosses, 15-min survival win condition,
  keyboard + touch controls. Smoke-tested in headless Chromium (combat,
  level-ups, bosses, pause, game over — zero console errors) — `587e264`
- Betfair fallback bug: two Bundesliga matches (Freiburg v Werder
  Bremen, Augsburg v Schalke) showed Betfair Exchange odds with a
  nonsensical draw price (1.02 / 1.09) instead of Pinnacle. Root
  cause: both fixtures got rescheduled by a day: The Odds API issued
  new event IDs for the confirmed slots, Pinnacle migrated to the new
  IDs, but the old IDs stayed in the feed with no Pinnacle and a
  thin/dead Betfair Exchange order book — not a real coverage gap
  like UCLQ, just a stale event ID. Fixed: the Betfair fallback now
  only applies to events that have *never* had a Pinnacle snapshot;
  if Pinnacle previously priced an event and stops, the fetcher skips
  storing a new snapshot instead (odds history freezes rather than
  filling with garbage). Manually deleted the 46 already-stored
  garbage betfair_ex_eu rows on the two affected matches. Verified
  live — both now show current_odds_bookmaker=pinnacle, frozen at
  their last real price — `082f78b`
- World Cup data purge: tournament's over, wiped every soccer_fifa_world_cup
  row from prod so Steam Results / Drifters "All leagues" win-rate, P/L
  and rankings aren't diluted by finished-tournament history. Deleted
  105 matches (cascaded to 760 steam_moves, 312 closing_lines, 238K
  odds_snapshots, 245K totals_snapshots, 245K spreads_snapshots) plus
  266K polymarket_snapshots, 116 posted_tweets, 42 syndicate_alerts
  (no DB cascade on those three — deleted explicitly first). User
  confirmed destructive delete (no backup) after being shown exact
  row counts. Verified live: /steam-results and /drifter-results no
  longer return any soccer_fifa_world_cup rows.
- Betfair Exchange fallback for 1x2 odds when Pinnacle is absent: UCLQ
  matches showed zero odds all the way to kickoff — confirmed The Odds
  API's feed never carries Pinnacle for this competition at all (0/14
  events, even minutes before KO) despite Pinnacle pricing them live
  on its own site (13-14 other bookmakers, incl. betfair_ex_eu, WERE
  present — a provider gap, not "not posted yet"). odds_fetcher now
  requests both bookmakers in one call (confirmed free — quota is
  regions×markets, not bookmaker count) and stores whichever is
  present, Pinnacle preferred. Late-steam detection, syndicate_alerter
  1X2 checks, and closing_line_capturer are all guarded to Pinnacle-
  only rows so the Betfair fallback can't corrupt the calibrated
  thresholds or mislabel a closing line. current_odds_bookmaker
  exposed via API, shown as a "Betfair Exchange" badge on match
  card/detail; Bet105's "same odds as Pinnacle" claim gated off for
  those matches. Verified live: all 14 UCLQ matches now carry real
  Betfair-sourced odds and history — `dcd78cf`
- Hid In-Play Jumps from nav (desktop + mobile) instead of generalizing
  it — was WC-only from inception (hardcoded league filter, no
  fallback for other leagues). Route/page untouched, still loads
  directly, just not linked. Verified live in prod — `7dcf2bd`
- Fixed dead-end pages from old WC bookmarks/links: Home/SteamResults/
  DriftersPage now redirect to unfiltered whenever the resolved league
  is `hidden` in LEAGUE_CONFIG (generalizes to any future league hide,
  not just WC); /tools/world-cup redirects to "/" — `0d1721c`
- World Cup over: reverted every WC-tournament-window default back to
  normal (DEFAULT_LEAGUE redirect hack removed from Home/SteamResults/
  Drifters, CL/UEL/UECL unhidden + WC hidden in LEAGUE_CONFIG, featured
  gold WC pill removed from nav, LiveTicker generalized back to all
  leagues). Deleted WorldCupHubPage + components/wc/. Verified live in
  prod — clean "/" with no redirect, Top 5 + UCL/UCLQ/UEL/UECL in the
  picker, no "World Cup" text anywhere, zero console errors — `0da9253`
- Local/UTC kickoff-time toggle: fixed a real bug along the way — every
  page parsed the backend's marker-less UTC timestamp strings as browser
  LOCAL time (wrong by the viewer's UTC offset for anyone outside the
  UK), including countdown timers. New frontend/src/utils/time.ts is the
  single parse/format/day-grouping choke point every page now goes
  through; TimePreferenceContext persists the choice. Verified against
  live prod data — every time shifts by exactly the UTC offset when
  toggled, zero console errors. Mobile-menu toggle placement verified by
  code review only (matches the working desktop toggle + existing
  Account section pattern) — automated click-through testing was
  blocked by a browser-automation tooling issue in this session (even
  an unrelated pre-existing button didn't respond to simulated clicks);
  worth a quick manual phone check next time the site's touched — `5f3c647`
- Fixed NameError in syndicate_alerter totals check (opening_line ->
  line) + isolated per-match failures so one bad match can't blank
  Telegram/tweet checking for the whole cycle — found during the France
  v Spain steam-alert post-mortem — `e6a1319`
- Live league constants job: avgGoalsPerTeam/homeAwayRatio computed
  weekly from historical_matches (weighted 4-season rolling window),
  league_constants + league_constants_history tables, weekly scheduler
  job (Mon 10:00 UTC) + admin trigger, GET /league-constants, predictor
  fetches on load with hardcoded fallback (all 5 leagues verified live
  in prod, zero console errors) — `2449bd5`
- Steps 2-3 diagnosis + fallback-only H2+H5 correction — xG (production)
  pipeline exonerated, no production change; backtest-only correction
  applied to SECONDARY run — `0f4bb1a`
- xg_data season migration — `2b6d6a5`
- calibration harness + baseline — `cca2810`
- fit-v1 (rejected, gates held) — `ee9835e`
- input form cull — `7c871ea`
- AH/Totals/BTTS/CS markets — `b902e63`
- home advantage symmetric split — `d4b0d48`
- CL/UEL hidden — `b902e63`
- report-hygiene rule — `b902e63`
