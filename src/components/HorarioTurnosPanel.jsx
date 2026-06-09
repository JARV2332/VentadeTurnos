import React, { useEffect, useMemo, useState } from 'react';
import Loader from './Loader';
import { getCortejosByOrg, getTurnosByCortejo, subscribeData } from '../services/dataService';
import {
  combinarFechaHoraTurno,
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
    return subscribeData(organizacionId, refreshCortejos);
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
  const sinHorario = turnos.length - conHorario;

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
          {turnos.length > 0 && (
            <span className="horario-turnos__stats">
              · {conHorario} con hora · {sinHorario} sin hora
            </span>
          )}
        </p>
      )}

      {cargando ? (
        <Loader text="Cargando turnos…" />
      ) : !turnos.length ? (
        <p className="text-muted">No hay turnos en esta procesión.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table data-table--compact">
            <thead>
              <tr>
                <th>#</th>
                <th>Turno</th>
                <th>Tipo</th>
                <th>Fecha evento</th>
                <th>Hora estimada</th>
                <th>Fecha y hora</th>
              </tr>
            </thead>
            <tbody>
              {turnos.map((t) => (
                <tr key={t.id} className={!t.hora_estimada ? 'horario-turnos__sin-hora' : ''}>
                  <td>{t.numero_turno}</td>
                  <td>{t.etiqueta || t.tipo_turno}</td>
                  <td>{t.tipo_turno}</td>
                  <td>{formatFechaEvento(cortejo?.fecha)}</td>
                  <td>{formatHoraDisplay(t.hora_estimada)}</td>
                  <td>{combinarFechaHoraTurno(cortejo?.fecha, t.hora_estimada)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
