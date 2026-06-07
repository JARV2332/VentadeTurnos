import React, { useMemo } from 'react';
import {
  buildResumenReporte,
  exportCajaExcel,
  imprimirReporteCaja,
  formatQ,
  labelTipoTurno,
  formatFechaReporte,
} from '../utils/cajaReportUtils';

function CajaBarChart({ titulo, items, emptyHint }) {
  const max = useMemo(
    () => Math.max(...(items || []).map((i) => i.total), 1),
    [items]
  );

  if (!items?.length) {
    return (
      <div className="caja-chart panel">
        <h3 className="panel__title">{titulo}</h3>
        <p className="text-muted caja-chart__empty">{emptyHint || 'Sin datos con los filtros actuales.'}</p>
      </div>
    );
  }

  return (
    <div className="caja-chart panel">
      <h3 className="panel__title">{titulo}</h3>
      <div className="caja-chart__lista">
        {items.map((item) => (
          <div key={item.key} className="caja-chart__fila">
            <span className="caja-chart__label" title={item.label}>
              {item.label}
            </span>
            <div className="caja-chart__track">
              <div
                className="caja-chart__bar"
                style={{ width: `${Math.max(4, Math.round((item.total / max) * 100))}%` }}
              />
            </div>
            <span className="caja-chart__meta">
              <strong>{formatQ(item.total)}</strong>
              <small>{item.ventas} venta(s)</small>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CajaReportePanel({
  ventasFiltradas,
  filtrosMeta,
  orgNombre,
}) {
  const resumen = useMemo(
    () => buildResumenReporte(ventasFiltradas),
    [ventasFiltradas]
  );

  const handleExcel = () => {
    exportCajaExcel({
      ventas: ventasFiltradas,
      resumen,
      filtros: filtrosMeta,
      orgNombre,
    });
  };

  const handlePdf = () => {
    imprimirReporteCaja({
      ventas: ventasFiltradas,
      resumen,
      filtros: filtrosMeta,
      orgNombre,
    });
  };

  return (
    <section className="panel caja-reporte">
      <div className="caja-reporte__head">
        <div>
          <h3 className="panel__title">Análisis y reportes</h3>
          <p className="text-muted config-hint">
            Filtre arriba por día, vendedor, tipo de turno o mesa. Exporte a Excel (datos
            completos) o PDF (resumen con gráficas para imprimir o guardar).
          </p>
        </div>
        <div className="caja-reporte__export">
          <button type="button" className="btn btn--ghost" onClick={handleExcel}>
            Exportar Excel
          </button>
          <button type="button" className="btn btn--primary" onClick={handlePdf}>
            Exportar PDF
          </button>
        </div>
      </div>

      <div className="metrics-grid metrics-grid--4 caja-reporte__kpis">
        <div className="metric-card">
          <span className="metric-card__label">Ventas (filtro)</span>
          <strong className="metric-card__value">{resumen.totalVentas}</strong>
        </div>
        <div className="metric-card metric-card--primary">
          <span className="metric-card__label">Recaudado (filtro)</span>
          <strong className="metric-card__value">{formatQ(resumen.totalRecaudado)}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-card__label">Ticket promedio</span>
          <strong className="metric-card__value">
            {formatQ(
              resumen.totalVentas
                ? resumen.totalRecaudado / resumen.totalVentas
                : 0
            )}
          </strong>
        </div>
        <div className="metric-card">
          <span className="metric-card__label">Días con venta</span>
          <strong className="metric-card__value">
            {resumen.porDia.filter((d) => d.key !== 'sin-fecha').length}
          </strong>
        </div>
      </div>

      <div className="caja-reporte__charts">
        <CajaBarChart titulo="Recaudación por vendedor" items={resumen.porVendedor} />
        <CajaBarChart titulo="Recaudación por tipo de turno" items={resumen.porTipoTurno} />
        <CajaBarChart
          titulo="Recaudación por día"
          items={resumen.porDia}
          emptyHint="Sin ventas en el rango de fechas seleccionado."
        />
        <div className="caja-chart panel">
          <h3 className="panel__title">Forma de pago</h3>
          <div className="caja-pago-bars">
            {[
              { id: 'efectivo', label: 'Efectivo', color: '#22c55e' },
              { id: 'transferencia', label: 'Transferencia', color: '#3b82f6' },
              { id: 'tarjeta', label: 'Tarjeta', color: '#8b5cf6' },
            ].map((m) => {
              const total = resumen.porMetodo[m.id] || 0;
              const pct = resumen.totalRecaudado
                ? Math.round((total / resumen.totalRecaudado) * 100)
                : 0;
              return (
                <div key={m.id} className="caja-pago-bar">
                  <div className="caja-pago-bar__head">
                    <span>{m.label}</span>
                    <strong>{formatQ(total)}</strong>
                  </div>
                  <div className="caja-pago-bar__track">
                    <div
                      className="caja-pago-bar__fill"
                      style={{ width: `${pct}%`, background: m.color }}
                    />
                  </div>
                  <small className="text-muted">{pct}% del total filtrado</small>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {resumen.porDia.length > 0 && (
        <div className="table-wrap caja-reporte__tabla-dias">
          <table className="data-table data-table--compact">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Ventas</th>
                <th>Total recaudado</th>
              </tr>
            </thead>
            <tbody>
              {resumen.porDia.map((d) => (
                <tr key={d.key}>
                  <td>{d.key === 'sin-fecha' ? 'Sin fecha' : formatFechaReporte(d.key)}</td>
                  <td>{d.ventas}</td>
                  <td>{formatQ(d.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export { labelTipoTurno };
