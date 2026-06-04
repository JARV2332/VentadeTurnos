import { createClient } from '@supabase/supabase-js';

export function getSupabaseConfig() {
  const url =
    process.env.REACT_APP_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    'https://kolhnoectddjgfowyvux.supabase.co';
  const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { url, anonKey, serviceKey };
}

/**
 * Valida Bearer token y que el caller pueda gestionar usuarios de organizacionId.
 */
export async function verifyCaller(req, organizacionId) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { status: 401, error: 'No autorizado' };
  }

  const { url, anonKey, serviceKey } = getSupabaseConfig();
  if (!anonKey || !serviceKey) {
    return {
      status: 500,
      error: 'Configure SUPABASE_SERVICE_ROLE_KEY y REACT_APP_SUPABASE_ANON_KEY en Vercel.',
    };
  }

  const token = authHeader.slice(7);
  const userClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !authData?.user) {
    return { status: 401, error: 'Sesión inválida' };
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: caller, error: callerErr } = await admin
    .from('usuarios_app')
    .select('es_super_admin, organizacion_id, organizacion_activa_id, roles_organizacion(permisos)')
    .eq('auth_user_id', authData.user.id)
    .eq('activo', true)
    .maybeSingle();

  if (callerErr || !caller) {
    return { status: 403, error: 'Perfil de administrador no encontrado' };
  }

  const isSuper = Boolean(caller.es_super_admin);
  const callerOrgId = isSuper ? caller.organizacion_activa_id : caller.organizacion_id;
  const permisos = caller.roles_organizacion?.permisos || [];

  if (!organizacionId || organizacionId !== callerOrgId) {
    return {
      status: 403,
      error: isSuper
        ? 'Seleccione primero la asociación activa en el panel de plataforma.'
        : 'Organización no válida',
    };
  }

  if (!isSuper && !permisos.includes('usuarios')) {
    return { status: 403, error: 'Sin permiso para gestionar usuarios' };
  }

  return { admin, authUser: authData.user, caller, isSuper };
}
