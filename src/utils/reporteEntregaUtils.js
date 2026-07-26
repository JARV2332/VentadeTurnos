import * as XLSX from 'xlsx';
import { labelTipoTurno, formatQ } from './cajaReportUtils';
import { nombreAsignado } from './listadoTurnosUtils';

function ymdLocal(isoOrDate) {
  if (!isoOrDate) return '';
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatFechaHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-GT', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

function pasaRangoFecha(ymd, desde, hasta) {
  if (!desde && !hasta) return true;
  if (!ymd) return false;
  if (desde && ymd < desde) return false;
  if (hasta && ymd > hasta) return false;
  return true;
}

export function mapaOperadoresEntrega(usuarios = []) {
  const porAuth = {};
  for (const u of usuarios || []) {
    if (!u?.auth_user_id) continue;
    porAuth[u.auth_user_id] = u.nombre?.trim() || u.email?.trim() || 'Operador';
  }
  return porAuth;
}

export function opcionesOperadoresEntrega(brazos = [], operadoresPorAuth = {}) {
  const ids = new Set();
  for (const b of brazos || []) {
    if (b?.entregado_por) ids.add(b.entregado_por);
  }
  return [...ids]
    .map((id) => ({
      id,
      label: operadoresPorAuth[id] || `Usuario ${String(id).slice(0, 8)}…`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));
}

/**
 * Construye filas del reporte de entrega con filtros en cliente.
 * filtros: { cortejoId, estado, fechaDesde, fechaHasta, entregadoPor, receptor, busqueda }
 * estado: '' | 'entregado' | 'pendiente'
 * receptor: '' | 'titular' | 'tercero'
 */
export function construirReporteEntrega({
  brazos = [],
  turnosPorId = {},
  cortejosPorId = {},
  cargadoresPorId = {},
  operadoresPorAuth = {},
  filtros = {},
}) {
  const estadoFiltro = filtros.estado || '';
  const receptorFiltro = filtros.receptor || '';
  const q = String(filtros.busqueda || '')
    .trim()
    .toLowerCase();

  let lista = (brazos || []).filter((b) => b?.estado === 'vendido');

  if (estadoFiltro === 'entregado') {
    lista = lista.filter((b) => b.estado_entrega === 'entregado');
  } else if (estadoFiltro === 'pendiente') {
    lista = lista.filter((b) => b.estado_entrega !== 'entregado');
  }

  if (filtros.cortejoId) {
    lista = lista.filter(
      (b) => turnosPorId[b.turno_id]?.cortejo_id === filtros.cortejoId
    );
  }

  if (filtros.entregadoPor) {
    lista = lista.filter((b) => b.entregado_por === filtros.entregadoPor);
  }

  if (receptorFiltro === 'tercero') {
    lista = lista.filter((b) => Boolean(b.entregado_a_tercero));
  } else if (receptorFiltro === 'titular') {
    lista = lista.filter(
      (b) => b.estado_entrega === 'entregado' && !b.entregado_a_tercero
    );
  }

  if (filtros.fechaDesde || filtros.fechaHasta) {
    lista = lista.filter((b) => {
      const esEntregado = b.estado_entrega === 'entregado';
      const iso = esEntregado
        ? b.entregado_en
        : b.pago_confirmado_en || b.updated_at || b.created_at;
      return pasaRangoFecha(ymdLocal(iso), filtros.fechaDesde, filtros.fechaHasta);
    });
  }

  const filas = lista.map((brazo) => {
    const turno = turnosPorId[brazo.turno_id] || null;
    const cortejo = turno?.cortejo_id ? cortejosPorId[turno.cortejo_id] : null;
    const cargador = brazo.cargador_id ? cargadoresPorId[brazo.cargador_id] : null;
    const entregado = brazo.estado_entrega === 'entregado';
    const operadorEntrega = brazo.entregado_por
      ? operadoresPorAuth[brazo.entregado_por] || '—'
      : '—';

    return {
      id: brazo.id,
      brazo,
      turno,
      cortejo,
      cargador,
      procesion: cortejo?.nombre_evento || '—',
      numeroTurno: turno?.numero_turno ?? brazo.numero_turno ?? '—',
      honor: turno?.etiqueta || labelTipoTurno(turno?.tipo_turno),
      brazoLabel: `${brazo.numero_brazo ?? ''} ${brazo.lado?.[0] || ''}`.trim() || '—',
      codigo: brazo.codigo_boleta_qr || '—',
      nombre: nombreAsignado(brazo, cargador),
      dpi: cargador?.cui_o_identificacion || '—',
      whatsapp: cargador?.whatsapp || '—',
      estadoEntrega: entregado ? 'entregado' : 'pendiente',
      estadoLabel: entregado ? 'Entregado' : 'Pendiente',
      entregadoEn: formatFechaHora(brazo.entregado_en),
      entregadoEnTs: brazo.entregado_en ? new Date(brazo.entregado_en).getTime() : 0,
      operadorEntrega,
      receptor: entregado
        ? brazo.entregado_a_tercero
          ? `Tercero: ${brazo.entregado_receptor_nombre || '—'}`
          : 'Titular'
        : '—',
      precio: brazo.precio_pagado != null ? formatQ(brazo.precio_pagado) : '—',
      vendidoEn: formatFechaHora(brazo.pago_confirmado_en),
    };
  });

  let resultado = filas;
  if (q) {
    resultado = filas.filter((f) => {
      const blob = [
        f.nombre,
        f.dpi,
        f.procesion,
        f.numeroTurno,
        f.brazoLabel,
        f.codigo,
        f.operadorEntrega,
        f.receptor,
        f.whatsapp,
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }

  return resultado.sort((a, b) => {
    if (a.estadoEntrega !== b.estadoEntrega) {
      return a.estadoEntrega === 'pendiente' ? -1 : 1;
    }
    if (a.entregadoEnTs !== b.entregadoEnTs) {
      return b.entregadoEnTs - a.entregadoEnTs;
    }
    const t = Number(a.numeroTurno) - Number(b.numeroTurno);
    if (!Number.isNaN(t) && t !== 0) return t;
    return String(a.brazoLabel).localeCompare(String(b.brazoLabel), 'es');
  });
}

export function resumenReporteEntrega(filas = []) {
  const total = filas.length;
  const entregados = filas.filter((f) => f.estadoEntrega === 'entregado').length;
  const pendientes = total - entregados;
  const aTercero = filas.filter((f) => f.brazo?.entregado_a_tercero).length;
  return { total, entregados, pendientes, aTercero };
}

export function exportReporteEntregaExcel({
  filas = [],
  resumen = {},
  orgNombre = '',
  filtros = {},
}) {
  const wb = XLSX.utils.book_new();
  const meta = [
    ['Reporte de entrega de turnos'],
    ['Organización', orgNombre || '—'],
    ['Generado', new Date().toLocaleString('es-GT')],
    ['Procesión', filtros.cortejoLabel || 'Todas'],
    ['Estado', filtros.estadoLabel || 'Todos'],
    ['Fecha desde', filtros.fechaDesde || '—'],
    ['Fecha hasta', filtros.fechaHasta || '—'],
    ['Operador entrega', filtros.operadorLabel || 'Todos'],
    [],
    ['Total', resumen.total ?? filas.length],
    ['Entregados', resumen.entregados ?? 0],
    ['Pendientes', resumen.pendientes ?? 0],
    ['Entrega a tercero', resumen.aTercero ?? 0],
  ];

  const datos = filas.map((f) => ({
    Procesión: f.procesion,
    Turno: f.numeroTurno,
    Honor: f.honor,
    Brazo: f.brazoLabel,
    Código: f.codigo,
    Devoto: f.nombre,
    DPI: f.dpi,
    WhatsApp: f.whatsapp,
    Estado: f.estadoLabel,
    'Fecha entrega': f.entregadoEn,
    'Entregó': f.operadorEntrega,
    Receptor: f.receptor,
    Ofrenda: f.precio,
    'Fecha venta': f.vendidoEn,
  }));

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(meta), 'Resumen');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(datos), 'Entregas');
  XLSX.writeFile(wb, `reporte-entrega-turnos-${Date.now()}.xlsx`);
}
