import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

export default function SeleccionarTurnosPendientesModal({
  opciones = [],
  seleccionInicial = [],
  onAplicar,
  onCerrar,
}) {
  const [seleccion, setSeleccion] = useState(() => new Set(seleccionInicial));

  useEffect(() => {
    setSeleccion(new Set(seleccionInicial));
  }, [seleccionInicial]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const todosIds = useMemo(() => opciones.map((o) => o.turnoId), [opciones]);
  const todosMarcados = todosIds.length > 0 && todosIds.every((id) => seleccion.has(id));

  const toggle = (id) => {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleTodos = () => {
    setSeleccion(todosMarcados ? new Set() : new Set(todosIds));
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="modal-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <div
        className="modal-edit-turno modal-edit-turno--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sel-turnos-pend-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="sel-turnos-pend-titulo" className="modal-edit-turno__titulo">
          Elegir turnos a revisar
        </h2>
        <p className="text-muted config-hint">
          Marque los turnos con pendientes de entrega que quiere ver en el reporte.
        </p>

        <div className="listado-turnos__acciones" style={{ marginBottom: '0.75rem' }}>
          <button type="button" className="btn btn--ghost btn--sm" onClick={toggleTodos}>
            {todosMarcados ? 'Quitar todos' : 'Marcar todos'}
          </button>
          <span className="text-muted">{seleccion.size} seleccionado(s)</span>
        </div>

        <div className="table-wrap" style={{ maxHeight: '22rem', overflow: 'auto' }}>
          <table className="data-table data-table--compact">
            <thead>
              <tr>
                <th></th>
                <th>Tipo</th>
                <th>Turno</th>
                <th>Honor</th>
                <th>Pendientes</th>
              </tr>
            </thead>
            <tbody>
              {opciones.map((op) => (
                <tr key={op.turnoId}>
                  <td>
                    <input
                      type="checkbox"
                      checked={seleccion.has(op.turnoId)}
                      onChange={() => toggle(op.turnoId)}
                    />
                  </td>
                  <td>{op.tipoTurno}</td>
                  <td>#{op.numeroTurno}</td>
                  <td>{op.honor}</td>
                  <td>
                    <strong>{op.pendientes}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="modal-edit-turno__actions">
          <button type="button" className="btn btn--ghost" onClick={onCerrar}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => onAplicar([...seleccion])}
          >
            Aplicar selección
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
