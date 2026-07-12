// Thin Postgres access layer for the calibration/backtest harness.
// Reads DATABASE_URL from the environment — run via `railway run` against
// production, or point it at a local Postgres for dry runs. Column names
// mirror backend/app/models/{historical_match,xg_data,closing_line}.py
// exactly; if those SQLAlchemy models change, update the SELECTs here.

import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL is not set. Run this script via `railway run npx tsx backtest.ts ...` ' +
        'so it inherits the production connection string, or export DATABASE_URL yourself ' +
        'for a local/staging Postgres.'
      );
    }
    pool = new Pool({
      connectionString,
      // Railway's managed Postgres requires TLS but presents a
      // self-signed-style cert chain the default Node trust store
      // doesn't recognise — this is the standard workaround, not a
      // security downgrade of the connection itself (still encrypted).
      ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// ===== historical_matches =====
export interface HistoricalMatchRow {
  id: number;
  season: string;
  league: string;
  match_date: string; // YYYY-MM-DD
  home_team: string;
  away_team: string;
  fthg: number | null;
  ftag: number | null;
  ftr: 'H' | 'D' | 'A' | null;
  psch: number | null;
  pscd: number | null;
  psca: number | null;
  price_source: 'close' | 'open_fallback' | 'missing';
}

export async function fetchHistoricalMatches(
  league: string,
  seasons?: string[]
): Promise<HistoricalMatchRow[]> {
  const db = getPool();
  const params: unknown[] = [league];
  let seasonFilter = '';
  if (seasons && seasons.length > 0) {
    params.push(seasons);
    seasonFilter = ` AND season = ANY($${params.length})`;
  }
  const { rows } = await db.query<HistoricalMatchRow>(
    `SELECT id, season, league, match_date, home_team, away_team,
            fthg, ftag, ftr, psch, pscd, psca, price_source
     FROM historical_matches
     WHERE league = $1${seasonFilter}
     ORDER BY match_date ASC, id ASC`,
    params
  );
  return rows;
}

// ===== xg_data =====
export interface XGDataRow {
  team_name: string;
  match_number: number;
  npxg_for: number;
  npxg_against: number;
  match_date: string; // YYYY-MM-DD
}

export async function fetchXGData(league: string): Promise<XGDataRow[]> {
  const db = getPool();
  const { rows } = await db.query<XGDataRow>(
    `SELECT team_name, match_number, npxg_for, npxg_against, match_date
     FROM xg_data
     WHERE league = $1
     ORDER BY team_name ASC, match_number ASC`,
    [league]
  );
  return rows;
}

// ===== closing_lines =====
export interface ClosingLineRow {
  match_id: string;
  league: string;
  home_team: string;
  away_team: string;
  kickoff_time: string; // ISO datetime
  market_type: '1x2' | 'asian_handicap' | 'totals';
  close_home: number | null;
  close_draw: number | null;
  close_away: number | null;
  close_line: number | null;
  close_home_price: number | null;
  close_away_price: number | null;
  close_over_price: number | null;
  close_under_price: number | null;
}

export async function fetchClosingLines(league: string): Promise<ClosingLineRow[]> {
  const db = getPool();
  const { rows } = await db.query<ClosingLineRow>(
    `SELECT match_id, league, home_team, away_team, kickoff_time, market_type,
            close_home, close_draw, close_away, close_line,
            close_home_price, close_away_price, close_over_price, close_under_price
     FROM closing_lines
     WHERE league = $1
     ORDER BY kickoff_time ASC`,
    [league]
  );
  return rows;
}
