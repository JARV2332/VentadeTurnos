import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../context/AuthContext';
import { getReciboConfig } from '../services/dataService';
import { mergeReciboConfig } from '../constants/reciboDefaults';
import { getQrPayload, formatPrecio } from '../utils/boletaUtils';
import { etiquetaHonorTurno, repertorioTurnoLista } from '../utils/turnoUtils';

/**
 * Contraseña de turno — media carta horizontal (8.5" × 5.5").
 */
export default function BoletaContraseñaTurno({
  organizacion,
  cortejo,
  turno,
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
  const honorTurno = etiquetaHonorTurno(turno);
  const repertorio = repertorioTurnoLista(turno);

  return (
    <article
      className="boleta-contraseña boleta-contraseña--media-carta"
      style={{ '--boleta-primary': primary }}
    >
      <header className="boleta-contraseña__head">
        <div className="boleta-contraseña__head-izq">
          {cfg.logo_url && (
            <img
              src={cfg.logo_url}
              alt=""
              className="boleta-contraseña__logo"
              style={{ maxWidth: cfg.logo_ancho_px || 72 }}
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
        <h2 className="boleta-contraseña__seccion-titulo">Datos del turno</h2>
        <div className="boleta-contraseña__caja boleta-contraseña__caja--turno">
          <div className="boleta-contraseña__turno-datos">
            {cfg.mostrar_turno !== false && (
              <>
                <p className="boleta-contraseña__turno-num">
                  <span>Turno</span>
                  <strong>#{brazo?.numero_turno ?? turno?.numero_turno ?? '—'}</strong>
                </p>
                <p className="boleta-contraseña__turno-tipo">
                  <strong>{honorTurno}</strong>
                </p>
                {repertorio.map((item) => (
                  <p key={item.tipo} className="boleta-contraseña__melodia">
                    <span>{item.tipo}</span>
                    <strong>{item.texto}</strong>
                  </p>
                ))}
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
                size={96}
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
