import { formatPrecio } from './boletaUtils';
import { etiquetaHonorTurno } from './turnoUtils';

/** Agrupa ítems de compra para tabla del recibo: cantidad, turno, ofrenda unitaria. */
export function construirLineasRecibo(items) {
  const lista = Array.isArray(items) ? items : [];
  const map = new Map();

  lista.forEach(({ brazo, turno }) => {
    if (!brazo) return;
    const precio = Number(brazo.precio_pagado ?? turno?.precio ?? 0);
    const numero = brazo.numero_turno ?? turno?.numero_turno ?? '—';
    const etiqueta = etiquetaHonorTurno(turno || {});
    const key = `${turno?.id || brazo.turno_id}-${precio}-${numero}-${etiqueta}`;

    const prev = map.get(key);
    if (prev) {
      prev.cantidad += 1;
      prev.subtotal += precio;
    } else {
      map.set(key, {
        cantidad: 1,
        numero_turno: numero,
        etiqueta,
        ofrenda: precio,
        subtotal: precio,
      });
    }
  });

  const lineas = [...map.values()].map((l) => ({
    ...l,
    ofrendaUnitaria: l.ofrenda,
    ofrendaTotal: l.subtotal,
    ofrendaUnitariaFmt: formatPrecio(l.ofrenda),
    ofrendaTotalFmt: formatPrecio(l.subtotal),
  }));
  const total = lineas.reduce((sum, l) => sum + l.subtotal, 0);
  return { lineas, total, totalFmt: formatPrecio(total) };
}

export function codigoReciboDisplay(compra, brazos) {
  if (compra?.codigo_recibo) return compra.codigo_recibo;
  if (brazos?.length === 1) return brazos[0]?.codigo_boleta_qr || '—';
  return brazos?.[0]?.codigo_boleta_qr || '—';
}
