import { formatPrecio } from './boletaUtils';
import { fullGtPhoneFromLocal, isValidGtWhatsapp } from './phoneGtUtils';
import { construirLineasRecibo, codigoReciboDisplay } from './compraUtils';

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
  items,
  compra,
}) {
  const nombre = cargador?.nombre_completo?.split(' ')[0] || 'estimado/a';
  const org = organizacion?.nombre_oficial || 'la organización';
  const listaItems =
    items?.length > 0 ? items : brazo ? [{ brazo, turno }] : [];
  const { lineas, totalFmt } = construirLineasRecibo(listaItems);
  const brazosLista = listaItems.map((i) => i.brazo).filter(Boolean);
  const codigo = codigoReciboDisplay(compra, brazosLista);
  const enlace = `${getAppBaseUrl()}/boleta/${brazosLista[0]?.codigo_boleta_qr || codigo}`;

  const lineasMsg = lineas.map(
    (l) => `• ${l.cantidad}× Turno #${l.numero_turno} (${l.etiqueta}) — ${formatPrecio(l.ofrenda)}`
  );

  return [
    `Hola ${nombre},`,
    '',
    `Turnos adquiridos para "${cortejo?.nombre_evento || 'la procesión'}":`,
    '',
    ...lineasMsg,
    '',
    `Total ofrenda: ${totalFmt}`,
    `Código recibo: ${codigo}`,
    '',
    `Boleta digital:`,
    enlace,
    '',
    'Presente el QR de cada turno (VT-…) en taquilla para recibir su cartulina.',
    '',
    `— ${org}`,
  ].join('\n');
}

/** URL wa.me al WhatsApp del devoto(a) (502XXXXXXXX). */
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
