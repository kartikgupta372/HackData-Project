// Database access layer.
//
// Exposes a pg-style `pool.query(sql, params)` plus the Supabase client
// (`pool.supabase`) for the routes that use the query builder.
//
// Two transports:
//   • pg   — a real Postgres connection via DATABASE_URL (Supabase pooler,
//            port 6543). Fastest, uses true parameterised queries.
//   • rest — the Supabase HTTPS API calling the exec_sql / exec_sql_write
//            functions (migration 004). Works where outbound Postgres ports
//            are blocked. Values are inlined as safely-escaped literals.
//
// DB_DRIVER=auto (default) tries pg first and falls back to rest.

const { createClient } = require('@supabase/supabase-js');
const { config } = require('../config/env');

const REQUIRED_SCHEMA_VERSION = 4;

if (!config.supabaseUrl || !config.supabaseServiceKey) {
  // validate() in app.js reports this properly; keep a guard for scripts.
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
}

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Literal escaping for the REST transport ──────────────────────────────────

function escapeLiteral(str) {
  // Same algorithm as node-postgres' escapeLiteral: safe whether or not
  // standard_conforming_strings is on.
  let hasBackslash = false;
  let out = "'";
  for (const ch of str) {
    if (ch === "'") out += "''";
    else if (ch === '\\') { out += '\\\\'; hasBackslash = true; }
    else out += ch;
  }
  out += "'";
  return hasBackslash ? ` E${out}` : out;
}

function arrayElement(v) {
  if (v === null || v === undefined) return 'NULL';
  if (Array.isArray(v)) return arrayLiteral(v);
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function arrayLiteral(arr) {
  return '{' + arr.map(arrayElement).join(',') + '}';
}

function toLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'NULL';
    return escapeLiteral(String(value));
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return escapeLiteral(value.toISOString());
  if (Buffer.isBuffer(value)) return escapeLiteral('\\x' + value.toString('hex'));
  if (Array.isArray(value)) return escapeLiteral(arrayLiteral(value));
  if (typeof value === 'object') return escapeLiteral(JSON.stringify(value));
  // Postgres text cannot contain NUL bytes.
  return escapeLiteral(String(value).replace(/\u0000/g, ''));
}

// Replace $1..$N in a single pass so values that themselves contain "$2" are
// never re-scanned.
function inlineParams(sql, params = []) {
  if (!params.length) return sql;
  return sql.replace(/\$(\d+)/g, (match, n) => {
    const i = parseInt(n, 10) - 1;
    if (i < 0 || i >= params.length) {
      throw new Error(`Query references ${match} but only ${params.length} parameter(s) were given`);
    }
    return toLiteral(params[i]);
  });
}

function returnsRows(sql) {
  const s = sql.trim().replace(/^\(+/, '').toUpperCase();
  return s.startsWith('SELECT') || s.startsWith('WITH') || /\bRETURNING\b/.test(s);
}

async function restQuery(text, params) {
  const sql = inlineParams(text, params || []);
  if (returnsRows(sql)) {
    const { data, error } = await supabase.rpc('exec_sql', { query: sql });
    if (error) throw dbError(error, sql);
    const rows = Array.isArray(data) ? data : [];
    return { rows, rowCount: rows.length };
  }
  const { data, error } = await supabase.rpc('exec_sql_write', { query: sql });
  if (error) throw dbError(error, sql);
  return { rows: [], rowCount: typeof data === 'number' ? data : 0 };
}

function dbError(error, sql) {
  const err = new Error(error.message || 'Database error');
  err.code = error.code;
  err.hint = error.hint;
  if (!config.isProd) err.sql = sql.substring(0, 200);
  return err;
}

// ── pg transport ─────────────────────────────────────────────────────────────

let pgPool = null;

function createPgPool() {
  const { Pool } = require('pg');
  const url = config.databaseUrl;
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  return new Pool({
    connectionString: url,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: parseInt(process.env.PG_POOL_MAX || '10', 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
    // Supabase's transaction pooler (6543) does not support prepared statements.
    statement_timeout: 30_000,
  });
}

async function pgQuery(text, params) {
  const res = await pgPool.query(text, params || []);
  return { rows: res.rows, rowCount: res.rowCount };
}

// ── Driver selection ─────────────────────────────────────────────────────────

let activeDriver = null;
let readyPromise = null;

async function init() {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    const wantPg = config.dbDriver === 'pg' || (config.dbDriver === 'auto' && config.databaseUrl);
    if (wantPg) {
      if (!config.databaseUrl) throw new Error('DB_DRIVER=pg but DATABASE_URL is empty');
      try {
        pgPool = createPgPool();
        pgPool.on('error', (e) => console.error('Postgres pool error:', e.message));
        await pgPool.query('SELECT 1');
        activeDriver = 'pg';
      } catch (err) {
        if (pgPool) pgPool.end().catch(() => {});
        pgPool = null;
        if (config.dbDriver === 'pg') throw new Error(`Postgres connection failed: ${err.message}`);
        console.warn(`⚠️  DATABASE_URL did not connect (${err.message}) — using Supabase HTTPS instead`);
      }
    }
    if (!activeDriver) activeDriver = 'rest';

    // Schema check — tells you exactly which migration is missing.
    try {
      const { rows } = await query('SELECT aura_schema_version() AS v');
      const v = rows[0]?.v ?? 0;
      if (v < REQUIRED_SCHEMA_VERSION) {
        console.error(`❌ Database schema is v${v}, backend needs v${REQUIRED_SCHEMA_VERSION}. Run backend/src/db/migrations/004_production_hardening.sql`);
      }
    } catch (err) {
      console.error('❌ Database schema check failed:', err.message);
      console.error('   Run the SQL files in backend/src/db/migrations (001 → 004) in the Supabase SQL editor, or `npm run migrate`.');
    }
    console.log(`✅ Database ready (${activeDriver === 'pg' ? 'direct Postgres' : 'Supabase HTTPS'})`);
    return activeDriver;
  })();
  return readyPromise;
}

async function query(text, params) {
  if (!activeDriver) await init();
  return activeDriver === 'pg' ? pgQuery(text, params) : restQuery(text, params);
}

async function healthCheck() {
  const started = Date.now();
  await query('SELECT 1 AS ok');
  return { driver: activeDriver, latencyMs: Date.now() - started };
}

async function end() {
  if (pgPool) await pgPool.end().catch(() => {});
}

const pool = {
  query,
  init,
  end,
  healthCheck,
  connect: async () => ({ query, release: () => {} }),
  get driver() { return activeDriver; },
};

module.exports = pool;
module.exports.supabase = supabase;
module.exports._internals = { inlineParams, toLiteral, escapeLiteral };
