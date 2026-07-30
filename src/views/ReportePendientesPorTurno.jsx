import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import Layout from '../components/Layout';
import Loader from '../components/Loader';
import { useAuth } from '../context/AuthContext';
import {
  getBrazosEntregaReporteByOrg,
  getCortejosByOrg,
  getTurnosByIds,
} from '../services/dataService';
import {
  construirReporteEntrega,
  resumirPendientesPorTipoYTurno,
} from '../utils/reporteEntregaUtils';

function exportarExcelResumen(filas, organizacion, procesion) {
  const datos = filas.map((fila) => ({
    Procesión: fila.procesion,
    'Tipo de turno': fila.tipoTurno,
    'Número de turno': fila.numeroTurno,
    Honor: fila.honor,
    'Pendientes de entrega': fila.pendientes,
  }));
  const hoja = XLSX.utils.json_to_sheet(datos);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Pendientes por turno');
  XLSX.writeFile(
    libro,
    `pendientes-por-turno-${organizacion || 'reporte'}-${Date.now()}.xlsx`
  );
}

export default function ReportePendientesPorTurno() {
  const { organizacionId, organizacion } = useAuth();
  const [cortejos, setCortejos] = useState([]);
  const [brazos, setBrazos] = useState([]);
  const [turnosPorId, setTurnosPorId] = useState({});
  const [cortejoId, setCortejoId] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    if (!organizacionId) return;
    setCargando(true);
    setError('');
    try {
      const [cortejosData, brazosData] = await Promise.all([
        getCortejosByOrg(organizacionId, { incluirInactivas: true }),
        getBrazosEntregaReporteByOrg(organizacionId),
      ]);
      setCortejos(cortejosData || []);
      setBrazos(brazosData || []);
      const turnoIds = [...new Set((brazosData || []).map((b) => b.turno_id).filter(Boolean))];
      const turnos = turnoIds.length ? await getTurnosByIds(turnoIds) : {};
      setTurnosPorId(turnos || {});
    } catch (err) {
      setError(err.message || 'No se pudo cargar el resumen de pendientes.');
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

  const detallePendientes = useMemo(
    () =>
      construirReporteEntrega({
        brazos,
        turnosPorId,
        cortejosPorId,
        cargadoresPorId: {},
        filtros: { estado: 'pendiente', cortejoId },
      }),
    [brazos, turnosPorId, cortejosPorId, cortejoId]
  );

  const resumen = useMemo(
    () => resumirPendientesPorTipoYTurno(detallePendientes),
    [detallePendientes]
  );
  const totalPendientes = detallePendientes.length;
  const cortejoSeleccionado = cortejos.find((c) => c.id === cortejoId);

  return (
    <Layout
      title="Pendientes por tipo y turno"
      subtitle="Cantidad de brazos vendidos que aún faltan entregar, agrupados por tipo y número"
    >
      <section className="panel listado-turnos__filtros">
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
        </div>
        <div className="listado-turnos__acciones">
          <button type="button" className="btn btn--ghost btn--sm" onClick={cargar} disabled={cargando}>
            Actualizar
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() =>
              exportarExcelResumen(
                resumen,
                organizacion?.nombre_oficial,
                cortejoSeleccionado?.nombre_evento || 'todas'
              )
            }
            disabled={!resumen.length}
          >
            Exportar Excel
          </button>
        </div>
      </section>

      {error && <div className="alert alert--error">{error}</div>}

      {cargando ? (
        <Loader text="Calculando pendientes por turno…" />
      ) : (
        <>
          <div className="metrics-grid metrics-grid--4">
            <div className="metric-card">
              <span className="metric-card__label">Pendientes de entrega</span>
              <strong className="metric-card__value metric-card__value--warn">{totalPendientes}</strong>
            </div>
            <div className="metric-card">
              <span className="metric-card__label">Tipos de turno</span>
              <strong className="metric-card__value">
                {new Set(resumen.map((fila) => fila.tipoTurno)).size}
              </strong>
            </div>
            <div className="metric-card">
              <span className="metric-card__label">Números de turno</span>
              <strong className="metric-card__value">{resumen.length}</strong>
            </div>
          </div>

          <section className="panel">
            <h3 className="panel__title">Resumen</h3>
            {!resumen.length ? (
              <p className="text-muted">No hay turnos pendientes de entrega con este filtro.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Procesión</th>
                      <th>Tipo de turno</th>
                      <th>Número de turno</th>
                      <th>Honor</th>
                      <th>Pendientes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumen.map((fila) => (
                      <tr key={`${fila.tipoTurno}-${fila.numeroTurno}-${fila.procesion}`}>
                        <td>{fila.procesion}</td>
                        <td><strong>{fila.tipoTurno}</strong></td>
                        <td>#{fila.numeroTurno}</td>
                        <td>{fila.honor}</td>
                        <td><strong>{fila.pendientes}</strong></td>
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
