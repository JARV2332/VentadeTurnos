import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Layout from '../components/Layout';
import Loader from '../components/Loader';
import CajaReportePanel from '../components/CajaReportePanel';
import AnularBoletaModal from '../components/AnularBoletaModal';
import EditarPagoBoletaModal from '../components/EditarPagoBoletaModal';
import EditDevotoModal from '../components/EditDevotoModal';
import { useAuth } from '../context/AuthContext';
import {
  getFinanzasByOrg,
  subscribeData,
  buscarBoletaPorCodigo,
  anularVentaPorCodigo,
  actualizarPagoPorCodigo,
  updateDevoto,
} from '../services/dataService';
import { labelMetodoPago } from '../utils/pagoUtils';
import {
  filtrarVentasCaja,
  formatQ,
  tiposTurnoDisponibles,
  labelTipoTurno,
  formatFechaReporte,
  fechaVentaKey,
  agruparVentasPorDia,
} from '../utils/cajaReportUtils';
import { fechaHoyKey } from '../utils/dashboardMetricsUtils';
import { formatHoraVentaGt } from '../utils/turnoHorarioUtils';

export default function CajaSaaS() {
  const { organizacionId, organizacion } = useAuth();
  const [finanzas, setFinanzas] = useState(null);
  const [filtroMesa, setFiltroMesa] = useState('all');
  const [filtroVendedor, setFiltroVendedor] = useState('all');
  const [filtroTipoTurno, setFiltroTipoTurno] = useState('all');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [comprobanteVer, setComprobanteVer] = useState(null);
  const [anularAbierto, setAnularAbierto] = useState(false);
  const [codigoAnular, setCodigoAnular] = useState('');
  const [previewAnular, setPreviewAnular] = useState(null);
  const [buscandoAnular, setBuscandoAnular] = useState(false);
  const [anulando, setAnulando] = useState(false);
  const [editarPagoAbierto, setEditarPagoAbierto] = useState(false);
  const [codigoEditarPago, setCodigoEditarPago] = useState('');
  const [previewEditarPago, setPreviewEditarPago] = useState(null);
  const [buscandoEditarPago, setBuscandoEditarPago] = useState(false);
  const [guardandoPago, setGuardandoPago] = useState(false);
  const [okMsg, setOkMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [devotoEditando, setDevotoEditando] = useState(null);
  const [guardandoDevoto, setGuardandoDevoto] = useState(false);
  const [errorDevoto, setErrorDevoto] = useState('');

  const refreshFinanzas = useCallback(async () => {
    try {
      const data = await getFinanzasByOrg(organizacionId);
      setFinanzas({
        ventas: [],
        recaudado: 0,
        presupuestoTotal: 0,
        porMesa: [],
        porVendedor: {},
        porMetodo: { efectivo: 0, transferencia: 0, tarjeta: 0 },
        ...data,
        ventas: Array.isArray(data?.ventas) ? data.ventas : [],
        porMesa: Array.isArray(data?.porMesa) ? data.porMesa : [],
        porVendedor:
          data?.porVendedor && typeof data.porVendedor === 'object' ? data.porVendedor : {},
        porMetodo: data?.porMetodo || { efectivo: 0, transferencia: 0, tarjeta: 0 },
      });
    } catch (err) {
      console.error('Error al cargar finanzas:', err);
      setFinanzas({
        ventas: [],
        recaudado: 0,
        presupuestoTotal: 0,
        porMesa: [],
        porVendedor: {},
        porMetodo: { efectivo: 0, transferencia: 0, tarjeta: 0 },
      });
    }
  }, [organizacionId]);

  useEffect(() => {
    refreshFinanzas();
    return subscribeData(organizacionId, refreshFinanzas);
  }, [organizacionId, refreshFinanzas]);

  const ventasFiltradas = useMemo(() => {
    if (!finanzas?.ventas) return [];
    return filtrarVentasCaja(finanzas.ventas, {
      fechaDesde,
      fechaHasta,
      vendedorId: filtroVendedor,
      tipoTurno: filtroTipoTurno,
      mesaId: filtroMesa,
    });
  }, [finanzas, fechaDesde, fechaHasta, filtroVendedor, filtroTipoTurno, filtroMesa]);

  const tiposTurno = useMemo(
    () => tiposTurnoDisponibles(finanzas?.ventas),
    [finanzas?.ventas]
  );

  const ventasPorDia = useMemo(
    () => agruparVentasPorDia(ventasFiltradas),
    [ventasFiltradas]
  );

  const hoyKey = useMemo(() => fechaHoyKey(), []);
  const esFiltroHoy = fechaDesde === hoyKey && fechaHasta === hoyKey;

  const resumenMetodosDia = useMemo(() => {
    const m = { efectivo: 0, transferencia: 0, tarjeta: 0 };
    ventasFiltradas.forEach((v) => {
      const met = v.metodo_pago || 'efectivo';
      if (m[met] !== undefined) m[met] += Number(v.precio_pagado || 0);
    });
    return m;
  }, [ventasFiltradas]);

  const filtrosMeta = useMemo(() => {
    const mesa =
      filtroMesa !== 'all'
        ? finanzas?.porMesa?.find((m) => m.id === filtroMesa)?.nombre_mesa
        : null;
    const vendedorNombre =
      filtroVendedor !== 'all'
        ? finanzas?.porVendedor?.[filtroVendedor]?.nombre
        : null;
    return {
      fechaDesde,
      fechaHasta,
      vendedorId: filtroVendedor,
      vendedorNombre,
      tipoTurno: filtroTipoTurno,
      mesaId: filtroMesa,
      mesaNombre: mesa,
    };
  }, [fechaDesde, fechaHasta, filtroVendedor, filtroTipoTurno, filtroMesa, finanzas]);

  const abrirAnular = (codigo = '') => {
    setErrorMsg('');
    setOkMsg('');
    setPreviewAnular(null);
    setCodigoAnular(codigo || '');
    setAnularAbierto(true);
  };

  const cerrarAnular = () => {
    if (anulando) return;
    setAnularAbierto(false);
    setPreviewAnular(null);
    setCodigoAnular('');
  };

  const handleBuscarAnular = async (codigo) => {
    setErrorMsg('');
    setBuscandoAnular(true);
    try {
      const res = await buscarBoletaPorCodigo(organizacionId, codigo);
      setPreviewAnular(res);
    } finally {
      setBuscandoAnular(false);
    }
  };

  const handleConfirmarAnular = async ({ codigo, motivo }) => {
    setErrorMsg('');
    setAnulando(true);
    try {
      const res = await anularVentaPorCodigo(organizacionId, codigo, motivo);
      if (res.error) {
        setPreviewAnular((prev) => ({ ...(prev || {}), error: res.error }));
        return;
      }
      setAnularAbierto(false);
      setPreviewAnular(null);
      setCodigoAnular('');
      setOkMsg(
        `Boleta anulada. ${res.data?.brazos_liberados || 1} espacio(s) liberado(s) en Taquilla.`
      );
      await refreshFinanzas();
    } finally {
      setAnulando(false);
    }
  };

  const handleGuardarDevoto = async (datos) => {
    if (!devotoEditando?.id) return;
    setErrorDevoto('');
    setGuardandoDevoto(true);
    try {
      const res = await updateDevoto(organizacionId, devotoEditando.id, datos);
      if (res.error) {
        setErrorDevoto(res.error);
        return;
      }
      setDevotoEditando(null);
      setOkMsg(`Datos de ${res.data.nombre_completo} actualizados.`);
    } finally {
      setGuardandoDevoto(false);
    }
  };

  const abrirEditarDevotoDesdeAnular = () => {
    if (!previewAnular?.cargador) return;
    setErrorDevoto('');
    setDevotoEditando(previewAnular.cargador);
  };

  const abrirEditarPago = (codigo = '') => {
    setErrorMsg('');
    setOkMsg('');
    setPreviewEditarPago(null);
    setCodigoEditarPago(codigo || '');
    setEditarPagoAbierto(true);
  };

  const cerrarEditarPago = () => {
    if (guardandoPago) return;
    setEditarPagoAbierto(false);
    setPreviewEditarPago(null);
    setCodigoEditarPago('');
  };

  const handleBuscarEditarPago = async (codigo) => {
    setErrorMsg('');
    setBuscandoEditarPago(true);
    try {
      const res = await buscarBoletaPorCodigo(organizacionId, codigo);
      setPreviewEditarPago(res);
    } finally {
      setBuscandoEditarPago(false);
    }
  };

  const handleConfirmarEditarPago = async ({ codigo, metodo_pago, comprobante_url }) => {
    setErrorMsg('');
    setGuardandoPago(true);
    try {
      const res = await actualizarPagoPorCodigo(organizacionId, codigo, {
        metodo_pago,
        comprobante_url,
      });
      if (res.error) {
        setPreviewEditarPago((prev) => ({ ...(prev || {}), error: res.error }));
        return;
      }
      setEditarPagoAbierto(false);
      setPreviewEditarPago(null);
      setCodigoEditarPago('');
      setOkMsg(`Pago actualizado a ${labelMetodoPago(res.data?.metodo_pago || metodo_pago)}.`);
      await refreshFinanzas();
    } finally {
      setGuardandoPago(false);
    }
  };

  if (!finanzas) {
    return (
      <Layout title="Caja y Finanzas" subtitle="Cuadre, análisis y reportes">
        <Loader text="Cargando finanzas..." />
      </Layout>
    );
  }

  const totalFiltrado = ventasFiltradas.reduce((s, v) => s + Number(v.precio_pagado || 0), 0);
  const pendiente = finanzas.presupuestoTotal - finanzas.recaudado;

  const limpiarFiltros = () => {
    setFechaDesde('');
    setFechaHasta('');
    setFiltroMesa('all');
    setFiltroVendedor('all');
    setFiltroTipoTurno('all');
  };

  const filtrarHoy = () => {
    const hoy = fechaHoyKey();
    setFechaDesde(hoy);
    setFechaHasta(hoy);
  };

  return (
    <Layout title="Caja y Finanzas" subtitle="Cuadre, análisis y reportes de ventas">
      {okMsg && <div className="alert alert--success">{okMsg}</div>}
      {errorMsg && !anularAbierto && !editarPagoAbierto && (
        <div className="alert alert--error">{errorMsg}</div>
      )}

      <div className="metrics-grid metrics-grid--3">
        <div className="metric-card">
          <span className="metric-card__label">Efectivo (global)</span>
          <strong className="metric-card__value">{formatQ(finanzas.porMetodo?.efectivo || 0)}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-card__label">Transferencia (global)</span>
          <strong className="metric-card__value">
            {formatQ(finanzas.porMetodo?.transferencia || 0)}
          </strong>
        </div>
        <div className="metric-card">
          <span className="metric-card__label">Tarjeta (global)</span>
          <strong className="metric-card__value">{formatQ(finanzas.porMetodo?.tarjeta || 0)}</strong>
        </div>
      </div>

      <div className="metrics-grid metrics-grid--3">
        <div className="metric-card metric-card--primary">
          <span className="metric-card__label">Recaudado (global)</span>
          <strong className="metric-card__value">{formatQ(finanzas.recaudado)}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-card__label">Presupuesto total</span>
          <strong className="metric-card__value">{formatQ(finanzas.presupuestoTotal)}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-card__label">Pendiente por cobrar</span>
          <strong className="metric-card__value">{formatQ(pendiente)}</strong>
        </div>
      </div>

      <div className="caja-filters caja-filters--reporte">
        <div className="caja-filters__fechas">
          <button
            type="button"
            className={`btn btn--sm ${esFiltroHoy ? 'btn--primary' : 'btn--ghost'}`}
            onClick={filtrarHoy}
          >
            Hoy
          </button>
          <label>
            Desde
            <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
          </label>
          <label>
            Hasta
            <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
          </label>
        </div>
        <label>
          Vendedor / operador
          <select value={filtroVendedor} onChange={(e) => setFiltroVendedor(e.target.value)}>
            <option value="all">Todos</option>
            {Object.keys(finanzas.porVendedor || {}).map((vid) => (
              <option key={vid} value={vid}>
                {finanzas.porVendedor[vid]?.nombre || vid}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tipo de turno
          <select value={filtroTipoTurno} onChange={(e) => setFiltroTipoTurno(e.target.value)}>
            <option value="all">Todos</option>
            {tiposTurno.map((t) => (
              <option key={t} value={t}>
                {labelTipoTurno(t)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Mesa
          <select value={filtroMesa} onChange={(e) => setFiltroMesa(e.target.value)}>
            <option value="all">Todas</option>
            {(finanzas.porMesa || []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre_mesa}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn btn--ghost btn--sm caja-filters__clear"
          onClick={limpiarFiltros}
        >
          Limpiar filtros
        </button>
        <div className="caja-filters__total">
          Filtrado: <strong>{ventasFiltradas.length}</strong> ventas ·{' '}
          <strong>{formatQ(totalFiltrado)}</strong>
        </div>
      </div>

      {esFiltroHoy && (
        <div className="metrics-grid metrics-grid--3 caja-cierre-hoy no-print">
          <div className="metric-card metric-card--primary">
            <span className="metric-card__label">Cierre de hoy — ventas</span>
            <strong className="metric-card__value">{ventasFiltradas.length}</strong>
            <small>Total {formatQ(totalFiltrado)}</small>
          </div>
          <div className="metric-card">
            <span className="metric-card__label">Efectivo hoy</span>
            <strong className="metric-card__value">{formatQ(resumenMetodosDia.efectivo)}</strong>
          </div>
          <div className="metric-card">
            <span className="metric-card__label">Transferencia / tarjeta</span>
            <strong className="metric-card__value">
              {formatQ(resumenMetodosDia.transferencia + resumenMetodosDia.tarjeta)}
            </strong>
            <small>
              Transf. {formatQ(resumenMetodosDia.transferencia)} · Tarj.{' '}
              {formatQ(resumenMetodosDia.tarjeta)}
            </small>
          </div>
        </div>
      )}

      <CajaReportePanel
        ventasFiltradas={ventasFiltradas}
        filtrosMeta={filtrosMeta}
        orgNombre={organizacion?.nombre_oficial || ''}
      />

      <section className="panel caja-anular-panel">
        <div className="caja-anular-panel__head">
          <div>
            <h3 className="panel__title">Editar pago de boleta</h3>
            <p className="text-muted config-hint">
              Corrija efectivo, transferencia o tarjeta por código VT- o VR-. Transferencia y
              tarjeta requieren subir comprobante.
            </p>
          </div>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => abrirEditarPago()}>
            Editar pago…
          </button>
        </div>
      </section>

      <section className="panel caja-anular-panel">
        <div className="caja-anular-panel__head">
          <div>
            <h3 className="panel__title">Anular boleta</h3>
            <p className="text-muted config-hint">
              Libera el turno en Taquilla si hubo error de venta. No se puede anular si el turno ya
              fue entregado al devoto(a).
            </p>
          </div>
          <button type="button" className="btn btn--danger btn--sm" onClick={() => abrirAnular()}>
            Anular boleta…
          </button>
        </div>
      </section>

      <div className="caja-grid">
        <section className="panel">
          <h3 className="panel__title">Cierre por mesa</h3>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mesa</th>
                  <th>Estado</th>
                  <th>Ventas</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {(finanzas.porMesa || []).map((m) => (
                  <tr key={m.id}>
                    <td>
                      <strong>{m.nombre_mesa}</strong>
                    </td>
                    <td>{m.estado}</td>
                    <td>{m.ventas}</td>
                    <td>{formatQ(m.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <h3 className="panel__title">Cierre por vendedor</h3>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Vendedor</th>
                  <th>Ventas</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(finanzas.porVendedor || {}).map(([vid, data]) => (
                  <tr key={vid}>
                    <td>
                      <strong>{data.nombre || vid}</strong>
                    </td>
                    <td>{data.ventas}</td>
                    <td>{formatQ(data.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="panel">
        <h3 className="panel__title">Detalle de ventas ({ventasFiltradas.length})</h3>
        <p className="text-muted config-hint caja-detalle-hint">
          Ordenado por fecha y hora de venta (día a día, de la más temprana a la más reciente).
        </p>
        <div className="table-wrap table-wrap--cards">
          <table className="data-table data-table--stack">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Hora</th>
                <th>Turno</th>
                <th>Tipo</th>
                <th>Boleta</th>
                <th>Operador</th>
                <th>Pago</th>
                <th>Comprobante</th>
                <th>Ofrenda</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {ventasPorDia.map((grupo) => (
                <React.Fragment key={grupo.fechaKey}>
                  <tr className="caja-detalle__dia">
                    <td colSpan={10}>
                      <strong>{grupo.fechaLabel}</strong>
                      <span className="text-muted">
                        {' '}
                        · {grupo.ventas.length} venta(s) ·{' '}
                        {formatQ(grupo.ventas.reduce((s, v) => s + Number(v.precio_pagado || 0), 0))}
                      </span>
                    </td>
                  </tr>
                  {grupo.ventas.map((v) => (
                <tr key={v.id}>
                  <td data-label="Fecha">{formatFechaReporte(fechaVentaKey(v))}</td>
                  <td data-label="Hora">{formatHoraVentaGt(v.pago_confirmado_en || v.updated_at) || '—'}</td>
                  <td data-label="Turno">#{v.numero_turno}</td>
                  <td data-label="Tipo">{labelTipoTurno(v.tipo_turno)}</td>
                  <td data-label="Boleta">
                    <code>{v.codigo_boleta_qr}</code>
                  </td>
                  <td data-label="Operador">{v.operador_nombre || '—'}</td>
                  <td data-label="Pago">{labelMetodoPago(v.metodo_pago)}</td>
                  <td data-label="Comprobante">
                    {v.comprobante_url ? (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => setComprobanteVer(v)}
                      >
                        Ver foto
                      </button>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td data-label="Ofrenda">{formatQ(v.precio_pagado)}</td>
                  <td data-label="Acciones">
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => abrirEditarPago(v.codigo_boleta_qr)}
                    >
                      Editar pago
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm btn--danger-text"
                      onClick={() => abrirAnular(v.codigo_boleta_qr)}
                    >
                      Anular
                    </button>
                  </td>
                </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {comprobanteVer && (
        <div className="modal-overlay" onClick={() => setComprobanteVer(null)} role="presentation">
          <div className="modal-comprobante" onClick={(e) => e.stopPropagation()} role="dialog">
            <h3>Comprobante de pago</h3>
            <p className="text-muted">
              {labelMetodoPago(comprobanteVer.metodo_pago)} · {comprobanteVer.codigo_boleta_qr}
            </p>
            <img src={comprobanteVer.comprobante_url} alt="Comprobante" />
            <button type="button" className="btn btn--primary" onClick={() => setComprobanteVer(null)}>
              Cerrar
            </button>
          </div>
        </div>
      )}

      {editarPagoAbierto && (
        <EditarPagoBoletaModal
          preview={previewEditarPago}
          buscando={buscandoEditarPago}
          guardando={guardandoPago}
          codigoInicial={codigoEditarPago}
          onBuscar={handleBuscarEditarPago}
          onGuardar={handleConfirmarEditarPago}
          onCerrar={cerrarEditarPago}
        />
      )}

      {anularAbierto && (
        <AnularBoletaModal
          preview={previewAnular}
          buscando={buscandoAnular}
          anulando={anulando}
          codigoInicial={codigoAnular}
          onBuscar={handleBuscarAnular}
          onAnular={handleConfirmarAnular}
          onEditDevoto={previewAnular?.cargador ? abrirEditarDevotoDesdeAnular : undefined}
          onCerrar={cerrarAnular}
        />
      )}

      <EditDevotoModal
        abierto={Boolean(devotoEditando)}
        devoto={devotoEditando}
        guardando={guardandoDevoto}
        errorGuardar={errorDevoto}
        onGuardar={handleGuardarDevoto}
        onCerrar={() => !guardandoDevoto && setDevotoEditando(null)}
      />
    </Layout>
  );
}
