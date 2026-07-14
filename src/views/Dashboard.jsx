import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import Loader from '../components/Loader';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';
import {
  getDashboardMetrics,
  getCortejosByOrg,
} from '../services/dataService';
import HorarioTurnosPanel from '../components/HorarioTurnosPanel';
import MisTurnosEnlaceAdmin from '../components/MisTurnosEnlaceAdmin';

export default function Dashboard() {
  const { organizacionId, organizacion } = useAuth();
  const [metrics, setMetrics] = useState(null);
  const [cortejos, setCortejos] = useState([]);

  useEffect(() => {
    const refresh = async () => {
      setMetrics(await getDashboardMetrics(organizacionId));
      setCortejos(await getCortejosByOrg(organizacionId));
    };
    refresh();
    const timer = window.setInterval(refresh, 120_000);
    return () => window.clearInterval(timer);
  }, [organizacionId]);

  const formatQ = (n) =>
    new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(n);

  return (
    <Layout
      title="Dashboard"
      subtitle="Métricas macro y operación del día"
    >
      {!metrics ? (
        <Loader text="Cargando métricas..." />
      ) : (
      <>
      <MisTurnosEnlaceAdmin organizacion={organizacion} className="dashboard-mis-turnos" />
      <div className="metrics-grid metrics-grid--5 dashboard-operacion">
        <div className="metric-card metric-card--primary">
          <span className="metric-card__label">Ventas de hoy</span>
          <strong className="metric-card__value">{metrics.ventasHoy ?? 0}</strong>
          <small>{formatQ(metrics.montoHoy ?? 0)} recaudado hoy</small>
        </div>
        <Link to="/entrega" className="metric-card metric-card--link">
          <span className="metric-card__label">Pendientes de entrega</span>
          <strong className="metric-card__value">{metrics.pendientesEntrega ?? 0}</strong>
          <small>Ver listado en Entrega →</small>
        </Link>
        <Link to="/config/reservas" className="metric-card metric-card--link">
          <span className="metric-card__label">Apartados sin pagar</span>
          <strong className="metric-card__value">{metrics.apartadosSinPagar ?? 0}</strong>
          <small>Gestionar apartados →</small>
        </Link>
        {(metrics.reservasTaquillaColgadas ?? 0) > 0 && (
          <Link to="/taquilla" className="metric-card metric-card--link metric-card--warn">
            <span className="metric-card__label">Reservas taquilla colgadas</span>
            <strong className="metric-card__value">{metrics.reservasTaquillaColgadas}</strong>
            <small>
              Sin confirmar &gt; {metrics.minutosReservaColgada ?? 15} min · Ir a Taquilla →
            </small>
          </Link>
        )}
        <div className="metric-card">
          <span className="metric-card__label">Ingresos recaudados</span>
          <strong className="metric-card__value">{formatQ(metrics.recaudado)}</strong>
          <small>de {formatQ(metrics.presupuestoTotal)} proyectados</small>
        </div>
        <div className="metric-card">
          <span className="metric-card__label">Ocupación global</span>
          <strong className="metric-card__value">{metrics.ocupacion}%</strong>
          <div className="progress-bar">
            <div className="progress-bar__fill" style={{ width: `${metrics.ocupacion}%` }} />
          </div>
        </div>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <span className="metric-card__label">Espacios vendidos</span>
          <strong className="metric-card__value">{metrics.vendidos}</strong>
          <small>{metrics.disponibles ?? 0} disponibles · {metrics.reservados ?? 0} reservados</small>
        </div>
        <div className="metric-card">
          <span className="metric-card__label">Cortejos activos</span>
          <strong className="metric-card__value">{metrics.cortejosActivos}</strong>
          <small>{metrics.totalBrazos} espacios totales</small>
        </div>
      </div>

      {(metrics.porProcesion || []).length > 0 && (
        <section className="panel dashboard-procesiones">
          <h3 className="panel__title">Procesiones activas — desglose</h3>
          <div className="table-wrap">
            <table className="data-table data-table--compact">
              <thead>
                <tr>
                  <th>Procesión</th>
                  <th>Ocupación</th>
                  <th>Vendidos</th>
                  <th>Libres</th>
                  <th>Reservados</th>
                  <th>Apartados</th>
                  <th>Pend. entrega</th>
                  <th>Recaudado</th>
                </tr>
              </thead>
              <tbody>
                {metrics.porProcesion.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.nombre}</strong></td>
                    <td>{p.ocupacion}%</td>
                    <td>{p.vendidos}</td>
                    <td>{p.disponibles}</td>
                    <td>{p.reservados}</td>
                    <td>{p.apartados}</td>
                    <td>
                      {p.pendientesEntrega > 0 ? (
                        <Link to="/entrega">{p.pendientesEntrega}</Link>
                      ) : (
                        '0'
                      )}
                    </td>
                    <td>{formatQ(p.recaudado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="panel">
        <h3 className="panel__title">Cortejos de la organización</h3>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Evento</th>
                <th>Fecha</th>
                <th>Descripción</th>
              </tr>
            </thead>
            <tbody>
              {cortejos.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.nombre_evento}</strong></td>
                  <td>{new Date(c.fecha + 'T12:00:00').toLocaleDateString('es-GT')}</td>
                  <td>{c.descripcion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <HorarioTurnosPanel organizacionId={organizacionId} incluirInactivas />

      <section className="panel">
        <h3 className="panel__title">Estado de espacios</h3>
        <div className="legend-grid">
          <div className="legend-item"><StatusBadge status="disponible" /> Disponible para venta</div>
          <div className="legend-item"><StatusBadge status="reservado" /> Reservado temporalmente</div>
          <div className="legend-item"><StatusBadge status="vendido" /> Vendido y confirmado</div>
        </div>
      </section>
      </>
      )}
    </Layout>
  );
}
