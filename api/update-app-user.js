/**
 * Actualiza usuario de la app (perfil + contraseña en Supabase Auth).
 * Requiere SUPABASE_SERVICE_ROLE_KEY en Vercel.
 */
import { verifyCaller } from './verifyCaller.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const {
    organizacionId,
    usuarioId,
    nombre,
    email,
    password,
    rol_id,
    activo,
  } = req.body || {};

  if (!organizacionId || !usuarioId) {
    return res.status(400).json({ error: 'organizacionId y usuarioId son obligatorios' });
  }

  const auth = await verifyCaller(req, organizacionId);
  if (auth.error) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const { admin } = auth;
  const emailNorm = String(email || '')
    .trim()
    .toLowerCase();
  if (!emailNorm) {
    return res.status(400).json({ error: 'El correo es obligatorio' });
  }

  const { data: existente, error: findErr } = await admin
    .from('usuarios_app')
    .select('id, auth_user_id, email, organizacion_id')
    .eq('id', usuarioId)
    .eq('organizacion_id', organizacionId)
    .maybeSingle();

  if (findErr || !existente) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  const { data: duplicado } = await admin
    .from('usuarios_app')
    .select('id')
    .eq('email', emailNorm)
    .neq('id', usuarioId)
    .maybeSingle();
  if (duplicado) {
    return res.status(400).json({ error: 'Ya existe otro usuario con ese correo' });
  }

  if (rol_id) {
    const { data: rol } = await admin
      .from('roles_organizacion')
      .select('id')
      .eq('id', rol_id)
      .eq('organizacion_id', organizacionId)
      .maybeSingle();
    if (!rol) {
      return res.status(400).json({ error: 'Rol no válido' });
    }
  }

  if (password?.trim()) {
    if (password.trim().length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }
    if (!existente.auth_user_id) {
      return res.status(400).json({
        error: 'Este usuario no tiene cuenta de acceso vinculada. Créelo de nuevo desde el formulario.',
      });
    }
    const { error: passErr } = await admin.auth.admin.updateUserById(existente.auth_user_id, {
      password: password.trim(),
      ...(emailNorm !== existente.email ? { email: emailNorm } : {}),
    });
    if (passErr) {
      return res.status(400).json({ error: passErr.message });
    }
  } else if (emailNorm !== existente.email && existente.auth_user_id) {
    const { error: emailErr } = await admin.auth.admin.updateUserById(existente.auth_user_id, {
      email: emailNorm,
    });
    if (emailErr) {
      return res.status(400).json({ error: emailErr.message });
    }
  }

  const { data: actualizado, error: upErr } = await admin
    .from('usuarios_app')
    .update({
      nombre: nombre?.trim() || 'Usuario',
      email: emailNorm,
      ...(rol_id ? { rol_id } : {}),
      activo: activo !== false,
    })
    .eq('id', usuarioId)
    .eq('organizacion_id', organizacionId)
    .select('*, roles_organizacion(nombre, permisos)')
    .single();

  if (upErr) {
    return res.status(400).json({ error: upErr.message });
  }

  return res.status(200).json({
    data: {
      ...actualizado,
      rol_nombre: actualizado.roles_organizacion?.nombre || '—',
      permisos: actualizado.roles_organizacion?.permisos || [],
    },
  });
}
