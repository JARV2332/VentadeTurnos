import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import { etiquetaSexo } from './sexoUtils';

/** Payload compacto para el QR (útil en taquilla: tipo + org + DPI). */
export function payloadQrPreregistro({ orgSlug, cui, nombre }) {
  return JSON.stringify({
    t: 'preregistro',
    org: String(orgSlug || '').slice(0, 40),
    cui: String(cui || ''),
    n: String(nombre || '').slice(0, 60),
  });
}

function formatearFecha(fecha = new Date()) {
  try {
    return new Intl.DateTimeFormat('es-GT', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(fecha instanceof Date ? fecha : new Date(fecha));
  } catch {
    return String(fecha);
  }
}

function enmascararWhatsapp(wa) {
  const d = String(wa || '').replace(/\D/g, '');
  if (d.length < 8) return wa || '—';
  return `+${d.slice(0, 3)} ****${d.slice(-4)}`;
}

/**
 * Genera y descarga un PDF mini (tipo ticket) de preinscripción.
 * El alto se calcula para que el QR y el pie no se corten.
 */
export async function descargarPdfPreregistro({
  orgNombre,
  orgSlug,
  nombre,
  cui,
  sexo,
  whatsapp,
  correo,
  yaRegistrado = false,
  fecha = new Date(),
}) {
  const pageW = 80;
  const margen = 6;
  const ancho = pageW - margen * 2;
  const qrSize = 34;
  const pieExtra = 16;
  const margenInferior = 8;

  // Estimación de alto del bloque de datos (para dimensionar la página).
  const probe = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pageW, 200] });
  probe.setFontSize(9);
  const filas = [
    ['Nombre', String(nombre || '—')],
    ['DPI / CUI', String(cui || '—')],
    ['Sexo', etiquetaSexo(sexo)],
    ['WhatsApp', enmascararWhatsapp(whatsapp)],
    ['Correo', String(correo || '—').slice(0, 42)],
    ['Fecha', formatearFecha(fecha)],
  ];
  let datosH = 0;
  filas.forEach(([, valor]) => {
    const lines = probe.splitTextToSize(valor, ancho - 2);
    datosH += 3.5 + lines.length * 3.6 + 1.5;
  });

  const orgLines = probe.splitTextToSize(String(orgNombre || 'Organización').slice(0, 60), ancho);
  const headerH = 8 + orgLines.length * 4.5 + 6 + 6 + 8;
  const pageH = Math.ceil(
    headerH + datosH + 6 + qrSize + pieExtra + margenInferior + 4
  );

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [pageW, Math.max(150, pageH)],
  });

  let y = 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(orgLines, pageW / 2, y, { align: 'center' });
  y += orgLines.length * 4.5 + 3;

  doc.setFontSize(12);
  doc.text(yaRegistrado ? 'YA PREINSCRITO' : 'PREINSCRIPCIÓN', pageW / 2, y, {
    align: 'center',
  });
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Comprobante de preregistro (no es boleta de turno)', pageW / 2, y, {
    align: 'center',
    maxWidth: ancho,
  });
  y += 6;

  doc.setDrawColor(180);
  doc.line(margen, y, pageW - margen, y);
  y += 5;

  doc.setFontSize(9);
  filas.forEach(([label, valor]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, margen, y);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(valor, ancho - 2);
    doc.text(lines, margen, y + 3.5);
    y += 3.5 + lines.length * 3.6 + 1.5;
  });

  y += 1;
  doc.setDrawColor(180);
  doc.line(margen, y, pageW - margen, y);
  y += 4;

  const qrPayload = payloadQrPreregistro({ orgSlug, cui, nombre });
  const qrDataUrl = await QRCode.toDataURL(qrPayload, {
    width: 320,
    margin: 1,
    errorCorrectionLevel: 'M',
  });
  const qrX = (pageW - qrSize) / 2;
  doc.addImage(qrDataUrl, 'PNG', qrX, y, qrSize, qrSize);
  y += qrSize + 4;

  doc.setFontSize(7);
  doc.text('Presente este comprobante o su DPI en taquilla.', pageW / 2, y, {
    align: 'center',
    maxWidth: ancho,
  });
  y += 4;
  doc.text('El QR identifica su preregistro (no reemplaza la compra).', pageW / 2, y, {
    align: 'center',
    maxWidth: ancho,
  });

  const safeCui = String(cui || 'devoto').replace(/\D/g, '') || 'devoto';
  doc.save(`preregistro-${safeCui}.pdf`);
}
