#!/usr/bin/env node
// Applies backend/src/db/migrations/*.sql in order using DATABASE_URL.
// Every migration is idempotent, so re-running is safe.
//
//   npm run migrate
//
// No direct database access (e.g. port 6543 blocked)? Paste the same files
// into Supabase → SQL Editor instead, in filename order.

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Use the Supabase connection string (Project Settings → Database → Connection string → "Session pooler").');
    process.exit(1);
  }
  const dir = path.join(__dirname, '..', 'src', 'db', 'migrations');
  const files = fs.readdirSync(dir).filter(f => /^\d+_.+\.sql$/.test(f)).sort();

  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const client = new Client({ connectionString: url, ssl: isLocal ? false : { rejectUnauthorized: false } });
  await client.connect();
  try {
    for (const file of files) {
      process.stdout.write(`→ ${file} … `);
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('COMMIT');
        console.log('ok');
      } catch (err) {
        await client.query('ROLLBACK');
        console.log('FAILED');
        throw new Error(`${file}: ${err.message}`);
      }
    }
    const { rows } = await client.query('SELECT aura_schema_version() AS v');
    console.log(`\n✅ Database schema is at version ${rows[0].v}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('\n❌ Migration failed:', err.message);
  process.exit(1);
});
