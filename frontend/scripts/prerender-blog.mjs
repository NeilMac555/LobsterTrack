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
      'What blindly backing every favourite, underdog and draw at Pinnacle closing prices returned across 8,867 top-five-league matches from 2021/22 to August 2026. Favourites near enough level, underdogs -10.5%, and the one venue split worth remembering.',
    author: 'Neil Macdonald',
    datePublished: '2026-09-02',
    faq: [
      {
        question: 'Are football favourites profitable to bet on?',
        answer:
          'Blindly backing every favourite at Pinnacle closing prices across 8,867 top-five-league matches (2021/22 to August 2026) returned +0.2%, near enough level, so favourites as a group are a break-even bet at the close. Slight favourites (2.19 to 3.09) returned +3.7%, and favourites playing away returned +3.2%.',
      },
      {
        question: 'Why do underdogs lose money in football betting?',
        answer:
          'Underdogs are systematically overpriced by the market, which is the favourite-longshot bias. Blindly backing every underdog at Pinnacle closing prices lost 10.5% across 8,867 matches, and the biggest underdogs (5.30 and above) lost 14.0%. The price has to be wrong by more than that margin before a dog bet is even level.',
      },
      {
        question: 'What is the favourite-longshot bias?',
        answer:
          'The tendency for betting markets to price longshots too short and favourites too long relative to how often each actually wins. In football at Pinnacle closing prices it shows up as favourites returning roughly zero and underdogs returning around minus 10% when backed blindly.',
      },
      {
        question: 'Is backing the draw profitable in football?',
        answer:
          'Blindly backing the draw in every match at Pinnacle closing prices returned -2.0% across 8,867 top-five-league matches, so it sits between favourites and underdogs. The Bundesliga (+1.1%) and Serie A (+0.4%) were the only leagues where the draw came out ahead.',
      },
    ],
    noscriptHtml: `<h1>The Favourite-Longshot Bias in Football: Five Seasons of Pinnacle Closing Prices</h1>
<p>By Neil Macdonald - September 2, 2026</p>
<p>Every punter has heard that the market overprices longshots. I wanted to see what that looks like in football with real closing prices rather than a paper from 2004, so I ran every Pinnacle closing 1X2 price we hold across the top 5 leagues, 2021/22 through to the end of August 2026. 8,867 matches. Flat 1 unit on the favourite in every one of them, 1 unit on the dog, 1 unit on the draw, and see what comes back.</p>
<h2>What blind backing returns</h2>
<p>Favourites: +0.2% over 8,867 bets. Near enough level, the vig handed back and nothing else.</p>
<p>Underdogs: -10.5% over the same 8,867 matches.</p>
<p>The draw: -2.0%.</p>
<p>So the dog bettor is paying just over 10p in the pound for the privilege and the fav bettor is paying nothing.</p>
<h2>It gets worse the bigger the dog</h2>
<p>The bands are terciles, 2,956 matches in each, I didn't pick the boundaries. Slight Dog (2.58 to 3.62) -9.6%. Mid Dog (3.62 to 5.30) -8.0%. Super Dog (5.30 to 36.00) -14.0%.</p>
<p>Favourites go the other way. Super Fav (under 1.70) -1.2%, Mid Fav (1.70 to 2.19) -1.8%, Slight Fav (2.19 to 3.09) +3.7%.</p>
<h2>Away favourites are the number to remember</h2>
<p>The market still pays too much respect to home advantage in the 1X2 and it has done for 5 seasons. Fav at home, 5,801 matches, -1.4%. Fav away, 3,066 matches, +3.2%. Slight Favs playing away came in at +6.8%, the dogs at home against them lost 13.3%, and the Super Dogs at home to an away fav lost 18.6p in the pound.</p>
<h2>By league</h2>
<p>Serie A is the worst place to back a dog, -15.6% overall and -23.9% on Super Dogs, with La Liga next at -14.6%.</p>
<p>La Liga favs +3.8%, the only league where all 3 fav bands are positive.</p>
<p>Bundesliga favs -1.1% and dogs -6.9%, and it's one of only two leagues where the draw came out ahead (+1.1%), Serie A being the other (+0.4%).</p>
<p>Ligue 1 Mid Dogs show +8.4%, which I'd treat as noise from 553 matches rather than an edge, the other two dog bands are -5.8% and -16.0%.</p>
<p>Premier League favs -0.5%, dogs -9.3%, Super Dogs -17.6%.</p>
<h2>What I'd take from it</h2>
<p>Blind favourites come out level and blind dogs cost you just over 10%. You can still back a dog, the price just has to be wrong by more than 10% before you're level, and away favs in tight games are the one blind angle that's been paying.</p>
<p>One patch in the sample: about 200 matches between mid January and mid February 2026, football-data stopped publishing Pinnacle prices in January and our own closing line capture didn't start until the 12th of February. Those use the Betfair Exchange close instead, which is quoted before commission so it runs a shade better than Pinnacle. Everything from the 12th of February on is our own Pinnacle record and it updates every week. Every number above is on the Longshot Bias page with league, season and venue filters, and you can pull up any club in the five leagues on its own, Premier League 25/26 and 26/27 are free to look at.</p>
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
// Static pages — data (path, meta, JSON-LD, page HTML in `noscriptHtml`)
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
        'https://www.sharpsidesoccer.com/',
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
<li><a href="https://www.sharpsidesoccer.com/">Sharp Side Soccer (Substack)</a></li>
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
<p>Explore an xG-based Poisson baseline with the Dixon-Coles low-score correction. Select recorded team data or enter your own figures for 1X2, Asian Handicap, and Totals fair odds. Market-beating accuracy has not been established.</p>
<p><a href="https://www.steamwatch.io">Back to SteamWatch</a></p>`,
  },
  {
    path: 'tools/club-ratings',
    title: 'European Club Ratings (Beta) — SteamWatch',
    description: 'Free European club strength ratings combining long-term quality, recent performance and community feedback. Updated weekly.',
    ogType: 'website',
    jsonLd: {
      '@context': 'https://schema.org', '@type': 'WebApplication',
      name: 'SteamWatch Club Ratings', url: `${DOMAIN}/tools/club-ratings`,
      applicationCategory: 'SportsApplication', operatingSystem: 'Web',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    },
    noscriptHtml: `<h1>European Club Ratings — Beta</h1><p>Free club strength rankings across the top five leagues, Champions League and Europa League. The ratings combine longer-term team quality with recent results and underlying performance, accounting for the level of opposition. Members can vote higher or lower, informing a bounded weekly adjustment.</p><p><a href="https://www.steamwatch.io">Back to SteamWatch</a></p>`,
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
      'What blindly backing every favourite, underdog or draw at Pinnacle closing prices returned across 8,867 top-five-league matches since 2021/22, by odds band, league, season and venue, plus every club in all five leagues on its own. Favourites near enough level, underdogs -10.5%.',
    ogType: 'website',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'Dataset',
        name: 'SteamWatch Longshot Bias: blind favourite, underdog and draw returns at Pinnacle closing prices',
        description:
          'Flat-stake yield from backing every favourite, underdog and draw at Pinnacle closing 1X2 prices across the Premier League, La Liga, Bundesliga, Serie A and Ligue 1, bucketed into data-driven odds bands and filterable by league, season, venue and team. 8,867 matches from 2021/22 onward, updated weekly.',
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
          { '@type': 'Question', name: 'Are football favourites profitable to bet on?', acceptedAnswer: { '@type': 'Answer', text: 'Blindly backing every favourite at Pinnacle closing prices across 8,867 top-five-league matches (2021/22 to August 2026) returned +0.2%, near enough level, so favourites as a group are a break-even bet at the close. Slight favourites (2.19 to 3.09) returned +3.7%, and favourites playing away returned +3.2%.' } },
          { '@type': 'Question', name: 'Why do underdogs lose money in football betting?', acceptedAnswer: { '@type': 'Answer', text: 'Underdogs are systematically overpriced by the market, which is the favourite-longshot bias. Blindly backing every underdog at Pinnacle closing prices lost 10.5% across 8,867 matches, and the biggest underdogs (5.30 and above) lost 14.0%. The price has to be wrong by more than that margin before a dog bet is even level.' } },
          { '@type': 'Question', name: 'What is the favourite-longshot bias?', acceptedAnswer: { '@type': 'Answer', text: 'The tendency for betting markets to price longshots too short and favourites too long relative to how often each actually wins. In football at Pinnacle closing prices it shows up as favourites returning roughly zero and underdogs returning around minus 10% when backed blindly.' } },
          { '@type': 'Question', name: 'Is backing the draw profitable in football?', acceptedAnswer: { '@type': 'Answer', text: 'Blindly backing the draw in every match at Pinnacle closing prices returned -2.0% across 8,867 top-five-league matches, so it sits between favourites and underdogs. The Bundesliga (+1.1%) and Serie A (+0.4%) were the only leagues where the draw came out ahead.' } },
        ],
      },
    ],
    noscriptHtml: `<h1>Longshot Bias — SteamWatch</h1>
<p>What blindly backing every favourite, underdog or draw at Pinnacle closing prices would have returned. 8,867 matches across the Premier League, La Liga, Bundesliga, Serie A and Ligue 1, 2021/22 to August 2026, flat 1 unit stakes, updated weekly.</p>
<h2>Headline numbers (all five leagues)</h2>
<ul>
  <li>Every favourite: +0.2% yield. Super Fav (1.06 to 1.70) -1.2%, Mid Fav (1.70 to 2.19) -1.8%, Slight Fav (2.19 to 3.09) +3.7%.</li>
  <li>Every underdog: -10.5% yield. Slight Dog (2.58 to 3.62) -9.6%, Mid Dog (3.62 to 5.30) -8.0%, Super Dog (5.30 to 36.00) -14.0%.</li>
  <li>Every draw: -2.0% yield at a median price of 3.71.</li>
  <li>Favourite playing at home (5,801 matches): -1.4%. Favourite playing away (3,066 matches): +3.2%.</li>
</ul>
<h2>By league</h2>
<ul>
  <li>Premier League: favourites -0.5%, underdogs -9.3%, draws -2.5%.</li>
  <li>La Liga: favourites +3.8%, underdogs -14.6%, draws -5.8%.</li>
  <li>Bundesliga: favourites -1.1%, underdogs -6.9%, draws +1.1%.</li>
  <li>Serie A: favourites +0.7%, underdogs -15.6%, draws +0.4%.</li>
  <li>Ligue 1: favourites -2.6%, underdogs -4.4%, draws -2.7%.</li>
</ul>
<h2>Per team</h2>
<p>Every club in the Premier League, La Liga, Serie A, Bundesliga and Ligue 1 can be pulled up on its own: record, win rate, median close and flat-stake ROI backing or fading them, split by matches where they were the favourite and matches where they were the underdog, with a match-by-match cumulative chart. Example: Aston Villa, all time, +25.9% backing overall.</p>
<p>Odds bands are terciles of the filtered data (equal match counts per band). The favourite is whichever side closed shorter. Backing the favourite or the underdog loses on a draw. Prices are football-data.co.uk's Pinnacle closes to January 2026 and SteamWatch's own Pinnacle closing-line capture from February 2026, with the Betfair Exchange close standing in for the roughly 200 matches between the two. Premier League 25/26 and the live 26/27 season are free to explore; every league and season is available with SteamWatch Pro.</p>
<p><a href="https://www.steamwatch.io/blog/favourite-longshot-bias-in-football-betting">Read the full breakdown</a> · <a href="https://www.steamwatch.io">Back to SteamWatch</a></p>`,
  },
];

// ---------------------------------------------------------------------------
// Extra static pages (2026-09-29): routes that previously fell back to the
// homepage template. Same shape as PAGES; `contentHtml` is real page HTML.
// ---------------------------------------------------------------------------
PAGES.push(
  {
    path: 'in-play-jumps',
    title: 'In-Play Jumps: Pinnacle Close vs Polymarket First 5 Minutes — SteamWatch',
    description:
      'The gap between the Pinnacle closing line and Polymarket\'s first five minutes of in-play trading, match by match, with the implied-probability change in percentage points.',
    ogType: 'website',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: 'SteamWatch In-Play Jumps',
      description: 'Per-match gap between the Pinnacle 1X2 closing line and the Polymarket price in the first five minutes after kickoff, in implied-probability percentage points.',
      url: `${DOMAIN}/in-play-jumps`,
      creator: { '@type': 'Organization', name: 'SteamWatch', url: DOMAIN },
      keywords: ['in-play odds', 'closing line', 'Polymarket', 'football betting'],
    },
    noscriptHtml: `<h1>In-Play Jumps</h1>
<p>Where the market went in the first five minutes after kickoff. For every tracked match SteamWatch records the Pinnacle closing 1X2 price and the first Polymarket price once in-play trading opens, then reports the gap between them in implied-probability percentage points.</p>
<h2>What the table shows</h2>
<ul>
  <li>The Pinnacle close for the side in question, as an implied probability.</li>
  <li>The Polymarket price at roughly T+5 minutes, as an implied probability.</li>
  <li>The gap in percentage points. A large positive gap means the in-play market priced the side higher than the close; a large negative gap means lower.</li>
</ul>
<p>The page reports observed prices only. It does not claim to know why a price moved. Match-level price histories are on each match page; the closing-line archive is at <a href="${DOMAIN}/closing-lines">Closing Lines</a>.</p>`,
  },
  {
    path: 'tools/bet-calculator',
    title: 'Bet Calculator: Singles, Doubles, Trebles and Accumulators — SteamWatch',
    description:
      'Free bet calculator for singles, doubles, trebles and accumulators. Enter fractional, decimal or American odds and a stake to see the return and profit.',
    ogType: 'website',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'SteamWatch Bet Calculator',
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      url: `${DOMAIN}/tools/bet-calculator`,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      description: 'Calculates returns for singles, doubles, trebles and accumulators from fractional, decimal or American odds.',
    },
    noscriptHtml: `<h1>Bet Calculator</h1>
<p>Work out the return and profit on a single, double, treble or accumulator. Enter each selection's odds in fractional, decimal or American format, set your stake, and the calculator shows the total return, the profit, and the combined odds.</p>
<h2>How accumulator returns are calculated</h2>
<p>Each selection's decimal odds are multiplied together to give the combined price, and the stake is multiplied by that combined price to give the return. Fractional odds convert to decimal by dividing the numerator by the denominator and adding 1 (5/2 is 3.50). Positive American odds convert as odds divided by 100 plus 1 (+150 is 2.50); negative American odds as 100 divided by the absolute value plus 1 (-200 is 1.50).</p>
<p>Also on SteamWatch: the <a href="${DOMAIN}/tools/hedge-calculator">Hedge Calculator</a> for locking in a profit or limiting a loss on an open bet.</p>`,
  },
  {
    path: 'tools/form-lab',
    title: 'Form Lab: Football Form, Handicap Cover Rates and Home/Away Splits — SteamWatch',
    description:
      'Compare football form across the top leagues: results by opponent strength, goal patterns, Asian handicap cover rates, home and away splits, and rolling expected goals, built from Pinnacle closing prices.',
    ogType: 'website',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: 'SteamWatch Form Lab',
      url: `${DOMAIN}/tools/form-lab`,
      description: 'League-wide form tables with opponent-strength filters, handicap cover rates, home/away splits and rolling expected goals for the top European leagues.',
      creator: { '@type': 'Organization', name: 'SteamWatch', url: DOMAIN },
      keywords: ['football form', 'Asian handicap cover', 'home away split', 'expected goals'],
    },
    noscriptHtml: `<h1>Form Lab</h1>
<p class="pr-lead">Form, the way the market measures it. Form Lab lays out every club's recent results against the closing price it was given: how often it covered the Asian handicap, how it did against strong and weak opposition, its home and away splits, its goal patterns, and its rolling expected goals.</p>
<h2>What you can compare</h2>
<ul>
  <li>Results and handicap cover rates over the last 5, 10 or 20 league matches, sortable by any column.</li>
  <li>An opponent-strength filter based on rolling 20-match strength, so a run against the bottom half reads differently from a run against the top six.</li>
  <li>Home and away splits side by side, with promoted clubs marked and their samples limited to the current season.</li>
  <li>Rolling non-penalty expected goals for and against.</li>
</ul>
<p>A public sample is free; every competition, filter and view is available with SteamWatch Pro. See also <a href="/tools/rolling-xg">Rolling xG</a>, <a href="/team-pnl">Team P/L</a> and <a href="/longshot-bias">Longshot Bias</a>.</p>`,
  },
);

// ---------------------------------------------------------------------------
// Route manifest check — src/routes.json is the single source of truth.
// App.tsx must declare exactly those routes, and every public route must
// have a prerender entry. Either mismatch fails the build, so a new page
// cannot ship and 404 in production because a list was forgotten.
// ---------------------------------------------------------------------------
const ROUTES = JSON.parse(readFileSync(resolve(__dirname, '..', 'src', 'routes.json'), 'utf-8'));
{
  const appSrc = readFileSync(resolve(__dirname, '..', 'src', 'App.tsx'), 'utf-8');
  const declared = new Set();
  for (const m of appSrc.matchAll(/<Route\s+(?:index|path="([^"]*)")/g)) {
    const raw = m[1] === undefined ? '' : m[1];
    if (raw === '/') continue; // the <Layout /> wrapper route, not a page
    declared.add(raw.replace(/\/:[^/]+$/, '/*'));
  }
  const expected = new Set([...ROUTES.public, ...ROUTES.dynamic, ...ROUTES.internal, ...ROUTES.redirects]);
  const missingFromRoutes = [...declared].filter((r) => !expected.has(r));
  const missingFromApp = [...expected].filter((r) => !declared.has(r));
  if (missingFromRoutes.length || missingFromApp.length) {
    console.error('\nROUTE MANIFEST MISMATCH (src/routes.json vs App.tsx)');
    if (missingFromRoutes.length) console.error('  declared in App.tsx but not in routes.json:', missingFromRoutes);
    if (missingFromApp.length) console.error('  in routes.json but not declared in App.tsx:', missingFromApp);
    process.exit(1);
  }
  const prerendered = new Set(['', 'blog', ...PAGES.map((p) => p.path)]);
  const noEntry = ROUTES.public.filter((r) => !prerendered.has(r));
  if (noEntry.length) {
    console.error('\nPUBLIC ROUTES WITHOUT A PRERENDER ENTRY:', noEntry, '\nAdd them to PAGES in scripts/prerender-blog.mjs.');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Shell: nav + footer + inline CSS, shared by every prerendered page and by
// the backend's server-rendered match pages (written to dist/_shell.html).
// Plain CSS on .pr-* classes, so Tailwind's content scan can't purge it.
// Real visitors see this markup until the app mounts and replaces #root.
// ---------------------------------------------------------------------------
const NAV_LINKS = [
  ['/', 'Overview'],
  ['/steam-results', 'Steam Results'],
  ['/closing-lines', 'Closing Lines'],
  ['/drifters', 'Drifters'],
  ['/team-pnl', 'Team P/L'],
  ['/longshot-bias', 'Longshot Bias'],
  ['/tools/match-predictor', 'Tools'],
  ['/blog', 'Blog'],
  ['/about', 'About'],
];
const TOOL_LINKS = [
  ['/tools/bet-calculator', 'Bet Calculator'],
  ['/tools/hedge-calculator', 'Hedging Calculator'],
  ['/tools/match-predictor', 'Match Model'],
  ['/tools/rolling-xg', 'Rolling xG'],
  ['/tools/form-lab', 'Form Lab'],
  ['/tools/club-ratings', 'Club Ratings'],
  ['/tools/manager-ratings', 'Manager Ratings'],
  ['/in-play-jumps', 'In-Play Jumps'],
];

const SHELL_CSS = `
#root .pr{min-height:100vh;color:#e2e8f0;font-family:'Inter Tight','Inter',system-ui,-apple-system,sans-serif;background:linear-gradient(180deg,#0f172a 0%,#0c1220 100%)}
#root .pr-mono{font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace}
#root .pr-header{position:sticky;top:0;background:rgba(15,23,42,.92);border-bottom:1px solid rgba(51,65,85,.5);backdrop-filter:blur(8px)}
#root .pr-wrap{max-width:80rem;margin:0 auto;padding:0 1rem}
#root .pr-bar{display:flex;align-items:center;gap:1rem;height:52px}
#root .pr-brand{display:flex;align-items:center;gap:.625rem;color:#e8edf0;font-weight:700;font-size:18px;letter-spacing:-.02em;text-decoration:none;flex-shrink:0}
#root .pr-brand img{width:28px;height:28px;border-radius:7px;display:block}
#root .pr-brand span{color:#8a94a0;font-weight:500}
#root .pr-nav{display:flex;flex-wrap:wrap;gap:.125rem;align-items:center}
#root .pr-nav a{padding:.375rem .625rem;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;text-decoration:none;white-space:nowrap}
#root .pr-nav a:hover{color:#fff}
#root .pr-main{max-width:80rem;margin:0 auto;padding:1.5rem 1rem 3rem;line-height:1.6}
#root .pr-main h1{font-size:1.75rem;font-weight:700;color:#fff;letter-spacing:-.02em;margin:0 0 .75rem}
#root .pr-main h2{font-size:1.125rem;font-weight:700;color:#fff;margin:1.75rem 0 .5rem}
#root .pr-main h3{font-size:1rem;font-weight:600;color:#e2e8f0;margin:1.25rem 0 .5rem}
#root .pr-main p,#root .pr-main li{color:#cbd5e1;font-size:.9375rem;max-width:72ch}
#root .pr-main ul{padding-left:1.25rem}
#root .pr-main a{color:#22d3ee;text-decoration:none}
#root .pr-main a:hover{text-decoration:underline}
#root .pr-main table{border-collapse:collapse;width:100%;max-width:56rem;margin:1rem 0;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:.8125rem}
#root .pr-main th{text-align:left;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#64748b;padding:.5rem .75rem;border-bottom:1px solid rgba(51,65,85,.6)}
#root .pr-main td{padding:.5rem .75rem;border-bottom:1px solid rgba(51,65,85,.35);color:#e2e8f0;font-variant-numeric:tabular-nums}
#root .pr-main td.pr-num{text-align:right}
#root .pr-main .pr-up{color:#34d399}
#root .pr-main .pr-down{color:#f87171}
#root .pr-lead{font-size:1.0625rem;color:#e2e8f0;border-left:3px solid #22d3ee;padding-left:1rem;margin:1rem 0 1.5rem}
#root .pr-meta{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#64748b;margin-bottom:.5rem}
#root .pr-footer{border-top:1px solid rgba(51,65,85,.5);background:rgba(30,41,59,.5);padding:2rem 1rem;margin-top:2rem}
#root .pr-footer .pr-cols{max-width:80rem;margin:0 auto;display:grid;gap:1.5rem;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))}
#root .pr-footer h4{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#64748b;margin:0 0 .5rem}
#root .pr-footer a{display:block;color:#94a3b8;text-decoration:none;font-size:.875rem;padding:.125rem 0}
#root .pr-footer a:hover{color:#fff}
#root .pr-footer .pr-note{max-width:80rem;margin:1.5rem auto 0;text-align:center;color:#64748b;font-size:.8125rem}
`.trim();

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const NAV_HTML = `<header class="pr-header"><div class="pr-wrap pr-bar">
<a class="pr-brand" href="/"><img src="/logos/mark-on-dark.svg" width="28" height="28" alt="">SteamWatch<span>.io</span></a>
<nav class="pr-nav" aria-label="Main">${NAV_LINKS.map(([h, t]) => `<a href="${h}">${t}</a>`).join('')}</nav>
</div></header>`;

const FOOTER_HTML = `<footer class="pr-footer"><div class="pr-cols">
<div><h4>Data</h4>${[['/', 'Live odds & biggest movers'], ['/steam-results', 'Steam Results'], ['/drifters', 'Drifters'], ['/closing-lines', 'Closing Lines'], ['/cl-closing-lines', 'Champions League Closing Lines'], ['/team-pnl', 'Team P/L'], ['/longshot-bias', 'Longshot Bias']].map(([h, t]) => `<a href="${h}">${t}</a>`).join('')}</div>
<div><h4>Tools</h4>${TOOL_LINKS.map(([h, t]) => `<a href="${h}">${t}</a>`).join('')}</div>
<div><h4>Blog</h4>${POSTS.map((p) => `<a href="/blog/${p.slug}">${esc(p.title)}</a>`).join('')}<a href="/blog">All posts</a></div>
<div><h4>SteamWatch</h4><a href="/about">About Neil Mac</a><a href="https://t.me/steamwatchalerts">Free Telegram alerts</a><a href="https://x.com/Steamwatchio">@Steamwatchio on X</a></div>
</div><p class="pr-note">Pinnacle odds via The Odds API · updated every 15 minutes</p></footer>`;

// The Vite template, read once BEFORE the homepage overwrites dist/index.html.
const template = readFileSync(resolve(DIST, 'index.html'), 'utf-8');
if (!template.includes('<!-- prerender:head -->') || !template.includes('<!-- prerender:root -->')) {
  console.error('dist/index.html is missing the prerender markers (index.html was changed?)');
  process.exit(1);
}
// Hashed asset tags change every build: keep them from the built template,
// never hardcode. Used verbatim by the backend shell too.
const ASSET_TAGS = [...template.matchAll(/<(?:script type="module"[^>]*><\/script>|link rel="(?:stylesheet|modulepreload)"[^>]*>)/g)].map((m) => m[0]);
if (!ASSET_TAGS.some((t) => t.startsWith('<script'))) {
  console.error('No module script tag found in dist/index.html');
  process.exit(1);
}

/** Per-route head tags. Every tag the app re-declares through Helmet
 *  (title, description, canonical, robots, OG, Twitter) is marked
 *  data-prerender="1"; src/main.tsx removes those right before React
 *  mounts, and Helmet (React 19 native head hoisting in react-helmet-async
 *  v3, which does NOT dedupe against pre-existing tags) adds the page's
 *  own. Net effect: one of each before JS and after JS. JSON-LD is static
 *  and unmarked: the pages no longer emit schema through Helmet. */
function headTags({ title, description, url, ogType = 'website', jsonLd, robots }) {
  const blocks = Array.isArray(jsonLd) ? jsonLd : jsonLd ? [jsonLd] : [];
  return [
    `<title data-prerender="1">${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" data-prerender="1" />`,
    url ? `<link rel="canonical" href="${url}" data-prerender="1" />` : '',
    robots ? `<meta name="robots" content="${robots}" data-prerender="1" />` : '',
    `<meta property="og:type" content="${ogType}" data-prerender="1" />`,
    `<meta property="og:title" content="${esc(title)}" data-prerender="1" />`,
    `<meta property="og:description" content="${esc(description)}" data-prerender="1" />`,
    url ? `<meta property="og:url" content="${url}" data-prerender="1" />` : '',
    `<meta name="twitter:title" content="${esc(title)}" data-prerender="1" />`,
    `<meta name="twitter:description" content="${esc(description)}" data-prerender="1" />`,
    ...blocks.map((b) => `<script type="application/ld+json">${JSON.stringify(b)}</script>`),
  ].filter(Boolean).join('\n    ');
}

/** Full document: template + per-route head + styled static body. `app`
 *  false drops the bundle for pages with no React route (static_only). */
function renderPage({ head, contentHtml, app = true }) {
  let html = template.replace(/<title>[^<]*<\/title>\n?/, '');
  html = html.replace('<!-- prerender:head -->', `${head}\n    <style id="prerender-css">${SHELL_CSS}</style>`);
  html = html.replace('<!-- prerender:root -->', `<div class="pr">${NAV_HTML}<main class="pr-main">${contentHtml}</main>${FOOTER_HTML}</div>`);
  if (!app) for (const t of ASSET_TAGS) html = html.replace(t, '');
  return html;
}

function writePage(routePath, html) {
  const outDir = routePath ? resolve(DIST, ...routePath.split('/')) : DIST;
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'index.html'), html, 'utf-8');
  console.log(`  ✓ /${routePath}`);
}

// ---------------------------------------------------------------------------
// Blog posts
// ---------------------------------------------------------------------------
for (const post of POSTS) {
  const url = `${DOMAIN}/blog/${post.slug}`;
  const jsonLd = [JSON.parse(articleSchema(post))];
  if (post.faq && post.faq.length) jsonLd.push({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: post.faq.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })),
  });
  writePage(`blog/${post.slug}`, renderPage({
    head: headTags({ title: `${post.title} — SteamWatch`, description: post.description, url, ogType: 'article', jsonLd }),
    contentHtml: post.noscriptHtml,
  }));
}
console.log(`Pre-rendered ${POSTS.length} blog page(s).`);

// ---------------------------------------------------------------------------
// Blog index — a real list of the posts, newest first
// ---------------------------------------------------------------------------
{
  const sorted = [...POSTS].sort((a, b) => b.datePublished.localeCompare(a.datePublished));
  const items = sorted.map((p) => `<li><a href="/blog/${p.slug}">${esc(p.title)}</a><br><span class="pr-meta">${p.datePublished}</span> ${esc(p.description)}</li>`).join('\n');
  writePage('blog', renderPage({
    head: headTags({
      title: 'Blog — SteamWatch',
      description: 'Articles on steam moves, closing line value, drifters and the favourite-longshot bias in football betting, written from SteamWatch\'s own Pinnacle price data.',
      url: `${DOMAIN}/blog`,
      jsonLd: {
        '@context': 'https://schema.org', '@type': 'Blog', name: 'SteamWatch Blog', url: `${DOMAIN}/blog`,
        blogPost: sorted.map((p) => ({ '@type': 'BlogPosting', headline: p.title, url: `${DOMAIN}/blog/${p.slug}`, datePublished: p.datePublished, author: { '@type': 'Person', name: p.author } })),
      },
    }),
    contentHtml: `<h1>Blog</h1><p>Explainers written from SteamWatch's own Pinnacle price data.</p><ul>${items}</ul>`,
  }));
}

// ---------------------------------------------------------------------------
// Static pages
// ---------------------------------------------------------------------------
for (const page of PAGES) {
  writePage(page.path, renderPage({
    head: headTags({ title: page.title, description: page.description, url: `${DOMAIN}/${page.path}`, ogType: page.ogType, jsonLd: page.jsonLd }),
    contentHtml: page.noscriptHtml,
  }));
}
console.log(`Pre-rendered ${PAGES.length + 1} static page(s).`);

// ---------------------------------------------------------------------------
// Manager Ratings — static-only page (no React route) built from the data
// file the tool ships with. Only the preview rows are public.
// ---------------------------------------------------------------------------
{
  const dataPath = resolve(__dirname, '..', 'public', 'tools', 'manager-ratings', 'manager-elo-data.json');
  const d = JSON.parse(readFileSync(dataPath, 'utf-8'));
  const rows = (d.rows || []).filter((r) => r.eligible).sort((a, b) => a.rank - b.rank);
  const tr = rows.map((r) => `<tr><td class="pr-num">${r.rank}</td><td>${esc(r.name)}</td><td>${esc(r.club)}</td><td>${esc(r.league)}</td><td class="pr-num">${Number(r.impact).toFixed(2)}</td><td class="pr-num">${Number(r.per38).toFixed(1)}</td><td class="pr-num">${r.matches}</td></tr>`).join('');
  writePage('tools/manager-ratings', renderPage({
    app: false,
    head: headTags({
      title: 'Manager Ratings: Points Above Expectation for Europe\'s Top Managers — SteamWatch',
      description: `Manager ratings for Europe's top five leagues built from closing-price expectations: how many points each manager's teams earned above what the market priced them for, since 2018/19. Updated ${String(d.as_of).slice(0, 10)}.`,
      url: `${DOMAIN}/tools/manager-ratings`,
      jsonLd: {
        '@context': 'https://schema.org', '@type': 'Dataset', name: 'SteamWatch Manager Ratings', url: `${DOMAIN}/tools/manager-ratings`,
        description: 'Points earned above market expectation per manager across the top five European leagues, computed from Pinnacle closing prices since 2018/19.',
        temporalCoverage: '2018-08/..', creator: { '@type': 'Organization', name: 'SteamWatch', url: DOMAIN },
      },
    }),
    contentHtml: `<h1>Manager Ratings</h1>
<p class="pr-lead">Which managers have earned the most points above what the market expected of their teams? Every finished top-five-league match since 2018/19 is priced from the Pinnacle closing line into expected points; the manager in charge gets the difference between actual and expected. Rankings cover ${d.eligible_managers} eligible managers (${d.managers} tracked) and were last computed on ${String(d.as_of).slice(0, 10)}.</p>
<h2>Top of the table</h2>
<table><thead><tr><th>Rank</th><th>Manager</th><th>Club</th><th>League</th><th>Impact (pts)</th><th>Per 38</th><th>Matches</th></tr></thead><tbody>${tr}</tbody></table>
<p>The full ranking of all ${d.eligible_managers} eligible managers, recent-form splits and per-spell breakdowns are available with SteamWatch Pro. See also <a href="/tools/club-ratings">Club Ratings</a> and <a href="/team-pnl">Team P/L</a>.</p>`,
  }));
}

// ---------------------------------------------------------------------------
// Homepage — the last write, because it overwrites the template file
// ---------------------------------------------------------------------------
writePage('', renderPage({
  head: headTags({
    title: 'SteamWatch - Track the Biggest Odds Moves in Football Betting',
    description: 'Track the biggest odds moves and see what happened next. Real-time steam alerts, historical ROI, closing-line data and betting-market analysis for serious bettors.',
    url: `${DOMAIN}/`,
    jsonLd: [
      {
        '@context': 'https://schema.org', '@type': 'WebApplication', name: 'SteamWatch', url: DOMAIN,
        description: 'Track the biggest odds moves across major football betting markets and see what happened next',
        applicationCategory: 'SportsApplication', operatingSystem: 'Web',
        sameAs: ['https://x.com/Steamwatchio', 'https://t.me/steamwatchalerts'],
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
        author: { '@type': 'Person', name: 'Neil Macdonald', url: `${DOMAIN}/about` },
      },
      {
        '@context': 'https://schema.org', '@type': 'FAQPage',
        mainEntity: [
          { '@type': 'Question', name: 'What is SteamWatch?', acceptedAnswer: { '@type': 'Answer', text: 'SteamWatch tracks the biggest odds moves in football betting markets and shows what happened next. It records Pinnacle odds roughly every 15 minutes across Europe\'s major leagues, highlights significant pre-kickoff price moves, and keeps a historical record of how those moves performed.' } },
          { '@type': 'Question', name: 'What is a steam move in football betting?', acceptedAnswer: { '@type': 'Answer', text: 'A steam move is a sudden, significant shift in a betting line. On SteamWatch it means an implied-probability move of 3 or more percentage points on an outcome before kickoff. SteamWatch reports the move and its outcome; it does not claim to know why the market moved.' } },
          { '@type': 'Question', name: 'Is SteamWatch free?', acceptedAnswer: { '@type': 'Answer', text: 'The core is free: real-time steam alerts via Telegram, live odds and biggest movers, the closing line archive, team profit/loss records, and bet and hedge calculators. SteamWatch Pro adds the Dixon-Coles match predictor, rolling xG tables, the historical steam results directory, drifters, and the full Longshot Bias explorer.' } },
          { '@type': 'Question', name: 'Which leagues does SteamWatch track?', acceptedAnswer: { '@type': 'Answer', text: 'Premier League, EFL Championship, La Liga, Bundesliga, Serie A, Ligue 1, and the UEFA Champions League, Europa League, Conference League and Nations League, using Pinnacle odds updated roughly every 15 minutes.' } },
        ],
      },
    ],
  }),
  contentHtml: `<h1>Track the biggest odds moves. See what happened next.</h1>
<p class="pr-lead">SteamWatch records Pinnacle football odds roughly every 15 minutes across Europe's major leagues, flags the significant pre-kickoff moves, and keeps a public record of how those moves performed.</p>
<h2>What is on the site</h2>
<ul>
  <li><a href="/">Biggest movers</a>: the largest 1X2, Asian handicap and totals moves over the last 48 hours, with every tracked match's price history one click away.</li>
  <li><a href="/steam-results">Steam Results</a>: every detected steam move tracked through to a result, with win rates and profit/loss.</li>
  <li><a href="/drifters">Drifters</a>: the moves going the other way, with the same accounting.</li>
  <li><a href="/closing-lines">Closing Lines</a>: the Pinnacle close on 1X2, Asian handicap and totals for every finished match, by matchweek.</li>
  <li><a href="/team-pnl">Team P/L</a> and <a href="/longshot-bias">Longshot Bias</a>: what blindly backing or fading teams, favourites, underdogs and draws at closing prices would have returned since 2021/22.</li>
</ul>
<h2>Leagues covered</h2>
<p>Premier League, EFL Championship, La Liga, Bundesliga, Serie A, Ligue 1, Champions League, Europa League, Conference League and the UEFA Nations League.</p>
<h2>Free alerts</h2>
<p>Steam alerts go out in real time on <a href="https://t.me/steamwatchalerts">Telegram</a>. <a href="/blog/what-are-steam-moves-in-football-betting">What is a steam move?</a></p>`,
}));

// ---------------------------------------------------------------------------
// 404 page (noindex), bare app shell for internal/redirect routes (noindex),
// the backend shell for server-rendered match pages, and the route manifest.
// ---------------------------------------------------------------------------
writeFileSync(resolve(DIST, '404.html'), renderPage({
  head: headTags({ title: 'Page not found — SteamWatch', description: 'That page does not exist on SteamWatch.', robots: 'noindex, nofollow' }),
  contentHtml: `<h1>Page not found</h1><p>There is nothing at this address. Try the <a href="/">live odds overview</a>, <a href="/steam-results">Steam Results</a> or the <a href="/blog">blog</a>.</p>`,
}), 'utf-8');
writeFileSync(resolve(DIST, 'app.html'), renderPage({
  head: headTags({ title: 'SteamWatch', description: 'SteamWatch', robots: 'noindex' }),
  contentHtml: '',
}), 'utf-8');
writeFileSync(resolve(DIST, '_shell.html'), renderPage({ head: '<!--PRERENDER:HEAD-->', contentHtml: '<!--PRERENDER:CONTENT-->' }), 'utf-8');
writeFileSync(resolve(DIST, 'routes.json'), JSON.stringify(ROUTES, null, 2), 'utf-8');
writeFileSync(resolve(DIST, 'build-info.json'), JSON.stringify({ built_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') }), 'utf-8');
console.log('Wrote 404.html, app.html, _shell.html, routes.json, build-info.json');
