/**
 * Crea usuario en Auth + usuarios_app (requiere SUPABASE_SERVICE_ROLE_KEY en Vercel).
 */
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const token = authHeader.slice(7);
  const url =
    process.env.REACT_APP_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    'https://kolhnoectddjgfowyvux.supabase.co';
  const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!anonKey || !serviceKey) {
    return res.status(500).json({
      error: 'Configure SUPABASE_SERVICE_ROLE_KEY y REACT_APP_SUPABASE_ANON_KEY en Vercel.',
    });
  }

  const userClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !authData?.user) {
    return res.status(401).json({ error: 'Sesión inválida' });
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: caller, error: callerErr } = await admin
    .from('usuarios_app')
    .select('organizacion_id, roles_organizacion(permisos)')
    .eq('auth_user_id', authData.user.id)
    .eq('activo', true)
    .single();

  if (callerErr || !caller) {
    return res.status(403).json({ error: 'Perfil de administrador no encontrado' });
  }

  const permisos = caller.roles_organizacion?.permisos || [];
  if (!permisos.includes('usuarios')) {
    return res.status(403).json({ error: 'Sin permiso para crear usuarios' });
  }

  const { organizacionId, nombre, email, password, rol_id } = req.body || {};
  const emailNorm = String(email || '')
    .trim()
    .toLowerCase();

  if (!organizacionId || organizacionId !== caller.organizacion_id) {
    return res.status(403).json({ error: 'Organización no válida' });
  }
  if (!emailNorm || !password || !rol_id) {
    return res.status(400).json({ error: 'Correo, contraseña y rol son obligatorios' });
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
