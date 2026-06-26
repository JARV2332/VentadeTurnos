import React, { useState, useCallback, useEffect, useMemo } from 'react';
import Layout from '../components/Layout';
import BoletaCard from '../components/BoletaCard';
import QrScanner from '../components/QrScanner';
import StatusBadge from '../components/StatusBadge';
import Loader from '../components/Loader';
import { useAuth } from '../context/AuthContext';
import {
  buscarBoletaPorCodigo,
  marcarEntregado,
  getBrazosVendidosByOrg,
  getCortejosByOrg,
  getCargadoresByOrg,
  getComprasByOrg,
  getTurnosByIds,
  subscribeData,
} from '../services/dataService';
import { extraerCodigoBoleta } from '../utils/boletaUtils';
import { construirFilasPendientesEntrega } from '../utils/entregaPendientesUtils';

export default function EntregaTurno() {
  const { organizacionId, organizacion, user } = useAuth();
  const [codigoManual, setCodigoManual] = useState('');
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [scannerOn, setScannerOn] = useState(true);

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

  const cortejosPorId = useMemo(
    () => Object.fromEntries(cortejos.map((c) => [c.id, c])),
    [cortejos]
  );

  const cargarPendientes = useCallback(async () => {
    if (!organizacionId) return;
    setCargandoPendientes(true);
    try {
      const [cortejosData, vendidos, cargadores, compras] = await Promise.all([
        getCortejosByOrg(organizacionId, { incluirInactivas: true }),
        getBrazosVendidosByOrg(organizacionId),
        getCargadoresByOrg(organizacionId),
        getComprasByOrg(organizacionId),
      ]);
      setCortejos(cortejosData || []);
      setBrazosVendidos(vendidos || []);
      setCargadoresPorId(Object.fromEntries((cargadores || []).map((c) => [c.id, c])));
      setComprasPorId(Object.fromEntries((compras || []).map((c) => [c.id, c])));

      const turnoIds = [...new Set((vendidos || []).map((b) => b.turno_id).filter(Boolean))];
      const turnos = turnoIds.length ? await getTurnosByIds(turnoIds) : [];
      setTurnosPorId(Object.fromEntries((turnos || []).map((t) => [t.id, t])));

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

  const handleEntregar = async (brazoIdOverride) => {
    const brazoId = brazoIdOverride || resultado?.brazo?.id;
    if (!brazoId) return;
    setError('');
    setEntregandoId(brazoId);
    const res = await marcarEntregado(brazoId, organizacionId, user?.authUserId || user?.id);
    setEntregandoId(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    const nombre =
      resultado?.cargador?.nombre_completo ||
      cargadoresPorId[res.data?.cargador_id]?.nombre_completo ||
      'devoto(a)';
    setOkMsg(`Turno entregado correctamente a ${nombre}.`);
    if (resultado?.brazo?.id === brazoId) {
      setResultado({
        ...resultado,
        brazo: res.data,
      });
    }
    cargarPendientes();
  };

  const yaEntregado = resultado?.brazo?.estado_entrega === 'entregado';

  return (
    <Layout
      title="Entrega de turnos"
      subtitle="Escanee el QR o use el listado de pendientes para entregar turnos pagados"
    >
      {okMsg && <div className="alert alert--success">{okMsg}</div>}
      {error && <div className="alert alert--error">{error}</div>}

      <section className="panel entrega-pendientes">
        <h3 className="panel__title">
          Pendientes de entrega
          {!cargandoPendientes && (
            <span className="entrega-pendientes__count">{pendientes.length}</span>
          )}
        </h3>
        <p className="text-muted config-hint">
          Turnos <strong>pagados</strong> que aún no se han entregado en físico. Filtre por procesión
          o turno y busque por nombre o DPI.
        </p>
        <div className="entrega-pendientes__filtros">
          <label>
            Procesión
            <select value={filtroCortejo} onChange={(e) => setFiltroCortejo(e.target.value)}>
              {(cortejos || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre_evento}
                  {c.estado !== 'activa' ? ' (inactiva)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            N.º turno
            <input
              type="number"
              min="1"
              value={filtroTurno}
              onChange={(e) => setFiltroTurno(e.target.value)}
              placeholder="Todos"
            />
          </label>
          <label className="entrega-pendientes__busqueda">
            Buscar nombre / DPI
            <input
              type="search"
              value={busquedaPendientes}
              onChange={(e) => setBusquedaPendientes(e.target.value)}
              placeholder="Nombre o DPI…"
              autoComplete="off"
            />
          </label>
        </div>

        {cargandoPendientes ? (
          <Loader text="Cargando pendientes…" />
        ) : !pendientes.length ? (
          <p className="text-muted">No hay turnos pendientes de entrega con estos filtros.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table data-table--compact entrega-pendientes__tabla">
              <thead>
                <tr>
                  <th>Procesión</th>
                  <th>Turno</th>
                  <th>Brazo</th>
                  <th>Persona</th>
                  <th>Pago</th>
                  <th>Boleta</th>
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
                    <td>{fila.procesion}</td>
                    <td>
                      <strong>#{fila.numeroTurno}</strong>
                      <span className="text-muted entrega-pendientes__honor"> {fila.honor}</span>
                    </td>
                    <td>{fila.brazoLabel}</td>
                    <td>
                      <strong>{fila.nombre}</strong>
                    </td>
                    <td>
                      {fila.fechaPago}
                      <span className="text-muted entrega-pendientes__hora"> {fila.horaPago}</span>
                    </td>
                    <td>
                      <code>{fila.codigoBoleta}</code>
                    </td>
                    <td className="entrega-pendientes__acciones">
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => seleccionarPendiente(fila)}
                      >
                        Ver
                      </button>
                      <button
                        type="button"
                        className="btn btn--primary btn--sm"
                        disabled={entregandoId === fila.id}
                        onClick={() => handleEntregar(fila.id)}
                      >
                        {entregandoId === fila.id ? 'Entregando…' : 'Entregar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="entrega-grid">
        <section className="panel">
          <h3 className="panel__title">Escanear QR</h3>
          {scannerOn ? (
            <QrScanner onScan={handleScan} active={scannerOn} />
          ) : (
            <div className="entrega-scanner-off">
              <p className="text-muted">Escaneo pausado tras lectura exitosa.</p>
              <button type="button" className="btn btn--ghost" onClick={() => setScannerOn(true)}>
                Activar cámara de nuevo
              </button>
            </div>
          )}

          <div className="entrega-manual">
            <label>
              O ingrese el código manualmente
              <input
                type="text"
                placeholder="VT-DEMO0001"
                value={codigoManual}
                onChange={(e) => setCodigoManual(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && buscar(codigoManual)}
              />
            </label>
            <button type="button" className="btn btn--primary" onClick={() => buscar(codigoManual)}>
              Validar boleta
            </button>
          </div>
        </section>

        <section className="panel">
          <h3 className="panel__title">Resultado de validación</h3>

          {!resultado ? (
            <p className="text-muted">
              Escanee, busque en el listado o ingrese el código QR de la boleta para verificar que
              la compra es válida y proceder con la entrega del turno de cartulina.
            </p>
          ) : (
            <>
              <div className="entrega-status">
                {yaEntregado ? (
                  <StatusBadge status="entregado" />
                ) : (
                  <StatusBadge status="pendiente_entrega" />
                )}
                <span>
                  {yaEntregado
                    ? `Entregado el ${new Date(resultado.brazo.entregado_en).toLocaleString('es-GT')}`
                    : 'Pago confirmado — pendiente de entrega física'}
                </span>
              </div>

              <BoletaCard
                organizacion={organizacion}
                cortejo={resultado.cortejo}
                turno={resultado.turno}
                cargador={resultado.cargador}
                brazo={resultado.brazo}
                showEntrega
              />

              {!yaEntregado && (
                <button
                  type="button"
                  className="btn btn--primary btn--block entrega-btn"
                  disabled={entregandoId === resultado.brazo.id}
                  onClick={() => handleEntregar()}
                >
                  {entregandoId === resultado.brazo.id
                    ? 'Confirmando…'
                    : 'Confirmar entrega del turno'}
                </button>
              )}

              {yaEntregado && (
                <div className="info-box">
                  Este turno ya fue entregado. No es necesario volver a procesarlo.
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </Layout>
  );
}
