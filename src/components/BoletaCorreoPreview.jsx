import React from 'react';
import BoletaCard from './BoletaCard';

/** Vista previa del correo con boleta adjunta (sin brazo/lado — solo turno + QR). */
export default function BoletaCorreoPreview({ datos }) {
  if (!datos) return null;

  return (
    <div className="email-preview">
      <div className="email-preview__envelope">
        <div className="email-preview__meta">
          <div><strong>De:</strong> {datos.nombreRemitente} &lt;{datos.remitente}&gt;</div>
          <div><strong>Para:</strong> {datos.destinatario}</div>
          <div><strong>Asunto:</strong> {datos.asunto}</div>
        </div>
        <div className="email-preview__body">
          <p className="email-preview__saludo">
            Estimado/a {datos.cargador?.nombre_completo?.split(' ')[0] || 'devoto'},
          </p>
          <p>
            Su turno <strong>#{datos.brazo?.numero_turno}</strong>{' '}
            ({datos.turno?.etiqueta || datos.turno?.tipo_turno}) para la procesión{' '}
            <strong>&quot;{datos.cortejo?.nombre_evento}&quot;</strong> ya está apartado.
          </p>
          <p>
            Para la entrega del turno físico, presente la boleta adjunta con su código QR.
            En taquilla escanearán el QR para validar su compra y entregarle el turno.
          </p>

          <div className="email-preview__adjunto">
            <span className="email-preview__adjunto-label">📎 Boleta adjunta</span>
            <BoletaCard
              organizacion={datos.organizacion}
              cortejo={datos.cortejo}
              turno={datos.turno}
              cargador={datos.cargador}
              brazo={datos.brazo}
              compact
            />
          </div>
        </div>
      </div>
    </div>
  );
}
