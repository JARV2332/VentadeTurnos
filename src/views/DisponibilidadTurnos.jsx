import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import Loader from '../components/Loader';
import { useAuth } from '../context/AuthContext';
import { getCortejosByOrg, getTurnosAgrupadosDisponibilidad } from '../services/dataService';
import { labelTipoTurno } from '../utils/cajaReportUtils';
import {
  construirReporteDisponibilidad,
  resumenDisponibilidad,
  tiposTurnoDisponibilidad,
  exportDisponibilidadExcel,
  exportDisponibilidadPdf,
  exportTurnosDisponiblesBonito,
  COLUMNAS_REPORTE_DISPONIBLES,
  COLUMNAS_REPORTE_DEFAULT,
  cargarColumnasReporteGuardadas,
  guardarColumnasReporte,
  columnasActivasOrdenadas,
  celdaReporteDisponible,
} from '../utils/disponibilidadTurnosUtils';
import {
  resolverCortejoInicial,
  cambiarCortejoPreferido,
} from '../utils/cortejoPreferidoUtils';

export default function DisponibilidadTurnos() {
  const { organizacionId, organizacion } = useAuth();
  const cargarSeqRef = useRef(0);
  const [cortejos, setCortejos] = useState([]);
  const [cortejoId, setCortejoId] = useState('');
  const [turnosAgrupados, setTurnosAgrupados] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [reporteGenerado, setReporteGenerado] = useState(false);

  const [filtroTipo, setFiltroTipo] = useState('all');
  const [filtroNumero, setFiltroNumero] = useState('');
  const [soloConDisponibles, setSoloConDisponibles] = useState(true);
  const [columnas, setColumnas] = useState(() => cargarColumnasReporteGuardadas());

  const cargarCortejos = useCallback(async () => {
    try {
      const data = await getCortejosByOrg(organizacionId, { incluirInactivas: true });
      setCortejos(data || []);
      setCortejoId((prev) => resolverCortejoInicial(data, organizacionId, prev));
    } catch (err) {
      setError(err.message || 'No se pudieron cargar las procesiones.');
    }
  }, [organizacionId]);

  useEffect(() => {
    cargarCortejos();
  }, [cargarCortejos]);

  useEffect(() => {
    setReporteGenerado(false);
    setTurnosAgrupados([]);
    setError('');
  }, [cortejoId]);

  useEffect(() => {
    guardarColumnasReporte(columnas);
  }, [columnas]);

  const generarReporte = useCallback(async () => {
    if (!cortejoId || !organizacionId) return;
    const seq = ++cargarSeqRef.current;
    setCargando(true);
    setError('');
    setReporteGenerado(false);
    try {
      const turnos = await getTurnosAgrupadosDisponibilidad(cortejoId, organizacionId);
      if (seq !== cargarSeqRef.current) return;
      setTurnosAgrupados(turnos || []);
      setReporteGenerado(true);
    } catch (err) {
      if (seq !== cargarSeqRef.current) return;
      setError(err.message || 'No se pudo generar el reporte de disponibilidad.');
      setTurnosAgrupados([]);
      setReporteGenerado(false);
    } finally {
      if (seq === cargarSeqRef.current) setCargando(false);
    }
  }, [cortejoId, organizacionId]);

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

  const filasDisponiblesReporte = useMemo(
    () =>
      construirReporteDisponibilidad(turnosAgrupados, {
        soloConDisponibles: true,
      }),
    [turnosAgrupados]
  );

  const resumen = useMemo(() => resumenDisponibilidad(filasDisponiblesReporte), [filasDisponiblesReporte]);

  const columnasActivas = useMemo(() => columnasActivasOrdenadas(columnas), [columnas]);
  const hayColumnas = columnasActivas.length > 0;

  const toggleColumna = (id) => {
    setColumnas((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const limpiarFiltros = () => {
    setFiltroTipo('all');
    setFiltroNumero('');
    setSoloConDisponibles(true);
  };

  const exportarBase = () => ({
    filas,
    cortejoNombre: cortejoSel?.nombre_evento,
    orgNombre: organizacion?.nombre_oficial,
    resumen: resumenDisponibilidad(filas),
  });

  return (
    <Layout
      title="Disponibilidad de turnos"
      subtitle="Elija procesión y columnas, luego pulse Generar reporte"
    >
      <section className="panel listado-turnos__filtros">
        <h3 className="panel__title">1. Procesión y columnas</h3>
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
        </div>

        <p className="text-muted config-hint" style={{ marginTop: '0.85rem' }}>
          Columnas del reporte (marque solo lo que quiere imprimir):
        </p>
        <div className="disponibilidad-columnas__grid">
          {COLUMNAS_REPORTE_DISPONIBLES.map((col) => (
            <label key={col.id} className="listado-turnos__check disponibilidad-columnas__item">
              <input
                type="checkbox"
                checked={Boolean(columnas[col.id])}
                onChange={() => toggleColumna(col.id)}
              />
              {col.label}
            </label>
          ))}
        </div>
        <div className="listado-turnos__acciones">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setColumnas({ ...COLUMNAS_REPORTE_DEFAULT })}
          >
            Solo nombre y melodía
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() =>
              setColumnas(
                Object.fromEntries(COLUMNAS_REPORTE_DISPONIBLES.map((c) => [c.id, true]))
              )
            }
          >
            Todas las columnas
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={generarReporte}
            disabled={!cortejoId || cargando || !hayColumnas}
          >
            {cargando ? 'Generando…' : 'Generar reporte'}
          </button>
        </div>
        {!hayColumnas && (
          <p className="alert alert--warning" style={{ marginTop: '0.75rem' }}>
            Seleccione al menos una columna.
          </p>
        )}
      </section>

      {error && <div className="alert alert--error">{error}</div>}

      {cargando && <Loader text="Cargando todos los brazos de la procesión…" />}

      {!cargando && !reporteGenerado && (
        <section className="panel">
          <p className="text-muted">
            Pulse <strong>Generar reporte</strong> para ver los turnos con brazos libres. El reporte
            no se recarga solo: solo cuando usted lo genere.
          </p>
        </section>
      )}

      {!cargando && reporteGenerado && (
        <>
          <div className="metrics-grid metrics-grid--4 disponibilidad-turnos__kpis">
            <div className="metric-card">
              <span className="metric-card__label">Turnos con libres</span>
              <strong className="metric-card__value">{resumen.turnosConLibres}</strong>
            </div>
            <div className="metric-card metric-card--primary">
              <span className="metric-card__label">Brazos libres</span>
              <strong className="metric-card__value">{resumen.brazosLibres}</strong>
              <small>de {resumen.brazosTotal} totales</small>
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

          {filasDisponiblesReporte.length > 0 && hayColumnas ? (
            <section className="panel turnos-disponibles-cuadro">
              <header className="turnos-disponibles-cuadro__head">
                <p className="turnos-disponibles-cuadro__eyebrow">
                  {organizacion?.nombre_oficial || 'Organización'}
                </p>
                <h2 className="turnos-disponibles-cuadro__title">Turnos disponibles</h2>
                {cortejoSel?.nombre_evento && (
                  <p className="turnos-disponibles-cuadro__sub">{cortejoSel.nombre_evento}</p>
                )}
              </header>
              <div className="table-wrap">
                <table className="turnos-disponibles-cuadro__tabla">
                  <thead>
                    <tr>
                      {columnasActivas.map((col) => (
                        <th key={col.id}>{col.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filasDisponiblesReporte.map((f) => (
                      <tr key={`disp-${f.turno.id}`}>
                        {columnasActivas.map((col) => {
                          const valor = celdaReporteDisponible(f, col.id);
                          if (col.id === 'nombre') {
                            return (
                              <td key={col.id}>
                                {!columnas.numero && (
                                  <span className="turnos-disponibles-cuadro__num">#{f.numero}</span>
                                )}
                                <strong>{valor}</strong>
                              </td>
                            );
                          }
                          if (col.id === 'melodia') {
                            return (
                              <td key={col.id} className="turnos-disponibles-cuadro__melodia">
                                {valor || '—'}
                              </td>
                            );
                          }
                          return <td key={col.id}>{valor || '—'}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="turnos-disponibles-cuadro__foot">
                {filasDisponiblesReporte.length} turno
                {filasDisponiblesReporte.length === 1 ? '' : 's'} con espacio libre
              </p>
            </section>
          ) : (
            <section className="panel">
              <p className="text-muted">No hay turnos con brazos libres en esta procesión.</p>
            </section>
          )}

          <section className="panel listado-turnos__filtros">
            <h3 className="panel__title">2. Imprimir / filtrar detalle</h3>
            <div className="listado-turnos__filtros-grid">
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
                className="btn btn--primary btn--sm"
                onClick={() =>
                  exportTurnosDisponiblesBonito({
                    filas: filasDisponiblesReporte,
                    cortejoNombre: cortejoSel?.nombre_evento,
                    orgNombre: organizacion?.nombre_oficial,
                    soloConLibres: false,
                    columnas,
                  })
                }
                disabled={!filasDisponiblesReporte.length || !hayColumnas}
              >
                Imprimir turnos disponibles
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => exportDisponibilidadExcel(exportarBase())}
                disabled={!filas.length}
              >
                Excel detalle
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => exportDisponibilidadPdf(exportarBase())}
                disabled={!filas.length}
              >
                PDF detalle
              </button>
            </div>
          </section>

          {filas.length > 0 && (
            <section className="panel">
              <h3 className="panel__title">
                Detalle ({filas.length} turno{filas.length === 1 ? '' : 's'})
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
                        <td
                          className={
                            f.disponibles > 0 ? 'disponibilidad-turnos__celda-libres' : undefined
                          }
                        >
                          <strong
                            className={
                              f.disponibles > 0 ? 'disponibilidad-turnos__libres' : 'text-muted'
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
        </>
      )}
    </Layout>
  );
}
