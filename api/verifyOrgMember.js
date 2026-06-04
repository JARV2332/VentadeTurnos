import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from './verifyCaller.js';
import { verifyAuth } from './verifyAuth.js';

/** Usuario autenticado con acceso a la organización indicada. */
export async function verifyOrgMember(req, organizacionId) {
  const auth = await verifyAuth(req);
  if (auth.error) {
    return { status: auth.status, error: auth.error };
  }

  const { url, anonKey, serviceKey } = getSupabaseConfig();
  if (!serviceKey) {
    return { status: 500, error: 'Falta SUPABASE_SERVICE_ROLE_KEY en Vercel.' };
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: perfil, error } = await admin
    .from('usuarios_app')
    .select('es_super_admin, organizacion_id, organizacion_activa_id, activo')
    .eq('auth_user_id', auth.user.id)
    .eq('activo', true)
    .maybeSingle();

  if (error || !perfil) {
    return { status: 403, error: 'Perfil no encontrado' };
  }

  const orgPermitida = perfil.es_super_admin
    ? perfil.organizacion_activa_id
    : perfil.organizacion_id;

  if (!organizacionId || organizacionId !== orgPermitida) {
    return {
      status: 403,
      error: perfil.es_super_admin
        ? 'Seleccione la asociación activa en el panel de plataforma.'
        : 'Sin acceso a esta organización',
    };
  }

  return { admin, user: auth.user, organizacionId };
}
