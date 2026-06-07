/** Payload del QR — solo el código de boleta (validación en pantalla Entrega). */
export function getQrPayload(codigoBoleta) {
  return codigoBoleta || '';
}

export function extraerCodigoBoleta(texto) {
  if (!texto) return '';
  const trimmed = texto.trim();
  const urlMatch = trimmed.match(/[?&]codigo=([^&]+)/i);
  if (urlMatch) return decodeURIComponent(urlMatch[1]).trim().toUpperCase();
  const codeMatch = trimmed.match(/VT-[A-Z0-9]+/i);
  if (codeMatch) return codeMatch[0].toUpperCase();
  return trimmed.toUpperCase();
}

export function formatPrecio(valor) {
  return new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(valor || 0);
}

/** Etiqueta de pago en boletas: "Ofrenda Q 150.00" */
export function formatOfrenda(valor) {
  return `Ofrenda ${formatPrecio(valor)}`;
}

/** Fecha larga en español: "domingo, 14 de julio de 2024" */
export function formatFechaLarga(fecha = new Date()) {
  const d = fecha instanceof Date ? fecha : new Date(`${fecha}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  const raw = d.toLocaleDateString('es-GT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Fecha de procesión: "15 de agosto de 2024" */
export function formatFechaEvento(fecha) {
  if (!fecha) return '';
  const d = new Date(`${String(fecha).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-GT', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Día y mes: "15 de agosto" */
export function formatFechaDiaMes(fecha) {
  if (!fecha) return '';
  const d = new Date(`${String(fecha).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-GT', { day: 'numeric', month: 'long' });
}

export function anioDeFecha(fecha) {
  if (!fecha) return String(new Date().getFullYear());
  const d = new Date(`${String(fecha).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(new Date().getFullYear());
  return String(d.getFullYear());
}
