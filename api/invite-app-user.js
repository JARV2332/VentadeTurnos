/**
 * Crea usuario en Auth + usuarios_app (requiere SUPABASE_SERVICE_ROLE_KEY en Vercel).
 */
import { verifyCaller } from './_lib/verifyCaller.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { organizacionId, nombre, email, password, rol_id } = req.body || {};
  const emailNorm = String(email || '')
    .trim()
    .toLowerCase();

  const auth = await verifyCaller(req, organizacionId);
  if (auth.error) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const { admin } = auth;

  if (!emailNorm || !password || !rol_id) {
    return res.status(400).json({ error: 'Correo, contraseña y rol son obligatorios' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }
  const { data: rol } = await admin
    .from('roles_organizacion')
    .select('id')
    .eq('id', rol_id)
    .eq('organizacion_id', organizacionId)
    .maybeSingle();
  if (!rol) {
    return res.status(400).json({ error: 'Rol no válido' });
  }

  const { data: duplicado } = await admin
    .from('usuarios_app')
    .select('id')
    .eq('email', emailNorm)
    .maybeSingle();
  if (duplicado) {
    return res.status(400).json({ error: 'Ya existe un usuario con ese correo' });
  }

  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  let authUser = list?.users?.find((u) => u.email === emailNorm);

  if (!authUser) {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: emailNorm,
      password,
      email_confirm: true,
      user_metadata: { nombre: nombre || 'Usuario' },
    });
    if (createErr) {
      return res.status(400).json({ error: createErr.message });
    }
    authUser = created.user;
  }

  const { data: nuevo, error: insertErr } = await admin
    .from('usuarios_app')
    .insert({
      organizacion_id: organizacionId,
      auth_user_id: authUser.id,
      nombre: nombre || 'Usuario',
      email: emailNorm,
      rol_id,
      activo: true,
    })
    .select('*, roles_organizacion(nombre, permisos)')
    .single();

  if (insertErr) {
    return res.status(400).json({ error: insertErr.message });
  }

  return res.status(200).json({
    data: {
      ...nuevo,
      rol_nombre: nuevo.roles_organizacion?.nombre || '—',
      permisos: nuevo.roles_organizacion?.permisos || [],
    },
  });
}
