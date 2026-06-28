import * as XLSX from 'xlsx';
import { labelTipoTurno, formatQ } from './cajaReportUtils';
import { formatHoraDisplay } from './turnoHorarioUtils';
import { etiquetaHonorTurno, textoMelodiaTurno } from './turnoUtils';

function brazosDeTurno(turno) {
  return [...(turno?.izquierda || []), ...(turno?.derecha || [])];
}

function etiquetaBrazoCorto(brazo) {
  const lado = brazo.lado?.[0] || '';
  return `${brazo.numero_brazo}${lado ? ` ${lado}` : ''}`;
}

export function contarBrazosTurno(turno) {
  const brazos = brazosDeTurno(turno);
  const disponibles = brazos.filter((b) => b.estado === 'disponible');
  const vendidos = brazos.filter((b) => b.estado === 'vendido');
  const apartados = brazos.filter((b) => b.estado === 'reservado' && b.reserva_apartado);
  const reservaTaquilla = brazos.filter(
    (b) => b.estado === 'reservado' && !b.reserva_apartado
  );

  return {
    total: brazos.length,
    disponibles: disponibles.length,
    vendidos: vendidos.length,
    apartados: apartados.length,
    reservaTaquilla: reservaTaquilla.length,
    ocupados: brazos.length - disponibles.length,
    brazosLibres: disponibles
      .sort(
        (a, b) =>
          (a.numero_brazo || 0) - (b.numero_brazo || 0) ||
          String(a.lado || '').localeCompare(String(b.lado || ''))
      )
      .map(etiquetaBrazoCorto),
  };
}

export function construirFilaDisponibilidad(turno) {
  const c = contarBrazosTurno(turno);
  const pctLibre = c.total ? Math.round((c.disponibles / c.total) * 100) : 0;
  const pctOcupado = c.total ? Math.round((c.ocupados / c.total) * 100) : 0;

  return {
    turno,
    numero: turno.numero_turno,
    nombre: etiquetaHonorTurno(turno),
    honor: turno.etiqueta || labelTipoTurno(turno.tipo_turno),
    melodias: textoMelodiaTurno(turno) || '—',
    tipo: turno.tipo_turno,
    hora: turno.hora_estimada ? formatHoraDisplay(turno.hora_estimada) : '—',
    precio: formatQ(turno.precio),
    ...c,
    pctLibre,
    pctOcupado,
    brazosLibresTexto: c.brazosLibres.length ? c.brazosLibres.join(', ') : '—',
    estadoTurno: c.disponibles === 0 ? 'lleno' : c.disponibles === c.total ? 'libre' : 'parcial',
  };
}

export function construirReporteDisponibilidad(turnosAgrupados, filtros = {}) {
  let filas = (turnosAgrupados || []).map(construirFilaDisponibilidad);

  if (filtros.tipoTurno && filtros.tipoTurno !== 'all') {
    filas = filas.filter((f) => (f.tipo || '') === filtros.tipoTurno);
  }
  if (filtros.numeroTurno?.trim()) {
    filas = filas.filter((f) => String(f.numero) === String(filtros.numeroTurno).trim());
  }
  if (filtros.soloConDisponibles) {
    filas = filas.filter((f) => f.disponibles > 0);
  }

  filas.sort((a, b) => (a.numero || 0) - (b.numero || 0));
  return filas;
}

export function resumenDisponibilidad(filas) {
  const lista = filas || [];
  return {
    turnos: lista.length,
    turnosConLibres: lista.filter((f) => f.disponibles > 0).length,
    turnosLlenos: lista.filter((f) => f.disponibles === 0 && f.total > 0).length,
    brazosTotal: lista.reduce((s, f) => s + f.total, 0),
    brazosLibres: lista.reduce((s, f) => s + f.disponibles, 0),
    brazosOcupados: lista.reduce((s, f) => s + f.ocupados, 0),
  };
}

export function tiposTurnoDisponibilidad(turnosAgrupados) {
  const set = new Set();
  (turnosAgrupados || []).forEach((t) => {
    if (t.tipo_turno) set.add(t.tipo_turno);
  });
  return [...set].sort();
}

export function exportDisponibilidadExcel({ filas, cortejoNombre, orgNombre = '', resumen }) {
  const wb = XLSX.utils.book_new();
  const generado = new Intl.DateTimeFormat('es-GT', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date());

  const meta = [
    ['Disponibilidad de turnos'],
    [orgNombre || 'Organización'],
    [cortejoNombre || 'Procesión'],
    [`Generado: ${generado}`],
    [],
    ['Turnos en reporte', resumen.turnos],
    ['Turnos con brazos libres', resumen.turnosConLibres],
    ['Brazos libres (total)', resumen.brazosLibres],
    [],
  ];

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(meta), 'Resumen');
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      (filas || []).map((f) => ({
        Turno: f.numero,
        Nombre: f.nombre,
        'Melodías / son': f.melodias === '—' ? '' : f.melodias,
        Hora: f.hora,
        Precio: f.precio,
        'Total brazos': f.total,
        Libres: f.disponibles,
        Vendidos: f.vendidos,
        Apartados: f.apartados,
        'Reserva taquilla': f.reservaTaquilla,
        '% libre': f.pctLibre,
        'Brazos libres': f.brazosLibresTexto,
      }))
    ),
    'Por turno'
  );
  XLSX.writeFile(wb, `disponibilidad-turnos-${Date.now()}.xlsx`);
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildDisponibilidadHtml({ filas, cortejoNombre, orgNombre = '', resumen }) {
  const generado = new Intl.DateTimeFormat('es-GT', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date());
  const org = escapeHtml(orgNombre || 'Organización');
  const procesion = escapeHtml(cortejoNombre || 'Procesión');

  const rows = (filas || [])
    .map(
      (f) => `
    <tr class="${f.disponibles === 0 ? 'fila-llena' : ''}">
      <td><strong>#${escapeHtml(f.numero)}</strong></td>
      <td>${escapeHtml(f.nombre)}</td>
      <td class="melodias">${escapeHtml(f.melodias)}</td>
      <td>${escapeHtml(f.hora)}</td>
      <td>${escapeHtml(f.precio)}</td>
      <td class="num">${f.total}</td>
      <td class="num num--libre"><strong>${f.disponibles}</strong></td>
      <td class="num">${f.vendidos}</td>
      <td class="num">${f.apartados}</td>
      <td class="num">${f.reservaTaquilla}</td>
      <td class="num">${f.pctLibre}%</td>
      <td class="detalle">${escapeHtml(f.brazosLibresTexto)}</td>
    </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <title>Disponibilidad — ${procesion}</title>
  <style>
    @page { size: A4 landscape; margin: 10mm 8mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; margin: 0; font-size: 9px; color: #0f172a; }
    h1 { font-size: 13px; margin: 0 0 4px; }
    .meta { color: #475569; margin: 0 0 10px; padding-bottom: 8px; border-bottom: 1px solid #cbd5e1; }
    .kpis { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
    .kpi { border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 10px; background: #f8fafc; min-width: 9rem; }
    .kpi span { display: block; font-size: 8px; color: #64748b; text-transform: uppercase; }
    .kpi strong { font-size: 12px; }
    .toolbar { padding: 10px; margin-bottom: 10px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; font-size: 10px; }
    .toolbar button { margin-top: 6px; padding: 6px 12px; border: none; border-radius: 5px; background: #2563eb; color: #fff; font-weight: 600; cursor: pointer; }
    table { width: 100%; border-collapse: collapse; font-size: 8.5px; table-layout: fixed; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    th, td { border: 1px solid #cbd5e1; padding: 3px 4px; text-align: left; vertical-align: top; word-wrap: break-word; }
    th { background: #e2e8f0; font-size: 7.5px; text-transform: uppercase; }
    .num { text-align: center; }
    .num--libre { background: #ecfdf5; color: #047857; }
    .detalle { font-size: 7.5px; }
    .melodias { font-size: 7.5px; line-height: 1.35; }
    .fila-llena td { color: #94a3b8; }
    @media print { .toolbar { display: none !important; } }
  </style>
</head>
<body>
  <div class="toolbar">
    <strong>Reporte listo</strong> — Ctrl+P → <em>Guardar como PDF</em>
    <br/><button type="button" onclick="window.print()">Imprimir / Guardar PDF</button>
  </div>
  <h1>Disponibilidad de turnos</h1>
  <p class="meta"><strong>${org}</strong> · ${procesion} · Generado: ${escapeHtml(generado)}</p>
  <div class="kpis">
    <div class="kpi"><span>Turnos</span><strong>${resumen.turnos}</strong></div>
    <div class="kpi"><span>Con brazos libres</span><strong>${resumen.turnosConLibres}</strong></div>
    <div class="kpi"><span>Brazos libres</span><strong>${resumen.brazosLibres}</strong></div>
    <div class="kpi"><span>Brazos ocupados</span><strong>${resumen.brazosOcupados}</strong></div>
    <div class="kpi"><span>Turnos llenos</span><strong>${resumen.turnosLlenos}</strong></div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:4%">Turno</th>
        <th style="width:12%">Nombre</th>
        <th style="width:22%">Melodías / son</th>
        <th style="width:6%">Hora</th>
        <th style="width:6%">Precio</th>
        <th style="width:4%">Total</th>
        <th style="width:4%">Libres</th>
        <th style="width:4%">Vend.</th>
        <th style="width:4%">Apart.</th>
        <th style="width:4%">Res.</th>
        <th style="width:4%">% libre</th>
        <th style="width:26%">Brazos libres (detalle)</th>
      </tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="12">Sin turnos.</td></tr>'}</tbody>
  </table>
  <script>window.addEventListener('load', function(){ setTimeout(function(){ window.print(); }, 400); });</script>
</body>
</html>`;
}

export function exportDisponibilidadPdf({ filas, cortejoNombre, orgNombre = '', resumen }) {
  const html = buildDisponibilidadHtml({ filas, cortejoNombre, orgNombre, resumen });
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const ventana = window.open(url, '_blank');
  if (ventana) {
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
    return;
  }
  URL.revokeObjectURL(url);
}
