import { labelTipoTurno, fechaVentaKey, formatFechaReporte } from './cajaReportUtils';
import { formatHoraVentaGt } from './turnoHorarioUtils';
import { cargadorCoincideBusqueda, normalizarTextoBusqueda } from './consultaDevotoUtils';
import { codigoReciboDisplay } from './compraUtils';
import { nombreAsignado } from './listadoTurnosUtils';

export function esPendienteEntrega(brazo) {
  return brazo?.estado === 'vendido' && brazo?.estado_entrega !== 'entregado';
}

function filaCoincideBusqueda(fila, busqueda) {
  const q = String(busqueda || '').trim();
  if (!q) return true;
  const qNorm = normalizarTextoBusqueda(q);
  const qDigits = q.replace(/\D/g, '');

  if (fila.cargador && cargadorCoincideBusqueda(fila.cargador, q)) return true;

  const nombre = normalizarTextoBusqueda(fila.nombre);
  if (nombre && nombre.includes(qNorm)) return true;

  const codigo = normalizarTextoBusqueda(fila.codigoBoleta);
  if (codigo && (codigo.includes(qNorm) || (qDigits && codigo.includes(qDigits)))) return true;

  return false;
}

export function construirFilasPendientesEntrega({
  brazos = [],
  turnosPorId = {},
  cortejosPorId = {},
  cargadoresPorId = {},
  comprasPorId = {},
  filtros = {},
  busqueda = '',
}) {
  let lista = (brazos || []).filter(esPendienteEntrega);

  if (filtros.cortejoId) {
    lista = lista.filter((b) => turnosPorId[b.turno_id]?.cortejo_id === filtros.cortejoId);
  }
  if (filtros.numeroTurno?.trim()) {
    const n = String(filtros.numeroTurno).trim();
    lista = lista.filter((b) => String(turnosPorId[b.turno_id]?.numero_turno) === n);
  }

  const filas = lista.map((brazo) => {
    const turno = turnosPorId[brazo.turno_id] || null;
    const cortejo = turno?.cortejo_id ? cortejosPorId[turno.cortejo_id] : null;
    const cargador = brazo.cargador_id ? cargadoresPorId[brazo.cargador_id] : null;
    const compra = brazo.compra_id ? comprasPorId[brazo.compra_id] : null;

    return {
      id: brazo.id,
      brazo,
      turno,
      cortejo,
      cargador,
      compra,
      procesion: cortejo?.nombre_evento || '—',
      numeroTurno: turno?.numero_turno ?? brazo.numero_turno ?? '—',
      honor: turno?.etiqueta || labelTipoTurno(turno?.tipo_turno),
      brazoLabel: `${brazo.numero_brazo} ${brazo.lado?.[0] || ''}`.trim(),
      nombre: nombreAsignado(brazo, cargador),
      codigoBoleta: codigoReciboDisplay(compra, [brazo]),
      codigoBusqueda: brazo.codigo_boleta_qr || null,
      fechaPago: formatFechaReporte(fechaVentaKey(brazo)),
      horaPago: formatHoraVentaGt(brazo.pago_confirmado_en || brazo.updated_at) || '—',
    };
  });

  return filas
    .filter((f) => filaCoincideBusqueda(f, busqueda))
    .sort((a, b) => {
      const pa = a.procesion.localeCompare(b.procesion, 'es');
      if (pa !== 0) return pa;
      const na = Number(a.numeroTurno) || 0;
      const nb = Number(b.numeroTurno) || 0;
      if (na !== nb) return na - nb;
      return (a.brazo.numero_brazo || 0) - (b.brazo.numero_brazo || 0);
    });
}
