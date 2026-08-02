import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import Loader from '../components/Loader';
import SeleccionarTurnosPendientesModal from '../components/SeleccionarTurnosPendientesModal';
import { useAuth } from '../context/AuthContext';
import {
  getBrazosEntregaReporteByOrg,
  getCargadoresByOrg,
  getCortejosByOrg,
  getTurnosByIds,
} from '../services/dataService';
import {
  agruparPendientesPorTipoYTurno,
  construirFilasPendientesEntrega,
  exportPendientesEntregaDetalleExcel,
  exportPendientesEntregaDetallePdf,
  opcionesTurnosConPendientes,
} from '../utils/entregaPendientesUtils';

const TIPO_OPCIONES = [
  { value: '', label: 'Todos los tipos' },
  { value: 'honor', label: 'Honor (Salida, Extraordinario, Entrada)' },
  { value: 'ordinario', label: 'Solo Ordinarios' },
  { value: 'Salida', label: 'Solo Salida' },
  { value: 'Extraordinario', label: 'Solo Extraordinario' },
  { value: 'Entrada', label: 'Solo Entrada' },
];

export default function ReportePendientesEntregaDetalle() {
  const { organizacionId, organizacion } = useAuth();
  const [cortejos, setCortejos] = useState([]);
  const [brazos, setBrazos] = useState([]);
  const [cargadoresPorId, setCargadoresPorId] = useState({});
  const [turnosPorId, setTurnosPorId] = useState({});
  const [cortejoId, setCortejoId] = useState('');
  const [tipoGrupo, setTipoGrupo] = useState('honor');
  const [turnoIdsSel, setTurnoIdsSel] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [modalTurnos, setModalTurnos] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    if (!organizacionId) return;
    setCargando(true);
    setError('');
    try {
      const [cortejosData, brazosData, cargadores] = await Promise.all([
        getCortejosByOrg(organizacionId, { incluirInactivas: true }),
        getBrazosEntregaReporteByOrg(organizacionId),
        getCargadoresByOrg(organizacionId),
      ]);
      setCortejos(cortejosData || []);
      setBrazos(brazosData || []);
      setCargadoresPorId(Object.fromEntries((cargadores || []).map((c) => [c.id, c])));
      const turnoIds = [...new Set((brazosData || []).map((b) => b.turno_id).filter(Boolean))];
      const turnos = turnoIds.length ? await getTurnosByIds(turnoIds) : {};
      setTurnosPorId(turnos || {});
    } catch (err) {
      setError(err.message || 'No se pudo cargar pendientes de entrega.');
    } finally {
      setCargando(false);
    }
  }, [organizacionId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cortejosPorId = useMemo(
    () => Object.fromEntries(cortejos.map((c) => [c.id, c])),
    [cortejos]
  );

  const filasBase = useMemo(
    () =>
      construirFilasPendientesEntrega({
        brazos,
        turnosPorId,
        cortejosPorId,
        cargadoresPorId,
        filtros: { cortejoId, tipoGrupo },
      }),
    [brazos, turnosPorId, cortejosPorId, cargadoresPorId, cortejoId, tipoGrupo]
  );

  const opcionesTurnos = useMemo(
    () => opcionesTurnosConPendientes(filasBase),
    [filasBase]
  );

  const filas = useMemo(
    () =>
      construirFilasPendientesEntrega({
        brazos,
        turnosPorId,
        cortejosPorId,
        cargadoresPorId,
        filtros: {
          cortejoId,
          tipoGrupo,
          turnoIds: turnoIdsSel.length ? turnoIdsSel : undefined,
          busqueda,
        },
      }),
    [
      brazos,
      turnosPorId,
      cortejosPorId,
      cargadoresPorId,
      cortejoId,
      tipoGrupo,
      turnoIdsSel,
      busqueda,
    ]
  );

  const grupos = useMemo(() => agruparPendientesPorTipoYTurno(filas), [filas]);
  const cortejoSel = cortejos.find((c) => c.id === cortejoId);
  const tipoLabel =
    TIPO_OPCIONES.find((o) => o.value === tipoGrupo)?.label || 'Todos';

  return (
    <Layout
      title="Pendientes de entrega (detalle)"
      subtitle="Agrupados por tipo y número de turno, con nombre del devoto"
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
            Tipo de turno
            <select value={tipoGrupo} onChange={(e) => setTipoGrupo(e.target.value)}>
              {TIPO_OPCIONES.map((o) => (
                <option key={o.value || 'todos'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Buscar
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Nombre, DPI, código…"
              autoComplete="off"
            />
          </label>
        </div>

        <div className="listado-turnos__acciones">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setModalTurnos(true)}
            disabled={!opcionesTurnos.length}
          >
            Elegir turnos
            {turnoIdsSel.length ? ` (${turnoIdsSel.length})` : ''}
          </button>
          {turnoIdsSel.length > 0 && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setTurnoIdsSel([])}
            >
              Ver todos los del filtro
            </button>
          )}
          <button type="button" className="btn btn--ghost btn--sm" onClick={cargar} disabled={cargando}>
            Actualizar
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={!filas.length}
            onClick={() =>
              exportPendientesEntregaDetalleExcel({
                filas,
                orgNombre: organizacion?.nombre_oficial,
                cortejoLabel: cortejoSel?.nombre_evento || 'Todas',
                tipoLabel,
              })
            }
          >
            Exportar Excel
          </button>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={!filas.length}
            onClick={() =>
              exportPendientesEntregaDetallePdf({
                filas,
                orgNombre: organizacion?.nombre_oficial,
                cortejoLabel: cortejoSel?.nombre_evento || 'Todas las procesiones',
                tipoLabel,
              })
            }
          >
            Imprimir / Guardar PDF
          </button>
        </div>

        <p className="text-muted config-hint listado-turnos__resumen">
          {cortejoSel?.nombre_evento || 'Todas'} · {tipoLabel}
          {turnoIdsSel.length ? ` · ${turnoIdsSel.length} turno(s) elegido(s)` : ''}
          {' · '}
          <strong>{filas.length}</strong> pendiente(s)
        </p>
      </section>

      {error && <div className="alert alert--error">{error}</div>}

      {cargando ? (
        <Loader text="Cargando pendientes de entrega…" />
      ) : !filas.length ? (
        <section className="panel">
          <p className="text-muted">No hay pendientes con estos filtros.</p>
        </section>
      ) : (
        grupos.map((grupo) => (
          <section key={grupo.tipoTurno} className="panel" style={{ marginTop: '1rem' }}>
            <h3 className="panel__title">
              {grupo.tipoTurno}{' '}
              <span className="text-muted" style={{ fontWeight: 500 }}>
                ({grupo.total})
              </span>
            </h3>
            {grupo.turnos.map((turno) => (
              <div key={`${grupo.tipoTurno}-${turno.numeroTurno}`} style={{ marginBottom: '1.25rem' }}>
                <h4 className="panel__subtitle">
                  Turno #{turno.numeroTurno} · {turno.honor}{' '}
                  <span className="text-muted">({turno.items.length})</span>
                </h4>
                <div className="table-wrap">
                  <table className="data-table data-table--compact">
                    <thead>
                      <tr>
                        <th>Devoto</th>
                        <th>DPI</th>
                        <th>WhatsApp</th>
                        <th>Correo</th>
                        <th>Brazo</th>
                        <th>Código</th>
                        <th>Venta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {turno.items.map((f) => (
                        <tr key={f.id}>
                          <td>
                            <strong>{f.nombre}</strong>
                          </td>
                          <td>{f.dpi}</td>
                          <td>{f.whatsapp}</td>
                          <td>{f.correo}</td>
                          <td>{f.brazoLabel}</td>
                          <td>
                            <code>{f.codigo}</code>
                          </td>
                          <td>
                            {f.fechaPago} {f.horaPago}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </section>
        ))
      )}

      {modalTurnos && (
        <SeleccionarTurnosPendientesModal
          opciones={opcionesTurnos}
          seleccionInicial={turnoIdsSel}
          onCerrar={() => setModalTurnos(false)}
          onAplicar={(ids) => {
            setTurnoIdsSel(ids);
            setModalTurnos(false);
          }}
        />
      )}
    </Layout>
  );
}
