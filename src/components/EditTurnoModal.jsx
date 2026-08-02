import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { normalizarHoraInput } from '../utils/turnoHorarioUtils';
import {
  tiposTurnoEditables,
  maxNumeroTurno,
  validarTotalBrazos,
  esMedioTurno,
  describirDistribucionBrazos,
  LADOS_BRAZO,
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
  const [numeroTurno, setNumeroTurno] = useState(1);
  const [tipoTurno, setTipoTurno] = useState('Ordinario');
  const [etiqueta, setEtiqueta] = useState('');
  const [precio, setPrecio] = useState(0);
  const [totalBrazos, setTotalBrazos] = useState(20);
  const [ladoUnico, setLadoUnico] = useState('Izquierda');
  const [son, setSon] = useState('');
  const [alabado, setAlabado] = useState('');
  const [horaEstimada, setHoraEstimada] = useState('');
  const [errorLocal, setErrorLocal] = useState('');

  const maxEfectivo = useMemo(() => {
    const otros = (turnosExistentes || []).filter((t) => t.id !== turno?.id);
    const maxOtros = maxNumeroTurno(otros.length ? otros : []);
    return Math.max(maxOtros, Number(numeroTurno) || 0);
  }, [turnosExistentes, turno?.id, numeroTurno]);

  const tiposPermitidos = useMemo(
    () => tiposTurnoEditables(numeroTurno, maxEfectivo),
    [numeroTurno, maxEfectivo]
  );

  const tipoFijo = tiposPermitidos.length === 1;
  const totalOk = validarTotalBrazos(Number(totalBrazos) || 0);
  const medio = esMedioTurno(Number(totalBrazos) || 0);

  const numeroOcupado = useMemo(() => {
    const n = Number(numeroTurno);
    if (!n || !turno) return false;
    return (turnosExistentes || []).some(
      (t) => t.id !== turno.id && Number(t.numero_turno) === n
    );
  }, [numeroTurno, turnosExistentes, turno]);

  useEffect(() => {
    if (!turno) return;
    setNumeroTurno(Number(turno.numero_turno) || 1);
    setTipoTurno(turno.tipo_turno || 'Ordinario');
    setEtiqueta(turno.etiqueta || turno.tipo_turno || '');
    setPrecio(Number(turno.precio) || 0);
    setTotalBrazos(Number(turno.total_brazos) || 20);
    setSon(turno.son || '');
    setAlabado(turno.alabado || '');
    setHoraEstimada(horaParaInput(turno.hora_estimada));
    setErrorLocal('');
  }, [turno]);

  useEffect(() => {
    if (!tiposPermitidos.includes(tipoTurno)) {
      setTipoTurno(tiposPermitidos[0] || 'Ordinario');
    }
  }, [tiposPermitidos, tipoTurno]);

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
    setErrorLocal('');
    if (!totalOk) return;
    const n = Number(numeroTurno);
    if (!Number.isInteger(n) || n < 1) {
      setErrorLocal('El número de turno debe ser un entero mayor o igual a 1.');
      return;
    }
    if (numeroOcupado) {
      setErrorLocal(`Ya existe otro turno #${n} en esta procesión.`);
      return;
    }
    onGuardar({
      numero_turno: n,
      etiqueta,
      tipo_turno: tipoTurno,
      precio: Number(precio),
      total_brazos: Number(totalBrazos),
      lado_unico: medio ? ladoUnico : null,
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
          Editar turno #{numeroTurno || turno.numero_turno}
        </h2>
        <p className="text-muted config-hint">
          Cambios visibles en Taquilla, boletas y reportes.
          {tipoFijo && (
            <>
              {' '}
              El número {Number(numeroTurno) === 1 ? '1 (salida)' : 'final (entrada)'} fija el tipo
              del turno.
            </>
          )}
        </p>

        <form className="config-form modal-edit-turno__form" onSubmit={handleSubmit}>
          <label>
            Número de turno
            <input
              type="number"
              min={1}
              step={1}
              value={numeroTurno}
              onChange={(e) => setNumeroTurno(Number(e.target.value))}
              required
              autoFocus
            />
            <small className={numeroOcupado ? 'hint-error' : 'text-muted'}>
              {numeroOcupado
                ? `El #${numeroTurno} ya está ocupado por otro turno.`
                : 'Debe ser único dentro de la misma procesión.'}
            </small>
          </label>

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
              placeholder={`Ej. Ordinario ${numeroTurno || ''}, Extraordinario…`}
            />
          </label>

          <div className="config-form__row">
            <label>
              Total de brazos
              <input
                type="number"
                min={1}
                step={1}
                value={totalBrazos}
                onChange={(e) => setTotalBrazos(Number(e.target.value))}
                required
              />
              <small className={totalOk ? 'hint-ok' : 'hint-error'}>
                {totalOk
                  ? describirDistribucionBrazos(totalBrazos, medio ? ladoUnico : null)
                  : 'Entero mayor que 0 (par = ambos lados, impar = un lado)'}
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

          {medio && (
            <label>
              Lado del medio turno
              <select value={ladoUnico} onChange={(e) => setLadoUnico(e.target.value)}>
                {LADOS_BRAZO.map((lado) => (
                  <option key={lado} value={lado}>
                    Solo {lado}
                  </option>
                ))}
              </select>
            </label>
          )}

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

          {errorLocal && <div className="alert alert--error">{errorLocal}</div>}

          <div className="modal-edit-turno__actions">
            <button type="button" className="btn btn--ghost" disabled={guardando} onClick={onCerrar}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={guardando || !totalOk || numeroOcupado}
            >
              {guardando ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
