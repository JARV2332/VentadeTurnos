/**
 * Restaura un backup JSON (scripts/backup-pg-full.mjs) en Postgres local.
 *
 * Uso:
 *   LOCAL_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run db:restore:local
 *   npm run db:restore:local -- backups/2026-06-08_16-57-31
 */
import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

dotenv.config({ path: path.join(root, '.env.local') });
dotenv.config({ path: path.join(root, '.env') });

const LOCAL_DATABASE_URL =
  process.env.LOCAL_DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const backupArg = process.argv[2];
const backupsRoot = path.join(root, 'backups');

function latestBackupDir() {
  if (!fs.existsSync(backupsRoot)) return null;
  const dirs = fs
    .readdirSync(backupsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(backupsRoot, d.name, 'manifest.json')))
    .map((d) => d.name)
    .sort()
    .reverse();
  return dirs[0] ? path.join(backupsRoot, dirs[0]) : null;
}

const backupDir = backupArg
  ? path.isAbsolute(backupArg)
    ? backupArg
    : path.join(root, backupArg)
  : latestBackupDir();

if (!backupDir || !fs.existsSync(path.join(backupDir, 'manifest.json'))) {
  console.error('❌ No se encontró carpeta de backup con manifest.json');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(path.join(backupDir, 'manifest.json'), 'utf8'));

/** Orden de inserción respetando FKs */
const RESTORE_ORDER = [
  'auth.users',
  'auth.identities',
  'public.organizaciones',
  'public.roles_organizacion',
  'public.cortejos',
  'public.turnos',
  'public.mesas_vendedores',
  'public.cargadores_organizacion',
  'public.configuracion_correo',
  'public.configuracion_recibo',
  'public.compras',
  'public.brazos',
  'public.correos_enviados',
  'public.usuarios_app',
];

function fileForTable(fullName) {
  const entry = manifest.tables?.[fullName];
  if (!entry?.file) return null;
  return path.join(backupDir, entry.file);
}

function quoteIdent(name) {
  return `"${name.replace(/"/g, '""')}"`;
}

function buildInsert(schema, table, row, colMetas) {
  const columns = colMetas.map((c) => c.column_name);
  const cols = columns.map(quoteIdent).join(', ');
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const values = colMetas.map((c) => normalizeValue(c, row[c.column_name]));
  return {
    text: `INSERT INTO ${quoteIdent(schema)}.${quoteIdent(table)} (${cols}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
    values,
  };
}

async function getInsertableColumns(schema, table) {
  const { rows } = await client.query(
    `
    SELECT column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2
      AND (is_generated = 'NEVER' OR is_generated IS NULL)
      AND generation_expression IS NULL
    ORDER BY ordinal_position
  `,
    [schema, table]
  );
  return rows;
}

const columnCache = new Map();

async function columnsFor(schema, table) {
  const key = `${schema}.${table}`;
  if (!columnCache.has(key)) {
    columnCache.set(key, await getInsertableColumns(schema, table));
  }
  return columnCache.get(key);
}

function normalizeValue(colMeta, value) {
  if (value === null || value === undefined) return null;
  const t = colMeta.data_type;
  const udt = colMeta.udt_name;
  if (t === 'json' || t === 'jsonb' || udt === 'json' || udt === 'jsonb') {
    return typeof value === 'string' ? value : JSON.stringify(value);
  }
  return value;
}

const client = new pg.Client({ connectionString: LOCAL_DATABASE_URL });

console.log(`\n♻️  Restaurando backup → ${backupDir}\n`);
console.log(`   Destino: ${LOCAL_DATABASE_URL.replace(/:[^:@]+@/, ':****@')}\n`);

await client.connect();

// Limpieza previa para re-ejecuciones idempotentes
await client.query(`SET session_replication_role = 'replica'`);
await client.query(`
  TRUNCATE TABLE
    public.brazos,
    public.compras,
    public.correos_enviados,
    public.usuarios_app,
    public.mesas_vendedores,
    public.cargadores_organizacion,
    public.configuracion_recibo,
    public.configuracion_correo,
    public.turnos,
    public.cortejos,
    public.roles_organizacion,
    public.organizaciones
  RESTART IDENTITY CASCADE
`);
await client.query(`DELETE FROM auth.identities`);
await client.query(`DELETE FROM auth.users`);

await client.query(`SET session_replication_role = 'replica'`);

for (const fullName of RESTORE_ORDER) {
  const file = fileForTable(fullName);
  if (!file || !fs.existsSync(file)) {
    console.log(`  ⊘ ${fullName} (sin archivo)`);
    continue;
  }

  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!rows.length) {
    console.log(`  ○ ${fullName}: 0 filas`);
    continue;
  }

  const [schema, table] = fullName.split('.');
  const colMetas = (await columnsFor(schema, table)).filter((c) => c.column_name in (rows[0] || {}));
  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    const activeCols = colMetas.filter((c) => c.column_name in row);
    const { text, values } = buildInsert(schema, table, row, activeCols);
    try {
      const res = await client.query(text, values);
      if (res.rowCount > 0) inserted += 1;
      else skipped += 1;
    } catch (e) {
      console.error(`\n❌ ${fullName} fila id=${row.id ?? '?'}: ${e.message}`);
      throw e;
    }
  }

  console.log(`  ✓ ${fullName}: ${inserted} insertadas${skipped ? `, ${skipped} omitidas` : ''}`);
}

await client.query(`SET session_replication_role = 'origin'`);

// Verificación rápida
const checks = [
  'public.organizaciones',
  'public.cortejos',
  'public.brazos',
  'public.compras',
  'auth.users',
];
console.log('\n📊 Verificación:');
for (const t of checks) {
  const [s, n] = t.split('.');
  const r = await client.query(`SELECT COUNT(*)::int AS c FROM ${quoteIdent(s)}.${quoteIdent(n)}`);
  console.log(`   ${t}: ${r.rows[0].c}`);
}

await client.end();

console.log('\n✅ Restauración local completada.\n');
