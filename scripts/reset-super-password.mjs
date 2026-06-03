/** Resetea contraseña del super admin */
import { createClient } from '@supabase/supabase-js';

const url = process.env.REACT_APP_SUPABASE_URL || 'https://kolhnoectddjgfowyvux.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = 'super@ventadeturnos.com';
const newPassword = process.env.SUPER_ADMIN_PASSWORD || 'VentaTurnos2026';

if (!serviceKey) {
  console.error('Falta SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
const user = list?.users?.find((u) => u.email === email);
if (!user) {
  console.error('Usuario no encontrado:', email);
  process.exit(1);
}

const { error } = await admin.auth.admin.updateUserById(user.id, {
  password: newPassword,
  email_confirm: true,
});

if (error) throw error;
console.log(`Contraseña actualizada para ${email} → ${newPassword}`);
