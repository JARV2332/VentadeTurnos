import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import BoletaContraseñaTurno from '../components/BoletaContraseñaTurno';
import AppFooter from '../components/AppFooter';
import { mergeReciboConfig } from '../constants/reciboDefaults';
import { codigoReciboDisplay } from '../utils/compraUtils';
import { cuiValidoParaBusqueda, normalizarCui } from '../utils/cuiUtils';

function etiquetaBoleta(boleta) {
  const codigo = codigoReciboDisplay(boleta.compra, boleta.items?.map((i) => i.brazo) || []);
  const n = boleta.items?.length || 1;
  const evento = boleta.cortejo?.nombre_evento;
  return evento
    ? `${evento} — ${n} turno(s) · ${codigo}`
    : `${n} turno(s) · ${codigo}`;
}

export default function MisTurnosPublico() {
  const { orgSlug } = useParams();
  const [dpi, setDpi] = useState('');
  const [orgInfo, setOrgInfo] = useState(null);
  const [cargandoOrg, setCargandoOrg] = useState(true);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!orgSlug) {
      setCargandoOrg(false);
      setError('Enlace incompleto. Solicite el enlace correcto a su organización.');
      return undefined;
    }

    let cancel = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/public-boletas-por-cui?org=${encodeURIComponent(orgSlug)}`
        );
        const json = await res.json().catch(() => ({}));
        if (cancel) return;
        if (!res.ok) {
          setError(json.error || 'Organización no encontrada');
          setOrgInfo(null);
          return;
        }
        setOrgInfo(json.organizacion || null);
      } catch {
        if (!cancel) setError('No se pudo cargar la página');
      } finally {
        if (!cancel) setCargandoOrg(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [orgSlug]);

  const buscar = useCallback(
    async (e) => {
      e?.preventDefault();
      setError('');
      setResultado(null);

      if (!cuiValidoParaBusqueda(dpi)) {
        setError('Ingrese su número de DPI (mínimo 4 dígitos).');
        return;
      }

      setBuscando(true);
      try {
        const cui = normalizarCui(dpi);
        const res = await fetch(
          `/api/public-boletas-por-cui?org=${encodeURIComponent(orgSlug)}&cui=${encodeURIComponent(cui)}`
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(json.error || 'No se encontraron boletas');
          return;
        }
        setResultado(json);
        setSelectedIdx(0);
      } catch {
        setError('No se pudo completar la búsqueda. Intente más tarde.');
      } finally {
        setBuscando(false);
      }
    },
    [dpi, orgSlug]
  );

  const boletas = resultado?.boletas || [];
  const boletaSel = boletas[selectedIdx] || null;
  const reciboConfig = mergeReciboConfig(boletaSel?.reciboConfig || null);
  const organizacion = resultado?.organizacion || orgInfo;
  const nombreOrg = organizacion?.nombre_oficial || 'Su organización';
  const variasBoletas = boletas.length > 1;

  const enlacePublico = useMemo(() => {
    if (typeof window === 'undefined' || !orgSlug) return '';
    return `${window.location.origin}/mis-turnos/${orgSlug}`;
  }, [orgSlug]);

  const handlePrint = () => window.print();

  const handlePrintAll = () => {
    document.body.classList.add('mis-turnos-publico--print-all');
    const limpiar = () => {
      document.body.classList.remove('mis-turnos-publico--print-all');
    };
    window.addEventListener('afterprint', limpiar, { once: true });
    window.print();
  };

  const copiarEnlace = async () => {
    if (!enlacePublico) return;
    try {
      await navigator.clipboard.writeText(enlacePublico);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="boleta-publica mis-turnos-publico">
      <header className="boleta-publica__head">
        <Link to="/" className="boleta-publica__brand">
          ventadeturnos.com
        </Link>
        <h1 className="mis-turnos-publico__titulo">Ver mis turnos</h1>
        {cargandoOrg ? (
          <p className="boleta-publica__hint">Cargando…</p>
        ) : (
          <p className="boleta-publica__hint">{nombreOrg}</p>
        )}
      </header>

      <main className="boleta-publica__main mis-turnos-publico__main">
        {!error && !cargandoOrg && (
          <section className="mis-turnos-publico__formulario no-print">
            <p className="mis-turnos-publico__intro">
              Ingrese su número de <strong>DPI</strong> para consultar y descargar sus boletas
              digitales con código QR.
            </p>
            <form className="mis-turnos-publico__busqueda" onSubmit={buscar}>
              <label>
                Número de DPI
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Ej. 3534995280101"
                  value={dpi}
                  onChange={(e) => setDpi(e.target.value)}
                  disabled={buscando}
                />
              </label>
              <button type="submit" className="btn btn--primary" disabled={buscando}>
                {buscando ? 'Buscando…' : 'Buscar mis boletas'}
              </button>
            </form>
          </section>
        )}

        {error && (
          <div className="alert alert--error boleta-publica__alert no-print">{error}</div>
        )}

        {resultado?.cargador && (
          <p className="mis-turnos-publico__devoto no-print">
            <strong>{resultado.cargador.nombre_completo}</strong>
            {boletas.length > 0 && (
              <span className="text-muted">
                {' '}
                ·{' '}
                {boletas.length === 1
                  ? '1 boleta encontrada'
                  : `${boletas.length} boletas encontradas`}
              </span>
            )}
          </p>
        )}

        {boletas.length > 0 && (
          <div className="mis-turnos-publico__acciones no-print">
            {variasBoletas && (
              <label className="mis-turnos-publico__selector">
                Boleta
                <select
                  value={selectedIdx}
                  onChange={(e) => setSelectedIdx(Number(e.target.value))}
                >
                  {boletas.map((b, i) => (
                    <option key={i} value={i}>
                      {etiquetaBoleta(b)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="mis-turnos-publico__botones">
              <button type="button" className="btn btn--primary" onClick={handlePrint}>
                {variasBoletas ? 'Descargar / imprimir esta boleta' : 'Descargar / imprimir boleta'}
              </button>
              {variasBoletas && (
                <button type="button" className="btn btn--ghost" onClick={handlePrintAll}>
                  Imprimir todas ({boletas.length})
                </button>
              )}
            </div>
            <p className="mis-turnos-publico__tip text-muted">
              Para guardar como PDF: en el diálogo de impresión elija{' '}
              <strong>Guardar como PDF</strong>, desactive encabezados y active gráficos de fondo.
            </p>
          </div>
        )}

        {boletaSel && (
          <div className="boleta-publica__stage print-area mis-turnos-publico__boleta mis-turnos-publico__boleta--single">
            <BoletaContraseñaTurno
              brazo={boletaSel.brazo}
              turno={boletaSel.turno}
              cortejo={boletaSel.cortejo}
              cargador={boletaSel.cargador || resultado?.cargador}
              organizacion={organizacion}
              items={boletaSel.items}
              compra={boletaSel.compra}
              config={reciboConfig}
            />
          </div>
        )}

        {boletas.length > 1 && (
          <div className="mis-turnos-publico__todas print-area mis-turnos-publico__todas--solo-print">
            {boletas.map((b, i) => (
              <div key={i} className="mis-turnos-publico__boleta mis-turnos-publico__boleta--stack">
                <BoletaContraseñaTurno
                  brazo={b.brazo}
                  turno={b.turno}
                  cortejo={b.cortejo}
                  cargador={b.cargador || resultado?.cargador}
                  organizacion={organizacion}
                  items={b.items}
                  compra={b.compra}
                  config={mergeReciboConfig(b.reciboConfig || null)}
                />
              </div>
            ))}
          </div>
        )}
      </main>

      {enlacePublico && (
        <p className="mis-turnos-publico__share no-print text-muted">
          Enlace para compartir:{' '}
          <button type="button" className="mis-turnos-publico__copy-link" onClick={copiarEnlace}>
            {copiado ? '¡Copiado!' : 'Copiar enlace'}
          </button>
        </p>
      )}

      <AppFooter className="app-footer--public" />
    </div>
  );
}
