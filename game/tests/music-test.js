// the recorded soundtrack: which track plays in each scene, fades, mute, boss, act change, game over
// Serve game/ on port 8765 first: python3 -m http.server 8765 --directory game & node game/tests/music-test.js
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = {}; const check = (k, ok, v) => { results[k] = ok ? 'PASS' : 'FAIL ' + JSON.stringify(v); };
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=user-gesture-required'] }); const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); await p.addInitScript(() => { try { localStorage.setItem('mutant-academy-intro-seen', '1'); } catch (e) {} });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8765/index.html?gfx=hd'); await p.waitForFunction(() => scene === 'title');
  const playing = () => p.evaluate(() => Object.entries(streams).filter(([n, a]) => !a.paused).map(([n, a]) => n + ':' + a.volume.toFixed(2) + ':' + a.currentTime.toFixed(1)));
  const waitTrack = async (name, ms = 8000) => { try { await p.waitForFunction(n => streams[n] && !streams[n].paused && streams[n].volume > 0.9 && Object.entries(streams).every(([k, a]) => k === n || a.paused), name, { timeout: ms }); return true; } catch (e) { return false; } };
  check('silent before any input', (await playing()).length === 0, await playing());
  await p.mouse.click(5, 5);   // a tap on the title
  check('title theme on the first tap', await waitTrack('title'), await playing());
  const t0 = await p.evaluate(() => streams.title.currentTime); await sleep(1500);
  check('title theme advances', (await p.evaluate(() => streams.title.currentTime)) > t0 + 1, t0);
  await p.keyboard.press('m'); await sleep(300);
  check('mute stops it', (await playing()).length === 0, await playing());
  await p.keyboard.press('m'); check('unmute brings it back', await waitTrack('title'), await playing());
  await p.evaluate(() => { try { } catch (e) {} toSelect(); });
  check('select keeps the title theme', await waitTrack('title'), await playing());
  await p.evaluate(() => startGame(HEROES[0]));
  check('act I theme in play', await waitTrack('act1'), await playing());
  check('boss theme preloaded', await p.evaluate(() => !!streams.boss), null);
  await p.evaluate(() => { state.level = 99; });
  await p.waitForFunction(() => !!state.actBoss, null, { timeout: 15000 }).catch(() => {});
  check('boss theme when the boss arrives', await waitTrack('boss'), await playing());
  await p.evaluate(() => { state.actBoss.hp = 0; state.actBoss = null; state.bossCleared = 9; state.level = 1; });
  check('act theme back after the boss', await waitTrack('act1'), await playing());
  for (const act of [2, 3, 4, 5]) {
    await p.evaluate(n => { music.song = n; }, act);
    check(`act ${act} theme`, await waitTrack('act' + act, 12000), await playing());
  }
  await p.evaluate(() => endGame(false)); await sleep(300);
  check('game over: silence', (await playing()).length === 0, await playing());
  check('no errors', errs.length === 0, errs);
  console.log(JSON.stringify(results, null, 1)); await b.close();
  process.exit(Object.values(results).every(v => v === 'PASS') ? 0 : 1);
})();
