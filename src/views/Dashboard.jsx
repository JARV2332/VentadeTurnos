import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import Loader from '../components/Loader';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';
import {
  getDashboardMetrics,
  getCortejosByOrg,
  subscribeData,
} from '../services/dataService';

export default function Dashboard() {
  const { organizacionId } = useAuth();
  const [metrics, setMetrics] = useState(null);
  const [cortejos, setCortejos] = useState([]);

  useEffect(() => {
    const refresh = async () => {
      setMetrics(await getDashboardMetrics(organizacionId));
      setCortejos(await getCortejosByOrg(organizacionId));
    };
    refresh();
    return subscribeData(organizacionId, refresh);
  }, [organizacionId]);

  const formatQ = (n) =>
    new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(n);

  return (
    <Layout
      title="Dashboard"
      subtitle="Métricas macro de tu organización"
    >
      {!metrics ? (
        <Loader text="Cargando métricas..." />
      ) : (
      <>
      <div className="metrics-grid">
        <div className="metric-card metric-card--primary">
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
        <div className="metric-card">
          <span className="metric-card__label">Espacios vendidos</span>
          <strong className="metric-card__value">{metrics.vendidos}</strong>
          <small>{metrics.disponibles} disponibles · {metrics.reservados} reservados</small>
        </div>
        <div className="metric-card">
          <span className="metric-card__label">Cortejos activos</span>
          <strong className="metric-card__value">{metrics.cortejosActivos}</strong>
          <small>{metrics.totalBrazos} espacios totales</small>
        </div>
      </div>

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
