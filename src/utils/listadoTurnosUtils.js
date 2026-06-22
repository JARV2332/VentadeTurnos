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
import { resolverOperadorNombre } from './operadorVentaUtils';

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

export function construirFilaListado(brazo, turno, comprasPorId = {}, mapaUsuarios = {}) {
  const cargador = brazo.cargador || null;
  const compra = brazo.compra_id ? comprasPorId[brazo.compra_id] : null;
  const esVendido = brazo.estado === 'vendido';
  const operador =
    resolverOperadorNombre({ brazo, compra, mapaUsuarios }) || '—';

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
    operador,
    codigoBoleta: esVendido ? codigoReciboDisplay(compra, [brazo]) : '—',
    ofrenda: esVendido ? formatQ(brazo.precio_pagado) : '—',
    puedeVerBoleta: esVendido && Boolean(brazo.codigo_boleta_qr),
    codigoBusqueda: brazo.codigo_boleta_qr || null,
  };
}

export function construirListadoTurnos(turnosAgrupados, comprasPorId, filtros = {}, mapaUsuarios = {}) {
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
        .map((b) => construirFilaListado(b, turno, compras, mapaUsuarios))
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
        Operador: f.operador,
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

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function filtrosListadoTexto(filtros = {}) {
  const partes = [];
  if (filtros.tipoTurno && filtros.tipoTurno !== 'all') {
    partes.push(`Tipo: ${labelTipoTurno(filtros.tipoTurno)}`);
  }
  if (filtros.numeroTurno?.trim()) partes.push(`Turno #${filtros.numeroTurno.trim()}`);
  if (filtros.estado === 'vendido') partes.push('Solo pagados');
  else if (filtros.estado === 'apartado') partes.push('Solo apartados');
  else if (filtros.estado === 'asignado') partes.push('Pagados y apartados');
  else if (filtros.estado === 'all') partes.push('Todos los brazos');
  if (filtros.fechaDesde || filtros.fechaHasta) {
    partes.push(
      `Operación: ${filtros.fechaDesde || '…'} — ${filtros.fechaHasta || '…'}`
    );
  }
  return partes.length ? partes.join(' · ') : 'Todos los registros';
}

function formatFechaCompacta(key) {
  if (!key) return '—';
  const [y, m, d] = key.split('-');
  if (!y || !m || !d) return key;
  return `${d}/${m}/${y}`;
}

function buildListadoTurnosHtml({ grupos, cortejoNombre, orgNombre = '', filtros = {} }) {
  const generado = new Intl.DateTimeFormat('es-GT', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date());

  const totalFilas = (grupos || []).reduce((s, g) => s + g.filas.length, 0);
  const org = escapeHtml(orgNombre || 'Organización');
  const procesion = escapeHtml(cortejoNombre || 'Procesión');
  const filtrosLinea = escapeHtml(filtrosListadoTexto(filtros));

  const bloques = (grupos || [])
    .map(
      (g) => `
    <section class="grupo">
      <h2>Turno #${escapeHtml(g.numero)} · ${escapeHtml(g.honor)} <span class="grupo-count">${g.filas.length} reg.</span></h2>
      <table>
        <thead>
          <tr>
            <th class="col-brazo">Brazo</th>
            <th class="col-persona">Persona</th>
            <th class="col-estado">Estado</th>
            <th class="col-fecha">Fecha</th>
            <th class="col-hora">Hora</th>
            <th class="col-operador">Operador</th>
            <th class="col-pago">Pago</th>
            <th class="col-boleta">Boleta</th>
            <th class="col-ofrenda">Ofrenda</th>
          </tr>
        </thead>
        <tbody>
          ${g.filas
            .map((f) => {
              const fechaCorta =
                f.brazo?.estado === 'vendido'
                  ? formatFechaCompacta(fechaVentaKey(f.brazo))
                  : '—';
              return `
            <tr>
              <td>${escapeHtml(f.brazoLabel)}</td>
              <td>${escapeHtml(f.nombre)}</td>
              <td>${escapeHtml(f.estadoLabel)}</td>
              <td>${escapeHtml(fechaCorta)}</td>
              <td>${escapeHtml(f.horaOperacion)}</td>
              <td>${escapeHtml(f.operador)}</td>
              <td>${escapeHtml(f.metodoPago)}</td>
              <td class="col-boleta">${escapeHtml(f.codigoBoleta)}</td>
              <td>${escapeHtml(f.ofrenda)}</td>
            </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    </section>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <title>Listado turnos — ${procesion}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm 8mm; }
    * { box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      color: #0f172a;
      margin: 0;
      padding: 0;
      font-size: 9px;
      line-height: 1.35;
    }
    h1 { font-size: 13px; margin: 0 0 3px; font-weight: 700; }
    .meta {
      color: #475569;
      margin: 0 0 10px;
      font-size: 9px;
      line-height: 1.4;
      padding-bottom: 8px;
      border-bottom: 1px solid #cbd5e1;
    }
    .meta strong { color: #0f172a; }
    .toolbar {
      padding: 10px 12px;
      margin-bottom: 12px;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 6px;
      font-size: 10px;
      line-height: 1.4;
    }
    .toolbar button {
      margin-top: 6px;
      padding: 6px 12px;
      border: none;
      border-radius: 5px;
      background: #2563eb;
      color: #fff;
      font-weight: 600;
      cursor: pointer;
      font-size: 10px;
    }
    .grupo { margin: 0 0 12px; }
    .grupo h2 {
      font-size: 10px;
      margin: 0 0 4px;
      padding: 4px 6px;
      background: #f1f5f9;
      border-left: 3px solid #2563eb;
      color: #1e293b;
      page-break-after: avoid;
      break-after: avoid;
    }
    .grupo-count { font-weight: 500; color: #64748b; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5px;
      table-layout: fixed;
      page-break-inside: auto;
    }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; break-inside: avoid; }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 3px 4px;
      text-align: left;
      vertical-align: top;
      overflow: hidden;
      word-wrap: break-word;
    }
    th {
      background: #e2e8f0;
      font-size: 7.5px;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      font-weight: 700;
    }
    .col-brazo { width: 5%; }
    .col-persona { width: 18%; }
    .col-estado { width: 7%; }
    .col-fecha { width: 8%; }
    .col-hora { width: 8%; }
    .col-operador { width: 12%; }
    .col-pago { width: 9%; }
    .col-boleta { width: 20%; font-family: Consolas, monospace; font-size: 7.5px; }
    .col-ofrenda { width: 7%; text-align: right; }
    td.col-boleta { font-family: Consolas, monospace; font-size: 7.5px; }
    @media print {
      .toolbar { display: none !important; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <strong>Reporte listo</strong> — Para PDF: <strong>Ctrl+P</strong> → Destino: <em>Guardar como PDF</em>.
    <br/>
    <button type="button" onclick="window.print()">Imprimir / Guardar PDF</button>
  </div>
  <h1>Listado de turnos asignados</h1>
  <p class="meta">
    <strong>${org}</strong> · ${procesion}<br/>
    ${filtrosLinea} · ${totalFilas} registro(s) · ${escapeHtml(generado)}
  </p>
  ${bloques || '<p>Sin registros.</p>'}
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.print(); }, 400);
    });
  </script>
</body>
</html>`;
}

function imprimirHtmlEnIframe(html) {
  let iframe = document.getElementById('listado-turnos-print-frame');
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'listado-turnos-print-frame';
    iframe.title = 'Listado turnos';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText =
      'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(iframe);
  }

  iframe.srcdoc = html;
  iframe.onload = () => {
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.warn('Print iframe listado turnos:', err);
      }
    }, 350);
  };
}

export function exportListadoTurnosPdf({
  grupos,
  cortejoNombre,
  orgNombre = '',
  filtros = {},
}) {
  const html = buildListadoTurnosHtml({ grupos, cortejoNombre, orgNombre, filtros });
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const ventana = window.open(url, '_blank');
  if (ventana) {
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
    return;
  }
  URL.revokeObjectURL(url);
  imprimirHtmlEnIframe(html);
}
