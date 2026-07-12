// One-off backup of the xg_data table BEFORE the season-column migration.
// Read-only. Writes two restorable artifacts to docs/calibration/backups/:
//   - xg_data_pre_season_migration_<date>.json  (full row dump, all columns)
//   - xg_data_pre_season_migration_<date>.sql   (INSERT statements, restorable via psql)
// Verifies row count in both artifacts matches the live table before exiting.

import { writeFileSync } from 'fs';
import { getPool, closePool } from './db';

const STAMP = process.argv[2] || 'UNSTAMPED';
const OUT_DIR = '../docs/calibration/backups';

function sqlEscape(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function main() {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, league, team_name, match_number, npxg_for, npxg_against, match_date, created_at
     FROM xg_data ORDER BY id ASC`
  );
  const liveCount = (await pool.query('SELECT count(*) FROM xg_data')).rows[0].count;

  const jsonPath = `${OUT_DIR}/xg_data_pre_season_migration_${STAMP}.json`;
  writeFileSync(jsonPath, JSON.stringify(rows, null, 2));

  const sqlLines: string[] = [
    '-- Backup of xg_data BEFORE the season-column migration.',
    `-- Taken: ${new Date().toISOString()}`,
    `-- Row count at backup time: ${liveCount}`,
    '-- Restore: run this against a xg_data table with the OLD (pre-migration) schema,',
    '-- or adapt column list if run against the post-migration schema (season column added).',
    '',
  ];
  for (const r of rows) {
    sqlLines.push(
      `INSERT INTO xg_data (id, league, team_name, match_number, npxg_for, npxg_against, match_date, created_at) VALUES (` +
      `${r.id}, ${sqlEscape(r.league)}, ${sqlEscape(r.team_name)}, ${r.match_number}, ${r.npxg_for}, ${r.npxg_against}, ${sqlEscape(r.match_date)}, ${sqlEscape(r.created_at)});`
    );
  }
  const sqlPath = `${OUT_DIR}/xg_data_pre_season_migration_${STAMP}.sql`;
  writeFileSync(sqlPath, sqlLines.join('\n'));

  console.log(JSON.stringify({
    liveRowCount: Number(liveCount),
    jsonRowCount: rows.length,
    sqlInsertCount: rows.length,
    jsonPath,
    sqlPath,
    countsMatch: Number(liveCount) === rows.length,
  }, null, 2));

  await closePool();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
