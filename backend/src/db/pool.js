// pool.js — Supabase SDK adapter (HTTPS only, zero pg dependency for queries)
// Exposes pool.query(sql, params) interface for drop-in compatibility
// All queries go through Supabase exec_sql RPC over HTTPS — no port 5432/6543 needed

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

// Type detectors — exec_sql passes all params as text[], so we must explicitly
// cast to the right Postgres type to avoid "expression is of type text" errors
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INT_RE = /^-?\d+$/;
const FLOAT_RE = /^-?\d+\.\d+$/;
const BOOL_RE = /^(true|false)$/i;
const JSON_RE = /^(\{|\[)/;

/**
 * Auto-cast params in SQL text to their correct PostgreSQL types.
 * exec_sql passes everything as text[], which PostgreSQL won't auto-coerce
 * for uuid, int, numeric, boolean, or jsonb columns.
 */
function castParams(sql, strParams) {
  var out = sql;
  strParams.forEach(function (p, i) {
    if (p === null || p === undefined) return;
    var n = i + 1;
    // Negative lookahead: skip if $N already followed by digit (e.g. $10) or ::
    var re = new RegExp('\\$' + n + '(?![0-9]|::)', 'g');
    var cast;
    if (UUID_RE.test(p)) cast = '::uuid';
    else if (BOOL_RE.test(p)) cast = '::boolean';
    else if (INT_RE.test(p)) cast = '::int';
    else if (FLOAT_RE.test(p)) cast = '::numeric';
    else if (JSON_RE.test(p)) cast = '::jsonb';
    else return; // text — no cast needed, PostgreSQL accepts text as-is
    out = out.replace(re, '$' + n + cast);
  });
  return out;
}

// Convert pg-style query to Supabase RPC call
// Handles SELECT, INSERT...RETURNING, UPDATE...RETURNING, DELETE
async function supabaseQuery(text, params) {
  params = params || [];
  var strParams = params.map(function (p) {
    return (p === null || p === undefined) ? null : String(p);
  });

  // Auto-cast params to correct Postgres types (uuid, int, numeric, boolean, jsonb)
  var castText = castParams(text, strParams);

  var upperText = castText.trim().toUpperCase();
  var hasReturning = upperText.indexOf('RETURNING') !== -1;
  var isSelect = upperText.startsWith('SELECT') || hasReturning;

  if (isSelect) {
    var r1 = await supabase.rpc('exec_sql', { query: castText, params: strParams });
    if (r1.error) {
      console.error('Supabase exec_sql error:', r1.error.message, '| Query:', castText.substring(0, 100));
      throw new Error(r1.error.message);
    }
    var rows = r1.data || [];
    return { rows: rows, rowCount: rows.length };
  } else {
    var r2 = await supabase.rpc('exec_sql_write', { query: castText, params: strParams });
    if (r2.error) {
      console.error('Supabase exec_sql_write error:', r2.error.message, '| Query:', castText.substring(0, 100));
      throw new Error(r2.error.message);
    }
    return { rows: [], rowCount: 0 };
  }
}

const poolProxy = {
  query: supabaseQuery,
  connect: async function () {
    return { query: supabaseQuery, release: function () { } };
  },
  end: async function () { },
};

// Startup connection test
(async function () {
  try {
    var t = await supabase.from('users').select('id', { count: 'exact', head: true });
    if (t.error) throw new Error(t.error.message);
    console.log('✅ Supabase connected (HTTPS REST API)');
  } catch (err) {
    console.error('❌ Supabase connection failed:', err.message);
  }
})();

module.exports = poolProxy;
module.exports.supabase = supabase;
