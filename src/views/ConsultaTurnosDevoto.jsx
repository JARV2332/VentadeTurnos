import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import BoletaContraseñaTurno from '../components/BoletaContraseñaTurno';
import { useAuth } from '../context/AuthContext';
import { buscarTurnosDevoto, buscarBoletaPorCodigo } from '../services/dataService';
import { formatQ } from '../utils/cajaReportUtils';
import { labelMetodoPago } from '../utils/pagoUtils';
import {
  listarPersonasConsulta,
  filtrarAsignacionesPorPersona,
  APARTADOS_SIN_REGISTRO_ID,
} from '../utils/consultaDevotoUtils';

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

export default function ConsultaTurnosDevoto() {
  const { organizacionId, organizacion } = useAuth();
  const [query, setQuery] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null);
  const [personaSeleccionadaId, setPersonaSeleccionadaId] = useState(null);
  const [boletaModal, setBoletaModal] = useState(null);
  const [cargandoBoleta, setCargandoBoleta] = useState(false);
  const [boletaError, setBoletaError] = useState('');

  const buscar = useCallback(
    async (e) => {
      e?.preventDefault();
      setError('');
      setResultado(null);
      setPersonaSeleccionadaId(null);
      setBoletaModal(null);
      setBoletaError('');
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

  const personas = useMemo(
    () => listarPersonasConsulta(cargadores, asignaciones),
    [cargadores, asignaciones]
  );

  const personaSeleccionada = useMemo(
    () => personas.find((p) => p.id === personaSeleccionadaId) || null,
    [personas, personaSeleccionadaId]
  );

  const asignacionesFiltradas = useMemo(
    () => filtrarAsignacionesPorPersona(asignaciones, personaSeleccionadaId),
    [asignaciones, personaSeleccionadaId]
  );

  useEffect(() => {
    if (!resultado) {
      setPersonaSeleccionadaId(null);
      return;
    }
    const lista = listarPersonasConsulta(resultado.cargadores, resultado.asignaciones);
    if (lista.length === 1) {
      setPersonaSeleccionadaId(lista[0].id);
    }
  }, [resultado]);

  useEffect(() => {
    if (!boletaModal || typeof document === 'undefined') return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [boletaModal]);

  const handleImprimirBoleta = () => {
    document.body.classList.add('consulta-devoto--imprimiendo');
    const cleanup = () => document.body.classList.remove('consulta-devoto--imprimiendo');
    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
    setTimeout(cleanup, 1000);
  };

  const abrirBoleta = async (item) => {
    const codigo = item.brazo.codigo_boleta_qr;
    if (!codigo || item.brazo.estado !== 'vendido') return;
    setCargandoBoleta(true);
    setBoletaError('');
    try {
      const res = await buscarBoletaPorCodigo(organizacionId, codigo);
      if (res.error) {
        setBoletaError(res.error);
        return;
      }
      setBoletaModal(res);
    } catch (err) {
      setBoletaError(err.message || 'No se pudo cargar la boleta.');
    } finally {
      setCargandoBoleta(false);
    }
  };

  const itemsBoletaModal =
    boletaModal?.items?.length > 0
      ? boletaModal.items
      : boletaModal?.brazo
        ? [{ brazo: boletaModal.brazo, turno: boletaModal.turno }]
        : [];

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
        {boletaError && <div className="alert alert--error">{boletaError}</div>}
        {resultado?.mensaje && !error && (
          <div className="alert alert--info">{resultado.mensaje}</div>
        )}
      </section>

      {personas.length > 0 && (
        <section className="panel consulta-devoto__perfiles">
          <h3 className="panel__title">
            {personas.length === 1
              ? 'Persona encontrada'
              : `${personas.length} personas coincidentes — seleccione una`}
          </h3>
          {personas.length > 1 && !personaSeleccionadaId && (
            <p className="text-muted config-hint consulta-devoto__seleccion-hint">
              Hay varias coincidencias. Elija la persona correcta para ver solo sus turnos.
            </p>
          )}
          <div className="consulta-devoto__perfiles-grid">
            {personas.map((p) => {
              const activa = personaSeleccionadaId === p.id;
              const c = p.cargador;
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`consulta-devoto__perfil consulta-devoto__perfil--btn${activa ? ' consulta-devoto__perfil--activo' : ''}`}
                  onClick={() => setPersonaSeleccionadaId(p.id)}
                >
                  <div className="consulta-devoto__perfil-cabecera">
                    <strong>{p.nombre}</strong>
                    <span className="consulta-devoto__turnos-badge">
                      {p.turnosCount} turno{p.turnosCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {p.tipo === 'registrado' && c ? (
                    <>
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
                    </>
                  ) : (
                    <p className="text-muted consulta-devoto__apartado-nota">
                      Apartado sin ficha en devotos
                    </p>
                  )}
                </button>
              );
            })}
          </div>
          {personaSeleccionada?.tipo === 'registrado' && personaSeleccionada.cargador && (
            <p className="consulta-devoto__enlace-devotos">
              <Link to="/devotos" className="btn btn--ghost btn--sm">
                Abrir ficha en devotos
              </Link>
            </p>
          )}
        </section>
      )}

      {personas.length > 1 && !personaSeleccionadaId && asignaciones.length > 0 && (
        <section className="panel">
          <p className="text-muted consulta-devoto__sin-seleccion">
            Seleccione una persona arriba para ver sus {asignaciones.length} turno(s) encontrados.
          </p>
        </section>
      )}

      {personaSeleccionadaId && asignacionesFiltradas.length > 0 && (
        <section className="panel">
          <h3 className="panel__title">
            Turnos de {personaSeleccionada?.nombre} ({asignacionesFiltradas.length})
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
                  <th>Pago</th>
                  <th>Ofrenda</th>
                  <th>Boleta</th>
                </tr>
              </thead>
              <tbody>
                {asignacionesFiltradas.map((item) => {
                  const tieneBoleta =
                    item.brazo.estado === 'vendido' && Boolean(item.brazo.codigo_boleta_qr);
                  return (
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
                        {item.brazo.estado === 'vendido'
                          ? labelMetodoPago(item.brazo.metodo_pago)
                          : '—'}
                      </td>
                      <td>
                        {item.brazo.estado === 'vendido'
                          ? formatQ(item.brazo.precio_pagado)
                          : '—'}
                      </td>
                      <td>
                        {tieneBoleta ? (
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            disabled={cargandoBoleta}
                            onClick={() => abrirBoleta(item)}
                          >
                            {cargandoBoleta ? 'Cargando…' : 'Ver boleta'}
                          </button>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {personaSeleccionadaId &&
        asignacionesFiltradas.length === 0 &&
        personaSeleccionadaId !== APARTADOS_SIN_REGISTRO_ID && (
          <section className="panel">
            <p className="text-muted">Esta persona no tiene turnos asignados con los criterios de búsqueda.</p>
          </section>
        )}

      {boletaModal &&
        !boletaModal.error &&
        itemsBoletaModal.length > 0 &&
        createPortal(
          <div
            className="modal-overlay consulta-devoto__overlay"
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) setBoletaModal(null);
            }}
          >
            <div
              className="consulta-devoto__modal-boleta"
              role="dialog"
              aria-modal="true"
              aria-labelledby="consulta-boleta-titulo"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="consulta-devoto__modal-boleta-header no-print">
                <h2 id="consulta-boleta-titulo">Boleta</h2>
                <div className="consulta-devoto__modal-boleta-acciones">
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    onClick={handleImprimirBoleta}
                  >
                    Imprimir
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => setBoletaModal(null)}
                  >
                    Cerrar
                  </button>
                </div>
              </div>
              <div className="consulta-devoto__modal-boleta-body print-area">
                <BoletaContraseñaTurno
                  organizacion={organizacion}
                  cortejo={boletaModal.cortejo}
                  cargador={boletaModal.cargador}
                  items={itemsBoletaModal}
                  compra={boletaModal.compra}
                />
                <p className="text-muted impresion-print-tip no-print consulta-devoto__print-tip">
                  Al imprimir: desactive <strong>Encabezados y pies de página</strong>, active{' '}
                  <strong>Gráficos en segundo plano</strong> y elija <strong>Guardar como PDF</strong>.
                </p>
              </div>
            </div>
          </div>,
          document.body
        )}
    </Layout>
  );
}
