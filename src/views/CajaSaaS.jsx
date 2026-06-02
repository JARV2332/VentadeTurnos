import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import Loader from '../components/Loader';
import { useAuth } from '../context/AuthContext';
import { getFinanzasByOrg, subscribeMock } from '../services/mockService';
import { labelMetodoPago } from '../utils/pagoUtils';

const VENDEDOR_NOMBRES = {
  'user-vendedor-001': 'Carlos Vendedor',
  'user-vendedor-002': 'Mesa Lateral',
  'user-admin-001': 'María Administradora',
};

export default function CajaSaaS() {
  const { organizacionId } = useAuth();
  const [finanzas, setFinanzas] = useState(null);
  const [filtroMesa, setFiltroMesa] = useState('all');
  const [filtroVendedor, setFiltroVendedor] = useState('all');
  const [comprobanteVer, setComprobanteVer] = useState(null);

  useEffect(() => {
    const refresh = () => setFinanzas(getFinanzasByOrg(organizacionId));
    refresh();
    return subscribeMock(refresh);
  }, [organizacionId]);

  const formatQ = (n) =>
    new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(n);

  if (!finanzas) {
    return (
      <Layout title="Caja y Finanzas" subtitle="Cuadre por mesa y vendedor">
        <Loader text="Cargando finanzas..." />
      </Layout>
    );
  }

  let ventasFiltradas = finanzas.ventas;
  if (filtroMesa !== 'all') {
    ventasFiltradas = ventasFiltradas.filter((v) => v.mesa_id === filtroMesa);
  }
  if (filtroVendedor !== 'all') {
    ventasFiltradas = ventasFiltradas.filter((v) => v.vendedor_id === filtroVendedor);
  }

  const totalFiltrado = ventasFiltradas.reduce((s, v) => s + Number(v.precio_pagado || 0), 0);
  const pendiente = finanzas.presupuestoTotal - finanzas.recaudado;

  return (
    <Layout title="Caja y Finanzas" subtitle="Cuadre por mesa y vendedor">
      <div className="metrics-grid metrics-grid--3">
        <div className="metric-card">
          <span className="metric-card__label">Efectivo</span>
          <strong className="metric-card__value">{formatQ(finanzas.porMetodo?.efectivo || 0)}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-card__label">Transferencia</span>
          <strong className="metric-card__value">{formatQ(finanzas.porMetodo?.transferencia || 0)}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-card__label">Tarjeta</span>
          <strong className="metric-card__value">{formatQ(finanzas.porMetodo?.tarjeta || 0)}</strong>
        </div>
      </div>

      <div className="metrics-grid metrics-grid--3">
        <div className="metric-card metric-card--primary">
          <span className="metric-card__label">Recaudado</span>
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

      <div className="caja-filters">
        <label>
          Filtrar por mesa
          <select value={filtroMesa} onChange={(e) => setFiltroMesa(e.target.value)}>
            <option value="all">Todas las mesas</option>
            {finanzas.porMesa.map((m) => (
              <option key={m.id} value={m.id}>{m.nombre_mesa}</option>
            ))}
          </select>
        </label>
        <label>
          Filtrar por vendedor
          <select value={filtroVendedor} onChange={(e) => setFiltroVendedor(e.target.value)}>
            <option value="all">Todos los vendedores</option>
            {Object.keys(finanzas.porVendedor).map((vid) => (
              <option key={vid} value={vid}>{VENDEDOR_NOMBRES[vid] || vid}</option>
            ))}
          </select>
        </label>
        <div className="caja-filters__total">
          Total filtrado: <strong>{formatQ(totalFiltrado)}</strong>
        </div>
      </div>

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
                {finanzas.porMesa.map((m) => (
                  <tr key={m.id}>
                    <td><strong>{m.nombre_mesa}</strong></td>
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
                {Object.entries(finanzas.porVendedor).map(([vid, data]) => (
                  <tr key={vid}>
                    <td><strong>{VENDEDOR_NOMBRES[vid] || vid}</strong></td>
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
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Turno</th>
                <th>Boleta</th>
                <th>Pago</th>
                <th>Comprobante</th>
                <th>Monto</th>
              </tr>
            </thead>
            <tbody>
              {ventasFiltradas.map((v) => (
                <tr key={v.id}>
                  <td>#{v.numero_turno}</td>
                  <td><code>{v.codigo_boleta_qr}</code></td>
                  <td>{labelMetodoPago(v.metodo_pago)}</td>
                  <td>
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
                  <td>{formatQ(v.precio_pagado)}</td>
                </tr>
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
    </Layout>
  );
}
