import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Layout from '../components/Layout';
import Loader from '../components/Loader';
import { useAuth } from '../context/AuthContext';
import { getCortejosByOrg, getTurnosAgrupados } from '../services/dataService';
import {
  construirFilasAsistencia,
  exportAsistenciaTurnosPdf,
  resumenAsistencia,
  tiposTurnoEnLista,
} from '../utils/asistenciaTurnosUtils';
import {
  resolverCortejoInicial,
  cambiarCortejoPreferido,
} from '../utils/cortejoPreferidoUtils';

export default function AsistenciaTurnos() {
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
  const [soloAsignados, setSoloAsignados] = useState(true);
  const [incluirFirma, setIncluirFirma] = useState(true);

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

  const generarReporte = useCallback(async () => {
    if (!cortejoId || !organizacionId) return;
    const seq = ++cargarSeqRef.current;
    setCargando(true);
    setError('');
    setReporteGenerado(false);
    try {
      const turnos = await getTurnosAgrupados(cortejoId, organizacionId);
      if (seq !== cargarSeqRef.current) return;
      setTurnosAgrupados(turnos || []);
      setReporteGenerado(true);
    } catch (err) {
      if (seq !== cargarSeqRef.current) return;
      setError(err.message || 'No se pudo generar la lista de asistencia.');
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

  const tiposTurno = useMemo(() => tiposTurnoEnLista(turnosAgrupados), [turnosAgrupados]);

  const filtros = useMemo(
    () => ({
      tipoTurno: filtroTipo,
      numeroTurno: filtroNumero,
      soloAsignados,
    }),
    [filtroTipo, filtroNumero, soloAsignados]
  );

  const filas = useMemo(
    () => construirFilasAsistencia(turnosAgrupados, filtros),
    [turnosAgrupados, filtros]
  );

  const resumen = useMemo(() => resumenAsistencia(filas), [filas]);

  const imprimir = () => {
    if (!filas.length) {
      setError('No hay personas para imprimir con estos filtros.');
      return;
    }
    exportAsistenciaTurnosPdf({
      filas,
      cortejoNombre: cortejoSel?.nombre_evento,
      orgNombre: organizacion?.nombre_oficial,
      filtros,
      incluirFirma,
    });
  };

  return (
    <Layout
      title="Asistencia de turnos"
      subtitle="Lista imprimible con ordinario/extraordinario, nombre y casilla"
    >
      <section className="panel listado-turnos__filtros">
        <h3 className="panel__title">1. Procesión</h3>
        <div className="listado-turnos__filtros-grid">
          <label>
            Procesión
            <select
              value={cortejoId}
              onChange={(e) =>
                cambiarCortejoPreferido(organizacionId, e.target.value, setCortejoId)
              }
            >
              {cortejos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre_evento}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="listado-turnos__acciones" style={{ marginTop: '0.75rem' }}>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={generarReporte}
            disabled={!cortejoId || cargando}
          >
            {cargando ? 'Generando…' : 'Generar lista'}
          </button>
        </div>
      </section>

      {error && (
        <div className="alert alert--error" style={{ marginTop: '1rem' }}>
          {error}
        </div>
      )}

      {cargando && <Loader text="Cargando turnos y nombres…" />}

      {reporteGenerado && !cargando && (
        <>
          <section className="panel listado-turnos__filtros" style={{ marginTop: '1rem' }}>
            <h3 className="panel__title">2. Filtros e impresión</h3>
            <div className="listado-turnos__filtros-grid">
              <label>
                Tipo de turno
                <select
                  value={filtroTipo}
                  onChange={(e) => setFiltroTipo(e.target.value)}
                >
                  <option value="all">Todos</option>
                  {tiposTurno.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                  {!tiposTurno.includes('Ordinario') && (
                    <option value="Ordinario">Ordinario</option>
                  )}
                  {!tiposTurno.includes('Extraordinario') && (
                    <option value="Extraordinario">Extraordinario</option>
                  )}
                </select>
              </label>
              <label>
                N.º de turno
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Ej. 7"
                  value={filtroNumero}
                  onChange={(e) => setFiltroNumero(e.target.value)}
                />
              </label>
              <label className="config-hint" style={{ alignSelf: 'end' }}>
                <input
                  type="checkbox"
                  checked={soloAsignados}
                  onChange={(e) => setSoloAsignados(e.target.checked)}
                />{' '}
                Solo asignados (pagados / apartados)
              </label>
              <label className="config-hint" style={{ alignSelf: 'end' }}>
                <input
                  type="checkbox"
                  checked={incluirFirma}
                  onChange={(e) => setIncluirFirma(e.target.checked)}
                />{' '}
                Columna de firma en el PDF
              </label>
            </div>

            <p className="text-muted config-hint listado-turnos__resumen">
              <strong>{resumen.total}</strong> persona(s) · <strong>{resumen.turnos}</strong>{' '}
              turno(s)
              {Object.keys(resumen.porTipo).length > 0 && (
                <>
                  {' '}
                  ·{' '}
                  {Object.entries(resumen.porTipo)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(' · ')}
                </>
              )}
            </p>

            <div className="listado-turnos__acciones">
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  setFiltroTipo('all');
                  setFiltroNumero('');
                  setSoloAsignados(true);
                }}
              >
                Limpiar filtros
              </button>
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={imprimir}
                disabled={!filas.length}
              >
                Imprimir / PDF con casillas
              </button>
            </div>
          </section>

          <section className="panel" style={{ marginTop: '1rem' }}>
            <h3 className="panel__title">Vista previa</h3>
            {!filas.length ? (
              <p className="text-muted">No hay personas con estos filtros.</p>
            ) : (
              <div className="table-wrap" style={{ maxHeight: '32rem' }}>
                <table className="data-table data-table--compact">
                  <thead>
                    <tr>
                      <th>Turno</th>
                      <th>Tipo</th>
                      <th>Brazo</th>
                      <th>Devoto</th>
                      <th style={{ width: '4rem', textAlign: 'center' }}>Asistió</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f) => (
                      <tr key={f.id}>
                        <td>#{f.numeroTurno}</td>
                        <td>{f.tipoLabel}</td>
                        <td>{f.brazoLabel}</td>
                        <td>{f.nombre}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span
                            aria-hidden="true"
                            style={{
                              display: 'inline-block',
                              width: 16,
                              height: 16,
                              border: '1.5px solid #0f172a',
                              borderRadius: 2,
                              verticalAlign: 'middle',
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </Layout>
  );
}
