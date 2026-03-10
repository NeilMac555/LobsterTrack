import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { format, isToday, startOfDay } from 'date-fns';
import { getClosingLinesGrouped } from '../api';
import type { MatchClosingLinesResponse, MatchClosingLines, ClosingLine } from '../types';

function formatOdds(odds: number | null): string {
  if (odds === null) return '-';
  return odds.toFixed(2);
}

function formatLine(line: number | null): string {
  if (line === null) return '-';
  return line > 0 ? `+${line}` : String(line);
}

function MarketSection({ title, badge, cl }: { title: string; badge: React.ReactNode; cl: ClosingLine | null }) {
  if (!cl) {
    return (
      <div className="flex items-center justify-between py-3 px-4 bg-slate-800/40 rounded-lg">
        <div className="flex items-center gap-2">
          {badge}
          <span className="text-sm text-slate-400">{title}</span>
        </div>
        <span className="text-xs text-slate-600 italic">Not captured</span>
      </div>
    );
  }

  return (
    <div className="py-3 px-4 bg-slate-800/40 rounded-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {badge}
          <span className="text-sm text-slate-300 font-medium">{title}</span>
        </div>
        <span className="text-[10px] text-slate-500">{cl.minutes_before_kickoff}m before KO</span>
      </div>
      <div className="mt-2">
        {cl.market_type === '1x2' && (
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center">
              <div className="text-[10px] text-slate-500 uppercase mb-1">Home</div>
              <div className="font-mono text-sm font-semibold px-2 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                {formatOdds(cl.close_home)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-slate-500 uppercase mb-1">Draw</div>
              <div className="font-mono text-sm font-semibold px-2 py-1.5 rounded-lg bg-yellow-500/10 text-yellow-300 border border-yellow-500/20">
                {formatOdds(cl.close_draw)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-slate-500 uppercase mb-1">Away</div>
              <div className="font-mono text-sm font-semibold px-2 py-1.5 rounded-lg bg-red-500/10 text-red-300 border border-red-500/20">
                {formatOdds(cl.close_away)}
              </div>
            </div>
          </div>
        )}
        {cl.market_type === 'asian_handicap' && (
          <div className="flex items-center gap-3">
            <div className="text-center">
              <div className="text-[10px] text-slate-500 uppercase mb-1">Line</div>
              <div className="font-mono text-sm font-bold px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20">
                {formatLine(cl.close_line)}
              </div>
            </div>
            <div className="flex-1 grid grid-cols-2 gap-2">
              <div className="text-center">
                <div className="text-[10px] text-slate-500 uppercase mb-1">Home</div>
                <div className="font-mono text-sm font-semibold px-2 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  {formatOdds(cl.close_home_price)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-[10px] text-slate-500 uppercase mb-1">Away</div>
                <div className="font-mono text-sm font-semibold px-2 py-1.5 rounded-lg bg-red-500/10 text-red-300 border border-red-500/20">
                  {formatOdds(cl.close_away_price)}
                </div>
              </div>
            </div>
          </div>
        )}
        {cl.market_type === 'totals' && (
          <div className="flex items-center gap-3">
            <div className="text-center">
              <div className="text-[10px] text-slate-500 uppercase mb-1">Line</div>
              <div className="font-mono text-sm font-bold px-3 py-1.5 rounded-lg bg-violet-500/10 text-violet-300 border border-violet-500/20">
                {cl.close_line !== null ? cl.close_line : '-'}
              </div>
            </div>
            <div className="flex-1 grid grid-cols-2 gap-2">
              <div className="text-center">
                <div className="text-[10px] text-slate-500 uppercase mb-1">Over</div>
                <div className="font-mono text-sm font-semibold px-2 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  {formatOdds(cl.close_over_price)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-[10px] text-slate-500 uppercase mb-1">Under</div>
                <div className="font-mono text-sm font-semibold px-2 py-1.5 rounded-lg bg-red-500/10 text-red-300 border border-red-500/20">
                  {formatOdds(cl.close_under_price)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MatchAccordion({ match }: { match: MatchClosingLines }) {
  const [open, setOpen] = useState(false);
  const kickoff = new Date(match.kickoff_time);
  const marketsAvailable = [match.h2h, match.asian_handicap, match.totals].filter(Boolean).length;

  return (
    <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 overflow-hidden transition-all duration-200 hover:border-indigo-500/30">
      {/* Accordion Header */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 sm:px-5 py-4 text-left hover:bg-slate-700/20 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="text-white font-semibold text-sm sm:text-base truncate">
              {match.home_team}
              <span className="text-slate-500 font-normal mx-1.5">vs</span>
              {match.away_team}
            </div>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-slate-500">
              {format(kickoff, 'HH:mm')}
            </span>
            <span className="text-[10px] text-indigo-400/70 bg-indigo-500/10 px-1.5 py-0.5 rounded">
              {marketsAvailable}/3 markets
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 ml-3">
          {/* Quick odds preview when closed */}
          {!open && match.h2h && (
            <div className="hidden sm:flex items-center gap-1 font-mono text-xs">
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">{formatOdds(match.h2h.close_home)}</span>
              <span className="px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400">{formatOdds(match.h2h.close_draw)}</span>
              <span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">{formatOdds(match.h2h.close_away)}</span>
            </div>
          )}
          <svg
            className={`w-5 h-5 text-slate-400 transition-transform duration-200 flex-shrink-0 ${open ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Accordion Content */}
      {open && (
        <div className="px-4 sm:px-5 pb-4 space-y-2 border-t border-slate-700/30 pt-3">
          <MarketSection
            title="1X2 (Match Result)"
            badge={<span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-500/20 text-blue-400">1X2</span>}
            cl={match.h2h}
          />
          <MarketSection
            title="Asian Handicap"
            badge={<span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/20 text-amber-400">AH</span>}
            cl={match.asian_handicap}
          />
          <MarketSection
            title="Totals (Over/Under)"
            badge={<span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/20 text-emerald-400">O/U</span>}
            cl={match.totals}
          />
          <div className="pt-2 text-right">
            <Link
              to={`/match/${match.match_id}`}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              View full odds history &rarr;
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

interface MatchdayGroup {
  dateKey: string;
  label: string;
  matches: MatchClosingLines[];
  isToday: boolean;
}

function groupByMatchday(matches: MatchClosingLines[]): MatchdayGroup[] {
  const groups: Record<string, MatchClosingLines[]> = {};

  for (const match of matches) {
    const kickoff = new Date(match.kickoff_time);
    const dateKey = format(startOfDay(kickoff), 'yyyy-MM-dd');
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(match);
  }

  // Sort by date descending (most recent first)
  const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  return sortedKeys.map((dateKey) => {
    const first = new Date(groups[dateKey][0].kickoff_time);
    const today = isToday(first);
    return {
      dateKey,
      label: today ? 'Today' : format(first, 'EEEE, MMMM d yyyy'),
      matches: groups[dateKey],
      isToday: today,
    };
  });
}

function MatchdayAccordion({ group }: { group: MatchdayGroup }) {
  const [open, setOpen] = useState(group.isToday);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between px-4 sm:px-5 py-3 rounded-xl transition-colors ${
          group.isToday
            ? 'bg-indigo-600/20 border border-indigo-500/30'
            : 'bg-slate-800/60 border border-slate-700/40 hover:bg-slate-800/80'
        }`}
      >
        <div className="flex items-center gap-3">
          <span className={`text-sm sm:text-base font-bold ${group.isToday ? 'text-indigo-300' : 'text-slate-300'}`}>
            {group.label}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            group.isToday
              ? 'bg-indigo-500/20 text-indigo-400'
              : 'bg-slate-700/50 text-slate-500'
          }`}>
            {group.matches.length} {group.matches.length === 1 ? 'match' : 'matches'}
          </span>
        </div>
        <svg
          className={`w-5 h-5 transition-transform duration-200 flex-shrink-0 ${
            group.isToday ? 'text-indigo-400' : 'text-slate-500'
          } ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="mt-2 space-y-3">
          {group.matches.map((match) => (
            <MatchAccordion key={match.match_id} match={match} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CLClosingLinesPage() {
  const [data, setData] = useState<MatchClosingLinesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const result = await getClosingLinesGrouped({
          league: 'soccer_uefa_champs_league',
          limit: 200,
        });
        setData(result);
      } catch (err) {
        setError('Failed to load closing lines. Is the backend running?');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-slate-400">Loading closing lines...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
        <p className="text-red-400">{error}</p>
        <p className="text-slate-500 mt-2 text-sm">
          Make sure the backend is running at http://localhost:8000
        </p>
      </div>
    );
  }

  if (!data) return null;

  // Count markets across all matches
  const stats = data.matches.reduce(
    (acc, m) => {
      if (m.h2h) acc.h2h++;
      if (m.asian_handicap) acc.ah++;
      if (m.totals) acc.totals++;
      return acc;
    },
    { h2h: 0, ah: 0, totals: 0 }
  );

  const matchdays = groupByMatchday(data.matches);

  return (
    <div>
      {/* Page Header */}
      <div className="mb-6 sm:mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
            <img
              src="https://flagcdn.com/w80/eu.png"
              alt="Champions League"
              className="w-6 h-6 rounded object-cover"
            />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Champions League Closing Lines</h1>
            <p className="text-slate-400 text-sm sm:text-base mt-0.5">
              Pinnacle's last odds before kickoff across all markets
            </p>
          </div>
        </div>
      </div>

      {/* Stats Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
        <div className="bg-slate-800/80 rounded-xl border border-indigo-500/30 p-4 text-center">
          <div className="text-2xl sm:text-3xl font-bold text-indigo-400">{data.total}</div>
          <div className="text-xs sm:text-sm text-slate-400 mt-1">Matches</div>
        </div>
        <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 p-4 text-center">
          <div className="text-2xl sm:text-3xl font-bold text-blue-400">{stats.h2h}</div>
          <div className="text-xs sm:text-sm text-slate-400 mt-1">1X2</div>
        </div>
        <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 p-4 text-center">
          <div className="text-2xl sm:text-3xl font-bold text-amber-400">{stats.ah}</div>
          <div className="text-xs sm:text-sm text-slate-400 mt-1">Asian HC</div>
        </div>
        <div className="bg-slate-800/80 rounded-xl border border-slate-700/50 p-4 text-center">
          <div className="text-2xl sm:text-3xl font-bold text-emerald-400">{stats.totals}</div>
          <div className="text-xs sm:text-sm text-slate-400 mt-1">Totals</div>
        </div>
      </div>

      {/* Matchday Groups */}
      {matchdays.length > 0 ? (
        <div className="space-y-4">
          {matchdays.map((group) => (
            <MatchdayAccordion key={group.dateKey} group={group} />
          ))}
        </div>
      ) : (
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-8 sm:p-16 text-center">
          <div className="w-16 h-16 rounded-full bg-indigo-500/10 flex items-center justify-center mx-auto mb-4">
            <img
              src="https://flagcdn.com/w80/eu.png"
              alt="Champions League"
              className="w-8 h-8 rounded object-cover opacity-50"
            />
          </div>
          <p className="text-slate-400 text-base sm:text-lg">No Champions League closing lines yet</p>
          <p className="text-slate-500 text-sm mt-2">
            Lines are captured automatically after kickoff for UCL matches
          </p>
        </div>
      )}
    </div>
  );
}
