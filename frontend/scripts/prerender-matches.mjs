/**
 * Post-build script: generates static HTML for each upcoming + recently-past
 * match so crawlers and AI bots receive full SEO content WITHOUT JavaScript.
 *
 * Items baked in to the raw HTML (per Neil's SEO spec):
 *   1. Answer-first summary block (top of <body>) with model-implied 1X2
 *      probabilities and last-updated timestamp.
 *   2. SportsEvent JSON-LD in <head>.
 *   3. Match-specific <title> + meta description.
 *   4. Pro CTA at end of body content with ?ref=match-page UTM tag.
 *
 * After this script runs, dist/match/<hash>/index.html exists for every
 * tracked match. Vercel serves the static file; React hydrates over it
 * so the interactive SPA still works for users.
 *
 * For matches NOT prerendered (new fixtures added between builds),
 * Vercel's SPA fallback serves dist/index.html and React Router handles
 * the route client-side. SEO degraded for those, but UX intact.
 *
 * Run after `vite build` and `prerender-blog.mjs`:
 *   node scripts/prerender-matches.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, '..', 'dist');
const DOMAIN = 'https://www.steamwatch.io';
const API_BASE = 'https://lobstertrack-production.up.railway.app';

// How wide to prerender. Look forward ~14 days for upcoming matches and
// back ~7 days for recently-played ones (still get organic search hits
// in the days after KO).
const LOOK_FORWARD_DAYS = 14;
const LOOK_BACK_DAYS = 7;

// Leagues we track. Order doesn't matter — each is fetched in parallel.
const LEAGUES = [
  'soccer_fifa_world_cup',
  'soccer_epl',
  'soccer_spain_la_liga',
  'soccer_germany_bundesliga',
  'soccer_italy_serie_a',
  'soccer_france_ligue_one',
  'soccer_uefa_champs_league',
  'soccer_uefa_europa_league',
  'soccer_uefa_europa_conference_league',
];

const LEAGUE_LABELS = {
  soccer_fifa_world_cup: 'FIFA World Cup',
  soccer_epl: 'Premier League',
  soccer_spain_la_liga: 'La Liga',
  soccer_germany_bundesliga: 'Bundesliga',
  soccer_italy_serie_a: 'Serie A',
  soccer_france_ligue_one: 'Ligue 1',
  soccer_uefa_champs_league: 'UEFA Champions League',
  soccer_uefa_europa_league: 'UEFA Europa League',
  soccer_uefa_europa_conference_league: 'UEFA Conference League',
};

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function impliedPct(odds) {
  if (!odds || odds <= 0) return null;
  return (1.0 / odds) * 100;
}

function fmtPct(n) {
  if (n == null) return '–';
  return `${n.toFixed(1)}%`;
}

function buildSportsEventJsonLd(match, leagueLabel) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: `${match.home_team} vs ${match.away_team}`,
    sport: 'Soccer',
    startDate: match.commence_time,
    competition: leagueLabel,
    homeTeam: { '@type': 'SportsTeam', name: match.home_team },
    awayTeam: { '@type': 'SportsTeam', name: match.away_team },
    url: `${DOMAIN}/match/${match.id}`,
  };
}

function buildAnswerFirst(match, probs, lastUpdated) {
  const home = escapeHtml(match.home_team);
  const away = escapeHtml(match.away_team);
  const h = fmtPct(probs.home);
  const d = fmtPct(probs.draw);
  const a = fmtPct(probs.away);
  const ts = lastUpdated
    ? new Date(lastUpdated).toUTCString().replace('GMT', 'UTC')
    : 'recently';
  return [
    '<section id="answer-first" style="max-width:760px;margin:24px auto;padding:18px 22px;background:rgba(15,23,42,0.6);border:1px solid rgba(51,65,85,0.6);border-radius:10px;color:#e2e8f0;font-family:Inter,system-ui,sans-serif;line-height:1.55;">',
    `<p style="margin:0;font-size:15px;">Based on Pinnacle's market — the sharpest book in football — <strong>${home}</strong> sits at ${h} to win, ${d} for the draw and ${a} for <strong>${away}</strong>. SteamWatch tracks every line move and sharp-money signal in real time. Last updated ${escapeHtml(ts)}.</p>`,
    '</section>',
  ].join('\n');
}

function buildProCta() {
  return [
    '<section id="pro-cta" style="max-width:760px;margin:32px auto 24px;padding:20px 22px;background:linear-gradient(135deg,rgba(6,182,212,0.18),rgba(8,145,178,0.10));border:1px solid rgba(34,211,238,0.45);border-radius:10px;color:#e2e8f0;font-family:Inter,system-ui,sans-serif;text-align:center;">',
    '<p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#ffffff;">Get full steam alerts, closing-line tracking and every match model.</p>',
    `<p style="margin:0 0 14px;font-size:13px;color:#cbd5e1;">SteamWatch Pro — €19.99/mo.</p>`,
    `<a href="${DOMAIN}/?ref=match-page" style="display:inline-block;padding:10px 22px;background:linear-gradient(135deg,#22d3ee,#0891b2);color:#0f172a;font-weight:700;text-decoration:none;border-radius:8px;font-size:14px;letter-spacing:0.04em;text-transform:uppercase;">Go Pro →</a>`,
    '</section>',
  ].join('\n');
}

function buildTitle(home, away) {
  const long = `${home} vs ${away} Odds, Prediction & Steam Moves | SteamWatch`;
  if (long.length <= 60) return long;
  // Drop "& Steam Moves" first when team names overrun
  const med = `${home} vs ${away} Odds & Prediction | SteamWatch`;
  if (med.length <= 60) return med;
  return `${home} vs ${away} Prediction | SteamWatch`;
}

function buildDescription(home, away, homePct) {
  const h = homePct != null ? `${homePct.toFixed(0)}%` : '–';
  return `SteamWatch rates ${home} ${h} to win based on Pinnacle's market. Live steam moves, closing line value and odds tracking for ${home} vs ${away}.`;
}

// ---------------------------------------------------------------------------

async function fetchJson(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`${url} -> ${resp.status}`);
  return resp.json();
}

async function listMatchesForLeague(league) {
  // /api/matches returns upcoming + recent. We filter client-side by KO window.
  try {
    return await fetchJson(`${API_BASE}/api/matches?league=${league}`);
  } catch (e) {
    console.warn(`  ! ${league}: list failed (${e.message})`);
    return [];
  }
}

async function main() {
  console.log('\nPre-rendering match pages...');
  const indexPath = resolve(DIST, 'index.html');
  let template;
  try {
    template = readFileSync(indexPath, 'utf-8');
  } catch (e) {
    console.error(`Cannot read ${indexPath} — did vite build finish? ${e.message}`);
    process.exit(0);
  }

  const now = new Date();
  const forwardCutoff = new Date(now.getTime() + LOOK_FORWARD_DAYS * 86400000);
  const backCutoff = new Date(now.getTime() - LOOK_BACK_DAYS * 86400000);
  const buildTime = now.toISOString();

  // Pull all leagues in parallel
  const lists = await Promise.all(LEAGUES.map(listMatchesForLeague));
  const allMatches = lists.flat();

  const inWindow = allMatches.filter((m) => {
    if (!m.commence_time) return false;
    const ko = new Date(m.commence_time);
    return ko >= backCutoff && ko <= forwardCutoff;
  });

  console.log(`  Found ${allMatches.length} matches; ${inWindow.length} inside the SEO window.`);

  let written = 0;
  let skipped = 0;

  for (const m of inWindow) {
    const leagueLabel = LEAGUE_LABELS[m.sport_key] || m.league_name || 'Football';

    // Implied probs from current odds (cheap, no extra fetch).
    // Skip if we have no odds at all — page would have nothing to say.
    const probs = {
      home: impliedPct(m.current_home_odds),
      draw: impliedPct(m.current_draw_odds),
      away: impliedPct(m.current_away_odds),
    };
    if (probs.home == null && probs.away == null) {
      skipped++;
      continue;
    }

    // Normalize so probs sum to 100 (strip Pinnacle's margin so the
    // numbers read like a model output, not a bookmaker book).
    const total = (probs.home || 0) + (probs.draw || 0) + (probs.away || 0);
    if (total > 0) {
      probs.home = probs.home != null ? (probs.home / total) * 100 : null;
      probs.draw = probs.draw != null ? (probs.draw / total) * 100 : null;
      probs.away = probs.away != null ? (probs.away / total) * 100 : null;
    }

    const title = buildTitle(m.home_team, m.away_team);
    const description = buildDescription(m.home_team, m.away_team, probs.home);
    const url = `${DOMAIN}/match/${m.id}`;
    const sportsEvent = buildSportsEventJsonLd(m, leagueLabel);
    const answerFirst = buildAnswerFirst(m, probs, buildTime);
    const proCta = buildProCta();

    let html = template;

    // Title
    html = html.replace(
      /<title>[^<]*<\/title>/,
      `<title>${escapeHtml(title)}</title>`
    );

    // Meta description
    html = html.replace(
      /<meta name="description" content="[^"]*"\s*\/?>/,
      `<meta name="description" content="${escapeHtml(description)}" />`
    );

    // OG title + desc + url
    html = html.replace(
      /<meta property="og:title" content="[^"]*"\s*\/?>/,
      `<meta property="og:title" content="${escapeHtml(title)}" />`
    );
    html = html.replace(
      /<meta property="og:description" content="[^"]*"\s*\/?>/,
      `<meta property="og:description" content="${escapeHtml(description)}" />`
    );
    html = html.replace(
      /<meta property="og:url" content="[^"]*"\s*\/?>/,
      `<meta property="og:url" content="${url}" />`
    );

    // Twitter title + desc
    html = html.replace(
      /<meta name="twitter:title" content="[^"]*"\s*\/?>/,
      `<meta name="twitter:title" content="${escapeHtml(title)}" />`
    );
    html = html.replace(
      /<meta name="twitter:description" content="[^"]*"\s*\/?>/,
      `<meta name="twitter:description" content="${escapeHtml(description)}" />`
    );

    // Canonical
    html = html.replace(
      /<link rel="canonical" href="[^"]*"\s*\/?>/,
      `<link rel="canonical" href="${url}" />`
    );

    // JSON-LD before </head>
    html = html.replace(
      '</head>',
      `    <script type="application/ld+json">${JSON.stringify(sportsEvent)}</script>\n  </head>`
    );

    // Inject answer-first + Pro CTA INSIDE the #root div. React
    // hydrates by replacing the contents of #root, so users with JS
    // see the live SPA component. Crawlers and AI bots that don't run
    // JS see the pre-baked SEO content directly inside the root.
    html = html.replace(
      '<div id="root"></div>',
      `<div id="root">${answerFirst}${proCta}</div>`
    );

    // Write to dist/match/<id>/index.html
    const outDir = resolve(DIST, 'match', m.id);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(resolve(outDir, 'index.html'), html, 'utf-8');
    written++;
  }

  console.log(`  ✓ Wrote ${written} match pages, skipped ${skipped} without odds data.`);
}

main().catch((e) => {
  console.error('prerender-matches failed:', e);
  process.exit(0); // don't fail the build — match SEO is enhancement, not core
});
