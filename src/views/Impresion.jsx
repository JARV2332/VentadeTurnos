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
import { localDigitsFromGtPhone } from '../utils/phoneGtUtils';
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
    <Layout title="Impresión de boletas" subtitle="Últimas ventas o búsqueda puntual por devoto(a)">
      {okDevoto && <div className="alert alert--success no-print">{okDevoto}</div>}
      {organizacion?.subdominio_slug && (
        <div className="info-box no-print mis-turnos-enlace-admin">
          <strong>Enlace público «Ver mis turnos»</strong>
          <p className="text-muted">
            Comparta este enlace en redes sociales para que los devotos descarguen sus boletas con su DPI:
          </p>
          <code>{typeof window !== 'undefined' ? `${window.location.origin}/mis-turnos/${organizacion.subdominio_slug}` : `/mis-turnos/${organizacion.subdominio_slug}`}</code>
        </div>
      )}

      <div className="impresion-controls no-print">
        <section className="impresion-controls__bloque">
          <h3 className="impresion-controls__titulo">{tituloLista}</h3>
          {cargandoRecientes ? (
            <p className="text-muted">Cargando ventas recientes…</p>
          ) : recibosLista.length > 0 ? (
            <label>
              Recibo
              <select
                value={selectedId || ''}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {recibosLista.map((r) => (
                  <option key={r.id} value={r.id}>
                    {etiquetaRecibo(r, cargadoresPorId)}
                  </option>
                ))}
              </select>
              <small className="field-hint">
                {soloReciboVenta
                  ? 'Listo para imprimir. Use el botón Imprimir boleta abajo.'
                  : recibosBusqueda === null && !reciboPorCodigo
                    ? `Mostrando las ${recibosLista.length} ventas más recientes.`
                    : `${recibosLista.length} recibo(s) encontrado(s).`}
              </small>
            </label>
          ) : (
            <p className="text-muted">
              {soloReciboVenta ? 'No se pudo cargar la boleta.' : 'No hay ventas recientes para mostrar.'}
            </p>
          )}
          {(recibosBusqueda !== null || soloReciboVenta) && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={verUltimasVentas}
            >
              Ver últimas {IMPRESION_RECIBOS_RECIENTES} ventas
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
              Volver a últimas ventas
            </button>
          )}
        </section>

        <section className="impresion-controls__bloque">
          <h3 className="impresion-controls__titulo">Buscar otra boleta</h3>
          <form onSubmit={handleBuscarDevoto} className="impresion-controls__busqueda-form">
            <label className="impresion-controls__busqueda">
              {TERMINO_DEVOTO}(a) — nombre, CUI o WhatsApp
              <input
                type="search"
                value={busquedaDevoto}
                onChange={(e) => setBusquedaDevoto(e.target.value)}
                placeholder="Ej. García, 1234567890123 o 55551234"
                autoComplete="off"
              />
            </label>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={buscandoDevoto || !busquedaDevoto.trim()}
            >
              {buscandoDevoto ? 'Buscando…' : 'Buscar'}
            </button>
          </form>
          <label className="impresion-controls__busqueda">
            Código de boleta (VR- / VT-)
            <input
              type="search"
              value={busquedaCodigo}
              onChange={(e) => {
                setBusquedaCodigo(e.target.value);
                setBusquedaDevoto('');
              }}
              placeholder="VR-XXXXXXXX o VT-XXXXXXXX"
              autoComplete="off"
            />
            <small className="field-hint">
              {buscandoCodigo ? 'Buscando por código…' : 'Búsqueda directa por código de recibo.'}
            </small>
          </label>
          {msgBusqueda && (
            <p className="impresion-controls__sin-resultados text-muted">{msgBusqueda}</p>
          )}
        </section>

        <div className="impresion-controls__acciones">
          <button
            type="button"
            className="btn btn--primary"
            onClick={handlePrint}
            disabled={!reciboSel}
          >
            Imprimir boleta
          </button>
          {codigoBoletaPublica && (
            <Link
              to={`/boleta/${codigoBoletaPublica}`}
              className="btn btn--ghost"
              target="_blank"
              rel="noopener noreferrer"
            >
              Ver boleta digital
            </Link>
          )}
          {(hasPermiso('config_recibo') || hasPermiso('config_correo')) && (
            <Link to="/config/recibo" className="btn btn--ghost">
              Diseño del recibo
            </Link>
          )}
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setReenvioMasivoAbierto(true)}
            title="Reenviar boletas por correo con pausa entre envíos"
          >
            Reenvío masivo
          </button>
        </div>
      </div>

      {reciboSel && (
        <div className="impresion-reenvio no-print">
          <div className="impresion-reenvio__info">
            <strong>{cargador?.nombre_completo || 'Devoto(a)'}</strong>
            {cargador?.correo && (
              <span className="text-muted"> · {cargador.correo}</span>
            )}
            {cargador?.whatsapp && (
              <span className="text-muted">
                {' '}
                · +502 {localDigitsFromGtPhone(cargador.whatsapp)}
              </span>
            )}
          </div>
          <div className="impresion-reenvio__botones">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={abrirEditarDevoto}
              disabled={!cargador}
            >
              Editar datos
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={handleReenviarCorreo}
              disabled={enviandoCorreo || !cargador?.correo?.trim()}
              title={!cargador?.correo?.trim() ? 'Sin correo registrado' : undefined}
            >
              {enviandoCorreo ? 'Enviando…' : 'Reenviar correo'}
            </button>
            {enlaceWhatsapp ? (
              <a
                href={enlaceWhatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn--whatsapp"
              >
                Enviar WhatsApp
              </a>
            ) : (
              <span className="text-muted impresion-reenvio__sin-wa">
                Sin WhatsApp válido (+502)
              </span>
            )}
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
          <p className="text-muted no-print">
            Use la búsqueda por {TERMINO_DEVOTO.toLowerCase()}(a) o código VR-/VT- para encontrar una boleta.
          </p>
        )
      )}

      <p className="impresion-print-tip no-print">
        Al imprimir o guardar PDF: desactive <strong>Encabezados y pies de página</strong>, active{' '}
        <strong>Gráficos en segundo plano</strong> y elija <strong>Guardar como PDF</strong>.
      </p>

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
