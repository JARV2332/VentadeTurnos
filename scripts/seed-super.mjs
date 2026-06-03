/**
 * Crea super administrador de plataforma.
 * Ejecutar después de 007_super_admin.sql
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

dotenv.config({ path: path.join(root, '.env.local') });
dotenv.config({ path: path.join(root, '.env') });

const url = process.env.REACT_APP_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SUPER_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'super@ventadeturnos.com';
const SUPER_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'VentaTurnos2026';

if (!url || !serviceKey) {
  console.error('Falta REACT_APP_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function ensureAuthUser(email, password, nombre) {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const found = list?.users?.find((u) => u.email === email);
  if (found) return found;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre },
  });
  if (error) throw error;
  return data.user;
}

console.log('Creando super administrador...');

const authUser = await ensureAuthUser(SUPER_EMAIL, SUPER_PASSWORD, 'Super Administrador');

const { data: exist } = await admin
  .from('usuarios_app')
  .select('id')
  .eq('email', SUPER_EMAIL)
  .maybeSingle();

if (!exist) {
  const { error } = await admin.from('usuarios_app').insert({
    auth_user_id: authUser.id,
    nombre: 'Super Administrador',
    email: SUPER_EMAIL,
    es_super_admin: true,
    organizacion_id: null,
    rol_id: null,
    activo: true,
  });
  if (error) throw error;
}

console.log(`
✅ Super admin listo.

URL: ${url.replace('.supabase.co', '')} → tu app en Vercel
Login:
  ${SUPER_EMAIL}
  ${SUPER_PASSWORD}

En la app irás a "Administración de plataforma" para crear asociaciones y entrar a cada una.
`);
