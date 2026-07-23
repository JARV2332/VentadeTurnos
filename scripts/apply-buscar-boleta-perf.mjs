/**
 * Aplica solo las migraciones de búsqueda rápida de boleta (028 + 030).
 *
 * Uso: npm run db:apply:buscar-boleta
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

dotenv.config({ path: path.join(root, '.env.local') });
dotenv.config({ path: path.join(root, '.env') });

const baseUrl = process.env.DATABASE_URL_NEW || process.env.DATABASE_URL;
if (!baseUrl || baseUrl.includes('[YOUR-PASSWORD]')) {
  console.error('❌ Falta DATABASE_URL_NEW en .env.local');
  process.exit(1);
}

const SQL_FILES = ['028_buscar_boleta_entrega.sql', '030_perf_buscar_boleta_entrega.sql'];

function buildCandidates(url) {
  const out = new Set([url.split('?')[0]]);
  const m = url.match(/postgres(?:\.([a-z0-9]+))?:([^@]+)@([^:/]+):(\d+)\/(.+)/i);
  if (!m) return [...out];

  const [, ref = 'postgres', pass, host, port, db] = m;
  const projectRef = ref === 'postgres' ? null : ref;
  const encPass = encodeURIComponent(decodeURIComponent(pass));

  if (projectRef) {
    for (const p of [5432, 6543]) {
      out.add(`postgresql://postgres.${projectRef}:${encPass}@aws-1-us-west-2.pooler.supabase.com:${p}/${db}`);
    }
    out.add(`postgresql://postgres.${projectRef}:${encPass}@db.${projectRef}.supabase.co:5432/${db}`);
  } else if (host.includes('pooler.supabase.com') && projectRef === null) {
    const refFromUser = url.match(/postgres\.([a-z0-9]+):/i)?.[1];
    if (refFromUser) {
      out.add(`postgresql://postgres.${refFromUser}:${encPass}@db.${refFromUser}.supabase.co:5432/${db}`);
    }
  }

  if (port === '5432') {
    out.add(url.replace(':5432/', ':6543/').split('?')[0]);
  }

  return [...out];
}

async function connectAny(candidates) {
  const log = [];
  for (const url of candidates) {
    const client = new pg.Client({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 45000,
    });
    try {
      await client.connect();
      log.push(`✓ ${url.replace(/:[^:@]+@/, ':****@')}`);
      return { client, log };
    } catch (e) {
      log.push(`✗ ${url.split('@')[1]?.split('?')[0]} — ${e.code || e.message}`);
      try {
        await client.end();
      } catch (_) {}
    }
  }
  return { client: null, log };
}

console.log('\n🔧 Aplicando búsqueda rápida de boleta (028 + 030)\n');

const { client, log: connectLog } = await connectAny(buildCandidates(baseUrl));
connectLog.forEach((l) => console.log(`  ${l}`));

if (!client) {
  console.error('\n❌ No se pudo conectar a Postgres. Aplica manualmente en Supabase → SQL Editor:');
  console.error('   supabase/028_buscar_boleta_entrega.sql');
  console.error('   supabase/030_perf_buscar_boleta_entrega.sql\n');
  process.exit(1);
}

try {
  for (const file of SQL_FILES) {
    const sqlPath = path.join(root, 'supabase', file);
    process.stdout.write(`  ${file}…`);
    await client.query(fs.readFileSync(sqlPath, 'utf8'));
    console.log(' OK');
  }
  console.log('\n✅ Migraciones aplicadas. La búsqueda debería bajar a ~0.3–1 s.\n');
} catch (e) {
  console.error(`\n❌ Error: ${e.message}\n`);
  process.exit(1);
} finally {
  await client.end();
}
