/**
 * Envío masivo de avisos/novenario (texto + imagen) vía /api/send-email.
 */
import { supabase } from '../config/supabaseClient';
import { getEmailConfig, registrarCorreoEnviado } from './dataService';
import { dormir } from '../utils/reenvioMasivoUtils';
import {
  formatearPrimerosNombres,
  personalizarTextoAviso,
} from '../utils/correoMasivoUtils';

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

function normalizarImagenesAviso(imagenes, imagen) {
  if (Array.isArray(imagenes) && imagenes.length) {
    return imagenes.filter((img) => img?.base64 && img?.mime);
  }
  if (imagen?.base64 && imagen?.mime) return [imagen];
  return [];
}

export async function enviarAvisoCorreoApi({
  organizacionId,
  from,
  reply_to,
  to,
  subject,
  texto,
  nombre,
  organizacionNombre,
  imagen = null,
  imagenes = null,
}) {
  const listaImagenes = normalizarImagenesAviso(imagenes, imagen);
  const headers = await authHeaders();
  const controller = new AbortController();
  const timeoutMs = listaImagenes.length > 1 ? 70000 : 45000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const primera = listaImagenes[0];
    const res = await fetch(EMAIL_API, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        organizacionId,
        tipo: 'aviso',
        from,
        reply_to,
        to,
        subject,
        text: texto,
        aviso: {
          texto,
          nombre,
          organizacion: organizacionNombre,
          imagenes: listaImagenes.map((img) => ({
            base64: img.base64,
            mime: img.mime,
            nombre: img.nombre,
          })),
          imagenBase64: primera?.base64 || undefined,
          imagenMime: primera?.mime || undefined,
          imagenNombre: primera?.nombre || undefined,
        },
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: json.error || 'No se pudo enviar' };
    }
    return { ok: true, ...json };
  } catch (err) {
    if (err?.name === 'AbortError') {
      return { ok: false, error: 'El envío tardó demasiado (timeout).' };
    }
    return { ok: false, error: err.message || 'Error de red al enviar' };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Envía uno a uno con pausa. Registra cada intento en correos_enviados.
 */
export async function ejecutarCorreoMasivo({
  organizacionId,
  organizacion,
  destinatarios = [],
  asunto,
  texto,
  imagen = null,
  imagenes = null,
  delaySegundos = 5,
  onProgress,
  signal,
}) {
  const listaImagenes = normalizarImagenesAviso(imagenes, imagen);
  const emailConfig = await getEmailConfig(organizacionId);
  if (!emailConfig?.correo_remitente?.trim() && !emailConfig?.gmail_smtp_user?.trim()) {
    return {
      ok: [],
      error: [{ etiqueta: '—', error: 'Configure Gmail en Correo y boletas antes de enviar.' }],
      cancelado: false,
    };
  }

  const from = `${emailConfig.nombre_remitente || organizacion?.nombre_oficial || 'Asociación'} <${
    emailConfig.correo_remitente || emailConfig.gmail_smtp_user
  }>`;
  const reply_to = emailConfig.correo_respuesta || emailConfig.correo_remitente;
  const orgNombre = organizacion?.nombre_oficial || emailConfig.nombre_remitente || '';

  const lista = destinatarios || [];
  const resultados = { ok: [], error: [], cancelado: false };

  for (let i = 0; i < lista.length; i += 1) {
    if (signal?.cancelled) {
      resultados.cancelado = true;
      break;
    }

    const dest = lista[i];
    const etiqueta = `${dest.nombre || '—'} · ${dest.correo}`;
    const cuerpo = personalizarTextoAviso(texto, dest);
    const nombres =
      Array.isArray(dest.nombres) && dest.nombres.length
        ? dest.nombres
        : [dest.nombre].filter(Boolean);
    const nombreSaludo = formatearPrimerosNombres(nombres);

    onProgress?.({
      fase: 'enviando',
      indice: i + 1,
      total: lista.length,
      etiqueta,
    });

    const res = await enviarAvisoCorreoApi({
      organizacionId,
      from,
      reply_to,
      to: dest.correo,
      subject: asunto,
      texto: cuerpo,
      nombre: nombreSaludo,
      organizacionNombre: orgNombre,
      imagenes: listaImagenes,
    });

    const entrada = {
      correo: dest.correo,
      nombre: dest.nombre,
      etiqueta,
    };

    if (res.ok) {
      resultados.ok.push(entrada);
      await registrarCorreoEnviado(organizacionId, {
        destinatario: dest.correo,
        asunto,
        estado: 'enviado',
        cargador: dest.cargadorId
          ? { id: dest.cargadorId, nombre_completo: dest.nombre, correo: dest.correo }
          : { nombre_completo: dest.nombre, correo: dest.correo },
        modo: 'aviso_masivo',
        enviado_en: new Date().toISOString(),
      });
    } else {
      resultados.error.push({ ...entrada, error: res.error || 'Error' });
      await registrarCorreoEnviado(organizacionId, {
        destinatario: dest.correo,
        asunto,
        estado: 'error',
        error: res.error || 'Error al enviar aviso',
        cargador: dest.cargadorId
          ? { id: dest.cargadorId, nombre_completo: dest.nombre, correo: dest.correo }
          : { nombre_completo: dest.nombre, correo: dest.correo },
        modo: 'aviso_masivo',
        enviado_en: new Date().toISOString(),
      });
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
