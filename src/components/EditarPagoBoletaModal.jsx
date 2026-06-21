import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatQ } from '../utils/cajaReportUtils';
import {
  METODOS_PAGO,
  labelMetodoPago,
  metodoRequiereComprobante,
  leerImagenComoDataUrl,
} from '../utils/pagoUtils';
import { codigoReciboDisplay } from '../utils/compraUtils';
import { etiquetaHonorTurno } from '../utils/turnoUtils';

export default function EditarPagoBoletaModal({
  preview,
  buscando,
  guardando,
  onBuscar,
  onGuardar,
  onCerrar,
  codigoInicial = '',
}) {
  const [codigo, setCodigo] = useState(codigoInicial);
  const [pago, setPago] = useState({
    metodo_pago: 'efectivo',
    comprobante_url: null,
    comprobante_nombre: '',
  });
  const [errorLocal, setErrorLocal] = useState('');

  useEffect(() => {
    setCodigo(codigoInicial || '');
    setErrorLocal('');
  }, [codigoInicial, preview]);

  useEffect(() => {
    const c = codigoInicial?.trim();
    if (c) onBuscar(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!preview || preview.error) return;
    const metodo = preview.compra?.metodo_pago || preview.brazo?.metodo_pago || 'efectivo';
    const comprobante =
      preview.compra?.comprobante_url || preview.brazo?.comprobante_url || null;
    setPago({
      metodo_pago: metodo,
      comprobante_url: comprobante,
      comprobante_nombre: comprobante ? 'Comprobante actual' : '',
    });
  }, [preview]);

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
  const necesitaComprobante = metodoRequiereComprobante(pago.metodo_pago);

  const handleBuscar = (e) => {
    e.preventDefault();
    setErrorLocal('');
    onBuscar(codigo);
  };

  const handleComprobanteChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorLocal('');
    try {
      const dataUrl = await leerImagenComoDataUrl(file);
      setPago((prev) => ({
        ...prev,
        comprobante_url: dataUrl,
        comprobante_nombre: file.name,
      }));
    } catch (err) {
      setErrorLocal(err.message);
    }
  };

  const handleGuardar = () => {
    setErrorLocal('');
    if (necesitaComprobante && !pago.comprobante_url) {
      setErrorLocal('Suba la foto del comprobante de transferencia o voucher de pago.');
      return;
    }
    onGuardar({
      codigo: codigoDisplay || codigo,
      metodo_pago: pago.metodo_pago,
      comprobante_url: necesitaComprobante ? pago.comprobante_url : null,
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
        className="modal-edit-turno modal-edit-turno--wide caja-anular-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="editar-pago-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="editar-pago-titulo" className="modal-edit-turno__titulo">
          Editar pago de boleta
        </h2>
        <p className="text-muted config-hint">
          Busque por código <strong>VT-…</strong> o recibo <strong>VR-…</strong>. Puede corregir
          efectivo, transferencia o tarjeta. Transferencia y tarjeta requieren comprobante.
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

        {(preview?.error || errorLocal) && (
          <div className="alert alert--error">{preview?.error || errorLocal}</div>
        )}

        {preview && !preview.error && items.length > 0 && (
          <div className="caja-anular-modal__resumen">
            <p>
              <strong>{codigoDisplay}</strong>
              {preview.compra ? ' · recibo multi-turno' : ''}
            </p>
            <p className="text-muted caja-anular-modal__devoto">
              Devoto(a): <strong>{preview.cargador?.nombre_completo || '—'}</strong>
              {' · '}
              Pago actual:{' '}
              <strong>
                {labelMetodoPago(preview.brazo?.metodo_pago || preview.compra?.metodo_pago)}
              </strong>
              {' · '}
              Total: <strong>{formatQ(total)}</strong>
            </p>

            <div className="table-wrap">
              <table className="data-table data-table--compact">
                <thead>
                  <tr>
                    <th>Turno</th>
                    <th>Brazo</th>
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
                      <td>{formatQ(brazo.precio_pagado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <label className="caja-editar-pago__metodo-label">Nuevo método de pago</label>
            <div className="metodos-pago caja-editar-pago__metodos">
              {METODOS_PAGO.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`metodo-pago-btn ${pago.metodo_pago === m.id ? 'metodo-pago-btn--active' : ''}`}
                  disabled={guardando}
                  onClick={() =>
                    setPago({
                      metodo_pago: m.id,
                      comprobante_url: m.id === pago.metodo_pago ? pago.comprobante_url : null,
                      comprobante_nombre: m.id === pago.metodo_pago ? pago.comprobante_nombre : '',
                    })
                  }
                >
                  <span className="metodo-pago-btn__icon">{m.icon}</span>
                  <span>{m.label}</span>
                </button>
              ))}
            </div>

            {necesitaComprobante && (
              <div className="comprobante-upload">
                <label className="comprobante-upload__label">
                  Foto del comprobante (transferencia / voucher)
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleComprobanteChange}
                    disabled={guardando}
                  />
                </label>
                {pago.comprobante_url ? (
                  <div className="comprobante-preview">
                    <img src={pago.comprobante_url} alt="Comprobante de pago" />
                    <span>{pago.comprobante_nombre}</span>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      disabled={guardando}
                      onClick={() =>
                        setPago((prev) => ({
                          ...prev,
                          comprobante_url: null,
                          comprobante_nombre: '',
                        }))
                      }
                    >
                      Cambiar foto
                    </button>
                  </div>
                ) : (
                  <p className="text-muted config-hint">
                    Suba la captura o foto del comprobante bancario.
                  </p>
                )}
              </div>
            )}

            <div className="modal-edit-turno__actions">
              <button type="button" className="btn btn--ghost" disabled={guardando} onClick={onCerrar}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={guardando}
                onClick={handleGuardar}
              >
                {guardando ? 'Guardando…' : 'Guardar cambio de pago'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
