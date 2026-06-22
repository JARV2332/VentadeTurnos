import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { buscarTurnosDevoto } from '../services/dataService';
import { formatQ } from '../utils/cajaReportUtils';
import { labelMetodoPago } from '../utils/pagoUtils';

function formatTelefonoGt(valor) {
  if (!valor) return '—';
  const d = String(valor).replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('502')) {
    return `+502 ${d.slice(3, 7)} ${d.slice(7)}`;
  }
  if (d.length === 8) {
    return `+502 ${d.slice(0, 4)} ${d.slice(4)}`;
  }
  return valor;
}

function codigoBoleta(item) {
  const b = item.brazo;
  if (b.codigo_boleta_qr) return b.codigo_boleta_qr;
  return '—';
}

export default function ConsultaTurnosDevoto() {
  const { organizacionId, organizacion } = useAuth();
  const [query, setQuery] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null);

  const buscar = useCallback(
    async (e) => {
      e?.preventDefault();
      setError('');
      setResultado(null);
      setBuscando(true);
      try {
        const res = await buscarTurnosDevoto(organizacionId, query);
        if (res.error) {
          setError(res.error);
          return;
        }
        setResultado(res);
      } catch (err) {
        setError(err.message || 'No se pudo completar la búsqueda.');
      } finally {
        setBuscando(false);
      }
    },
    [organizacionId, query]
  );

  const asignaciones = resultado?.asignaciones || [];
  const cargadores = resultado?.cargadores || [];
  const orgSlug = organizacion?.subdominio_slug;

  return (
    <Layout
      title="Consulta de turnos"
      subtitle="Busque por nombre, DPI, correo o WhatsApp y vea qué turnos tiene la persona"
    >
      <section className="panel consulta-devoto">
        <h3 className="panel__title">Buscar devoto(a)</h3>
        <p className="text-muted config-hint">
          Muestra turnos <strong>pagados</strong> y <strong>apartados</strong> en todas las procesiones
          de su organización. Para que el devoto(a) consulte solo con DPI en internet, use{' '}
          {orgSlug ? (
            <Link to={`/mis-turnos/${orgSlug}`} target="_blank" rel="noreferrer">
              la página pública
            </Link>
          ) : (
            'la página pública «Mis turnos»'
          )}
          .
        </p>

        <form className="consulta-devoto__busqueda" onSubmit={buscar}>
          <label className="consulta-devoto__input-wrap">
            Nombre, DPI/CUI, correo o WhatsApp
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ej. García López, 1234567890123, correo@mail.com, 50212345678"
              autoComplete="off"
            />
          </label>
          <button type="submit" className="btn btn--primary" disabled={buscando || !query.trim()}>
            {buscando ? 'Buscando…' : 'Buscar turnos'}
          </button>
        </form>

        {error && <div className="alert alert--error">{error}</div>}
        {resultado?.mensaje && !error && (
          <div className="alert alert--info">{resultado.mensaje}</div>
        )}
      </section>

      {cargadores.length > 0 && (
        <section className="panel consulta-devoto__perfiles">
          <h3 className="panel__title">
            {cargadores.length === 1 ? 'Persona encontrada' : `${cargadores.length} personas coincidentes`}
          </h3>
          <div className="consulta-devoto__perfiles-grid">
            {cargadores.map((c) => (
              <div key={c.id} className="consulta-devoto__perfil">
                <strong>{c.nombre_completo}</strong>
                <dl className="consulta-devoto__datos">
                  <div>
                    <dt>DPI / CUI</dt>
                    <dd>{c.cui_o_identificacion || '—'}</dd>
                  </div>
                  <div>
                    <dt>WhatsApp</dt>
                    <dd>{formatTelefonoGt(c.whatsapp)}</dd>
                  </div>
                  <div>
                    <dt>Correo</dt>
                    <dd>{c.correo || '—'}</dd>
                  </div>
                </dl>
                <Link to="/devotos" className="btn btn--ghost btn--sm">
                  Ver en devotos
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {asignaciones.length > 0 && (
        <section className="panel">
          <h3 className="panel__title">
            Turnos asignados ({asignaciones.length})
          </h3>
          <div className="table-wrap">
            <table className="data-table data-table--compact consulta-devoto__tabla">
              <thead>
                <tr>
                  <th>Procesión</th>
                  <th>Turno</th>
                  <th>Honor / tipo</th>
                  <th>Brazo</th>
                  <th>Estado</th>
                  <th>Boleta</th>
                  <th>Pago</th>
                  <th>Ofrenda</th>
                </tr>
              </thead>
              <tbody>
                {asignaciones.map((item) => (
                  <tr key={item.brazo.id}>
                    <td>
                      {item.procesion}
                      {!item.procesion_activa && (
                        <span className="text-muted consulta-devoto__inactiva"> (inactiva)</span>
                      )}
                    </td>
                    <td>
                      <strong>#{item.numero_turno}</strong>
                    </td>
                    <td>{item.honor}</td>
                    <td>
                      {item.brazo.numero_brazo} {item.brazo.lado?.[0]}
                    </td>
                    <td>
                      <span className={`consulta-devoto__estado ${item.estadoClass}`}>
                        {item.estadoLabel}
                      </span>
                    </td>
                    <td>
                      <code>{codigoBoleta(item)}</code>
                    </td>
                    <td>
                      {item.brazo.estado === 'vendido'
                        ? labelMetodoPago(item.brazo.metodo_pago)
                        : '—'}
                    </td>
                    <td>
                      {item.brazo.estado === 'vendido'
                        ? formatQ(item.brazo.precio_pagado)
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </Layout>
  );
}
