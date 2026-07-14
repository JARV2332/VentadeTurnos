import React, { useEffect, useMemo, useState } from 'react';
import Loader from './Loader';
import { getCortejosByOrg, getTurnosByCortejo } from '../services/dataService';
import {
  formatFechaEvento,
  formatHoraDisplay,
} from '../utils/turnoHorarioUtils';

export default function HorarioTurnosPanel({ organizacionId, incluirInactivas = true }) {
  const [cortejos, setCortejos] = useState([]);
  const [cortejoId, setCortejoId] = useState('');
  const [turnos, setTurnos] = useState([]);
  const [cargando, setCargando] = useState(true);

  const refreshCortejos = async () => {
    if (!organizacionId) return;
    const lista = await getCortejosByOrg(organizacionId, { incluirInactivas });
    setCortejos(lista);
    setCortejoId((prev) => {
      if (prev && lista.some((c) => c.id === prev)) return prev;
      return lista.find((c) => c.estado === 'activa')?.id || lista[0]?.id || '';
    });
  };

  useEffect(() => {
    refreshCortejos();
  }, [organizacionId, incluirInactivas]);

  useEffect(() => {
    if (!cortejoId) {
      setTurnos([]);
      setCargando(false);
      return;
    }
    let activo = true;
    setCargando(true);
    getTurnosByCortejo(cortejoId)
      .then((data) => {
        if (activo) setTurnos(data || []);
      })
      .finally(() => {
        if (activo) setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, [cortejoId, organizacionId]);

  const cortejo = useMemo(
    () => cortejos.find((c) => c.id === cortejoId) || null,
    [cortejos, cortejoId]
  );

  const conHorario = turnos.filter((t) => t.hora_estimada).length;

  return (
    <section className="panel horario-turnos">
      <div className="horario-turnos__head">
        <div>
          <h3 className="panel__title">Horario de turnos</h3>
          <p className="text-muted config-hint">
            Fecha del evento y hora estimada de paso por turno. Configure el horario en{' '}
            <strong>Procesiones</strong> (editar turno o asignación automática).
          </p>
        </div>
        <label className="horario-turnos__select">
          Procesión
          <select value={cortejoId} onChange={(e) => setCortejoId(e.target.value)}>
            {!cortejos.length && <option value="">Sin procesiones</option>}
            {cortejos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre_evento}
                {c.estado === 'inactiva' ? ' (inactiva)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      {cortejo && (
        <p className="horario-turnos__evento">
          <strong>Fecha del evento:</strong> {formatFechaEvento(cortejo.fecha)}
          {conHorario > 0 && (
            <span className="horario-turnos__stats">
              · {conHorario} turno(s) con hora asignada
            </span>
          )}
        </p>
      )}

      {cargando ? (
        <Loader text="Cargando turnos…" />
      ) : !turnos.length ? (
        <p className="text-muted">No hay turnos en esta procesión.</p>
      ) : conHorario === 0 ? (
        <p className="text-muted">
          Aún no hay horario de paso configurado. Asígnelo en <strong>Procesiones</strong> al editar
          cada turno o con asignación automática.
        </p>
      ) : (
        <div className="table-wrap">
          <table className="data-table data-table--compact">
            <thead>
              <tr>
                <th>#</th>
                <th>Turno</th>
                <th>Tipo</th>
                <th>Hora de paso</th>
              </tr>
            </thead>
            <tbody>
              {turnos
                .filter((t) => t.hora_estimada)
                .map((t) => (
                  <tr key={t.id}>
                    <td>{t.numero_turno}</td>
                    <td>{t.etiqueta || t.tipo_turno}</td>
                    <td>{t.tipo_turno}</td>
                    <td>{formatHoraDisplay(t.hora_estimada)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
