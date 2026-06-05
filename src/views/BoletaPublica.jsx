import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import BoletaRecibo from '../components/BoletaRecibo';
import AppFooter from '../components/AppFooter';
import { extraerCodigoBoleta } from '../utils/boletaUtils';
import { mergeReciboConfig } from '../constants/reciboDefaults';

export default function BoletaPublica() {
  const { codigo: codigoParam } = useParams();
  const [estado, setEstado] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    const codigo = extraerCodigoBoleta(codigoParam);
    if (!codigo) {
      setEstado({ loading: false, error: 'Código de boleta inválido', data: null });
      return;
    }

    let cancel = false;
    (async () => {
      try {
        const res = await fetch(`/api/public-boleta?codigo=${encodeURIComponent(codigo)}`);
        const json = await res.json().catch(() => ({}));
        if (cancel) return;
        if (!res.ok) {
          setEstado({ loading: false, error: json.error || 'Boleta no encontrada', data: null });
          return;
        }
        setEstado({ loading: false, error: null, data: json });
      } catch {
        if (!cancel) {
          setEstado({ loading: false, error: 'No se pudo cargar la boleta', data: null });
        }
      }
    })();

    return () => {
      cancel = true;
    };
  }, [codigoParam]);

  const { loading, error, data } = estado;

  return (
    <div className="boleta-publica">
      <header className="boleta-publica__head">
        <Link to="/" className="boleta-publica__brand">
          ventadeturnos.com
        </Link>
        <p className="boleta-publica__hint">Boleta digital — presente el QR en taquilla</p>
      </header>

      <main className="boleta-publica__main">
        {loading && <p className="text-muted">Cargando boleta…</p>}
        {error && (
          <div className="alert alert--error boleta-publica__alert">{error}</div>
        )}
        {data && (
          <BoletaRecibo
            brazo={data.brazo}
            turno={data.turno}
            cortejo={data.cortejo}
            cargador={data.cargador}
            organizacion={data.organizacion}
            config={mergeReciboConfig(data.reciboConfig || null)}
          />
        )}
      </main>
      <AppFooter className="app-footer--public" />
    </div>
  );
}
