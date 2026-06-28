import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { TurnoCartulina } from '../components/TurnoCartulina';
import { useAuth } from '../context/AuthContext';
import {
  getCortejosByOrg,
  getTurnosAgrupados,
  getMesasByOrg,
  getBrazosByOrg,
  subscribeData,
  reservarBrazo,
  confirmarVentaCompra,
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
import MisTurnosEnlaceAdmin from '../components/MisTurnosEnlaceAdmin';
import {
  buscarApartadosEnTurnos,
  agruparApartadosBusqueda,
  agruparApartadosPorDevoto,
  formDesdeApartado,
} from '../utils/taquillaApartadosUtils';
import {
  resolverCortejoInicial,
  cambiarCortejoPreferido,
  guardarCortejoPreferido,
} from '../utils/cortejoPreferidoUtils';
import {
  contarReservasTaquillaColgadas,
  MINUTOS_RESERVA_TAQUILLA_COLGADA,
} from '../utils/reservasTaquillaUtils';

export default function Taquilla() {
  const { organizacionId, organizacion, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [cortejoId, setCortejoId] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('all');
  const [turnoFoco, setTurnoFoco] = useState(() => searchParams.get('turno') || '');
  const [turnosTodos, setTurnosTodos] = useState([]);
  const [busquedaApartado, setBusquedaApartado] = useState('');
  const [extraApartadosCui, setExtraApartadosCui] = useState([]);
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
  const [reservasColgadas, setReservasColgadas] = useState(0);
  const [mesaActiva, setMesaActiva] = useState(null);
  const [esMovil, setEsMovil] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1024px)').matches
  );
  const ventaPanelRef = useRef(null);

  const ventaAbierta = carrito.length > 0;
  const cobroAbierto = ventaAbierta && pasoVenta >= 1;

  const scrollVentaPanelTop = () => {
    ventaPanelRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    scrollVentaPanelTop();
  }, [pasoVenta, carrito.length]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1024px)');
    const sync = () => setEsMovil(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!esMovil || !cobroAbierto) return undefined;
    document.body.classList.add('taquilla-cobro-activo');
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.classList.remove('taquilla-cobro-activo');
      document.body.style.overflow = prev;
    };
  }, [esMovil, cobroAbierto]);

  const abrirCobro = () => {
    setPasoVenta(1);
    requestAnimationFrame(() => scrollVentaPanelTop());
  };

  const cerrarCobro = () => {
    if (esMovil) setPasoVenta(0);
    else resetVentaPanel();
  };

  const vendedorAuthId = user?.authUserId || user?.id;
  const carritoIds = carrito.map((b) => b.id);

  const turnoDeBrazo = (brazo) => turnosTodos.find((t) => t.id === brazo.turno_id);

  const resultadosBusqueda = useMemo(() => {
    const q = busquedaApartado.trim();
    if (q.length < 2) return [];
    const base = buscarApartadosEnTurnos(turnosTodos, q);
    const ids = new Set(base.map((r) => r.brazo.id));
    const merged = [...base];
    extraApartadosCui.forEach((item) => {
      if (!ids.has(item.brazo.id)) merged.push(item);
    });
    return merged;
  }, [turnosTodos, busquedaApartado, extraApartadosCui]);

  const gruposDevotoBusqueda = useMemo(
    () => agruparApartadosPorDevoto(agruparApartadosBusqueda(resultadosBusqueda)),
    [resultadosBusqueda]
  );

  const brazosDestacadosIds = useMemo(
    () => resultadosBusqueda.map((r) => r.brazo.id),
    [resultadosBusqueda]
  );

  const turnos = useMemo(() => {
    let lista = turnosTodos;
    if (filtroTipo !== 'all') {
      lista = lista.filter((t) => t.tipo_turno === filtroTipo);
    }
    if (turnoFoco?.trim()) {
      lista = lista.filter((t) => String(t.numero_turno) === String(turnoFoco).trim());
    }
    if (busquedaApartado.trim().length >= 2 && brazosDestacadosIds.length > 0) {
      const idsTurnos = new Set(resultadosBusqueda.map((r) => r.turno.id));
      lista = lista.filter((t) => idsTurnos.has(t.id));
    }
    return lista;
  }, [turnosTodos, filtroTipo, turnoFoco, busquedaApartado, brazosDestacadosIds, resultadosBusqueda]);

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
    const esEscritorio = window.matchMedia('(min-width: 1025px)').matches;
    if (esEscritorio) {
      setPasoVenta((p) => (p === 0 ? 1 : p));
    }
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
      guardarCortejoPreferido(organizacionId, ultimo);
      sessionStorage.removeItem('vtd_ultimo_cortejo');
      return;
    }
    setCortejoId((prev) => resolverCortejoInicial(lista, organizacionId, prev));
  }, [organizacionId]);

  const refresh = useCallback(async () => {
    if (!cortejoId) return;
    try {
      let lista = await getTurnosAgrupados(cortejoId, organizacionId);
      if (!Array.isArray(lista)) lista = [];
      setTurnosTodos(lista);
      if (organizacionId) {
        const brazos = await getBrazosByOrg(organizacionId);
        setReservasColgadas(contarReservasTaquillaColgadas(brazos));
      }
    } catch (err) {
      console.error('Error al actualizar turnos en taquilla:', err);
    }
  }, [cortejoId, organizacionId]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const q = normalizarCui(busquedaApartado);
      if (!isValidCui(q) || !organizacionId || !turnosTodos.length) {
        if (!cancelado) setExtraApartadosCui([]);
        return;
      }
      const cargador = await buscarCargadorPorCui(organizacionId, q);
      if (cancelado) return;
      if (!cargador) {
        setExtraApartadosCui([]);
        return;
      }
      const encontrados = [];
      turnosTodos.forEach((turno) => {
        const brazos = [...(turno.izquierda || []), ...(turno.derecha || [])];
        brazos.forEach((brazo) => {
          if (
            brazo.reserva_apartado &&
            brazo.estado === 'reservado' &&
            brazo.cargador_id === cargador.id
          ) {
            encontrados.push({
              brazo,
              turno,
              nombre: cargador.nombre_completo || brazo.asignado_nombre || '',
              dpi: q,
            });
          }
        });
      });
      setExtraApartadosCui(encontrados);
    })();
    return () => {
      cancelado = true;
    };
  }, [busquedaApartado, turnosTodos, organizacionId]);

  useEffect(() => {
    refreshCortejos();
    refresh();
    const unsub = subscribeData(organizacionId, () => {
      refreshCortejos();
      refresh();
    });
    return unsub;
  }, [organizacionId, refreshCortejos, refresh]);

  useEffect(() => {
    const cortejoParam = searchParams.get('cortejo');
    if (cortejoParam && cortejos.some((c) => c.id === cortejoParam)) {
      setCortejoId(cortejoParam);
      guardarCortejoPreferido(organizacionId, cortejoParam);
    }
    const turnoParam = searchParams.get('turno');
    if (turnoParam) setTurnoFoco(String(turnoParam).trim());
  }, [cortejos, searchParams, organizacionId]);

  useEffect(() => {
    if (!turnoFoco?.trim() || !turnos.length) return undefined;
    const timer = setTimeout(() => {
      document.getElementById(`turno-${turnoFoco}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [turnoFoco, turnos, cortejoId]);

  const limpiarTurnoFoco = () => {
    setTurnoFoco('');
    const next = new URLSearchParams(searchParams);
    next.delete('turno');
    setSearchParams(next, { replace: true });
  };

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
      const dpiMatch = brazo.apartado_notas?.match(/DPI\s*(\d{13})/);
      agregarAlCarrito(brazo);
      if (carrito.length === 0) {
        setPago({ metodo_pago: 'efectivo', comprobante_url: null, comprobante_nombre: '' });
        setForm(
          devotoToForm(cargador) || {
            nombre_completo: brazo.asignado_nombre || brazo.cargador?.nombre_completo || '',
            whatsapp: '',
            correo: '',
            cui_o_identificacion: dpiMatch?.[1] || '',
            telefono_emergencia: '',
          }
        );
      }
    } else if (brazo.vendedor_id === vendedorAuthId) {
      agregarAlCarrito(brazo);
    } else {
      setError('Reservado por otra mesa. Espere a que expire (5 min) o elija otro brazo.');
    }
  };

  const agregarApartadosDesdeBusqueda = async (brazos) => {
    if (!brazos?.length) return;
    setError('');
    setVentaOk(null);

    let primero = carrito.length === 0;
    const idsAgregados = new Set(carrito.map((b) => b.id));

    for (const brazo of brazos) {
      if (brazo.estado === 'vendido' || idsAgregados.has(brazo.id)) continue;
      if (!(brazo.reserva_apartado && brazo.estado === 'reservado')) continue;

      if (primero) {
        const cargador = brazo.cargador_id ? await getCargadorById(brazo.cargador_id) : null;
        setPago({ metodo_pago: 'efectivo', comprobante_url: null, comprobante_nombre: '' });
        setForm(formDesdeApartado(brazo, cargador));
        primero = false;
      }

      idsAgregados.add(brazo.id);
      setCarrito((prev) => (prev.some((b) => b.id === brazo.id) ? prev : [...prev, brazo]));
    }

    const esEscritorio = window.matchMedia('(min-width: 1025px)').matches;
    if (esEscritorio) {
      setPasoVenta((p) => (p === 0 ? 1 : p));
    } else {
      abrirCobro();
    }
  };

  const resumenTurnosGrupo = (grupo) =>
    grupo.turnosResumen
      .map((t) => `#${t.turno.numero_turno} (${t.cantidad})`)
      .join(', ');

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

  const handleWhatsappChange = (value) => {
    const whatsapp = String(value || '').replace(/\D/g, '').slice(0, 11);
    setForm((f) => ({ ...f, whatsapp }));
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
          operador_nombre: user?.nombre?.trim() || '',
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
      className={`app-content--taquilla${ventaAbierta ? ' taquilla--venta-abierta' : ''}${carrito.length > 0 ? ' taquilla--con-carrito' : ''}${pasoVenta >= 1 ? ' taquilla--cobro-abierto' : ''}`}
    >
      <VentaExitoModal
        venta={ventaOk}
        organizacion={organizacion}
        onCerrar={() => setVentaOk(null)}
      />
      {error && !ventaAbierta && <div className="alert alert--error">{error}</div>}

      {!ventaAbierta && <MisTurnosEnlaceAdmin organizacion={organizacion} />}

      {reservasColgadas > 0 && !ventaAbierta && (
        <div className="alert alert--warning taquilla-reservas-colgadas no-print">
          <strong>{reservasColgadas}</strong> reserva(s) de taquilla sin confirmar hace más de{' '}
          {MINUTOS_RESERVA_TAQUILLA_COLGADA} minutos. Los brazos reservados expirados vuelven a
          estar libres al tocarlos; revise si algún operador dejó una venta a medias.
        </div>
      )}

      {carrito.length > 0 && pasoVenta < 1 && (
        <div className="taquilla-carrito-bar no-print">
          <span>
            <strong>{carrito.length}</strong> turno(s) · Total{' '}
            <strong>{totalCarritoFmt}</strong>
          </span>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={abrirCobro}
          >
            Cobrar →
          </button>
        </div>
      )}

      <div className="taquilla-toolbar">
        <label>
          Procesión
          <select
            value={cortejoId}
            onChange={(e) => cambiarCortejoPreferido(organizacionId, e.target.value, setCortejoId)}
          >
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
        <div className="taquilla-legend" aria-label="Leyenda de colores de brazos">
          <span className="taquilla-legend__item">
            <span className="legend-dot legend-dot--disponible" aria-hidden /> Libre
          </span>
          <span className="taquilla-legend__item">
            <span className="legend-dot legend-dot--apartado" aria-hidden /> Apartado
          </span>
          <span className="taquilla-legend__item">
            <span className="legend-dot legend-dot--reservado" aria-hidden /> Reserva taquilla
          </span>
          <span className="taquilla-legend__item">
            <span className="legend-dot legend-dot--vendido" aria-hidden /> Vendido
          </span>
          <span className="taquilla-legend__hint">Toque varios brazos para una misma compra</span>
        </div>
      </div>

      {turnoFoco?.trim() && (
        <div className="info-box taquilla-turno-foco no-print">
          Mostrando turno <strong>#{turnoFoco}</strong> preseleccionado desde Disponibilidad.{' '}
          <button type="button" className="btn btn--ghost btn--sm" onClick={limpiarTurnoFoco}>
            Ver todos los turnos
          </button>
        </div>
      )}

      <div className="taquilla-busqueda-apartados">
        <label className="taquilla-busqueda-apartados__label">
          Buscar apartado
          <input
            type="search"
            className="taquilla-busqueda-apartados__input"
            placeholder="DPI o nombre del devoto(a)…"
            value={busquedaApartado}
            onChange={(e) => setBusquedaApartado(e.target.value)}
            autoComplete="off"
          />
        </label>
        {busquedaApartado.trim().length >= 2 && (
          <div className="taquilla-busqueda-resultados">
            {gruposDevotoBusqueda.length === 0 ? (
              <p className="taquilla-busqueda-resultados__vacio">
                No hay apartados que coincidan con «{busquedaApartado.trim()}».
              </p>
            ) : (
              <>
                <p className="taquilla-busqueda-resultados__meta">
                  {gruposDevotoBusqueda.length} devoto(s) ·{' '}
                  {resultadosBusqueda.length} espacio(s) apartado(s)
                </p>
                <ul className="taquilla-busqueda-lista">
                  {gruposDevotoBusqueda.map((grupo) => (
                    <li key={`${grupo.nombre}-${grupo.dpi}`} className="taquilla-busqueda-item">
                      <div className="taquilla-busqueda-item__info">
                        <strong>{grupo.nombre || 'Sin nombre'}</strong>
                        {grupo.dpi && (
                          <span className="taquilla-busqueda-item__dpi">DPI {grupo.dpi}</span>
                        )}
                        <span className="taquilla-busqueda-item__turnos">
                          Turno(s) {resumenTurnosGrupo(grupo)} · {grupo.brazos.length} espacio(s)
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn btn--primary btn--sm"
                        onClick={() => agregarApartadosDesdeBusqueda(grupo.brazos)}
                      >
                        Agregar y cobrar
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>

      <div className="taquilla-layout">
        <div className="turnos-lista">
          {turnos.length === 0 ? (
            <p className="text-muted">
              {busquedaApartado.trim().length >= 2
                ? 'Ningún turno visible coincide con la búsqueda.'
                : 'No hay turnos para esta procesión.'}
            </p>
          ) : (
            (turnos || []).map((turno) => (
              <div key={turno.id} id={`turno-${turno.numero_turno}`} className="taquilla-turno-anchor">
                <TurnoCartulina
                  turno={turno}
                  selectedBrazoIds={carritoIds}
                  brazosDestacadosIds={
                    busquedaApartado.trim().length >= 2 ? brazosDestacadosIds : undefined
                  }
                  onClickBrazo={handleClickBrazo}
                />
              </div>
            ))
          )}
        </div>

        {cobroAbierto && !esMovil && (
          <>
            <button
              type="button"
              className="venta-backdrop"
              aria-label="Cerrar venta"
              onClick={cerrarCobro}
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
                  onClick={cerrarCobro}
                >
                  ×
                </button>
              </div>

            {pasoVenta === 1 && (
              <form className="venta-panel__form" onSubmit={handleContinuarAPago}>
                <div className="venta-panel__scroll">
                  {error && (
                    <div className="alert alert--error venta-panel__error">{error}</div>
                  )}
                  <div className="venta-pasos">
                    <span className="venta-paso--active">1. {TERMINO_DEVOTO}</span>
                    <span>2. Pago</span>
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

                  <h3>Datos {TERMINO_DEVOTO_ARTICULO}</h3>
                  <p className="venta-panel__timer">Reserva activa · 5 min</p>
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
                    hint="Puede repetirse entre devotos distintos (familia, contacto compartido)"
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
                </div>
                <div className="venta-panel__actions">
                  <button type="button" className="btn btn--ghost" onClick={resetVentaPanel}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn--primary">
                    Continuar al pago →
                  </button>
                </div>
              </form>
            )}

            {pasoVenta === 2 && (
              <form className="venta-panel__form" onSubmit={handleFinalizarVenta}>
                <div className="venta-panel__scroll">
                  {error && (
                    <div className="alert alert--error venta-panel__error">{error}</div>
                  )}
                  <div className="venta-pasos">
                    <span className="venta-paso--done">1. {TERMINO_DEVOTO}</span>
                    <span className="venta-paso--active">2. Pago</span>
                  </div>

                  <div className="venta-resumen venta-resumen--compact">
                    <p className="text-muted">
                      {carrito.length} turno(s) · Total <strong>{totalCarritoFmt}</strong>
                    </p>
                  </div>

                  <h3>Confirmar pago</h3>
                  <p className="text-muted venta-pago-intro">
                    Seleccione cómo pagó el cliente. La venta se cierra al confirmar el pago
                    y se envía la boleta por correo.
                  </p>

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
                </div>
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
            )}
          </aside>
          </>
        )}
      </div>

      {cobroAbierto &&
        esMovil &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="venta-cobro-portal" role="dialog" aria-modal="true" aria-label="Cobro de turnos">
            <button
              type="button"
              className="venta-backdrop"
              aria-label="Cerrar venta"
              onClick={cerrarCobro}
            />
            <aside ref={ventaPanelRef} className="venta-panel venta-panel--sheet venta-panel--movil">
              <div className="venta-panel__top">
                <h3 className="venta-panel__titulo-movil">
                  Compra · {carrito.length} turno(s)
                </h3>
                <button
                  type="button"
                  className="venta-panel__cerrar"
                  aria-label="Cerrar"
                  onClick={cerrarCobro}
                >
                  ×
                </button>
              </div>

              {pasoVenta === 1 && (
                <form className="venta-panel__form" onSubmit={handleContinuarAPago}>
                  <div className="venta-panel__scroll">
                    {error && (
                      <div className="alert alert--error venta-panel__error">{error}</div>
                    )}
                    <div className="venta-pasos">
                      <span className="venta-paso--active">1. {TERMINO_DEVOTO}</span>
                      <span>2. Pago</span>
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

                    <h3>Datos {TERMINO_DEVOTO_ARTICULO}</h3>
                    <p className="venta-panel__timer">Reserva activa · 5 min</p>
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
                      hint="Puede repetirse entre devotos distintos (familia, contacto compartido)"
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
                  </div>
                  <div className="venta-panel__actions">
                    <button type="button" className="btn btn--ghost" onClick={resetVentaPanel}>
                      Cancelar
                    </button>
                    <button type="submit" className="btn btn--primary">
                      Continuar al pago →
                    </button>
                  </div>
                </form>
              )}

              {pasoVenta === 2 && (
                <form className="venta-panel__form" onSubmit={handleFinalizarVenta}>
                  <div className="venta-panel__scroll">
                    {error && (
                      <div className="alert alert--error venta-panel__error">{error}</div>
                    )}
                    <div className="venta-pasos">
                      <span className="venta-paso--done">1. {TERMINO_DEVOTO}</span>
                      <span className="venta-paso--active">2. Pago</span>
                    </div>
                    <div className="venta-resumen venta-resumen--compact">
                      <p className="text-muted">
                        {carrito.length} turno(s) · Total <strong>{totalCarritoFmt}</strong>
                      </p>
                    </div>
                    <h3>Confirmar pago</h3>
                    <p className="text-muted venta-pago-intro">
                      Seleccione cómo pagó el cliente. La venta se cierra al confirmar el pago
                      y se envía la boleta por correo.
                    </p>
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
                  </div>
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
              )}
            </aside>
          </div>,
          document.body
        )}
    </Layout>
  );
}
