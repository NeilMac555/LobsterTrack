// with the music files unreachable the synth themes play instead; with them reachable the synth stays quiet
// Serve game/ on port 8765 first: python3 -m http.server 8765 --directory game & node game/tests/music-fallback-test.js
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = {}; const check = (k, ok, v) => { results[k] = ok ? 'PASS' : 'FAIL ' + JSON.stringify(v); };
(async () => {
  const b = await chromium.launch();
  for (const blocked of [true, false]) {
    const p = await b.newPage(); await p.addInitScript(() => { try { localStorage.setItem('mutant-academy-intro-seen', '1'); } catch (e) {} });
    if (blocked) await p.route('**/assets/music/**', r => r.abort());
    await p.goto('http://127.0.0.1:8765/index.html?gfx=hd'); await p.waitForFunction(() => scene === 'title');
    await p.mouse.click(5, 5); await p.evaluate(() => startGame(HEROES[0])); await sleep(3000);
    const s0 = await p.evaluate(() => music.step); await sleep(2000); const s1 = await p.evaluate(() => music.step);
    const st = await p.evaluate(() => ({ dead: streams.act1 && streams.act1.dead, paused: streams.act1 && streams.act1.paused }));
    if (blocked) check('files blocked: the synth plays', st.dead && s1 > s0 + 10, { st, s0, s1 });
    else check('files there: the synth is quiet', !st.paused && s1 === s0, { st, s0, s1 });
    await p.close();
  }
  console.log(JSON.stringify(results, null, 1)); await b.close();
  process.exit(Object.values(results).every(v => v === 'PASS') ? 0 : 1);
})();
