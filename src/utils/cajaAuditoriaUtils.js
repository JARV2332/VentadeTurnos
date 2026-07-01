import { timestampVenta, formatQ } from './cajaReportUtils';
import { formatHoraVentaGt } from './turnoHorarioUtils';

function claveBrazoFisico(v) {
  return `${v.turno_id}|${v.numero_brazo}|${v.lado}`;
}

/** Mismo brazo físico vendido más de una vez (no debería ocurrir). */
export function detectarBrazosDuplicados(ventas) {
  const mapa = new Map();
  const duplicados = [];

  (ventas || []).forEach((v) => {
    const key = claveBrazoFisico(v);
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

/** Agrupa filas del detalle (1 fila = 1 brazo) en compras lógicas VR/VT. */
export function agruparVentasPorCompra(ventas, compras = []) {
  const recibosPorId = Object.fromEntries(
    (compras || []).map((c) => [c.id, c.codigo_recibo])
  );
  const mapa = new Map();

  (ventas || []).forEach((v) => {
    const key = v.compra_id ? `c:${v.compra_id}` : `vt:${v.codigo_boleta_qr || v.id}`;
    if (!mapa.has(key)) {
      mapa.set(key, {
        compra_id: v.compra_id || null,
        codigo_recibo: v.compra_id ? recibosPorId[v.compra_id] || null : null,
        cargador_id: v.cargador_id || null,
        ts: timestampVenta(v),
        total: 0,
        brazos: [],
        clavesBrazo: new Set(),
        turnos: new Set(),
        operador: v.operador_nombre || '—',
      });
    }
    const g = mapa.get(key);
    g.total += Number(v.precio_pagado || 0);
    g.brazos.push({
      turno: v.numero_turno,
      numero: v.numero_brazo,
      lado: v.lado,
      codigo: v.codigo_boleta_qr,
    });
    g.clavesBrazo.add(claveBrazoFisico(v));
    g.turnos.add(v.numero_turno);
    const ts = timestampVenta(v);
    if (ts != null && (g.ts == null || ts < g.ts)) g.ts = ts;
  });

  return [...mapa.values()].sort((a, b) => (a.ts || 0) - (b.ts || 0));
}

function resumenBrazosCompra(compra) {
  const partes = compra.brazos.map((b) => `#${b.turno} · ${b.numero}${b.lado?.[0] || ''}`);
  return partes.join(', ');
}

/**
 * Mismo devoto, dos compras distintas (VR) en pocos minutos Y el mismo brazo físico en ambas.
 * Mismo turno con brazos distintos en una o varias compras NO es alerta.
 */
export function detectarDobleCobroMismoBrazo(ventas, compras = [], ventanaMs = 5 * 60 * 1000) {
  const comprasLog = agruparVentasPorCompra(ventas, compras);
  const porDevoto = new Map();

  comprasLog.forEach((c) => {
    if (!c.cargador_id) return;
    if (!porDevoto.has(c.cargador_id)) porDevoto.set(c.cargador_id, []);
    porDevoto.get(c.cargador_id).push(c);
  });

  const alertas = [];

  porDevoto.forEach((lista, cargadorId) => {
    const ordenadas = [...lista].sort((a, b) => (a.ts || 0) - (b.ts || 0));
    for (let i = 0; i < ordenadas.length; i += 1) {
      for (let j = i + 1; j < ordenadas.length; j += 1) {
        const a = ordenadas[i];
        const b = ordenadas[j];
        if (a.ts == null || b.ts == null) continue;
        const diff = b.ts - a.ts;
        if (diff <= 0 || diff > ventanaMs) continue;

        const solapados = [...a.clavesBrazo].filter((k) => b.clavesBrazo.has(k));
        if (!solapados.length) continue;

        alertas.push({
          cargador_id: cargadorId,
          minutosEntre: Math.max(1, Math.round(diff / 60000)),
          compras: [a, b],
          brazosSolapados: solapados.length,
          totalCombinado: a.total + b.total,
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
  const comprasAgrupadas = agruparVentasPorCompra(lista, compras);
  const brazosDuplicados = detectarBrazosDuplicados(lista);
  const dobleCobroBrazo = detectarDobleCobroMismoBrazo(lista, compras);
  const comprasHuerfanas = detectarComprasHuerfanas(compras, lista);

  const totalDobleCobro = dobleCobroBrazo.reduce((s, a) => s + a.totalCombinado, 0);
  const totalHuerfanas = comprasHuerfanas.reduce(
    (s, c) => s + Number(c.total_pagado || 0),
    0
  );

  const comprasMultiplesBrazos = comprasAgrupadas.filter((c) => c.brazos.length > 1).length;

  return {
    comprasAgrupadas,
    brazosDuplicados,
    dobleCobroBrazo,
    comprasHuerfanas,
    resumen: {
      ventas: lista.length,
      comprasUnicas: comprasAgrupadas.length,
      comprasMultiplesBrazos,
      alertasDuplicadoBrazo: brazosDuplicados.length,
      alertasDobleCobro: dobleCobroBrazo.length,
      comprasHuerfanas: comprasHuerfanas.length,
      montoDobleCobro: totalDobleCobro,
      montoComprasHuerfanas: totalHuerfanas,
    },
  };
}

export function formatAlertaDobleCobro(alerta) {
  const [a, b] = alerta.compras;
  const horaA = a.ts ? formatHoraVentaGt(new Date(a.ts).toISOString()) : '—';
  const horaB = b.ts ? formatHoraVentaGt(new Date(b.ts).toISOString()) : '—';
  const recA = a.codigo_recibo || a.brazos[0]?.codigo || '—';
  const recB = b.codigo_recibo || b.brazos[0]?.codigo || '—';
  return `${horaA} (${recA}: ${resumenBrazosCompra(a)}) y ${horaB} (${recB}: ${resumenBrazosCompra(b)}) · ${alerta.brazosSolapados} brazo(s) repetido(s)`;
}

export function formatCompraAgrupada(compra) {
  const hora = compra.ts ? formatHoraVentaGt(new Date(compra.ts).toISOString()) : '—';
  const recibo = compra.codigo_recibo || compra.brazos[0]?.codigo || '—';
  const turnos = [...compra.turnos].sort((a, b) => a - b).join(', ');
  return `${hora} · ${recibo} · turno(s) ${turnos} · ${compra.brazos.length} brazo(s) · ${formatQ(compra.total)}`;
}
