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
