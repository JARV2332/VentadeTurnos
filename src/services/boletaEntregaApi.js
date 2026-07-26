import { supabase } from '../config/supabaseClient';

const BUSCAR_BOLETA_URL =
  process.env.REACT_APP_BUSCAR_BOLETA_URL ||
  (process.env.NODE_ENV === 'production' ? '/api/buscar-boleta-entrega' : '');

/**
 * Búsqueda vía API de Vercel (1 round-trip desde el navegador).
 * En desarrollo local sin API, retorna { skipped: true }.
 */
export async function buscarBoletaEntregaServidor(organizacionId, codigo) {
  if (!BUSCAR_BOLETA_URL) {
    return { skipped: true };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { error: 'Sesión expirada. Vuelva a iniciar sesión.' };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(BUSCAR_BOLETA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      signal: controller.signal,
      body: JSON.stringify({ organizacionId, codigo }),
    });
    clearTimeout(timeoutId);

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: json.error || 'No se pudo buscar la boleta.' };
    }

    return { data: json };
  } catch (err) {
    if (err?.name === 'AbortError') {
      return { error: 'La búsqueda tardó demasiado. Intente de nuevo.' };
    }
    return { error: err?.message || 'Error de conexión con el servidor.' };
  }
}
