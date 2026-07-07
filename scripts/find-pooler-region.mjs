/**
 * Encuentra región pooler correcta para un project_ref.
 * node scripts/find-pooler-region.mjs dblphvmvusbgopcejbyh VentadeTurnos
 */
import pg from 'pg';

const ref = process.argv[2] || 'dblphvmvusbgopcejbyh';
const pass = process.argv[3] || 'VentadeTurnos';
const enc = encodeURIComponent(pass);

const regions = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'ca-central-1',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'eu-central-1',
  'eu-central-2',
  'eu-north-1',
  'ap-south-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
  'ap-northeast-2',
  'sa-east-1',
];

async function tryRegion(region) {
  const host = `aws-0-${region}.pooler.supabase.com`;
  const url = `postgresql://postgres.${ref}:${enc}@${host}:5432/postgres?sslmode=require`;
  const client = new pg.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 6000,
  });
  try {
    await client.connect();
    const r = await client.query('select current_setting($1) as v', ['server_version']);
    await client.end();
    return { region, ok: true, version: r.rows[0].v };
  } catch (e) {
    try {
      await client.end();
    } catch (_) {}
    const msg = e.message.split('\n')[0];
    return { region, ok: false, err: `${e.code || ''} ${msg}`.trim() };
  }
}

console.log(`\nBuscando pooler para ${ref}\n`);
for (const region of regions) {
  const r = await tryRegion(region);
  if (r.ok) {
    console.log(`✅ ${region} → Postgres ${r.version}`);
    console.log(`\nDATABASE_URL_NEW=postgresql://postgres.${ref}:${enc}@aws-0-${region}.pooler.supabase.com:5432/postgres\n`);
    process.exit(0);
  }
  console.log(`❌ ${region}: ${r.err}`);
}
console.log('\nNo se encontró región pooler.\n');
process.exit(1);
