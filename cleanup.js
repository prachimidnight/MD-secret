'use strict';

/**
 * cleanup.js — Purge expired secrets from Turso.
 *
 * Run manually:    node cleanup.js
 * Cron (hourly):   0 * * * * cd /path/to/midnight-vault && node cleanup.js >> /var/log/midnight-vault-cleanup.log 2>&1
 */

require('dotenv').config();

const { createClient } = require('@libsql/client');

const db = createClient({
  url:       process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function cleanupExpired() {
  const now = Math.floor(Date.now() / 1000);

  const result = await db.execute({
    sql:  'DELETE FROM secrets WHERE expires_at < ?',
    args: [now],
  });

  const count = result.rowsAffected ?? 0;
  const ts    = new Date().toISOString();

  console.log(`[${ts}] Cleanup complete — ${count} expired secret(s) deleted.`);
}

cleanupExpired()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`[${new Date().toISOString()}] Cleanup failed:`, err.message);
    process.exit(1);
  });
