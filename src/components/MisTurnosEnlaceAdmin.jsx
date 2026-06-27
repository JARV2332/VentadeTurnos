import React, { useState } from 'react';

export default function MisTurnosEnlaceAdmin({ organizacion, className = '' }) {
  const [copiado, setCopiado] = useState(false);

  if (!organizacion?.subdominio_slug) return null;

  const url =
    typeof window !== 'undefined'
      ? `${window.location.origin}/mis-turnos/${organizacion.subdominio_slug}`
      : `/mis-turnos/${organizacion.subdominio_slug}`;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      window.prompt('Copie el enlace:', url);
    }
  };

  return (
    <div className={`info-box mis-turnos-enlace-admin no-print ${className}`.trim()}>
      <strong>Enlace público «Ver mis turnos»</strong>
      <p className="text-muted">
        Comparta por WhatsApp para que los devotos consulten sus turnos con DPI:
      </p>
      <code className="mis-turnos-enlace-admin__url">{url}</code>
      <div className="mis-turnos-enlace-admin__acciones">
        <button type="button" className="btn btn--ghost btn--sm" onClick={copiar}>
          {copiado ? 'Copiado' : 'Copiar enlace'}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="btn btn--ghost btn--sm"
        >
          Abrir página
        </a>
      </div>
    </div>
  );
}
