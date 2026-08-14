import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Layout from '../components/Layout';
import Loader from '../components/Loader';
import { useAuth } from '../context/AuthContext';
import { getCortejosByOrg, getTurnosAgrupados } from '../services/dataService';
import {
  catalogoTurnosAsistencia,
  construirFilasAsistencia,
  exportAsistenciaTurnosPdf,
  resumenAsistencia,
  TIPOS_FILTRO_CHECKBOX,
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

  /** Tipos marcados (Ordinario, Extraordinario, Entrada, Salida…). */
  const [tiposSeleccionados, setTiposSeleccionados] = useState(() => new Set());
  /** Números de turno marcados. */
  const [numerosSeleccionados, setNumerosSeleccionados] = useState(() => new Set());
  const [soloAsignados, setSoloAsignados] = useState(true);
  const [incluirFirma, setIncluirFirma] = useState(true);

  const sincronizarNumerosConTipos = useCallback((tiposSet, catalogoTurnos) => {
    if (!tiposSet.size) {
      setNumerosSeleccionados(new Set());
      return;
    }
    const visibles = catalogoTurnos.filter((t) => tiposSet.has(t.tipo));
    setNumerosSeleccionados(new Set(visibles.map((t) => String(t.numero))));
  }, []);

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
    setTiposSeleccionados(new Set());
    setNumerosSeleccionados(new Set());
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
      const tipos = new Set((turnos || []).map((t) => t.tipo_turno).filter(Boolean));
      setTiposSeleccionados(tipos);
      const todos = (turnos || []).map((t) => String(t.numero_turno));
      setNumerosSeleccionados(new Set(todos));
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

  const catalogo = useMemo(
    () => catalogoTurnosAsistencia(turnosAgrupados),
    [turnosAgrupados]
  );

  const tiposEnProcesion = useMemo(
    () => tiposTurnoEnLista(turnosAgrupados),
    [turnosAgrupados]
  );

  const turnosVisibles = useMemo(() => {
    if (!tiposSeleccionados.size) return [];
    return catalogo.filter((t) => tiposSeleccionados.has(t.tipo));
  }, [catalogo, tiposSeleccionados]);

  const filtros = useMemo(
    () => ({
      tiposTurno: [...tiposSeleccionados],
      numerosTurno: [...numerosSeleccionados],
      soloAsignados,
    }),
    [tiposSeleccionados, numerosSeleccionados, soloAsignados]
  );

  const filas = useMemo(
    () => construirFilasAsistencia(turnosAgrupados, filtros),
    [turnosAgrupados, filtros]
  );

  const resumen = useMemo(() => resumenAsistencia(filas), [filas]);

  const toggleTipo = (tipoId) => {
    setTiposSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(tipoId)) next.delete(tipoId);
      else next.add(tipoId);
      sincronizarNumerosConTipos(next, catalogo);
      return next;
    });
  };

  const marcarTodosTipos = () => {
    const next = new Set(tiposEnProcesion);
    setTiposSeleccionados(next);
    sincronizarNumerosConTipos(next, catalogo);
  };

  const quitarTodosTipos = () => {
    setTiposSeleccionados(new Set());
    setNumerosSeleccionados(new Set());
  };

  const toggleNumero = (numero) => {
    const key = String(numero);
    setNumerosSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const seleccionarTodosVisibles = () => {
    setNumerosSeleccionados(new Set(turnosVisibles.map((t) => String(t.numero))));
  };

  const limpiarNumeros = () => setNumerosSeleccionados(new Set());

  const limpiarFiltros = () => {
    const tipos = new Set(tiposEnProcesion);
    setTiposSeleccionados(tipos);
    setNumerosSeleccionados(new Set(catalogo.map((t) => String(t.numero))));
    setSoloAsignados(true);
  };

  const imprimir = () => {
    if (!filas.length) {
      setError('No hay personas para imprimir con estos filtros.');
      return;
    }
    setError('');
    exportAsistenciaTurnosPdf({
      filas,
      cortejoNombre: cortejoSel?.nombre_evento,
      orgNombre: organizacion?.nombre_oficial,
      filtros,
      incluirFirma,
    });
  };

  const opcionesTipo = useMemo(() => {
    const disponibles = TIPOS_FILTRO_CHECKBOX.filter((b) =>
      tiposEnProcesion.includes(b.id)
    );
    const conocidos = new Set(TIPOS_FILTRO_CHECKBOX.map((b) => b.id));
    const extras = tiposEnProcesion
      .filter((t) => !conocidos.has(t))
      .map((t) => ({ id: t, label: t }));
    const lista = [...disponibles, ...extras];
    return lista.length ? lista : TIPOS_FILTRO_CHECKBOX;
  }, [tiposEnProcesion]);

  return (
    <Layout
      title="Asistencia de turnos"
      subtitle="Elija tipo y número de turno; imprima con casilla de asistencia"
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
            <h3 className="panel__title">2. ¿Qué turnos quiere?</h3>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '0.5rem',
              }}
            >
              <strong style={{ fontSize: '0.9rem' }}>Tipo</strong>
              <span className="text-muted config-hint">
                (puede marcar varios: entrada + salida, etc.)
              </span>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={marcarTodosTipos}
              >
                Todos los tipos
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={quitarTodosTipos}
                disabled={!tiposSeleccionados.size}
              >
                Ninguno
              </button>
            </div>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.5rem',
                marginBottom: '1rem',
              }}
            >
              {opcionesTipo.map((b) => {
                const activo = tiposSeleccionados.has(b.id);
                return (
                  <label
                    key={b.id}
                    className={`btn btn--sm ${activo ? 'btn--primary' : 'btn--ghost'}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      cursor: 'pointer',
                      margin: 0,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={activo}
                      onChange={() => toggleTipo(b.id)}
                    />
                    {b.label}
                  </label>
                );
              })}
            </div>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '0.5rem',
              }}
            >
              <strong style={{ fontSize: '0.9rem' }}>Marque los turnos</strong>
              <span className="text-muted config-hint">
                (según los tipos marcados arriba)
              </span>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={seleccionarTodosVisibles}
                disabled={!turnosVisibles.length}
              >
                Marcar todos
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={limpiarNumeros}
                disabled={!numerosSeleccionados.size}
              >
                Quitar todos
              </button>
            </div>

            {!tiposSeleccionados.size ? (
              <p className="text-muted">Marque al menos un tipo (ordinario, entrada…).</p>
            ) : !turnosVisibles.length ? (
              <p className="text-muted">No hay turnos con esos tipos en esta procesión.</p>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                  gap: '0.4rem',
                  maxHeight: '14rem',
                  overflow: 'auto',
                  padding: '0.5rem',
                  border: '1px solid var(--border, #e2e8f0)',
                  borderRadius: '8px',
                  marginBottom: '1rem',
                }}
              >
                {turnosVisibles.map((t) => {
                  const key = String(t.numero);
                  const marcado = numerosSeleccionados.has(key);
                  return (
                    <label
                      key={key}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.4rem',
                        padding: '0.35rem 0.45rem',
                        borderRadius: '6px',
                        border: marcado ? '1px solid #93c5fd' : '1px solid transparent',
                        background: marcado ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={() => toggleNumero(t.numero)}
                        style={{ marginTop: '0.15rem' }}
                      />
                      <span>
                        <strong>#{t.numero}</strong>
                        <br />
                        <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                          {t.tipoLabel}
                          {t.etiqueta ? ` · ${t.etiqueta}` : ''}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            <div className="listado-turnos__filtros-grid">
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
              {tiposSeleccionados.size > 0 ? (
                <>
                  {' '}
                  · tipos: <strong>{[...tiposSeleccionados].join(', ')}</strong>
                </>
              ) : null}
              {numerosSeleccionados.size > 0 ? (
                <>
                  {' '}
                  · turnos:{' '}
                  <strong>
                    {[...numerosSeleccionados]
                      .sort((a, b) => Number(a) - Number(b))
                      .map((n) => `#${n}`)
                      .join(', ')}
                  </strong>
                </>
              ) : (
                <>
                  {' '}
                  · <strong>ningún turno marcado</strong>
                </>
              )}
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
              <button type="button" className="btn btn--ghost btn--sm" onClick={limpiarFiltros}>
                Restablecer filtros
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
