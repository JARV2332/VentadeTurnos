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
      tipoTurno: labelTipoTurno(turno?.tipo_turno),
      honor: turno?.etiqueta || labelTipoTurno(turno?.tipo_turno),
      brazoLabel: `${brazo.numero_brazo ?? ''} ${brazo.lado?.[0] || ''}`.trim() || '—',
      codigo: brazo.codigo_boleta_qr || '—',
      nombre: nombreAsignado(brazo, cargador),
      dpi: cargador?.cui_o_identificacion || '—',
      whatsapp: cargador?.whatsapp || '—',
      correo: cargador?.correo || '—',
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

/** Resume solo los brazos pendientes por tipo y número de turno. */
export function resumirPendientesPorTipoYTurno(filas = []) {
  const grupos = new Map();

  filas
    .filter((fila) => fila.estadoEntrega === 'pendiente')
    .forEach((fila) => {
      const key = `${fila.procesion}|${fila.tipoTurno}|${fila.numeroTurno}`;
      const actual = grupos.get(key) || {
        procesion: fila.procesion,
        tipoTurno: fila.tipoTurno || 'Sin tipo',
        numeroTurno: fila.numeroTurno,
        honor: fila.honor || '—',
        pendientes: 0,
      };
      actual.pendientes += 1;
      grupos.set(key, actual);
    });

  return [...grupos.values()]
    .sort((a, b) => {
      const procesion = a.procesion.localeCompare(b.procesion, 'es');
      if (procesion !== 0) return procesion;
      const numeroA = Number(a.numeroTurno);
      const numeroB = Number(b.numeroTurno);
      if (!Number.isNaN(numeroA) && !Number.isNaN(numeroB) && numeroA !== numeroB) {
        return numeroA - numeroB;
      }
      return a.tipoTurno.localeCompare(b.tipoTurno, 'es');
    });
}

/** Abre el resumen de pendientes por turno listo para imprimir o guardar como PDF. */
export function exportResumenPendientesPorTurnoPdf({
  filas = [],
  orgNombre = '',
  cortejoLabel = 'Todas las procesiones',
}) {
  const totalPendientes = filas.reduce((total, fila) => total + fila.pendientes, 0);
  const porProcesion = filas.reduce((grupos, fila) => {
    const nombre = fila.procesion || 'Sin procesión';
    if (!grupos[nombre]) grupos[nombre] = [];
    grupos[nombre].push(fila);
    return grupos;
  }, {});
  const seccionesHtml = Object.entries(porProcesion)
    .map(
      ([procesion, filasProcesion]) => `
        <section class="procesion">
          <h2>${escapeHtml(procesion)}</h2>
          <table>
            <thead><tr><th>Tipo de turno</th><th>Número</th><th>Honor</th><th>Pendientes</th></tr></thead>
            <tbody>${filasProcesion
              .map(
                (fila) => `<tr>
                  <td>${escapeHtml(fila.tipoTurno)}</td>
                  <td class="numero">#${escapeHtml(fila.numeroTurno)}</td>
                  <td>${escapeHtml(fila.honor)}</td>
                  <td class="numero"><strong>${escapeHtml(fila.pendientes)}</strong></td>
                </tr>`
              )
              .join('')}</tbody>
          </table>
        </section>`
    )
    .join('');
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8" />
<title>Pendientes por tipo y turno</title>
<style>
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #172033; font: 11px "Segoe UI", Arial, sans-serif; }
  h1 { margin: 0 0 4px; font-size: 18px; }
  h2 { margin: 14px 0 5px; font-size: 13px; }
  .meta { margin: 0 0 14px; color: #526075; }
  .toolbar { margin-bottom: 12px; padding: 9px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; }
  button { margin-top: 5px; padding: 6px 11px; color: #fff; border: 0; border-radius: 4px; background: #2563eb; cursor: pointer; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 7px; text-align: left; border: 1px solid #cbd5e1; }
  th { color: #334155; background: #e2e8f0; text-transform: uppercase; font-size: 9px; }
  .numero { text-align: center; }
  @media print { .toolbar { display: none; } }
</style></head><body>
  <div class="toolbar">Reporte listo. En la impresión seleccione <strong>Guardar como PDF</strong>.<br/>
    <button onclick="window.print()">Imprimir / Guardar PDF</button>
  </div>
  <h1>Pendientes de entrega por tipo y número de turno</h1>
  <p class="meta"><strong>${escapeHtml(orgNombre)}</strong> · ${escapeHtml(cortejoLabel)} · ${totalPendientes} pendiente(s) · Generado: ${escapeHtml(new Date().toLocaleString('es-GT'))}</p>
  ${seccionesHtml || '<p>No hay pendientes.</p>'}
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 350));</script>
</body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const ventana = window.open(url, '_blank');
  if (ventana) {
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  } else {
    URL.revokeObjectURL(url);
  }
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

function escapeHtml(value) {
  return String(value ?? '—')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Abre una versión imprimible de turnos pendientes, agrupada por devoto.
 * El navegador permite imprimirla o guardarla como PDF.
 */
export function exportPendientesEntregaPdf({
  filas = [],
  orgNombre = '',
  cortejoLabel = 'Todas las procesiones',
}) {
  const pendientes = filas.filter((f) => f.estadoEntrega === 'pendiente');
  const grupos = new Map();

  pendientes.forEach((fila) => {
    const key = fila.cargador?.id || `nombre:${fila.nombre}|${fila.dpi}`;
    const grupo = grupos.get(key) || {
      nombre: fila.nombre,
      dpi: fila.dpi,
      whatsapp: fila.whatsapp,
      correo: fila.correo,
      items: [],
    };
    grupo.items.push(fila);
    grupos.set(key, grupo);
  });

  const secciones = [...grupos.values()]
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .map(
      (grupo) => `
        <section class="devoto">
          <header>
            <div>
              <h2>${escapeHtml(grupo.nombre)}</h2>
              <p>DPI: ${escapeHtml(grupo.dpi)} · WhatsApp: ${escapeHtml(grupo.whatsapp)} · Correo: ${escapeHtml(grupo.correo)}</p>
            </div>
            <strong>${grupo.items.length} turno${grupo.items.length === 1 ? '' : 's'} pendiente${grupo.items.length === 1 ? '' : 's'}</strong>
          </header>
          <table>
            <thead>
              <tr>
                <th>Procesión</th><th>Turno</th><th>Brazo</th><th>Honor</th><th>Código</th><th>Venta</th><th>Ofrenda</th>
              </tr>
            </thead>
            <tbody>
              ${grupo.items
                .map(
                  (f) => `<tr>
                    <td>${escapeHtml(f.procesion)}</td>
                    <td>#${escapeHtml(f.numeroTurno)}</td>
                    <td>${escapeHtml(f.brazoLabel)}</td>
                    <td>${escapeHtml(f.honor)}</td>
                    <td>${escapeHtml(f.codigo)}</td>
                    <td>${escapeHtml(f.vendidoEn)}</td>
                    <td>${escapeHtml(f.precio)}</td>
                  </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </section>`
    )
    .join('');

  const generado = new Date().toLocaleString('es-GT');
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8" />
<title>Pendientes de entrega</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; font-size: 10px; color: #172033; }
  h1 { margin: 0 0 4px; font-size: 17px; }
  .meta { margin: 0 0 14px; color: #526075; }
  .toolbar { margin-bottom: 12px; padding: 9px; border: 1px solid #bfdbfe; border-radius: 6px; background: #eff6ff; }
  .toolbar button { margin-top: 5px; padding: 6px 10px; border: 0; border-radius: 4px; color: #fff; background: #2563eb; cursor: pointer; }
  .devoto { margin: 0 0 12px; border: 1px solid #cbd5e1; border-radius: 6px; page-break-inside: avoid; overflow: hidden; }
  .devoto header { display: flex; justify-content: space-between; gap: 12px; padding: 8px 10px; background: #f8fafc; border-bottom: 1px solid #cbd5e1; }
  h2 { margin: 0; font-size: 12px; }
  p { margin: 3px 0 0; color: #526075; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 5px 6px; text-align: left; vertical-align: top; border-bottom: 1px solid #e2e8f0; }
  th { font-size: 8px; color: #475569; text-transform: uppercase; background: #f8fafc; }
  tr:last-child td { border-bottom: 0; }
  @media print { .toolbar { display: none; } }
</style></head>
<body>
  <div class="toolbar">Reporte listo. Use <strong>Guardar como PDF</strong> en la ventana de impresión.<br/>
    <button onclick="window.print()">Imprimir / Guardar PDF</button>
  </div>
  <h1>Turnos pendientes de entrega</h1>
  <p class="meta"><strong>${escapeHtml(orgNombre)}</strong> · ${escapeHtml(cortejoLabel)} · ${pendientes.length} turno(s) · ${grupos.size} devoto(s) · Generado: ${escapeHtml(generado)}</p>
  ${secciones || '<p>No hay turnos pendientes con los filtros actuales.</p>'}
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 350));</script>
</body></html>`;

  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const ventana = window.open(url, '_blank');
  if (ventana) {
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  } else {
    URL.revokeObjectURL(url);
  }
}
