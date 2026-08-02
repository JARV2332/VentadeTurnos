import * as XLSX from 'xlsx';
import { labelTipoTurno, fechaVentaKey, formatFechaReporte } from './cajaReportUtils';
import { formatHoraVentaGt } from './turnoHorarioUtils';
import { cargadorCoincideBusqueda, normalizarTextoBusqueda } from './consultaDevotoUtils';
import { codigoReciboDisplay } from './compraUtils';
import { nombreAsignado } from './listadoTurnosUtils';

export const TIPOS_HONOR = ['Salida', 'Entrada', 'Extraordinario'];

export function esPendienteEntrega(brazo) {
  return brazo?.estado === 'vendido' && brazo?.estado_entrega !== 'entregado';
}

export function esTipoHonor(tipo) {
  const label = labelTipoTurno(tipo);
  return TIPOS_HONOR.includes(label) || TIPOS_HONOR.includes(tipo);
}

function filaCoincideBusqueda(fila, busqueda) {
  const q = String(busqueda || '').trim();
  if (!q) return true;
  const qNorm = normalizarTextoBusqueda(q);
  const qDigits = q.replace(/\D/g, '');

  if (fila.cargador && cargadorCoincideBusqueda(fila.cargador, q)) return true;

  const nombre = normalizarTextoBusqueda(fila.nombre);
  if (nombre && nombre.includes(qNorm)) return true;

  const codigo = normalizarTextoBusqueda(fila.codigoBoleta || fila.codigo);
  if (codigo && (codigo.includes(qNorm) || (qDigits && codigo.includes(qDigits)))) return true;

  return false;
}

function ordenTipoTurno(tipo) {
  const label = labelTipoTurno(tipo);
  const orden = { Salida: 1, Extraordinario: 2, Ordinario: 3, Entrada: 4 };
  return orden[label] || 50;
}

/**
 * filtros: { cortejoId, numeroTurno, tipoGrupo: ''|'honor'|'ordinario'|tipo exacto,
 *            turnoIds: string[], busqueda }
 */
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
  if (filtros.numeroTurno?.toString().trim()) {
    const n = String(filtros.numeroTurno).trim();
    lista = lista.filter((b) => String(turnosPorId[b.turno_id]?.numero_turno) === n);
  }
  if (filtros.turnoIds?.length) {
    const set = new Set(filtros.turnoIds);
    lista = lista.filter((b) => set.has(b.turno_id));
  }
  if (filtros.tipoGrupo === 'honor') {
    lista = lista.filter((b) => esTipoHonor(turnosPorId[b.turno_id]?.tipo_turno));
  } else if (filtros.tipoGrupo === 'ordinario') {
    lista = lista.filter(
      (b) => labelTipoTurno(turnosPorId[b.turno_id]?.tipo_turno) === 'Ordinario'
    );
  } else if (filtros.tipoGrupo) {
    const tipo = String(filtros.tipoGrupo);
    lista = lista.filter(
      (b) => labelTipoTurno(turnosPorId[b.turno_id]?.tipo_turno) === labelTipoTurno(tipo)
    );
  }

  const filas = lista.map((brazo) => {
    const turno = turnosPorId[brazo.turno_id] || null;
    const cortejo = turno?.cortejo_id ? cortejosPorId[turno.cortejo_id] : null;
    const cargador = brazo.cargador_id ? cargadoresPorId[brazo.cargador_id] : null;
    const compra = brazo.compra_id ? comprasPorId[brazo.compra_id] : null;
    const tipoTurno = labelTipoTurno(turno?.tipo_turno);

    return {
      id: brazo.id,
      brazo,
      turno,
      cortejo,
      cargador,
      compra,
      turnoId: brazo.turno_id,
      procesion: cortejo?.nombre_evento || '—',
      tipoTurno,
      numeroTurno: turno?.numero_turno ?? brazo.numero_turno ?? '—',
      honor: turno?.etiqueta || tipoTurno,
      brazoLabel: `${brazo.numero_brazo ?? ''} ${brazo.lado?.[0] || ''}`.trim() || '—',
      nombre: nombreAsignado(brazo, cargador),
      dpi: cargador?.cui_o_identificacion || '—',
      whatsapp: cargador?.whatsapp || '—',
      correo: cargador?.correo || '—',
      codigo: brazo.codigo_boleta_qr || '—',
      codigoBoleta: codigoReciboDisplay(compra, [brazo]),
      codigoBusqueda: brazo.codigo_boleta_qr || null,
      fechaPago: formatFechaReporte(fechaVentaKey(brazo)),
      horaPago: formatHoraVentaGt(brazo.pago_confirmado_en || brazo.updated_at) || '—',
      precio: brazo.precio_pagado,
    };
  });

  return filas
    .filter((f) => filaCoincideBusqueda(f, busqueda || filtros.busqueda))
    .sort((a, b) => {
      const ta = ordenTipoTurno(a.tipoTurno) - ordenTipoTurno(b.tipoTurno);
      if (ta !== 0) return ta;
      const na = Number(a.numeroTurno) || 0;
      const nb = Number(b.numeroTurno) || 0;
      if (na !== nb) return na - nb;
      const nom = a.nombre.localeCompare(b.nombre, 'es');
      if (nom !== 0) return nom;
      return String(a.brazoLabel).localeCompare(String(b.brazoLabel), 'es');
    });
}

/** Agrupa filas: Tipo → número de turno → items */
export function agruparPendientesPorTipoYTurno(filas = []) {
  const porTipo = new Map();

  filas.forEach((fila) => {
    const tipo = fila.tipoTurno || 'Sin tipo';
    if (!porTipo.has(tipo)) porTipo.set(tipo, new Map());
    const porTurno = porTipo.get(tipo);
    const key = String(fila.numeroTurno);
    if (!porTurno.has(key)) {
      porTurno.set(key, {
        tipoTurno: tipo,
        numeroTurno: fila.numeroTurno,
        honor: fila.honor,
        turnoId: fila.turnoId,
        items: [],
      });
    }
    porTurno.get(key).items.push(fila);
  });

  return [...porTipo.entries()]
    .sort((a, b) => ordenTipoTurno(a[0]) - ordenTipoTurno(b[0]))
    .map(([tipoTurno, turnosMap]) => {
      const turnos = [...turnosMap.values()].sort(
        (a, b) => (Number(a.numeroTurno) || 0) - (Number(b.numeroTurno) || 0)
      );
      const total = turnos.reduce((s, t) => s + t.items.length, 0);
      return { tipoTurno, turnos, total };
    });
}

/** Turnos que tienen al menos un pendiente (para el modal de selección). */
export function opcionesTurnosConPendientes(filas = []) {
  const map = new Map();
  filas.forEach((f) => {
    if (!f.turnoId) return;
    const actual = map.get(f.turnoId) || {
      turnoId: f.turnoId,
      tipoTurno: f.tipoTurno,
      numeroTurno: f.numeroTurno,
      honor: f.honor,
      pendientes: 0,
    };
    actual.pendientes += 1;
    map.set(f.turnoId, actual);
  });
  return [...map.values()].sort((a, b) => {
    const t = ordenTipoTurno(a.tipoTurno) - ordenTipoTurno(b.tipoTurno);
    if (t !== 0) return t;
    return (Number(a.numeroTurno) || 0) - (Number(b.numeroTurno) || 0);
  });
}

function escapeHtml(value) {
  return String(value ?? '—')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function exportPendientesEntregaDetalleExcel({
  filas = [],
  orgNombre = '',
  cortejoLabel = 'Todas',
  tipoLabel = 'Todos',
}) {
  const datos = filas.map((f) => ({
    Procesión: f.procesion,
    'Tipo de turno': f.tipoTurno,
    'Número': f.numeroTurno,
    Honor: f.honor,
    Devoto: f.nombre,
    DPI: f.dpi,
    WhatsApp: f.whatsapp,
    Correo: f.correo,
    Brazo: f.brazoLabel,
    Código: f.codigo,
    Recibo: f.codigoBoleta,
    'Fecha venta': f.fechaPago,
    Hora: f.horaPago,
  }));
  const wb = XLSX.utils.book_new();
  const meta = [
    ['Pendientes de entrega (detalle)'],
    ['Organización', orgNombre || '—'],
    ['Procesión', cortejoLabel],
    ['Filtro tipo', tipoLabel],
    ['Generado', new Date().toLocaleString('es-GT')],
    ['Total', filas.length],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(meta), 'Resumen');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(datos), 'Pendientes');
  XLSX.writeFile(wb, `pendientes-entrega-detalle-${Date.now()}.xlsx`);
}

export function exportPendientesEntregaDetallePdf({
  filas = [],
  orgNombre = '',
  cortejoLabel = 'Todas las procesiones',
  tipoLabel = 'Todos',
}) {
  const grupos = agruparPendientesPorTipoYTurno(filas);
  const secciones = grupos
    .map((grupo) => {
      const bloques = grupo.turnos
        .map(
          (turno) => `
          <div class="turno">
            <h3>#${escapeHtml(turno.numeroTurno)} · ${escapeHtml(turno.honor)}
              <span>(${turno.items.length})</span></h3>
            <table>
              <thead>
                <tr>
                  <th>Devoto</th><th>DPI</th><th>WhatsApp</th><th>Brazo</th><th>Código</th><th>Venta</th>
                </tr>
              </thead>
              <tbody>
                ${turno.items
                  .map(
                    (f) => `<tr>
                      <td><strong>${escapeHtml(f.nombre)}</strong></td>
                      <td>${escapeHtml(f.dpi)}</td>
                      <td>${escapeHtml(f.whatsapp)}</td>
                      <td>${escapeHtml(f.brazoLabel)}</td>
                      <td>${escapeHtml(f.codigo)}</td>
                      <td>${escapeHtml(f.fechaPago)} ${escapeHtml(f.horaPago)}</td>
                    </tr>`
                  )
                  .join('')}
              </tbody>
            </table>
          </div>`
        )
        .join('');
      return `<section class="tipo">
        <h2>${escapeHtml(grupo.tipoTurno)} <span>${grupo.total} pendiente(s)</span></h2>
        ${bloques}
      </section>`;
    })
    .join('');

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"/>
<title>Pendientes de entrega</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  body { margin: 0; font: 10px "Segoe UI", Arial, sans-serif; color: #172033; }
  h1 { margin: 0 0 4px; font-size: 16px; }
  .meta { color: #526075; margin: 0 0 12px; }
  .toolbar { margin-bottom: 10px; padding: 8px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; }
  button { margin-top: 4px; padding: 6px 10px; border: 0; border-radius: 4px; background: #2563eb; color: #fff; cursor: pointer; }
  .tipo { margin: 0 0 14px; page-break-inside: avoid; }
  h2 { margin: 0 0 8px; font-size: 13px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; }
  h2 span, h3 span { font-weight: 500; color: #64748b; font-size: 11px; }
  h3 { margin: 8px 0 4px; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th, td { border: 1px solid #e2e8f0; padding: 4px 5px; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; font-size: 8px; text-transform: uppercase; color: #475569; }
  @media print { .toolbar { display: none; } }
</style></head><body>
  <div class="toolbar">Ctrl+P → Guardar como PDF<br/>
    <button onclick="window.print()">Imprimir / Guardar PDF</button>
  </div>
  <h1>Pendientes de entrega (por tipo y turno)</h1>
  <p class="meta"><strong>${escapeHtml(orgNombre)}</strong> · ${escapeHtml(cortejoLabel)} · ${escapeHtml(tipoLabel)} · ${filas.length} pendiente(s) · ${escapeHtml(new Date().toLocaleString('es-GT'))}</p>
  ${secciones || '<p>No hay pendientes con estos filtros.</p>'}
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 350));</script>
</body></html>`;

  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const ventana = window.open(url, '_blank');
  if (ventana) setTimeout(() => URL.revokeObjectURL(url), 120000);
  else URL.revokeObjectURL(url);
}
