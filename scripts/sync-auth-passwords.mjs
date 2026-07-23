/**
 * Copia hashes de contraseña auth.users del proyecto viejo al nuevo (mismos logins).
 * Requiere DATABASE_URL (viejo) y DATABASE_URL_NEW en .env.local.
 *
 *   npm run db:sync:auth-passwords
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const OLD_URL = process.env.DATABASE_URL_OLD || process.env.DATABASE_URL;
const NEW_URL = process.env.DATABASE_URL_NEW;

if (!OLD_URL || !NEW_URL) {
  console.error('❌ Falta DATABASE_URL y DATABASE_URL_NEW en .env.local');
  process.exit(1);
}

async function connect(url, label) {
  const client = new pg.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });
  await client.connect();
  console.log(`   ✓ Conectado ${label}`);
  return client;
}

console.log('\n🔐 Sincronizando contraseñas auth.users (viejo → nuevo)\n');

const oldDb = await connect(OLD_URL, 'origen');
const newDb = await connect(NEW_URL, 'destino');

const { rows: oldUsers } = await oldDb.query(`
  SELECT id, email, encrypted_password, email_confirmed_at, phone, phone_confirmed_at,
         raw_app_meta_data, raw_user_meta_data, aud, role
  FROM auth.users
  ORDER BY email
`);

console.log(`\n   Usuarios en origen: ${oldUsers.length}`);

let updated = 0;
let skipped = 0;

for (const u of oldUsers) {
  if (!u.encrypted_password) {
    console.warn(`   ⚠ ${u.email}: sin hash, omitido`);
    skipped += 1;
    continue;
  }

  const { rowCount } = await newDb.query(
    `
    UPDATE auth.users SET
      encrypted_password = $2,
      email_confirmed_at = COALESCE($3, email_confirmed_at),
      phone = COALESCE($4, phone),
      phone_confirmed_at = COALESCE($5, phone_confirmed_at),
      raw_app_meta_data = COALESCE($6, raw_app_meta_data),
      raw_user_meta_data = COALESCE($7, raw_user_meta_data),
      aud = COALESCE($8, aud),
      role = COALESCE($9, role),
      updated_at = now()
    WHERE id = $1
    `,
    [
      u.id,
      u.encrypted_password,
      u.email_confirmed_at,
      u.phone,
      u.phone_confirmed_at,
      u.raw_app_meta_data,
      u.raw_user_meta_data,
      u.aud,
      u.role,
    ]
  );

  if (rowCount > 0) {
    updated += 1;
    console.log(`   ✓ ${u.email}`);
  } else {
    skipped += 1;
    console.warn(`   ⚠ ${u.email}: no existe en destino`);
  }
}

// identities: asegurar provider email
const { rows: identities } = await oldDb.query(`
  SELECT id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  FROM auth.identities
  WHERE provider = 'email'
`);

for (const ident of identities) {
  const data = { ...ident.identity_data, email_verified: true };
  await newDb.query(
    `
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (provider, provider_id) DO UPDATE SET
      identity_data = EXCLUDED.identity_data,
      updated_at = EXCLUDED.updated_at
    `,
    [
      ident.id,
      ident.user_id,
      data,
      ident.provider,
      ident.provider_id,
      ident.last_sign_in_at,
      ident.created_at,
      ident.updated_at,
    ]
  );
}

console.log(`\n✅ ${updated} contraseñas copiadas, ${skipped} omitidos, ${identities.length} identities email\n`);

await oldDb.end();
await newDb.end();
