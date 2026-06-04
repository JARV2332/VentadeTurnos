import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import StatusBadge from './StatusBadge';
import { useAuth } from '../context/AuthContext';
import { getReciboConfig } from '../services/dataService';
import { getQrPayload, formatPrecio } from '../utils/boletaUtils';
import { mergeReciboConfig } from '../constants/reciboDefaults';

/**
 * Boleta / recibo imprimible con diseño configurable por organización.
 * Código QR único por venta (codigo_boleta_qr).
 */
export default function BoletaRecibo({
  organizacion,
  cortejo,
  turno,
  cargador,
  brazo,
  config: configProp,
  compact = false,
  showEntrega = false,
  className = '',
}) {
  const { organizacionId } = useAuth();
  const [configGuardada, setConfigGuardada] = useState(null);

  useEffect(() => {
    if (configProp != null || !organizacionId) return;
    let cancel = false;
    (async () => {
      const saved = await getReciboConfig(organizacionId);
      if (!cancel && saved && !saved.error) setConfigGuardada(saved);
    })();
    return () => {
      cancel = true;
    };
  }, [organizacionId, configProp]);

  const cfg = mergeReciboConfig(configProp ?? configGuardada);
  const codigo = brazo?.codigo_boleta_qr;
  const precio = formatPrecio(brazo?.precio_pagado ?? turno?.precio);
  const titulo =
    cfg.titulo_personalizado?.trim() ||
    (cfg.mostrar_nombre_org !== false ? organizacion?.nombre_oficial : '') ||
    'Boleta de turno';

  const formatoClass = `boleta-recibo--${cfg.formato}`;
  const fontClass = `boleta-recibo--fuente-${cfg.tamano_fuente || 'normal'}`;
  const alignClass = `boleta-recibo--logo-${cfg.logo_alineacion || 'centro'}`;

  const esMediaCarta = cfg.formato === 'media_carta';
  const qrSize = esMediaCarta ? (compact ? 96 : 120) : compact ? 72 : 96;

  const logoBlock = cfg.logo_url ? (
    <div className="boleta-recibo__logo-wrap">
      <img
        src={cfg.logo_url}
        alt="Logo"
        className="boleta-recibo__logo"
        style={{ maxWidth: cfg.logo_ancho_px || 120 }}
      />
    </div>
  ) : null;

  const headBlock = (
    <header className="boleta-recibo__head">
      <strong className="boleta-recibo__titulo">{titulo}</strong>
      {cfg.mostrar_evento !== false && cortejo?.nombre_evento && (
        <span className="boleta-recibo__evento">{cortejo.nombre_evento}</span>
      )}
    </header>
  );

  const turnoBlock =
    cfg.mostrar_turno !== false ? (
      <div className="boleta-recibo__turno">
        <small>Turno</small>
        <strong>#{brazo?.numero_turno}</strong>
        {cfg.mostrar_etiqueta_turno !== false && (
          <span className="boleta-recibo__tipo">{turno?.etiqueta || turno?.tipo_turno}</span>
        )}
      </div>
    ) : null;

  const cargadorBlock =
    cfg.mostrar_cargador !== false ? (
      <div className="boleta-recibo__cargador">
        <small>Cargador</small>
        <strong>{cargador?.nombre_completo || '—'}</strong>
      </div>
    ) : null;

  const qrBlock =
    codigo ? (
      <div className="boleta-recibo__qr">
        <QRCodeSVG
          value={getQrPayload(codigo)}
          size={qrSize}
          level="M"
          includeMargin
          bgColor="#ffffff"
          fgColor="#1e293b"
        />
        {cfg.mostrar_codigo_texto !== false && <code className="boleta-recibo__codigo">{codigo}</code>}
        {cfg.mensaje_qr && <small className="boleta-recibo__qr-msg">{cfg.mensaje_qr}</small>}
      </div>
    ) : null;

  const footerBlock = (
    <footer className="boleta-recibo__footer">
      {cfg.mostrar_precio !== false && <span className="boleta-recibo__precio">{precio}</span>}
      {showEntrega && brazo?.estado_entrega && (
        <StatusBadge
          status={brazo.estado_entrega === 'entregado' ? 'entregado' : 'pendiente_entrega'}
        />
      )}
    </footer>
  );

  return (
    <article
      className={`boleta-recibo ${formatoClass} ${fontClass} ${alignClass} ${className}`.trim()}
      style={{ '--recibo-primary': cfg.color_primario || '#6366f1' }}
      data-formato={cfg.formato}
    >
      {esMediaCarta ? (
        <>
          <div className="boleta-recibo__horizontal">
            <div className="boleta-recibo__horizontal-datos">
              {logoBlock}
              {headBlock}
              {turnoBlock}
              {cargadorBlock}
              {footerBlock}
            </div>
            {qrBlock}
          </div>
          {cfg.pie_texto?.trim() && <p className="boleta-recibo__pie">{cfg.pie_texto.trim()}</p>}
        </>
      ) : (
        <>
          {logoBlock}
          {headBlock}
          {turnoBlock}
          {cargadorBlock}
          {qrBlock}
          {footerBlock}
          {cfg.pie_texto?.trim() && <p className="boleta-recibo__pie">{cfg.pie_texto.trim()}</p>}
        </>
      )}
    </article>
  );
}
