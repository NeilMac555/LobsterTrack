import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format, isToday, isTomorrow, startOfDay } from 'date-fns';
import { getMatches, getStats } from '../api';
import type { MatchSummary, Stats } from '../types';
import { LEAGUE_CONFIG } from '../types';
import MatchCard from '../components/MatchCard';
import LeagueLogo from '../components/LeagueLogo';

interface GroupedMatches {
  label: string;
  date: Date;
  matches: MatchSummary[];
}

function groupMatchesByDay(matches: MatchSummary[]): GroupedMatches[] {
  const groups = new Map<string, { date: Date; matches: MatchSummary[] }>();

  for (const match of matches) {
    const matchDate = new Date(match.commence_time);
    const dayKey = startOfDay(matchDate).toISOString();

    if (!groups.has(dayKey)) {
      groups.set(dayKey, { date: startOfDay(matchDate), matches: [] });
    }
    groups.get(dayKey)!.matches.push(match);
  }

  // Sort by date and convert to array
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([_, { date, matches }]) => {
      let label: string;
      if (isToday(date)) {
        label = 'Today';
      } else if (isTomorrow(date)) {
        label = 'Tomorrow';
      } else {
        label = format(date, 'EEEE, MMMM d');
      }
      return { label, date, matches };
    });
}

export default function HomePage() {
  const [searchParams] = useSearchParams();
  const league = searchParams.get('league');

  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const [matchesData, statsData] = await Promise.all([
          getMatches({ league: league || undefined, limit: 200 }),
          getStats(),
        ]);
        setMatches(matchesData);
        setStats(statsData);
      } catch (err) {
        setError('Failed to load data. Is the backend running?');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [league]);

  const groupedMatches = useMemo(() => groupMatchesByDay(matches), [matches]);
  const leagueConfig = league ? LEAGUE_CONFIG[league] : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-slate-400">Loading matches...</span>
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

  return (
    <div>
      {/* Stats Bar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="text-2xl font-bold text-white">{stats.total_matches}</div>
            <div className="text-sm text-slate-400">Total Matches</div>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="text-2xl font-bold text-white">{stats.upcoming_matches}</div>
            <div className="text-sm text-slate-400">Upcoming</div>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="text-2xl font-bold text-white">{stats.total_odds_snapshots}</div>
            <div className="text-sm text-slate-400">Odds Snapshots</div>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="text-2xl font-bold text-white">{stats.tracked_leagues.length}</div>
            <div className="text-sm text-slate-400">Leagues</div>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
          {league && leagueConfig ? (
            <>
              <LeagueLogo sportKey={league} size="lg" />
              {leagueConfig.name}
            </>
          ) : (
            'All Matches'
          )}
        </h2>
        <p className="text-slate-400 mt-1">
          {matches.length} upcoming match{matches.length !== 1 ? 'es' : ''} with Pinnacle odds
        </p>
      </div>

      {/* Matches by Day */}
      {groupedMatches.length === 0 ? (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-12 text-center">
          <p className="text-slate-400">No upcoming matches found</p>
        </div>
      ) : (
        <div className="space-y-8">
          {groupedMatches.map((group) => (
            <section key={group.date.toISOString()}>
              {/* Day Header */}
              <div className="flex items-center gap-4 mb-4">
                <h3 className="text-xl font-bold text-white">{group.label}</h3>
                <div className="flex-1 h-px bg-slate-700"></div>
                <span className="text-sm text-slate-500">
                  {group.matches.length} match{group.matches.length !== 1 ? 'es' : ''}
                </span>
              </div>

              {/* Matches Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.matches.map((match) => (
                  <MatchCard key={match.id} match={match} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
