import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from './verifyCaller.js';

/** Valida que la petición traiga un token de sesión Supabase activo. */
export async function verifyAuth(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { status: 401, error: 'No autorizado' };
  }

  const { url, anonKey } = getSupabaseConfig();
  if (!anonKey) {
    return { status: 500, error: 'Falta REACT_APP_SUPABASE_ANON_KEY en el servidor.' };
  }

  const userClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await userClient.auth.getUser(authHeader.slice(7));
  if (error || !data?.user) {
    return { status: 401, error: 'Sesión inválida' };
  }
  return { user: data.user };
}
