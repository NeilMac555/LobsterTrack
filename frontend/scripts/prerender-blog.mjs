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
    title: 'Favourite-Longshot Bias in Football: The Data',
    description:
      'Backing every favourite, underdog and draw at Pinnacle closing prices over 8,867 top-five-league matches since 2021/22. Favourites level, dogs -10.5%.',
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
    noscriptHtml: `<h1>Favourite-Longshot Bias in Football: The Data</h1>
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
    title: 'Do Steam Moves Win? Football Steam Move Results & ROI | SteamWatch',
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
    noscriptHtml: `<h1>Steam Results | SteamWatch</h1>
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
    title: 'Football Hedge Calculator | SteamWatch',
    description:
      'Work out the stake on the opposite side that locks in the same profit whichever way an open football bet settles, at decimal odds.',
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
    noscriptHtml: `<h1>Hedge Calculator</h1>
<p class="pr-lead">The Hedge Calculator works out how much to stake on the opposing outcome so that an open bet returns the same profit whichever way it settles. Enter the original stake and decimal price, then the current decimal price on the other side, and it returns the hedge stake, the total outlay and the guaranteed profit. You can also enter your own hedge amount to see the profit or loss on each outcome.</p>
<h2>How the numbers are calculated</h2>
<p>The equal-profit hedge stake is the original stake multiplied by the original price, divided by the current price of the opposing outcome. That makes the payout identical on both results. The guaranteed profit is that payout minus both stakes, and it is negative when the price has not moved far enough, which tells you the hedge would only reduce a loss rather than lock in a gain. Prices are decimal only. A three-way market cannot be fully covered with one bet, so the calculator treats the hedge as the direct opposite of the original selection.</p>
<h2>When a hedge exists</h2>
<p>A profitable hedge only exists once the price you took has shortened, which is the movement SteamWatch records on every match page. Hedging trades expected value for certainty: the second bet carries the bookmaker's margin, so a hedge placed at a fair price costs little, and one placed at a wide price costs more.</p>
<h2>Related</h2>
<p>The <a href="/tools/bet-calculator">Bet Calculator</a> handles returns on singles and accumulators, and the <a href="/">live movers</a> show where prices are moving right now.</p>`,
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
    title: 'Pinnacle Closing Lines Archive | SteamWatch',
    description:
      'Pinnacle closing 1X2, Asian handicap and totals prices for every finished match, by league and matchweek, with the opening price beside each close.',
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
    noscriptHtml: `<h1>Closing Lines</h1>
<p class="pr-lead">An archive of Pinnacle closing prices. For every finished match SteamWatch tracks it lists the last price recorded before kickoff on the 1X2 market, the Asian handicap (line and both prices) and the totals market (line, over and under), grouped by league and matchweek. The opening price sits beside each close, so the movement is visible in one row.</p>
<h2>Where the data comes from</h2>
<p>Prices are Pinnacle's, taken from The Odds API. SteamWatch requests each tracked competition every 15 minutes from the moment a match is listed, every 10 minutes inside two hours of kickoff and every two minutes in the last half hour, and stores every snapshot. The closing line is the final snapshot captured before the recorded kickoff time. The capture time and the number of minutes before kickoff are stored with it. Nothing is back-filled from other bookmakers.</p>
<h2>How to read the numbers</h2>
<p>All prices are decimal. The implied probability of a price is 100 divided by the price. The three 1X2 implied probabilities sum to a little over 100%, and the excess is Pinnacle's margin, typically two to three points on these leagues. Open-to-close movement is best read in implied-probability points rather than raw odds: 1.50 to 1.40 is a much bigger move than 5.00 to 4.00. The <a href="/blog/how-to-read-closing-lines-in-football-betting">guide to reading closing lines</a> covers this in more detail, and <a href="/blog/what-is-closing-line-value-in-football-betting">closing line value</a> explains why the close is the benchmark most bettors measure against.</p>
<h2>Current coverage</h2>
<p>{{HEADLINE}} Leagues covered: Premier League, EFL Championship, La Liga, Bundesliga, Serie A, Ligue 1, Champions League, Europa League, Conference League and the UEFA Nations League. The Champions League has its own view at <a href="/cl-closing-lines">Champions League Closing Lines</a>.</p>`,
  },
  {
    path: 'cl-closing-lines',
    title: 'Champions League Closing Lines | SteamWatch',
    description:
      'Pinnacle closing 1X2, Asian handicap and totals prices for every Champions League match tracked, with the opening price beside each close.',
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
    noscriptHtml: `<h1>Champions League Closing Lines</h1>
<p class="pr-lead">The Champions League slice of the closing-line archive. For each match in the competition SteamWatch has tracked, it lists the last Pinnacle price recorded before kickoff on the 1X2 market, the Asian handicap and the totals market, with the opening price alongside.</p>
<h2>Where the data comes from</h2>
<p>Prices are Pinnacle's, via The Odds API, requested every 15 minutes from the moment a fixture is listed, every 10 minutes inside two hours of kickoff and every two minutes in the last half hour. Every snapshot is stored, and the close is the final one before the recorded kickoff time. European fixtures are listed later than domestic ones, so the opening price here is usually a few days before the match rather than a week or more, and open-to-close movement is correspondingly smaller. Capture began in February 2026, so the archive starts at the 2025/26 knockout rounds, and the 2026/27 league phase is added matchday by matchday.</p>
<h2>How to read the numbers</h2>
<p>Prices are decimal. Implied probability is 100 divided by the price, and the Champions League 1X2 market carries a Pinnacle margin of around two to three points. The Asian handicap line is shown from the home side's perspective with both prices. The totals line is the main line at close with its over and under prices. Movement is best compared in implied-probability points: a shortening of 0.10 on a 1.50 favourite is a bigger move than the same 0.10 on a 4.00 outsider.</p>
<h2>Current coverage</h2>
<p>{{HEADLINE}} The archive for the domestic leagues is at <a href="/closing-lines">Closing Lines</a>. How the market has treated European favourites and underdogs will join <a href="/longshot-bias">Longshot Bias</a> once the sample justifies it.</p>`,
  },
  {
    path: 'tools/match-predictor',
    title: 'Match Predictor: Dixon-Coles Model | SteamWatch',
    description:
      'Dixon-Coles match model: enter xG form for two teams and get 1X2, correct score and totals probabilities with fair odds, top five leagues.',
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
    noscriptHtml: `<h1>Match Predictor</h1>
<p class="pr-lead">The Match Predictor turns two teams' expected-goals form into match probabilities using a Dixon-Coles model, a Poisson goals model corrected for its under-prediction of low-scoring draws. It returns probabilities and fair decimal odds for the 1X2 market, the most likely correct scores and the over and under lines.</p>
<h2>What goes in</h2>
<p>For each team you enter season figures: xG for and against per match, goals conceded and matches played, and optionally xG over the last six matches, penalties received and conceded, open-play and set-piece xG, and shots for and against.</p>
<h2>How the numbers are calculated</h2>
<p>Penalty xG is stripped out at 0.76 per penalty and set-piece xG is discounted. Season and last-six figures are blended into an attack and a defence strength for each team. Expected goals for each side are attack strength times the opponent's defence strength times the league's average goals per team, adjusted by the league's home advantage ratio. Those two figures feed a Dixon-Coles adjusted Poisson grid of every scoreline, with the draw inflated slightly and the grid renormalised. The 1X2, correct-score and totals probabilities are sums over that grid, and fair odds are 1 divided by the probability, with no margin.</p>
<h2>Where the league constants come from</h2>
<p>Average goals per team and the home advantage ratio are recomputed every Monday from finished matches in the current season and the last three completed seasons, weighted towards the most recent. {{HEADLINE}}</p>
<p>Treat its fair odds as a baseline to set against the Pinnacle price.</p>`,
  },
  {
    path: 'tools/club-ratings',
    title: 'European Club Ratings | SteamWatch',
    description:
      'Weekly strength ratings on one European scale for the top five leagues and UEFA competitions, with rank and score changes each week.',
    ogType: 'website',
    jsonLd: {
      '@context': 'https://schema.org', '@type': 'WebApplication',
      name: 'SteamWatch Club Ratings', url: `${DOMAIN}/tools/club-ratings`,
      applicationCategory: 'SportsApplication', operatingSystem: 'Web',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    },
    noscriptHtml: `<h1>Club Ratings</h1>
<p class="pr-lead">A single strength score for every club in the top five European leagues and the UEFA club competitions, placed on one common scale and grouped into six tiers, from Elite (1850 and above) to Lower rated (below 1350). Each club shows its rank, its score, and the change in both since the previous week. The common scale is what lets an English club be compared directly with a Spanish one.</p>
<h2>How the numbers are calculated</h2>
<p>The score combines published club strength ratings with match-level non-penalty expected goals from Understat, weighted so that recent matches count for more than older ones, and balanced so that a single result does not dominate. The individual sources and weights are not published. Small gaps between clubs should be read as close calls. Odds play no part in the score.</p>
<h2>When it updates</h2>
<p>A new table is published once a week, after Monday 12:00 UTC. If the update is late, the page says so and keeps showing the last published table.</p>
<h2>Community moves</h2>
<p>Readers can vote a club higher or lower. Once at least five voters reach 80% agreement, the club moves one place in the displayed order, never more, and the move is marked against the club. Votes expire after 30 days, and a move reverses if its support falls away. Scores and tiers stay as the model set them, so a community move can place a slightly lower score above a higher one.</p>
<h2>Current table</h2>
<p>{{HEADLINE}} The closing prices the market set for each club's matches are in <a href="/closing-lines">Closing Lines</a>, and the market's long-run verdict on each club is in <a href="/team-pnl">Team P/L</a>.</p>`,
  },
  {
    path: 'tools/rolling-xg',
    title: 'Rolling xG Tables by Team | SteamWatch',
    description:
      'Rolling 5 and 10 match non-penalty xG for and against for every top-five-league club, with last season joined on so windows start full.',
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
    noscriptHtml: `<h1>Rolling xG</h1>
<p class="pr-lead">This page charts each club's non-penalty expected goals for and against as a rolling average over its last five or ten league matches, so a change in underlying performance is visible before it shows up in results. A trend line is fitted to each series, and the latest rolling figures are shown as a summary.</p>
<h2>Where the data comes from</h2>
<p>Match-level non-penalty xG is imported from Understat for the Premier League, La Liga, Bundesliga, Serie A and Ligue 1. The import runs every Monday at 03:00 UTC, once the weekend's matches are settled. Each row is one team in one match, with the non-penalty xG it created and the non-penalty xG it conceded. Penalties are excluded because they carry a fixed xG value that says nothing about open-play performance.</p>
<h2>How the numbers are calculated</h2>
<p>The rolling figure at any match is the plain average of the previous five or ten matches' non-penalty xG for, and separately against. To keep the window full at the start of a season, the full previous season is joined on to the front of each club's series and marked on the chart, so a five-game window on matchday two includes the last three games of the season before. Promoted clubs have no top-flight history and start from their first match. The trend line is a least-squares fit over the plotted window.</p>
<h2>Current coverage</h2>
<p>{{HEADLINE}} Rolling xG is a form view and feeds no odds calculation on this site. The closing prices the market set for the same matches are in the <a href="/closing-lines">closing-line archive</a>.</p>`,
  },
  {
    path: 'drifters',
    title: 'Football Drifters: Odds That Lengthened Before Kickoff & What Happened | SteamWatch',
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
    noscriptHtml: `<h1>Drifters | SteamWatch</h1>
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
    title: 'Team P/L: Blind Back and Fade Returns | SteamWatch',
    description:
      'What backing or fading every club in every match at Pinnacle closing prices returned, by season and venue, since 2021/22.',
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
    noscriptHtml: `<h1>Team P/L</h1>
<p class="pr-lead">For every club in the tracked leagues, this page shows what a flat stake on that team in every one of its matches would have returned at Pinnacle closing prices, and what the opposite bet, fading the team, would have returned. Each is split by season and by venue, so home and away records are visible separately.</p>
<h2>How the numbers are calculated</h2>
<p>Backing a team means a flat stake, 50 units by default and adjustable on the page, on it to win at the Pinnacle closing 1X2 price. A win returns the stake times the price; a draw or defeat loses the stake. Fading a team means the same stake on the Double Chance against it, priced by combining the other two Pinnacle closing prices (1 divided by the sum of their implied probabilities). Profit and loss is the sum across matches, and ROI is that sum divided by the total staked.</p>
<h2>Where the data comes from</h2>
<p>Results and closing prices for 2021/22 to January 2026 are the Pinnacle closing columns from football-data.co.uk. From February 2026 the closing price is SteamWatch's own capture from The Odds API: the last Pinnacle snapshot before kickoff. For the roughly 200 matches between the two sources, where neither has a Pinnacle price, the Betfair Exchange closing price stands in. Results are re-imported every Monday and prices filled the same morning.</p>
<h2>A current figure</h2>
<p>{{HEADLINE}} The same closing prices drive <a href="/longshot-bias">Longshot Bias</a>, which asks the same question of favourites and underdogs as groups rather than of individual clubs.</p>`,
  },
  {
    path: 'longshot-bias',
    title: 'Longshot Bias: Favourite vs Underdog ROI | SteamWatch',
    description:
      'What backing every favourite, underdog or draw at Pinnacle closing prices returned since 2021/22, by odds band, league, season and club.',
    ogType: 'website',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'Dataset',
        name: 'SteamWatch Longshot Bias: blind favourite, underdog and draw returns at Pinnacle closing prices',
        description:
          'Flat-stake yield from backing every favourite, underdog and draw at Pinnacle closing 1X2 prices across the Premier League, La Liga, Bundesliga, Serie A and Ligue 1, in data-driven odds bands, filterable by league, season, venue and club. From 2021/22, updated weekly.',
        url: `${DOMAIN}/longshot-bias`,
        temporalCoverage: '2021-08/..',
        spatialCoverage: 'England, Spain, Germany, Italy, France',
        creator: { '@type': 'Person', name: 'Neil Mac', url: `${DOMAIN}/about` },
        keywords: ['favourite-longshot bias', 'football betting', 'underdog ROI', 'Pinnacle closing odds', 'blind backing favourites'],
        variableMeasured: ['flat-stake yield by odds band', 'median closing odds', 'cumulative profit in units', 'per-club ROI as favourite and as underdog'],
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
    noscriptHtml: `<h1>Longshot Bias | SteamWatch</h1>
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
    title: 'In-Play Jumps: Pinnacle Close vs Polymarket First 5 Minutes | SteamWatch',
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
    title: 'Bet Calculator: Singles, Doubles, Trebles and Accumulators | SteamWatch',
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
    title: 'Form Lab: Football Form, Handicap Cover Rates and Home/Away Splits | SteamWatch',
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
// Build-time headline figures for the static copy. Pulled from the live API
// so each page carries one current number; each has a plain fallback so an
// API blip can't fail the build or leave a template token on the page.
// ---------------------------------------------------------------------------
async function fetchJson(path) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const r = await fetch(`${DOMAIN}${path}`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}
const today = new Date().toISOString().slice(0, 10);
const fmtN = (n) => Number(n).toLocaleString('en-GB');
const HEADLINE = {};
{
  const cl = await fetchJson('/api/closing-lines?limit=1');
  HEADLINE['closing-lines'] = cl?.total
    ? `As of ${today}, ${fmtN(cl.total)} closing lines are on record across the tracked competitions.`
    : 'The archive grows with every finished match.';
  const ucl = await fetchJson('/api/closing-lines?league=soccer_uefa_champs_league&limit=1');
  HEADLINE['cl-closing-lines'] = ucl?.total
    ? `As of ${today}, ${fmtN(ucl.total)} Champions League closing lines are on record.`
    : 'The archive grows with every finished Champions League match.';
  const pnl = await fetchJson('/api/team-pnl?league=soccer_epl');
  const allRows = (pnl?.rows || []).filter((r) => r.season === 'all' && r.back?.overall?.matches >= 100);
  const best = allRows.sort((a, b) => b.back.overall.roi - a.back.overall.roi)[0];
  HEADLINE['team-pnl'] = best
    ? `Across ${fmtN(best.back.overall.matches)} Premier League matches since 2021/22, backing ${best.team} in every one at the closing price returned ${best.back.overall.roi > 0 ? '+' : ''}${best.back.overall.roi.toFixed(1)}% on turnover, the best blind-back record in the league as of ${today}.`
    : 'Every club in the Premier League has a full record since 2021/22.';
  const lc = await fetchJson('/api/league-constants');
  const epl = (lc?.constants || []).find((c) => c.league === 'soccer_epl');
  HEADLINE['tools/match-predictor'] = epl
    ? `For the Premier League the current constants are ${epl.avg_goals_per_team.toFixed(2)} goals per team per match and a home advantage ratio of ${epl.home_away_ratio.toFixed(2)}, from ${fmtN(Math.round(epl.sample_matches))} matches (computed ${String(epl.computed_at).slice(0, 10)}).`
    : 'Each league has its own scoring rate and home advantage.';
  const teams = await fetchJson('/api/xg-data/teams?league=soccer_epl');
  const first = teams?.teams?.[0];
  const xg = first ? await fetchJson(`/api/xg-data?league=soccer_epl&team=${encodeURIComponent(first)}`) : null;
  const lastPt = xg?.data?.length ? xg.data[xg.data.length - 1] : null;
  HEADLINE['tools/rolling-xg'] = teams?.teams?.length
    ? `${teams.teams.length} Premier League clubs have data this season${lastPt ? `, with matches through ${String(lastPt.match_date).slice(0, 10)} on record` : ''} as of ${today}.`
    : 'All five leagues are covered.';
  const m = null; // hedge-calculator: no live example (Neil, 29 Sep 2026)
  HEADLINE['tools/hedge-calculator'] = m
    ? `For example, as of ${today} the largest current move on the site is ${m.outcome_name} in ${m.home_team} v ${m.away_team}, from ${Number(m.opening_odds).toFixed(2)} at open to ${Number(m.current_odds).toFixed(2)} now; a bet taken at the opening price could be hedged at the current one.`
    : 'The live movers show where prices are moving.';
  const cr = await fetchJson('/api/club-ratings');
  const top = cr?.teams?.find((t) => t.rank === 1);
  HEADLINE['tools/club-ratings'] = top
    ? `In the table published ${String(cr.published_at).slice(0, 10)}, ${top.name} rank first with a score of ${Math.round(top.score)}.`
    : 'The table is republished every Monday.';
}

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
    head: headTags({ title: `${post.title} | SteamWatch`, description: post.description, url, ogType: 'article', jsonLd }),
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
      title: 'Blog | SteamWatch',
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
    contentHtml: page.noscriptHtml.replace('{{HEADLINE}}', HEADLINE[page.path] ?? ''),
  }));
}
// Length audit: titles under 60 characters, descriptions under 155 (warn only,
// so older pages don't block a build; tighten to a failure once they're all in).
for (const p of [...PAGES, ...POSTS.map((x) => ({ path: `blog/${x.slug}`, title: `${x.title} | SteamWatch`, description: x.description }))]) {
  if (p.title.length >= 60 || p.description.length >= 155) console.warn(`  ! /${p.path}: title ${p.title.length} chars, description ${p.description.length} chars`);
}
console.log(`Pre-rendered ${PAGES.length + 1} static page(s).`);

// ---------------------------------------------------------------------------
// Manager Ratings — a static-only page (no React route). The interactive Elo
// dashboard lives in public/tools/manager-ratings/index.html (built by
// scripts/publish-manager-ratings.py) and Vite copies it into dist. Here we
// keep that page and inject per-route head tags, WebApplication JSON-LD and a
// prerendered copy block into it. Never replace the file.
// ---------------------------------------------------------------------------
{
  const dir = resolve(DIST, 'tools', 'manager-ratings');
  const page = resolve(dir, 'index.html');
  const d = JSON.parse(readFileSync(resolve(dir, 'manager-elo-data.json'), 'utf-8'));
  let html = readFileSync(page, 'utf-8');
  if (!html.includes('id="manager-paywall"')) throw new Error('manager-ratings: dashboard HTML missing from dist');
  const asOf = String(d.as_of).slice(0, 10);
  const rows = (d.rows || []).filter((r) => r.eligible).sort((a, b) => a.rank - b.rank);
  const monthYear = (iso) => new Date(String(iso).slice(0, 10)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  // Sportmonks marks who holds an active appointment (is_current); a spell's
  // `end` is the date of its last covered match. Anyone without an active
  // appointment is shown with the month of that last match: "(to May 2026)".
  const clubCell = (r) => r.is_current ? esc(r.club) : `${esc(r.club)} (to ${monthYear(r.spells?.[r.spells.length - 1]?.end)})`;
  const tr = rows.map((r) => `<tr><td>${r.rank}</td><td>${esc(r.name)}</td><td>${clubCell(r)}</td><td>${Number(r.impact).toFixed(1)}</td><td>${Number(r.per38).toFixed(1)}</td><td>${r.matches}</td></tr>`).join('');
  const title = 'Manager Ratings: Club Elo Impact by Manager | SteamWatch';
  const description = `Managers in the top five leagues ranked by the Elo their clubs gained or lost while they were in charge, since July 2016. Updated ${asOf}.`;
  const head = headTags({
    title, description, url: `${DOMAIN}/tools/manager-ratings`,
    jsonLd: {
      '@context': 'https://schema.org', '@type': 'WebApplication', name: 'SteamWatch Manager Ratings', url: `${DOMAIN}/tools/manager-ratings`,
      applicationCategory: 'SportsApplication', operatingSystem: 'Web',
      description: 'Ranks managers in the top five European leagues by the club Elo rating points their teams gained or lost under them, from July 2016, with a per-38-match view and a 12-month recent-form view.',
      dateModified: asOf,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      creator: { '@type': 'Person', name: 'Neil Mac', url: `${DOMAIN}/about` },
    },
  });
  // Strip the head tags the publish script wrote, then add ours. Keep the fonts link.
  html = html
    .replace(/<title>Manager Ratings \| SteamWatch<\/title>/, '')
    .replace(/<meta name="description"[^>]*>\n?/, '')
    .replace(/<link rel="canonical"[^>]*>\n?/, '')
    .replace(/<meta property="og:[a-z_:]+"[^>]*>\n?/g, '')
    .replace(/<meta name="twitter:card"[^>]*>\n?/, '');
  if (!html.includes('<meta charset="utf-8">')) throw new Error('manager-ratings: no charset meta to anchor on');
  html = html.replace('<meta charset="utf-8">', `<meta charset="utf-8">
${head}
`);
  const copy = `<section id="about-manager-ratings" class="sw-copy" aria-labelledby="sw-copy-h">
<h2 id="sw-copy-h">About these ratings</h2>
<p>Every club in the covered competitions carries an Elo rating that starts at 1,500 when the club is first observed. After each match the rating rises if the result beat what the two ratings and a 60-point home advantage implied, and falls if it fell short; a draw can move it either way. A manager's impact is the Elo the club gained or lost in the matches played while that manager was in charge. It follows the manager between clubs. The ranking window runs from 1 July 2016, with 2013 to 2016 used to warm the ratings up. Match and appointment data come from the Sportmonks API.</p>
<p>Per 38 rescales total impact to a 38-match season so long and short spells can be compared. Last 12 months shows the same calculation over the past year only. The main ranking requires at least 20 completed matches in the previous 12 months, so a manager out of work for a year drops out of it while keeping their long-term total. ${d.eligible_managers} of ${d.managers} tracked managers currently qualify. Appointment dates come from Sportmonks with a small number of dated, sourced corrections listed on this page.</p>
<p>The table was last computed on ${asOf}. The top three by total impact are free; the full ranking, every comparison and the underlying data require SteamWatch Pro.</p>
<table><caption>Top of the table, ${asOf}</caption><thead><tr><th>Rank</th><th>Manager</th><th>Club / last covered</th><th>Impact (Elo)</th><th>Per 38</th><th>Matches</th></tr></thead><tbody>${tr}</tbody></table>
<p>Related pages: <a href="/tools/club-ratings">Club Ratings</a>, <a href="/team-pnl">Team P/L</a> and <a href="/longshot-bias">Longshot Bias</a>.</p>
</section>
<style>.sw-copy{max-width:860px;margin:32px auto 0;padding:24px 0 8px;border-top:1px solid #334155;color:#cbd5e1;font-size:15px;line-height:1.7}.sw-copy h2{font-size:18px;margin:0 0 12px;color:#f1f5f9}.sw-copy p{margin:0 0 12px}.sw-copy a{color:#22d3ee}.sw-copy table{border-collapse:collapse;margin:8px 0 16px;font-size:14px}.sw-copy caption{text-align:left;color:#94a3b8;font-size:13px;margin-bottom:6px}.sw-copy th,.sw-copy td{padding:4px 12px 4px 0;text-align:left;border-bottom:1px solid #1e293b}</style>
`;
  if (!html.includes('<footer>')) throw new Error('manager-ratings: no <footer>');
  html = html.replace('<footer>', copy + '<footer>');
  writeFileSync(page, html, 'utf-8');
  console.log('  ✓ /tools/manager-ratings (dashboard + injected head/copy)');
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
  head: headTags({ title: 'Page not found | SteamWatch', description: 'That page does not exist on SteamWatch.', robots: 'noindex, nofollow' }),
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
