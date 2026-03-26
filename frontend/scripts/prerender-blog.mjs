/**
 * Post-build script: generates static HTML for each blog post so that
 * crawlers (which don't run JS) receive full article content, meta tags,
 * and JSON-LD schema markup.
 *
 * Run after `vite build`:
 *   node scripts/prerender-blog.mjs
 *
 * Output: dist/blog/<slug>/index.html for every post listed below.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, '..', 'dist');
const DOMAIN = 'https://www.steamwatch.io';

// ---------------------------------------------------------------------------
// Blog post metadata — keep in sync with src/blog/posts.tsx
// When adding a new post: add an entry here AND in posts.tsx
// ---------------------------------------------------------------------------
const POSTS = [
  {
    slug: 'what-are-steam-moves-in-football-betting',
    title: 'What Are Steam Moves in Football Betting?',
    description:
      'Steam moves explained: what they are, how to spot them, why they matter for football bettors, and how to use sharp money signals in your betting process.',
    author: 'Neil Macdonald',
    datePublished: '2026-03-16',
    faq: [
      {
        question: 'What is a steam move in football betting?',
        answer:
          'A steam move is a sudden, significant shift in a betting line caused by sharp money — from syndicates, professional bettors, and algorithms — hitting the market. When one sportsbook adjusts its line, others follow, creating a cascade effect known as steam.',
      },
      {
        question: 'How do you spot a steam move?',
        answer:
          'Look for reverse line movement (line moves opposite to public money), synchronised movement across multiple sportsbooks with no news trigger, and rapid line changes within minutes. Tracking tools that monitor Pinnacle odds in real-time are the most reliable way to identify steam.',
      },
      {
        question: 'What is the difference between steam moves and regular line movement?',
        answer:
          'Regular line movement can be caused by team news, public money, or liability management. Steam moves are specifically driven by sharp, informed money — bettors with an analytical or informational edge — and typically cascade across multiple books quickly.',
      },
      {
        question: 'Why is Pinnacle important for tracking steam moves?',
        answer:
          'Pinnacle takes the highest limits in the world and their lines are shaped by the sharpest bettors. When Pinnacle moves a line, the rest of the market follows. It is the benchmark for identifying genuine sharp action.',
      },
    ],
    noscriptHtml: `<h1>What Are Steam Moves in Football Betting?</h1>
<p>By Neil Macdonald — March 16, 2026</p>
<p>A steam move is a sudden, significant shift in a betting line caused by sharp money hitting the market. Not square money. Not public money. Sharp money — from syndicates, professional bettors, and algorithms that have identified an edge.</p>
<p>When a sharp bettor or group places a large wager at one sportsbook, that book adjusts its line. Other books see the move and adjust too, even if they haven't taken the same action. This cascade effect — one book moves, then another, then another — is the "steam."</p>
<p>It happens fast. Sometimes within minutes. If you blink, you miss it.</p>
<h2>Steam Moves vs Line Movement</h2>
<p>Not all line movement is steam. Lines move for plenty of reasons: team news, public money, or liability management. A steam move is different. It's driven by information or analysis the market hasn't priced in yet. The money is smart, the move is sharp, and it usually sticks.</p>
<h2>Why Steam Moves Matter</h2>
<p>The betting market is an information market. Oddsmakers set lines, and then the market corrects them. Steam moves are the market saying "this number is wrong" with real money behind it.</p>
<p>For football bettors, steam moves matter because they reveal where the edge is, they tell you who's betting (not just what), and the value disappears fast.</p>
<h2>How to Spot a Steam Move</h2>
<p>Watch for reverse line movement, track line movement across books, use odds tracking tools, and remember that speed matters — steam moves happen in minutes, not hours.</p>
<h2>Steam Moves in Football Markets</h2>
<p>Asian handicap markets are where the sharpest money lives. Total goals markets are another favourite for sharp action. Match result (1X2) markets are noisy with public money. Confirmed lineups 60-90 minutes before kick-off create a predictable window of sharp activity.</p>
<h2>How to Use Steam Moves</h2>
<p>Follow early, don't chase dead steam. Context matters — understand why the money is moving. Pinnacle is your benchmark. Build steam moves into your process as confirmation, not your entire edge.</p>
<h2>Frequently Asked Questions</h2>
<h3>What is a steam move in football betting?</h3>
<p>A steam move is a sudden, significant shift in a betting line caused by sharp money — from syndicates, professional bettors, and algorithms — hitting the market. When one sportsbook adjusts its line, others follow, creating a cascade effect known as steam.</p>
<h3>How do you spot a steam move?</h3>
<p>Look for reverse line movement (line moves opposite to public money), synchronised movement across multiple sportsbooks with no news trigger, and rapid line changes within minutes. Tracking tools that monitor Pinnacle odds in real-time are the most reliable way to identify steam.</p>
<h3>What is the difference between steam moves and regular line movement?</h3>
<p>Regular line movement can be caused by team news, public money, or liability management. Steam moves are specifically driven by sharp, informed money and typically cascade across multiple books quickly.</p>
<h3>Why is Pinnacle important for tracking steam moves?</h3>
<p>Pinnacle takes the highest limits in the world and their lines are shaped by the sharpest bettors. When Pinnacle moves a line, the rest of the market follows. It is the benchmark for identifying genuine sharp action.</p>
<p><a href="https://www.steamwatch.io/steam-results">View Steam Results on SteamWatch</a></p>`,
  },
];

// ---------------------------------------------------------------------------
// Build JSON-LD blocks
// ---------------------------------------------------------------------------
function articleSchema(post) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    author: { '@type': 'Person', name: post.author },
    datePublished: post.datePublished,
    publisher: {
      '@type': 'Organization',
      name: 'SteamWatch',
      url: DOMAIN,
    },
    mainEntityOfPage: `${DOMAIN}/blog/${post.slug}`,
  });
}

function faqSchema(post) {
  if (!post.faq || post.faq.length === 0) return '';
  const obj = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: post.faq.map((q) => ({
      '@type': 'Question',
      name: q.question,
      acceptedAnswer: { '@type': 'Answer', text: q.answer },
    })),
  };
  return `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
}

// ---------------------------------------------------------------------------
// Generate static HTML for each blog post
// ---------------------------------------------------------------------------
const template = readFileSync(resolve(DIST, 'index.html'), 'utf-8');

for (const post of POSTS) {
  const url = `${DOMAIN}/blog/${post.slug}`;
  const pageTitle = `${post.title} — SteamWatch`;

  // Replace <title>
  let html = template.replace(
    /<title>[^<]*<\/title>/,
    `<title>${pageTitle}</title>`
  );

  // Replace meta description
  html = html.replace(
    /<meta name="description" content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${post.description}" />`
  );

  // Replace OG tags
  html = html.replace(
    /<meta property="og:type" content="[^"]*"\s*\/?>/,
    `<meta property="og:type" content="article" />`
  );
  html = html.replace(
    /<meta property="og:url" content="[^"]*"\s*\/?>/,
    `<meta property="og:url" content="${url}" />`
  );
  html = html.replace(
    /<meta property="og:title" content="[^"]*"\s*\/?>/,
    `<meta property="og:title" content="${pageTitle}" />`
  );
  html = html.replace(
    /<meta property="og:description" content="[^"]*"\s*\/?>/,
    `<meta property="og:description" content="${post.description}" />`
  );

  // Replace Twitter tags
  html = html.replace(
    /<meta name="twitter:title" content="[^"]*"\s*\/?>/,
    `<meta name="twitter:title" content="${pageTitle}" />`
  );
  html = html.replace(
    /<meta name="twitter:description" content="[^"]*"\s*\/?>/,
    `<meta name="twitter:description" content="${post.description}" />`
  );

  // Replace canonical
  html = html.replace(
    /<link rel="canonical" href="[^"]*"\s*\/?>/,
    `<link rel="canonical" href="${url}" />`
  );

  // Add JSON-LD before </head>
  const jsonLd = `<script type="application/ld+json">${articleSchema(post)}</script>\n    ${faqSchema(post)}`;
  html = html.replace('</head>', `    ${jsonLd}\n  </head>`);

  // Replace generic noscript with post-specific content
  html = html.replace(
    /<noscript>[\s\S]*?<\/noscript>/,
    `<noscript>\n      ${post.noscriptHtml}\n    </noscript>`
  );

  // Write to dist/blog/<slug>/index.html
  const outDir = resolve(DIST, 'blog', post.slug);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'index.html'), html, 'utf-8');

  console.log(`  ✓ /blog/${post.slug}`);
}

console.log(`\nPre-rendered ${POSTS.length} blog page(s).`);

// ---------------------------------------------------------------------------
// Static pages — pre-render with page-specific meta + JSON-LD + noscript
// ---------------------------------------------------------------------------
const PAGES = [
  {
    path: 'steam-results',
    title: 'Steam Results — SteamWatch',
    description:
      'Historical performance data for tracked football steam moves across major European leagues, including win rates and P/L.',
    ogType: 'website',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: 'SteamWatch Football Steam Move Results',
      description:
        'Historical performance data for tracked football steam moves across major European leagues, including win rates and P/L',
      url: `${DOMAIN}/steam-results`,
      temporalCoverage: '2025/..',
      creator: { '@type': 'Organization', name: 'SteamWatch', url: DOMAIN },
      keywords: ['steam moves', 'sharp money', 'football betting', 'line movement'],
    },
    noscriptHtml: `<h1>Steam Results — SteamWatch</h1>
<p>Historical performance tracking of football steam moves across major European leagues. See win rates, profit/loss, and team rankings for sharp money signals tracked by SteamWatch.</p>
<p>Leagues covered: Premier League, La Liga, Bundesliga, Serie A, Ligue 1, Champions League, Europa League.</p>
<p><a href="https://www.steamwatch.io">Back to SteamWatch</a></p>`,
  },
  {
    path: 'tools/hedge-calculator',
    title: 'Football Hedge Calculator — SteamWatch',
    description:
      'Calculate optimal hedge bet sizes for football wagers with real-time calculations.',
    ogType: 'website',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'Football Hedge Calculator',
      url: `${DOMAIN}/tools/hedge-calculator`,
      description:
        'Calculate optimal hedge bet sizes for football wagers with real-time calculations',
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    },
    noscriptHtml: `<h1>Football Hedge Calculator — SteamWatch</h1>
<p>Calculate the optimal hedge bet size for any football wager. Enter your original stake, original odds, and current hedge odds to see guaranteed profit calculations in real time.</p>
<p><a href="https://www.steamwatch.io">Back to SteamWatch</a></p>`,
  },
  {
    path: 'about',
    title: 'About Neil Mac | Football Betting Analyst & SteamWatch Founder',
    description:
      "Neil Mac is a professional football betting analyst with 20+ years' experience and 7,800+ tracked bets. Creator of SteamWatch, a steam move and sharp money tracking platform.",
    ogType: 'website',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: 'Neil Mac',
      alternateName: ['Neil Macdonald', 'Neil Mac Tips', 'NeilMac555', 'Bookie Insiders Football'],
      url: `${DOMAIN}/about`,
      jobTitle: 'Professional Football Betting Analyst',
      knowsAbout: ['football betting', 'steam moves', 'sharp money', 'closing line value', 'Dixon-Coles model'],
      sameAs: [
        'https://x.com/NeilMac555',
        'https://neilmac.substack.com/',
'https://www.honestbettingreviews.com/best-football-tipster-telegram/',
        'https://smartsportstrader.com/bookie-insiders-football-review/',
        'https://www.bet-experts.com/tipster-review/neil-mac/',
      ],
    },
    noscriptHtml: `<h1>About Neil Mac — Football Betting Analyst & SteamWatch Founder</h1>
<p>Neil Mac is a professional football betting analyst with over 20 years of experience in sports betting markets. He has worked with Paddy Power, Oddschecker, and Covers.com.</p>
<h2>Track Record</h2>
<p>7,800+ bets tracked, +464 units profit, 4%+ ROI. All results independently tracked and publicly verifiable.</p>
<h2>What is SteamWatch?</h2>
<p>SteamWatch tracks sharp money movement across major European football betting markets using Pinnacle odds data updated every 15 minutes. Features include Biggest Movers, Syndicate Moves with Telegram alerts, Steam Results with P/L tracking, Closing Line Analysis, Rolling xG, and a Dixon-Coles Match Prediction Model.</p>
<h2>Find Neil Mac</h2>
<ul>
<li><a href="https://neilmac.substack.com/">Substack</a></li>
<li><a href="https://x.com/NeilMac555">X / Twitter</a></li>
<li><a href="https://t.me/steamwatchalerts">Telegram Alerts</a></li>
</ul>
<p><a href="https://www.steamwatch.io">Back to SteamWatch</a></p>`,
  },
  {
    path: 'closing-lines',
    title: 'Closing Lines — SteamWatch',
    description:
      'Compare opening and closing odds across major European football leagues. Track closing line value and market efficiency on 1X2, Asian Handicap, and Totals markets.',
    ogType: 'website',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: 'SteamWatch Closing Line Analysis',
      description:
        'Opening vs closing odds comparison across major European football leagues',
      url: `${DOMAIN}/closing-lines`,
      temporalCoverage: '2025/..',
      creator: { '@type': 'Organization', name: 'SteamWatch', url: DOMAIN },
    },
    noscriptHtml: `<h1>Closing Lines — SteamWatch</h1>
<p>Compare opening and closing odds across major European football leagues. Track closing line value and market efficiency on 1X2, Asian Handicap, and Totals markets.</p>
<p>Leagues: Premier League, La Liga, Bundesliga, Serie A, Ligue 1.</p>
<p><a href="https://www.steamwatch.io">Back to SteamWatch</a></p>`,
  },
  {
    path: 'cl-closing-lines',
    title: 'Champions League Closing Lines — SteamWatch',
    description:
      'Champions League closing line analysis. Compare opening and closing odds for every UCL match across 1X2, Asian Handicap, and Totals markets.',
    ogType: 'website',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: 'SteamWatch Champions League Closing Lines',
      description:
        'Opening vs closing odds for Champions League matches',
      url: `${DOMAIN}/cl-closing-lines`,
      temporalCoverage: '2025/..',
      creator: { '@type': 'Organization', name: 'SteamWatch', url: DOMAIN },
    },
    noscriptHtml: `<h1>Champions League Closing Lines — SteamWatch</h1>
<p>Compare opening and closing odds for every Champions League match. Grouped by matchday with 1X2, Asian Handicap, and Totals analysis.</p>
<p><a href="https://www.steamwatch.io">Back to SteamWatch</a></p>`,
  },
  {
    path: 'tools/match-predictor',
    title: 'Match Predictor — SteamWatch Dixon-Coles Model',
    description:
      'Generate match probability predictions using the SteamWatch Dixon-Coles adjusted Poisson model. Fair odds for 1X2, Asian Handicap, and Totals markets.',
    ogType: 'website',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'SteamWatch Match Predictor',
      url: `${DOMAIN}/tools/match-predictor`,
      description:
        'Dixon-Coles adjusted Poisson model for football match probability predictions',
      applicationCategory: 'SportsApplication',
      operatingSystem: 'Web',
    },
    noscriptHtml: `<h1>Match Predictor — SteamWatch</h1>
<p>Generate match probability predictions using the Dixon-Coles adjusted Poisson regression model. Input team stats to get fair odds for 1X2, Asian Handicap, and Totals markets.</p>
<p><a href="https://www.steamwatch.io">Back to SteamWatch</a></p>`,
  },
  {
    path: 'tools/rolling-xg',
    title: 'Rolling xG — SteamWatch',
    description:
      'Track rolling expected goals (xG) trends for every team across Europe\'s top football leagues. Identify form changes and performance shifts.',
    ogType: 'website',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'SteamWatch Rolling xG',
      url: `${DOMAIN}/tools/rolling-xg`,
      description:
        'Rolling expected goals trends for teams across major European football leagues',
      applicationCategory: 'SportsApplication',
      operatingSystem: 'Web',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    },
    noscriptHtml: `<h1>Rolling xG — SteamWatch</h1>
<p>Track rolling expected goals (xG For and xG Against) trends for every team across Europe's top football leagues. Visualise form changes with 5 and 10 game rolling windows.</p>
<p>Leagues: Premier League, La Liga, Bundesliga, Serie A, Ligue 1.</p>
<p><a href="https://www.steamwatch.io">Back to SteamWatch</a></p>`,
  },
];

for (const page of PAGES) {
  const url = `${DOMAIN}/${page.path}`;

  let html = template.replace(/<title>[^<]*<\/title>/, `<title>${page.title}</title>`);

  html = html.replace(
    /<meta name="description" content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${page.description}" />`
  );
  html = html.replace(
    /<meta property="og:type" content="[^"]*"\s*\/?>/,
    `<meta property="og:type" content="${page.ogType}" />`
  );
  html = html.replace(
    /<meta property="og:url" content="[^"]*"\s*\/?>/,
    `<meta property="og:url" content="${url}" />`
  );
  html = html.replace(
    /<meta property="og:title" content="[^"]*"\s*\/?>/,
    `<meta property="og:title" content="${page.title}" />`
  );
  html = html.replace(
    /<meta property="og:description" content="[^"]*"\s*\/?>/,
    `<meta property="og:description" content="${page.description}" />`
  );
  html = html.replace(
    /<meta name="twitter:title" content="[^"]*"\s*\/?>/,
    `<meta name="twitter:title" content="${page.title}" />`
  );
  html = html.replace(
    /<meta name="twitter:description" content="[^"]*"\s*\/?>/,
    `<meta name="twitter:description" content="${page.description}" />`
  );
  html = html.replace(
    /<link rel="canonical" href="[^"]*"\s*\/?>/,
    `<link rel="canonical" href="${url}" />`
  );

  // Replace the homepage WebApplication JSON-LD with the page-specific one
  html = html.replace(
    /<script type="application\/ld\+json">[\s\S]*?<\/script>\s*\n\s*<!-- Privacy/,
    `<script type="application/ld+json">${JSON.stringify(page.jsonLd)}</script>\n\n    <!-- Privacy`
  );

  // Replace generic noscript with page-specific content
  html = html.replace(
    /<noscript>[\s\S]*?<\/noscript>/,
    `<noscript>\n      ${page.noscriptHtml}\n    </noscript>`
  );

  const outDir = resolve(DIST, ...page.path.split('/'));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'index.html'), html, 'utf-8');

  console.log(`  ✓ /${page.path}`);
}

console.log(`Pre-rendered ${PAGES.length} static page(s).`);
