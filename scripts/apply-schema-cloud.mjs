/**
 * Aplica todo el esquema SQL en un proyecto Supabase cloud (Postgres directo).
 *
 * Uso (.env.local):
 *   DATABASE_URL_NEW=postgresql://postgres:PASSWORD@db.REF.supabase.co:5432/postgres
 *   npm run db:apply:cloud
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

const DATABASE_URL =
  process.env.DATABASE_URL_NEW ||
  process.env.CLOUD_DATABASE_URL ||
  process.env.DATABASE_URL;

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
  '021_perf_taquilla_impresion.sql',
  '022_brazos_cortejo_rpc.sql',
  '023_taquilla_perf.sql',
  '024_taquilla_rpc_definer.sql',
  '025_finanzas_perf.sql',
  '026_entrega_tercero.sql',
  '027_revertir_entrega.sql',
  '028_buscar_boleta_entrega.sql',
  '029_revertir_entrega_brazos.sql',
  '030_perf_buscar_boleta_entrega.sql',
];

if (!DATABASE_URL || DATABASE_URL.includes('[YOUR-PASSWORD]')) {
  console.error(`
❌ Falta DATABASE_URL_NEW en .env.local

DATABASE_URL_NEW=postgresql://postgres:PASSWORD@db.dblphvmvusbgopcejbyh.supabase.co:5432/postgres
`);
  process.exit(1);
}

const client = new pg.Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

console.log(`\n🔧 Aplicando esquema en Supabase cloud\n`);
console.log(`   ${DATABASE_URL.replace(/:[^:@]+@/, ':****@')}\n`);

await client.connect();

for (const file of SQL_FILES) {
  const sqlPath = path.join(root, 'supabase', file);
  if (!fs.existsSync(sqlPath)) {
    console.warn(`  ⚠ Omitido (no existe): ${file}`);
    continue;
  }
  process.stdout.write(`  ${file}…`);
  const sql = fs.readFileSync(sqlPath, 'utf8');
  try {
    await client.query(sql);
    console.log(' OK');
  } catch (e) {
    console.log(' ERROR');
    console.error(`\n❌ ${file}: ${e.message}\n`);
    await client.end();
    process.exit(1);
  }
}

await client.end();
console.log('\n✅ Esquema cloud aplicado.\n');
