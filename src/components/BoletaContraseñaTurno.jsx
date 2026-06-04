import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../context/AuthContext';
import { getReciboConfig } from '../services/dataService';
import { mergeReciboConfig } from '../constants/reciboDefaults';
import { getQrPayload, formatPrecio } from '../utils/boletaUtils';
import { formatCuiDisplay } from '../utils/cuiUtils';
import { localDigitsFromGtPhone } from '../utils/phoneGtUtils';

/**
 * Boleta / contraseña de turno con diseño formal (bordes, secciones) para impresión y PDF.
 */
export default function BoletaContraseñaTurno({
  organizacion,
  cortejo,
  turno,
  cargador,
  brazo,
  config: configProp,
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
  const precioValor = formatPrecio(brazo?.precio_pagado ?? turno?.precio);
  const titulo =
    cfg.titulo_personalizado?.trim() ||
    (cfg.mostrar_nombre_org !== false ? organizacion?.nombre_oficial : '') ||
    'Contraseña de turno';
  const primary = cfg.color_primario || '#4f46e5';
  const cui = cargador?.cui_o_identificacion
    ? formatCuiDisplay(cargador.cui_o_identificacion)
    : '—';
  const whatsapp = cargador?.whatsapp
    ? `+502 ${localDigitsFromGtPhone(cargador.whatsapp)}`
    : '—';

  return (
    <article
      className="boleta-contraseña"
      style={{ '--boleta-primary': primary }}
    >
      <header className="boleta-contraseña__head">
        <div className="boleta-contraseña__head-izq">
          {cfg.logo_url && (
            <img
              src={cfg.logo_url}
              alt=""
              className="boleta-contraseña__logo"
              style={{ maxWidth: cfg.logo_ancho_px || 88 }}
            />
          )}
          {cfg.mostrar_nombre_org !== false && (
            <p className="boleta-contraseña__org">{organizacion?.nombre_oficial}</p>
          )}
        </div>
        <div className="boleta-contraseña__head-der">
          <h1 className="boleta-contraseña__titulo">{titulo}</h1>
          {cfg.mostrar_evento !== false && cortejo?.nombre_evento && (
            <p className="boleta-contraseña__evento">{cortejo.nombre_evento}</p>
          )}
        </div>
      </header>

      <section className="boleta-contraseña__seccion">
        <h2 className="boleta-contraseña__seccion-titulo">Datos del devoto(a)</h2>
        <div className="boleta-contraseña__caja">
          <div className="boleta-contraseña__cui-box">
            <span className="boleta-contraseña__label">CUI / DPI</span>
            <strong className="boleta-contraseña__cui-valor">{cui}</strong>
          </div>
          <div className="boleta-contraseña__datos-grid">
            {cfg.mostrar_cargador !== false && (
              <p>
                <span>Nombre</span>
                <strong>{cargador?.nombre_completo || '—'}</strong>
              </p>
            )}
            <p>
              <span>Correo</span>
              <strong>{cargador?.correo?.trim() || '—'}</strong>
            </p>
            <p>
              <span>WhatsApp</span>
              <strong>{whatsapp}</strong>
            </p>
          </div>
        </div>
      </section>

      <section className="boleta-contraseña__seccion">
        <h2 className="boleta-contraseña__seccion-titulo">Datos del turno</h2>
        <div className="boleta-contraseña__caja boleta-contraseña__caja--turno">
          <div className="boleta-contraseña__turno-datos">
            {cfg.mostrar_turno !== false && (
              <>
                <p>
                  <span>Turno</span>
                  <strong>#{brazo?.numero_turno}</strong>
                </p>
                {cfg.mostrar_etiqueta_turno !== false && (
                  <p>
                    <span>Tipo</span>
                    <strong>{turno?.etiqueta || turno?.tipo_turno || '—'}</strong>
                  </p>
                )}
                <p>
                  <span>Brazo</span>
                  <strong>
                    {brazo?.numero_brazo} · {brazo?.lado || '—'}
                  </strong>
                </p>
              </>
            )}
            {cfg.mostrar_precio !== false && (
              <p className="boleta-contraseña__ofrenda">
                <span>Ofrenda</span>
                <strong>{precioValor}</strong>
              </p>
            )}
          </div>
          <div className="boleta-contraseña__codigo-box">
            <span className="boleta-contraseña__label">Código boleta</span>
            {cfg.mostrar_codigo_texto !== false && (
              <strong className="boleta-contraseña__codigo">{codigo || '—'}</strong>
            )}
          </div>
          {codigo && (
            <div className="boleta-contraseña__qr-box">
              <QRCodeSVG
                value={getQrPayload(codigo)}
                size={112}
                level="M"
                includeMargin
                bgColor="#ffffff"
                fgColor="#1e293b"
              />
              {cfg.mensaje_qr && (
                <small className="boleta-contraseña__qr-msg">{cfg.mensaje_qr}</small>
              )}
            </div>
          )}
        </div>
      </section>

      {cfg.pie_texto?.trim() && (
        <footer className="boleta-contraseña__pie">{cfg.pie_texto.trim()}</footer>
      )}
    </article>
  );
}
