import * as XLSX from 'xlsx';
import { labelTipoTurno, formatQ } from './cajaReportUtils';
import { formatHoraDisplay } from './turnoHorarioUtils';
import { etiquetaHonorTurno, textoMelodiaTurno } from './turnoUtils';
import { esReservaTaquillaExpirada, esReservaTaquillaColgada } from './reservasTaquillaUtils';

function brazosDeTurno(turno) {
  return [...(turno?.izquierda || []), ...(turno?.derecha || [])];
}

/** Libre para venta: disponible, reserva vencida o reserva colgada (igual criterio práctico que Taquilla). */
export function esBrazoLibreParaVenta(brazo) {
  if (!brazo) return false;
  if (brazo.estado === 'disponible') return true;
  if (brazo.estado === 'vendido') return false;
  if (brazo.reserva_apartado) return false;
  if (brazo.estado !== 'reservado') return false;
  return esReservaTaquillaExpirada(brazo) || esReservaTaquillaColgada(brazo);
}

export function contarBrazosTurno(turno) {
  const brazos = brazosDeTurno(turno);
  const libresRows = brazos.filter(esBrazoLibreParaVenta);
  const vendidos = brazos.filter((b) => b.estado === 'vendido');
  const apartados = brazos.filter((b) => b.estado === 'reservado' && b.reserva_apartado);
  const reservaTaquilla = brazos.filter(
    (b) => b.estado === 'reservado' && !b.reserva_apartado && !esBrazoLibreParaVenta(b)
  );

  const totalConfigurado = Number(turno?.total_brazos) || 0;
  const total = Math.max(brazos.length, totalConfigurado);
  const ocupadosFijos = vendidos.length + apartados.length + reservaTaquilla.length;
  const libresPorHuecos = Math.max(0, total - ocupadosFijos);
  const libres = Math.max(libresRows.length, libresPorHuecos);

  return {
    total,
    disponibles: libres,
    vendidos: vendidos.length,
    apartados: apartados.length,
    reservaTaquilla: reservaTaquilla.length,
    ocupados: Math.max(0, total - libres),
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
        <th style="width:5%">Turno</th>
        <th style="width:14%">Nombre</th>
        <th style="width:32%">Melodías / son</th>
        <th style="width:7%">Hora</th>
        <th style="width:7%">Precio</th>
        <th style="width:5%">Total</th>
        <th style="width:5%">Libres</th>
        <th style="width:5%">Vend.</th>
        <th style="width:5%">Apart.</th>
        <th style="width:5%">Res.</th>
        <th style="width:5%">% libre</th>
      </tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="11">Sin turnos.</td></tr>'}</tbody>
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

function abrirHtmlImpresion(html) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const ventana = window.open(url, '_blank');
  if (ventana) {
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
    return true;
  }
  URL.revokeObjectURL(url);
  return false;
}

/** Columnas disponibles para el reporte imprimible «Turnos disponibles». */
export const COLUMNAS_REPORTE_DISPONIBLES = [
  { id: 'numero', label: 'N.º turno', defaultOn: true },
  { id: 'nombre', label: 'Nombre del turno', defaultOn: true },
  { id: 'melodia', label: 'Melodía', defaultOn: true },
  { id: 'hora', label: 'Hora', defaultOn: false },
  { id: 'precio', label: 'Precio / ofrenda', defaultOn: false },
  { id: 'libres', label: 'Brazos libres', defaultOn: false },
  { id: 'total', label: 'Total brazos', defaultOn: false },
  { id: 'vendidos', label: 'Vendidos', defaultOn: false },
  { id: 'apartados', label: 'Apartados', defaultOn: false },
  { id: 'pctLibre', label: '% libre', defaultOn: false },
];

export const COLUMNAS_REPORTE_DEFAULT = Object.fromEntries(
  COLUMNAS_REPORTE_DISPONIBLES.map((c) => [c.id, c.defaultOn])
);

const STORAGE_COLUMNAS_KEY = 'vt_disponibilidad_columnas_impresion';

export function cargarColumnasReporteGuardadas() {
  try {
    const raw = localStorage.getItem(STORAGE_COLUMNAS_KEY);
    if (!raw) return { ...COLUMNAS_REPORTE_DEFAULT };
    const parsed = JSON.parse(raw);
    const next = { ...COLUMNAS_REPORTE_DEFAULT };
    for (const col of COLUMNAS_REPORTE_DISPONIBLES) {
      if (typeof parsed[col.id] === 'boolean') next[col.id] = parsed[col.id];
    }
    return next;
  } catch {
    return { ...COLUMNAS_REPORTE_DEFAULT };
  }
}

export function guardarColumnasReporte(columnas) {
  try {
    localStorage.setItem(STORAGE_COLUMNAS_KEY, JSON.stringify(columnas));
  } catch {
    /* ignore */
  }
}

export function columnasActivasOrdenadas(columnas = {}) {
  return COLUMNAS_REPORTE_DISPONIBLES.filter((c) => columnas[c.id]);
}

function valorCeldaColumna(fila, colId) {
  switch (colId) {
    case 'numero':
      return `#${fila.numero ?? ''}`;
    case 'nombre':
      return fila.nombre || '—';
    case 'melodia':
      return fila.melodias === '—' ? '' : fila.melodias || '';
    case 'hora':
      return fila.hora || '—';
    case 'precio':
      return fila.precio || '—';
    case 'libres':
      return String(fila.disponibles ?? 0);
    case 'total':
      return String(fila.total ?? 0);
    case 'vendidos':
      return String(fila.vendidos ?? 0);
    case 'apartados':
      return String(fila.apartados ?? 0);
    case 'pctLibre':
      return `${fila.pctLibre ?? 0}%`;
    default:
      return '—';
  }
}

export function celdaReporteDisponible(fila, colId) {
  return valorCeldaColumna(fila, colId);
}

/**
 * Reporte limpio para publicar / imprimir.
 * columnas: { numero, nombre, melodia, hora, ... } booleanos.
 */
export function exportTurnosDisponiblesBonito({
  filas,
  cortejoNombre,
  orgNombre = '',
  soloConLibres = true,
  columnas = COLUMNAS_REPORTE_DEFAULT,
}) {
  const activas = columnasActivasOrdenadas(columnas);
  if (!activas.length) {
    window.alert('Seleccione al menos una columna para imprimir.');
    return false;
  }

  const lista = (filas || []).filter((f) => (soloConLibres ? f.disponibles > 0 : true));
  const generado = new Intl.DateTimeFormat('es-GT', {
    dateStyle: 'long',
  }).format(new Date());
  const org = escapeHtml(orgNombre || '');
  const procesion = escapeHtml(cortejoNombre || '');
  const colCount = activas.length;

  const headCells = activas
    .map((c) => `<th class="col-${c.id}">${escapeHtml(c.label)}</th>`)
    .join('');

  const rows = lista
    .map((f, i) => {
      const tds = activas
        .map((c) => {
          const raw = valorCeldaColumna(f, c.id);
          if (c.id === 'nombre') {
            const num = columnas.numero
              ? ''
              : `<span class="num">#${escapeHtml(f.numero)}</span>`;
            return `<td class="col-nombre">${num}<strong>${escapeHtml(raw)}</strong></td>`;
          }
          if (c.id === 'melodia') {
            const txt = escapeHtml(raw) || '<span class="vacio">—</span>';
            return `<td class="col-melodia">${txt}</td>`;
          }
          if (c.id === 'libres' || c.id === 'pctLibre') {
            return `<td class="col-num col-libres"><strong>${escapeHtml(raw)}</strong></td>`;
          }
          if (['total', 'vendidos', 'apartados', 'numero'].includes(c.id)) {
            return `<td class="col-num">${escapeHtml(raw)}</td>`;
          }
          return `<td class="col-${c.id}">${escapeHtml(raw)}</td>`;
        })
        .join('');
      return `<tr class="${i % 2 === 0 ? 'par' : 'impar'}">${tds}</tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <title>Turnos disponibles — ${procesion || 'Reporte'}</title>
  <style>
    @page { size: letter ${colCount > 5 ? 'landscape' : 'portrait'}; margin: 12mm 10mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      color: #1e3a8a;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .toolbar {
      margin: 0 0 14px;
      padding: 12px 14px;
      background: #eff6ff;
      border: 1px solid #93c5fd;
      border-radius: 10px;
      font-size: 13px;
      color: #1e40af;
    }
    .toolbar button {
      margin-top: 8px;
      padding: 8px 16px;
      border: none;
      border-radius: 8px;
      background: #1d4ed8;
      color: #fff;
      font-weight: 700;
      cursor: pointer;
    }
    .sheet {
      max-width: ${colCount > 5 ? '1100px' : '820px'};
      margin: 0 auto;
      border: 2px solid #1d4ed8;
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 8px 28px rgba(30, 58, 138, 0.12);
    }
    .head {
      background: linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 55%, #2563eb 100%);
      color: #fff;
      text-align: center;
      padding: 22px 18px 18px;
    }
    .head__eyebrow {
      margin: 0 0 6px;
      font-size: 11px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      opacity: 0.88;
      font-weight: 600;
    }
    .head__title {
      margin: 0;
      font-size: 28px;
      font-weight: 800;
      letter-spacing: 0.02em;
      line-height: 1.15;
    }
    .head__sub {
      margin: 10px 0 0;
      font-size: 13px;
      opacity: 0.92;
      font-weight: 500;
    }
    .meta {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      padding: 10px 16px;
      background: #eff6ff;
      border-bottom: 1px solid #bfdbfe;
      font-size: 12px;
      color: #1e40af;
    }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    thead th {
      background: #dbeafe;
      color: #1e3a8a;
      font-size: 10px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      padding: 11px 12px;
      text-align: left;
      border-bottom: 2px solid #93c5fd;
    }
    tbody td {
      padding: 11px 12px;
      border-bottom: 1px solid #bfdbfe;
      vertical-align: top;
      font-size: 13px;
      line-height: 1.4;
      word-wrap: break-word;
    }
    tbody tr.par td { background: #fff; }
    tbody tr.impar td { background: #f8fbff; }
    .col-nombre .num {
      display: inline-block;
      min-width: 2.2rem;
      margin-right: 6px;
      color: #3b82f6;
      font-weight: 700;
      font-size: 12px;
    }
    .col-nombre strong { color: #1e3a8a; font-size: 14px; font-weight: 700; }
    .col-melodia { color: #1d4ed8; font-style: italic; }
    .col-melodia .vacio { color: #93c5fd; font-style: normal; }
    .col-num { text-align: center; }
    .col-libres { color: #047857; background: #ecfdf5 !important; }
    .foot {
      padding: 12px 16px;
      background: #eff6ff;
      border-top: 1px solid #bfdbfe;
      text-align: center;
      font-size: 12px;
      color: #1e40af;
      font-weight: 600;
    }
    .empty { padding: 28px 16px; text-align: center; color: #64748b; }
    @media print {
      .toolbar { display: none !important; }
      .sheet { box-shadow: none; border-radius: 0; }
      body { background: #fff; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <strong>Reporte listo</strong> — use Ctrl+P o el botón para imprimir / guardar PDF.
    <br/><button type="button" onclick="window.print()">Imprimir / Guardar PDF</button>
  </div>
  <div class="sheet">
    <header class="head">
      ${org ? `<p class="head__eyebrow">${org}</p>` : ''}
      <h1 class="head__title">Turnos disponibles</h1>
      ${procesion ? `<p class="head__sub">${procesion}</p>` : ''}
    </header>
    <div class="meta">
      <span>${lista.length} turno${lista.length === 1 ? '' : 's'} con espacio libre</span>
      <span>${escapeHtml(generado)}</span>
    </div>
    ${
      lista.length
        ? `<table>
      <thead><tr>${headCells}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <footer class="foot">${lista.length} turnos disponibles</footer>`
        : `<p class="empty">No hay turnos disponibles con estos filtros.</p>`
    }
  </div>
  <script>window.addEventListener('load', function(){ setTimeout(function(){ window.print(); }, 350); });</script>
</body>
</html>`;

  return abrirHtmlImpresion(html);
}

