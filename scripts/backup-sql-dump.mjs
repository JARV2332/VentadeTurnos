/**
 * Genera un .sql portable (CREATE + INSERT) para restaurar con un solo "play".
 *
 * Uso:
 *   npm run db:backup:sql
 *
 * Salida: backups/YYYY-MM-DD_HH-mm-ss/ventadeturnos-completo.sql
 *
 * Compatible con Postgres / Supabase (esquema public de la app).
 * No incluye auth.users de Supabase Auth (eso va aparte); sí incluye usuarios_app.
 */
import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

dotenv.config({ path: path.join(root, '.env.local') });
dotenv.config({ path: path.join(root, '.env.production') });
dotenv.config({ path: path.join(root, '.env') });

const DATABASE_URL = process.env.DATABASE_URL;

/** Orden por dependencias FK (padres primero). */
const APP_TABLES = [
  'organizaciones',
  'roles_organizacion',
  'usuarios_app',
  'cortejos',
  'turnos',
  'mesas_vendedores',
  'cargadores_organizacion',
  'compras',
  'brazos',
  'configuracion_correo',
  'configuracion_recibo',
  'correos_enviados',
];

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function sqlLiteral(value, dataType) {
  if (value === null || value === undefined) return 'NULL';

  const t = String(dataType || '').toLowerCase();

  if (typeof value === 'boolean' || t === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (value instanceof Date) {
    return `'${value.toISOString().replace(/'/g, "''")}'`;
  }

  if (Buffer.isBuffer(value)) {
    return `'\\x${value.toString('hex')}'`;
  }

  if (Array.isArray(value)) {
    // arrays PG a menudo vienen como JS array
    if (t.includes('json')) {
      return `${sqlString(JSON.stringify(value))}::jsonb`;
    }
    const inner = value
      .map((v) => (v == null ? 'NULL' : sqlString(String(v))))
      .join(',');
    return `ARRAY[${inner}]`;
  }

  if (typeof value === 'object') {
    return `${sqlString(JSON.stringify(value))}::jsonb`;
  }

  const s = String(value);
  if (t.includes('json')) {
    return `${sqlString(s)}::jsonb`;
  }
  if (t === 'uuid') {
    return `${sqlString(s)}::uuid`;
  }
  if (t.includes('timestamp') || t === 'date' || t.includes('time')) {
    return sqlString(s);
  }
  if (t.includes('numeric') || t.includes('double') || t.includes('real') || t.includes('int')) {
    if (s !== '' && !Number.isNaN(Number(s))) return String(Number(s));
  }

  return sqlString(s);
}

function sqlString(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

function mapDataType(col) {
  const t = col.data_type;
  const udt = col.udt_name;
  if (t === 'USER-DEFINED' && udt) return udt;
  if (t === 'ARRAY' && udt?.startsWith('_')) return `${udt.slice(1)}[]`;
  if (t === 'character varying') {
    return col.character_maximum_length
      ? `varchar(${col.character_maximum_length})`
      : 'text';
  }
  if (t === 'numeric' && col.numeric_precision) {
    return col.numeric_scale != null
      ? `numeric(${col.numeric_precision},${col.numeric_scale})`
      : `numeric(${col.numeric_precision})`;
  }
  if (t === 'timestamp with time zone') return 'timestamptz';
  if (t === 'timestamp without time zone') return 'timestamp';
  if (t === 'time with time zone') return 'timetz';
  return t;
}

if (!DATABASE_URL) {
  console.error(`
❌ Falta DATABASE_URL en .env.local

DATABASE_URL=postgresql://postgres:PASSWORD@db.xxx.supabase.co:5432/postgres
`);
  process.exit(1);
}

const client = new pg.Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const outDir = path.join(root, 'backups', stamp());
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'ventadeturnos-completo.sql');

console.log(`\n📦 Generando SQL portable → ${outFile}\n`);

await client.connect();

const lines = [];
lines.push('-- ============================================================');
lines.push('-- Venta de Turnos — respaldo SQL portable');
lines.push(`-- Generado: ${new Date().toISOString()}`);
lines.push('-- Uso: ejecutar este archivo completo en Postgres / Supabase SQL Editor');
lines.push('--      (o: psql "$DATABASE_URL" -f ventadeturnos-completo.sql)');
lines.push('-- ============================================================');
lines.push('');
lines.push('BEGIN;');
lines.push('');
lines.push('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');
lines.push('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
lines.push('');

const summary = {};
const createBlocks = [];
const dataBlocks = [];
const existingTables = [];

for (const table of APP_TABLES) {
  process.stdout.write(`  public.${table}…`);

  const { rows: exists } = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );
  if (!exists.length) {
    process.stdout.write(' (no existe, omitida)\n');
    summary[table] = { skipped: true };
    continue;
  }

  const { rows: cols } = await client.query(
    `
    SELECT column_name, data_type, udt_name, is_nullable, column_default,
           character_maximum_length, numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
    `,
    [table]
  );

  if (!cols.length) {
    process.stdout.write(' (sin columnas)\n');
    continue;
  }

  existingTables.push(table);

  const colDefs = cols.map((c) => {
    const typ = mapDataType(c);
    const nullSql = c.is_nullable === 'NO' ? ' NOT NULL' : '';
    let defSql = '';
    if (
      c.column_default &&
      !String(c.column_default).includes('nextval') &&
      !String(c.column_default).includes('auth.')
    ) {
      defSql = ` DEFAULT ${c.column_default}`;
    }
    return `  ${quoteIdent(c.column_name)} ${typ}${nullSql}${defSql}`;
  });

  createBlocks.push(`-- ---------- ${table} ----------`);
  createBlocks.push(`CREATE TABLE IF NOT EXISTS ${quoteIdent(table)} (`);
  createBlocks.push(colDefs.join(',\n'));
  createBlocks.push(');');
  createBlocks.push('');

  const colNames = cols.map((c) => c.column_name);
  const { rows } = await client.query(
    `SELECT * FROM ${quoteIdent('public')}.${quoteIdent(table)}`
  );

  if (!rows.length) {
    dataBlocks.push(`-- ${table}: sin datos`);
    dataBlocks.push('');
    process.stdout.write(' 0 filas\n');
    summary[table] = { rows: 0 };
    continue;
  }

  const colList = colNames.map(quoteIdent).join(', ');
  const BATCH = 100;
  dataBlocks.push(`-- ${table}: ${rows.length} filas`);
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const values = chunk.map((row) => {
      const parts = colNames.map((name, idx) =>
        sqlLiteral(row[name], cols[idx].data_type)
      );
      return `(${parts.join(', ')})`;
    });
    dataBlocks.push(
      `INSERT INTO ${quoteIdent(table)} (${colList}) VALUES\n${values.join(',\n')};`
    );
    dataBlocks.push('');
  }

  process.stdout.write(` ${rows.length} filas\n`);
  summary[table] = { rows: rows.length };
}

lines.push(...createBlocks);
lines.push('');
if (existingTables.length) {
  lines.push('-- Vaciar tablas antes de insertar (idempotente al re-ejecutar)');
  lines.push(
    `TRUNCATE TABLE ${existingTables.map(quoteIdent).join(', ')} RESTART IDENTITY CASCADE;`
  );
  lines.push('');
}
lines.push(...dataBlocks);
lines.push('COMMIT;');
lines.push('');
lines.push('-- Fin del respaldo. Si faltan índices/FKs, aplique también supabase/*.sql');
lines.push('');

fs.writeFileSync(outFile, lines.join('\n'), 'utf8');
fs.writeFileSync(
  path.join(outDir, 'manifest-sql.json'),
  JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      method: 'sql-portable',
      file: 'ventadeturnos-completo.sql',
      tables: summary,
    },
    null,
    2
  ),
  'utf8'
);

await client.end();

const total = Object.values(summary).reduce(
  (s, t) => s + (typeof t.rows === 'number' ? t.rows : 0),
  0
);
const sizeMb = (fs.statSync(outFile).size / (1024 * 1024)).toFixed(2);

console.log(`\n✅ SQL listo: ${total} filas · ${sizeMb} MB`);
console.log(`   ${outFile}`);
console.log(`
Cómo restaurar:
  1) Supabase → SQL Editor → pegar el archivo → Run
  2) O: psql "SU_DATABASE_URL" -f "${outFile}"

Guarde una copia fuera del repo (USB/Drive). No lo suba a Git.
`);
