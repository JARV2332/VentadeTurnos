import React, { useState, useEffect, useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../context/AuthContext';
import { getReciboConfig } from '../services/dataService';
import { mergeReciboConfig } from '../constants/reciboDefaults';
import { getQrPayload, formatPrecio } from '../utils/boletaUtils';
import { construirLineasRecibo, codigoReciboDisplay } from '../utils/compraUtils';

/**
 * Contraseña / recibo de turno(s) — media carta horizontal (8.5" × 5.5").
 * Soporta 1 o N turnos en la misma compra (tabla Turnos adquiridos).
 */
export default function BoletaContraseñaTurno({
  organizacion,
  cortejo,
  turno,
  brazo,
  items: itemsProp,
  compra,
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

  const items = useMemo(() => {
    if (itemsProp?.length) return itemsProp;
    if (brazo) return [{ brazo, turno }];
    return [];
  }, [itemsProp, brazo, turno]);

  const { lineas, totalFmt } = useMemo(() => construirLineasRecibo(items), [items]);
  const brazosLista = items.map((i) => i.brazo).filter(Boolean);

  const cfg = mergeReciboConfig(configProp ?? configGuardada);
  const codigo = codigoReciboDisplay(compra, brazosLista);
  const titulo =
    cfg.titulo_personalizado?.trim() ||
    (cfg.mostrar_nombre_org !== false ? organizacion?.nombre_oficial : '') ||
    'Contraseña de turno';
  const primary = cfg.color_primario || '#4f46e5';
  const esMulti = items.length > 1;

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
        <h2 className="boleta-contraseña__seccion-titulo">Turnos adquiridos</h2>
        <div className="boleta-contraseña__caja boleta-contraseña__caja--turno">
          <div className="boleta-contraseña__turno-datos boleta-contraseña__turno-datos--tabla">
            <table className="boleta-turnos-tabla">
              <thead>
                <tr>
                  <th>Cant.</th>
                  <th>Nº turno</th>
                  <th>Ofrenda</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((linea) => (
                  <tr key={`${linea.numero_turno}-${linea.etiqueta}-${linea.ofrenda}`}>
                    <td>{linea.cantidad}</td>
                    <td>
                      <strong>#{linea.numero_turno}</strong>
                      <span className="boleta-turnos-tabla__tipo">{linea.etiqueta}</span>
                    </td>
                    <td>{formatPrecio(linea.ofrenda)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} className="boleta-turnos-tabla__total-label">
                    Total ofrenda
                  </td>
                  <td className="boleta-turnos-tabla__total-valor">
                    <strong>{totalFmt}</strong>
                  </td>
                </tr>
              </tfoot>
            </table>
            {esMulti && (
              <p className="boleta-contraseña__nota-multi text-muted">
                Cada turno tiene su código VT- para entrega en taquilla.
              </p>
            )}
          </div>
          <div className="boleta-contraseña__codigo-box">
            <span className="boleta-contraseña__label">
              {esMulti || compra?.codigo_recibo ? 'Código recibo' : 'Código boleta'}
            </span>
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
