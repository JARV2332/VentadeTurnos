import * as XLSX from 'xlsx';
import {
  labelTipoTurno,
  formatFechaReporte,
  fechaVentaKey,
  formatQ,
} from './cajaReportUtils';
import { labelMetodoPago } from './pagoUtils';
import { formatHoraVentaGt } from './turnoHorarioUtils';
import { codigoReciboDisplay } from './compraUtils';
import { etiquetaEstadoAsignacion, claseEstadoAsignacion } from './consultaDevotoUtils';

export function nombreAsignado(brazo, cargador) {
  if (cargador?.nombre_completo?.trim()) return cargador.nombre_completo.trim();
  if (brazo?.asignado_nombre?.trim()) return brazo.asignado_nombre.trim();
  return '—';
}

function brazosDeTurnoAgrupado(turnoGrupo) {
  return [...(turnoGrupo.izquierda || []), ...(turnoGrupo.derecha || [])];
}

function filaPasaFiltros(brazo, filtros) {
  const esVendido = brazo.estado === 'vendido';
  const esApartado = brazo.estado === 'reservado' && brazo.reserva_apartado;
  const esAsignado = esVendido || esApartado;

  if (filtros.soloAsignados && !esAsignado) return false;

  if (filtros.estado === 'vendido' && !esVendido) return false;
  if (filtros.estado === 'apartado' && !esApartado) return false;
  if (filtros.estado === 'asignado' && !esAsignado) return false;

  if ((filtros.fechaDesde || filtros.fechaHasta) && esVendido) {
    const k = fechaVentaKey(brazo);
    if (!k) return false;
    if (filtros.fechaDesde && k < filtros.fechaDesde) return false;
    if (filtros.fechaHasta && k > filtros.fechaHasta) return false;
  }
  if ((filtros.fechaDesde || filtros.fechaHasta) && !esVendido && filtros.soloPagadosEnFecha) {
    return false;
  }

  return true;
}

export function construirFilaListado(brazo, turno, comprasPorId = {}) {
  const cargador = brazo.cargador || null;
  const compra = brazo.compra_id ? comprasPorId[brazo.compra_id] : null;
  const esVendido = brazo.estado === 'vendido';

  return {
    id: brazo.id,
    brazo,
    turno,
    cargador,
    compra,
    nombre: nombreAsignado(brazo, cargador),
    brazoLabel: `${brazo.numero_brazo} ${brazo.lado?.[0] || ''}`.trim(),
    estadoLabel: etiquetaEstadoAsignacion(brazo),
    estadoClass: claseEstadoAsignacion(brazo),
    metodoPago: esVendido ? labelMetodoPago(brazo.metodo_pago || compra?.metodo_pago) : '—',
    fechaOperacion: esVendido ? formatFechaReporte(fechaVentaKey(brazo)) : '—',
    horaOperacion: esVendido
      ? formatHoraVentaGt(brazo.pago_confirmado_en || brazo.updated_at) || '—'
      : '—',
    codigoBoleta: esVendido ? codigoReciboDisplay(compra, [brazo]) : '—',
    ofrenda: esVendido ? formatQ(brazo.precio_pagado) : '—',
    puedeVerBoleta: esVendido && Boolean(brazo.codigo_boleta_qr),
    codigoBusqueda: brazo.codigo_boleta_qr || null,
  };
}

export function construirListadoTurnos(turnosAgrupados, comprasPorId, filtros = {}) {
  const compras = comprasPorId || {};
  const lista = (turnosAgrupados || [])
    .filter((turno) => {
      if (filtros.tipoTurno && filtros.tipoTurno !== 'all') {
        return (turno.tipo_turno || '') === filtros.tipoTurno;
      }
      if (filtros.numeroTurno?.trim()) {
        return String(turno.numero_turno) === String(filtros.numeroTurno).trim();
      }
      return true;
    })
    .map((turno) => {
      const filas = brazosDeTurnoAgrupado(turno)
        .filter((b) => filaPasaFiltros(b, filtros))
        .map((b) => construirFilaListado(b, turno, compras))
        .sort(
          (a, b) =>
            (a.brazo.numero_brazo || 0) - (b.brazo.numero_brazo || 0) ||
            String(a.brazo.lado || '').localeCompare(String(b.brazo.lado || ''))
        );

      return {
        turno,
        numero: turno.numero_turno,
        honor: turno.etiqueta || labelTipoTurno(turno.tipo_turno),
        filas,
      };
    })
    .filter((grupo) => {
      if (filtros.ocultarVacios && !grupo.filas.length) return false;
      return true;
    });

  return lista;
}

export function tiposTurnoEnListado(turnosAgrupados) {
  const set = new Set();
  (turnosAgrupados || []).forEach((t) => {
    if (t.tipo_turno) set.add(t.tipo_turno);
  });
  return [...set].sort();
}

export function exportListadoTurnosExcel({ grupos, cortejoNombre, orgNombre = '' }) {
  const wb = XLSX.utils.book_new();
  const generado = new Intl.DateTimeFormat('es-GT', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date());

  const filas = [];
  (grupos || []).forEach((g) => {
    g.filas.forEach((f) => {
      filas.push({
        Turno: g.numero,
        Honor: g.honor,
        Brazo: f.brazoLabel,
        Persona: f.nombre,
        Estado: f.estadoLabel,
        'Fecha operación': f.fechaOperacion,
        Hora: f.horaOperacion,
        Pago: f.metodoPago,
        Boleta: f.codigoBoleta,
        Ofrenda: f.ofrenda,
      });
    });
  });

  const meta = [
    ['Listado de turnos asignados'],
    [orgNombre || 'Organización'],
    [cortejoNombre || 'Procesión'],
    [`Generado: ${generado}`],
    [],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(meta), 'Info');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), 'Turnos');
  XLSX.writeFile(wb, `listado-turnos-${Date.now()}.xlsx`);
}
