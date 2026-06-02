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
