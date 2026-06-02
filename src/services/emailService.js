/**
 * Plantilla y envío de boletas por correo electrónico.
 * MOCK: registra en memoria. PRODUCCIÓN: webhook / Resend / SendGrid / Edge Function.
 */

import { MOCK_MODE } from '../config/supabaseClient';
import { getEmailConfig, registrarCorreoEnviadoMock } from './mockService';

const APP_URL = process.env.REACT_APP_APP_URL || 'https://ventadeturnos.com';
const EMAIL_WEBHOOK_URL = process.env.REACT_APP_EMAIL_WEBHOOK_URL || '';

export function construirAsuntoBoleta({ turno, cortejo }) {
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
}) {
  const etiqueta = turno?.etiqueta || turno?.tipo_turno || 'Turno';
  const precio = new Intl.NumberFormat('es-GT', {
    style: 'currency',
    currency: 'GTQ',
  }).format(brazo.precio_pagado || turno?.precio || 0);

  const nombre = cargador?.nombre_completo?.split(' ')[0] || 'devoto';
  const enlaceBoleta = `${APP_URL}/boleta/${brazo.codigo_boleta_qr}`;

  const cuerpo = `Estimado/a ${nombre},

Su turno #${brazo.numero_turno} (${etiqueta}) para la procesión "${cortejo?.nombre_evento}" ya está apartado.

  • Código de boleta: ${brazo.codigo_boleta_qr}
  • Monto pagado: ${precio}

Para la entrega del turno físico, presente la boleta adjunta con su código QR.
En taquilla escanearán el QR para validar su compra y entregarle el turno de cartulina.

Organización: ${organizacion?.nombre_oficial}
${emailConfig?.pie_correo || ''}

— ${emailConfig?.nombre_remitente || organizacion?.nombre_oficial}`;

  return { cuerpo, enlaceBoleta, asunto: construirAsuntoBoleta({ turno, cortejo }) };
}

/** Datos estructurados para vista previa HTML */
export function construirDatosBoletaEmail(props) {
  const { cuerpo, enlaceBoleta, asunto } = construirCuerpoBoleta(props);
  const { cargador, brazo, turno, cortejo, organizacion, emailConfig } = props;
  return {
    asunto,
    cuerpo,
    enlaceBoleta,
    destinatario: cargador?.correo || 'correo@ejemplo.com',
    remitente: emailConfig?.correo_remitente || 'turnos@organizacion.com',
    nombreRemitente: emailConfig?.nombre_remitente || organizacion?.nombre_oficial,
    brazo,
    turno,
    cortejo,
    cargador,
    organizacion,
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
}) {
  const emailConfig = getEmailConfig(organizacionId);

  if (!emailConfig?.notificaciones_activas) {
    return { ok: false, omitido: true, motivo: 'Notificaciones por correo desactivadas' };
  }

  if (!cargador?.correo?.trim()) {
    return { ok: false, error: 'El cargador no tiene correo electrónico' };
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
  });

  if (MOCK_MODE || !EMAIL_WEBHOOK_URL) {
    registrarCorreoEnviadoMock(organizacionId, {
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
    const res = await fetch(EMAIL_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${emailConfig.nombre_remitente} <${emailConfig.correo_remitente}>`,
        reply_to: emailConfig.correo_respuesta || emailConfig.correo_remitente,
        to: cargador.correo,
        subject: datos.asunto,
        text: datos.cuerpo,
        codigo_boleta: brazo.codigo_boleta_qr,
        enlace_boleta: datos.enlaceBoleta,
      }),
    });
    if (!res.ok) throw new Error('Error al enviar correo');
    return { ok: true, destinatario: cargador.correo, asunto: datos.asunto };
  } catch (err) {
    return { ok: false, error: err.message || 'No se pudo enviar el correo' };
  }
}
