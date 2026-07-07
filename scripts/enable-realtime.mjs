/**
 * Verifica y activa Realtime (supabase_realtime) para brazos y turnos.
 * npm run db:realtime:enable
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const DATABASE_URL = process.env.DATABASE_URL_NEW;
const TABLES = ['public.brazos', 'public.turnos'];

if (!DATABASE_URL) {
  console.error('❌ Falta DATABASE_URL_NEW en .env.local');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();

const { rows: current } = await client.query(`
  SELECT schemaname || '.' || tablename AS full_name
  FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime'
  ORDER BY tablename
`);

console.log('\n📡 Realtime (supabase_realtime) actual:\n');
if (!current.length) console.log('  (ninguna tabla)');
else current.forEach((r) => console.log('  ✓', r.full_name));

for (const table of TABLES) {
  const exists = current.some((r) => r.full_name === table);
  if (exists) {
    console.log(`\n  ${table} ya estaba activo`);
    continue;
  }
  try {
    await client.query(`ALTER PUBLICATION supabase_realtime ADD TABLE ${table}`);
    console.log(`\n  ✅ Activado: ${table}`);
  } catch (e) {
    if (/duplicate|already/i.test(e.message)) {
      console.log(`\n  ${table} ya estaba activo`);
    } else {
      throw e;
    }
  }
}

const { rows: after } = await client.query(`
  SELECT schemaname || '.' || tablename AS full_name
  FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime'
  ORDER BY tablename
`);

console.log('\n📡 Realtime final:\n');
after.forEach((r) => console.log('  ✓', r.full_name));
console.log('');

await client.end();
