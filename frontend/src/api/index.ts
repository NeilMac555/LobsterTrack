import type { MatchSummary, MatchDetail, LeagueSummary, Stats, BiggestMover, MatchTotals, SyndicateMove } from '../types';

const API_BASE = '/api';

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}

export async function getLeagues(): Promise<LeagueSummary[]> {
  return fetchJson<LeagueSummary[]>(`${API_BASE}/leagues`);
}

export async function getMatches(params?: {
  league?: string;
  upcoming_only?: boolean;
  limit?: number;
}): Promise<MatchSummary[]> {
  const searchParams = new URLSearchParams();
  if (params?.league) searchParams.set('league', params.league);
  if (params?.upcoming_only !== undefined) searchParams.set('upcoming_only', String(params.upcoming_only));
  if (params?.limit) searchParams.set('limit', String(params.limit));

  const query = searchParams.toString();
  return fetchJson<MatchSummary[]>(`${API_BASE}/matches${query ? `?${query}` : ''}`);
}

export async function getMatchDetail(matchId: string): Promise<MatchDetail> {
  return fetchJson<MatchDetail>(`${API_BASE}/matches/${matchId}`);
}

export async function getStats(): Promise<Stats> {
  return fetchJson<Stats>(`${API_BASE}/stats`);
}

export async function triggerFetch(): Promise<{ matches_found: number; odds_stored: number }> {
  const response = await fetch(`${API_BASE}/fetch`, { method: 'POST' });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}

export async function getBiggestMovers(limit: number = 4): Promise<BiggestMover[]> {
  return fetchJson<BiggestMover[]>(`${API_BASE}/biggest-movers?limit=${limit}`);
}

export async function getMatchTotals(matchId: string): Promise<MatchTotals> {
  return fetchJson<MatchTotals>(`${API_BASE}/matches/${matchId}/totals`);
}

export async function getSyndicateMoves(limit: number = 4): Promise<SyndicateMove[]> {
  return fetchJson<SyndicateMove[]>(`${API_BASE}/syndicate-moves?limit=${limit}`);
}
