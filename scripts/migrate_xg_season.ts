// One-off migration: add xg_data.season, migrate existing rows to
// '2526', swap the unique constraint, add a supporting index. Wrapped
// in a single transaction — if anything fails, nothing is committed.
// Run via `railway run npx tsx migrate_xg_season.ts`.

import { getPool, closePool } from './db';

async function main() {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`ALTER TABLE xg_data ADD COLUMN season VARCHAR(4)`);
    console.log('1. Added season column (nullable)');

    const backfill = await client.query(`UPDATE xg_data SET season = '2526' WHERE season IS NULL`);
    console.log(`2. Backfilled season='2526' on ${backfill.rowCount} rows`);

    await client.query(`ALTER TABLE xg_data ALTER COLUMN season SET NOT NULL`);
    console.log('3. Set season NOT NULL');

    await client.query(`ALTER TABLE xg_data DROP CONSTRAINT uq_xg_team_match`);
    console.log('4a. Dropped uq_xg_team_match');

    await client.query(
      `ALTER TABLE xg_data ADD CONSTRAINT uq_xg_team_season_match UNIQUE (league, team_name, season, match_number)`
    );
    console.log('4b. Added uq_xg_team_season_match');

    await client.query(`CREATE INDEX idx_xg_league_season ON xg_data (league, season)`);
    console.log('5. Created idx_xg_league_season');

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
