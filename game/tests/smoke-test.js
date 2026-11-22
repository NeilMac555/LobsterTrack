// Smoke test: title, hero select (and back), a short run with every hero, all five acts, the
// pause menu and game over, with no page errors. Serve game/ on port 8765 first:
//   python3 -m http.server 8765 --directory game & node game/tests/smoke-test.js [gfx]
// (3D in a GPU-less test browser runs at a few fps, so the clock is only checked to be moving.)
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const gfx = process.argv[2] || 'hd';
const results = {}; const check = (k, ok, v) => { results[k] = ok ? 'PASS' : 'FAIL ' + JSON.stringify(v); };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.addInitScript(() => { try { localStorage.setItem('mutant-academy-intro-seen', '1'); } catch (e) {} });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:8765/index.html?gfx=${gfx}&q=fixed`);
  await p.waitForFunction(() => scene === 'title', null, { timeout: 60000 });
  check('title screen', true);
  await p.keyboard.press('Enter'); await sleep(300);
  check('START opens hero select', await p.evaluate(() => scene === 'select'), await p.evaluate(() => scene));
  await p.keyboard.press('Escape'); await sleep(200);
  check('Esc goes back to the title', await p.evaluate(() => scene === 'title'), await p.evaluate(() => scene));
  const heroes = await p.evaluate(() => HEROES.filter(h => !heroLocked(h)).map(h => h.id));
  for (const id of heroes) {
    await p.evaluate(() => { try { localStorage.setItem('mutant-academy-intro-seen', '1'); } catch (e) {} });
    await p.reload(); await p.waitForFunction(() => scene === 'title', null, { timeout: 60000 });
    await p.evaluate(id => { toSelect(); startGame(HEROES.find(h => h.id === id)); }, id);
    await sleep(gfx === 'hd' ? 4000 : 8000);
    const st = await p.evaluate(() => ({ scene, t: state.time, hp: player.hp, kills: state.kills, w: player.weapons.length }));
    check(`${id}: a run starts and the clock runs`, st.scene === 'play' && st.t > (gfx === 'hd' ? 1 : 0.2) && st.w >= 1, st);
  }
  for (const act of [2, 3, 4, 5]) {
    await p.evaluate(n => { player.hp = player.maxHp = 9999; enterAct(n); }, act);
    await sleep(gfx === 'hd' ? 2500 : 6000);
    const st = await p.evaluate(() => ({ scene, act: state.act, song: music.song, enemies: enemies.length }));
    check(`act ${act} loads`, st.scene === 'play' && st.act === act && st.song === act, st);
  }
  await p.keyboard.press('Escape'); await sleep(200);
  check('Esc pauses', await p.evaluate(() => menus.length > 0 && menus[0].type === 'pause'), await p.evaluate(() => menus.map(m => m.type)));
  await p.evaluate(() => { menus.length = 0; endGame(false); }); await sleep(500);
  check('game over screen', await p.evaluate(() => scene === 'over'), await p.evaluate(() => scene));
  check('no errors', errs.length === 0, errs);
  console.log(JSON.stringify(results, null, 1));
  await b.close();
  process.exit(Object.values(results).every(v => v === 'PASS') ? 0 : 1);
})();
