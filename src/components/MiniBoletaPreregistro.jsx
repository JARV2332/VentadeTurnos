import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { payloadQrPreregistro } from '../utils/preregistroPdfUtils';

function enmascararWhatsapp(wa) {
  const d = String(wa || '').replace(/\D/g, '');
  if (d.length < 8) return wa || '—';
  return `+${d.slice(0, 3)} ****${d.slice(-4)}`;
}

export default function MiniBoletaPreregistro({
  orgNombre,
  orgSlug,
  nombre,
  cui,
  whatsapp,
  correo,
  yaRegistrado = false,
  fecha = new Date(),
  onDescargar,
  descargando = false,
}) {
  const fechaTxt = (() => {
    try {
      return new Intl.DateTimeFormat('es-GT', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(fecha instanceof Date ? fecha : new Date(fecha));
    } catch {
      return '';
    }
  })();

  const qrValue = payloadQrPreregistro({ orgSlug, cui, nombre });

  return (
    <div className="mini-boleta-preregistro">
      <article className="mini-boleta-preregistro__ticket" aria-label="Comprobante de preregistro">
        <header className="mini-boleta-preregistro__head">
          <p className="mini-boleta-preregistro__org">{orgNombre}</p>
          <h2 className="mini-boleta-preregistro__titulo">
            {yaRegistrado ? 'Ya preinscrito' : 'Preinscripción'}
          </h2>
          <p className="mini-boleta-preregistro__sub">
            Comprobante de preregistro · no es boleta de turno
          </p>
        </header>

        <dl className="mini-boleta-preregistro__datos">
          <div>
            <dt>Nombre</dt>
            <dd>{nombre || '—'}</dd>
          </div>
          <div>
            <dt>DPI / CUI</dt>
            <dd>{cui || '—'}</dd>
          </div>
          <div>
            <dt>WhatsApp</dt>
            <dd>{enmascararWhatsapp(whatsapp)}</dd>
          </div>
          <div>
            <dt>Correo</dt>
            <dd>{correo || '—'}</dd>
          </div>
          <div>
            <dt>Fecha</dt>
            <dd>{fechaTxt}</dd>
          </div>
        </dl>

        <div className="mini-boleta-preregistro__qr">
          <QRCodeSVG value={qrValue} size={140} level="M" includeMargin />
        </div>

        <p className="mini-boleta-preregistro__pie">
          Presente este comprobante o su DPI en taquilla. El QR identifica el preregistro; la compra
          se confirma al pagar.
        </p>
      </article>

      {onDescargar && (
        <button
          type="button"
          className="btn btn--primary btn--block"
          onClick={onDescargar}
          disabled={descargando}
        >
          {descargando ? 'Generando PDF…' : 'Descargar PDF'}
        </button>
      )}
    </div>
  );
}
