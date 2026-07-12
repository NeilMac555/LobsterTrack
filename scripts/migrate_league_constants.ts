// One-off migration: create league_constants (current, one row per
// league) and league_constants_history (append-only audit log) tables.
// Matches backend/app/models/league_constants.py exactly — if that file
// changes, update this script too. Wrapped in a single transaction; if
// anything fails, nothing is committed.
//
// Idempotent (CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS) —
// safe to re-run; also matches what Base.metadata.create_all() would do
// automatically on next backend deploy for a brand-new table (the
// established pattern for every other table added since the original
// alembic migrations — xg_data, historical_matches, polymarket_snapshots,
// posted_tweets all went in this way). This script exists so the schema
// can be reviewed and applied explicitly, right now, rather than waiting
// on a deploy.
//
// Run via `railway run npx tsx migrate_league_constants.ts`.

import { getPool, closePool } from './db';

async function main() {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS league_constants (
        id SERIAL PRIMARY KEY,
        league VARCHAR(64) NOT NULL UNIQUE,
        avg_goals_per_team DOUBLE PRECISION NOT NULL,
        home_away_ratio DOUBLE PRECISION NOT NULL,
        sample_matches DOUBLE PRECISION NOT NULL,
        computed_at TIMESTAMP NOT NULL
      )
    `);
    console.log('1. Created league_constants (if not exists)');

    await client.query(`
      CREATE INDEX IF NOT EXISTS ix_league_constants_league ON league_constants (league)
    `);
    console.log('2. Created ix_league_constants_league (if not exists)');

    await client.query(`
      CREATE TABLE IF NOT EXISTS league_constants_history (
        id SERIAL PRIMARY KEY,
        league VARCHAR(64) NOT NULL,
        avg_goals_per_team DOUBLE PRECISION NOT NULL,
        home_away_ratio DOUBLE PRECISION NOT NULL,
        sample_matches DOUBLE PRECISION NOT NULL,
        computed_at TIMESTAMP NOT NULL
      )
    `);
    console.log('3. Created league_constants_history (if not exists)');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_league_constants_history_league ON league_constants_history (league)
    `);
    console.log('4a. Created idx_league_constants_history_league (if not exists)');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_league_constants_history_league_computed ON league_constants_history (league, computed_at)
    `);
    console.log('4b. Created idx_league_constants_history_league_computed (if not exists)');

    await client.query('COMMIT');
    console.log('COMMITTED');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('ROLLED BACK due to error:', e);
    process.exitCode = 1;
  } finally {
    client.release();
    await closePool();
  }
}

main();
