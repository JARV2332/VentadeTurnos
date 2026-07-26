import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import Loader from '../components/Loader';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';
import {
  getBrazosEntregaReporteByOrg,
  getCortejosByOrg,
  getCargadoresByOrg,
  getTurnosByIds,
  getUsuariosByOrg,
} from '../services/dataService';
import {
  construirReporteEntrega,
  exportReporteEntregaExcel,
  mapaOperadoresEntrega,
  opcionesOperadoresEntrega,
  resumenReporteEntrega,
} from '../utils/reporteEntregaUtils';

const FILTROS_VACIOS = {
  cortejoId: '',
  estado: '',
  fechaDesde: '',
  fechaHasta: '',
  entregadoPor: '',
  receptor: '',
  busqueda: '',
};

export default function ReporteEntrega() {
  const { organizacionId, organizacion } = useAuth();
  const [cortejos, setCortejos] = useState([]);
  const [brazos, setBrazos] = useState([]);
  const [cargadoresPorId, setCargadoresPorId] = useState({});
  const [turnosPorId, setTurnosPorId] = useState({});
  const [operadoresPorAuth, setOperadoresPorAuth] = useState({});
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const setCampo = (campo, valor) => {
    setFiltros((prev) => ({ ...prev, [campo]: valor }));
  };

  const cargar = useCallback(async () => {
    if (!organizacionId) return;
    setCargando(true);
    setError('');
    try {
      const [cortejosData, todosBrazos, cargadores, usuarios] = await Promise.all([
        getCortejosByOrg(organizacionId, { incluirInactivas: true }),
        getBrazosEntregaReporteByOrg(organizacionId),
        getCargadoresByOrg(organizacionId),
        getUsuariosByOrg(organizacionId),
      ]);

      setCortejos(cortejosData || []);
      setBrazos(todosBrazos || []);
      setCargadoresPorId(Object.fromEntries((cargadores || []).map((c) => [c.id, c])));
      setOperadoresPorAuth(mapaOperadoresEntrega(usuarios || []));

      const turnoIds = [
        ...new Set((todosBrazos || []).map((b) => b.turno_id).filter(Boolean)),
      ];
      const turnosMap = turnoIds.length ? await getTurnosByIds(turnoIds) : {};
      setTurnosPorId(turnosMap && typeof turnosMap === 'object' ? turnosMap : {});
    } catch (err) {
      setError(err.message || 'No se pudo cargar el reporte de entrega.');
    } finally {
      setCargando(false);
    }
  }, [organizacionId]);

  useEffect(() => {
    cargar();
  }, [organizacionId, cargar]);

  const cortejosPorId = useMemo(
    () => Object.fromEntries(cortejos.map((c) => [c.id, c])),
    [cortejos]
  );

  const operadoresOpts = useMemo(
    () => opcionesOperadoresEntrega(brazos, operadoresPorAuth),
    [brazos, operadoresPorAuth]
  );

  const filas = useMemo(
    () =>
      construirReporteEntrega({
        brazos,
        turnosPorId,
        cortejosPorId,
        cargadoresPorId,
        operadoresPorAuth,
        filtros,
      }),
    [brazos, turnosPorId, cortejosPorId, cargadoresPorId, operadoresPorAuth, filtros]
  );

  const resumen = useMemo(() => resumenReporteEntrega(filas), [filas]);

  const cortejoSel = cortejos.find((c) => c.id === filtros.cortejoId);
  const operadorSel = operadoresOpts.find((o) => o.id === filtros.entregadoPor);

  const estadoLabel =
    filtros.estado === 'entregado'
      ? 'Entregados'
      : filtros.estado === 'pendiente'
        ? 'Pendientes'
        : 'Todos';

  return (
    <Layout
      title="Reporte de entrega"
      subtitle="Turnos vendidos: entregados y pendientes, con filtros por fecha y operador"
    >
      <div className="metrics-grid metrics-grid--4 reporte-entrega__metrics">
        <div className="metric-card">
          <span className="metric-card__label">Total filtrado</span>
          <strong className="metric-card__value">{resumen.total}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-card__label">Entregados</span>
          <strong className="metric-card__value metric-card__value--ok">
            {resumen.entregados}
          </strong>
        </div>
        <div className="metric-card">
          <span className="metric-card__label">Pendientes</span>
          <strong className="metric-card__value metric-card__value--warn">
            {resumen.pendientes}
          </strong>
        </div>
        <div className="metric-card">
          <span className="metric-card__label">A tercero</span>
          <strong className="metric-card__value">{resumen.aTercero}</strong>
        </div>
      </div>

      <section className="panel listado-turnos__filtros">
        <h3 className="panel__title">Filtros</h3>
        <div className="listado-turnos__filtros-grid">
          <label>
            Procesión
            <select
              value={filtros.cortejoId}
              onChange={(e) => setCampo('cortejoId', e.target.value)}
            >
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
            Estado entrega
            <select
              value={filtros.estado}
              onChange={(e) => setCampo('estado', e.target.value)}
            >
              <option value="">Todos</option>
              <option value="entregado">Entregados</option>
              <option value="pendiente">Pendientes</option>
            </select>
          </label>
          <label>
            Fecha desde
            <input
              type="date"
              value={filtros.fechaDesde}
              onChange={(e) => setCampo('fechaDesde', e.target.value)}
            />
          </label>
          <label>
            Fecha hasta
            <input
              type="date"
              value={filtros.fechaHasta}
              onChange={(e) => setCampo('fechaHasta', e.target.value)}
            />
          </label>
          <label>
            Quién entregó
            <select
              value={filtros.entregadoPor}
              onChange={(e) => setCampo('entregadoPor', e.target.value)}
            >
              <option value="">Todos los operadores</option>
              {operadoresOpts.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Receptor
            <select
              value={filtros.receptor}
              onChange={(e) => setCampo('receptor', e.target.value)}
            >
              <option value="">Todos</option>
              <option value="titular">Titular (devoto)</option>
              <option value="tercero">Tercero</option>
            </select>
          </label>
          <label>
            Buscar
            <input
              type="search"
              value={filtros.busqueda}
              onChange={(e) => setCampo('busqueda', e.target.value)}
              placeholder="Nombre, DPI, código…"
              autoComplete="off"
            />
          </label>
        </div>

        <div className="listado-turnos__acciones">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setFiltros(FILTROS_VACIOS)}
          >
            Limpiar filtros
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={cargar}
            disabled={cargando}
          >
            Actualizar
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() =>
              exportReporteEntregaExcel({
                filas,
                resumen,
                orgNombre: organizacion?.nombre_oficial,
                filtros: {
                  cortejoLabel: cortejoSel?.nombre_evento || 'Todas',
                  estadoLabel,
                  fechaDesde: filtros.fechaDesde,
                  fechaHasta: filtros.fechaHasta,
                  operadorLabel: operadorSel?.label || 'Todos',
                },
              })
            }
            disabled={!filas.length}
          >
            Exportar Excel
          </button>
          <Link to="/entrega" className="btn btn--primary btn--sm">
            Ir a Entrega
          </Link>
        </div>

        <p className="text-muted config-hint listado-turnos__resumen">
          {cortejoSel ? cortejoSel.nombre_evento : 'Todas las procesiones'} · {estadoLabel}
          {(filtros.fechaDesde || filtros.fechaHasta) && (
            <>
              {' '}
              · Fechas: {filtros.fechaDesde || '…'} → {filtros.fechaHasta || '…'}
              <span className="text-muted">
                {' '}
                (entrega si ya entregado; venta si pendiente)
              </span>
            </>
          )}
          {' · '}
          <strong>{filas.length}</strong> turno(s)
        </p>
      </section>

      {error && <div className="alert alert--error">{error}</div>}

      {cargando ? (
        <Loader text="Cargando reporte de entrega…" />
      ) : !filas.length ? (
        <section className="panel">
          <p className="text-muted">No hay turnos con estos filtros.</p>
        </section>
      ) : (
        <section className="panel">
          <div className="table-wrap">
            <table className="data-table data-table--compact">
              <thead>
                <tr>
                  <th>Estado</th>
                  <th>Procesión</th>
                  <th>Turno</th>
                  <th>Brazo</th>
                  <th>Devoto</th>
                  <th>Código</th>
                  <th>Fecha entrega</th>
                  <th>Entregó</th>
                  <th>Receptor</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <StatusBadge
                        status={
                          f.estadoEntrega === 'entregado'
                            ? 'entregado'
                            : 'pendiente_entrega'
                        }
                      />
                    </td>
                    <td>{f.procesion}</td>
                    <td>
                      <strong>#{f.numeroTurno}</strong>
                      <span className="text-muted"> {f.honor}</span>
                    </td>
                    <td>{f.brazoLabel}</td>
                    <td>
                      <strong>{f.nombre}</strong>
                      {f.dpi !== '—' && (
                        <div className="text-muted" style={{ fontSize: '0.78em' }}>
                          DPI {f.dpi}
                        </div>
                      )}
                    </td>
                    <td>
                      <code>{f.codigo}</code>
                    </td>
                    <td>{f.entregadoEn}</td>
                    <td>{f.operadorEntrega}</td>
                    <td>{f.receptor}</td>
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
