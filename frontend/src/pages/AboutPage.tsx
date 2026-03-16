import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <Helmet>
        <title>About SteamWatch — Sharp Money Tracking for Football Betting</title>
        <meta name="description" content="SteamWatch tracks sharp money movement across football betting markets using Pinnacle odds. Built on the Dixon-Coles probability model with real-time syndicate move alerts." />
        <meta property="og:title" content="About SteamWatch — Sharp Money Tracking for Football Betting" />
        <meta property="og:description" content="SteamWatch tracks sharp money movement across football betting markets using Pinnacle odds. Built on the Dixon-Coles probability model with real-time syndicate move alerts." />
        <meta property="og:url" content="https://www.steamwatch.io/about" />
        <link rel="canonical" href="https://www.steamwatch.io/about" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Person",
          "name": "Neil Macdonald",
          "url": "https://www.steamwatch.io/about",
          "knowsAbout": ["football betting", "sharp money", "Dixon-Coles model", "sports analytics"]
        })}</script>
      </Helmet>

      <h1 className="text-3xl sm:text-4xl font-bold text-white mb-8">About SteamWatch</h1>

      {/* What is SteamWatch */}
      <section className="mb-10">
        <h2 className="text-xl font-bold text-white mb-4">What is SteamWatch?</h2>
        <p className="text-slate-300 leading-relaxed mb-4">
          SteamWatch tracks sharp money movement across major European football betting markets.
          We monitor Pinnacle odds — widely regarded as the sharpest bookmaker in the world — and
          surface the moves that matter: steam, syndicate action, and closing line shifts.
        </p>
        <p className="text-slate-300 leading-relaxed">
          Our data updates every 15 minutes, capturing odds snapshots across 1x2, Over/Under,
          and Asian Handicap markets for the Premier League, La Liga, Bundesliga, Serie A,
          Ligue 1, Champions League, and Europa League.
        </p>
      </section>

      {/* How It Works */}
      <section className="mb-10">
        <h2 className="text-xl font-bold text-white mb-4">How It Works</h2>
        <div className="space-y-6">
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
              implied probability shifts. These are the moves that professional syndicates
              typically make close to game time.
            </p>
          </div>
          <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 p-5">
            <h3 className="text-white font-semibold mb-2">Steam Results</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Historical performance tracking of steam moves across all leagues.
              See which teams consistently attract sharp money and whether following
              steam has been profitable over time.
            </p>
          </div>
          <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 p-5">
            <h3 className="text-white font-semibold mb-2">Closing Line Analysis</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Compare opening and closing odds for every match. Closing line value (CLV)
              is the single best predictor of long-term betting success — if you consistently
              beat the closing line, you're making +EV bets.
            </p>
          </div>
        </div>
      </section>

      {/* Match Model */}
      <section className="mb-10">
        <h2 className="text-xl font-bold text-white mb-4">The Match Model</h2>
        <p className="text-slate-300 leading-relaxed mb-4">
          SteamWatch Pro includes a Dixon-Coles adjusted Poisson regression model that
          generates fair odds baselines for every match. The model runs an 11-step pipeline:
        </p>
        <ul className="space-y-2 text-slate-400 text-sm">
          <li className="flex gap-2"><span className="text-emerald-400 font-mono text-xs mt-0.5">01</span> Penalty xG adjustment</li>
          <li className="flex gap-2"><span className="text-emerald-400 font-mono text-xs mt-0.5">02</span> Set piece xG discount</li>
          <li className="flex gap-2"><span className="text-emerald-400 font-mono text-xs mt-0.5">03</span> Red card normalisation</li>
          <li className="flex gap-2"><span className="text-emerald-400 font-mono text-xs mt-0.5">04</span> xG per shot quality adjustment</li>
          <li className="flex gap-2"><span className="text-emerald-400 font-mono text-xs mt-0.5">05</span> Form weighting (season vs last 6)</li>
          <li className="flex gap-2"><span className="text-emerald-400 font-mono text-xs mt-0.5">06</span> Attack & defence strength ratings</li>
          <li className="flex gap-2"><span className="text-emerald-400 font-mono text-xs mt-0.5">07</span> Expected goals (Poisson lambda)</li>
          <li className="flex gap-2"><span className="text-emerald-400 font-mono text-xs mt-0.5">08</span> Motivation & absence adjustments</li>
          <li className="flex gap-2"><span className="text-emerald-400 font-mono text-xs mt-0.5">09</span> Poisson goal distribution</li>
          <li className="flex gap-2"><span className="text-emerald-400 font-mono text-xs mt-0.5">10</span> Dixon-Coles low-score correction</li>
          <li className="flex gap-2"><span className="text-emerald-400 font-mono text-xs mt-0.5">11</span> Draw inflation & normalisation</li>
        </ul>
        <p className="text-slate-400 text-sm mt-4">
          All calculations run in your browser — no data leaves your device.
          The model is based on the original Dixon & Coles (1997) paper with modern adjustments
          for xG data, form weighting, and contextual factors.
        </p>
      </section>

      {/* Who's Behind It */}
      <section className="mb-10">
        <h2 className="text-xl font-bold text-white mb-4">Who's Behind It</h2>
        <p className="text-slate-300 leading-relaxed">
          SteamWatch is built by Neil Macdonald, a football analytics and betting markets
          researcher. The project combines quantitative modelling with real-time market
          data to surface actionable signals for serious bettors.
        </p>
      </section>

      {/* Links */}
      <section className="mb-10">
        <h2 className="text-xl font-bold text-white mb-4">Connect</h2>
        <div className="flex flex-wrap gap-3">
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
          <Link
            to="/tools/match-predictor"
            className="flex items-center gap-2 px-4 py-2 bg-red-500/20 border border-red-500/40 rounded-lg text-red-400 text-sm font-medium hover:bg-red-500/30 transition-colors"
          >
            Match Model
          </Link>
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
