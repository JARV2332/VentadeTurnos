import React, { useEffect, useState } from 'react';
import StatusBadge from './StatusBadge';

/**
 * Selector de estado de entrega (pendiente ↔ entregado) con confirmación al revertir.
 */
export default function EntregaEstadoMenu({
  brazo,
  cantidadARevertir = 1,
  totalRecibo = 1,
  esReciboMulti = false,
  onRevertirPendiente,
  loading,
  disabled,
}) {
  const entregado = brazo?.estado_entrega === 'entregado';
  const [valor, setValor] = useState(entregado ? 'entregado' : 'pendiente');
  const [confirmar, setConfirmar] = useState(false);

  const n = Math.max(1, cantidadARevertir || 1);
  const esVarios = esReciboMulti && n > 1;
  const confirmarTexto = esVarios
    ? `¿Marcar los ${n} turnos entregados de este recibo (${totalRecibo} en total) como pendientes de entrega?`
    : '¿Marcar este turno como pendiente de entrega?';
  const botonTexto = esVarios
    ? `Sí, volver ${n} turnos a pendiente`
    : 'Sí, volver a pendiente';

  useEffect(() => {
    setValor(brazo?.estado_entrega === 'entregado' ? 'entregado' : 'pendiente');
    setConfirmar(false);
  }, [brazo?.id, brazo?.estado_entrega]);

  const handleSelect = (e) => {
    const next = e.target.value;
    if (next === 'pendiente' && entregado) {
      setValor('pendiente');
      setConfirmar(true);
      return;
    }
    setValor(next);
    setConfirmar(false);
  };

  const cancelar = () => {
    setValor('entregado');
    setConfirmar(false);
  };

  return (
    <div className="entrega-estado-menu">
      <div className="entrega-estado-menu__header">
        <span className="entrega-estado-menu__label">Estado de entrega</span>
        <StatusBadge status={entregado ? 'entregado' : 'pendiente_entrega'} />
      </div>

      <label className="entrega-estado-menu__select-wrap">
        <span className="sr-only">Cambiar estado de entrega</span>
        <select
          className="entrega-estado-menu__select"
          value={valor}
          onChange={handleSelect}
          disabled={disabled || loading || !entregado}
        >
          <option value="pendiente">Pendiente de entrega</option>
          <option value="entregado">Entregado</option>
        </select>
      </label>

      {!entregado && (
        <p className="entrega-estado-menu__hint text-muted">
          Este turno ya está pendiente. Confirme la entrega en la pantalla Entrega turnos.
        </p>
      )}

      {confirmar && (
        <div className="entrega-estado-menu__confirm">
          <p>
            {confirmarTexto} Use esto solo si la entrega fue registrada por error.
          </p>
          <div className="entrega-estado-menu__confirm-actions">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={cancelar}
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn--warning btn--sm"
              onClick={onRevertirPendiente}
              disabled={loading || disabled}
            >
              {loading ? 'Guardando…' : botonTexto}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
