import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  TIPOS_TURNO,
  huecosNumerosTurno,
  proximoNumeroTurno,
  sugerirDefaultsNuevoTurno,
  validarBrazosPares,
  brazosPorLado,
} from '../utils/turnoUtils';

export default function AgregarTurnoModal({
  turnosExistentes,
  guardando,
  onGuardar,
  onCerrar,
}) {
  const huecos = useMemo(() => huecosNumerosTurno(turnosExistentes), [turnosExistentes]);
  const siguiente = useMemo(() => proximoNumeroTurno(turnosExistentes), [turnosExistentes]);
  const numeroInicial = huecos[0] ?? siguiente;

  const [numeroTurno, setNumeroTurno] = useState(String(numeroInicial));
  const [tipoTurno, setTipoTurno] = useState('Ordinario');
  const [etiqueta, setEtiqueta] = useState('');
  const [totalBrazos, setTotalBrazos] = useState(20);
  const [precio, setPrecio] = useState(150);
  const [son, setSon] = useState('');
  const [alabado, setAlabado] = useState('');

  useEffect(() => {
    const n = Number(numeroTurno);
    if (!Number.isInteger(n) || n < 1) return;
    const defs = sugerirDefaultsNuevoTurno(turnosExistentes, n);
    setTipoTurno(defs.tipo_turno);
    setEtiqueta(defs.etiqueta);
    setTotalBrazos(defs.total_brazos);
    setPrecio(defs.precio);
  }, [numeroTurno, turnosExistentes]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const parBrazos = validarBrazosPares(Number(totalBrazos) || 0);
  const numsOcupados = useMemo(
    () => new Set((turnosExistentes || []).map((t) => t.numero_turno)),
    [turnosExistentes]
  );
  const numero = Number(numeroTurno);
  const numeroDuplicado = Number.isInteger(numero) && numsOcupados.has(numero);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (numeroDuplicado || !parBrazos) return;
    onGuardar({
      numero_turno: numero,
      tipo_turno: tipoTurno,
      etiqueta,
      total_brazos: Number(totalBrazos),
      precio: Number(precio),
      son,
      alabado,
    });
  };

  if (typeof document === 'undefined') return null;

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
        aria-labelledby="add-turno-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="add-turno-titulo" className="modal-edit-turno__titulo">
          Agregar turno a la procesión
        </h2>
        <p className="text-muted config-hint">
          Use un número libre para rellenar un hueco (ej. falta el turno 7) o el siguiente al final.
          Se crearán los brazos vacíos listos para vender.
        </p>

        {huecos.length > 0 && (
          <p className="modal-edit-turno__huecos">
            Huecos disponibles:{' '}
            {huecos.map((n) => (
              <button
                key={n}
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setNumeroTurno(String(n))}
              >
                #{n}
              </button>
            ))}
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setNumeroTurno(String(siguiente))}
            >
              #{siguiente} (final)
            </button>
          </p>
        )}

        <form className="config-form modal-edit-turno__form" onSubmit={handleSubmit}>
          <label>
            Número de turno
            <input
              type="number"
              min={1}
              step={1}
              value={numeroTurno}
              onChange={(e) => setNumeroTurno(e.target.value)}
              required
              autoFocus
            />
            {numeroDuplicado && (
              <small className="hint-error">Ese número ya existe en esta procesión.</small>
            )}
          </label>

          <label>
            Tipo de turno
            <select value={tipoTurno} onChange={(e) => setTipoTurno(e.target.value)}>
              {TIPOS_TURNO.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label>
            Nombre del turno
            <input
              type="text"
              value={etiqueta}
              onChange={(e) => setEtiqueta(e.target.value)}
              placeholder="Ej. Ordinario 5, Honor Salida…"
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
              placeholder="Melodías adicionales"
            />
          </label>

          <div className="modal-edit-turno__actions">
            <button type="button" className="btn btn--ghost" disabled={guardando} onClick={onCerrar}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={guardando || numeroDuplicado || !parBrazos}
            >
              {guardando ? 'Creando…' : 'Agregar turno'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
