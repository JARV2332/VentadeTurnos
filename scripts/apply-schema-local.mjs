/**
 * Aplica todo el esquema SQL en Postgres local (Supabase Docker).
 *
 * Uso:
 *   npm run db:apply:local
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

const LOCAL_DATABASE_URL =
  process.env.LOCAL_DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

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
];

const client = new pg.Client({ connectionString: LOCAL_DATABASE_URL });

console.log(`\n🔧 Aplicando esquema en Postgres local\n`);

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
    console.log(` ERROR`);
    console.error(`\n❌ ${file}: ${e.message}\n`);
    await client.end();
    process.exit(1);
  }
}

await client.end();
console.log('\n✅ Esquema local aplicado.\n');
