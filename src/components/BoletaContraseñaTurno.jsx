import React, { useState, useEffect, useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../context/AuthContext';
import { getReciboConfig } from '../services/dataService';
import { mergeReciboConfig } from '../constants/reciboDefaults';
import { getQrPayload, formatPrecio, formatFechaLarga, formatFechaEvento } from '../utils/boletaUtils';
import { construirLineasRecibo, codigoReciboDisplay } from '../utils/compraUtils';
import { etiquetaHonorTurno, textoMelodiaTurno } from '../utils/turnoUtils';

/**
 * Contraseña / recibo formal — media carta horizontal (8.5" × 5.5").
 * Estilo inscripción procesional con QR compacto, uniformidad y fecha de entrega.
 */
export default function BoletaContraseñaTurno({
  organizacion,
  cortejo,
  turno,
  brazo,
  cargador,
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
  const primerItem = items[0];
  const turnoPrincipal = primerItem?.turno || turno;
  const brazoPrincipal = primerItem?.brazo || brazo;

  const cfg = mergeReciboConfig(configProp ?? configGuardada);
  const codigo = codigoReciboDisplay(compra, brazosLista);
  const esMulti = items.length > 1;
  const qrSize = cfg.qr_tamano_px || 56;

  const tituloOrg =
    cfg.titulo_personalizado?.trim() ||
    (cfg.mostrar_nombre_org !== false ? organizacion?.nombre_oficial : '') ||
    '';

  const tituloInscripcion =
    cfg.titulo_inscripcion?.trim() ||
    cortejo?.nombre_evento ||
    'Inscripciones Procesión Patronal';

  const fechaProcesion = cortejo?.fecha ? formatFechaEvento(cortejo.fecha) : '';
  const fechaEmision = cfg.mostrar_fecha_emision !== false ? formatFechaLarga(new Date()) : '';
  const entregaAnio = cfg.entrega_anio?.trim() || String(new Date().getFullYear());

  const nombreDevoto = cargador?.nombre_completo?.trim() || '';
  const dpiDevoto = cargador?.cui_o_identificacion?.trim() || '';

  const melodiaTexto = textoMelodiaTurno(turnoPrincipal);
  const honorTurno = etiquetaHonorTurno(turnoPrincipal || {});
  const precioUnitario = formatPrecio(
    brazoPrincipal?.precio_pagado ?? turnoPrincipal?.precio ?? lineas[0]?.ofrenda ?? 0
  );

  return (
    <article className="boleta-contraseña boleta-contraseña--media-carta boleta-contraseña--formal">
      {/* Encabezado institucional (sin saludo — va sobre el nombre) */}
      <header className="boleta-formal__head">
        <div className="boleta-formal__head-centro">
          {tituloOrg && <p className="boleta-formal__parroquia">{tituloOrg}</p>}
          {cfg.linea_pastoral?.trim() && (
            <p className="boleta-formal__pastoral">{cfg.linea_pastoral.trim()}</p>
          )}
          <p className="boleta-formal__inscripcion">{tituloInscripcion}</p>
          {fechaProcesion && cfg.mostrar_evento !== false && (
            <p className="boleta-formal__fecha-evento">{fechaProcesion}</p>
          )}
        </div>

        <div className="boleta-formal__head-der">
          {cfg.logo_url && (
            <img
              src={cfg.logo_url}
              alt=""
              className="boleta-formal__logo"
              style={{ maxWidth: cfg.logo_ancho_px || 72 }}
            />
          )}
          {codigo && (
            <div className="boleta-formal__qr-mini">
              <QRCodeSVG
                value={getQrPayload(codigo)}
                size={qrSize}
                level="M"
                includeMargin={false}
                bgColor="#ffffff"
                fgColor="#1e293b"
              />
            </div>
          )}
        </div>
      </header>

      {/* Datos del devoto */}
      {(cfg.mostrar_saludo_devoto !== false && cfg.encabezado_saludo?.trim()) ||
      (cfg.mostrar_cargador !== false && nombreDevoto) ||
      dpiDevoto ? (
        <section className="boleta-formal__devoto-row">
          <div className="boleta-formal__devoto-nombre">
            {cfg.mostrar_saludo_devoto !== false && cfg.encabezado_saludo?.trim() && (
              <p className="boleta-formal__saludo-devoto">{cfg.encabezado_saludo.trim()}</p>
            )}
            {cfg.mostrar_cargador !== false && nombreDevoto && (
              <strong>{nombreDevoto}</strong>
            )}
            {dpiDevoto && (
              <p className="boleta-formal__dpi">
                <span>{cfg.etiqueta_dpi || 'DPI:'}</span> {dpiDevoto}
              </p>
            )}
          </div>
          <div className="boleta-formal__boleta-nums">
            {brazoPrincipal?.numero_turno != null && (
              <p>
                <span>No. Turno:</span> <strong>{brazoPrincipal.numero_turno}</strong>
              </p>
            )}
            {cfg.mostrar_codigo_texto !== false && codigo && (
              <p>
                <span>Código:</span> <strong>{codigo}</strong>
              </p>
            )}
          </div>
        </section>
      ) : null}

      {/* Constancia */}
      {cfg.texto_constancia?.trim() && (
        <p className="boleta-formal__constancia">{cfg.texto_constancia.trim()}</p>
      )}

      {/* Turno(s) y ofrenda */}
      <section className="boleta-formal__cuerpo">
        {esMulti ? (
          <div className="boleta-formal__tabla-wrap">
            <p className="boleta-formal__seccion-label">
              {cfg.titulo_tabla_turnos?.trim() || 'Turnos adquiridos'}
            </p>
            <table className="boleta-turnos-tabla boleta-turnos-tabla--formal">
              <thead>
                <tr>
                  <th>Cant.</th>
                  <th>Nº turno</th>
                  <th>Honor / tipo</th>
                  <th>Ofrenda</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((linea) => (
                  <tr key={`${linea.numero_turno}-${linea.etiqueta}-${linea.ofrenda}`}>
                    <td>{linea.cantidad}</td>
                    <td>#{linea.numero_turno}</td>
                    <td>{linea.etiqueta}</td>
                    <td>{formatPrecio(linea.ofrenda)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="boleta-turnos-tabla__total-label">
                    Total ofrenda
                  </td>
                  <td className="boleta-turnos-tabla__total-valor">
                    <strong>{totalFmt}</strong>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="boleta-formal__turno-fila">
            <div className="boleta-formal__turno-info">
              {cfg.mostrar_turno !== false && (
                <p className="boleta-formal__honor">
                  <span>No. Turno:</span>{' '}
                  <strong>{honorTurno.toUpperCase()}</strong>
                </p>
              )}
              {melodiaTexto && (
                <p className="boleta-formal__melodia">
                  <span>Melodía:</span> {melodiaTexto}
                </p>
              )}
            </div>
            {cfg.mostrar_precio !== false && (
              <div className="boleta-formal__precio-caja">
                <span>Ofrenda:</span>
                <strong>{precioUnitario}</strong>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Fecha de emisión (día actual) */}
      {fechaEmision && cfg.ciudad_lugar?.trim() && (
        <p className="boleta-formal__fecha-emision">
          {cfg.ciudad_lugar.trim()}, {fechaEmision}
        </p>
      )}

      {/* Pie: uniformidad + entrega */}
      {(cfg.mostrar_uniformidad !== false || cfg.mostrar_entrega_turno !== false) && (
        <footer className="boleta-formal__pie">
          {cfg.mostrar_uniformidad !== false && (
            <div className="boleta-formal__uniformidad">
              <strong>Uniformidad:</strong>
              {cfg.uniformidad_caballeros?.trim() && (
                <p>{cfg.uniformidad_caballeros.trim()}</p>
              )}
              {cfg.uniformidad_damas?.trim() && <p>{cfg.uniformidad_damas.trim()}</p>}
            </div>
          )}
          {cfg.mostrar_entrega_turno !== false && (
            <div className="boleta-formal__entrega">
              <p>
                {cfg.texto_entrega_prefijo?.trim() ||
                  'Esta contraseña debe presentarse para la entrega del turno los días:'}{' '}
                <strong>
                  {cfg.entrega_dia || '—'} de {cfg.entrega_mes || '—'} de {entregaAnio}
                </strong>
              </p>
            </div>
          )}
        </footer>
      )}

      {cfg.pie_texto?.trim() && (
        <p className="boleta-formal__nota-extra">{cfg.pie_texto.trim()}</p>
      )}
    </article>
  );
}
