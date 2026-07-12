import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import BoletaContraseñaTurno from '../components/BoletaContraseñaTurno';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';
import {
  getUltimosRecibosImpresion,
  buscarRecibosImpresion,
  getReciboImpresionPorCompraId,
  getCortejosByOrg,
  getTurnosByIds,
  buscarBoletaPorCodigo,
  updateDevoto,
  IMPRESION_RECIBOS_RECIENTES,
} from '../services/dataService';
import EditDevotoModal from '../components/EditDevotoModal';
import ReenvioMasivoModal from '../components/ReenvioMasivoModal';
import { enviarBoletaPorCorreo } from '../services/emailService';
import { construirEnlaceBoletaWhatsapp } from '../utils/whatsappUtils';
import { codigoReciboDisplay } from '../utils/compraUtils';
import { extraerCodigoBoleta } from '../utils/boletaUtils';
import { TERMINO_DEVOTO } from '../constants/terminologia';

function agruparRecibos(vendidos, comprasPorId) {
  const map = new Map();
  (vendidos || []).forEach((b) => {
    const key = b.compra_id || `solo-${b.id}`;
    if (!map.has(key)) {
      map.set(key, {
        id: key,
        compra: b.compra_id ? comprasPorId[b.compra_id] : null,
        brazos: [],
      });
    }
    map.get(key).brazos.push(b);
  });
  return [...map.values()];
}

function reciboDesdeBusqueda(res) {
  if (!res?.brazos?.length) return null;
  return {
    id: res.compra?.id || `solo-${res.brazos[0].id}`,
    compra: res.compra || null,
    brazos: res.brazos,
  };
}

function etiquetaRecibo(recibo, cargadoresPorId) {
  const nombre =
    cargadoresPorId[recibo.brazos[0]?.cargador_id]?.nombre_completo?.trim() ||
    'Sin nombre';
  const codigo = codigoReciboDisplay(recibo.compra, recibo.brazos);
  const n = recibo.brazos.length;
  return `${nombre} — ${n} turno(s) · ${codigo}`;
}

function aplicarPaqueteRecibos({ brazos, compras, cargadores }) {
  const comprasMap = Object.fromEntries((compras || []).map((c) => [c.id, c]));
  const cargadoresMap = Object.fromEntries((cargadores || []).map((c) => [c.id, c]));
  return {
    recibos: agruparRecibos(brazos || [], comprasMap),
    cargadoresPorId: cargadoresMap,
  };
}

export default function Impresion() {
  const { organizacion, organizacionId, hasPermiso } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [recibosRecientes, setRecibosRecientes] = useState([]);
  const [recibosBusqueda, setRecibosBusqueda] = useState(null);
  const [cargadoresPorId, setCargadoresPorId] = useState({});
  const [busquedaDevoto, setBusquedaDevoto] = useState('');
  const [busquedaCodigo, setBusquedaCodigo] = useState('');
  const [msgBusqueda, setMsgBusqueda] = useState('');
  const [soloReciboVenta, setSoloReciboVenta] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [detalle, setDetalle] = useState({
    cargador: null,
    cortejo: null,
    items: [],
    compra: null,
  });
  const [cargandoRecientes, setCargandoRecientes] = useState(true);
  const [buscandoDevoto, setBuscandoDevoto] = useState(false);
  const [buscandoCodigo, setBuscandoCodigo] = useState(false);
  const [enviandoCorreo, setEnviandoCorreo] = useState(false);
  const [msgReenvio, setMsgReenvio] = useState(null);
  const [reciboPorCodigo, setReciboPorCodigo] = useState(null);
  const [devotoEditando, setDevotoEditando] = useState(null);
  const [guardandoDevoto, setGuardandoDevoto] = useState(false);
  const [errorDevoto, setErrorDevoto] = useState('');
  const [okDevoto, setOkDevoto] = useState('');
  const [reenvioMasivoAbierto, setReenvioMasivoAbierto] = useState(false);
  const cortejosCacheRef = useRef(null);

  const cargarRecientes = useCallback(async () => {
    if (!organizacionId) return;
    setCargandoRecientes(true);
    try {
      const pack = await getUltimosRecibosImpresion(organizacionId);
      const { recibos, cargadoresPorId: map } = aplicarPaqueteRecibos(pack);
      setRecibosRecientes(recibos);
      setCargadoresPorId(map);
      setRecibosBusqueda(null);
      setMsgBusqueda('');
      setReciboPorCodigo(null);
      setBusquedaCodigo('');
      setSoloReciboVenta(false);
    } finally {
      setCargandoRecientes(false);
    }
  }, [organizacionId]);

  const cargarReciboDirecto = useCallback(
    async ({ compraId, codigo }) => {
      if (!organizacionId) return;
      setCargandoRecientes(true);
      setMsgBusqueda('');
      setRecibosBusqueda(null);
      setReciboPorCodigo(null);
      setSoloReciboVenta(true);
      try {
        if (compraId) {
          const res = await getReciboImpresionPorCompraId(organizacionId, compraId);
          if (res.error) {
            setMsgBusqueda(res.error);
            setRecibosRecientes([]);
            return;
          }
          const { recibos, cargadoresPorId: map } = aplicarPaqueteRecibos(res);
          setRecibosRecientes(recibos);
          setCargadoresPorId(map);
          if (recibos.length) setSelectedId(recibos[0].id);
          return;
        }
        if (codigo) {
          setBusquedaCodigo(codigo);
        }
      } finally {
        setCargandoRecientes(false);
      }
    },
    [organizacionId]
  );

  useEffect(() => {
    cortejosCacheRef.current = null;
    const compraId = searchParams.get('compra')?.trim() || '';
    const codigoParam = searchParams.get('codigo')?.trim() || '';
    if (compraId || codigoParam) {
      cargarReciboDirecto({ compraId, codigo: codigoParam });
    } else {
      cargarRecientes();
    }
  }, [organizacionId, searchParams, cargarRecientes, cargarReciboDirecto]);

  const verUltimasVentas = () => {
    setSearchParams({});
  };

  const handleBuscarDevoto = async (e) => {
    e?.preventDefault();
    const q = busquedaDevoto.trim();
    if (!q) {
      setRecibosBusqueda(null);
      setMsgBusqueda('');
      setReciboPorCodigo(null);
      return;
    }
    setBuscandoDevoto(true);
    setMsgBusqueda('');
    setReciboPorCodigo(null);
    setBusquedaCodigo('');
    try {
      const res = await buscarRecibosImpresion(organizacionId, q);
      if (res.error) {
        setMsgBusqueda(res.error);
        setRecibosBusqueda([]);
        return;
      }
      const { recibos, cargadoresPorId: map } = aplicarPaqueteRecibos(res);
      setRecibosBusqueda(recibos);
      setCargadoresPorId((prev) => ({ ...prev, ...map }));
      setMsgBusqueda(res.mensaje || (recibos.length ? '' : 'Sin resultados.'));
      if (recibos.length) setSelectedId(recibos[0].id);
    } finally {
      setBuscandoDevoto(false);
    }
  };

  useEffect(() => {
    const codigo = extraerCodigoBoleta(busquedaCodigo);
    if (!/^V[RT]-[A-Z0-9]+$/i.test(codigo)) {
      if (!soloReciboVenta || recibosRecientes.length) {
        setReciboPorCodigo(null);
      }
      return undefined;
    }

    let cancelado = false;
    setBuscandoCodigo(true);
    setRecibosBusqueda(null);
    if (!soloReciboVenta) setMsgBusqueda('');
    (async () => {
      const res = await buscarBoletaPorCodigo(organizacionId, codigo);
      if (cancelado) return;
      setBuscandoCodigo(false);
      if (res.error) {
        setReciboPorCodigo(null);
        setMsgBusqueda(res.error);
        return;
      }
      const recibo = reciboDesdeBusqueda(res);
      setReciboPorCodigo(recibo);
      if (res.cargador) {
        setCargadoresPorId((prev) => ({ ...prev, [res.cargador.id]: res.cargador }));
      }
      if (recibo) {
        setSelectedId(recibo.id);
        if (soloReciboVenta) {
          setRecibosRecientes([recibo]);
        }
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [busquedaCodigo, organizacionId, soloReciboVenta, recibosRecientes.length]);

  const recibosLista = useMemo(() => {
    if (reciboPorCodigo) {
      const base = recibosBusqueda ?? recibosRecientes;
      if (base.some((r) => r.id === reciboPorCodigo.id)) return base;
      return [reciboPorCodigo, ...base];
    }
    if (recibosBusqueda !== null) return recibosBusqueda;
    return recibosRecientes;
  }, [recibosRecientes, recibosBusqueda, reciboPorCodigo]);

  const reciboSel = useMemo(
    () => recibosLista.find((r) => r.id === selectedId) || null,
    [recibosLista, selectedId]
  );

  useEffect(() => {
    if (!recibosLista.length) {
      setSelectedId(null);
      return;
    }
    setSelectedId((prev) =>
      prev && recibosLista.some((r) => r.id === prev) ? prev : recibosLista[0].id
    );
  }, [recibosLista]);

  useEffect(() => {
    setMsgReenvio(null);
    (async () => {
      if (!reciboSel) {
        setDetalle({ cargador: null, cortejo: null, items: [], compra: null });
        return;
      }
      const cargador = cargadoresPorId[reciboSel.brazos[0]?.cargador_id] || null;
      const turnoIds = reciboSel.brazos.map((b) => b.turno_id);
      const [turnosMap, cortejos] = await Promise.all([
        getTurnosByIds(turnoIds),
        cortejosCacheRef.current
          ? Promise.resolve(cortejosCacheRef.current)
          : getCortejosByOrg(organizacionId).then((c) => {
              cortejosCacheRef.current = c;
              return c;
            }),
      ]);
      const items = reciboSel.brazos.map((b) => ({
        brazo: b,
        turno: turnosMap[b.turno_id] || null,
      }));
      const cortejo =
        cortejos.find((c) => c.id === items[0]?.turno?.cortejo_id) || null;
      setDetalle({
        cargador,
        cortejo,
        items,
        compra: reciboSel.compra,
      });
    })();
  }, [reciboSel, organizacionId, cargadoresPorId]);

  const { cargador, cortejo, items, compra } = detalle;

  const codigoBoletaPublica = reciboSel
    ? codigoReciboDisplay(reciboSel.compra, reciboSel.brazos)
    : null;

  const enlaceWhatsapp =
    reciboSel && cargador
      ? construirEnlaceBoletaWhatsapp({
          cargador,
          brazo: reciboSel.brazos[0],
          turno: items[0]?.turno,
          cortejo,
          organizacion,
          items,
          compra,
        })
      : null;

  const handlePrint = () => window.print();

  const abrirEditarDevoto = () => {
    if (!cargador) return;
    setErrorDevoto('');
    setOkDevoto('');
    setDevotoEditando(cargador);
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
      setCargadoresPorId((prev) => ({ ...prev, [res.data.id]: res.data }));
      setDetalle((prev) =>
        prev.cargador?.id === res.data.id ? { ...prev, cargador: res.data } : prev
      );
      setDevotoEditando(null);
      setOkDevoto(`Datos de ${res.data.nombre_completo} actualizados.`);
    } finally {
      setGuardandoDevoto(false);
    }
  };

  const handleReenviarCorreo = async () => {
    if (!reciboSel || !cargador) return;
    setEnviandoCorreo(true);
    setMsgReenvio(null);
    try {
      const res = await enviarBoletaPorCorreo({
        organizacionId,
        organizacion,
        cargador,
        brazo: reciboSel.brazos[0],
        turno: items[0]?.turno,
        cortejo,
        items,
        compra,
        forzarEnvio: true,
      });
      if (res.ok) {
        setMsgReenvio({
          tipo: 'ok',
          texto: res.demo
            ? `Correo simulado (demo) a ${res.destinatario}`
            : `Correo enviado a ${res.destinatario}`,
        });
      } else {
        setMsgReenvio({
          tipo: 'error',
          texto: res.error || res.motivo || 'No se pudo enviar el correo',
        });
      }
    } finally {
      setEnviandoCorreo(false);
    }
  };

  const tituloLista = soloReciboVenta
    ? 'Boleta de esta venta'
    : reciboPorCodigo !== null
      ? 'Boleta por código'
      : recibosBusqueda !== null
        ? 'Resultados de búsqueda'
        : `Últimas ${IMPRESION_RECIBOS_RECIENTES} ventas`;

  return (
    <Layout
      title="Impresión de boletas"
      subtitle="Últimas ventas o búsqueda puntual por devoto(a)"
      className="app-content--impresion"
    >
      {okDevoto && <div className="alert alert--success no-print">{okDevoto}</div>}

      <div className="impresion-page">
        <aside className="impresion-page__side no-print">
          {organizacion?.subdominio_slug && (
            <details className="impresion-enlace-publico">
              <summary>Enlace público «Ver mis turnos»</summary>
              <code>
                {typeof window !== 'undefined'
                  ? `${window.location.origin}/mis-turnos/${organizacion.subdominio_slug}`
                  : `/mis-turnos/${organizacion.subdominio_slug}`}
              </code>
            </details>
          )}

          <div className="impresion-toolbar">
            <div className="impresion-toolbar__head">
              <span className="impresion-toolbar__titulo">{tituloLista}</span>
              {(recibosBusqueda !== null || soloReciboVenta) && (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={verUltimasVentas}
                >
                  Últimas {IMPRESION_RECIBOS_RECIENTES}
                </button>
              )}
              {recibosBusqueda !== null && !soloReciboVenta && (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => {
                    setBusquedaDevoto('');
                    setRecibosBusqueda(null);
                    setMsgBusqueda('');
                    cargarRecientes();
                  }}
                >
                  Volver
                </button>
              )}
            </div>

            {cargandoRecientes ? (
              <p className="text-muted impresion-toolbar__hint">Cargando…</p>
            ) : recibosLista.length > 0 ? (
              <label className="impresion-toolbar__campo">
                Recibo
                <select value={selectedId || ''} onChange={(e) => setSelectedId(e.target.value)}>
                  {recibosLista.map((r) => (
                    <option key={r.id} value={r.id}>
                      {etiquetaRecibo(r, cargadoresPorId)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="text-muted impresion-toolbar__hint">
                {soloReciboVenta ? 'No se pudo cargar la boleta.' : 'Sin ventas recientes.'}
              </p>
            )}

            <form onSubmit={handleBuscarDevoto} className="impresion-toolbar__busqueda">
              <label className="impresion-toolbar__campo">
                {TERMINO_DEVOTO}(a)
                <input
                  type="search"
                  value={busquedaDevoto}
                  onChange={(e) => setBusquedaDevoto(e.target.value)}
                  placeholder="Nombre, CUI o WhatsApp"
                  autoComplete="off"
                />
              </label>
              <button
                type="submit"
                className="btn btn--primary btn--sm"
                disabled={buscandoDevoto || !busquedaDevoto.trim()}
              >
                {buscandoDevoto ? '…' : 'Buscar'}
              </button>
            </form>

            <label className="impresion-toolbar__campo">
              Código VR- / VT-
              <input
                type="search"
                value={busquedaCodigo}
                onChange={(e) => {
                  setBusquedaCodigo(e.target.value);
                  setBusquedaDevoto('');
                }}
                placeholder="VR-… o VT-…"
                autoComplete="off"
              />
            </label>

            {msgBusqueda && (
              <p className="impresion-toolbar__hint impresion-toolbar__hint--warn">{msgBusqueda}</p>
            )}
            {buscandoCodigo && (
              <p className="impresion-toolbar__hint">Buscando por código…</p>
            )}

            <div className="impresion-toolbar__acciones">
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={handlePrint}
                disabled={!reciboSel}
              >
                Imprimir
              </button>
              {codigoBoletaPublica && (
                <Link
                  to={`/boleta/${codigoBoletaPublica}`}
                  className="btn btn--ghost btn--sm"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Ver digital
                </Link>
              )}
              {(hasPermiso('config_recibo') || hasPermiso('config_correo')) && (
                <Link to="/config/recibo" className="btn btn--ghost btn--sm">
                  Diseño
                </Link>
              )}
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setReenvioMasivoAbierto(true)}
              >
                Reenvío masivo
              </button>
            </div>
          </div>

          {reciboSel && (
            <div className="impresion-reenvio impresion-reenvio--compact">
              <div className="impresion-reenvio__info">
                <strong>{cargador?.nombre_completo || 'Devoto(a)'}</strong>
                {cargador?.correo && <span className="text-muted"> · {cargador.correo}</span>}
              </div>
              <div className="impresion-reenvio__botones">
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={abrirEditarDevoto}
                  disabled={!cargador}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={handleReenviarCorreo}
                  disabled={enviandoCorreo || !cargador?.correo?.trim()}
                >
                  {enviandoCorreo ? '…' : 'Correo'}
                </button>
                {enlaceWhatsapp ? (
                  <a
                    href={enlaceWhatsapp}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn--whatsapp btn--sm"
                  >
                    WhatsApp
                  </a>
                ) : null}
              </div>
              {msgReenvio && (
                <p
                  className={
                    msgReenvio.tipo === 'ok'
                      ? 'impresion-reenvio__msg impresion-reenvio__msg--ok'
                      : 'impresion-reenvio__msg impresion-reenvio__msg--error'
                  }
                >
                  {msgReenvio.texto}
                </p>
              )}
            </div>
          )}

          <p className="impresion-print-tip">
            PDF: desactive encabezados, active gráficos de fondo.
          </p>
        </aside>

        <main className="impresion-page__main">
          {reciboSel ? (
            <div className="impresion-boleta print-area">
              <BoletaContraseñaTurno
                organizacion={organizacion}
                brazo={reciboSel.brazos[0]}
                turno={items[0]?.turno}
                items={items}
                compra={compra}
                cortejo={cortejo}
                cargador={cargador}
              />
              <p className="text-muted impresion-hint no-print">
                {reciboSel.brazos.length} turno(s) ·{' '}
                {reciboSel.brazos.map((b) => (
                  <StatusBadge key={b.id} status={b.estado_entrega} />
                ))}
              </p>
            </div>
          ) : (
            !cargandoRecientes && (
              <p className="text-muted impresion-page__vacio no-print">
                Seleccione un recibo o busque por {TERMINO_DEVOTO.toLowerCase()}(a) / código.
              </p>
            )
          )}
        </main>
      </div>

      <EditDevotoModal
        abierto={Boolean(devotoEditando)}
        devoto={devotoEditando}
        guardando={guardandoDevoto}
        errorGuardar={errorDevoto}
        onGuardar={handleGuardarDevoto}
        onCerrar={() => !guardandoDevoto && setDevotoEditando(null)}
      />

      <ReenvioMasivoModal
        abierto={reenvioMasivoAbierto}
        onCerrar={() => setReenvioMasivoAbierto(false)}
        recibosTodos={recibosLista}
        recibosFiltrados={recibosLista}
        cargadoresPorId={cargadoresPorId}
        organizacionId={organizacionId}
        organizacion={organizacion}
        hayFiltroActivo={recibosBusqueda !== null || Boolean(reciboPorCodigo)}
      />
    </Layout>
  );
}
