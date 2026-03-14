// src/db/pool.js — Fixed: $N regex for params >=10, defensive service key check
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

const UUID_RE  = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INT_RE   = /^-?\d+$/;
const FLOAT_RE = /^-?\d+\.\d+$/;
const BOOL_RE  = /^(true|false)$/i;
const JSON_RE  = /^(\{|\[)/;

/**
 * FIX: Use \b (word boundary) instead of (?![0-9]) so $10, $11 etc. are
 * correctly replaced. Old regex matched $1 inside $10 causing cast misses.
 */
function castParams(sql, strParams) {
  let out = sql;
  strParams.forEach((p, i) => {
    if (p === null || p === undefined) return;
    const n   = i + 1;
    const re  = new RegExp('\\$' + n + '\\b(?!::)', 'g'); // FIX: \b not (?![0-9])
    let cast;
    if (UUID_RE.test(p))  cast = '::uuid';
    else if (BOOL_RE.test(p))  cast = '::boolean';
    else if (INT_RE.test(p))   cast = '::int';
    else if (FLOAT_RE.test(p)) cast = '::numeric';
    else if (JSON_RE.test(p))  cast = '::jsonb';
    else return;
    out = out.replace(re, '$' + n + cast);
  });
  return out;
}

async function supabaseQuery(text, params) {
  params = params || [];
  const strParams = params.map(p => (p === null || p === undefined) ? null : String(p));
  const castText  = castParams(text, strParams);
  const upper     = castText.trim().toUpperCase();
  const isSelect  = upper.startsWith('SELECT') || upper.includes('RETURNING');

  if (isSelect) {
    const { data, error } = await supabase.rpc('exec_sql', { query: castText, params: strParams });
    if (error) {
      console.error('exec_sql error:', error.message, '| Query:', castText.substring(0, 120));
      throw new Error(error.message);
    }
    const rows = data || [];
    return { rows, rowCount: rows.length };
  } else {
    const { error } = await supabase.rpc('exec_sql_write', { query: castText, params: strParams });
    if (error) {
      console.error('exec_sql_write error:', error.message, '| Query:', castText.substring(0, 120));
      throw new Error(error.message);
    }
    return { rows: [], rowCount: 0 };
  }
}

const poolProxy = {
  query: supabaseQuery,
  connect: async () => ({ query: supabaseQuery, release: () => {} }),
  end: async () => {},
};

// Startup test
(async () => {
  try {
    const { error } = await supabase.from('users').select('id', { count: 'exact', head: true });
    if (error) throw new Error(error.message);
    console.log('✅ Supabase connected (HTTPS REST API)');
  } catch (err) {
    console.error('❌ Supabase connection failed:', err.message);
  }
})();

module.exports = poolProxy;
module.exports.supabase = supabase;
