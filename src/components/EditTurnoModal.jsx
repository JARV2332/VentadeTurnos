import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { normalizarHoraInput } from '../utils/turnoHorarioUtils';
import {
  tiposTurnoEditables,
  maxNumeroTurno,
  validarBrazosPares,
  brazosPorLado,
} from '../utils/turnoUtils';

function horaParaInput(hora) {
  const n = normalizarHoraInput(hora);
  if (!n) return '';
  return n.slice(0, 5);
}

export default function EditTurnoModal({
  turno,
  turnosExistentes = [],
  guardando,
  onGuardar,
  onCerrar,
}) {
  const [tipoTurno, setTipoTurno] = useState('Ordinario');
  const [etiqueta, setEtiqueta] = useState('');
  const [precio, setPrecio] = useState(0);
  const [totalBrazos, setTotalBrazos] = useState(20);
  const [son, setSon] = useState('');
  const [alabado, setAlabado] = useState('');
  const [horaEstimada, setHoraEstimada] = useState('');

  const maxNum = useMemo(
    () => maxNumeroTurno(turnosExistentes.length ? turnosExistentes : turno ? [turno] : []),
    [turnosExistentes, turno]
  );

  const tiposPermitidos = useMemo(
    () => (turno ? tiposTurnoEditables(turno.numero_turno, maxNum) : []),
    [turno, maxNum]
  );

  const tipoFijo = tiposPermitidos.length === 1;
  const parBrazos = validarBrazosPares(Number(totalBrazos) || 0);

  useEffect(() => {
    if (!turno) return;
    setTipoTurno(turno.tipo_turno || 'Ordinario');
    setEtiqueta(turno.etiqueta || turno.tipo_turno || '');
    setPrecio(Number(turno.precio) || 0);
    setTotalBrazos(Number(turno.total_brazos) || 20);
    setSon(turno.son || '');
    setAlabado(turno.alabado || '');
    setHoraEstimada(horaParaInput(turno.hora_estimada));
  }, [turno]);

  useEffect(() => {
    if (!turno) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [turno]);

  if (!turno || typeof document === 'undefined') return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!parBrazos) return;
    onGuardar({
      etiqueta,
      tipo_turno: tipoTurno,
      precio: Number(precio),
      total_brazos: Number(totalBrazos),
      son,
      alabado,
      hora_estimada: horaEstimada || null,
    });
  };

  return createPortal(
    <div
      className="modal-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !guardando) onCerrar();
      }}
    >
      <div
        className="modal-edit-turno modal-edit-turno--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-turno-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="edit-turno-titulo" className="modal-edit-turno__titulo">
          Editar turno #{turno.numero_turno}
        </h2>
        <p className="text-muted config-hint">
          Cambios visibles en Taquilla, boletas y reportes. El número de turno no se modifica.
          {tipoFijo && (
            <>
              {' '}
              El turno {turno.numero_turno === 1 ? '1 (salida)' : 'final (entrada)'} mantiene su
              tipo fijo.
            </>
          )}
        </p>

        <form className="config-form modal-edit-turno__form" onSubmit={handleSubmit}>
          <label>
            Tipo de turno
            {tipoFijo ? (
              <input type="text" value={tipoTurno} readOnly disabled />
            ) : (
              <select
                value={tipoTurno}
                onChange={(e) => setTipoTurno(e.target.value)}
              >
                {tiposPermitidos.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}
            {!tipoFijo && (
              <small className="text-muted">
                Ordinario o Extraordinario según el honor del turno en el cortejo.
              </small>
            )}
          </label>

          <label>
            Nombre del turno
            <input
              type="text"
              value={etiqueta}
              onChange={(e) => setEtiqueta(e.target.value)}
              placeholder={`Ej. Ordinario ${turno.numero_turno}, Extraordinario…`}
              autoFocus={tipoFijo}
            />
          </label>

          <div className="config-form__row">
            <label>
              Total de brazos (par)
              <input
                type="number"
                min={2}
                step={2}
                value={totalBrazos}
                onChange={(e) => setTotalBrazos(Number(e.target.value))}
                required
              />
              <small className={parBrazos ? 'hint-ok' : 'hint-error'}>
                {parBrazos
                  ? `${brazosPorLado(totalBrazos)} Izq. + ${brazosPorLado(totalBrazos)} Der.`
                  : 'Debe ser par (ej. 20)'}
              </small>
            </label>

            <label>
              Ofrenda (Q)
              <input
                type="number"
                min={0}
                step={1}
                value={precio}
                onChange={(e) => setPrecio(Number(e.target.value))}
                required
              />
            </label>
          </div>

          <label>
            Son
            <input
              type="text"
              value={son}
              onChange={(e) => setSon(e.target.value)}
              placeholder="Primera melodía del turno"
            />
          </label>

          <label>
            Alabado (opcional)
            <input
              type="text"
              value={alabado}
              onChange={(e) => setAlabado(e.target.value)}
              placeholder="Melodías adicionales, separadas con · si hay varias"
            />
          </label>

          <label>
            Hora estimada en procesión
            <input
              type="time"
              value={horaEstimada}
              onChange={(e) => setHoraEstimada(e.target.value)}
            />
            <small className="text-muted">Fecha del evento en la procesión; aquí solo la hora de paso.</small>
          </label>

          <div className="modal-edit-turno__actions">
            <button type="button" className="btn btn--ghost" disabled={guardando} onClick={onCerrar}>
              Cancelar
            </button>
            <button type="submit" className="btn btn--primary" disabled={guardando || !parBrazos}>
              {guardando ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
