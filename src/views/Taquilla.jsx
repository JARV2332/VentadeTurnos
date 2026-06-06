import React, { useState, useEffect, useCallback, useRef } from 'react';
import Layout from '../components/Layout';
import { TurnoCartulina } from '../components/TurnoCartulina';
import { useAuth } from '../context/AuthContext';
import {
  getCortejosByOrg,
  getTurnosAgrupados,
  getMesasByOrg,
  subscribeData,
  reservarBrazo,
  confirmarVentaCompra,
  buscarCargadorPorWhatsapp,
  buscarCargadorPorCui,
  getCargadorById,
} from '../services/dataService';
import { enviarBoletaPorCorreo } from '../services/emailService';
import {
  METODOS_PAGO,
  metodoRequiereComprobante,
  leerImagenComoDataUrl,
} from '../utils/pagoUtils';
import { formatPrecio } from '../utils/boletaUtils';
import { etiquetaHonorTurno } from '../utils/turnoUtils';
import { construirLineasRecibo } from '../utils/compraUtils';
import { isValidGtWhatsapp, fullGtPhoneFromLocal } from '../utils/phoneGtUtils';
import { normalizarCui, isValidCui, CUI_DIGITS } from '../utils/cuiUtils';
import { TERMINO_DEVOTO, TERMINO_DEVOTO_ARTICULO } from '../constants/terminologia';
import PhoneInput502 from '../components/PhoneInput502';
import VentaExitoModal from '../components/VentaExitoModal';

export default function Taquilla() {
  const { organizacionId, organizacion, user } = useAuth();
  const [cortejoId, setCortejoId] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('all');
  const [turnos, setTurnos] = useState([]);
  const [carrito, setCarrito] = useState([]);
  const [pasoVenta, setPasoVenta] = useState(0);
  const [form, setForm] = useState({
    nombre_completo: '',
    whatsapp: '',
    correo: '',
    cui_o_identificacion: '',
    telefono_emergencia: '',
  });
  const [pago, setPago] = useState({
    metodo_pago: 'efectivo',
    comprobante_url: null,
    comprobante_nombre: '',
  });
  const [ventaOk, setVentaOk] = useState(null);
  const [error, setError] = useState('');
  const [cortejos, setCortejos] = useState([]);
  const [finalizando, setFinalizando] = useState(false);
  const [mesaActiva, setMesaActiva] = useState(null);
  const ventaPanelRef = useRef(null);

  const scrollVentaPanelTop = () => {
    ventaPanelRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    scrollVentaPanelTop();
  }, [pasoVenta, carrito.length]);

  const vendedorAuthId = user?.authUserId || user?.id;
  const ventaAbierta = carrito.length > 0;
  const carritoIds = carrito.map((b) => b.id);

  const turnoDeBrazo = (brazo) => turnos.find((t) => t.id === brazo.turno_id);

  const itemsCarrito = carrito.map((b) => ({
    brazo: b,
    turno: turnoDeBrazo(b),
  }));

  const { totalFmt: totalCarritoFmt } = construirLineasRecibo(itemsCarrito);

  const devotoToForm = (devoto) => ({
    nombre_completo: devoto?.nombre_completo || '',
    whatsapp: devoto?.whatsapp || '',
    correo: devoto?.correo || '',
    cui_o_identificacion: normalizarCui(devoto?.cui_o_identificacion || ''),
    telefono_emergencia: devoto?.telefono_emergencia || '',
  });

  const resetVentaPanel = () => {
    setCarrito([]);
    setPasoVenta(0);
    setPago({ metodo_pago: 'efectivo', comprobante_url: null, comprobante_nombre: '' });
    setForm({
      nombre_completo: '',
      whatsapp: '',
      correo: '',
      cui_o_identificacion: '',
      telefono_emergencia: '',
    });
  };

  const quitarDelCarrito = (brazoId) => {
    setCarrito((prev) => {
      const next = prev.filter((b) => b.id !== brazoId);
      if (next.length === 0) setPasoVenta(0);
      return next;
    });
  };

  const agregarAlCarrito = (brazo) => {
    setCarrito((prev) => {
      if (prev.some((b) => b.id === brazo.id)) return prev;
      return [...prev, brazo];
    });
    setPasoVenta((p) => (p === 0 ? 1 : p));
  };

  const refreshCortejos = useCallback(async () => {
    if (!organizacionId) return;
    const lista = await getCortejosByOrg(organizacionId);
    setCortejos(Array.isArray(lista) ? lista : []);
    const mesas = await getMesasByOrg(organizacionId);
    setMesaActiva(mesas.find((m) => m.estado === 'activa') || mesas[0] || null);
    const ultimo = sessionStorage.getItem('vtd_ultimo_cortejo');
    if (ultimo && lista.some((c) => c.id === ultimo)) {
      setCortejoId(ultimo);
      sessionStorage.removeItem('vtd_ultimo_cortejo');
      return;
    }
    setCortejoId((prev) => {
      if (prev && lista.some((c) => c.id === prev)) return prev;
      return lista.length ? lista[0].id : '';
    });
  }, [organizacionId]);

  const refresh = useCallback(async () => {
    if (!cortejoId) return;
    try {
      let lista = await getTurnosAgrupados(cortejoId, organizacionId);
      if (!Array.isArray(lista)) lista = [];
      if (filtroTipo !== 'all') {
        lista = lista.filter((t) => t.tipo_turno === filtroTipo);
      }
      setTurnos(lista);
    } catch (err) {
      console.error('Error al actualizar turnos en taquilla:', err);
    }
  }, [cortejoId, organizacionId, filtroTipo]);

  useEffect(() => {
    refreshCortejos();
    refresh();
    const unsub = subscribeData(organizacionId, () => {
      refreshCortejos();
      refresh();
    });
    return unsub;
  }, [organizacionId, refreshCortejos, refresh]);

  const handleClickBrazo = async (brazo) => {
    if (brazo.estado === 'vendido') return;
    if (carrito.some((b) => b.id === brazo.id)) return;
    setError('');
    setVentaOk(null);

    const expirado =
      brazo.estado === 'reservado' &&
      brazo.bloqueado_hasta &&
      new Date(brazo.bloqueado_hasta) < new Date();

    if (brazo.estado === 'disponible' || expirado) {
      const res = await reservarBrazo(brazo.id, mesaActiva?.id, vendedorAuthId, organizacionId);
      if (res.error) {
        setError(res.error);
        return;
      }
      agregarAlCarrito(res.data);
      if (carrito.length === 0) {
        setPago({ metodo_pago: 'efectivo', comprobante_url: null, comprobante_nombre: '' });
        setForm({
          nombre_completo: '',
          whatsapp: '',
          correo: '',
          cui_o_identificacion: '',
          telefono_emergencia: '',
        });
      }
    } else if (brazo.reserva_apartado && brazo.estado === 'reservado') {
      const cargador = brazo.cargador_id ? await getCargadorById(brazo.cargador_id) : null;
      agregarAlCarrito(brazo);
      if (carrito.length === 0) {
        setPago({ metodo_pago: 'efectivo', comprobante_url: null, comprobante_nombre: '' });
        setForm(devotoToForm(cargador) || {
          nombre_completo: brazo.asignado_nombre || '',
          whatsapp: '',
          correo: '',
          cui_o_identificacion: '',
          telefono_emergencia: '',
        });
      }
    } else if (brazo.vendedor_id === vendedorAuthId) {
      agregarAlCarrito(brazo);
    } else {
      setError('Reservado por otra mesa. Espere a que expire (5 min) o elija otro brazo.');
    }
  };

  const handleCuiChange = async (value) => {
    const cui = normalizarCui(value);
    setForm((f) => ({ ...f, cui_o_identificacion: cui }));
    if (isValidCui(cui)) {
      const existente = await buscarCargadorPorCui(organizacionId, cui);
      if (existente) {
        setForm(devotoToForm(existente));
      }
    }
  };

  const handleWhatsappChange = async (value) => {
    const whatsapp = String(value || '').replace(/\D/g, '').slice(0, 11);
    setForm((f) => ({ ...f, whatsapp }));
    if (isValidGtWhatsapp(whatsapp)) {
      const existente = await buscarCargadorPorWhatsapp(organizacionId, whatsapp);
      if (existente) {
        setForm(devotoToForm(existente));
      }
    }
  };

  const handleContinuarAPago = (e) => {
    e.preventDefault();
    setError('');
    if (!isValidCui(form.cui_o_identificacion)) {
      setError('Ingrese un CUI válido (13 dígitos).');
      scrollVentaPanelTop();
      return;
    }
    if (!form.nombre_completo?.trim()) {
      setError(`Ingrese el nombre ${TERMINO_DEVOTO_ARTICULO}.`);
      scrollVentaPanelTop();
      return;
    }
    if (!isValidGtWhatsapp(form.whatsapp)) {
      setError('Ingrese los 8 dígitos del WhatsApp (después de +502).');
      scrollVentaPanelTop();
      return;
    }
    if (!form.correo?.trim()) {
      setError('Ingrese el correo para enviar la boleta.');
      scrollVentaPanelTop();
      return;
    }
    setPasoVenta(2);
  };

  const handleComprobanteChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const dataUrl = await leerImagenComoDataUrl(file);
      setPago((p) => ({
        ...p,
        comprobante_url: dataUrl,
        comprobante_nombre: file.name,
      }));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleFinalizarVenta = async (e) => {
    e.preventDefault();
    setError('');

    if (metodoRequiereComprobante(pago.metodo_pago) && !pago.comprobante_url) {
      setError('Suba la foto del comprobante de transferencia o voucher de pago.');
      scrollVentaPanelTop();
      return;
    }

    setFinalizando(true);
    const cortejo = cortejos.find((c) => c.id === cortejoId);
    const whatsappVenta = form.whatsapp;
    const metodoPago = pago.metodo_pago;
    const precios = carrito.map((b) => turnoDeBrazo(b)?.precio || 0);

    try {
      const res = await confirmarVentaCompra(
        carrito.map((b) => b.id),
        form,
        precios,
        organizacionId,
        {
          metodo_pago: metodoPago,
          comprobante_url: pago.comprobante_url,
          mesa_id: mesaActiva?.id,
          vendedor_id: vendedorAuthId,
        }
      );

      if (res.error) {
        setError(res.error);
        scrollVentaPanelTop();
        return;
      }

      const itemsVenta = (res.brazos || []).map((b) => ({
        brazo: b,
        turno: turnoDeBrazo(b) || turnos.find((t) => t.id === b.turno_id),
      }));

      setVentaOk({
        ...res,
        email: null,
        emailEnviando: true,
        metodo_pago: metodoPago,
        turno: itemsVenta[0]?.turno,
        cortejo,
        items: itemsVenta,
        whatsappVenta: fullGtPhoneFromLocal(
          whatsappVenta?.replace(/\D/g, '').replace(/^502/, '') || whatsappVenta
        ) || whatsappVenta,
      });
      resetVentaPanel();

      enviarBoletaPorCorreo({
        organizacionId,
        organizacion,
        cargador: res.cargador,
        brazo: res.data,
        turno: itemsVenta[0]?.turno,
        cortejo,
        items: itemsVenta,
        compra: res.compra,
        forzarEnvio: true,
      })
        .then((emailRes) => {
          setVentaOk((prev) =>
            prev ? { ...prev, email: emailRes, emailEnviando: false } : null
          );
        })
        .catch(() => {
          setVentaOk((prev) =>
            prev
              ? {
                  ...prev,
                  email: { ok: false, error: 'No se pudo enviar el correo' },
                  emailEnviando: false,
                }
              : null
          );
        });
    } finally {
      setFinalizando(false);
    }
  };

  const necesitaComprobante = metodoRequiereComprobante(pago.metodo_pago);

  return (
    <Layout
      title="Taquilla"
      subtitle="Venta por turno — puede agregar varios turnos al mismo devoto(a)"
      className={`app-content--taquilla${ventaAbierta ? ' taquilla--venta-abierta' : ''}`}
    >
      <VentaExitoModal
        venta={ventaOk}
        organizacion={organizacion}
        onCerrar={() => setVentaOk(null)}
      />
      {error && !ventaAbierta && <div className="alert alert--error">{error}</div>}

      {carrito.length > 0 && (
        <div className="taquilla-carrito-bar no-print">
          <span>
            <strong>{carrito.length}</strong> turno(s) en compra · Total{' '}
            <strong>{totalCarritoFmt}</strong>
          </span>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => setPasoVenta((p) => (p === 0 ? 1 : p))}
          >
            {pasoVenta === 0 ? 'Cobrar' : 'Ver compra'}
          </button>
        </div>
      )}

      <div className="taquilla-toolbar">
        <label>
          Procesión
          <select value={cortejoId} onChange={(e) => setCortejoId(e.target.value)}>
            {(cortejos || []).map((c) => (
              <option key={c.id} value={c.id}>{c.nombre_evento}</option>
            ))}
          </select>
        </label>
        <label>
          Tipo de turno
          <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
            <option value="all">Todos</option>
            <option value="Entrada">Entrada</option>
            <option value="Ordinario">Ordinarios</option>
            <option value="Extraordinario">Extraordinarios</option>
            <option value="Salida">Salida</option>
          </select>
        </label>
        <div className="taquilla-legend">
          <span className="legend-dot legend-dot--disponible" /> Libre
          <span className="legend-dot legend-dot--reservado" /> Reservado
          <span className="legend-dot legend-dot--vendido" /> Vendido
          <span className="taquilla-legend__hint">Toque varios brazos para una misma compra</span>
        </div>
      </div>

      <div className="taquilla-layout">
        <div className="turnos-lista">
          {turnos.length === 0 ? (
            <p className="text-muted">No hay turnos para esta procesión.</p>
          ) : (
            (turnos || []).map((turno) => (
              <TurnoCartulina
                key={turno.id}
                turno={turno}
                selectedBrazoIds={carritoIds}
                onClickBrazo={handleClickBrazo}
              />
            ))
          )}
        </div>

        {ventaAbierta && pasoVenta >= 1 && (
          <>
            <button
              type="button"
              className="venta-backdrop"
              aria-label="Cerrar venta"
              onClick={resetVentaPanel}
            />
            <aside ref={ventaPanelRef} className="venta-panel venta-panel--sheet">
              <div className="venta-panel__top">
                <h3 className="venta-panel__titulo-movil">
                  Compra · {carrito.length} turno(s)
                </h3>
                <button
                  type="button"
                  className="venta-panel__cerrar"
                  aria-label="Cerrar"
                  onClick={resetVentaPanel}
                >
                  ×
                </button>
              </div>
            {error && (
              <div className="alert alert--error venta-panel__error">{error}</div>
            )}
            <div className="venta-pasos">
              <span className={pasoVenta === 1 ? 'venta-paso--active' : 'venta-paso--done'}>1. {TERMINO_DEVOTO}</span>
              <span className={pasoVenta === 2 ? 'venta-paso--active' : ''}>2. Pago</span>
            </div>

            <div className="venta-resumen">
              <h4 className="venta-resumen__titulo">Turnos adquiridos</h4>
              <table className="venta-carrito-tabla">
                <thead>
                  <tr>
                    <th>Cant.</th>
                    <th>Turno</th>
                    <th>Ofrenda</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {carrito.map((b) => {
                    const t = turnoDeBrazo(b);
                    return (
                      <tr key={b.id}>
                        <td>1</td>
                        <td>
                          <strong>#{b.numero_turno}</strong>{' '}
                          <span className="text-muted">{etiquetaHonorTurno(t)} · Brazo {b.numero_brazo}</span>
                        </td>
                        <td>{formatPrecio(t?.precio || 0)}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => quitarDelCarrito(b.id)}
                          >
                            Quitar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}><strong>Total ofrenda</strong></td>
                    <td colSpan={2}><strong>{totalCarritoFmt}</strong></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {pasoVenta === 1 && (
              <>
                <h3>Datos {TERMINO_DEVOTO_ARTICULO}</h3>
                <p className="venta-panel__timer">Reserva activa · 5 min</p>
                <form onSubmit={handleContinuarAPago}>
                  <label>
                    CUI / DPI
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="2998722460101"
                      value={form.cui_o_identificacion}
                      onChange={(e) => handleCuiChange(e.target.value)}
                      maxLength={CUI_DIGITS}
                      required
                    />
                    <small className="field-hint">
                      13 dígitos. Si ya está registrado, se cargan sus datos automáticamente.
                    </small>
                  </label>
                  <label>
                    Nombre {TERMINO_DEVOTO_ARTICULO}
                    <input
                      type="text"
                      value={form.nombre_completo}
                      onChange={(e) => setForm({ ...form, nombre_completo: e.target.value })}
                      required
                    />
                  </label>
                  <PhoneInput502
                    label="WhatsApp"
                    value={form.whatsapp}
                    onChange={handleWhatsappChange}
                    required
                    hint="Solo los 8 números; el +502 ya está incluido"
                  />
                  <label>
                    Correo electrónico (boleta)
                    <input
                      type="email"
                      placeholder="devoto@correo.com"
                      value={form.correo}
                      onChange={(e) => setForm({ ...form, correo: e.target.value })}
                      required
                    />
                  </label>
                  <PhoneInput502
                    label="Teléfono emergencia (opcional)"
                    value={form.telefono_emergencia}
                    onChange={(val) => setForm({ ...form, telefono_emergencia: val })}
                    hint="Opcional"
                  />
                  <div className="venta-panel__actions">
                    <button type="button" className="btn btn--ghost" onClick={resetVentaPanel}>
                      Cancelar
                    </button>
                    <button type="submit" className="btn btn--primary">
                      Continuar al pago →
                    </button>
                  </div>
                </form>
              </>
            )}

            {pasoVenta === 2 && (
              <>
                <h3>Confirmar pago</h3>
                <p className="text-muted venta-pago-intro">
                  Seleccione cómo pagó el cliente. La venta se cierra al confirmar el pago
                  y se envía la boleta por correo.
                </p>

                <form onSubmit={handleFinalizarVenta}>
                  <div className="metodos-pago">
                    {METODOS_PAGO.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={`metodo-pago-btn ${pago.metodo_pago === m.id ? 'metodo-pago-btn--active' : ''}`}
                        onClick={() => setPago({
                          metodo_pago: m.id,
                          comprobante_url: m.id === pago.metodo_pago ? pago.comprobante_url : null,
                          comprobante_nombre: m.id === pago.metodo_pago ? pago.comprobante_nombre : '',
                        })}
                      >
                        <span className="metodo-pago-btn__icon">{m.icon}</span>
                        <span>{m.label}</span>
                      </button>
                    ))}
                  </div>

                  <div className="venta-pago-total">
                    Total a cobrar: <strong>{totalCarritoFmt}</strong>
                  </div>

                  {necesitaComprobante && (
                    <div className="comprobante-upload">
                      <label className="comprobante-upload__label">
                        Foto del comprobante (transferencia / voucher)
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={handleComprobanteChange}
                        />
                      </label>
                      {pago.comprobante_url ? (
                        <div className="comprobante-preview">
                          <img src={pago.comprobante_url} alt="Comprobante de pago" />
                          <span>{pago.comprobante_nombre}</span>
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => setPago((p) => ({
                              ...p,
                              comprobante_url: null,
                              comprobante_nombre: '',
                            }))}
                          >
                            Cambiar foto
                          </button>
                        </div>
                      ) : (
                        <p className="hint-error">Obligatorio para transferencia y tarjeta</p>
                      )}
                    </div>
                  )}

                  {pago.metodo_pago === 'efectivo' && (
                    <div className="info-box">
                      Pago en efectivo: no requiere comprobante digital. Verifique el monto recibido.
                    </div>
                  )}

                  <div className="venta-panel__actions">
                    <button type="button" className="btn btn--ghost" onClick={() => setPasoVenta(1)}>
                      ← Atrás
                    </button>
                    <button
                      type="submit"
                      className="btn btn--primary"
                      disabled={finalizando || (necesitaComprobante && !pago.comprobante_url)}
                    >
                      {finalizando ? 'Procesando...' : 'Finalizar venta y enviar boleta'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </aside>
          </>
        )}
      </div>
    </Layout>
  );
}
