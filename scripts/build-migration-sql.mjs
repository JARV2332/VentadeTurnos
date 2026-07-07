/**
 * Genera supabase/MIGRACION_COMPLETA.sql (un solo archivo para SQL Editor).
 *   node scripts/build-migration-sql.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const supabaseDir = path.join(root, 'supabase');

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

const parts = [
  '-- MIGRACION_COMPLETA.sql — generado automáticamente',
  `-- ${new Date().toISOString()}`,
  '-- Pegar en Supabase nuevo → SQL Editor → Run\n',
];

for (const file of SQL_FILES) {
  const p = path.join(supabaseDir, file);
  if (!fs.existsSync(p)) continue;
  parts.push(`\n-- ═══ ${file} ═══\n`);
  parts.push(fs.readFileSync(p, 'utf8'));
}

const out = path.join(supabaseDir, 'MIGRACION_COMPLETA.sql');
fs.writeFileSync(out, parts.join('\n'), 'utf8');
console.log(`✅ ${out} (${(fs.statSync(out).size / 1024).toFixed(1)} KB)`);
