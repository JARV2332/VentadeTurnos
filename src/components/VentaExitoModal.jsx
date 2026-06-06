import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { labelMetodoPago } from '../utils/pagoUtils';
import { construirEnlaceBoletaWhatsapp } from '../utils/whatsappUtils';
import { construirLineasRecibo, codigoReciboDisplay } from '../utils/compraUtils';
import { formatPrecio } from '../utils/boletaUtils';
import { TERMINO_DEVOTO_A } from '../constants/terminologia';

/**
 * Modal de venta completada (portal en body para no quedar detrás del panel móvil).
 */
export default function VentaExitoModal({ venta, organizacion, onCerrar }) {
  const items = venta?.items?.length
    ? venta.items
    : venta?.data
      ? [{ brazo: venta.data, turno: venta.turno }]
      : [];
  const { lineas, totalFmt } = construirLineasRecibo(items);
  const brazos = items.map((i) => i.brazo).filter(Boolean);
  const codigo = codigoReciboDisplay(venta?.compra, brazos) || venta?.codigo;

  let enlaceWhatsapp = null;
  if (venta) {
    try {
      enlaceWhatsapp = construirEnlaceBoletaWhatsapp({
        cargador: venta.cargador,
        whatsappFallback: venta.whatsappVenta,
        brazo: venta.data,
        turno: venta.turno,
        cortejo: venta.cortejo,
        organizacion,
        items,
        compra: venta.compra,
      });
    } catch (err) {
      console.error('VentaExitoModal WhatsApp:', err);
    }
  }

  useEffect(() => {
    if (!venta) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [venta]);

  if (!venta || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="venta-exito-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="venta-exito-titulo"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <div className="venta-exito-card">
        <h2 id="venta-exito-titulo" className="venta-exito-card__titulo">
          Venta completada
        </h2>
        <p className="venta-exito-card__codigo">
          Recibo <strong>{codigo}</strong>
          {' · '}
          {labelMetodoPago(venta.metodo_pago)}
        </p>
        {lineas.length > 0 && (
          <div className="venta-exito-card__tabla-wrap">
            <p className="venta-exito-card__sub">Turnos adquiridos</p>
            <table className="venta-carrito-tabla venta-carrito-tabla--compact">
              <thead>
                <tr>
                  <th>Cant.</th>
                  <th>Turno</th>
                  <th>Ofrenda</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l) => (
                  <tr key={`${l.numero_turno}-${l.etiqueta}`}>
                    <td>{l.cantidad}</td>
                    <td>
                      #{l.numero_turno} {l.etiqueta}
                    </td>
                    <td>{formatPrecio(l.ofrenda)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>Total ofrenda</td>
                  <td><strong>{totalFmt}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {venta.emailEnviando && (
          <p className="venta-exito-card__email">Enviando boleta por correo…</p>
        )}
        {venta.email?.ok && (
          <p className="venta-exito-card__email">
            Correo enviado a <strong>{venta.email.destinatario}</strong>
            {venta.email.demo && ' (demo)'}
          </p>
        )}
        {venta.email?.ok === false && venta.email?.error && (
          <p className="venta-exito-card__hint venta-exito-card__hint--warn">
            Correo: {venta.email.error}
          </p>
        )}
        {enlaceWhatsapp ? (
          <>
            <p className="venta-exito-card__hint">
              Abra WhatsApp {TERMINO_DEVOTO_A} con el resumen y enlace de la boleta.
            </p>
            <a
              href={enlaceWhatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--whatsapp btn--block"
            >
              Enviar boleta por WhatsApp
            </a>
          </>
        ) : (
          <p className="venta-exito-card__hint venta-exito-card__hint--warn">
            No se pudo armar WhatsApp: ingrese los 8 dígitos después de +502 en la venta.
          </p>
        )}
        <div className="venta-exito-card__links">
          <Link to="/impresion" className="btn btn--ghost btn--sm" onClick={onCerrar}>
            Imprimir boleta
          </Link>
          <Link to="/entrega" className="btn btn--ghost btn--sm" onClick={onCerrar}>
            Entrega
          </Link>
        </div>
        <button type="button" className="btn btn--primary btn--block venta-exito-card__cerrar" onClick={onCerrar}>
          Cerrar y seguir vendiendo
        </button>
      </div>
    </div>,
    document.body
  );
}
