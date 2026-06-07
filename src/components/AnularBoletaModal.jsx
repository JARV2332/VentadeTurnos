import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatQ } from '../utils/cajaReportUtils';
import { labelMetodoPago } from '../utils/pagoUtils';
import { codigoReciboDisplay } from '../utils/compraUtils';
import { etiquetaHonorTurno } from '../utils/turnoUtils';

export default function AnularBoletaModal({
  preview,
  buscando,
  anulando,
  onBuscar,
  onAnular,
  onEditDevoto,
  onCerrar,
  codigoInicial = '',
}) {
  const [codigo, setCodigo] = useState(codigoInicial);
  const [motivo, setMotivo] = useState('');

  useEffect(() => {
    setCodigo(codigoInicial || '');
    setMotivo('');
  }, [codigoInicial, preview]);

  useEffect(() => {
    const c = codigoInicial?.trim();
    if (c) onBuscar(c);
    // Solo al abrir el modal con código precargado
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const items = preview?.items?.length
    ? preview.items
    : preview?.brazo
      ? [{ brazo: preview.brazo, turno: preview.turno }]
      : [];

  const total = items.reduce((s, i) => s + Number(i.brazo?.precio_pagado || 0), 0);
  const codigoDisplay = codigoReciboDisplay(preview?.compra, preview?.brazos) || codigo;
  const entregados = items.filter((i) => i.brazo?.estado_entrega === 'entregado');

  const handleBuscar = (e) => {
    e.preventDefault();
    onBuscar(codigo);
  };

  const handleAnular = () => {
    if (!motivo.trim()) return;
    onAnular({ codigo: codigoDisplay || codigo, motivo: motivo.trim() });
  };

  return createPortal(
    <div
      className="modal-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !anulando) onCerrar();
      }}
    >
      <div
        className="modal-edit-turno modal-edit-turno--wide caja-anular-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="anular-boleta-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="anular-boleta-titulo" className="modal-edit-turno__titulo">
          Anular boleta y liberar turno
        </h2>
        <p className="text-muted config-hint">
          Busque por código <strong>VT-…</strong> o recibo <strong>VR-…</strong>. Los espacios
          vuelven a <em>disponible</em> en Taquilla. No se puede anular si ya se entregó el turno.
        </p>

        <form className="config-form caja-anular-modal__buscar" onSubmit={handleBuscar}>
          <label>
            Código de boleta o recibo
            <input
              type="text"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              placeholder="VT-XXXXXXXXXX o VR-XXXXXXXXXX"
              autoFocus
            />
          </label>
          <button type="submit" className="btn btn--ghost" disabled={buscando || !codigo.trim()}>
            {buscando ? 'Buscando…' : 'Buscar'}
          </button>
        </form>

        {preview?.error && <div className="alert alert--error">{preview.error}</div>}

        {preview && !preview.error && items.length > 0 && (
          <div className="caja-anular-modal__resumen">
            <p>
              <strong>{codigoDisplay}</strong>
              {preview.compra ? ' · recibo multi-turno' : ''}
            </p>
            <p className="text-muted caja-anular-modal__devoto">
              Devoto(a):{' '}
              <strong>{preview.cargador?.nombre_completo || '—'}</strong>
              {onEditDevoto && preview.cargador && (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={onEditDevoto}
                >
                  Editar datos
                </button>
              )}
              {' · '}
              {labelMetodoPago(preview.brazo?.metodo_pago || preview.compra?.metodo_pago)}
              {' · '}
              Total: <strong>{formatQ(total)}</strong>
            </p>

            <div className="table-wrap">
              <table className="data-table data-table--compact">
                <thead>
                  <tr>
                    <th>Turno</th>
                    <th>Brazo</th>
                    <th>Entrega</th>
                    <th>Ofrenda</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(({ brazo, turno }) => (
                    <tr key={brazo.id}>
                      <td>
                        #{brazo.numero_turno} · {etiquetaHonorTurno(turno)}
                      </td>
                      <td>
                        {brazo.numero_brazo} {brazo.lado}
                      </td>
                      <td>{brazo.estado_entrega === 'entregado' ? 'Entregado' : 'Pendiente'}</td>
                      <td>{formatQ(brazo.precio_pagado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {entregados.length > 0 ? (
              <div className="alert alert--error">
                No se puede anular: {entregados.length} espacio(s) ya fueron entregados.
              </div>
            ) : (
              <>
                <label>
                  Motivo de anulación (obligatorio)
                  <textarea
                    rows={2}
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Ej. error de cobro, devolución, venta duplicada…"
                  />
                </label>
                <div className="modal-edit-turno__actions">
                  <button type="button" className="btn btn--ghost" disabled={anulando} onClick={onCerrar}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn--danger"
                    disabled={anulando || !motivo.trim()}
                    onClick={handleAnular}
                  >
                    {anulando ? 'Anulando…' : 'Confirmar anulación'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
