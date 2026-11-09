// Unit tests for the SQL literal inlining used by the Supabase HTTPS transport.
process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY ||= 'test-key';
process.env.JWT_SECRET ||= 'test-secret';

const test = require('node:test');
const assert = require('node:assert');
const { _internals: { inlineParams } } = require('../src/db/pool');

test('quotes strings and doubles single quotes', () => {
  assert.strictEqual(inlineParams('SELECT $1', ["it's"]), "SELECT 'it''s'");
});

test('values containing $N are not re-substituted (single pass)', () => {
  const sql = inlineParams('INSERT INTO t VALUES ($1, $2)', ['costs $2 today', 'x']);
  assert.strictEqual(sql, "INSERT INTO t VALUES ('costs $2 today', 'x')");
});

test('supports more than 10 parameters', () => {
  const params = Array.from({ length: 12 }, (_, i) => `v${i + 1}`);
  const sql = inlineParams('SELECT $1, $10, $11, $12', params);
  assert.strictEqual(sql, "SELECT 'v1', 'v10', 'v11', 'v12'");
});

test('null, booleans, numbers, arrays, objects', () => {
  const sql = inlineParams('$1 $2 $3 $4 $5', [null, true, 42, ['a', 'b"c'], { k: "v'" }]);
  // The array element contains a quote → escaped with a backslash → E-string.
  assert.strictEqual(sql, `NULL true '42'  E'{"a","b\\\\"c"}' '{"k":"v''"}'`);
});

test('backslashes use E-strings', () => {
  assert.ok(inlineParams('SELECT $1', ['a\\b']).endsWith("E'a\\\\b'"));
});

test('injection attempt stays inside the literal', () => {
  const sql = inlineParams('SELECT * FROM users WHERE email = $1', ["x' OR '1'='1"]);
  assert.strictEqual(sql, "SELECT * FROM users WHERE email = 'x'' OR ''1''=''1'");
});

test('throws on missing parameter', () => {
  assert.throws(() => inlineParams('SELECT $2', ['only-one']));
});
