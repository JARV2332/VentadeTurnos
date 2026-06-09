/**
 * Respaldo completo de Supabase vía conexión PostgreSQL directa.
 *
 * Exporta todas las tablas de public, auth y storage a JSON + schema.sql
 *
 * Uso:
 *   DATABASE_URL=postgresql://postgres:PASSWORD@db.xxx.supabase.co:5432/postgres npm run db:backup:full
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
const SCHEMAS = ['public', 'auth', 'storage'];

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

function safeName(schema, table) {
  return `${schema}__${table}`;
}

if (!DATABASE_URL) {
  console.error(`
❌ Falta DATABASE_URL en .env.local

DATABASE_URL=postgresql://postgres:PASSWORD@db.kolhnoectddjgfowyvux.supabase.co:5432/postgres
`);
  process.exit(1);
}

const client = new pg.Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const outDir = path.join(root, 'backups', stamp());
fs.mkdirSync(outDir, { recursive: true });

console.log(`\n📦 Backup PostgreSQL completo → ${outDir}\n`);

await client.connect();

const { rows: tables } = await client.query(`
  SELECT schemaname, tablename
  FROM pg_tables
  WHERE schemaname = ANY($1::text[])
  ORDER BY schemaname, tablename
`, [SCHEMAS]);

const manifest = {
  exported_at: new Date().toISOString(),
  method: 'postgresql-direct',
  schemas: SCHEMAS,
  tables: {},
};

for (const { schemaname, tablename } of tables) {
  const fullName = `${schemaname}.${tablename}`;
  const fileName = `${safeName(schemaname, tablename)}.json`;
  process.stdout.write(`  ${fullName}…`);

  try {
    const { rows } = await client.query(`SELECT * FROM ${schemaname}.${tablename}`);
    fs.writeFileSync(path.join(outDir, fileName), JSON.stringify(rows, null, 2), 'utf8');
    manifest.tables[fullName] = { rows: rows.length, file: fileName };
    process.stdout.write(` ${rows.length} filas\n`);
  } catch (e) {
    manifest.tables[fullName] = { error: e.message };
    process.stdout.write(` ERROR: ${e.message}\n`);
  }
}

// DDL de tablas (estructura)
const { rows: ddlRows } = await client.query(`
  SELECT schemaname, tablename
  FROM pg_tables
  WHERE schemaname = ANY($1::text[])
  ORDER BY schemaname, tablename
`, [SCHEMAS]);

const schemaLines = [
  '-- Respaldo de estructura (columnas) generado automáticamente',
  `-- Fecha: ${new Date().toISOString()}`,
  '',
];

for (const { schemaname, tablename } of ddlRows) {
  const { rows: cols } = await client.query(
    `
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2
    ORDER BY ordinal_position
  `,
    [schemaname, tablename]
  );
  schemaLines.push(`-- ${schemaname}.${tablename}`);
  for (const col of cols) {
    schemaLines.push(
      `--   ${col.column_name} ${col.data_type}${col.is_nullable === 'NO' ? ' NOT NULL' : ''}${col.column_default ? ` DEFAULT ${col.column_default}` : ''}`
    );
  }
  schemaLines.push('');
}

fs.writeFileSync(path.join(outDir, 'schema-columns.txt'), schemaLines.join('\n'), 'utf8');

fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

const total = Object.values(manifest.tables).reduce(
  (s, t) => s + (typeof t.rows === 'number' ? t.rows : 0),
  0
);

await client.end();

console.log(`\n✅ Listo: ${tables.length} tablas, ${total} filas`);
console.log(`   Carpeta: ${outDir}`);
console.log('\nGuarde esa carpeta fuera del repo. No la suba a Git.\n');
