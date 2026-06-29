import { timestampVenta, formatQ } from './cajaReportUtils';
import { formatHoraVentaGt } from './turnoHorarioUtils';

/** Mismo brazo físico vendido más de una vez (no debería ocurrir). */
export function detectarBrazosDuplicados(ventas) {
  const mapa = new Map();
  const duplicados = [];

  (ventas || []).forEach((v) => {
    const key = `${v.turno_id}|${v.numero_brazo}|${v.lado}`;
    if (mapa.has(key)) {
      duplicados.push({
        turno: v.numero_turno,
        brazo: `${v.numero_brazo} ${v.lado}`,
        registros: [mapa.get(key), v],
      });
    } else {
      mapa.set(key, v);
    }
  });

  return duplicados;
}

/**
 * Mismo devoto con varios recibos (VR) en pocos minutos — posible doble cobro por reconexión.
 * ventanaMs default 5 min.
 */
export function detectarRecibosRapidosMismoDevoto(ventas, ventanaMs = 5 * 60 * 1000) {
  const porDevoto = new Map();

  (ventas || []).forEach((v) => {
    if (!v.cargador_id) return;
    if (!porDevoto.has(v.cargador_id)) porDevoto.set(v.cargador_id, []);
    porDevoto.get(v.cargador_id).push(v);
  });

  const alertas = [];

  porDevoto.forEach((lista, cargadorId) => {
    const porCompra = new Map();
    lista.forEach((v) => {
      const compraKey = v.compra_id || v.codigo_boleta_qr || v.id;
      if (!porCompra.has(compraKey)) {
        porCompra.set(compraKey, {
          compra_id: v.compra_id,
          codigo: v.codigo_boleta_qr,
          ts: timestampVenta(v),
          total: 0,
          turnos: new Set(),
          operador: v.operador_nombre || '—',
        });
      }
      const entry = porCompra.get(compraKey);
      entry.total += Number(v.precio_pagado || 0);
      entry.turnos.add(v.numero_turno);
      const ts = timestampVenta(v);
      if (ts != null && (entry.ts == null || ts < entry.ts)) entry.ts = ts;
    });

    const compras = [...porCompra.values()].sort((a, b) => (a.ts || 0) - (b.ts || 0));
    if (compras.length < 2) return;

    for (let i = 1; i < compras.length; i += 1) {
      const prev = compras[i - 1];
      const curr = compras[i];
      if (prev.ts == null || curr.ts == null) continue;
      const diff = curr.ts - prev.ts;
      if (diff > 0 && diff <= ventanaMs) {
        alertas.push({
          cargador_id: cargadorId,
          minutosEntre: Math.max(1, Math.round(diff / 60000)),
          compras: [prev, curr],
          totalCombinado: prev.total + curr.total,
        });
      }
    }
  });

  return alertas.sort((a, b) => b.totalCombinado - a.totalCombinado);
}

/** Compras activas en BD sin brazos vendidos ligados (huérfanas). */
export function detectarComprasHuerfanas(compras, ventas) {
  const idsConBrazos = new Set(
    (ventas || []).map((v) => v.compra_id).filter(Boolean)
  );
  return (compras || []).filter(
    (c) =>
      c.estado !== 'anulada' &&
      c.id &&
      !idsConBrazos.has(c.id)
  );
}

export function auditarVentasCaja({ ventas, compras = [] }) {
  const lista = ventas || [];
  const brazosDuplicados = detectarBrazosDuplicados(lista);
  const recibosRapidos = detectarRecibosRapidosMismoDevoto(lista);
  const comprasHuerfanas = detectarComprasHuerfanas(compras, lista);

  const totalRecibosRapidos = recibosRapidos.reduce((s, a) => s + a.totalCombinado, 0);
  const totalHuerfanas = comprasHuerfanas.reduce(
    (s, c) => s + Number(c.total_pagado || 0),
    0
  );

  return {
    brazosDuplicados,
    recibosRapidos,
    comprasHuerfanas,
    resumen: {
      ventas: lista.length,
      alertasDuplicadoBrazo: brazosDuplicados.length,
      alertasRecibosRapidos: recibosRapidos.length,
      comprasHuerfanas: comprasHuerfanas.length,
      montoSospechosoRecibos: totalRecibosRapidos,
      montoComprasHuerfanas: totalHuerfanas,
    },
  };
}

export function formatAlertaReciboRapido(alerta) {
  const [a, b] = alerta.compras;
  const horaA = a.ts ? formatHoraVentaGt(new Date(a.ts).toISOString()) : '—';
  const horaB = b.ts ? formatHoraVentaGt(new Date(b.ts).toISOString()) : '—';
  return `${horaA} y ${horaB} (${alerta.minutosEntre} min) · ${formatQ(alerta.totalCombinado)}`;
}
