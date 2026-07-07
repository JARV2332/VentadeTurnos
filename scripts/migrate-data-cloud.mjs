/**
 * Copia datos del proyecto Supabase viejo al nuevo vía service role (REST).
 *
 * .env.local:
 *   REACT_APP_SUPABASE_URL=https://kolhnoectddjgfowyvux.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *   REACT_APP_SUPABASE_URL_NEW=https://dblphvmvusbgopcejbyh.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY_NEW=...
 *
 *   npm run db:migrate:cloud
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

dotenv.config({ path: path.join(root, '.env.local') });
dotenv.config({ path: path.join(root, '.env.production') });
dotenv.config({ path: path.join(root, '.env') });

const OLD_URL =
  process.env.REACT_APP_SUPABASE_URL_OLD ||
  process.env.REACT_APP_SUPABASE_URL ||
  'https://kolhnoectddjgfowyvux.supabase.co';
const OLD_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY_OLD || process.env.SUPABASE_SERVICE_ROLE_KEY;

const NEW_URL =
  process.env.REACT_APP_SUPABASE_URL_NEW || 'https://dblphvmvusbgopcejbyh.supabase.co';
const NEW_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY_NEW;

const PAGE = 500;

/** Orden respetando FKs (sin auth; usuarios_app requiere auth.users) */
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

async function fetchAll(source, table) {
  const all = [];
  let from = 0;
  while (true) {
    const { data, error } = await source.from(table).select('*').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table} read: ${error.message}`);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function insertBatch(dest, table, rows, chunkSize = 100) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await dest.from(table).upsert(chunk, { onConflict: 'id' });
    if (error) throw new Error(`${table} insert: ${error.message}`);
    inserted += chunk.length;
    process.stdout.write(`\r  ${table}: ${inserted}/${rows.length}`);
  }
  if (rows.length) process.stdout.write('\n');
  return inserted;
}

async function copyAuthUsers(oldDb, newDb) {
  const { data: users, error } = await oldDb.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`auth list: ${error.message}`);
  const list = users?.users || [];
  if (!list.length) {
    console.log('  auth.users: 0');
    return;
  }
  let ok = 0;
  for (const u of list) {
    const { error: createErr } = await newDb.auth.admin.createUser({
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
  console.log(`  auth.users: ${ok}/${list.length} (contraseñas reseteadas — usar recovery)`);
}

if (!OLD_KEY || !NEW_KEY) {
  console.error(`
❌ Faltan service role keys en .env.local:

SUPABASE_SERVICE_ROLE_KEY=...          (proyecto viejo)
SUPABASE_SERVICE_ROLE_KEY_NEW=...      (proyecto nuevo)

Settings → API → service_role en cada proyecto.
`);
  process.exit(1);
}

const source = admin(OLD_URL, OLD_KEY);
const dest = admin(NEW_URL, NEW_KEY);

console.log(`\n🚀 Migración de datos\n   Origen:  ${OLD_URL}\n   Destino: ${NEW_URL}\n`);

await copyAuthUsers(source, dest);

for (const table of TABLE_ORDER) {
  process.stdout.write(`  Leyendo ${table}…`);
  const rows = await fetchAll(source, table);
  process.stdout.write(`\r  ${table}: ${rows.length} filas\n`);
  if (!rows.length) continue;
  await insertBatch(dest, table, rows);
}

console.log('\n📊 Verificación destino:');
for (const table of ['organizaciones', 'brazos', 'compras', 'usuarios_app']) {
  const { count, error } = await dest.from(table).select('id', { count: 'exact', head: true });
  if (error) console.log(`   ${table}: error ${error.message}`);
  else console.log(`   ${table}: ${count ?? 0}`);
}

console.log('\n✅ Migración de datos completada.\n');
console.log('Siguiente: actualizar Vercel con URL/keys del proyecto nuevo y redeploy.\n');
