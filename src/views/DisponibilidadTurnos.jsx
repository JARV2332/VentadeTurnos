import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import Loader from '../components/Loader';
import { useAuth } from '../context/AuthContext';
import { getCortejosByOrg, getTurnosAgrupados, subscribeData } from '../services/dataService';
import { labelTipoTurno } from '../utils/cajaReportUtils';
import {
  construirReporteDisponibilidad,
  resumenDisponibilidad,
  tiposTurnoDisponibilidad,
  exportDisponibilidadExcel,
  exportDisponibilidadPdf,
} from '../utils/disponibilidadTurnosUtils';
import {
  resolverCortejoInicial,
  cambiarCortejoPreferido,
} from '../utils/cortejoPreferidoUtils';

export default function DisponibilidadTurnos() {
  const { organizacionId, organizacion } = useAuth();
  const [cortejos, setCortejos] = useState([]);
  const [cortejoId, setCortejoId] = useState('');
  const [turnosAgrupados, setTurnosAgrupados] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [filtroTipo, setFiltroTipo] = useState('all');
  const [filtroNumero, setFiltroNumero] = useState('');
  const [soloConDisponibles, setSoloConDisponibles] = useState(false);

  const cargarCortejos = useCallback(async () => {
    try {
      const data = await getCortejosByOrg(organizacionId, { incluirInactivas: true });
      setCortejos(data || []);
      setCortejoId((prev) => resolverCortejoInicial(data, organizacionId, prev));
    } catch (err) {
      setError(err.message || 'No se pudieron cargar las procesiones.');
    }
  }, [organizacionId]);

  const cargarTurnos = useCallback(async () => {
    if (!cortejoId) return;
    setCargando(true);
    setError('');
    try {
      const turnos = await getTurnosAgrupados(cortejoId, organizacionId);
      setTurnosAgrupados(turnos || []);
    } catch (err) {
      setError(err.message || 'No se pudo cargar la disponibilidad.');
      setTurnosAgrupados([]);
    } finally {
      setCargando(false);
    }
  }, [cortejoId, organizacionId]);

  useEffect(() => {
    cargarCortejos();
  }, [cargarCortejos]);

  useEffect(() => {
    cargarTurnos();
    return subscribeData(organizacionId, cargarTurnos, 2000);
  }, [organizacionId, cargarTurnos]);

  const cortejoSel = useMemo(
    () => cortejos.find((c) => c.id === cortejoId) || null,
    [cortejos, cortejoId]
  );

  const tiposTurno = useMemo(() => tiposTurnoDisponibilidad(turnosAgrupados), [turnosAgrupados]);

  const filas = useMemo(
    () =>
      construirReporteDisponibilidad(turnosAgrupados, {
        tipoTurno: filtroTipo,
        numeroTurno: filtroNumero,
        soloConDisponibles,
      }),
    [turnosAgrupados, filtroTipo, filtroNumero, soloConDisponibles]
  );

  const resumen = useMemo(() => resumenDisponibilidad(filas), [filas]);

  const limpiarFiltros = () => {
    setFiltroTipo('all');
    setFiltroNumero('');
    setSoloConDisponibles(false);
  };

  const exportarBase = () => ({
    filas,
    cortejoNombre: cortejoSel?.nombre_evento,
    orgNombre: organizacion?.nombre_oficial,
    resumen,
  });

  return (
    <Layout
      title="Disponibilidad de turnos"
      subtitle="Turnos con brazos libres y resumen de ocupación por procesión"
    >
      <section className="panel listado-turnos__filtros">
        <h3 className="panel__title">Filtros</h3>
        <div className="listado-turnos__filtros-grid">
          <label>
            Procesión
            <select
              value={cortejoId}
              onChange={(e) => cambiarCortejoPreferido(organizacionId, e.target.value, setCortejoId)}
            >
              {cortejos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre_evento}
                  {c.estado !== 'activa' ? ' (inactiva)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tipo de turno
            <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
              <option value="all">Todos</option>
              {tiposTurno.map((t) => (
                <option key={t} value={t}>
                  {labelTipoTurno(t)}
                </option>
              ))}
            </select>
          </label>
          <label>
            N.º turno
            <input
              type="number"
              min="1"
              value={filtroNumero}
              onChange={(e) => setFiltroNumero(e.target.value)}
              placeholder="Todos"
            />
          </label>
        </div>
        <div className="listado-turnos__acciones">
          <label className="listado-turnos__check">
            <input
              type="checkbox"
              checked={soloConDisponibles}
              onChange={(e) => setSoloConDisponibles(e.target.checked)}
            />
            Solo turnos con brazos libres
          </label>
          <button type="button" className="btn btn--ghost btn--sm" onClick={limpiarFiltros}>
            Limpiar filtros
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => exportDisponibilidadExcel(exportarBase())}
            disabled={!filas.length}
          >
            Exportar Excel
          </button>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => exportDisponibilidadPdf(exportarBase())}
            disabled={!filas.length}
          >
            Imprimir / Guardar PDF
          </button>
        </div>
      </section>

      {error && <div className="alert alert--error">{error}</div>}

      {!cargando && filas.length > 0 && (
        <div className="metrics-grid metrics-grid--5 disponibilidad-turnos__kpis">
          <div className="metric-card">
            <span className="metric-card__label">Turnos en reporte</span>
            <strong className="metric-card__value">{resumen.turnos}</strong>
          </div>
          <div className="metric-card metric-card--primary">
            <span className="metric-card__label">Brazos libres</span>
            <strong className="metric-card__value">{resumen.brazosLibres}</strong>
            <small>de {resumen.brazosTotal} totales</small>
          </div>
          <div className="metric-card">
            <span className="metric-card__label">Turnos con libres</span>
            <strong className="metric-card__value">{resumen.turnosConLibres}</strong>
          </div>
          <div className="metric-card">
            <span className="metric-card__label">Brazos ocupados</span>
            <strong className="metric-card__value">{resumen.brazosOcupados}</strong>
          </div>
          <div className="metric-card">
            <span className="metric-card__label">Turnos llenos</span>
            <strong className="metric-card__value">{resumen.turnosLlenos}</strong>
          </div>
        </div>
      )}

      {cargando ? (
        <Loader text="Cargando disponibilidad…" />
      ) : !filas.length ? (
        <section className="panel">
          <p className="text-muted">
            No hay turnos que coincidan con los filtros. Pruebe desmarcar «Solo turnos con brazos
            libres».
          </p>
        </section>
      ) : (
        <section className="panel">
          <h3 className="panel__title">
            {cortejoSel?.nombre_evento || 'Procesión'} — {filas.length} turno(s)
          </h3>
          <div className="table-wrap">
            <table className="data-table data-table--compact disponibilidad-turnos__tabla">
              <thead>
                <tr>
                  <th>Turno</th>
                  <th>Nombre</th>
                  <th>Melodías / son</th>
                  <th>Hora</th>
                  <th>Precio</th>
                  <th>Total</th>
                  <th>Libres</th>
                  <th>Vendidos</th>
                  <th>Apartados</th>
                  <th>Res. taquilla</th>
                  <th>% libre</th>
                  <th className="no-print">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr
                    key={f.turno.id}
                    className={f.disponibles === 0 ? 'disponibilidad-turnos__fila-llena' : ''}
                  >
                    <td>
                      <strong>#{f.numero}</strong>
                    </td>
                    <td>{f.nombre}</td>
                    <td>
                      <span className="disponibilidad-turnos__melodias">{f.melodias}</span>
                    </td>
                    <td>{f.hora}</td>
                    <td>{f.precio}</td>
                    <td>{f.total}</td>
                    <td className={f.disponibles > 0 ? 'disponibilidad-turnos__celda-libres' : undefined}>
                      <strong
                        className={
                          f.disponibles > 0
                            ? 'disponibilidad-turnos__libres'
                            : 'text-muted'
                        }
                      >
                        {f.disponibles}
                      </strong>
                    </td>
                    <td>{f.vendidos}</td>
                    <td>{f.apartados}</td>
                    <td>{f.reservaTaquilla}</td>
                    <td>{f.pctLibre}%</td>
                    <td className="no-print">
                      {f.disponibles > 0 ? (
                        <Link
                          to={`/taquilla?cortejo=${encodeURIComponent(cortejoId)}&turno=${f.numero}`}
                          className="btn btn--primary btn--sm"
                        >
                          Vender en Taquilla
                        </Link>
                      ) : (
                        <span className="text-muted">Lleno</span>
                      )}
                    </td>
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
