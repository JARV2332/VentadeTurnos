/**
 * Aplica migraciones de búsqueda rápida vía Supabase Management API (HTTPS).
 *
 * .env.local:
 *   SUPABASE_ACCESS_TOKEN=sbp_...
 *   SUPABASE_PROJECT_REF_NEW=emmkatautioefhmvxejg
 *
 *   npm run db:apply:buscar-boleta:management
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

dotenv.config({ path: path.join(root, '.env.local') });
dotenv.config({ path: path.join(root, '.env') });

const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF =
  process.env.SUPABASE_PROJECT_REF_NEW ||
  process.env.SUPABASE_PROJECT_REF ||
  'emmkatautioefhmvxejg';

const SQL_FILES = ['028_buscar_boleta_entrega.sql', '030_perf_buscar_boleta_entrega.sql'];

async function runQuery(sql) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 500)}`);
  }
  return body;
}

if (!ACCESS_TOKEN) {
  console.error(`
❌ Falta SUPABASE_ACCESS_TOKEN en .env.local

1. https://supabase.com/dashboard/account/tokens → Generate new token
2. Agrega a .env.local:
   SUPABASE_ACCESS_TOKEN=sbp_...
   SUPABASE_PROJECT_REF_NEW=${PROJECT_REF}
3. npm run db:apply:buscar-boleta:management

Alternativa: pega en Supabase → SQL Editor los archivos:
   supabase/028_buscar_boleta_entrega.sql
   supabase/030_perf_buscar_boleta_entrega.sql
`);
  process.exit(1);
}

console.log(`\n🔧 Búsqueda rápida de boleta (Management API)\n   Proyecto: ${PROJECT_REF}\n`);

for (const file of SQL_FILES) {
  const sqlPath = path.join(root, 'supabase', file);
  process.stdout.write(`  ${file}…`);
  const sql = fs.readFileSync(sqlPath, 'utf8');
  try {
    await runQuery(sql);
    console.log(' OK');
  } catch (e) {
    console.log(' ERROR');
    console.error(`\n❌ ${file}: ${e.message}\n`);
    process.exit(1);
  }
}

console.log('\n✅ RPC buscar_boleta_entrega optimizada. Búsqueda ~0.3–1 s.\n');
