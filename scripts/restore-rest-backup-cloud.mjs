/**
 * Restaura backup REST (backup-db.mjs) en proyecto Supabase NUEVO vía service role.
 * No requiere Postgres directo — solo HTTPS.
 *
 * .env.local: REACT_APP_SUPABASE_URL_NEW, SUPABASE_SERVICE_ROLE_KEY_NEW
 *
 *   npm run db:restore:rest
 *   npm run db:restore:rest -- backups/2026-07-07_09-48-12
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

dotenv.config({ path: path.join(root, '.env.local') });
dotenv.config({ path: path.join(root, '.env') });

const NEW_URL =
  process.env.REACT_APP_SUPABASE_URL_NEW || 'https://dblphvmvusbgopcejbyh.supabase.co';
const NEW_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY_NEW;
const OLD_URL =
  process.env.REACT_APP_SUPABASE_URL_OLD ||
  process.env.REACT_APP_SUPABASE_URL ||
  'https://kolhnoectddjgfowyvux.supabase.co';
const OLD_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY_OLD || process.env.SUPABASE_SERVICE_ROLE_KEY;

const TABLE_ORDER = [
  'organizaciones',
  'roles_organizacion',
  'cortejos',
  'turnos',
  'mesas_vendedores',
  'cargadores_organizacion',
  'configuracion_correo',
  'configuracion_recibo',
  'compras',
  'brazos',
  'correos_enviados',
  'usuarios_app',
];

function admin(url, key) {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function latestBackupDir() {
  const backupsRoot = path.join(root, 'backups');
  if (!fs.existsSync(backupsRoot)) return null;
  const dirs = fs
    .readdirSync(backupsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(backupsRoot, d.name, 'manifest.json')))
    .map((d) => d.name)
    .sort()
    .reverse();
  return dirs[0] ? path.join(backupsRoot, dirs[0]) : null;
}

async function copyAuthUsers(source, dest) {
  const { data: users, error } = await source.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`auth list: ${error.message}`);
  const list = users?.users || [];
  if (!list.length) {
    console.log('  auth.users: 0');
    return;
  }
  let ok = 0;
  for (const u of list) {
    const { error: createErr } = await dest.auth.admin.createUser({
      id: u.id,
      email: u.email,
      phone: u.phone,
      email_confirm: true,
      user_metadata: u.user_metadata || {},
      app_metadata: u.app_metadata || {},
      password: crypto.randomUUID() + 'Aa1!',
    });
    if (createErr && !/already|exists|duplicate/i.test(createErr.message)) {
      console.warn(`  ⚠ auth ${u.email}: ${createErr.message}`);
    } else {
      ok += 1;
    }
  }
  console.log(`  auth.users: ${ok}/${list.length} (contraseñas reseteadas — recovery)`);
}

async function insertBatch(dest, table, rows, chunkSize = 100) {
  let inserted = 0;
  const onConflict = table === 'usuarios_app' ? 'auth_user_id' : 'id';
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await dest.from(table).upsert(chunk, { onConflict });
    if (error) throw new Error(`${table} insert: ${error.message}`);
    inserted += chunk.length;
    process.stdout.write(`\r  ${table}: ${inserted}/${rows.length}`);
  }
  if (rows.length) process.stdout.write('\n');
  return inserted;
}

const backupArg = process.argv[2];
const backupDir = backupArg
  ? path.isAbsolute(backupArg)
    ? backupArg
    : path.join(root, backupArg)
  : latestBackupDir();

if (!NEW_KEY) {
  console.error('❌ Falta SUPABASE_SERVICE_ROLE_KEY_NEW en .env.local');
  process.exit(1);
}

if (!backupDir || !fs.existsSync(path.join(backupDir, 'manifest.json'))) {
  console.error('❌ No se encontró backup con manifest.json');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(path.join(backupDir, 'manifest.json'), 'utf8'));
const dest = admin(NEW_URL, NEW_KEY);
const source = OLD_KEY ? admin(OLD_URL, OLD_KEY) : null;

console.log(`\n♻️  Restore REST → ${NEW_URL}`);
console.log(`   Backup: ${backupDir}\n`);

const { error: schemaErr } = await dest.from('organizaciones').select('id', { head: true, count: 'exact' });
if (schemaErr?.message?.includes('schema cache') || schemaErr?.code === '42P01') {
  console.error(`
❌ El proyecto nuevo no tiene tablas aún.

Aplica el esquema primero (elige una opción):
  A) npm run db:apply:management   (requiere SUPABASE_ACCESS_TOKEN en .env.local)
  B) SQL Editor → pegar supabase/MIGRACION_COMPLETA.sql → Run
  C) GitHub Actions → workflow migrate-supabase.yml (desde red con Postgres)

Luego: npm run db:restore:rest -- ${path.relative(root, backupDir).replace(/\\/g, '/')}
`);
  process.exit(1);
}

if (source) {
  await copyAuthUsers(source, dest);
}

for (const table of TABLE_ORDER) {
  const entry = manifest.tables?.[table];
  const file = entry?.file ? path.join(backupDir, entry.file) : null;
  if (!file || !fs.existsSync(file)) {
    console.log(`  ⊘ ${table} (sin archivo)`);
    continue;
  }
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!rows.length) {
    console.log(`  ○ ${table}: 0 filas`);
    continue;
  }
  console.log(`  ${table}: ${rows.length} filas`);
  await insertBatch(dest, table, rows);
}

console.log('\n📊 Verificación destino:');
for (const table of ['organizaciones', 'brazos', 'compras', 'usuarios_app']) {
  const { count, error } = await dest.from(table).select('id', { count: 'exact', head: true });
  if (error) console.log(`   ${table}: error ${error.message}`);
  else console.log(`   ${table}: ${count ?? 0}`);
}

console.log('\n✅ Restore REST completado.\n');
