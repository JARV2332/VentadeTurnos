import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import Loader from '../components/Loader';
import { useAuth } from '../context/AuthContext';
import {
  getBrazosApartadosByOrg,
  getCortejosByOrg,
  getCargadoresByOrg,
  getTurnosByIds,
  subscribeData,
} from '../services/dataService';
import {
  construirReporteApartadosPendientes,
  exportApartadosPendientesExcel,
} from '../utils/apartadosPendientesUtils';

export default function ApartadosPendientes() {
  const { organizacionId, organizacion } = useAuth();
  const [cortejos, setCortejos] = useState([]);
  const [brazos, setBrazos] = useState([]);
  const [cargadoresPorId, setCargadoresPorId] = useState({});
  const [turnosPorId, setTurnosPorId] = useState({});
  const [cortejoId, setCortejoId] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');

  const cargar = useCallback(async () => {
    if (!organizacionId) return;
    setCargando(true);
    setError('');
    try {
      const [cortejosData, todosBrazos, cargadores] = await Promise.all([
        getCortejosByOrg(organizacionId, { incluirInactivas: true }),
        getBrazosApartadosByOrg(organizacionId),
        getCargadoresByOrg(organizacionId),
      ]);
      setCortejos(cortejosData || []);
      setBrazos(todosBrazos || []);
      setCargadoresPorId(Object.fromEntries((cargadores || []).map((c) => [c.id, c])));

      const turnoIds = [
        ...new Set(
          (todosBrazos || [])
            .filter((b) => b.estado === 'reservado' && b.reserva_apartado)
            .map((b) => b.turno_id)
            .filter(Boolean)
        ),
      ];
      const turnosMap = turnoIds.length ? await getTurnosByIds(turnoIds) : {};
      setTurnosPorId(turnosMap && typeof turnosMap === 'object' ? turnosMap : {});
    } catch (err) {
      setError(err.message || 'No se pudo cargar el reporte de apartados.');
    } finally {
      setCargando(false);
    }
  }, [organizacionId]);

  useEffect(() => {
    cargar();
    return subscribeData(organizacionId, cargar);
  }, [organizacionId, cargar]);

  const cortejosPorId = useMemo(
    () => Object.fromEntries(cortejos.map((c) => [c.id, c])),
    [cortejos]
  );

  const filasBase = useMemo(
    () =>
      construirReporteApartadosPendientes({
        brazos,
        turnosPorId,
        cortejosPorId,
        cargadoresPorId,
        filtros: { cortejoId: cortejoId || null },
      }),
    [brazos, turnosPorId, cortejosPorId, cargadoresPorId, cortejoId]
  );

  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return filasBase;
    return filasBase.filter((f) => {
      const blob = [
        f.nombre,
        f.dpi,
        f.procesion,
        f.numeroTurno,
        f.brazoLabel,
        f.notas,
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [filasBase, busqueda]);

  const cortejoSel = cortejos.find((c) => c.id === cortejoId);

  return (
    <Layout
      title="Apartados pendientes de cobro"
      subtitle="Personas con turno apartado que aún no han pagado — ordenado por proximidad al evento"
    >
      <section className="panel listado-turnos__filtros">
        <h3 className="panel__title">Filtros</h3>
        <div className="listado-turnos__filtros-grid">
          <label>
            Procesión
            <select value={cortejoId} onChange={(e) => setCortejoId(e.target.value)}>
              <option value="">Todas las procesiones</option>
              {cortejos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre_evento}
                  {c.estado !== 'activa' ? ' (inactiva)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Buscar persona / DPI
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Nombre o DPI…"
              autoComplete="off"
            />
          </label>
        </div>
        <div className="listado-turnos__acciones">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => exportApartadosPendientesExcel({
              filas,
              orgNombre: organizacion?.nombre_oficial,
            })}
            disabled={!filas.length}
          >
            Exportar Excel
          </button>
          <Link to="/config/reservas" className="btn btn--ghost btn--sm">
            Gestionar apartados
          </Link>
          <Link to="/taquilla" className="btn btn--primary btn--sm">
            Cobrar en Taquilla
          </Link>
        </div>
        <p className="text-muted config-hint listado-turnos__resumen">
          {cortejoSel ? cortejoSel.nombre_evento : 'Todas las procesiones'} ·{' '}
          <strong>{filas.length}</strong> apartado(s) sin pagar. Orden: evento más próximo primero.
        </p>
      </section>

      {error && <div className="alert alert--error">{error}</div>}

      {cargando ? (
        <Loader text="Cargando apartados…" />
      ) : !filas.length ? (
        <section className="panel">
          <p className="text-muted">No hay apartados pendientes de cobro con estos filtros.</p>
        </section>
      ) : (
        <section className="panel">
          <div className="table-wrap">
            <table className="data-table data-table--compact apartados-pendientes__tabla">
              <thead>
                <tr>
                  <th>Procesión</th>
                  <th>Evento</th>
                  <th>Turno</th>
                  <th>Brazo</th>
                  <th>Persona</th>
                  <th>DPI</th>
                  <th>Apartado desde</th>
                  <th>Ofrenda</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.id}>
                    <td>{f.procesion}</td>
                    <td>
                      {f.fechaEventoFmt}
                      {f.diasParaEvento != null && (
                        <span className="text-muted apartados-pendientes__dias">
                          {' '}
                          ({f.diasParaEvento === 0
                            ? 'hoy'
                            : f.diasParaEvento === 1
                              ? 'mañana'
                              : `${f.diasParaEvento} d`})
                        </span>
                      )}
                    </td>
                    <td>
                      <strong>#{f.numeroTurno}</strong>
                      <span className="text-muted"> {f.honor}</span>
                    </td>
                    <td>{f.brazoLabel}</td>
                    <td>
                      <strong>{f.nombre}</strong>
                    </td>
                    <td>{f.dpi}</td>
                    <td>{f.apartadoDesde}</td>
                    <td>{f.precio}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </Layout>
  );
}
