import * as XLSX from 'xlsx';
import { labelMetodoPago } from './pagoUtils';
import { formatHoraVentaGt } from './turnoHorarioUtils';

const TIPO_TURNO_LABELS = {
  ordinario: 'Ordinario',
  extraordinario: 'Extraordinario',
  salida: 'Salida',
  entrada: 'Entrada',
};

export function labelTipoTurno(tipo) {
  if (!tipo) return 'Sin tipo';
  const key = String(tipo).toLowerCase();
  return TIPO_TURNO_LABELS[key] || tipo;
}

export function fechaVentaKey(venta) {
  const raw = venta?.pago_confirmado_en || venta?.updated_at || venta?.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatFechaReporte(key) {
  if (!key) return '—';
  const [y, m, d] = key.split('-').map(Number);
  if (!y || !m || !d) return key;
  const dt = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat('es-GT', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(dt);
}

export function formatQ(n) {
  return new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(
    Number(n || 0)
  );
}

/** Marca de tiempo UTC de la venta (pago confirmado o actualización). */
export function timestampVenta(venta) {
  const raw = venta?.pago_confirmado_en || venta?.updated_at || venta?.created_at;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Orden cronológico: fecha y luego hora (sin fecha al final). */
export function ordenarVentasCaja(ventas, { direccion = 'asc' } = {}) {
  const lista = Array.isArray(ventas) ? [...ventas] : [];
  lista.sort((a, b) => {
    const ta = timestampVenta(a);
    const tb = timestampVenta(b);
    if (ta == null && tb == null) return 0;
    if (ta == null) return 1;
    if (tb == null) return -1;
    const cmp = ta - tb;
    if (cmp !== 0) return direccion === 'desc' ? -cmp : cmp;
    const turnoA = Number(a.numero_turno) || 0;
    const turnoB = Number(b.numero_turno) || 0;
    return turnoA - turnoB;
  });
  return lista;
}

/** Ventas agrupadas por día, cada día ordenado por hora. */
export function agruparVentasPorDia(ventas) {
  const ordenadas = ordenarVentasCaja(ventas);
  const grupos = [];
  let actual = null;

  ordenadas.forEach((v) => {
    const key = fechaVentaKey(v) || 'sin-fecha';
    if (!actual || actual.fechaKey !== key) {
      actual = {
        fechaKey: key,
        fechaLabel: key === 'sin-fecha' ? 'Sin fecha' : formatFechaReporte(key),
        ventas: [],
      };
      grupos.push(actual);
    }
    actual.ventas.push(v);
  });

  return grupos;
}

export function filtrarVentasCaja(ventas, filtros = {}) {
  let lista = Array.isArray(ventas) ? [...ventas] : [];
  const { fechaDesde, fechaHasta, vendedorId, tipoTurno, mesaId } = filtros;

  if (fechaDesde) {
    lista = lista.filter((v) => {
      const k = fechaVentaKey(v);
      return k && k >= fechaDesde;
    });
  }
  if (fechaHasta) {
    lista = lista.filter((v) => {
      const k = fechaVentaKey(v);
      return k && k <= fechaHasta;
    });
  }
  if (vendedorId && vendedorId !== 'all') {
    lista = lista.filter((v) => (v.vendedor_id || 'sin-asignar') === vendedorId);
  }
  if (tipoTurno && tipoTurno !== 'all') {
    lista = lista.filter((v) => (v.tipo_turno || 'sin-tipo') === tipoTurno);
  }
  if (mesaId && mesaId !== 'all') {
    lista = lista.filter((v) => v.mesa_id === mesaId);
  }

  return ordenarVentasCaja(lista);
}

function agruparPor(lista, keyFn, labelFn) {
  const map = new Map();
  lista.forEach((v) => {
    const key = keyFn(v);
    const label = labelFn(v, key);
    const prev = map.get(key) || { key, label, ventas: 0, total: 0 };
    prev.ventas += 1;
    prev.total += Number(v.precio_pagado || 0);
    map.set(key, prev);
  });
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export function buildResumenReporte(ventas) {
  const lista = Array.isArray(ventas) ? ventas : [];
  const totalRecaudado = lista.reduce((s, v) => s + Number(v.precio_pagado || 0), 0);

  const porMetodo = { efectivo: 0, transferencia: 0, tarjeta: 0 };
  lista.forEach((v) => {
    const m = v.metodo_pago || 'efectivo';
    if (porMetodo[m] !== undefined) porMetodo[m] += Number(v.precio_pagado || 0);
    else porMetodo.efectivo += Number(v.precio_pagado || 0);
  });

  const porVendedor = agruparPor(
    lista,
    (v) => v.vendedor_id || 'sin-asignar',
    (v, key) => v.operador_nombre?.trim() || (key === 'sin-asignar' ? 'Sin asignar' : key)
  );

  const porTipoTurno = agruparPor(
    lista,
    (v) => v.tipo_turno || 'sin-tipo',
    (v, key) => labelTipoTurno(key === 'sin-tipo' ? null : key)
  );

  const porDia = agruparPor(
    lista,
    (v) => fechaVentaKey(v) || 'sin-fecha',
    (v, key) => (key === 'sin-fecha' ? 'Sin fecha' : formatFechaReporte(key))
  ).sort((a, b) => String(a.key).localeCompare(String(b.key)));

  return {
    totalVentas: lista.length,
    totalRecaudado,
    porMetodo,
    porVendedor,
    porTipoTurno,
    porDia,
  };
}

export function tiposTurnoDisponibles(ventas) {
  const set = new Set();
  (ventas || []).forEach((v) => {
    if (v.tipo_turno) set.add(v.tipo_turno);
  });
  return [...set].sort();
}

function filtrosTexto(filtros) {
  const partes = [];
  if (filtros.fechaDesde || filtros.fechaHasta) {
    partes.push(
      `Período: ${filtros.fechaDesde || '…'} — ${filtros.fechaHasta || '…'}`
    );
  }
  if (filtros.vendedorNombre) partes.push(`Vendedor: ${filtros.vendedorNombre}`);
  if (filtros.tipoTurno && filtros.tipoTurno !== 'all') {
    partes.push(`Tipo turno: ${labelTipoTurno(filtros.tipoTurno)}`);
  }
  if (filtros.mesaNombre) partes.push(`Mesa: ${filtros.mesaNombre}`);
  return partes.length ? partes.join(' · ') : 'Todos los registros';
}

function filasDetalleExcel(ventas) {
  return ordenarVentasCaja(ventas).map((v) => ({
    'Fecha venta': formatFechaReporte(fechaVentaKey(v)),
    'Hora venta': formatHoraVentaGt(v.pago_confirmado_en || v.updated_at),
    Turno: v.numero_turno ?? '—',
    'Tipo turno': labelTipoTurno(v.tipo_turno),
    Boleta: v.codigo_boleta_qr || '—',
    Operador: v.operador_nombre || '—',
    Pago: labelMetodoPago(v.metodo_pago),
    Ofrenda: Number(v.precio_pagado || 0),
  }));
}

export function exportCajaExcel({ ventas, resumen, filtros = {}, orgNombre = '' }) {
  const wb = XLSX.utils.book_new();
  const generado = new Intl.DateTimeFormat('es-GT', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date());

  const resumenRows = [
    ['Reporte de ventas — Caja y Finanzas'],
    [orgNombre || 'Organización'],
    [filtrosTexto(filtros)],
    [`Generado: ${generado}`],
    [],
    ['Indicador', 'Valor'],
    ['Total ventas (turnos)', resumen.totalVentas],
    ['Total recaudado (Q)', resumen.totalRecaudado],
    ['Efectivo (Q)', resumen.porMetodo.efectivo || 0],
    ['Transferencia (Q)', resumen.porMetodo.transferencia || 0],
    ['Tarjeta (Q)', resumen.porMetodo.tarjeta || 0],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumenRows), 'Resumen');

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(filasDetalleExcel(ventas)),
    'Detalle ventas'
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      resumen.porVendedor.map((r) => ({
        Vendedor: r.label,
        Ventas: r.ventas,
        Total: r.total,
      }))
    ),
    'Por vendedor'
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      resumen.porTipoTurno.map((r) => ({
        'Tipo turno': r.label,
        Ventas: r.ventas,
        Total: r.total,
      }))
    ),
    'Por tipo turno'
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      resumen.porDia.map((r) => ({
        Fecha: r.label,
        Ventas: r.ventas,
        Total: r.total,
      }))
    ),
    'Por día'
  );

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `reporte_caja_${stamp}.xlsx`);
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function barChartHtml(items, maxTotal) {
  if (!items.length) return '<p>Sin datos para este período.</p>';
  const max = maxTotal || Math.max(...items.map((i) => i.total), 1);
  return items
    .map(
      (item) => `
    <div class="caja-print-bar">
      <span class="caja-print-bar__label">${escapeHtml(item.label)}</span>
      <div class="caja-print-bar__track">
        <div class="caja-print-bar__fill" style="width:${Math.round((item.total / max) * 100)}%"></div>
      </div>
      <span class="caja-print-bar__val">${formatQ(item.total)} <small>(${item.ventas})</small></span>
    </div>`
    )
    .join('');
}

function buildReporteCajaHtml({ ventas, resumen, filtros = {}, orgNombre = '' }) {
  const ventasOrdenadas = ordenarVentasCaja(ventas);
  const generado = new Intl.DateTimeFormat('es-GT', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date());

  const maxV = Math.max(...(resumen.porVendedor || []).map((x) => x.total), 1);
  const maxT = Math.max(...(resumen.porTipoTurno || []).map((x) => x.total), 1);
  const maxD = Math.max(...(resumen.porDia || []).map((x) => x.total), 1);
  const org = escapeHtml(orgNombre || 'Organización');
  const filtrosLinea = escapeHtml(filtrosTexto(filtros));

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <title>Reporte Caja — ${org}</title>
  <style>
    body { font-family: 'Segoe UI', system-ui, sans-serif; color: #0f172a; margin: 24px; font-size: 12px; }
    h1 { font-size: 1.35rem; margin: 0 0 4px; }
    .meta { color: #64748b; margin-bottom: 20px; line-height: 1.5; }
    .toolbar {
      padding: 12px 14px; margin-bottom: 20px; background: #eff6ff;
      border: 1px solid #bfdbfe; border-radius: 8px; line-height: 1.45;
    }
    .toolbar button {
      margin-top: 8px; padding: 8px 14px; border: none; border-radius: 6px;
      background: #2563eb; color: #fff; font-weight: 600; cursor: pointer;
    }
    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 24px; }
    .kpi { border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; background: #f8fafc; }
    .kpi span { display: block; font-size: 10px; text-transform: uppercase; color: #64748b; }
    .kpi strong { font-size: 1.1rem; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
    .panel { border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; }
    .panel h2 { font-size: 0.85rem; margin: 0 0 12px; text-transform: uppercase; color: #475569; }
    .caja-print-bar { display: grid; grid-template-columns: 120px 1fr 100px; gap: 8px; align-items: center; margin-bottom: 8px; }
    .caja-print-bar__label { font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .caja-print-bar__track { height: 10px; background: #e2e8f0; border-radius: 999px; overflow: hidden; }
    .caja-print-bar__fill { height: 100%; background: linear-gradient(90deg, #3b82f6, #6366f1); border-radius: 999px; }
    .caja-print-bar__val { text-align: right; font-weight: 600; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; }
    th { background: #f1f5f9; font-size: 9px; text-transform: uppercase; }
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
  <h1>Reporte de ventas — Caja y Finanzas</h1>
  <p class="meta">
    <strong>${org}</strong><br/>
    ${filtrosLinea}<br/>
    Generado: ${escapeHtml(generado)}
  </p>
  <div class="kpis">
    <div class="kpi"><span>Ventas</span><strong>${resumen.totalVentas}</strong></div>
    <div class="kpi"><span>Recaudado</span><strong>${formatQ(resumen.totalRecaudado)}</strong></div>
    <div class="kpi"><span>Efectivo</span><strong>${formatQ(resumen.porMetodo.efectivo)}</strong></div>
    <div class="kpi"><span>Transfer. + Tarjeta</span><strong>${formatQ((resumen.porMetodo.transferencia || 0) + (resumen.porMetodo.tarjeta || 0))}</strong></div>
  </div>
  <div class="grid">
    <div class="panel"><h2>Por vendedor</h2>${barChartHtml(resumen.porVendedor, maxV)}</div>
    <div class="panel"><h2>Por tipo de turno</h2>${barChartHtml(resumen.porTipoTurno, maxT)}</div>
  </div>
  <div class="panel" style="margin-bottom:24px"><h2>Ventas por día</h2>${barChartHtml(resumen.porDia, maxD)}</div>
  <div class="panel">
    <h2>Detalle (${ventasOrdenadas.length} registros)</h2>
    <table>
      <thead><tr><th>Fecha</th><th>Hora</th><th>Turno</th><th>Tipo</th><th>Boleta</th><th>Operador</th><th>Pago</th><th>Ofrenda</th></tr></thead>
      <tbody>
        ${ventasOrdenadas
          .slice(0, 500)
          .map(
            (v) => `<tr>
          <td>${escapeHtml(formatFechaReporte(fechaVentaKey(v)))}</td>
          <td>${escapeHtml(formatHoraVentaGt(v.pago_confirmado_en || v.updated_at) || '—')}</td>
          <td>#${escapeHtml(v.numero_turno ?? '—')}</td>
          <td>${escapeHtml(labelTipoTurno(v.tipo_turno))}</td>
          <td>${escapeHtml(v.codigo_boleta_qr || '—')}</td>
          <td>${escapeHtml(v.operador_nombre || '—')}</td>
          <td>${escapeHtml(labelMetodoPago(v.metodo_pago))}</td>
          <td>${formatQ(v.precio_pagado)}</td>
        </tr>`
          )
          .join('')}
      </tbody>
    </table>
    ${ventasOrdenadas.length > 500 ? `<p><em>… y ${ventasOrdenadas.length - 500} filas más (exporte Excel para el listado completo).</em></p>` : ''}
  </div>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.print(); }, 450);
    });
  </script>
</body>
</html>`;
}

function imprimirEnIframe(html) {
  let iframe = document.getElementById('caja-reporte-print-frame');
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'caja-reporte-print-frame';
    iframe.title = 'Reporte caja';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText =
      'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(iframe);
  }

  iframe.srcdoc = html;

  const imprimir = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (err) {
      console.warn('Print iframe:', err);
    }
  };

  iframe.onload = () => {
    setTimeout(imprimir, 350);
  };
}

export function imprimirReporteCaja({ ventas, resumen, filtros = {}, orgNombre = '' }) {
  const html = buildReporteCajaHtml({ ventas, resumen, filtros, orgNombre });
  const stamp = new Date().toISOString().slice(0, 10);

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const ventana = window.open(url, '_blank');
  if (ventana) {
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
    return;
  }

  URL.revokeObjectURL(url);
  imprimirEnIframe(html);
}
