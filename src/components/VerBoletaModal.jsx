import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import BoletaContraseñaTurno from './BoletaContraseñaTurno';

export default function VerBoletaModal({ abierto, boleta, organizacion, onCerrar, titulo = 'Boleta' }) {
  useEffect(() => {
    if (!abierto || typeof document === 'undefined') return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [abierto]);

  if (!abierto || !boleta || boleta.error) return null;

  const items =
    boleta.items?.length > 0
      ? boleta.items
      : boleta.brazo
        ? [{ brazo: boleta.brazo, turno: boleta.turno }]
        : [];

  if (!items.length) return null;

  const handleImprimir = () => {
    document.body.classList.add('consulta-devoto--imprimiendo');
    const cleanup = () => document.body.classList.remove('consulta-devoto--imprimiendo');
    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
    setTimeout(cleanup, 1000);
  };

  return createPortal(
    <div
      className="modal-overlay consulta-devoto__overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <div
        className="consulta-devoto__modal-boleta"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ver-boleta-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="consulta-devoto__modal-boleta-header no-print">
          <h2 id="ver-boleta-titulo">{titulo}</h2>
          <div className="consulta-devoto__modal-boleta-acciones">
            <button type="button" className="btn btn--primary btn--sm" onClick={handleImprimir}>
              Imprimir
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={onCerrar}>
              Cerrar
            </button>
          </div>
        </div>
        <div className="consulta-devoto__modal-boleta-body print-area">
          <BoletaContraseñaTurno
            organizacion={organizacion}
            cortejo={boleta.cortejo}
            cargador={boleta.cargador}
            items={items}
            compra={boleta.compra}
          />
          <p className="text-muted impresion-print-tip no-print consulta-devoto__print-tip">
            Al imprimir: desactive <strong>Encabezados y pies de página</strong>, active{' '}
            <strong>Gráficos en segundo plano</strong> y elija <strong>Guardar como PDF</strong>.
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
