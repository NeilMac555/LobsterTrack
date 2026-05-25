import type { MatchSummary, MatchDetail, LeagueSummary, Stats, BiggestMover, MatchTotals, SyndicateMove, MatchSpreads, SteamResultsData, ClosingLinesResponse, MatchClosingLinesResponse, XGDataResponse, TeamPLResponse } from '../types';

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

export async function getBiggestMovers(
  limit: number = 4,
  sportKey?: string,
): Promise<BiggestMover[]> {
  const sp = new URLSearchParams();
  sp.set('limit', String(limit));
  if (sportKey) sp.set('sport_key', sportKey);
  return fetchJson<BiggestMover[]>(`${API_BASE}/biggest-movers?${sp.toString()}`);
}

export async function getMatchTotals(matchId: string): Promise<MatchTotals> {
  return fetchJson<MatchTotals>(`${API_BASE}/matches/${matchId}/totals`);
}

export async function getSyndicateMoves(limit: number = 4): Promise<SyndicateMove[]> {
  return fetchJson<SyndicateMove[]>(`${API_BASE}/syndicate-moves?limit=${limit}`);
}

export async function getMatchSpreads(matchId: string): Promise<MatchSpreads> {
  return fetchJson<MatchSpreads>(`${API_BASE}/matches/${matchId}/spreads`);
}

export async function getSteamResults(params?: {
  league?: string;
  limit?: number;
  days?: number;
}): Promise<SteamResultsData> {
  const searchParams = new URLSearchParams();
  if (params?.league) searchParams.set('league', params.league);
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.days) searchParams.set('days', String(params.days));

  const query = searchParams.toString();
  return fetchJson<SteamResultsData>(`${API_BASE}/steam-results${query ? `?${query}` : ''}`);
}

export async function getDrifterResults(params?: {
  league?: string;
  limit?: number;
  days?: number;
}): Promise<SteamResultsData> {
  // Same response shape as steam results — just inverted source data.
  const searchParams = new URLSearchParams();
  if (params?.league) searchParams.set('league', params.league);
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.days) searchParams.set('days', String(params.days));

  const query = searchParams.toString();
  return fetchJson<SteamResultsData>(`${API_BASE}/drifter-results${query ? `?${query}` : ''}`);
}

export async function getClosingLines(params?: {
  league?: string;
  market_type?: string;
  team?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
}): Promise<ClosingLinesResponse> {
  const searchParams = new URLSearchParams();
  if (params?.league) searchParams.set('league', params.league);
  if (params?.market_type) searchParams.set('market_type', params.market_type);
  if (params?.team) searchParams.set('team', params.team);
  if (params?.date_from) searchParams.set('date_from', params.date_from);
  if (params?.date_to) searchParams.set('date_to', params.date_to);
  if (params?.limit) searchParams.set('limit', String(params.limit));
  const query = searchParams.toString();
  return fetchJson<ClosingLinesResponse>(`${API_BASE}/closing-lines${query ? `?${query}` : ''}`);
}

export async function getClosingLinesGrouped(params?: {
  league?: string;
  limit?: number;
}): Promise<MatchClosingLinesResponse> {
  const searchParams = new URLSearchParams();
  if (params?.league) searchParams.set('league', params.league);
  if (params?.limit) searchParams.set('limit', String(params.limit));
  const query = searchParams.toString();
  return fetchJson<MatchClosingLinesResponse>(`${API_BASE}/closing-lines/grouped${query ? `?${query}` : ''}`);
}

export async function getXGTeams(league: string): Promise<{ teams: string[] }> {
  return fetchJson<{ teams: string[] }>(`${API_BASE}/xg-data/teams?league=${encodeURIComponent(league)}`);
}

export async function getXGData(league: string, team: string): Promise<XGDataResponse> {
  const params = new URLSearchParams({ league, team });
  return fetchJson<XGDataResponse>(`${API_BASE}/xg-data?${params}`);
}

export async function getTeamPnL(params?: {
  league?: string;
  seasons?: string;       // comma-separated season codes, e.g. '2425,2526'
  stake?: number;
  opponents?: string;     // 'top' to restrict to matches vs the league's hardcoded top sides
}): Promise<TeamPLResponse> {
  const searchParams = new URLSearchParams();
  if (params?.league) searchParams.set('league', params.league);
  if (params?.seasons) searchParams.set('seasons', params.seasons);
  if (params?.stake) searchParams.set('stake', String(params.stake));
  if (params?.opponents) searchParams.set('opponents', params.opponents);
  const query = searchParams.toString();
  return fetchJson<TeamPLResponse>(`${API_BASE}/team-pnl${query ? `?${query}` : ''}`);
}
