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
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [80, 130],
  });

  const margen = 6;
  const ancho = 80 - margen * 2;
  let y = 10;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(String(orgNombre || 'Organización').slice(0, 42), 40, y, { align: 'center', maxWidth: ancho });
  y += 8;

  doc.setFontSize(13);
  doc.text(yaRegistrado ? 'YA PREINSCRITO' : 'PREINSCRIPCIÓN', 40, y, { align: 'center' });
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Comprobante de preregistro (no es boleta de turno)', 40, y, {
    align: 'center',
    maxWidth: ancho,
  });
  y += 8;

  doc.setDrawColor(180);
  doc.line(margen, y, 80 - margen, y);
  y += 7;

  doc.setFontSize(9);
  const filas = [
    ['Nombre', String(nombre || '—')],
    ['DPI / CUI', String(cui || '—')],
    ['Sexo', etiquetaSexo(sexo)],
    ['WhatsApp', enmascararWhatsapp(whatsapp)],
    ['Correo', String(correo || '—').slice(0, 36)],
    ['Fecha', formatearFecha(fecha)],
  ];

  filas.forEach(([label, valor]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, margen, y);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(valor, ancho - 2);
    doc.text(lines, margen, y + 4);
    y += 4 + lines.length * 4 + 2;
  });

  y += 2;
  doc.setDrawColor(180);
  doc.line(margen, y, 80 - margen, y);
  y += 4;

  const qrPayload = payloadQrPreregistro({ orgSlug, cui, nombre });
  const qrDataUrl = await QRCode.toDataURL(qrPayload, {
    width: 280,
    margin: 1,
    errorCorrectionLevel: 'M',
  });
  const qrSize = 36;
  const qrX = (80 - qrSize) / 2;
  doc.addImage(qrDataUrl, 'PNG', qrX, y, qrSize, qrSize);
  y += qrSize + 5;

  doc.setFontSize(7);
  doc.text('Presente este comprobante o su DPI en taquilla.', 40, y, {
    align: 'center',
    maxWidth: ancho,
  });
  y += 5;
  doc.text('El QR identifica su preregistro (no reemplaza la compra).', 40, y, {
    align: 'center',
    maxWidth: ancho,
  });

  const safeCui = String(cui || 'devoto').replace(/\D/g, '') || 'devoto';
  doc.save(`preregistro-${safeCui}.pdf`);
}
