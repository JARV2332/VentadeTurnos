import React, { useEffect, useState } from 'react';
import { getReciboConfig, saveReciboConfig } from '../services/dataService';
import { mergeReciboConfig } from '../constants/reciboDefaults';

export default function PreregistroEnlaceAdmin({
  organizacion,
  organizacionId,
  className = '',
  mostrarConfig = true,
}) {
  const [copiado, setCopiado] = useState(false);
  const [cargando, setCargando] = useState(Boolean(mostrarConfig && organizacionId));
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [formato, setFormato] = useState('termico_80');
  const [activo, setActivo] = useState(true);
  const [titulo, setTitulo] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [diseñoBase, setDiseñoBase] = useState(null);

  const slug = organizacion?.subdominio_slug || '';
  const url =
    typeof window !== 'undefined'
      ? `${window.location.origin}/preregistro/${slug}`
      : `/preregistro/${slug}`;

  useEffect(() => {
    if (!mostrarConfig || !organizacionId) {
      setCargando(false);
      return undefined;
    }
    let cancel = false;
    (async () => {
      try {
        const raw = await getReciboConfig(organizacionId);
        if (cancel) return;
        const merged = mergeReciboConfig(raw);
        setFormato(merged.formato || 'termico_80');
        setActivo(merged.preregistro_activo !== false);
        setTitulo(merged.preregistro_titulo || '');
        setMensaje(merged.preregistro_mensaje || '');
        const diseño =
          raw?.diseño && typeof raw.diseño === 'object' && !Array.isArray(raw.diseño)
            ? { ...raw.diseño }
            : {
                logo_url: merged.logo_url,
                color_primario: merged.color_primario,
                titulo_personalizado: merged.titulo_personalizado,
              };
        setDiseñoBase(diseño);
      } catch (e) {
        if (!cancel) setError(e?.message || 'No se pudo cargar la configuración');
      } finally {
        if (!cancel) setCargando(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [mostrarConfig, organizacionId]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      window.prompt('Copie el enlace:', url);
    }
  };

  if (!slug) return null;

  const guardar = async (e) => {
    e?.preventDefault();
    if (!organizacionId || !diseñoBase) return;
    setGuardando(true);
    setMsg('');
    setError('');
    try {
      const diseño = {
        ...diseñoBase,
        preregistro_activo: Boolean(activo),
        preregistro_titulo: titulo.trim(),
        preregistro_mensaje: mensaje.trim(),
      };
      const res = await saveReciboConfig(organizacionId, { formato, diseño });
      if (res?.error) {
        setError(res.error);
        return;
      }
      setDiseñoBase(diseño);
      setMsg('Configuración del preregistro guardada.');
      setTimeout(() => setMsg(''), 4000);
    } catch (err) {
      setError(err?.message || 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className={`info-box mis-turnos-enlace-admin no-print ${className}`.trim()}>
      <strong>Enlace público «Preregistro»</strong>
      <p className="text-muted">
        Compártalo para que los devotos dejen sus datos (DPI, WhatsApp, correo) antes de llegar a
        taquilla. Al vender, con el DPI aparecen solos.
      </p>
      <code className="mis-turnos-enlace-admin__url">{url}</code>
      <div className="mis-turnos-enlace-admin__acciones">
        <button type="button" className="btn btn--ghost btn--sm" onClick={copiar}>
          {copiado ? 'Copiado' : 'Copiar enlace'}
        </button>
        <a href={url} target="_blank" rel="noreferrer" className="btn btn--ghost btn--sm">
          Abrir página
        </a>
      </div>

      {mostrarConfig && organizacionId && (
        <form className="preregistro-admin-config" onSubmit={guardar}>
          <h4 className="preregistro-admin-config__titulo">Personalizar formulario</h4>
          {cargando && <p className="text-muted">Cargando…</p>}
          {msg && <div className="alert alert--success">{msg}</div>}
          {error && <div className="alert alert--error">{error}</div>}
          {!cargando && (
            <>
              <label className="preregistro-admin-config__check">
                <input
                  type="checkbox"
                  checked={activo}
                  onChange={(e) => setActivo(e.target.checked)}
                />
                Formulario activo (si se desactiva, el enlace no acepta envíos)
              </label>
              <label>
                Título del formulario
                <input
                  type="text"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Preregistro de turnos"
                />
              </label>
              <label>
                Texto introductorio
                <textarea
                  rows={3}
                  value={mensaje}
                  onChange={(e) => setMensaje(e.target.value)}
                  placeholder="Complete sus datos para agilizar la compra en taquilla…"
                />
              </label>
              <button type="submit" className="btn btn--primary btn--sm" disabled={guardando}>
                {guardando ? 'Guardando…' : 'Guardar textos'}
              </button>
            </>
          )}
        </form>
      )}
    </div>
  );
}
