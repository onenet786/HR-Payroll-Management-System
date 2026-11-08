#!/usr/bin/env node
// Scheduled database optimisation (run in the folder that holds the .env).
//
//   node scripts/db-maintenance.cjs           quick: VACUUM ANALYZE every table (safe while people work)
//   node scripts/db-maintenance.cjs --deep    deep: VACUUM FULL ANALYZE table by table (shrinks; locks each table
//                                             briefly: run at night, after a backup)
//
// Windows package: the nightly backup task runs quick every night and deep on the first Sunday of the month.
// aaPanel: add a Cron task (Shell script), e.g. nightly `cd /www/wwwroot/<app> && node scripts/db-maintenance.cjs`.
require('dotenv').config({ path: ['.env.local', '.env'], quiet: true });
const { optimize, recordRun, databaseHealth } = require('../server/db-maintenance.cjs');
const { pool } = require('../server/db.cjs');

(async () => {
  const mode = process.argv.includes('--deep') ? 'deep' : 'quick';
  const startedAt = new Date().toISOString();
  const mb = bytes => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  try {
    const result = await optimize(mode, { onTable: (name, index, total) => { if (mode === 'deep') console.log(`  ${index + 1}/${total} ${name}`); } });
    await recordRun({ mode, state: 'done', startedAt, finishedAt: new Date().toISOString(), sizeBefore: result.sizeBefore, sizeAfter: result.sizeAfter, error: null, by: 'scheduled' });
    const health = await databaseHealth();
    console.log(`Database ${mode} optimisation done: ${result.tables} tables, ${mb(result.sizeBefore)} -> ${mb(result.sizeAfter)}; unused rows now ${(health.deadShare * 100).toFixed(1)}%.`);
  } catch (error) {
    await recordRun({ mode, state: 'failed', startedAt, finishedAt: new Date().toISOString(), sizeBefore: null, sizeAfter: null, error: error.message, by: 'scheduled' });
    console.error(`Database ${mode} optimisation failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
