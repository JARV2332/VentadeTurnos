import React from 'react';
import BoletaContraseñaTurno from './BoletaContraseñaTurno';

/** Vista previa del correo con la leyenda configurada y boleta adjunta. */
export default function BoletaCorreoPreview({ data, datos: datosProp }) {
  const datos = data || datosProp;
  if (!datos) return null;

  return (
    <div className="email-preview">
      <div className="email-preview__envelope">
        <div className="email-preview__meta">
          <div>
            <strong>De:</strong> {datos.nombreRemitente} &lt;{datos.remitente}&gt;
          </div>
          <div>
            <strong>Responder a:</strong> {datos.responderA || datos.remitente}
          </div>
          <div>
            <strong>Para:</strong> {datos.destinatario}
          </div>
          <div>
            <strong>Asunto:</strong> {datos.asunto}
          </div>
        </div>
        <div className="email-preview__body">
          <pre className="email-preview__cuerpo">{datos.cuerpo}</pre>

          <div className="email-preview__adjunto">
            <span className="email-preview__adjunto-label">📎 Boleta adjunta (vista previa)</span>
            <BoletaContraseñaTurno
              organizacion={datos.organizacion}
              cortejo={datos.cortejo}
              turno={datos.turno}
              brazo={datos.brazo}
              cargador={datos.cargador}
              items={datos.items}
              compra={datos.compra}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
