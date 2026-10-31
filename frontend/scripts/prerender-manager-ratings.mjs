import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function renderManagerRatings({ dist, domain, headTags, esc }) {
  const dir = resolve(dist, 'tools/manager-ratings');
  const file = resolve(dir, 'index.html');
  const data = JSON.parse(readFileSync(resolve(dir, 'manager-elo-data.json'), 'utf8'));
  let html = readFileSync(file, 'utf8');
  if (data.access !== 'public' || !html.includes('id="body"')) throw new Error('Public manager snapshot missing');
  const url = `${domain}/tools/manager-ratings`;
  const asOf = data.as_of.slice(0, 10);
  const date = new Intl.DateTimeFormat('en-GB', {day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${asOf}T00:00:00Z`));
  const rows = data.rows.filter(r => r.eligible).sort((a,b) => a.rank-b.rank);
  const n = value => value == null ? '—' : `${value > 0 ? '+' : ''}${Number(value).toFixed(1)}`;
  const badge = r => {
    if (r.rank_movement_status === 'new') return '<span class="rank-move new" title="New to the main ranking">New</span>';
    if (r.rank_movement_status !== 'ranked' || !r.rank_movement) return `<span class="rank-move flat" title="${r.rank_movement_status === 'ranked' ? 'Overall rank unchanged' : 'No comparable overall rank'}">—</span>`;
    const up = r.rank_movement > 0;
    const label = `Overall rank ${up ? 'up' : 'down'} ${Math.abs(r.rank_movement)} places since the previous update`;
    return `<span class="rank-move ${up ? 'up' : 'down'}" title="${label}" aria-label="${label}"><svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${up ? 'M8 13V3M3 8l5-5 5 5' : 'M8 3v10M3 8l5 5 5-5'}"/></svg>${Math.abs(r.rank_movement)}</span>`;
  };
  const tr = rows.map(r => `<tr tabindex="0" data-id="${r.id}"><td>${r.rank}</td><td><b>${esc(r.name)}</b>${badge(r)}</td><td>${esc(r.club)}<small style="display:block">${r.is_current ? 'Current top-five manager' : 'Last covered club · employment unverified'}</small></td><td>${n(r.score)}</td><td>${n(r.trophy_bonus)}</td><td>${n(r.impact)}</td><td>${n(r.per38)}</td><td>${n(r.recent)}<small style="display:block">${r.recent_games} matches</small></td><td>${r.matches}</td><td>${r.clubs}</td><td>${r.positive_spells} / ${r.eligible_spells}</td></tr>`).join('');
  html = html.replace('<tbody id="body"></tbody>', `<tbody id="body">${tr}</tbody>`);
  if (!html.includes(tr)) throw new Error('Manager table prerender failed');
  html = html.replace(/(<p id="stamp"[^>]*>).*?(<\/p>)/, `$1Last updated ${date} · Data retrieved ${data.as_of} UTC.$2`);
  html = html.replace('id="n"></strong>', `id="n">${data.eligible_managers}</strong>`).replace('id="f"></strong>', `id="f">${data.used_fixtures.toLocaleString('en-GB')}</strong>`);
  const faqs = [
    ['What do these football manager ratings measure?', 'The combined rating adds corrected club Elo impact to half-strength trophy bonuses. Trophy weights differ by competition and an uncalibrated precompetition club-Elo difficulty factor. Elo impact and trophy points are shown separately; this is an achievement composite, not pure Elo or a proven causal effect of the manager.'],
    ['Which competitions and dates are covered?', `The Premier League, La Liga, Bundesliga, Serie A and Ligue 1, plus the Champions League, Europa League and Conference League. Ranked impact runs from 1 July 2016 to ${date}; 2013–2016 matches warm up club ratings. Coverage varies by season and field. International matches are excluded.`],
    ['Who qualifies for the main ranking?', `Managers need at least 20 usable matches in covered competitions in the rolling previous 12 months. ${data.eligible_managers} managers currently qualify. Current top-five managers below that threshold appear in the insufficient-evidence view; a last covered club does not establish current employment.`],
    ['What do impact per 38 and the movement arrows mean?', 'Impact per 38 is total Elo impact divided by covered matches and multiplied by 38. Movement resets when the scoring model changes. Otherwise green arrows show places gained and red arrows places lost in the overall main ranking since the previous published update. The arrows keep that overall basis when you change dates or sort the table.'],
    ['Are the manager ratings free and how often are they updated?', `The full rankings, comparison graphs, date filters and JSON download are free, with no account required. Refreshes are scheduled weekly on Mondays and published after validation. The latest successful data update is ${date}.`],
    ['Where does the data come from, and what are the limitations?', 'Match and appointment records come from Sportsmonks, with dated corrections listed in the methodology. SteamWatch calculates its own club Elo impact model; these are not ClubElo ratings. Squad quality, spending, injuries and inherited trends are not separately controlled, so this is not a definitive ranking of managerial ability.']
  ];
  const description = 'Free football manager rankings combining corrected Elo impact and half-strength trophy bonuses. Compare recent form, impact per 38 matches, rank changes and performance since 2016.';
  const jsonLd = [
    {'@context':'https://schema.org','@type':'WebApplication','@id':`${url}#app`,name:'SteamWatch Football Manager Ratings',url,description,applicationCategory:'SportsApplication',operatingSystem:'Web',isAccessibleForFree:true,dateModified:asOf,offers:{'@type':'Offer',price:'0',priceCurrency:'EUR'},creator:{'@type':'Organization',name:'SteamWatch',url:domain}},
    {'@context':'https://schema.org','@type':'Dataset','@id':`${url}#dataset`,name:'SteamWatch Manager Ratings: Elo Impact and Trophy Bonuses',description:faqs[0][1],url,isAccessibleForFree:true,dateModified:asOf,temporalCoverage:`2016-07-01/${asOf}`,creator:{'@type':'Organization',name:'SteamWatch',url:domain},citation:'https://www.sportmonks.com/football-api/',variableMeasured:['Combined manager rating','Half-strength trophy bonus','Club Elo impact','Impact per 38 matches','Last 12 months impact','Overall rank movement'],distribution:{'@type':'DataDownload',encodingFormat:'application/json',contentUrl:`${url}/manager-elo-data.json`}},
    {'@context':'https://schema.org','@type':'FAQPage',mainEntity:faqs.map(([name,text])=>({'@type':'Question',name,acceptedAnswer:{'@type':'Answer',text}}))},
    {'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'SteamWatch',item:domain},{'@type':'ListItem',position:2,name:'Manager Ratings',item:url}]}
  ];
  const head = headTags({title:'Football Manager Rankings & Elo Impact | SteamWatch',description,url,jsonLd});
  html = html.replace(/<title>.*?<\/title>/, '').replace(/<meta name="description"[^>]*>\n?/, '').replace(/<link rel="canonical"[^>]*>\n?/, '').replace(/<meta property="og:[a-z_:]+"[^>]*>\n?/g, '').replace(/<meta name="twitter:card"[^>]*>\n?/, '');
  html = html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n${head}`);
  html = html.replace('<h1>Manager Ratings</h1>', '<h1>Football Manager Ratings</h1>');
  const copy = `<section id="about-manager-ratings" class="sw-copy" aria-labelledby="ratings-explained"><h2 id="ratings-explained">Football manager rankings explained</h2><p>As of <time datetime="${asOf}">${date}</time>, ${esc(rows[0].name)} leads SteamWatch’s overall combined manager ranking, followed by ${esc(rows[1].name)} and ${esc(rows[2].name)}. These totals cover match Elo and eligible trophy awards since July 2016; they are not a verdict on who is the best manager today.</p><p>Every club starts at 1,500 Elo when first observed. The model updates club ratings after each covered regulation-time result, using a K-factor of 20 and a 60-point home advantage. A manager’s Elo impact sums those changes across their clubs. The combined ranking adds the approved half-strength trophy component; the graph and per-38 statistics remain match-based. See the <a href="#method">full methodology and coverage audit</a>.</p>${faqs.map(([q,a])=>`<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('')}<p>Data source: <a href="https://www.sportmonks.com/football-api/">Sportsmonks Football API</a>. Model and publication: <a href="/about">SteamWatch</a>. <a href="${url}/manager-elo-data.json">Download the full derived ratings (JSON)</a>.</p><p>Explore <a href="/tools/club-ratings">Club Ratings</a>, <a href="/tools/form-lab">Form Lab</a> and <a href="/tools/rolling-xg">Rolling xG</a>.</p></section><style>.sw-copy{max-width:860px;margin:32px auto 0;padding:24px 0 8px;border-top:1px solid #334155;color:#cbd5e1;font-size:14px;line-height:1.7}.sw-copy h2{font-size:22px;color:#f1f5f9}.sw-copy h3{font-size:16px;margin:24px 0 8px;color:#f1f5f9}.sw-copy a{color:#22d3ee}.sw-copy p{margin:0 0 14px}</style>`;
  html = html.replace('<footer>', copy+'<footer>');
  writeFileSync(file, html, 'utf8');
  console.log(`  ✓ /tools/manager-ratings (${rows.length} public HTML rows + structured data)`);
}
