import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import StatusBadge from './StatusBadge';
import { getQrPayload, formatPrecio } from '../utils/boletaUtils';

/**
 * Boleta simplificada: organización, procesión, turno, cargador, QR y precio.
 * Sin brazo ni lado (solo para uso interno en taquilla).
 */
export default function BoletaCard({
  organizacion,
  cortejo,
  turno,
  cargador,
  brazo,
  compact = false,
  showEntrega = false,
}) {
  const codigo = brazo?.codigo_boleta_qr;
  const precio = formatPrecio(brazo?.precio_pagado || turno?.precio);

  return (
    <div className={`boleta-card ${compact ? 'boleta-card--compact' : ''}`}>
      <header className="boleta-card__head">
        <strong>{organizacion?.nombre_oficial}</strong>
        <span>{cortejo?.nombre_evento}</span>
      </header>

      <div className="boleta-card__turno">
        <small>Turno</small>
        <strong>#{brazo?.numero_turno}</strong>
        <span className="boleta-card__tipo">{turno?.etiqueta || turno?.tipo_turno}</span>
      </div>

      <div className="boleta-card__cargador">
        <small>Cargador</small>
        <strong>{cargador?.nombre_completo || '—'}</strong>
      </div>

      {codigo && (
        <div className="boleta-card__qr">
          <QRCodeSVG
            value={getQrPayload(codigo)}
            size={compact ? 88 : 112}
            level="M"
            includeMargin
            bgColor="#ffffff"
            fgColor="#1e293b"
          />
          <code>{codigo}</code>
          <small>Presente este QR para retirar su turno</small>
        </div>
      )}

      <footer className="boleta-card__footer">
        <span>{precio}</span>
        {showEntrega && brazo?.estado_entrega && (
          <StatusBadge
            status={brazo.estado_entrega === 'entregado' ? 'entregado' : 'pendiente_entrega'}
          />
        )}
      </footer>
    </div>
  );
}
