import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import StatusBadge from '../StatusBadge';
import { getQrPayload, formatPrecio } from '../../utils/boletaUtils';

/**
 * Contenido de un bloque del recibo (editor e impresión).
 */
export default function ReciboBlockContent({
  elementId,
  cfg,
  titulo,
  organizacion,
  cortejo,
  turno,
  cargador,
  brazo,
  codigo,
  precio,
  showEntrega,
  boxW,
  boxH,
}) {
  switch (elementId) {
    case 'logo':
      if (!cfg.logo_url) {
        return <span className="recibo-block__placeholder">Logo</span>;
      }
      return (
        <img
          src={cfg.logo_url}
          alt=""
          className="recibo-block__logo-img"
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
        />
      );

    case 'titulo':
      return <strong className="recibo-block__titulo">{titulo}</strong>;

    case 'evento':
      if (cfg.mostrar_evento === false || !cortejo?.nombre_evento) return null;
      return <span className="recibo-block__evento">{cortejo.nombre_evento}</span>;

    case 'turno':
      if (cfg.mostrar_turno === false) return null;
      return (
        <div className="recibo-block__turno">
          <small>Turno</small>
          <strong>#{brazo?.numero_turno}</strong>
          {cfg.mostrar_etiqueta_turno !== false && (
            <span>{turno?.etiqueta || turno?.tipo_turno}</span>
          )}
        </div>
      );

    case 'cargador':
      if (cfg.mostrar_cargador === false) return null;
      return (
        <div className="recibo-block__cargador">
          <small>Devoto(a)</small>
          <strong>{cargador?.nombre_completo || '—'}</strong>
        </div>
      );

    case 'qr':
      if (!codigo) return <span className="recibo-block__placeholder">QR</span>;
      const qrPx = Math.max(48, Math.min(boxW, boxH) * 0.72 - 8);
      return (
        <div className="recibo-block__qr-inner">
          <QRCodeSVG
            value={getQrPayload(codigo)}
            size={Math.round(qrPx)}
            level="M"
            includeMargin={false}
            bgColor="#ffffff"
            fgColor="#1e293b"
          />
          {cfg.mostrar_codigo_texto !== false && (
            <code className="recibo-block__codigo">{codigo}</code>
          )}
          {cfg.mensaje_qr && <small className="recibo-block__qr-msg">{cfg.mensaje_qr}</small>}
        </div>
      );

    case 'precio':
      if (cfg.mostrar_precio === false) return null;
      return (
        <div className="recibo-block__precio-wrap">
          <small className="recibo-block__precio-label">Ofrenda</small>
          <span className="recibo-block__precio">{formatPrecio(brazo?.precio_pagado ?? turno?.precio)}</span>
          {showEntrega && brazo?.estado_entrega && (
            <StatusBadge
              status={brazo.estado_entrega === 'entregado' ? 'entregado' : 'pendiente_entrega'}
            />
          )}
        </div>
      );

    case 'pie':
      if (!cfg.pie_texto?.trim()) return <span className="recibo-block__placeholder recibo-block__placeholder--muted">Pie (opcional)</span>;
      return <p className="recibo-block__pie">{cfg.pie_texto.trim()}</p>;

    default:
      return null;
  }
}

export function elementoVisible(elementId, cfg) {
  switch (elementId) {
    case 'logo':
      return Boolean(cfg.logo_url);
    case 'titulo':
      return true;
    case 'evento':
      return cfg.mostrar_evento !== false;
    case 'turno':
      return cfg.mostrar_turno !== false;
    case 'cargador':
      return cfg.mostrar_cargador !== false;
    case 'qr':
      return true;
    case 'precio':
      return cfg.mostrar_precio !== false;
    case 'pie':
      return Boolean(cfg.pie_texto?.trim());
    default:
      return false;
  }
}
