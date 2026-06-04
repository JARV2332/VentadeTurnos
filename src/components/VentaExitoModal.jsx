import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { labelMetodoPago } from '../utils/pagoUtils';
import { construirEnlaceBoletaWhatsapp } from '../utils/whatsappUtils';

/**
 * Modal de venta completada (portal en body para no quedar detrás del panel móvil).
 */
export default function VentaExitoModal({ venta, organizacion, onCerrar }) {
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

  const codigo = venta.codigo || venta.data?.codigo_boleta_qr;

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
          Boleta <strong>{codigo}</strong>
          {' · '}
          {labelMetodoPago(venta.metodo_pago)}
        </p>
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
              Abra WhatsApp al cargador con el mensaje y el enlace de la boleta (QR en el link).
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
