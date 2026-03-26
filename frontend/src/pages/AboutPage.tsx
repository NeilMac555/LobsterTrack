import { Helmet } from 'react-helmet-async';

const PERSON_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Person",
  "name": "Neil Mac",
  "alternateName": ["Neil Macdonald", "Neil Mac Tips", "NeilMac555", "Bookie Insiders Football"],
  "url": "https://www.steamwatch.io/about",
  "jobTitle": "Professional Football Betting Analyst",
  "knowsAbout": ["football betting", "steam moves", "sharp money", "closing line value", "Dixon-Coles model"],
  "sameAs": [
    "https://x.com/NeilMac555",
    "https://neilmac.substack.com/",
"https://www.honestbettingreviews.com/best-football-tipster-telegram/",
    "https://smartsportstrader.com/bookie-insiders-football-review/",
    "https://www.bet-experts.com/tipster-review/neil-mac/",
    "https://www.youtube.com/@neilmac555"
  ]
};

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <Helmet>
        <title>About Neil Mac | Football Betting Analyst &amp; SteamWatch Founder</title>
        <meta name="description" content="Neil Mac is a professional football betting analyst with 20+ years' experience and 7,800+ tracked bets. Creator of SteamWatch, a steam move and sharp money tracking platform." />
        <meta property="og:title" content="About Neil Mac | Football Betting Analyst & SteamWatch Founder" />
        <meta property="og:description" content="Neil Mac is a professional football betting analyst with 20+ years' experience and 7,800+ tracked bets. Creator of SteamWatch, a steam move and sharp money tracking platform." />
        <meta property="og:url" content="https://www.steamwatch.io/about" />
        <link rel="canonical" href="https://www.steamwatch.io/about" />
        <script type="application/ld+json">{JSON.stringify(PERSON_SCHEMA)}</script>
      </Helmet>

      <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">About Neil Mac</h1>
      <p className="text-slate-400 text-sm mb-10">Football Betting Analyst &amp; SteamWatch Founder</p>

      {/* Who I Am */}
      <section className="mb-10">
        <h2 className="text-xl font-bold text-white mb-4">Who I Am</h2>
        <p className="text-slate-300 leading-relaxed mb-4">
          I'm Neil Mac — a professional football betting analyst with over 20 years of experience
          in sports betting markets. I've worked with and contributed to some of the biggest names
          in the industry including Paddy Power, Oddschecker, and Covers.com.
        </p>
        <p className="text-slate-300 leading-relaxed">
          My approach combines quantitative modelling with real-time market analysis. I focus on
          European football across the Premier League, La Liga, Bundesliga, Serie A, Ligue 1,
          and Champions League — tracking where the sharp money flows and why.
        </p>
      </section>

      {/* Track Record */}
      <section className="mb-10">
        <h2 className="text-xl font-bold text-white mb-4">Track Record</h2>
        <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
          <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 p-4 text-center">
            <p className="text-2xl sm:text-3xl font-extrabold text-emerald-400">7,800+</p>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">Bets Tracked</p>
          </div>
          <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 p-4 text-center">
            <p className="text-2xl sm:text-3xl font-extrabold text-emerald-400">+464u</p>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">Units Profit</p>
          </div>
          <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 p-4 text-center">
            <p className="text-2xl sm:text-3xl font-extrabold text-emerald-400">4%+</p>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">ROI</p>
          </div>
        </div>
        <p className="text-slate-400 text-sm leading-relaxed">
          All results independently tracked and publicly verifiable. Long-term profitability
          built on disciplined staking, closing line value, and a systematic approach to
          identifying market inefficiencies.
        </p>
      </section>

      {/* What is SteamWatch */}
      <section className="mb-10">
        <h2 className="text-xl font-bold text-white mb-4">What is SteamWatch?</h2>
        <p className="text-slate-300 leading-relaxed mb-4">
          SteamWatch is a platform I built to track sharp money movement across major European
          football betting markets. We monitor Pinnacle odds — widely regarded as the sharpest
          bookmaker in the world — and surface the moves that matter: steam, syndicate action,
          and closing line shifts.
        </p>
        <p className="text-slate-300 leading-relaxed mb-6">
          Our data updates every 15 minutes, capturing odds snapshots across 1X2, Over/Under,
          and Asian Handicap markets for the Premier League, La Liga, Bundesliga, Serie A,
          Ligue 1, Champions League, and Europa League.
        </p>

        <div className="space-y-4">
          <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 p-5">
            <h3 className="text-white font-semibold mb-2">Biggest Movers</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Matches ranked by the largest odds movements. When sharp money flows into one
              side of a match, odds shorten — we track the magnitude and direction of every move.
            </p>
          </div>
          <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 p-5">
            <h3 className="text-white font-semibold mb-2">Syndicate Moves</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Late sharp action detected within 3 hours of kickoff with 3+ percentage point
              implied probability shifts. Real-time Telegram alerts so you never miss a move.
            </p>
          </div>
          <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 p-5">
            <h3 className="text-white font-semibold mb-2">Steam Results</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Historical performance tracking with P/L, win rates, and team rankings.
              See which teams consistently attract sharp money and whether following
              steam has been profitable.
            </p>
          </div>
          <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 p-5">
            <h3 className="text-white font-semibold mb-2">Closing Line Analysis</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Compare opening and closing odds for every match. Closing line value (CLV)
              is the single best predictor of long-term betting success.
            </p>
          </div>
          <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 p-5">
            <h3 className="text-white font-semibold mb-2">Rolling xG</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Track expected goals trends for every team across Europe's top leagues.
              Rolling 5 and 10-game windows with trend lines to identify form changes.
            </p>
          </div>
        </div>
      </section>

      {/* The Match Model */}
      <section className="mb-10">
        <h2 className="text-xl font-bold text-white mb-4">The Dixon-Coles Match Model</h2>
        <p className="text-slate-300 leading-relaxed mb-4">
          SteamWatch includes a Dixon-Coles adjusted Poisson regression model that generates
          fair odds baselines for every match. The model runs an 11-step pipeline covering
          penalty xG adjustment, set piece discounting, red card normalisation, xG per shot
          quality, form weighting, attack/defence ratings, motivation and absence factors,
          and the Dixon-Coles low-score correction.
        </p>
        <p className="text-slate-400 text-sm">
          All calculations run in your browser — no data leaves your device.
          Based on the original Dixon &amp; Coles (1997) paper with modern adjustments
          for xG data and contextual factors.
        </p>
      </section>

      {/* Find Me */}
      <section className="mb-10">
        <h2 className="text-xl font-bold text-white mb-4">Find Me</h2>
        <div className="flex flex-wrap gap-3">
          <a
            href="https://neilmac.substack.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-orange-500/20 border border-orange-500/40 rounded-lg text-orange-400 text-sm font-medium hover:bg-orange-500/30 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.539 8.242H1.46V5.406h21.08v2.836zM1.46 10.812V24L12 18.11 22.54 24V10.812H1.46zM22.54 0H1.46v2.836h21.08V0z"/>
            </svg>
            Substack
          </a>
          <a
            href="https://x.com/NeilMac555"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-slate-600/30 border border-slate-500/40 rounded-lg text-slate-300 text-sm font-medium hover:bg-slate-600/40 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
            @NeilMac555
          </a>
          <a
            href="https://www.youtube.com/@neilmac555"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-red-600/20 border border-red-600/40 rounded-lg text-red-400 text-sm font-medium hover:bg-red-600/30 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
            YouTube
          </a>
          <a
            href="https://t.me/steamwatchalerts"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-[#2AABEE]/20 border border-[#2AABEE]/40 rounded-lg text-[#2AABEE] text-sm font-medium hover:bg-[#2AABEE]/30 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
            </svg>
            Telegram Alerts
          </a>
        </div>

        {/* Reviews */}
        <div className="mt-6">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-3">Independent Reviews</p>
          <div className="flex flex-wrap gap-2">
            <a
              href="https://www.honestbettingreviews.com/best-football-tipster-telegram/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-slate-400 hover:text-slate-300 underline underline-offset-2 transition-colors"
            >
              Honest Betting Reviews
            </a>
            <span className="text-slate-600">·</span>
            <a
              href="https://smartsportstrader.com/bookie-insiders-football-review/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-slate-400 hover:text-slate-300 underline underline-offset-2 transition-colors"
            >
              Smart Sports Trader
            </a>
            <span className="text-slate-600">·</span>
            <a
              href="https://www.bet-experts.com/tipster-review/neil-mac/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-slate-400 hover:text-slate-300 underline underline-offset-2 transition-colors"
            >
              Bet Experts
            </a>
          </div>
        </div>
      </section>

      {/* Data Sources */}
      <section className="mb-10">
        <h2 className="text-xl font-bold text-white mb-4">Data Sources</h2>
        <p className="text-slate-400 text-sm leading-relaxed">
          Odds data sourced from Pinnacle via The Odds API. Match statistics from
          Opta Analyst, FBref, Transfermarkt, and Scoreroom. All data is collected
          and processed automatically with updates every 15 minutes.
        </p>
      </section>
    </div>
  );
}
