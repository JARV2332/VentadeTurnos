/** Payload para revertir un brazo vendido a disponible. */
export const RESET_BRAZO_VENTA = {
  estado: 'disponible',
  cargador_id: null,
  codigo_boleta_qr: null,
  precio_pagado: null,
  compra_id: null,
  bloqueado_hasta: null,
  vendedor_id: null,
  mesa_id: null,
  metodo_pago: null,
  comprobante_url: null,
  pago_confirmado_en: null,
  operador_nombre: null,
  estado_entrega: 'pendiente',
  entregado_en: null,
  entregado_por: null,
  reserva_apartado: false,
  asignado_nombre: null,
  apartado_notas: null,
};

export function normalizarCodigoBoleta(codigo) {
  return (
    String(codigo || '')
      .trim()
      .toUpperCase()
      .match(/V[RT]-[A-Z0-9]+/)?.[0] || String(codigo || '').trim().toUpperCase()
  );
}
