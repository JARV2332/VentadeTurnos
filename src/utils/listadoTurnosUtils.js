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
      <h2>Turno #${escapeHtml(g.numero)} · ${escapeHtml(g.honor)} <small>(${g.filas.length})</small></h2>
      <table>
        <thead>
          <tr>
            <th>Brazo</th>
            <th>Persona</th>
            <th>Estado</th>
            <th>Fecha</th>
            <th>Hora</th>
            <th>Pago</th>
            <th>Boleta</th>
            <th>Ofrenda</th>
          </tr>
        </thead>
        <tbody>
          ${g.filas
            .map(
              (f) => `
            <tr>
              <td>${escapeHtml(f.brazoLabel)}</td>
              <td><strong>${escapeHtml(f.nombre)}</strong></td>
              <td>${escapeHtml(f.estadoLabel)}</td>
              <td>${escapeHtml(f.fechaOperacion)}</td>
              <td>${escapeHtml(f.horaOperacion)}</td>
              <td>${escapeHtml(f.metodoPago)}</td>
              <td><code>${escapeHtml(f.codigoBoleta)}</code></td>
              <td>${escapeHtml(f.ofrenda)}</td>
            </tr>`
            )
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
  <title>Listado turnos — ${org}</title>
  <style>
    body { font-family: 'Segoe UI', system-ui, sans-serif; color: #0f172a; margin: 24px; font-size: 11px; }
    h1 { font-size: 1.25rem; margin: 0 0 4px; }
    .meta { color: #64748b; margin-bottom: 18px; line-height: 1.5; }
    .toolbar {
      padding: 12px 14px; margin-bottom: 18px; background: #eff6ff;
      border: 1px solid #bfdbfe; border-radius: 8px; line-height: 1.45;
    }
    .toolbar button {
      margin-top: 8px; padding: 8px 14px; border: none; border-radius: 6px;
      background: #2563eb; color: #fff; font-weight: 600; cursor: pointer;
    }
    .grupo { margin-bottom: 20px; page-break-inside: avoid; break-inside: avoid; }
    .grupo h2 { font-size: 0.95rem; margin: 0 0 8px; color: #1e293b; }
    .grupo h2 small { font-weight: 500; color: #64748b; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 8px; }
    th, td { border: 1px solid #e2e8f0; padding: 5px 7px; text-align: left; vertical-align: top; }
    th { background: #f1f5f9; font-size: 9px; text-transform: uppercase; }
    code { font-size: 9px; }
    @media print {
      body { margin: 12px; }
      .toolbar { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <strong>Reporte listo</strong><br/>
    Para guardar como PDF: pulse el botón o use <strong>Ctrl+P</strong> → Destino: <em>Guardar como PDF</em> → Guardar.
    <br/>
    <button type="button" onclick="window.print()">Imprimir / Guardar PDF</button>
  </div>
  <h1>Listado de turnos asignados</h1>
  <p class="meta">
    <strong>${org}</strong><br/>
    ${procesion}<br/>
    ${filtrosLinea}<br/>
    ${totalFilas} registro(s) en ${(grupos || []).length} turno(s) · Generado: ${escapeHtml(generado)}
  </p>
  ${bloques || '<p>Sin registros.</p>'}
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.print(); }, 450);
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
