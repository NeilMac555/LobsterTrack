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
  {
    slug: 'what-is-closing-line-value-in-football-betting',
    title: 'What Is Closing Line Value (CLV) in Football Betting?',
    description:
      'Closing line value explained: what CLV is, how to calculate it in implied probability, why beating the closing line is the best predictor of long-term betting profit, and how to track it.',
    author: 'Neil Macdonald',
    datePublished: '2026-08-15',
    faq: [
      {
        question: 'What is closing line value in betting?',
        answer:
          'Closing line value (CLV) is the difference between the odds you took and the final odds available just before kickoff — the closing line. If you backed a team at 2.20 and it closed at 2.00, you beat the close and hold positive CLV on that bet.',
      },
      {
        question: 'Why does the closing line matter so much?',
        answer:
          'The closing line is the most informed price the market ever produces — it has absorbed every bet, every team-news drop and every model that fired before kickoff. Beating it consistently means you are getting better prices than the market’s final judgement, which is the strongest known predictor of long-term profit.',
      },
      {
        question: 'How do you calculate CLV?',
        answer:
          'Convert both prices to implied probability (1 divided by decimal odds) and take the difference. Backing at 2.20 is a 45.5% implied price; a 2.00 close is 50%. You beat the close by 4.5 percentage points. Measuring in probability, not raw odds, keeps favourites and longshots comparable.',
      },
      {
        question: 'Is beating the closing line proof you are a winning bettor?',
        answer:
          'Over a meaningful sample, yes — it is the best evidence available, and it shows up long before profit does. Results in small samples are mostly luck; CLV is not. A bettor who beats the close consistently is expected to win long-term even through losing runs, and a profitable bettor with consistently negative CLV is expected to give it back.',
      },
    ],
    noscriptHtml: `<h1>What Is Closing Line Value (CLV) in Football Betting?</h1>
<p>By Neil Macdonald — August 15, 2026</p>
<p>Closing line value (CLV) is the difference between the odds you took and the final odds available just before kickoff — the closing line. Back a team at 2.20 that closes at 2.00 and you beat the close. Do that consistently and you are almost certainly a long-term winner, whatever this month's results say.</p>
<h2>Why the closing line is the benchmark</h2>
<p>The closing line is the most informed price the market ever produces. By kickoff it has absorbed every bet, every confirmed team-news drop, and every model that fired. At a high-limit book like Pinnacle, the close is the sharpest single estimate of the true probabilities that exists anywhere.</p>
<h2>How to calculate CLV</h2>
<p>Convert both prices to implied probability (1 / decimal odds) and take the difference. 2.20 is 45.5%; a 2.00 close is 50%. You beat the close by 4.5 percentage points. Measure in probability, not raw odds, so favourites and longshots stay comparable.</p>
<h2>Why CLV predicts profit</h2>
<p>Short-term results are mostly luck. CLV is not. If your bets consistently beat the closing price, you are systematically buying probability for less than the market's final estimate of what it is worth — and over a large sample that edge must show up as profit. The reverse also holds: a hot streak with negative CLV is borrowed money.</p>
<h2>How to track it</h2>
<p>Record the price you took and compare it to the close for every bet. SteamWatch records opening and closing Pinnacle prices for every tracked match across 1X2, Asian Handicap and Totals markets.</p>
<p><a href="https://www.steamwatch.io/closing-lines">View Closing Lines on SteamWatch</a></p>`,
  },
  {
    slug: 'what-is-a-drifter-in-football-betting',
    title: 'What Is a Drifter in Football Betting?',
    description:
      'Drifters explained: what it means when football odds drift, why prices lengthen before kickoff, how drift relates to steam, and what the data says about backing or fading drifting teams.',
    author: 'Neil Macdonald',
    datePublished: '2026-08-15',
    faq: [
      {
        question: 'What is a drifter in football betting?',
        answer:
          'A drifter is a selection whose odds lengthen before kickoff — the price "drifts" out, meaning its implied probability falls. A team that opens at 2.00 and closes at 2.30 has drifted: the market’s final estimate of its chances dropped from 50% to about 43.5%.',
      },
      {
        question: 'Why do football odds drift?',
        answer:
          'A price drifts when the weight of money and information moves against that outcome — the market is backing the other side, team news has weakened the case, or the opening price was simply set too short. Whatever the cause, drift means the market has revised that outcome’s probability downward.',
      },
      {
        question: 'Is backing drifters profitable?',
        answer:
          'Blindly backing every drifter means systematically taking outcomes the market has downgraded — the closing price is the market’s most informed estimate, and drift means that estimate fell. Any strategy involving drifters needs a real reason to believe the drift overshot, and a tracked record to prove it. Judge it with data, not instinct.',
      },
      {
        question: 'What is the opposite of a drifter?',
        answer:
          'A steamer — a selection whose odds shorten before kickoff as money arrives on it. Steam and drift are two views of the same repricing: when one outcome in a market steams, the probability has to come from somewhere, and the other outcomes drift.',
      },
    ],
    noscriptHtml: `<h1>What Is a Drifter in Football Betting?</h1>
<p>By Neil Macdonald — August 15, 2026</p>
<p>A drifter is a selection whose odds lengthen before kickoff — the price "drifts" out, meaning its implied probability falls. A team that opens at 2.00 and closes at 2.30 has drifted: the market's final estimate of its chances dropped from 50% to roughly 43.5%.</p>
<h2>Drift is the other half of steam</h2>
<p>Probability in a market has to add up. When money piles onto one outcome and its price shortens (steam), that probability comes from somewhere — the other outcomes lengthen. Steam and drift are two views of the same repricing. SteamWatch tracks both sides: steam moves on one page, drifters on another, each with the outcome recorded afterwards.</p>
<h2>Why odds drift</h2>
<p>A price drifts when the weight of money and information moves against that outcome: the market is backing the other side, confirmed team news weakened the case, or the opening price was simply too short. Whatever the specific cause, drift means the market revised that outcome's probability downward — and kept revising it until kickoff.</p>
<h2>Backing or fading drifters</h2>
<p>Blindly backing drifters means systematically taking outcomes the market downgraded. Blindly fading them means laying prices the market has already corrected. Neither is free money — which is why the honest approach is to track what actually happened, match after match, and let the record speak.</p>
<p><a href="https://www.steamwatch.io/drifters">View Drifters on SteamWatch</a></p>`,
  },
  {
    slug: 'how-to-read-closing-lines-in-football-betting',
    title: 'How to Read Closing Lines in Football Betting',
    description:
      'A practical guide to reading closing lines: converting odds to implied probability, comparing opening and closing prices, what open-to-close movement tells you, and which markets to trust.',
    author: 'Neil Macdonald',
    datePublished: '2026-08-15',
    faq: [
      {
        question: 'What is a closing line?',
        answer:
          'The closing line is the final odds available on a market just before kickoff. It is the market’s last and most informed price — every bet, lineup announcement and piece of news that arrived before the match is reflected in it.',
      },
      {
        question: 'What does it mean when the closing line is different from the opening line?',
        answer:
          'The gap between open and close is the market’s week of learning compressed into one number. A price that shortened from open to close means the market raised that outcome’s probability; a price that lengthened means it lowered it. The bigger the gap, the more the market changed its mind.',
      },
      {
        question: 'How do you convert decimal odds to implied probability?',
        answer:
          'Divide 1 by the decimal odds. Odds of 2.50 imply 1 / 2.50 = 40%. Note that a full market’s implied probabilities sum to slightly more than 100% — the excess is the bookmaker’s margin (vig).',
      },
      {
        question: 'Why use Pinnacle closing lines specifically?',
        answer:
          'Pinnacle takes the highest limits in the world and welcomes winning players, so its prices are shaped by the sharpest money in the market. Its closing line is widely treated as the cleanest available estimate of true match probabilities, which is why analysts benchmark against it.',
      },
    ],
    noscriptHtml: `<h1>How to Read Closing Lines in Football Betting</h1>
<p>By Neil Macdonald — August 15, 2026</p>
<p>The closing line is the final odds available just before kickoff — the market's last and most informed price. Learning to read closes, and the distance between open and close, tells you more about a match's market than any pundit will.</p>
<h2>Convert to implied probability first</h2>
<p>Divide 1 by the decimal odds. 2.50 implies 40%. 1.57 implies 63.7%. A full market sums to slightly over 100% — the excess is the bookmaker's margin. Every serious read of a closing line starts in probability space, not odds space.</p>
<h2>The open-to-close gap is the story</h2>
<p>The difference between the opening and closing price is the market's week of learning compressed into one number. Shortened from 2.20 to 2.00: the market raised that outcome's probability by 4.5 points. Lengthened from 2.00 to 2.30: it cut the estimate by 6.5 points. The bigger the gap, the more the market changed its mind — and the worse the opener was.</p>
<h2>Which market's close to trust</h2>
<p>Asian Handicap closes at high-limit books are the sharpest read on relative team strength — that is where professional volume concentrates. Totals closes are the market's best estimate of goal expectation. 1X2 closes carry more recreational money and slightly more margin, so they are the noisiest of the three.</p>
<h2>What to do with it</h2>
<p>Compare every price you take against the eventual close (closing line value), and study open-to-close patterns by league and team. SteamWatch records opening and closing Pinnacle prices for every tracked match across all three markets.</p>
<p><a href="https://www.steamwatch.io/closing-lines">View Closing Lines on SteamWatch</a></p>`,
  },
  {
    slug: 'favourite-longshot-bias-in-football-betting',
    title: 'The Favourite-Longshot Bias in Football: Five Seasons of Pinnacle Closing Prices',
    description:
      'What blindly backing every favourite, underdog and draw at Pinnacle closing prices returned across 8,666 top-five-league matches from 2021/22 to August 2026. Favourites dead level, underdogs -10.7%, and the one venue split worth remembering.',
    author: 'Neil Macdonald',
    datePublished: '2026-09-02',
    faq: [
      {
        question: 'Are football favourites profitable to bet on?',
        answer:
          'Blindly backing every favourite at Pinnacle closing prices across 8,666 top-five-league matches (2021/22 to August 2026) returned 0.0%, dead level, so favourites as a group are a break-even bet at the close. Slight favourites (2.19 to 3.09) returned +3.1%, and favourites playing away returned +3.0%.',
      },
      {
        question: 'Why do underdogs lose money in football betting?',
        answer:
          'Underdogs are systematically overpriced by the market, which is the favourite-longshot bias. Blindly backing every underdog at Pinnacle closing prices lost 10.7% across 8,666 matches, and the biggest underdogs (5.29 and above) lost 14.7%. The price has to be wrong by more than that margin before a dog bet is even level.',
      },
      {
        question: 'What is the favourite-longshot bias?',
        answer:
          'The tendency for betting markets to price longshots too short and favourites too long relative to how often each actually wins. In football at Pinnacle closing prices it shows up as favourites returning roughly zero and underdogs returning around minus 11% when backed blindly.',
      },
      {
        question: 'Is backing the draw profitable in football?',
        answer:
          'Blindly backing the draw in every match at Pinnacle closing prices returned -1.9% across 8,666 top-five-league matches, so it sits between favourites and underdogs. Serie A (+0.9%) and the Bundesliga (+0.7%) were the only leagues where the draw came out ahead.',
      },
    ],
    noscriptHtml: `<h1>The Favourite-Longshot Bias in Football: Five Seasons of Pinnacle Closing Prices</h1>
<p>By Neil Macdonald - September 2, 2026</p>
<p>Every punter has heard that the market overprices longshots. I wanted to see what that looks like in football with real closing prices rather than a paper from 2004, so I ran every Pinnacle closing 1X2 price we hold across the top 5 leagues, 2021/22 through to the end of August 2026. 8,666 matches. Flat 1 unit on the favourite in every one of them, 1 unit on the dog, 1 unit on the draw, and see what comes back.</p>
<h2>What blind backing returns</h2>
<p>Favourites: 0.0% over 8,666 bets. Dead level, the vig handed back and nothing else.</p>
<p>Underdogs: -10.7% over the same 8,666 matches.</p>
<p>The draw: -1.9%.</p>
<p>So the dog bettor is paying just under 11p in the pound for the privilege and the fav bettor is paying nothing.</p>
<h2>It gets worse the bigger the dog</h2>
<p>The bands are terciles, 2,889 matches in each, I didn't pick the boundaries. Slight Dog (2.58 to 3.62) -8.8%. Mid Dog (3.62 to 5.29) -8.6%. Super Dog (5.29 to 36.00) -14.7%.</p>
<p>Favourites go the other way. Super Fav (under 1.70) -1.2%, Mid Fav (1.70 to 2.19) -1.8%, Slight Fav (2.19 to 3.09) +3.1%.</p>
<h2>Away favourites are the number to remember</h2>
<p>The market still pays too much respect to home advantage in the 1X2 and it has done for 5 seasons. Fav at home, 5,666 matches, -1.5%. Fav away, 3,000 matches, +3.0%. Slight Favs playing away came in at +5.9%, the dogs at home against them lost 13.1%, and the Super Dogs at home to an away fav lost 19p in the pound.</p>
<h2>By league</h2>
<p>Serie A is the worst place to back a dog, -15.4% overall and -24.5% on Super Dogs, with La Liga a whisker behind at -15.3%.</p>
<p>La Liga favs +3.7%, the only league where all 3 fav bands are positive.</p>
<p>Bundesliga favs -1.8% and dogs -6.7%, and it's one of only two leagues where the draw came out ahead (+0.7%), Serie A being the other (+0.9%).</p>
<p>Ligue 1 Mid Dogs show +8.4%, which I'd treat as noise from 541 matches rather than an edge, the other two dog bands are -4.8% and -15.1%.</p>
<p>Premier League favs -0.2%, dogs -10.2%, Super Dogs -18.7%.</p>
<h2>What I'd take from it</h2>
<p>Blind favourites come out level and blind dogs cost you just under 11%. You can still back a dog, the price just has to be wrong by more than 10% before you're level, and away favs in tight games are the one blind angle that's been paying.</p>
<p>One patch in the sample: about 200 matches between mid January and mid February 2026, football-data stopped publishing Pinnacle prices in January and our own closing line capture didn't start until the 12th of February. Those use the Betfair Exchange close instead, which is quoted before commission so it runs a shade better than Pinnacle. Everything from the 12th of February on is our own Pinnacle record and it updates every week. Every number above is on the Longshot Bias page with league, season and venue filters, and you can pull up any Premier League club on its own, 25/26 and 26/27 are free to look at.</p>
<p><a href="https://www.steamwatch.io/longshot-bias">View Longshot Bias on SteamWatch</a></p>`,
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

  // Replace the homepage's WebApplication + FAQPage JSON-LD with the
  // post's Article + FAQPage (same regex the static-page branch uses).
  // Until 2026-09-02 this appended instead, leaving every post with two
  // FAQPage blocks — Google honours at most one FAQPage per URL and may
  // ignore both when it sees two, so the post's own FAQ never got
  // eligible for rich results.
  const jsonLd = `<script type="application/ld+json">${articleSchema(post)}</script>\n    ${faqSchema(post)}`;
  html = html.replace(
    /<script type="application\/ld\+json">[\s\S]*?<\/script>\s*\n\s*<!-- Privacy/,
    `${jsonLd}\n\n    <!-- Privacy`
  );

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
    title: 'Do Steam Moves Win? Football Steam Move Results & ROI — SteamWatch',
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
<p>Do steam moves win? SteamWatch records every significant pre-kickoff price shortening (3+ percentage points of implied probability at Pinnacle) across major European leagues and tracks what happened next.</p>
<h2>The all-time record (27 January 2026 to 1 September 2026)</h2>
<ul>
  <li>531 steam moves tracked through to a result. 216 won (40.7%), 128 drew, 187 lost.</li>
  <li>Backing every one blind at the price when the move was detected returned -3.5% (-18.7 units at flat 1 unit stakes).</li>
  <li>Drifters, the moves going the other way: 797 tracked, 284 won (35.6%), blind backing returned -3.5%.</li>
</ul>
<p>A steam move tells you the market changed its mind, it does not tell you the market was wrong. The per-team rankings, updated after every result, show which sides the money has been right about this season.</p>
<p>Leagues covered: Premier League, La Liga, Bundesliga, Serie A, Ligue 1, Champions League, Europa League.</p>
<p><a href="https://www.steamwatch.io/blog/what-are-steam-moves-in-football-betting">What is a steam move?</a> · <a href="https://www.steamwatch.io/drifters">Drifters</a> · <a href="https://www.steamwatch.io">Back to SteamWatch</a></p>`,
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
        'https://www.youtube.com/@neilmac555',
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
    title: 'Pinnacle Closing Lines Archive: Opening vs Closing Football Odds — SteamWatch',
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
    title: 'Champions League Closing Lines: Pinnacle Opening vs Closing Odds — SteamWatch',
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
    title: 'Football Match Predictor: Dixon-Coles Probabilities & Fair Odds — SteamWatch',
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
    title: 'Rolling xG Tables: Football Team Form by Expected Goals — SteamWatch',
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
  {
    path: 'drifters',
    title: 'Football Drifters: Odds That Lengthened Before Kickoff & What Happened — SteamWatch',
    description:
      'Football odds drifters: selections whose prices lengthened before kickoff, tracked with outcomes recorded. The other side of steam, across major European leagues.',
    ogType: 'website',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: 'SteamWatch Football Drifters',
      description:
        'Selections whose odds lengthened before kickoff across major European football leagues, with outcomes recorded',
      url: `${DOMAIN}/drifters`,
      temporalCoverage: '2025/..',
      creator: { '@type': 'Organization', name: 'SteamWatch', url: DOMAIN },
      keywords: ['drifters', 'odds drift', 'football betting', 'line movement'],
    },
    noscriptHtml: `<h1>Drifters — SteamWatch</h1>
<p>A drifter is a selection whose odds lengthened before kickoff — its implied probability fell. SteamWatch tracks every drift across major European leagues and records what happened next: win rates and profit/loss for the moves going the other way.</p>
<h2>The all-time record (27 January 2026 to 1 September 2026)</h2>
<ul>
  <li>797 drifters tracked through to a result. 284 won (35.6%), 200 drew, 313 lost.</li>
  <li>Backing every drifter blind at the drifted price returned -3.5% (-28.0 units at flat 1 unit stakes).</li>
  <li>For comparison, backing every steam move blind over the same period also returned -3.5% across 531 moves.</li>
</ul>
<p>Leagues covered: Premier League, La Liga, Bundesliga, Serie A, Ligue 1, Champions League, Europa League.</p>
<p><a href="https://www.steamwatch.io/blog/what-is-a-drifter-in-football-betting">What is a drifter?</a> · <a href="https://www.steamwatch.io">Back to SteamWatch</a></p>`,
  },
  {
    path: 'team-pnl',
    title: 'Team P/L: Blind Back & Fade Returns for Every Football Team — SteamWatch',
    description:
      'What backing or fading every team blindly would have returned, by season and venue. Profit/loss records built from Pinnacle closing prices across major European leagues.',
    ogType: 'website',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: 'SteamWatch Team Profit/Loss Records',
      description:
        'Blind back and fade profit/loss for every tracked team, computed from Pinnacle closing prices, split by season and venue',
      url: `${DOMAIN}/team-pnl`,
      temporalCoverage: '2025/..',
      creator: { '@type': 'Organization', name: 'SteamWatch', url: DOMAIN },
      keywords: ['team profit loss', 'back and fade', 'football betting', 'closing prices'],
    },
    noscriptHtml: `<h1>Team P/L — SteamWatch</h1>
<p>What would blindly backing — or blindly fading — each team have returned? SteamWatch computes profit/loss for every tracked team from Pinnacle closing prices, split by season and home/away venue.</p>
<p>Leagues covered: Premier League, EFL Championship, La Liga, Bundesliga, Serie A, Ligue 1.</p>
<p><a href="https://www.steamwatch.io">Back to SteamWatch</a></p>`,
  },
  {
    path: 'longshot-bias',
    title: 'Longshot Bias — Favourites vs Underdogs ROI at Pinnacle Closing Prices | SteamWatch',
    description:
      'What blindly backing every favourite, underdog or draw at Pinnacle closing prices returned across 8,666 top-five-league matches since 2021/22, by odds band, league, season and venue, plus every club in all five leagues on its own. Favourites dead level, underdogs -10.7%.',
    ogType: 'website',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'Dataset',
        name: 'SteamWatch Longshot Bias: blind favourite, underdog and draw returns at Pinnacle closing prices',
        description:
          'Flat-stake yield from backing every favourite, underdog and draw at Pinnacle closing 1X2 prices across the Premier League, La Liga, Bundesliga, Serie A and Ligue 1, bucketed into data-driven odds bands and filterable by league, season, venue and team. 8,666 matches from 2021/22 onward, updated weekly.',
        url: `${DOMAIN}/longshot-bias`,
        temporalCoverage: '2021-08/..',
        spatialCoverage: 'England, Spain, Germany, Italy, France',
        creator: { '@type': 'Organization', name: 'SteamWatch', url: DOMAIN },
        keywords: ['favourite-longshot bias', 'football betting', 'underdog ROI', 'Pinnacle closing odds', 'blind backing favourites'],
        variableMeasured: ['flat-stake yield by odds band', 'median closing odds', 'cumulative profit in units', 'per-team ROI as favourite and as underdog'],
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          { '@type': 'Question', name: 'Are football favourites profitable to bet on?', acceptedAnswer: { '@type': 'Answer', text: 'Blindly backing every favourite at Pinnacle closing prices across 8,666 top-five-league matches (2021/22 to August 2026) returned 0.0%, dead level, so favourites as a group are a break-even bet at the close. Slight favourites (2.19 to 3.09) returned +3.1%, and favourites playing away returned +3.0%.' } },
          { '@type': 'Question', name: 'Why do underdogs lose money in football betting?', acceptedAnswer: { '@type': 'Answer', text: 'Underdogs are systematically overpriced by the market, which is the favourite-longshot bias. Blindly backing every underdog at Pinnacle closing prices lost 10.7% across 8,666 matches, and the biggest underdogs (5.29 and above) lost 14.7%. The price has to be wrong by more than that margin before a dog bet is even level.' } },
          { '@type': 'Question', name: 'What is the favourite-longshot bias?', acceptedAnswer: { '@type': 'Answer', text: 'The tendency for betting markets to price longshots too short and favourites too long relative to how often each actually wins. In football at Pinnacle closing prices it shows up as favourites returning roughly zero and underdogs returning around minus 11% when backed blindly.' } },
          { '@type': 'Question', name: 'Is backing the draw profitable in football?', acceptedAnswer: { '@type': 'Answer', text: 'Blindly backing the draw in every match at Pinnacle closing prices returned -1.9% across 8,666 top-five-league matches, so it sits between favourites and underdogs. Serie A (+0.9%) and the Bundesliga (+0.7%) were the only leagues where the draw came out ahead.' } },
        ],
      },
    ],
    noscriptHtml: `<h1>Longshot Bias — SteamWatch</h1>
<p>What blindly backing every favourite, underdog or draw at Pinnacle closing prices would have returned. 8,666 matches across the Premier League, La Liga, Bundesliga, Serie A and Ligue 1, 2021/22 to August 2026, flat 1 unit stakes, updated weekly.</p>
<h2>Headline numbers (all five leagues)</h2>
<ul>
  <li>Every favourite: 0.0% yield. Super Fav (1.06 to 1.70) -1.2%, Mid Fav (1.70 to 2.19) -1.8%, Slight Fav (2.19 to 3.09) +3.1%.</li>
  <li>Every underdog: -10.7% yield. Slight Dog (2.58 to 3.62) -8.8%, Mid Dog (3.62 to 5.29) -8.6%, Super Dog (5.29 to 36.00) -14.7%.</li>
  <li>Every draw: -1.9% yield at a median price of 3.71.</li>
  <li>Favourite playing at home (5,666 matches): -1.5%. Favourite playing away (3,000 matches): +3.0%.</li>
</ul>
<h2>By league</h2>
<ul>
  <li>Premier League: favourites -0.2%, underdogs -10.2%, draws -2.9%.</li>
  <li>La Liga: favourites +3.7%, underdogs -15.3%, draws -5.1%.</li>
  <li>Bundesliga: favourites -1.8%, underdogs -6.7%, draws +0.7%.</li>
  <li>Serie A: favourites +0.3%, underdogs -15.4%, draws +0.9%.</li>
  <li>Ligue 1: favourites -2.8%, underdogs -3.9%, draws -2.7%.</li>
</ul>
<h2>Per team</h2>
<p>Every club in the Premier League, La Liga, Serie A, Bundesliga and Ligue 1 can be pulled up on its own: record, win rate, median close and flat-stake ROI backing or fading them, split by matches where they were the favourite and matches where they were the underdog, with a match-by-match cumulative chart. Example: Arsenal, all time, +4.9% backing overall, +8.5% as favourite, -26.1% as underdog.</p>
<p>Odds bands are terciles of the filtered data (equal match counts per band). The favourite is whichever side closed shorter. Backing the favourite or the underdog loses on a draw. Prices are football-data.co.uk's Pinnacle closes to January 2026 and SteamWatch's own Pinnacle closing-line capture from February 2026, with the Betfair Exchange close standing in for the roughly 200 matches between the two. Premier League 25/26 and the live 26/27 season are free to explore; every league and season is available with SteamWatch Pro.</p>
<p><a href="https://www.steamwatch.io/blog/favourite-longshot-bias-in-football-betting">Read the full breakdown</a> · <a href="https://www.steamwatch.io">Back to SteamWatch</a></p>`,
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
