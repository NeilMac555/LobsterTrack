// Submit every sitemap URL to IndexNow (Bing, Yandex, Seznam, Naver and
// friends share the endpoint; Bing's index is what ChatGPT search runs
// on). Run after a deploy that adds or materially changes pages:
//   npm run indexnow
// The key file is served from /5a1282d4c60d37c8d721e5fed7eef2b2.txt (public/). Google does not
// support IndexNow — submit sitemap.xml in Search Console for Google.
import { readFileSync } from 'node:fs';

const KEY = '5a1282d4c60d37c8d721e5fed7eef2b2';
const HOST = 'www.steamwatch.io';

const xml = readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf-8');
const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList }),
});
console.log(`IndexNow: HTTP ${res.status} for ${urlList.length} URL(s)`);
if (res.status !== 200 && res.status !== 202) {
  console.log(await res.text());
  process.exit(1);
}
