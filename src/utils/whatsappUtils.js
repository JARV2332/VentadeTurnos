import { formatPrecio } from './boletaUtils';
import { fullGtPhoneFromLocal, isValidGtWhatsapp } from './phoneGtUtils';

function getAppBaseUrl() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return process.env.REACT_APP_APP_URL || 'https://ventadeturnos.vercel.app';
}

function normalizarTelefono502(telefono) {
  const digits = String(telefono || '').replace(/\D/g, '');
  if (isValidGtWhatsapp(digits)) return digits;
  if (digits.length === 8) return fullGtPhoneFromLocal(digits);
  return digits;
}

/**
 * Mensaje corto para wa.me (no admite adjuntos; la boleta va como enlace web con QR).
 */
export function construirMensajeBoletaWhatsapp({
  cargador,
  brazo,
  turno,
  cortejo,
  organizacion,
}) {
  const nombre = cargador?.nombre_completo?.split(' ')[0] || 'estimado/a';
  const etiqueta = turno?.etiqueta || turno?.tipo_turno || 'Turno';
  const codigo = brazo?.codigo_boleta_qr || '';
  const enlace = `${APP_URL}/boleta/${codigo}`;
  const precio = formatPrecio(brazo?.precio_pagado || turno?.precio || 0);
  const org = organizacion?.nombre_oficial || 'la organización';

  return [
    `Hola ${nombre},`,
    '',
    `Su turno #${brazo?.numero_turno ?? '—'} (${etiqueta}) para "${cortejo?.nombre_evento || 'la procesión'}" está confirmado.`,
    '',
    `Código: ${codigo}`,
    `Monto: ${precio}`,
    '',
    `Boleta digital (abra el enlace y guarde el QR):`,
    enlace,
    '',
    'Presente ese QR en taquilla para recibir su turno físico.',
    '',
    `— ${org}`,
  ].join('\n');
}

/** URL wa.me al WhatsApp del cargador (502XXXXXXXX). */
export function construirEnlaceWhatsApp(telefono502, mensaje) {
  const digits = String(telefono502 || '').replace(/\D/g, '');
  if (!isValidGtWhatsapp(digits)) return null;
  const text = encodeURIComponent(mensaje || '');
  return `https://wa.me/${digits}?text=${text}`;
}

export function construirEnlaceBoletaWhatsapp(props) {
  const mensaje = construirMensajeBoletaWhatsapp(props);
  const telefono = normalizarTelefono502(
    props.cargador?.whatsapp || props.whatsappFallback || props.cargador?.telefono
  );
  return construirEnlaceWhatsApp(telefono, mensaje);
}
