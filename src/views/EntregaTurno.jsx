import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import Layout from '../components/Layout';
import BoletaCard from '../components/BoletaCard';
import QrScanner from '../components/QrScanner';
import StatusBadge from '../components/StatusBadge';
import Loader from '../components/Loader';
import EntregaConfirmForm, { textoEstadoEntrega } from '../components/EntregaConfirmForm';
import EntregaEstadoMenu from '../components/EntregaEstadoMenu';
import { useAuth } from '../context/AuthContext';
import {
  buscarBoletaPorCodigo,
  marcarEntregado,
  revertirEntregaBrazo,
  getBrazosPendientesEntregaByOrg,
  getCortejosByOrg,
  getCargadoresByIds,
  getComprasByIds,
  getTurnosByIds,
  subscribeData,
} from '../services/dataService';
import { enviarCorreoEntregaConfirmada } from '../services/emailService';
import { extraerCodigoBoleta } from '../utils/boletaUtils';
import { construirFilasPendientesEntrega } from '../utils/entregaPendientesUtils';

export default function EntregaTurno() {
  const { organizacionId, organizacion, user } = useAuth();
  const validacionRef = useRef(null);
  const [codigoManual, setCodigoManual] = useState('');
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [scannerOn, setScannerOn] = useState(true);
  const [listaAbierta, setListaAbierta] = useState(true);

  const [cortejos, setCortejos] = useState([]);
  const [brazosVendidos, setBrazosVendidos] = useState([]);
  const [cargadoresPorId, setCargadoresPorId] = useState({});
  const [comprasPorId, setComprasPorId] = useState({});
  const [turnosPorId, setTurnosPorId] = useState({});
  const [cargandoPendientes, setCargandoPendientes] = useState(true);
  const [filtroCortejo, setFiltroCortejo] = useState('');
  const [filtroTurno, setFiltroTurno] = useState('');
  const [busquedaPendientes, setBusquedaPendientes] = useState('');
  const [entregandoId, setEntregandoId] = useState(null);
  const [revirtiendoId, setRevirtiendoId] = useState(null);

  const [esTercero, setEsTercero] = useState(false);
  const [receptorNombre, setReceptorNombre] = useState('');
  const [enviarCorreo, setEnviarCorreo] = useState(true);

  const cortejosPorId = useMemo(
    () => Object.fromEntries(cortejos.map((c) => [c.id, c])),
    [cortejos]
  );

  const cargarPendientes = useCallback(async () => {
    if (!organizacionId) return;
    setCargandoPendientes(true);
    try {
      const [cortejosData, pendientes] = await Promise.all([
        getCortejosByOrg(organizacionId, { incluirInactivas: true }),
        getBrazosPendientesEntregaByOrg(organizacionId),
      ]);
      setCortejos(cortejosData || []);
      setBrazosVendidos(pendientes || []);

      const compraIds = [...new Set((pendientes || []).map((b) => b.compra_id).filter(Boolean))];
      const cargadorIds = [...new Set((pendientes || []).map((b) => b.cargador_id).filter(Boolean))];
      const [compras, cargadores] = await Promise.all([
        compraIds.length ? getComprasByIds(compraIds, organizacionId) : [],
        cargadorIds.length ? getCargadoresByIds(cargadorIds, organizacionId) : [],
      ]);
      setCargadoresPorId(Object.fromEntries((cargadores || []).map((c) => [c.id, c])));
      setComprasPorId(Object.fromEntries((compras || []).map((c) => [c.id, c])));

      const turnoIds = [...new Set((pendientes || []).map((b) => b.turno_id).filter(Boolean))];
      const turnosMap = turnoIds.length ? await getTurnosByIds(turnoIds) : {};
      setTurnosPorId(turnosMap && typeof turnosMap === 'object' ? turnosMap : {});

      setFiltroCortejo((prev) => {
        if (prev && (cortejosData || []).some((c) => c.id === prev)) return prev;
        const activa = (cortejosData || []).find((c) => c.estado === 'activa');
        return activa?.id || (cortejosData || [])[0]?.id || '';
      });
    } catch (err) {
      setError(err.message || 'No se pudo cargar el listado de pendientes.');
    } finally {
      setCargandoPendientes(false);
    }
  }, [organizacionId]);

  useEffect(() => {
    cargarPendientes();
    return subscribeData(organizacionId, cargarPendientes);
  }, [organizacionId, cargarPendientes]);

  useEffect(() => {
    setEsTercero(false);
    setReceptorNombre('');
    setEnviarCorreo(Boolean(resultado?.cargador?.correo?.trim()));
  }, [resultado?.brazo?.id, resultado?.cargador?.correo]);

  const pendientes = useMemo(
    () =>
      construirFilasPendientesEntrega({
        brazos: brazosVendidos,
        turnosPorId,
        cortejosPorId,
        cargadoresPorId,
        comprasPorId,
        filtros: { cortejoId: filtroCortejo, numeroTurno: filtroTurno },
        busqueda: busquedaPendientes,
      }),
    [
      brazosVendidos,
      turnosPorId,
      cortejosPorId,
      cargadoresPorId,
      comprasPorId,
      filtroCortejo,
      filtroTurno,
      busquedaPendientes,
    ]
  );

  const scrollAValidacion = () => {
    requestAnimationFrame(() => {
      validacionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const buscar = useCallback(async (texto) => {
    setError('');
    setOkMsg('');
    const codigo = extraerCodigoBoleta(texto);
    if (!codigo) {
      setError('Código QR no válido.');
      setResultado(null);
      return;
    }

    const res = await buscarBoletaPorCodigo(organizacionId, codigo);
    if (res.error) {
      setError(res.error);
      setResultado(null);
      return;
    }
    setResultado(res);
    setCodigoManual(codigo);
    scrollAValidacion();
  }, [organizacionId]);

  const handleScan = useCallback((decoded) => {
    buscar(decoded);
    setScannerOn(false);
  }, [buscar]);

  const seleccionarPendiente = async (fila) => {
    const codigo = fila.codigoBusqueda;
    if (!codigo) {
      setError('Este turno no tiene código de boleta.');
      return;
    }
    await buscar(codigo);
    setScannerOn(false);
  };

  const handleEntregar = async () => {
    const brazoId = resultado?.brazo?.id;
    if (!brazoId) return;
    if (esTercero && !receptorNombre.trim()) {
      setError('Indique el nombre de quien recibe el turno (tercero).');
      return;
    }

    setError('');
    setEntregandoId(brazoId);

    const opts = {
      entregado_a_tercero: esTercero,
      entregado_receptor_nombre: esTercero ? receptorNombre.trim() : null,
    };

    const res = await marcarEntregado(brazoId, organizacionId, user?.authUserId || user?.id, opts);
    if (res.error) {
      setEntregandoId(null);
      setError(res.error);
      return;
    }

    const brazoActualizado = res.data;
    const cargador =
      resultado?.cargador ||
      (brazoActualizado?.cargador_id ? cargadoresPorId[brazoActualizado.cargador_id] : null);

    let avisoCorreo = '';
    if (enviarCorreo && cargador?.correo?.trim()) {
      const mail = await enviarCorreoEntregaConfirmada({
        organizacionId,
        organizacion,
        cargador,
        brazo: brazoActualizado,
        turno: resultado?.turno,
        cortejo: resultado?.cortejo,
        entregado_a_tercero: esTercero,
        entregado_receptor_nombre: opts.entregado_receptor_nombre,
        entregado_en: brazoActualizado?.entregado_en,
      });
      if (mail.ok) {
        avisoCorreo = ` Correo enviado a ${mail.destinatario}.`;
      } else if (!mail.omitido) {
        avisoCorreo = ` (Correo: ${mail.error || 'no enviado'})`;
      }
    }

    setEntregandoId(null);

    const nombre = cargador?.nombre_completo || 'devoto(a)';
    if (esTercero) {
      setOkMsg(
        `Turno entregado a ${receptorNombre.trim()} (tercero), titular ${nombre}.${avisoCorreo}`
      );
    } else {
      setOkMsg(`Turno entregado a ${nombre}.${avisoCorreo}`);
    }

    setResultado({
      ...resultado,
      brazo: brazoActualizado,
    });
    cargarPendientes();
  };

  const handleRevertirPendiente = async () => {
    const brazoId = resultado?.brazo?.id;
    if (!brazoId) return;

    setError('');
    setRevirtiendoId(brazoId);
    const res = await revertirEntregaBrazo(brazoId, organizacionId);
    setRevirtiendoId(null);

    if (res.error) {
      setError(res.error);
      return;
    }

    setOkMsg('Turno marcado como pendiente de entrega. Puede volver a confirmar la entrega.');
    setResultado({
      ...resultado,
      brazo: res.data,
    });
    setEsTercero(false);
    setReceptorNombre('');
    cargarPendientes();
  };

  const yaEntregado = resultado?.brazo?.estado_entrega === 'entregado';
  const estadoEntregaTxt = textoEstadoEntrega(resultado?.brazo);

  return (
    <Layout
      title="Entrega de turnos"
      subtitle="Escanee, valide y confirme la entrega física del turno"
    >
      {okMsg && <div className="alert alert--success">{okMsg}</div>}
      {error && <div className="alert alert--error">{error}</div>}

      <div className="entrega-layout">
        <div className="entrega-layout__main">
          <section className="panel panel--compact entrega-scan">
            <h3 className="panel__title panel__title--sm">Escanear o validar</h3>
            {scannerOn ? (
              <QrScanner onScan={handleScan} active={scannerOn} />
            ) : (
              <div className="entrega-scanner-off">
                <p className="text-muted">Escaneo pausado.</p>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setScannerOn(true)}>
                  Activar cámara
                </button>
              </div>
            )}

            <div className="entrega-manual entrega-manual--inline">
              <input
                type="text"
                placeholder="Código VT-… o VR-…"
                value={codigoManual}
                onChange={(e) => setCodigoManual(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && buscar(codigoManual)}
                aria-label="Código de boleta"
              />
              <button type="button" className="btn btn--primary btn--sm" onClick={() => buscar(codigoManual)}>
                Validar
              </button>
            </div>
          </section>

          <section className="panel panel--compact" ref={validacionRef}>
            <h3 className="panel__title panel__title--sm">Validación y entrega</h3>

            {!resultado ? (
              <p className="text-muted entrega-empty">
                Escanee el QR o elija un turno del listado para confirmar la entrega.
              </p>
            ) : (
              <>
                <div className="entrega-status entrega-status--compact">
                  {yaEntregado ? (
                    <StatusBadge status="entregado" />
                  ) : (
                    <StatusBadge status="pendiente_entrega" />
                  )}
                  <span>{estadoEntregaTxt || 'Pago confirmado — pendiente de entrega física'}</span>
                </div>

                <BoletaCard
                  organizacion={organizacion}
                  cortejo={resultado.cortejo}
                  turno={resultado.turno}
                  cargador={resultado.cargador}
                  brazo={resultado.brazo}
                  showEntrega
                />

                <EntregaEstadoMenu
                  brazo={resultado.brazo}
                  onRevertirPendiente={handleRevertirPendiente}
                  loading={revirtiendoId === resultado.brazo.id}
                  disabled={Boolean(entregandoId || revirtiendoId)}
                />

                {!yaEntregado ? (
                  <EntregaConfirmForm
                    cargador={resultado.cargador}
                    esTercero={esTercero}
                    onEsTerceroChange={setEsTercero}
                    receptorNombre={receptorNombre}
                    onReceptorNombreChange={setReceptorNombre}
                    enviarCorreo={enviarCorreo}
                    onEnviarCorreoChange={setEnviarCorreo}
                    onSubmit={handleEntregar}
                    loading={entregandoId === resultado.brazo.id}
                    disabled={Boolean(entregandoId || revirtiendoId)}
                  />
                ) : null}
              </>
            )}
          </section>
        </div>

        <aside className="entrega-layout__side">
          <section className="panel panel--compact entrega-pendientes">
            <button
              type="button"
              className="entrega-pendientes__toggle"
              onClick={() => setListaAbierta((v) => !v)}
              aria-expanded={listaAbierta}
            >
              <h3 className="panel__title panel__title--sm">
                Pendientes
                {!cargandoPendientes && (
                  <span className="entrega-pendientes__count">{pendientes.length}</span>
                )}
              </h3>
              <span className="entrega-pendientes__chevron" aria-hidden>
                {listaAbierta ? '▾' : '▸'}
              </span>
            </button>

            {listaAbierta && (
              <>
                <div className="entrega-pendientes__filtros entrega-pendientes__filtros--compact">
                  <label>
                    Procesión
                    <select value={filtroCortejo} onChange={(e) => setFiltroCortejo(e.target.value)}>
                      {(cortejos || []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre_evento}
                          {c.estado !== 'activa' ? ' (inact.)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    N.º
                    <input
                      type="number"
                      min="1"
                      value={filtroTurno}
                      onChange={(e) => setFiltroTurno(e.target.value)}
                      placeholder="Todos"
                    />
                  </label>
                  <label className="entrega-pendientes__busqueda">
                    Buscar
                    <input
                      type="search"
                      value={busquedaPendientes}
                      onChange={(e) => setBusquedaPendientes(e.target.value)}
                      placeholder="Nombre, DPI…"
                      autoComplete="off"
                    />
                  </label>
                </div>

                {cargandoPendientes ? (
                  <Loader text="Cargando…" />
                ) : !pendientes.length ? (
                  <p className="text-muted entrega-empty">Sin pendientes con estos filtros.</p>
                ) : (
                  <div className="table-wrap table-wrap--cards">
                    <table className="data-table data-table--compact data-table--stack entrega-pendientes__tabla">
                      <thead>
                        <tr>
                          <th>Turno</th>
                          <th>Persona</th>
                          <th>Pago</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendientes.map((fila) => (
                          <tr
                            key={fila.id}
                            className={
                              resultado?.brazo?.id === fila.id ? 'entrega-pendientes__fila--activa' : ''
                            }
                          >
                            <td data-label="Turno">
                              <strong>#{fila.numeroTurno}</strong>
                              <span className="text-muted entrega-pendientes__honor"> {fila.honor}</span>
                              <div className="text-muted entrega-pendientes__meta">
                                {fila.procesion} · Brazo {fila.brazoLabel}
                              </div>
                            </td>
                            <td data-label="Persona">
                              <strong>{fila.nombre}</strong>
                            </td>
                            <td data-label="Pago">
                              {fila.fechaPago}
                              <span className="text-muted entrega-pendientes__hora"> {fila.horaPago}</span>
                            </td>
                            <td data-label="Acciones">
                              <button
                                type="button"
                                className="btn btn--primary btn--sm btn--block"
                                onClick={() => seleccionarPendiente(fila)}
                              >
                                Abrir
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </section>
        </aside>
      </div>
    </Layout>
  );
}
