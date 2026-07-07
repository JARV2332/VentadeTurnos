/**
 * Aplica esquema en Supabase cloud vía Management API (HTTPS, sin Postgres directo).
 *
 * Requiere Personal Access Token:
 *   https://supabase.com/dashboard/account/tokens
 *
 * .env.local:
 *   SUPABASE_ACCESS_TOKEN=sbp_...
 *   SUPABASE_PROJECT_REF_NEW=dblphvmvusbgopcejbyh
 *
 *   npm run db:apply:management
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
  'dblphvmvusbgopcejbyh';

const SQL_FILES = [
  'APLICAR_TODO.sql',
  '007_super_admin.sql',
  '008_super_manual.sql',
  '009_configuracion_recibo.sql',
  '010_correo_gmail_por_org.sql',
  '011_rpc_taquilla.sql',
  '012_fix_confirmar_venta_gen_random.sql',
  '013_devoto_cui_unique.sql',
  '014_compras_multi_turno.sql',
  '015_leyenda_correo.sql',
  '016_correo_entrega.sql',
  '017_operador_venta.sql',
  '018_anular_venta.sql',
  '019_horario_turno.sql',
  '020_devoto_whatsapp_no_unique.sql',
];

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
   SUPABASE_PROJECT_REF_NEW=dblphvmvusbgopcejbyh
3. npm run db:apply:management
`);
  process.exit(1);
}

console.log(`\n🔧 Aplicando esquema vía Management API\n   Proyecto: ${PROJECT_REF}\n`);

for (const file of SQL_FILES) {
  const sqlPath = path.join(root, 'supabase', file);
  if (!fs.existsSync(sqlPath)) {
    console.warn(`  ⚠ Omitido (no existe): ${file}`);
    continue;
  }
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

console.log('\n✅ Esquema aplicado vía Management API.\n');
