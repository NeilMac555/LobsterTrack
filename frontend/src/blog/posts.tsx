import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  author: string;
  datePublished: string;
  dateFormatted: string;
  readTime: string;
  faq?: { question: string; answer: string }[];
  noscriptHtml: string;
  content: ReactNode;
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'what-are-steam-moves-in-football-betting',
    title: 'What Are Steam Moves in Football Betting?',
    description:
      'Steam moves explained: what they are, how to spot them, why they matter for football bettors, and how to use sharp money signals in your betting process.',
    author: 'Neil Macdonald',
    datePublished: '2026-03-16',
    dateFormatted: 'March 16, 2026',
    readTime: '6 min read',
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
    content: (
      <>
        <p>
          If you've spent any time around sharp sports betting, you've heard the term "steam move."
          It gets thrown around a lot. Most people use it wrong. Here's what it actually means, why
          it matters, and how to use it.
        </p>

        <h2>Steam Moves Explained</h2>
        <p>
          A steam move is a sudden, significant shift in a betting line caused by sharp money hitting
          the market. Not square money. Not public money. Sharp money — from syndicates, professional
          bettors, and algorithms that have identified an edge.
        </p>
        <p>
          When a sharp bettor or group places a large wager at one sportsbook, that book adjusts its
          line. Other books see the move and adjust too, even if they haven't taken the same action.
          This cascade effect — one book moves, then another, then another — is the "steam."
        </p>
        <p>It happens fast. Sometimes within minutes. If you blink, you miss it.</p>

        <h2>Steam Moves vs Line Movement</h2>
        <p>Not all line movement is steam. Lines move for plenty of reasons:</p>
        <ul>
          <li><strong>Team news</strong> — a key player ruled out shifts the number</li>
          <li><strong>Public money</strong> — heavy one-sided action from recreational bettors</li>
          <li><strong>Liability management</strong> — books balancing their exposure</li>
        </ul>
        <p>
          A steam move is different. It's driven by information or analysis the market hasn't priced
          in yet. The money is smart, the move is sharp, and it usually sticks.
        </p>
        <p>
          Here's the tell: if a line moves quickly across multiple books in the same direction with no
          obvious news trigger, that's steam.
        </p>

        <h2>Why Steam Moves Matter</h2>
        <p>
          The betting market is an information market. Oddsmakers set lines, and then the market
          corrects them. Steam moves are the market saying "this number is wrong" with real money
          behind it.
        </p>
        <p>For football bettors, steam moves matter because:</p>
        <ol>
          <li>
            <strong>They reveal where the edge is.</strong> Sharp money doesn't chase narratives.
            It follows models, data, and inside information. When sharps hammer a line, there's
            usually a reason.
          </li>
          <li>
            <strong>They tell you who's betting, not just what.</strong> A million dollars from a
            recreational bettor means nothing. A hundred thousand from a known syndicate means
            everything.
          </li>
          <li>
            <strong>They move fast and the value disappears.</strong> The window between the
            initial sharp action and the market correcting is small. If you're not watching,
            you're betting stale numbers.
          </li>
        </ol>

        <h2>How to Spot a Steam Move</h2>
        <p>
          You don't need to be a professional to identify steam. You need the right tools and a
          bit of discipline.
        </p>

        <h3>Watch for Reverse Line Movement</h3>
        <p>
          This is the biggest indicator. If 75% of public bets are on Team A, but the line moves
          toward Team B, sharp money is on Team B. The books are reacting to <em>who</em> is
          betting, not <em>how many</em> people are betting.
        </p>

        <h3>Track Line Movement Across Books</h3>
        <p>
          Steam moves cascade. If Pinnacle (the sharpest book in the world) moves a line and other
          books follow within minutes, that's steam. If only one book moves and nobody follows,
          it's probably just liability management.
        </p>

        <h3>Use Odds Tracking Tools</h3>
        <p>
          Real-time odds comparison sites let you watch lines across dozens of books simultaneously.
          When you see synchronised movement across multiple books with no news catalyst, you're
          watching steam.
        </p>

        <h3>Speed Matters</h3>
        <p>
          Steam moves happen in a window of minutes, not hours. If you're checking lines once a
          day, you'll only ever see the aftermath — never the opportunity.
        </p>

        <h2>Steam Moves in Football Markets</h2>
        <p>
          Football betting has some unique characteristics when it comes to steam:
        </p>

        <h3>Asian Handicap Markets</h3>
        <p>
          This is where the sharpest money lives. Asian handicaps are high-liquidity, low-margin
          markets that attract professional bettors. Steam moves on Asian handicap lines are the
          clearest signal of sharp opinion in football.
        </p>

        <h3>Total Goals Markets</h3>
        <p>
          Over/under lines are another favourite for sharp action. Weather, team news, tactical
          matchups, and situational factors all create edges that models can exploit. When a totals
          line steams, pay attention.
        </p>

        <h3>Match Result Markets Are Noisy</h3>
        <p>
          The 1X2 (match result) market attracts the most public money, which makes it harder to
          isolate steam. The signal-to-noise ratio is worse. Sharp bettors tend to focus on
          handicaps and totals where the market is cleaner.
        </p>

        <h3>Timing Around Team News</h3>
        <p>
          In football, confirmed lineups drop 60–90 minutes before kick-off. This creates a
          predictable window of sharp activity. If a key player is unexpectedly included or
          excluded, sharps who anticipated it are already positioned. The steam hits seconds
          after the announcement.
        </p>

        <h2>How to Use Steam Moves</h2>
        <p>
          Knowing what steam moves are is one thing. Using them is another.
        </p>

        <h3>Follow, Don't Chase</h3>
        <p>
          If you catch a steam move early, you can follow it and get value before the market
          corrects. If you're late and the line has already moved 10–15 cents, the value is gone.
          Don't chase dead steam.
        </p>

        <h3>Context Matters</h3>
        <p>
          A steam move isn't a blind betting signal. You still need to understand <em>why</em> the
          money is moving. Is it team news? A model edge? Injury information? Steam without context
          is just noise you're copying.
        </p>

        <h3>Pinnacle Is Your Benchmark</h3>
        <p>
          Pinnacle takes the highest limits in the world and their lines are shaped by the sharpest
          bettors on the planet. When Pinnacle moves, the rest of the market follows. If you can
          only watch one book, watch Pinnacle.
        </p>

        <h3>Build It Into Your Process</h3>
        <p>
          Steam moves shouldn't replace your analysis — they should complement it. If your own
          research points to value on a side, and then steam confirms it, that's a strong signal.
          If steam contradicts your position, it's worth asking why.
        </p>

        <h2>Common Mistakes</h2>
        <ul>
          <li>
            <strong>Treating every line move as steam.</strong> Most line movement is noise. Learn
            to distinguish sharp action from public money and book adjustments.
          </li>
          <li>
            <strong>Chasing stale moves.</strong> By the time you see it on social media, the value
            is usually gone. You need real-time tools, not Twitter alerts.
          </li>
          <li>
            <strong>Ignoring the closing line.</strong> The closing line — the final number before
            kick-off — is the most efficient price. If you consistently beat the closing line,
            you're sharp. If you don't, it doesn't matter how many steam moves you followed.
          </li>
          <li>
            <strong>Overcomplicating it.</strong> Steam moves are one input. They're not a strategy
            by themselves. The best bettors use them as confirmation, not as their entire edge.
          </li>
        </ul>

        <h2>The Bottom Line</h2>
        <p>
          Steam moves are the market's way of correcting itself. They're driven by sharp money,
          they happen fast, and they reveal where informed bettors see value. For football bettors,
          understanding steam — especially in Asian handicap and totals markets — is a genuine edge
          in how you approach the market.
        </p>
        <p>
          You don't need to be a syndicate to benefit. You need to be paying attention, have the
          right tools, and know the difference between smart money and public money.
        </p>
        <p>The line is the truth. Steam moves are how the truth gets told.</p>

        <hr />

        <p>
          <strong>SteamWatch</strong> tracks Pinnacle odds movement across every major European
          football league in real time. See{' '}
          <Link to="/steam-results" className="text-red-400 hover:text-red-300">
            Steam Results
          </Link>{' '}
          for historical performance, or get instant alerts via our{' '}
          <a
            href="https://t.me/steamwatchalerts"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#2AABEE] hover:text-[#2AABEE]/80"
          >
            free Telegram channel
          </a>
          .
        </p>
      </>
    ),
  },
  {
    slug: 'what-is-closing-line-value-in-football-betting',
    title: 'What Is Closing Line Value (CLV) in Football Betting?',
    description:
      'Closing line value explained: what CLV is, how to calculate it in implied probability, why beating the closing line is the best predictor of long-term betting profit, and how to track it.',
    author: 'Neil Macdonald',
    datePublished: '2026-08-15',
    dateFormatted: 'August 15, 2026',
    readTime: '5 min read',
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
    content: (
      <>
        <p>
          If there's one number that separates bettors who are actually good from bettors who are
          currently lucky, it's closing line value. Results lie for months at a time. CLV doesn't.
        </p>

        <h2>Closing Line Value, Defined</h2>
        <p>
          Closing line value is the difference between the odds you took and the final odds
          available just before kickoff — the closing line. Back a team at 2.20 on Tuesday, watch
          it close at 2.00 on Saturday, and you beat the close. That's positive CLV.
        </p>
        <p>
          Take the same team at 1.90 while the market closes 2.00, and you hold negative CLV — you
          paid more than the market's final estimate said the bet was worth.
        </p>

        <h2>Why the Closing Line Is the Benchmark</h2>
        <p>
          The closing line is the most informed price the market ever produces. By kickoff it has
          absorbed every bet placed, every confirmed lineup, every injury rumour that turned out to
          be true, and every model that fired during the week. Whatever anyone knew, the close
          knows it.
        </p>
        <p>
          That's why the close — especially at a high-limit book like Pinnacle — is treated as the
          best available estimate of the true probabilities. It isn't perfect. It's just better
          than anything else that exists, including your opinion and mine.
        </p>

        <h2>How to Calculate CLV</h2>
        <p>
          Measure it in implied probability, not raw odds — otherwise favourites and longshots
          aren't comparable.
        </p>
        <ol>
          <li>Convert your price to implied probability: 1 ÷ decimal odds. 2.20 → 45.5%.</li>
          <li>Convert the closing price the same way. 2.00 → 50%.</li>
          <li>The difference is your CLV: +4.5 percentage points on this bet.</li>
        </ol>
        <p>
          A tenth of a point of odds means very different things at 1.50 and at 8.00. Percentage
          points of probability mean the same thing everywhere. Always work in probability.
        </p>

        <h2>Why CLV Predicts Profit</h2>
        <p>
          Because short-term results are mostly variance, and CLV isn't. A 55%-hit-rate bettor can
          lose for three months. A coin-flipper can win for three months. Watch either of them long
          enough, though, and their CLV tells you which is which almost immediately.
        </p>
        <p>
          If your bets consistently beat the closing price, you're systematically buying
          probability for less than the market's final estimate of its worth. Over a large sample,
          that has to show up as profit. And the reverse holds: if you're winning with consistently
          negative CLV, the market is quietly telling you the money is borrowed.
        </p>
        <p>
          This is also why sharp bettors obsess over it. Books limit winners slowly, but they limit
          consistent close-beaters fast — because the books know exactly what CLV means.
        </p>

        <h2>The Honest Caveats</h2>
        <ul>
          <li>
            <strong>Sample size still matters.</strong> Beating the close on 20 bets means little.
            On 500, it means a lot.
          </li>
          <li>
            <strong>The close is sharpest where liquidity is deepest.</strong> Pinnacle's Asian
            Handicap close on a Premier League match is a superb benchmark. A low-liquidity market
            close is a weaker one.
          </li>
          <li>
            <strong>Vig blurs small edges.</strong> Both prices contain the bookmaker's margin.
            Small positive CLV can disappear inside it; large CLV survives.
          </li>
        </ul>

        <h2>How to Track It</h2>
        <p>
          Record the price you took on every bet, then compare it to the close. That's it — but
          you need the closing prices, which most bettors never wrote down.
        </p>
        <p>
          SteamWatch records opening and closing Pinnacle prices for every tracked match across
          1X2, Asian Handicap and Totals markets, so the benchmark is always there to check
          yourself against.
        </p>

        <hr />

        <p>
          <strong>SteamWatch</strong> captures the closing line for every match it tracks. See{' '}
          <Link to="/closing-lines" className="text-red-400 hover:text-red-300">
            Closing Lines
          </Link>{' '}
          for opening-vs-closing comparisons by league and week, or read{' '}
          <Link
            to="/blog/what-are-steam-moves-in-football-betting"
            className="text-red-400 hover:text-red-300"
          >
            What Are Steam Moves?
          </Link>{' '}
          for how prices get to the close in the first place.
        </p>
      </>
    ),
  },
  {
    slug: 'what-is-a-drifter-in-football-betting',
    title: 'What Is a Drifter in Football Betting?',
    description:
      'Drifters explained: what it means when football odds drift, why prices lengthen before kickoff, how drift relates to steam, and what the data says about backing or fading drifting teams.',
    author: 'Neil Macdonald',
    datePublished: '2026-08-15',
    dateFormatted: 'August 15, 2026',
    readTime: '4 min read',
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
    content: (
      <>
        <p>
          Everyone watches the steamers — the prices collapsing as money piles in. The other side
          of that trade gets less attention, and it shouldn't: for every price that shortens,
          another one drifts.
        </p>

        <h2>A Drifter, Defined</h2>
        <p>
          A drifter is a selection whose odds lengthen before kickoff — the price "drifts" out,
          meaning its implied probability falls. A team that opens at 2.00 and closes at 2.30 has
          drifted: the market's final estimate of its chances dropped from 50% to roughly 43.5%.
        </p>

        <h2>Drift Is the Other Half of Steam</h2>
        <p>
          Probability in a market has to add up. When money piles onto one outcome and its price
          shortens — steam — that probability comes from somewhere. The other outcomes lengthen.
          Steam and drift are two views of the same repricing event.
        </p>
        <p>
          That's why watching drift is watching steam from the other direction. If the away side
          in a match steams from 3.60 to 3.20, the home side is drifting at the same moment, and
          both moves are telling you about the same shift in the market's opinion.
        </p>

        <h2>Why Odds Drift</h2>
        <p>A price drifts when the weight of money and information moves against it:</p>
        <ul>
          <li>
            <strong>The other side is being backed.</strong> The most common cause — someone likes
            the opponent, and your team's price is the counterweight.
          </li>
          <li>
            <strong>Team news weakened the case.</strong> A key player left out at lineup time
            lengthens the price within seconds.
          </li>
          <li>
            <strong>The opener was too short.</strong> Books open lines early with less
            information. Some opening prices are simply wrong, and the market spends the week
            correcting them.
          </li>
        </ul>
        <p>
          From the outside you rarely know which of these it was — what you know for certain is
          the direction: the market revised that outcome's probability downward, and kept revising
          it until kickoff.
        </p>

        <h2>Backing or Fading Drifters</h2>
        <p>
          The tempting story is that a drifter is "value" — you're getting 2.30 on something that
          was 2.00 a few days ago. But remember what the closing line is: the most informed price
          the market produces. Drift means that informed estimate <em>fell</em>. Blindly backing
          drifters means systematically taking outcomes the market downgraded.
        </p>
        <p>
          The opposite trade — fading drifters, or backing the thing they drifted against — leans
          with the market instead. Neither direction is free money. Any drifter strategy needs a
          real reason to believe the market overshot, and a tracked record to prove it.
        </p>
        <p>
          That last part is the whole game: judge it with data, not instinct. Track every drift,
          record what happened, and let the sample speak.
        </p>

        <hr />

        <p>
          <strong>SteamWatch</strong> tracks both sides of every repricing. See{' '}
          <Link to="/drifters" className="text-red-400 hover:text-red-300">
            Drifters
          </Link>{' '}
          for the moves going the other way with outcomes recorded, or{' '}
          <Link to="/team-pnl" className="text-red-400 hover:text-red-300">
            Team P/L
          </Link>{' '}
          for what blindly backing or fading each team would actually have returned.
        </p>
      </>
    ),
  },
  {
    slug: 'how-to-read-closing-lines-in-football-betting',
    title: 'How to Read Closing Lines in Football Betting',
    description:
      'A practical guide to reading closing lines: converting odds to implied probability, comparing opening and closing prices, what open-to-close movement tells you, and which markets to trust.',
    author: 'Neil Macdonald',
    datePublished: '2026-08-15',
    dateFormatted: 'August 15, 2026',
    readTime: '5 min read',
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
    content: (
      <>
        <p>
          The closing line is the last price a market ever shows — and the only one that reflects
          everything the market learned before kickoff. Reading closes properly is a skill, and
          it's mostly about knowing what to compare against what.
        </p>

        <h2>Start in Probability Space</h2>
        <p>
          Raw odds mislead. The first move with any closing line is converting it: implied
          probability = 1 ÷ decimal odds.
        </p>
        <ul>
          <li>2.50 → 40%</li>
          <li>1.57 → 63.7%</li>
          <li>6.00 → 16.7%</li>
        </ul>
        <p>
          Sum a full market and you'll get slightly over 100% — that excess is the bookmaker's
          margin (the vig). At a sharp book it's small (2–3% on major markets); at soft books it's
          much larger, which is one reason their closes are worse benchmarks.
        </p>

        <h2>The Open-to-Close Gap Is the Story</h2>
        <p>
          A closing price on its own tells you the market's final opinion. The <em>distance</em>{' '}
          between the opening and closing price tells you how much that opinion changed — a week of
          bets, lineups and news compressed into one number.
        </p>
        <ul>
          <li>
            <strong>Shortened, 2.20 → 2.00:</strong> the market raised this outcome's probability
            from 45.5% to 50%. Money arrived on it and stayed.
          </li>
          <li>
            <strong>Lengthened, 2.00 → 2.30:</strong> the market cut its estimate from 50% to
            43.5%. This is a drifter.
          </li>
          <li>
            <strong>Flat, 2.05 → 2.04:</strong> the opener was already about right. Most lines,
            most weeks, barely move — which is itself information.
          </li>
        </ul>

        <h2>Which Market's Close to Trust</h2>
        <p>Not all closing lines are equally informative:</p>
        <ul>
          <li>
            <strong>Asian Handicap</strong> closes at high-limit books are the sharpest read on
            relative team strength. This is where professional volume concentrates, margins are
            thinnest, and the close is most efficient.
          </li>
          <li>
            <strong>Totals</strong> closes are the market's best estimate of goal expectation —
            weather, tactics and lineups all end up priced in.
          </li>
          <li>
            <strong>1X2</strong> closes carry the most recreational money and slightly more margin.
            Still useful, but the noisiest of the three.
          </li>
        </ul>
        <p>
          And the book matters as much as the market: Pinnacle takes the highest limits in the
          world and welcomes winners, so its close is shaped by the sharpest money there is. When
          analysts say "the closing line," they almost always mean Pinnacle's.
        </p>

        <h2>What to Actually Do With Closes</h2>
        <ol>
          <li>
            <strong>Grade yourself against them.</strong> Compare every price you take with the
            eventual close — that's closing line value, the best predictor of long-term profit
            there is.
          </li>
          <li>
            <strong>Study open-to-close patterns.</strong> Which leagues move most? Which teams
            get backed late, week after week? Patterns in how lines close are patterns in how the
            market thinks.
          </li>
          <li>
            <strong>Respect the close even when you disagree.</strong> You can beat the opener all
            day — plenty of openers are wrong. Claiming the close is wrong is a much bigger claim,
            and it needs evidence.
          </li>
        </ol>

        <hr />

        <p>
          <strong>SteamWatch</strong> records opening and closing Pinnacle prices for every match
          it tracks, across 1X2, Asian Handicap and Totals. See{' '}
          <Link to="/closing-lines" className="text-red-400 hover:text-red-300">
            Closing Lines
          </Link>{' '}
          by league and week, or read{' '}
          <Link
            to="/blog/what-is-closing-line-value-in-football-betting"
            className="text-red-400 hover:text-red-300"
          >
            What Is Closing Line Value?
          </Link>{' '}
          for how to grade your own bets against the close.
        </p>
      </>
    ),
  },
  {
    slug: 'favourite-longshot-bias-in-football-betting',
    title: 'The Favourite-Longshot Bias in Football: Five Seasons of Pinnacle Closing Prices',
    description:
      'What blindly backing every favourite, underdog and draw at Pinnacle closing prices returned across 8,867 top-five-league matches from 2021/22 to August 2026. Favourites near enough level, underdogs -10.5%, and the one venue split worth remembering.',
    author: 'Neil Macdonald',
    datePublished: '2026-09-02',
    dateFormatted: 'September 2, 2026',
    readTime: '4 min read',
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
    content: (
      <>
        <p>
          Every punter has heard that the market overprices longshots. I wanted to see what that looks like in football with real closing prices rather than a paper from 2004, so I ran every Pinnacle closing 1X2 price we hold across the top 5 leagues, 2021/22 through to the end of August 2026. 8,867 matches. Flat 1 unit on the favourite in every one of them, 1 unit on the dog, 1 unit on the draw, and see what comes back.
        </p>

        <h2>What blind backing returns</h2>
        <p>
          Favourites: +0.2% over 8,867 bets. Near enough level, the vig handed back and nothing else.
        </p>
        <p>
          Underdogs: -10.5% over the same 8,867 matches.
        </p>
        <p>
          The draw: -2.0%.
        </p>
        <p>
          So the dog bettor is paying just over 10p in the pound for the privilege and the fav bettor is paying nothing.
        </p>

        <h2>It gets worse the bigger the dog</h2>
        <p>
          The bands are terciles, 2,956 matches in each, I didn't pick the boundaries. Slight Dog (2.58 to 3.62) -9.6%. Mid Dog (3.62 to 5.30) -8.0%. Super Dog (5.30 to 36.00) -14.0%.
        </p>
        <p>
          Favourites go the other way. Super Fav (under 1.70) -1.2%, Mid Fav (1.70 to 2.19) -1.8%, Slight Fav (2.19 to 3.09) +3.7%.
        </p>

        <h2>Away favourites are the number to remember</h2>
        <p>
          The market still pays too much respect to home advantage in the 1X2 and it has done for 5 seasons. Fav at home, 5,801 matches, -1.4%. Fav away, 3,066 matches, +3.2%. Slight Favs playing away came in at +6.8%, the dogs at home against them lost 13.3%, and the Super Dogs at home to an away fav lost 18.6p in the pound.
        </p>

        <h2>By league</h2>
        <p>
          Serie A is the worst place to back a dog, -15.6% overall and -23.9% on Super Dogs, with La Liga next at -14.6%.
        </p>
        <p>
          La Liga favs +3.8%, the only league where all 3 fav bands are positive.
        </p>
        <p>
          Bundesliga favs -1.1% and dogs -6.9%, and it's one of only two leagues where the draw came out ahead (+1.1%), Serie A being the other (+0.4%).
        </p>
        <p>
          Ligue 1 Mid Dogs show +8.4%, which I'd treat as noise from 553 matches rather than an edge, the other two dog bands are -5.8% and -16.0%.
        </p>
        <p>
          Premier League favs -0.5%, dogs -9.3%, Super Dogs -17.6%.
        </p>

        <h2>What I'd take from it</h2>
        <p>
          Blind favourites come out level and blind dogs cost you just over 10%. You can still back a dog, the price just has to be wrong by more than 10% before you're level, and away favs in tight games are the one blind angle that's been paying.
        </p>
        <p>
          One patch in the sample: about 200 matches between mid January and mid February 2026, football-data stopped publishing Pinnacle prices in January and our own closing line capture didn't start until the 12th of February. Those use the Betfair Exchange close instead, which is quoted before commission so it runs a shade better than Pinnacle. Everything from the 12th of February on is our own Pinnacle record and it updates every week. Every number above is on the Longshot Bias page with league, season and venue filters, and you can pull up any club in the five leagues on its own, Premier League 25/26 and 26/27 are free to look at.
        </p>
        <p>
          <Link to="/longshot-bias">View Longshot Bias on SteamWatch</Link>
        </p>
      </>
    ),
  },
];
