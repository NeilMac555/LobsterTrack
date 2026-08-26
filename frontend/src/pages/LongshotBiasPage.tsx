import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { getFavDogResults } from '../api';
import type { FavDogData, FavDogBand } from '../types';
import { LEAGUE_CONFIG } from '../types';
import { useAuth } from '../contexts/AuthContext';
import PaywallOverlay from '../components/PaywallOverlay';

const MONO_STACK = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const AXIS_TICK = { fill: '#94a3b8', fontSize: 10, fontFamily: MONO_STACK };

// The five leagues with imported closing-line history (football-data.co.uk,
// 2021/22 onward). European competitions have no deep public history —
// our own capture accumulates from Feb 2026 and gets a tab when the
// sample justifies one, same minimum-sample honesty as Steam/Drifters.
const HISTORY_LEAGUES = [
  'soccer_epl',
  'soccer_spain_la_liga',
  'soccer_germany_bundesliga',
  'soccer_italy_serie_a',
  'soccer_france_ligue_one',
];

const SEASON_LABELS: Record<string, string> = {
  '2122': '21/22',
  '2223': '22/23',
  '2324': '23/24',
  '2425': '24/25',
  '2526': '25/26',
  '2627': '26/27',
};

// Freemium teaser (Neil, 2026-08-23): Premier League 25/26 is free for
// everyone; any other league/season selection shows the Pro paywall in
// place of the data. Venue subfilters of the free view stay free — it's
// still the same EPL 25/26 dataset either way.
const FREE_LEAGUE = 'soccer_epl';
const FREE_SEASON = '2526';

function yieldClass(v: number): string {
  if (v > 0) return 'text-emerald-400';
  if (v < 0) return 'text-red-400';
  return 'text-slate-400';
}

function BandTable({ title, accent, bands, all }: {
  title: string;
  accent: string;
  bands: FavDogBand[];
  all: FavDogBand;
}) {
  return (
    <div
      className="rounded-xl sm:rounded-2xl border border-slate-700/50 overflow-hidden card-shadow"
      style={{ background: 'linear-gradient(180deg, rgba(30,41,59,0.85) 0%, rgba(15,23,42,0.95) 100%)' }}
    >
      <div className="px-4 sm:px-5 py-3 border-b border-slate-700/50 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: accent }} />
        <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-900/40 text-left">
              <th className="px-3 sm:px-4 py-2 text-[10px] font-mono uppercase tracking-wider text-slate-500">Odds Range</th>
              <th className="px-3 sm:px-4 py-2 text-[10px] font-mono uppercase tracking-wider text-slate-500 text-right">Median</th>
              <th className="px-3 sm:px-4 py-2 text-[10px] font-mono uppercase tracking-wider text-slate-500 text-right">Matches</th>
              <th className="px-3 sm:px-4 py-2 text-[10px] font-mono uppercase tracking-wider text-slate-500 text-right">Yield</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/40">
            {bands.map((b) => (
              <tr key={b.label}>
                <td className="px-3 sm:px-4 py-2">
                  <span className="font-medium text-white">{b.label}</span>{' '}
                  <span className="text-slate-500 text-xs font-mono">({b.odds_lo.toFixed(2)} – {b.odds_hi.toFixed(2)})</span>
                </td>
                <td className="px-3 sm:px-4 py-2 text-right font-mono tabular-nums text-slate-300">{b.median_odds.toFixed(2)}</td>
                <td className="px-3 sm:px-4 py-2 text-right font-mono tabular-nums text-slate-400">{b.matches.toLocaleString()}</td>
                <td className={`px-3 sm:px-4 py-2 text-right font-mono font-bold tabular-nums ${yieldClass(b.yield_pct)}`}>
                  {b.yield_pct > 0 ? '+' : ''}{b.yield_pct.toFixed(1)}%
                </td>
              </tr>
            ))}
            <tr className="bg-slate-900/40">
              <td className="px-3 sm:px-4 py-2 font-bold text-white">ALL</td>
              <td className="px-3 sm:px-4 py-2 text-right font-mono font-bold tabular-nums text-white">{all.median_odds.toFixed(2)}</td>
              <td className="px-3 sm:px-4 py-2 text-right font-mono font-bold tabular-nums text-white">{all.matches.toLocaleString()}</td>
              <td className={`px-3 sm:px-4 py-2 text-right font-mono font-bold tabular-nums ${yieldClass(all.yield_pct)}`}>
                {all.yield_pct > 0 ? '+' : ''}{all.yield_pct.toFixed(1)}%
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function LongshotBiasPage() {
  const { isSubscribed } = useAuth();
  const [data, setData] = useState<FavDogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Everyone opens on the free sample view (EPL 25/26) — Pro users
  // included, per Neil 2026-08-23; Pro just means every other chip
  // works from there. No auto-widening on subscription resolve.
  const [league, setLeague] = useState<string | null>(FREE_LEAGUE);
  const [season, setSeason] = useState<string | null>(FREE_SEASON);
  const [venue, setVenue] = useState<string | null>(null);

  const isFreeView = league === FREE_LEAGUE && season === FREE_SEASON;
  const locked = !isSubscribed && !isFreeView;

  useEffect(() => {
    if (locked) return; // keep the last (free-view) data behind the paywall panel
    setLoading(true);
    getFavDogResults({
      league: league ?? undefined,
      seasons: season ?? undefined,
      venue: venue ?? undefined,
    })
      .then(setData)
      .catch(() => setError('Failed to load longshot bias data'))
      .finally(() => setLoading(false));
  }, [league, season, venue, locked]);

  const pickLeague = setLeague;
  const pickSeason = setSeason;
  const pickVenue = setVenue;

  const chipClass = (active: boolean) =>
    `px-3 py-1.5 rounded-md font-mono text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors border ${
      active
        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
        : 'bg-slate-900/60 text-slate-400 border-slate-700/60 hover:text-white hover:bg-slate-800/60'
    }`;

  // Lock glyph on options outside the free view, for non-subscribers.
  const lock = (isFree: boolean) => (!isSubscribed && !isFree ? ' 🔒' : '');

  return (
    <div className="max-w-6xl mx-auto">
      <Helmet>
        <title>Longshot Bias — SteamWatch</title>
        <meta name="description" content="What blindly backing every football favourite, underdog or draw at Pinnacle closing prices would have returned — by odds band, league and season, since 2021/22." />
        <link rel="canonical" href="https://www.steamwatch.io/longshot-bias" />
      </Helmet>

      {/* Page Header */}
      <div className="mb-4 sm:mb-6 flex items-center gap-3">
        <div className="w-1 h-9 sm:h-10 rounded-full bg-gradient-to-b from-cyan-400 to-cyan-600 flex-shrink-0" />
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Longshot Bias</h1>
          <p className="text-slate-400 text-xs sm:text-sm mt-0.5">
            What blindly backing every favourite, underdog or draw at Pinnacle closing prices
            would have returned — five leagues, since 2021/22.
          </p>
        </div>
      </div>

      {/* Free-preview banner for non-subscribers */}
      {!isSubscribed && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
          <span className="px-1.5 py-0.5 rounded font-mono text-[10px] font-bold uppercase tracking-[0.12em] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            Free preview
          </span>
          <span className="text-xs sm:text-sm text-slate-300">
            Premier League 25/26 is free to explore. Every other league and season — plus all-time
            views — is a Pro feature.
          </span>
        </div>
      )}

      {/* Filters — always visible; locked selections flip the content
          area into the paywall below. */}
      <div className="mb-4 sm:mb-6 rounded-xl border border-slate-700/60 bg-slate-800/80 p-3 sm:p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold w-14">League</span>
          <button className={chipClass(league === null)} onClick={() => pickLeague(null)}>All{lock(false)}</button>
          {HISTORY_LEAGUES.map((lg) => (
            <button key={lg} className={chipClass(league === lg)} onClick={() => pickLeague(lg)}>
              {LEAGUE_CONFIG[lg]?.shortName ?? lg}{lock(lg === FREE_LEAGUE)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold w-14">Season</span>
          <button className={chipClass(season === null)} onClick={() => pickSeason(null)}>All{lock(false)}</button>
          {Object.entries(SEASON_LABELS).filter(([code]) => data?.seasons.includes(code) || season === code || code === FREE_SEASON).map(([code, label]) => (
            <button key={code} className={chipClass(season === code)} onClick={() => pickSeason(code)}>
              {label}{lock(code === FREE_SEASON)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500 font-semibold w-14">Venue</span>
          <button className={chipClass(venue === null)} onClick={() => pickVenue(null)}>All</button>
          <button className={chipClass(venue === 'fav_home')} onClick={() => pickVenue('fav_home')}>Fav at home</button>
          <button className={chipClass(venue === 'fav_away')} onClick={() => pickVenue('fav_away')}>Fav away</button>
        </div>
      </div>

      {locked && (
        <div className="mb-6 sm:mb-8">
          <PaywallOverlay
            title="Unlock every league and season"
            description="Premier League 25/26 is free — SteamWatch Pro opens all five leagues, every season back to 2021/22, all-time views and the venue splits across the lot."
          />
        </div>
      )}

      {!locked && loading && (
        <div className="p-8 text-center text-slate-500 text-sm">Crunching closing lines…</div>
      )}
      {!locked && error && <div className="p-8 text-center text-red-400 text-sm">{error}</div>}

      {!locked && !loading && !error && data && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
            <div className="space-y-4 sm:space-y-6">
              <BandTable title="Favorites" accent="#22d3ee" bands={data.fav_bands} all={data.fav_all} />
              <BandTable title="Underdogs" accent="#fbbf24" bands={data.dog_bands} all={data.dog_all} />
              {/* The draw — the bucket tennis doesn't have. */}
              <div className="rounded-xl border border-slate-700/50 bg-slate-800/60 px-4 sm:px-5 py-3 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  <span className="text-sm font-bold text-white">The Draw</span>
                  <span className="text-slate-500 text-xs font-mono">med {data.draw_all.median_odds.toFixed(2)} · {data.draw_all.matches.toLocaleString()} matches</span>
                </div>
                <span className={`font-mono font-bold tabular-nums text-sm ${yieldClass(data.draw_all.yield_pct)}`}>
                  {data.draw_all.yield_pct > 0 ? '+' : ''}{data.draw_all.yield_pct.toFixed(1)}% backing every draw
                </span>
              </div>
            </div>

            {/* Cumulative profit chart */}
            <div
              className="rounded-xl sm:rounded-2xl border border-slate-700/50 p-4 sm:p-5 card-shadow"
              style={{ background: 'linear-gradient(180deg, rgba(30,41,59,0.85) 0%, rgba(15,23,42,0.95) 100%)' }}
            >
              <h2 className="text-xs sm:text-sm font-mono uppercase tracking-wider text-slate-400 font-semibold mb-3">
                Cumulative Profit (units, 1u flat stakes)
              </h2>
              <div className="h-80 sm:h-[26rem]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.cumulative} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                    <XAxis dataKey="n" tick={AXIS_TICK} stroke="#475569" />
                    <YAxis tick={AXIS_TICK} stroke="#475569" width={54} />
                    <ReferenceLine y={0} stroke="#64748b" strokeDasharray="4 4" />
                    <Tooltip
                      contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontFamily: MONO_STACK, fontSize: 12 }}
                      labelFormatter={(v) => `Bet #${v}`}
                      formatter={(value?: number) => (typeof value === 'number' ? `${value.toFixed(1)}u` : value)}
                    />
                    <Legend wrapperStyle={{ fontFamily: MONO_STACK, fontSize: 11 }} />
                    <Line type="monotone" dataKey="fav" name="Favorites" stroke="#22d3ee" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="dog" name="Underdogs" stroke="#fbbf24" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Help / provenance */}
          <div className="mb-6 sm:mb-10 bg-slate-800/50 rounded-xl sm:rounded-2xl border border-slate-700/50 p-4 sm:p-5">
            <h3 className="text-xs sm:text-sm font-semibold text-slate-300 mb-2 sm:mb-3">How it works</h3>
            <ul className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm text-slate-400">
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 mt-0.5">•</span>
                <span>Every finished match with a Pinnacle closing 1X2 price since 2021/22, across the Premier League, La Liga, Bundesliga, Serie A and Ligue 1 — {data.total_matches.toLocaleString()} matches under the current filters{data.data_through ? `, through ${data.data_through}` : ''}.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 mt-0.5">•</span>
                <span>The favourite is whichever side closed shorter. Yield is the flat-stake return backing that side in every match — and backing the fav or the dog loses on a draw, which is why football favs bleed in a way tennis favs don't.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 mt-0.5">•</span>
                <span>Odds bands are terciles of the filtered data — equal match counts per band, with the ranges shown — rather than hand-picked boundaries.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 mt-0.5">•</span>
                <span>European competitions aren't here yet: no deep public closing-price history exists for them. Our own capture has been recording UCL/UEL/UECL closes since February 2026 and a Europe view will appear once the sample justifies one.</span>
              </li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
