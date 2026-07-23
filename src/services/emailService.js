/**
 * Plantilla y envío de boletas por correo electrónico.
 * MOCK: registra en memoria. PRODUCCIÓN: webhook / Resend / SendGrid / Edge Function.
 */

import { MOCK_MODE, supabase } from '../config/supabaseClient';
import { getEmailConfig, registrarCorreoEnviado } from './dataService';
import { formatPrecio, formatFechaDiaMes, anioDeFecha } from '../utils/boletaUtils';
import { construirLineasRecibo, codigoReciboDisplay } from '../utils/compraUtils';
import {
  aplicarLeyendaCorreo,
  CORREO_FECHA_ENTREGA_DEFAULT,
  CORREO_HORARIO_ENTREGA_DEFAULT,
} from '../utils/emailTemplateUtils';
import { construirCorreoEntrega } from '../utils/entregaEmailUtils';

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
  const enlaceBoleta = `${APP_URL}/boleta/${compra?.codigo_recibo || brazosLista[0]?.codigo_boleta_qr || codigoRecibo}`;

  const nombre = cargador?.nombre_completo?.split(' ')[0] || 'devoto(a)';
  const nombreCompleto = cargador?.nombre_completo?.trim() || 'Devoto(a)';
  const lineasTexto = lineas
    .map((l) => {
      const unit = formatPrecio(l.ofrenda);
      const total = l.ofrendaTotalFmt || formatPrecio(l.subtotal);
      if (l.cantidad > 1) {
        return `  • ${l.cantidad} × Turno #${l.numero_turno} (${l.etiqueta}) — ${unit} c/u → ${total}`;
      }
      return `  • Turno #${l.numero_turno} (${l.etiqueta}) — ${total}`;
    })
    .join('\n');

  const turnosBloque = lineas.length
    ? `Turnos adquiridos:\n${lineasTexto}\n\nTotal ofrenda: ${totalFmt}\n`
    : '';

  const cuerpoBase = aplicarLeyendaCorreo(emailConfig?.leyenda_correo, {
    nombre,
    nombre_completo: nombreCompleto,
    evento: cortejo?.nombre_evento || 'Festivo Rezado de Nuestra Señora de la Asunción',
    anio: anioDeFecha(cortejo?.fecha),
    fecha_procesion: formatFechaDiaMes(cortejo?.fecha) || '15 de agosto',
    turnos_bloque: turnosBloque,
    turnos: lineasTexto,
    total: totalFmt,
    codigo: codigoRecibo,
    enlace: enlaceBoleta,
    fecha_entrega: emailConfig?.correo_fecha_entrega?.trim() || CORREO_FECHA_ENTREGA_DEFAULT,
    horario_entrega: emailConfig?.correo_horario_entrega?.trim() || CORREO_HORARIO_ENTREGA_DEFAULT,
    organizacion: organizacion?.nombre_oficial || emailConfig?.nombre_remitente || '',
  });

  const pie = emailConfig?.pie_correo?.trim();
  const cuerpo = pie ? `${cuerpoBase}\n\n${pie}` : cuerpoBase;

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
      cargador,
      brazo,
      turno,
      cortejo,
      compra,
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
      await registrarCorreoEnviado(organizacionId, {
        ...datos,
        cargador,
        brazo,
        turno,
        cortejo,
        compra,
        destinatario: cargador.correo,
        estado: 'error',
        error: json.error || 'Error al enviar correo',
        enviado_en: new Date().toISOString(),
        modo: 'gmail',
      });
      return { ok: false, error: json.error || 'Error al enviar correo' };
    }

    await registrarCorreoEnviado(organizacionId, {
      ...datos,
      cargador,
      brazo,
      turno,
      cortejo,
      compra,
      destinatario: cargador.correo,
      estado: 'enviado',
      enviado_en: new Date().toISOString(),
      modo: 'gmail',
    });

    return { ok: true, destinatario: cargador.correo, asunto: datos.asunto };
  } catch (err) {
    const msg = err?.message || '';
    const errorText =
      err?.name === 'AbortError'
        ? 'El envío de correo tardó demasiado. La venta ya está guardada.'
        : msg.includes('Failed to fetch')
          ? 'No se pudo conectar con el servidor de correo. Verifique GMAIL_USER y GMAIL_APP_PASSWORD en Vercel.'
          : msg || 'No se pudo enviar el correo';

    await registrarCorreoEnviado(organizacionId, {
      ...datos,
      cargador,
      brazo,
      turno,
      cortejo,
      compra,
      destinatario: cargador.correo,
      estado: 'error',
      error: errorText,
      enviado_en: new Date().toISOString(),
      modo: 'gmail',
    });

    if (err?.name === 'AbortError') {
      return { ok: false, error: errorText };
    }
    if (msg.includes('Failed to fetch')) {
      return { ok: false, error: errorText };
    }
    return { ok: false, error: errorText };
  }
}

/** Correo al devoto(a) cuando se confirma la entrega física del turno. */
export async function enviarCorreoEntregaConfirmada({
  organizacionId,
  organizacion,
  cargador,
  brazo,
  turno,
  cortejo,
  entregado_a_tercero,
  entregado_receptor_nombre,
  entregado_en,
  forzarEnvio = true,
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

  const correo = construirCorreoEntrega({
    cargador,
    brazo,
    turno,
    cortejo,
    organizacion,
    entregado_a_tercero,
    entregado_receptor_nombre,
    entregado_en,
  });

  const entregaHtml = {
    primerNombre: correo.primerNombre,
    nombreCompleto: correo.nombreCompleto,
    evento: correo.evento,
    turnoTxt: correo.turnoTxt,
    fechaEntrega: correo.fechaEntrega,
    entregado_a_tercero,
    entregado_receptor_nombre,
    organizacion: organizacion?.nombre_oficial || emailConfig?.nombre_remitente || '',
  };

  if (MOCK_MODE || !EMAIL_WEBHOOK_URL) {
    await registrarCorreoEnviado(organizacionId, {
      asunto: correo.asunto,
      cuerpo: correo.cuerpo,
      destinatario: cargador.correo,
      cargador,
      brazo,
      turno,
      cortejo,
      tipo: 'entrega_confirmada',
      enviado_en: new Date().toISOString(),
      modo: 'demo',
    });
    return { ok: true, demo: true, destinatario: cargador.correo, asunto: correo.asunto };
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
        tipo: 'entrega',
        entrega: entregaHtml,
        from: `${emailConfig.nombre_remitente} <${emailConfig.correo_remitente}>`,
        reply_to: emailConfig.correo_respuesta || emailConfig.correo_remitente,
        to: cargador.correo,
        subject: correo.asunto,
        text: correo.cuerpo,
      }),
    });
    clearTimeout(timeoutId);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      await registrarCorreoEnviado(organizacionId, {
        asunto: correo.asunto,
        cuerpo: correo.cuerpo,
        destinatario: cargador.correo,
        cargador,
        brazo,
        turno,
        cortejo,
        tipo: 'entrega_confirmada',
        estado: 'error',
        error: json.error || 'Error al enviar correo',
        enviado_en: new Date().toISOString(),
        modo: 'gmail',
      });
      return { ok: false, error: json.error || 'Error al enviar correo' };
    }

    await registrarCorreoEnviado(organizacionId, {
      asunto: correo.asunto,
      cuerpo: correo.cuerpo,
      destinatario: cargador.correo,
      cargador,
      brazo,
      turno,
      cortejo,
      tipo: 'entrega_confirmada',
      estado: 'enviado',
      enviado_en: new Date().toISOString(),
      modo: 'gmail',
    });

    return { ok: true, destinatario: cargador.correo, asunto: correo.asunto };
  } catch (err) {
    const msg = err?.message || '';
    const errorText =
      err?.name === 'AbortError'
        ? 'El envío de correo tardó demasiado. La entrega ya está guardada.'
        : msg.includes('Failed to fetch')
          ? 'No se pudo conectar con el servidor de correo.'
          : msg || 'No se pudo enviar el correo';

    await registrarCorreoEnviado(organizacionId, {
      asunto: correo.asunto,
      cuerpo: correo.cuerpo,
      destinatario: cargador.correo,
      cargador,
      brazo,
      turno,
      cortejo,
      tipo: 'entrega_confirmada',
      estado: 'error',
      error: errorText,
      enviado_en: new Date().toISOString(),
      modo: 'gmail',
    });

    return { ok: false, error: errorText };
  }
}
