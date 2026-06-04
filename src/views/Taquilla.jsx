import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { TurnoCartulina } from '../components/TurnoCartulina';
import { useAuth } from '../context/AuthContext';
import {
  getCortejosByOrg,
  getTurnosAgrupados,
  getMesasByOrg,
  subscribeData,
  reservarBrazo,
  confirmarVenta,
  buscarCargadorPorWhatsapp,
  getCargadorById,
} from '../services/dataService';
import { enviarBoletaPorCorreo } from '../services/emailService';
import {
  METODOS_PAGO,
  metodoRequiereComprobante,
  labelMetodoPago,
  leerImagenComoDataUrl,
} from '../utils/pagoUtils';
import { formatPrecio } from '../utils/boletaUtils';
import { repertorioTurnoLista } from '../utils/turnoUtils';
import { isValidGtWhatsapp } from '../utils/phoneGtUtils';
import PhoneInput502 from '../components/PhoneInput502';
import { construirEnlaceBoletaWhatsapp } from '../utils/whatsappUtils';

export default function Taquilla() {
  const { organizacionId, organizacion, user } = useAuth();
  const [cortejoId, setCortejoId] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('all');
  const [turnos, setTurnos] = useState([]);
  const [selectedBrazo, setSelectedBrazo] = useState(null);
  const [pasoVenta, setPasoVenta] = useState(1);
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

  const vendedorAuthId = user?.authUserId || user?.id;

  const resetVentaPanel = () => {
    setSelectedBrazo(null);
    setPasoVenta(1);
    setPago({ metodo_pago: 'efectivo', comprobante_url: null, comprobante_nombre: '' });
    setForm({
      nombre_completo: '',
      whatsapp: '',
      correo: '',
      cui_o_identificacion: '',
      telefono_emergencia: '',
    });
  };

  const refreshCortejos = useCallback(async () => {
    if (!organizacionId) return;
    const lista = await getCortejosByOrg(organizacionId);
    setCortejos(lista);
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
    let lista = await getTurnosAgrupados(cortejoId, organizacionId);
    if (filtroTipo !== 'all') {
      lista = lista.filter((t) => t.tipo_turno === filtroTipo);
    }
    setTurnos(lista);
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
      setSelectedBrazo(res.data);
      setPasoVenta(1);
      setPago({ metodo_pago: 'efectivo', comprobante_url: null, comprobante_nombre: '' });
      setForm({
        nombre_completo: '',
        whatsapp: '',
        correo: '',
        cui_o_identificacion: '',
        telefono_emergencia: '',
      });
    } else if (brazo.reserva_apartado && brazo.estado === 'reservado') {
      const cargador = brazo.cargador_id ? await getCargadorById(brazo.cargador_id) : null;
      setSelectedBrazo(brazo);
      setPasoVenta(1);
      setPago({ metodo_pago: 'efectivo', comprobante_url: null, comprobante_nombre: '' });
      setForm({
        nombre_completo: cargador?.nombre_completo || brazo.asignado_nombre || '',
        whatsapp: cargador?.whatsapp || '',
        correo: cargador?.correo || '',
        cui_o_identificacion: cargador?.cui_o_identificacion || '',
        telefono_emergencia: cargador?.telefono_emergencia || '',
      });
    } else if (brazo.vendedor_id === vendedorAuthId) {
      setSelectedBrazo(brazo);
      setPasoVenta(1);
    } else {
      setError('Reservado por otra mesa. Espere a que expire (5 min) o elija otro brazo.');
    }
  };

  const handleWhatsappChange = async (value) => {
    const limpio = value.replace(/\D/g, '').slice(0, 11);
    setForm((f) => ({ ...f, whatsapp: limpio }));
    if (limpio.length >= 11) {
      const existente = await buscarCargadorPorWhatsapp(organizacionId, limpio);
      if (existente) {
        setForm({
          nombre_completo: existente.nombre_completo,
          whatsapp: existente.whatsapp,
          correo: existente.correo || '',
          cui_o_identificacion: existente.cui_o_identificacion || '',
          telefono_emergencia: existente.telefono_emergencia || '',
        });
      }
    }
  };

  const handleContinuarAPago = (e) => {
    e.preventDefault();
    setError('');
    if (!form.nombre_completo?.trim()) {
      setError('Ingrese el nombre del cargador.');
      return;
    }
    if (!isValidGtWhatsapp(form.whatsapp)) {
      setError('Ingrese los 8 dígitos del WhatsApp (después de +502).');
      return;
    }
    if (!form.correo?.trim()) {
      setError('Ingrese el correo para enviar la boleta.');
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
      return;
    }

    setFinalizando(true);
    const turno = turnos.find((t) => t.id === selectedBrazo.turno_id);
    const cortejo = cortejos.find((c) => c.id === cortejoId);

    const res = await confirmarVenta(
      selectedBrazo.id,
      form,
      turno?.precio || 0,
      organizacionId,
      {
        metodo_pago: pago.metodo_pago,
        comprobante_url: pago.comprobante_url,
      }
    );

    if (res.error) {
      setError(res.error);
      setFinalizando(false);
      return;
    }

    const emailRes = await enviarBoletaPorCorreo({
      organizacionId,
      organizacion,
      cargador: res.cargador,
      brazo: res.data,
      turno,
      cortejo,
    });

    setVentaOk({
      ...res,
      email: emailRes,
      metodo_pago: pago.metodo_pago,
      turno,
      cortejo,
      whatsappVenta: form.whatsapp,
    });
    resetVentaPanel();
    setFinalizando(false);
  };

  const turnoSel = selectedBrazo
    ? turnos.find((t) => t.id === selectedBrazo.turno_id)
    : null;

  const precioTurno = turnoSel?.precio || 0;
  const repertorioSel = turnoSel ? repertorioTurnoLista(turnoSel) : [];
  const necesitaComprobante = metodoRequiereComprobante(pago.metodo_pago);

  const enlaceWhatsappBoleta =
    ventaOk &&
    construirEnlaceBoletaWhatsapp({
      cargador: ventaOk.cargador,
      brazo: ventaOk.data,
      turno: ventaOk.turno,
      cortejo: ventaOk.cortejo,
      organizacion,
    });

  return (
    <Layout
      title="Taquilla"
      subtitle="Venta por turno — Izquierda y Derecha"
      className={`app-content--taquilla${selectedBrazo ? ' taquilla--venta-abierta' : ''}`}
    >
      {ventaOk && (
        <>
          <div className="venta-exito-overlay" role="dialog" aria-modal="true" aria-labelledby="venta-exito-titulo">
            <div className="venta-exito-card">
              <h2 id="venta-exito-titulo" className="venta-exito-card__titulo">Venta completada</h2>
              <p className="venta-exito-card__codigo">
                Boleta <strong>{ventaOk.codigo}</strong>
                {' · '}
                {labelMetodoPago(ventaOk.metodo_pago)}
              </p>
              {ventaOk.email?.ok && (
                <p className="venta-exito-card__email">
                  Correo enviado a <strong>{ventaOk.email.destinatario}</strong>
                  {ventaOk.email.demo && ' (demo)'}
                </p>
              )}
              {enlaceWhatsappBoleta ? (
                <>
                  <p className="venta-exito-card__hint">
                    Toque el botón para abrir WhatsApp con el mensaje y el enlace de la boleta (QR en el link).
                  </p>
                  <a
                    href={enlaceWhatsappBoleta}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn--whatsapp btn--block"
                  >
                    Enviar boleta por WhatsApp
                  </a>
                </>
              ) : (
                <p className="venta-exito-card__hint venta-exito-card__hint--warn">
                  No se pudo armar el enlace de WhatsApp (revise que el número tenga 8 dígitos después de +502).
                </p>
              )}
              <div className="venta-exito-card__links">
                <Link to="/impresion" className="btn btn--ghost btn--sm">Imprimir boleta</Link>
                <Link to="/entrega" className="btn btn--ghost btn--sm">Entrega</Link>
              </div>
              <button type="button" className="btn btn--primary btn--block venta-exito-card__cerrar" onClick={() => setVentaOk(null)}>
                Cerrar y seguir vendiendo
              </button>
            </div>
          </div>
          <div className="alert alert--success">
            <div>
              <strong>Venta completada</strong> · Boleta {ventaOk.codigo}
            </div>
            <button type="button" className="alert__close" onClick={() => setVentaOk(null)} aria-label="Cerrar">×</button>
          </div>
        </>
      )}
      {error && <div className="alert alert--error">{error}</div>}

      <div className="taquilla-toolbar">
        <label>
          Procesión
          <select value={cortejoId} onChange={(e) => setCortejoId(e.target.value)}>
            {cortejos.map((c) => (
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
        </div>
      </div>

      <div className="taquilla-layout">
        <div className="turnos-lista">
          {turnos.length === 0 ? (
            <p className="text-muted">No hay turnos para esta procesión.</p>
          ) : (
            turnos.map((turno) => (
              <TurnoCartulina
                key={turno.id}
                turno={turno}
                selectedBrazo={selectedBrazo}
                onClickBrazo={handleClickBrazo}
              />
            ))
          )}
        </div>

        {selectedBrazo && (
          <>
            <button
              type="button"
              className="venta-backdrop"
              aria-label="Cerrar venta"
              onClick={resetVentaPanel}
            />
            <aside className="venta-panel venta-panel--sheet">
              <div className="venta-panel__top">
                <h3 className="venta-panel__titulo-movil">Venta en curso</h3>
                <button
                  type="button"
                  className="venta-panel__cerrar"
                  aria-label="Cerrar"
                  onClick={resetVentaPanel}
                >
                  ×
                </button>
              </div>
            <div className="venta-pasos">
              <span className={pasoVenta === 1 ? 'venta-paso--active' : 'venta-paso--done'}>1. Cargador</span>
              <span className={pasoVenta === 2 ? 'venta-paso--active' : ''}>2. Pago</span>
            </div>

            <div className="venta-resumen">
              <p><strong>Turno #{selectedBrazo.numero_turno}</strong> · {formatPrecio(precioTurno)}</p>
              <p className="text-muted">{turnoSel?.etiqueta || turnoSel?.tipo_turno}</p>
              {repertorioSel.length > 0 && (
                <div className="venta-repertorio">
                  <span className="venta-repertorio__titulo">Se toca en este turno</span>
                  {repertorioSel.map((item) => (
                    <p key={item.tipo} className="venta-repertorio__linea">
                      <strong>{item.tipo}:</strong> {item.texto}
                    </p>
                  ))}
                </div>
              )}
            </div>

            {pasoVenta === 1 && (
              <>
                <h3>Datos del cargador</h3>
                <p className="venta-panel__timer">Reserva activa · 5 min</p>
                <form onSubmit={handleContinuarAPago}>
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
                  <label>
                    Nombre del cargador
                    <input
                      type="text"
                      value={form.nombre_completo}
                      onChange={(e) => setForm({ ...form, nombre_completo: e.target.value })}
                      required
                    />
                  </label>
                  <label>
                    CUI / Identificación
                    <input
                      type="text"
                      value={form.cui_o_identificacion}
                      onChange={(e) => setForm({ ...form, cui_o_identificacion: e.target.value })}
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
                    Total a cobrar: <strong>{formatPrecio(precioTurno)}</strong>
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
