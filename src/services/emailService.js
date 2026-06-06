/**
 * Plantilla y envío de boletas por correo electrónico.
 * MOCK: registra en memoria. PRODUCCIÓN: webhook / Resend / SendGrid / Edge Function.
 */

import { MOCK_MODE, supabase } from '../config/supabaseClient';
import { getEmailConfig, registrarCorreoEnviado } from './dataService';
import { formatPrecio } from '../utils/boletaUtils';
import { construirLineasRecibo, codigoReciboDisplay } from '../utils/compraUtils';
import { aplicarLeyendaCorreo } from '../utils/emailTemplateUtils';

const APP_URL = process.env.REACT_APP_APP_URL || 'https://ventadeturnos.com';
const EMAIL_WEBHOOK_URL =
  process.env.REACT_APP_EMAIL_WEBHOOK_URL ||
  (process.env.NODE_ENV === 'production' ? '/api/send-email' : '');

export function construirAsuntoBoleta({ turno, cortejo, items }) {
  if (items?.length > 1) {
    return `Sus turnos (${items.length}) — ${cortejo?.nombre_evento || 'Procesión'}`;
  }
  const etiqueta = turno?.etiqueta || turno?.tipo_turno || 'Turno';
  return `Su ${etiqueta} — ${cortejo?.nombre_evento || 'Procesión'}`;
}

export function construirCuerpoBoleta({
  cargador,
  brazo,
  turno,
  cortejo,
  organizacion,
  emailConfig,
  items,
  compra,
}) {
  const listaItems =
    items?.length > 0
      ? items
      : brazo
        ? [{ brazo, turno }]
        : [];
  const { lineas, totalFmt } = construirLineasRecibo(listaItems);
  const brazosLista = listaItems.map((i) => i.brazo).filter(Boolean);
  const codigoRecibo = codigoReciboDisplay(compra, brazosLista);
  const enlaceBoleta = `${APP_URL}/boleta/${brazosLista[0]?.codigo_boleta_qr || codigoRecibo}`;

  const nombre = cargador?.nombre_completo?.split(' ')[0] || 'devoto';
  const lineasTexto = lineas
    .map(
      (l) =>
        `  • ${l.cantidad} × Turno #${l.numero_turno} (${l.etiqueta}) — ${formatPrecio(l.ofrenda)}`
    )
    .join('\n');

  const cuerpoBase = aplicarLeyendaCorreo(emailConfig?.leyenda_correo, {
    nombre,
    nombre_completo: cargador?.nombre_completo?.trim() || '',
    evento: cortejo?.nombre_evento || 'Procesión',
    turnos: lineasTexto,
    total: totalFmt,
    codigo: codigoRecibo,
    enlace: enlaceBoleta,
    organizacion: organizacion?.nombre_oficial || '',
  });

  const pie = emailConfig?.pie_correo?.trim();
  const firma = emailConfig?.nombre_remitente || organizacion?.nombre_oficial || '';
  const cuerpo = pie
    ? `${cuerpoBase}\n\n${pie}\n\n— ${firma}`
    : `${cuerpoBase}\n\n— ${firma}`;

  return {
    cuerpo,
    enlaceBoleta,
    asunto: construirAsuntoBoleta({ turno, cortejo, items: listaItems }),
  };
}

/** Datos estructurados para vista previa HTML */
export function construirDatosBoletaEmail(props) {
  const { cuerpo, enlaceBoleta, asunto } = construirCuerpoBoleta(props);
  const { cargador, brazo, turno, cortejo, organizacion, emailConfig, items, compra } = props;
  return {
    asunto,
    cuerpo,
    enlaceBoleta,
    destinatario: cargador?.correo || 'correo@ejemplo.com',
    remitente: emailConfig?.correo_remitente || 'turnos@organizacion.com',
    nombreRemitente: emailConfig?.nombre_remitente || organizacion?.nombre_oficial,
    responderA:
      emailConfig?.correo_respuesta?.trim() || emailConfig?.correo_remitente || 'turnos@organizacion.com',
    brazo,
    turno,
    cortejo,
    cargador,
    organizacion,
    items: items?.length ? items : brazo ? [{ brazo, turno }] : [],
    compra,
  };
}

/**
 * Envía la boleta por correo al confirmar venta.
 *
 * PRODUCCIÓN — descomentar y configurar REACT_APP_EMAIL_WEBHOOK_URL:
 *
 * await fetch(EMAIL_WEBHOOK_URL, {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({
 *     from: `${emailConfig.nombre_remitente} <${emailConfig.correo_remitente}>`,
 *     reply_to: emailConfig.correo_respuesta,
 *     to: cargador.correo,
 *     subject: asunto,
 *     text: cuerpo,
 *     html: generarHtmlBoleta(datos),
 *     attachments: [{ filename: `boleta-${codigo}.pdf`, ... }],
 *   }),
 * });
 */
export async function enviarBoletaPorCorreo({
  organizacionId,
  organizacion,
  cargador,
  brazo,
  turno,
  cortejo,
  items,
  compra,
  forzarEnvio = false,
}) {
  const emailConfig = await getEmailConfig(organizacionId);

  if (!forzarEnvio && !emailConfig?.notificaciones_activas) {
    return { ok: false, omitido: true, motivo: 'Notificaciones por correo desactivadas' };
  }

  if (!cargador?.correo?.trim()) {
    return { ok: false, error: 'El devoto(a) no tiene correo electrónico' };
  }

  if (!emailConfig?.correo_remitente?.trim()) {
    return { ok: false, error: 'Configure el correo remitente en Configuración → Correo' };
  }

  const datos = construirDatosBoletaEmail({
    cargador,
    brazo,
    turno,
    cortejo,
    organizacion,
    emailConfig,
    items,
    compra,
  });

  if (MOCK_MODE || !EMAIL_WEBHOOK_URL) {
    await registrarCorreoEnviado(organizacionId, {
      ...datos,
      enviado_en: new Date().toISOString(),
      modo: 'demo',
    });
    return {
      ok: true,
      demo: true,
      destinatario: cargador.correo,
      asunto: datos.asunto,
    };
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = { 'Content-Type': 'application/json' };
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(EMAIL_WEBHOOK_URL, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        organizacionId,
        from: `${emailConfig.nombre_remitente} <${emailConfig.correo_remitente}>`,
        reply_to: emailConfig.correo_respuesta || emailConfig.correo_remitente,
        to: cargador.correo,
        subject: datos.asunto,
        text: datos.cuerpo,
        codigo_boleta: compra?.codigo_recibo || brazo.codigo_boleta_qr,
        enlace_boleta: datos.enlaceBoleta,
      }),
    });
    clearTimeout(timeoutId);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: json.error || 'Error al enviar correo' };
    }

    await registrarCorreoEnviado(organizacionId, {
      ...datos,
      destinatario: cargador.correo,
      estado: 'enviado',
      enviado_en: new Date().toISOString(),
      modo: 'gmail',
    });

    return { ok: true, destinatario: cargador.correo, asunto: datos.asunto };
  } catch (err) {
    const msg = err?.message || '';
    if (err?.name === 'AbortError') {
      return { ok: false, error: 'El envío de correo tardó demasiado. La venta ya está guardada.' };
    }
    if (msg.includes('Failed to fetch')) {
      return {
        ok: false,
        error:
          'No se pudo conectar con el servidor de correo. Verifique GMAIL_USER y GMAIL_APP_PASSWORD en Vercel.',
      };
    }
    return { ok: false, error: msg || 'No se pudo enviar el correo' };
  }
}
