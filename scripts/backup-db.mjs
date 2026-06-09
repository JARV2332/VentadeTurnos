/**
 * Exporta datos de Supabase a JSON (requiere SUPABASE_SERVICE_ROLE_KEY).
 *
 * Uso:
 *   1. Cree .env.local con REACT_APP_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
 *   2. npm run db:backup
 *
 * Salida: backups/YYYY-MM-DD_HH-mm-ss/*.json + manifest.json
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const cloudMode =
  process.env.BACKUP_TARGET === 'cloud' || process.argv.includes('--cloud');

if (!cloudMode) {
  dotenv.config({ path: path.join(root, '.env.local') });
}
dotenv.config({ path: path.join(root, '.env.production') });
dotenv.config({ path: path.join(root, '.env') });

const url = cloudMode
  ? process.env.REACT_APP_SUPABASE_URL_CLOUD ||
    process.env.REACT_APP_SUPABASE_URL ||
    process.env.SUPABASE_URL
  : process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = cloudMode
  ? process.env.SUPABASE_SERVICE_ROLE_KEY_CLOUD || process.env.SUPABASE_SERVICE_ROLE_KEY
  : process.env.SUPABASE_SERVICE_ROLE_KEY;

const TABLES = [
  'organizaciones',
  'roles_organizacion',
  'usuarios_app',
  'cortejos',
  'turnos',
  'mesas_vendedores',
  'cargadores_organizacion',
  'configuracion_correo',
  'configuracion_recibo',
  'correos_enviados',
  'compras',
  'brazos',
];

const PAGE = 1000;

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

async function fetchTable(admin, table) {
  const all = [];
  let from = 0;

  while (true) {
    const { data, error } = await admin.from(table).select('*').range(from, from + PAGE - 1);
    if (error) {
      if (error.code === '42P01') {
        console.warn(`  ⚠ Tabla omitida (no existe): ${table}`);
        return [];
      }
      throw new Error(`${table}: ${error.message}`);
    }
    if (!data?.length) break;
    all.push(...data);
    process.stdout.write(`\r  ${table}: ${all.length} filas…`);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  process.stdout.write(`\r  ${table}: ${all.length} filas\n`);
  return all;
}

if (!url || !serviceKey) {
  console.error(`
❌ Falta configuración para el backup${cloudMode ? ' de la nube' : ''}.

${cloudMode ? `Opción A — Vercel (recomendado):
  cmd /c "set BACKUP_TARGET=cloud && npx vercel env run -e production -- node scripts/backup-db.mjs --cloud"

Opción B — .env.local con clave de la nube:
  REACT_APP_SUPABASE_URL_CLOUD=https://kolhnoectddjgfowyvux.supabase.co
  SUPABASE_SERVICE_ROLE_KEY_CLOUD=sb_secret_...   ← Supabase → Settings → API → secret

  npm run db:backup:cloud
` : `Cree el archivo .env.local en la raíz del proyecto con:

REACT_APP_SUPABASE_URL=https://kolhnoectddjgfowyvux.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...   ← Settings → API → service_role (secreta)

Luego ejecute: npm run db:backup`}
`);
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const outDir = path.join(root, 'backups', stamp());
fs.mkdirSync(outDir, { recursive: true });

console.log(`\n📦 Backup Supabase → ${outDir}\n`);

const manifest = {
  exported_at: new Date().toISOString(),
  supabase_url: url,
  target: cloudMode ? 'cloud' : 'default',
  tables: {},
};

for (const table of TABLES) {
  try {
    const rows = await fetchTable(admin, table);
    const file = path.join(outDir, `${table}.json`);
    fs.writeFileSync(file, JSON.stringify(rows, null, 2), 'utf8');
    manifest.tables[table] = { rows: rows.length, file: `${table}.json` };
  } catch (e) {
    console.error(`\n❌ Error en ${table}:`, e.message);
    manifest.tables[table] = { error: e.message };
  }
}

fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

const total = Object.values(manifest.tables).reduce(
  (s, t) => s + (typeof t.rows === 'number' ? t.rows : 0),
  0
);

console.log(`\n✅ Listo: ${total} filas exportadas en ${outDir}\n`);
console.log('Guarde esa carpeta en OneDrive, disco externo, etc. No la suba a Git.\n');
