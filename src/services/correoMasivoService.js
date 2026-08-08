/**
 * Envío masivo de avisos/novenario (texto + imagen) vía /api/send-email.
 * Por defecto: lotes en copia oculta (BCC) para ir mucho más rápido.
 */
import { supabase } from '../config/supabaseClient';
import { getEmailConfig, registrarCorreoEnviado } from './dataService';
import { dormir } from '../utils/reenvioMasivoUtils';
import {
  formatearPrimerosNombres,
  partirEnLotes,
  personalizarTextoAviso,
  personalizarTextoAvisoGenerico,
  TAMANO_LOTE_BCC,
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
  bcc = null,
  subject,
  texto,
  nombre,
  organizacionNombre,
  imagen = null,
  imagenes = null,
}) {
  const listaImagenes = normalizarImagenesAviso(imagenes, imagen);
  const bccList = Array.isArray(bcc)
    ? bcc.map((e) => String(e || '').trim().toLowerCase()).filter((e) => e.includes('@'))
    : [];
  const headers = await authHeaders();
  const controller = new AbortController();
  const timeoutMs = listaImagenes.length > 1 || bccList.length > 1 ? 90000 : 45000;
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
        bcc: bccList.length ? bccList : undefined,
        subject,
        text: texto,
        aviso: {
          texto,
          // Solo enviar nombre si hay valor (undefined se omite en JSON).
          ...(nombre ? { nombre } : {}),
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

async function registrarLote({
  organizacionId,
  lote,
  asunto,
  ok,
  errorMsg,
  resultados,
}) {
  for (const dest of lote) {
    const entrada = {
      correo: dest.correo,
      nombre: dest.nombre,
      etiqueta: `${dest.nombre || '—'} · ${dest.correo}`,
    };
    if (ok) {
      resultados.ok.push(entrada);
      await registrarCorreoEnviado(organizacionId, {
        destinatario: dest.correo,
        asunto,
        estado: 'enviado',
        cargador: dest.cargadorId
          ? { id: dest.cargadorId, nombre_completo: dest.nombre, correo: dest.correo }
          : { nombre_completo: dest.nombre, correo: dest.correo },
        modo: 'aviso_masivo_bcc',
        enviado_en: new Date().toISOString(),
      });
    } else {
      resultados.error.push({ ...entrada, error: errorMsg || 'Error' });
      await registrarCorreoEnviado(organizacionId, {
        destinatario: dest.correo,
        asunto,
        estado: 'error',
        error: errorMsg || 'Error al enviar aviso (lote BCC)',
        cargador: dest.cargadorId
          ? { id: dest.cargadorId, nombre_completo: dest.nombre, correo: dest.correo }
          : { nombre_completo: dest.nombre, correo: dest.correo },
        modo: 'aviso_masivo_bcc',
        enviado_en: new Date().toISOString(),
      });
    }
  }
}

/**
 * Envía en lotes por copia oculta (BCC) o uno a uno.
 * modoEnvio: 'bcc' (default) | 'individual'
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
  modoEnvio = 'bcc',
  tamanoLote = TAMANO_LOTE_BCC,
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

  const smtpUser = (emailConfig.gmail_smtp_user || emailConfig.correo_remitente || '')
    .trim()
    .toLowerCase();
  const from = `${emailConfig.nombre_remitente || organizacion?.nombre_oficial || 'Asociación'} <${
    emailConfig.correo_remitente || emailConfig.gmail_smtp_user
  }>`;
  const reply_to = emailConfig.correo_respuesta || emailConfig.correo_remitente;
  const orgNombre = organizacion?.nombre_oficial || emailConfig.nombre_remitente || '';

  const lista = destinatarios || [];
  const resultados = { ok: [], error: [], cancelado: false, modoEnvio };

  if (modoEnvio === 'individual') {
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

  // --- Modo BCC por lotes (saludo en el texto; sin nombre personalizado en HTML) ---
  const lotes = partirEnLotes(lista, tamanoLote);
  const cuerpo = personalizarTextoAvisoGenerico(texto);

  for (let i = 0; i < lotes.length; i += 1) {
    if (signal?.cancelled) {
      resultados.cancelado = true;
      break;
    }

    const lote = lotes[i];
    const bccEmails = lote
      .map((d) => d.correo)
      .filter((email) => email && email !== smtpUser);
    const etiqueta = `Lote ${i + 1}/${lotes.length} · ${bccEmails.length} en copia oculta`;

    onProgress?.({
      fase: 'enviando',
      indice: i + 1,
      total: lotes.length,
      etiqueta,
      personasEnLote: bccEmails.length,
    });

    const res = await enviarAvisoCorreoApi({
      organizacionId,
      from,
      reply_to,
      to: smtpUser,
      bcc: bccEmails,
      subject: asunto,
      texto: cuerpo,
      // Sin nombre → el HTML no antepone saludo; queda solo el del texto.
      organizacionNombre: orgNombre,
      imagenes: listaImagenes,
    });

    await registrarLote({
      organizacionId,
      lote,
      asunto,
      ok: res.ok,
      errorMsg: res.error,
      resultados,
    });

    onProgress?.({
      fase: i < lotes.length - 1 ? 'espera' : 'fin',
      indice: i + 1,
      total: lotes.length,
      etiqueta,
      ultimoResultado: res.ok ? 'ok' : 'error',
      resultados,
    });

    if (i < lotes.length - 1 && !signal?.cancelled) {
      await dormir(Math.max(0, delaySegundos) * 1000);
    }
  }

  return resultados;
}
