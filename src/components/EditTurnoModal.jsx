import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { normalizarHoraInput } from '../utils/turnoHorarioUtils';

function horaParaInput(hora) {
  const n = normalizarHoraInput(hora);
  if (!n) return '';
  return n.slice(0, 5);
}

export default function EditTurnoModal({ turno, guardando, onGuardar, onCerrar }) {
  const [etiqueta, setEtiqueta] = useState('');
  const [son, setSon] = useState('');
  const [alabado, setAlabado] = useState('');
  const [horaEstimada, setHoraEstimada] = useState('');

  useEffect(() => {
    if (!turno) return;
    setEtiqueta(turno.etiqueta || turno.tipo_turno || '');
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
    onGuardar({ etiqueta, son, alabado, hora_estimada: horaEstimada || null });
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
        className="modal-edit-turno"
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
        </p>

        <form className="config-form modal-edit-turno__form" onSubmit={handleSubmit}>
          <label>
            Nombre del turno
            <input
              type="text"
              value={etiqueta}
              onChange={(e) => setEtiqueta(e.target.value)}
              placeholder={`Ej. Ordinario ${turno.numero_turno}, Honor Salida…`}
              autoFocus
            />
          </label>

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
            <button type="submit" className="btn btn--primary" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
