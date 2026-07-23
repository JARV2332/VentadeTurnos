import { supabase } from '../config/supabaseClient';

const CONFIRMAR_ENTREGA_URL =
  process.env.REACT_APP_CONFIRMAR_ENTREGA_URL ||
  (process.env.NODE_ENV === 'production' ? '/api/confirmar-entrega' : '');

/**
 * Marca entrega y envía correo desde el servidor (Gmail SMTP + log en BD).
 */
export async function confirmarEntregaServidor({
  organizacionId,
  brazoId,
  entregado_a_tercero,
  entregado_receptor_nombre,
  enviarCorreo,
}) {
  if (!CONFIRMAR_ENTREGA_URL) {
    return { error: 'API de entrega no configurada (solo disponible en producción).' };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { error: 'Sesión expirada. Vuelva a iniciar sesión.' };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    const res = await fetch(CONFIRMAR_ENTREGA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        organizacionId,
        brazoId,
        entregado_a_tercero,
        entregado_receptor_nombre,
        enviarCorreo: Boolean(enviarCorreo),
      }),
    });
    clearTimeout(timeoutId);

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: json.error || 'No se pudo confirmar la entrega.' };
    }
    return { data: json.data, correo: json.correo || null };
  } catch (err) {
    if (err?.name === 'AbortError') {
      return { error: 'La operación tardó demasiado. Verifique si la entrega quedó registrada.' };
    }
    return { error: err?.message || 'Error de conexión con el servidor.' };
  }
}
