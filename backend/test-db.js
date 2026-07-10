require('dotenv').config();
const { Pool } = require('pg');
const dns = require('dns');

const PASSWORD = 'AuraDesign2024';
const REF = 'bumjqmfftomwvczpevgu';
const IPV6 = '2406:da14:271:991f:b2f0:c634:d5ae:43d9';

const configs = [
  { label: 'IPv6 DIRECT 5432', user: 'postgres', host: IPV6, port: 5432 },
  { label: 'IPv6 DIRECT 6543', user: 'postgres', host: IPV6, port: 6543 },
  { label: 'Pooler SESSION mode 5432', user: `postgres.${REF}`, host: `aws-0-ap-northeast-1.pooler.supabase.com`, port: 5432 },
  { label: 'Project host 6543', user: `postgres.${REF}`, host: `${REF}.supabase.co`, port: 6543 },
];

(async () => {
  console.log('--- Checking IPv6 connectivity ---');
  const net = require('net');
  const ipv6test = new net.Socket();
  await new Promise(resolve => {
    ipv6test.setTimeout(4000);
    ipv6test.connect(5432, IPV6, () => {
      console.log('✅ IPv6 port 5432 REACHABLE');
      ipv6test.destroy();
      resolve();
    });
    ipv6test.on('error', (e) => { console.log('❌ IPv6 port 5432:', e.message); resolve(); });
    ipv6test.on('timeout', () => { console.log('❌ IPv6 port 5432: timeout'); ipv6test.destroy(); resolve(); });
  });

  console.log('\n--- Testing DB configs ---');
  for (const c of configs) {
    const pool = new Pool({
      user: c.user, password: PASSWORD, host: c.host,
      port: c.port, database: 'postgres',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 6000
    });
    try {
      const r = await pool.query('SELECT 1');
      console.log(`✅ WORKS: ${c.label}`);
      await pool.end();
      process.exit(0);
    } catch (e) {
      console.log(`❌ ${c.label}: ${e.message}`);
    }
    await pool.end().catch(() => { });
  }
  process.exit(1);
})();
