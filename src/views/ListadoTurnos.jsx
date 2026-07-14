import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Layout from '../components/Layout';
import Loader from '../components/Loader';
import VerBoletaModal from '../components/VerBoletaModal';
import ImprimirBoletasMasivoModal from '../components/ImprimirBoletasMasivoModal';
import { useAuth } from '../context/AuthContext';
import {
  getCortejosByOrg,
  getTurnosAgrupados,
  getComprasByOrg,
  getUsuariosByOrg,
  buscarBoletaPorCodigo,
  subscribeData,
} from '../services/dataService';
import { labelTipoTurno } from '../utils/cajaReportUtils';
import { construirMapaUsuariosAuth } from '../utils/operadorVentaUtils';
import {
  construirListadoTurnos,
  tiposTurnoEnListado,
  exportListadoTurnosExcel,
  exportListadoTurnosPdf,
} from '../utils/listadoTurnosUtils';
import { construirEnlaceBoletaWhatsapp } from '../utils/whatsappUtils';
import {
  resolverCortejoInicial,
  cambiarCortejoPreferido,
} from '../utils/cortejoPreferidoUtils';
import { fechaHoyKey } from '../utils/dashboardMetricsUtils';
import {
  cargarBoletasPorCodigos,
  codigosBoletaDesdeFilas,
} from '../utils/imprimirBoletasUtils';

export default function ListadoTurnos() {
  const { organizacionId, organizacion } = useAuth();
  const [cortejos, setCortejos] = useState([]);
  const [cortejoId, setCortejoId] = useState('');
  const [turnosAgrupados, setTurnosAgrupados] = useState([]);
  const [comprasPorId, setComprasPorId] = useState({});
  const [mapaUsuarios, setMapaUsuarios] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [filtroTipo, setFiltroTipo] = useState('all');
  const [filtroNumero, setFiltroNumero] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('asignado');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [soloAsignados, setSoloAsignados] = useState(true);

  const [boletaModal, setBoletaModal] = useState(null);
  const [boletasMasivas, setBoletasMasivas] = useState(null);
  const [tituloMasivo, setTituloMasivo] = useState('');
  const [cargandoBoleta, setCargandoBoleta] = useState(false);
  const [boletaError, setBoletaError] = useState('');

  const cargarCortejos = useCallback(async () => {
    try {
      const data = await getCortejosByOrg(organizacionId, { incluirInactivas: true });
      setCortejos(data || []);
      setCortejoId((prev) => resolverCortejoInicial(data, organizacionId, prev));
    } catch (err) {
      setError(err.message || 'No se pudieron cargar las procesiones.');
    }
  }, [organizacionId]);

  const cargarTurnos = useCallback(async () => {
    if (!cortejoId) return;
    setCargando(true);
    setError('');
    try {
      const [turnos, compras, usuarios] = await Promise.all([
        getTurnosAgrupados(cortejoId, organizacionId),
        getComprasByOrg(organizacionId),
        getUsuariosByOrg(organizacionId),
      ]);
      setTurnosAgrupados(turnos || []);
      setComprasPorId(Object.fromEntries((compras || []).map((c) => [c.id, c])));
      setMapaUsuarios(construirMapaUsuariosAuth(usuarios || []));
    } catch (err) {
      setError(err.message || 'No se pudo cargar el listado.');
      setTurnosAgrupados([]);
    } finally {
      setCargando(false);
    }
  }, [cortejoId, organizacionId]);

  useEffect(() => {
    cargarCortejos();
  }, [cargarCortejos]);

  useEffect(() => {
    cargarTurnos();
    return subscribeData(organizacionId, cargarTurnos, 2000);
  }, [organizacionId, cargarTurnos]);

  const cortejoSel = useMemo(
    () => cortejos.find((c) => c.id === cortejoId) || null,
    [cortejos, cortejoId]
  );

  const tiposTurno = useMemo(() => tiposTurnoEnListado(turnosAgrupados), [turnosAgrupados]);

  const grupos = useMemo(
    () =>
      construirListadoTurnos(turnosAgrupados, comprasPorId, {
        tipoTurno: filtroTipo,
        numeroTurno: filtroNumero,
        estado: filtroEstado,
        fechaDesde,
        fechaHasta,
        soloAsignados,
        soloPagadosEnFecha: Boolean(fechaDesde || fechaHasta),
        ocultarVacios: soloAsignados || filtroEstado !== 'all',
      }, mapaUsuarios),
    [
      turnosAgrupados,
      comprasPorId,
      mapaUsuarios,
      filtroTipo,
      filtroNumero,
      filtroEstado,
      fechaDesde,
      fechaHasta,
      soloAsignados,
    ]
  );

  const totalFilas = useMemo(
    () => grupos.reduce((s, g) => s + g.filas.length, 0),
    [grupos]
  );

  const abrirBoleta = async (fila) => {
    const codigo = fila.codigoBusqueda;
    if (!codigo) return;
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

  const imprimirBoletas = async (filas, titulo) => {
    const codigos = codigosBoletaDesdeFilas(filas);
    if (!codigos.length) {
      setBoletaError('No hay boletas pagadas para imprimir en esta selección.');
      return;
    }
    setCargandoBoleta(true);
    setBoletaError('');
    try {
      const boletas = await cargarBoletasPorCodigos(
        organizacionId,
        codigos,
        buscarBoletaPorCodigo
      );
      if (!boletas.length) {
        setBoletaError('No se pudieron cargar las boletas.');
        return;
      }
      setTituloMasivo(titulo);
      setBoletasMasivas(boletas);
    } catch (err) {
      setBoletaError(err.message || 'Error al preparar impresión masiva.');
    } finally {
      setCargandoBoleta(false);
    }
  };

  const reenviarWhatsapp = async (fila) => {
    const codigo = fila.codigoBusqueda;
    if (!codigo) return;
    setBoletaError('');
    try {
      const res = await buscarBoletaPorCodigo(organizacionId, codigo);
      if (res.error) {
        setBoletaError(res.error);
        return;
      }
      const enlace = construirEnlaceBoletaWhatsapp({
        cargador: res.cargador,
        brazo: res.brazo,
        turno: res.turno,
        cortejo: res.cortejo,
        organizacion,
        items: res.items,
        compra: res.compra,
      });
      if (enlace) {
        window.open(enlace, '_blank', 'noopener,noreferrer');
      } else {
        setBoletaError('No hay WhatsApp válido para enviar la boleta.');
      }
    } catch (err) {
      setBoletaError(err.message || 'No se pudo preparar el mensaje de WhatsApp.');
    }
  };

  const filasPagadasVisibles = useMemo(
    () => grupos.flatMap((g) => g.filas.filter((f) => f.puedeVerBoleta)),
    [grupos]
  );

  const esFiltroHoy =
    fechaDesde === fechaHasta &&
    fechaDesde === fechaHoyKey() &&
    Boolean(fechaDesde);

  const limpiarFiltros = () => {
    setFiltroTipo('all');
    setFiltroNumero('');
    setFiltroEstado('asignado');
    setFechaDesde('');
    setFechaHasta('');
    setSoloAsignados(true);
  };

  const handleExportExcel = () => {
    exportListadoTurnosExcel({
      grupos,
      cortejoNombre: cortejoSel?.nombre_evento,
      orgNombre: organizacion?.nombre_oficial,
    });
  };

  const handleExportPdf = () => {
    exportListadoTurnosPdf({
      grupos,
      cortejoNombre: cortejoSel?.nombre_evento,
      orgNombre: organizacion?.nombre_oficial,
      filtros: {
        tipoTurno: filtroTipo,
        numeroTurno: filtroNumero,
        estado: filtroEstado,
        fechaDesde,
        fechaHasta,
      },
    });
  };

  return (
    <Layout
      title="Listado de turnos"
      subtitle="Personas asignadas por turno, pago, fecha de operación y boleta"
    >
      <section className="panel listado-turnos__filtros no-print">
        <h3 className="panel__title">Filtros</h3>
        <div className="listado-turnos__filtros-grid">
          <label>
            Procesión
            <select
              value={cortejoId}
              onChange={(e) => cambiarCortejoPreferido(organizacionId, e.target.value, setCortejoId)}
            >
              {cortejos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre_evento}
                  {c.estado !== 'activa' ? ' (inactiva)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tipo de turno
            <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
              <option value="all">Todos</option>
              {tiposTurno.map((t) => (
                <option key={t} value={t}>
                  {labelTipoTurno(t)}
                </option>
              ))}
            </select>
          </label>
          <label>
            N.º turno
            <input
              type="number"
              min="1"
              value={filtroNumero}
              onChange={(e) => setFiltroNumero(e.target.value)}
              placeholder="Todos"
            />
          </label>
          <label>
            Estado
            <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
              <option value="asignado">Pagados y apartados</option>
              <option value="vendido">Solo pagados</option>
              <option value="apartado">Solo apartados</option>
              <option value="all">Todos los brazos</option>
            </select>
          </label>
          <label>
            Operación desde
            <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
          </label>
          <label>
            Operación hasta
            <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
          </label>
        </div>
        <div className="listado-turnos__acciones">
          <label className="listado-turnos__check">
            <input
              type="checkbox"
              checked={soloAsignados}
              onChange={(e) => setSoloAsignados(e.target.checked)}
            />
            Ocultar brazos libres
          </label>
          <button type="button" className="btn btn--ghost btn--sm" onClick={limpiarFiltros}>
            Limpiar filtros
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={handleExportExcel}
            disabled={!totalFilas}
          >
            Exportar Excel
          </button>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={handleExportPdf}
            disabled={!totalFilas}
          >
            Imprimir / Guardar PDF
          </button>
          {filasPagadasVisibles.length > 0 && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={cargandoBoleta}
              onClick={() =>
                imprimirBoletas(
                  filasPagadasVisibles,
                  esFiltroHoy ? 'Boletas del día' : 'Boletas del listado filtrado'
                )
              }
            >
              {cargandoBoleta ? 'Cargando…' : 'Imprimir boletas (filtro)'}
            </button>
          )}
        </div>
        <p className="text-muted config-hint listado-turnos__resumen">
          {cortejoSel?.nombre_evento || '—'} · <strong>{totalFilas}</strong> registro(s) en{' '}
          <strong>{grupos.length}</strong> turno(s), ordenados por fecha y hora de operación (más
          antiguo primero). Excel descarga directo; PDF abre el reporte compacto (elija{' '}
          <strong>Guardar como PDF</strong> en el diálogo).
        </p>
      </section>

      {error && <div className="alert alert--error no-print">{error}</div>}
      {boletaError && <div className="alert alert--error no-print">{boletaError}</div>}

      {cargando ? (
        <Loader text="Cargando turnos…" />
      ) : !grupos.length ? (
        <section className="panel">
          <p className="text-muted">No hay turnos que coincidan con los filtros seleccionados.</p>
        </section>
      ) : (
        <div className="listado-turnos__grupos">
          {grupos.map((grupo) => (
            <section key={grupo.turno.id} className="panel listado-turnos__grupo">
              <h3 className="panel__title listado-turnos__grupo-titulo">
                Turno #{grupo.numero} · {grupo.honor}
                <span className="text-muted listado-turnos__grupo-count">
                  {grupo.filas.length} asignación(es)
                </span>
                {grupo.filas.some((f) => f.puedeVerBoleta) && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm listado-turnos__imprimir-turno no-print"
                    disabled={cargandoBoleta}
                    onClick={() =>
                      imprimirBoletas(
                        grupo.filas.filter((f) => f.puedeVerBoleta),
                        `Boletas turno #${grupo.numero}`
                      )
                    }
                  >
                    Imprimir boletas del turno
                  </button>
                )}
              </h3>
              <div className="table-wrap">
                <table className="data-table data-table--compact listado-turnos__tabla">
                  <thead>
                    <tr>
                      <th>Brazo</th>
                      <th>Persona</th>
                      <th>Estado</th>
                      <th>Entrega</th>
                      <th>Fecha operación</th>
                      <th>Hora</th>
                      <th>Operador</th>
                      <th>Pago</th>
                      <th>Boleta</th>
                      <th>Ofrenda</th>
                      <th className="no-print">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupo.filas.map((fila) => (
                      <tr key={fila.id}>
                        <td>{fila.brazoLabel}</td>
                        <td>
                          <strong>{fila.nombre}</strong>
                        </td>
                        <td>
                          <span className={`consulta-devoto__estado ${fila.estadoClass}`}>
                            {fila.estadoLabel}
                          </span>
                        </td>
                        <td>
                          <span className={`consulta-devoto__estado ${fila.entregaClass}`}>
                            {fila.entregaLabel}
                          </span>
                        </td>
                        <td>{fila.fechaOperacion}</td>
                        <td>{fila.horaOperacion}</td>
                        <td>{fila.operador}</td>
                        <td>{fila.metodoPago}</td>
                        <td>
                          <code>{fila.codigoBoleta}</code>
                        </td>
                        <td>{fila.ofrenda}</td>
                        <td className="no-print">
                          {fila.puedeVerBoleta ? (
                            <div className="consulta-devoto__acciones-fila">
                              <button
                                type="button"
                                className="btn btn--ghost btn--sm"
                                disabled={cargandoBoleta}
                                onClick={() => abrirBoleta(fila)}
                              >
                                Ver boleta
                              </button>
                              {fila.cargador?.whatsapp && (
                                <button
                                  type="button"
                                  className="btn btn--ghost btn--sm consulta-devoto__btn-wa"
                                  onClick={() => reenviarWhatsapp(fila)}
                                >
                                  WhatsApp
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}

      <VerBoletaModal
        abierto={Boolean(boletaModal)}
        boleta={boletaModal}
        organizacion={organizacion}
        onCerrar={() => setBoletaModal(null)}
      />

      <ImprimirBoletasMasivoModal
        abierto={Boolean(boletasMasivas?.length)}
        boletas={boletasMasivas || []}
        organizacion={organizacion}
        titulo={tituloMasivo}
        onCerrar={() => setBoletasMasivas(null)}
      />
    </Layout>
  );
}
