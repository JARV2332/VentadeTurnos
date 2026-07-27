/**
 * Reenvío de correos pendientes (error / encolado) vía API, uno a uno con pausa.
 */
import { supabase } from '../config/supabaseClient';
import { dormir } from './reenvioMasivoUtils';

const EMAIL_API =
  process.env.REACT_APP_EMAIL_WEBHOOK_URL ||
  (process.env.NODE_ENV === 'production' ? '/api/send-email' : '/api/send-email');

async function authHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const headers = { 'Content-Type': 'application/json' };
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  return headers;
}

export async function reenviarCorreoPendienteApi(organizacionId, correoId) {
  const headers = await authHeaders();
  const res = await fetch(EMAIL_API, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      action: 'reenviar-pendiente',
      organizacionId,
      correoId,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: json.error || 'No se pudo reenviar' };
  }
  return { ok: true, ...json };
}

/**
 * Reenvía una lista de filas de correos_enviados con pausa entre cada uno.
 */
export async function ejecutarReenvioPendientes({
  organizacionId,
  filas,
  delaySegundos = 3,
  onProgress,
  signal,
}) {
  const lista = filas || [];
  const resultados = { ok: [], error: [], cancelado: false };

  for (let i = 0; i < lista.length; i += 1) {
    if (signal?.cancelled) {
      resultados.cancelado = true;
      break;
    }

    const row = lista[i];
    const etiqueta =
      `${row.metadata?.cargador_nombre || '—'} · ${row.destinatario || '—'} · ${row.codigo_boleta || 'sin código'}`;

    onProgress?.({
      fase: 'enviando',
      indice: i + 1,
      total: lista.length,
      etiqueta,
    });

    const res = await reenviarCorreoPendienteApi(organizacionId, row.id);
    const entrada = { id: row.id, etiqueta, destinatario: row.destinatario };

    if (res.ok) {
      resultados.ok.push(entrada);
    } else {
      resultados.error.push({ ...entrada, error: res.error || 'Error' });
    }

    onProgress?.({
      fase: i < lista.length - 1 ? 'espera' : 'fin',
      indice: i + 1,
      total: lista.length,
      etiqueta,
      ultimoResultado: res.ok ? 'ok' : 'error',
      resultados,
    });

    if (i < lista.length - 1 && !signal?.cancelled) {
      await dormir(Math.max(0, delaySegundos) * 1000);
    }
  }

  return resultados;
}
