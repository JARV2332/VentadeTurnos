import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import BoletaContraseñaTurno from '../components/BoletaContraseñaTurno';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';
import {
  getBrazosVendidosByOrg,
  getComprasByOrg,
  getCortejosByOrg,
  getCargadoresByOrg,
  getTurnoById,
  buscarBoletaPorCodigo,
  subscribeData,
} from '../services/dataService';
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

function filtrarRecibos(recibos, cargadoresPorId, busqueda) {
  const q = normalizarBusqueda(busqueda);
  const qCodigo = normalizarBusqueda(extraerCodigoBoleta(busqueda));
  if (!q && !qCodigo) return recibos;
  return recibos.filter((r) => {
    const cargador = cargadoresPorId[r.brazos[0]?.cargador_id];
    const nombre = normalizarBusqueda(cargador?.nombre_completo);
    const cui = normalizarBusqueda(cargador?.cui_o_identificacion);
    const codigoRecibo = normalizarBusqueda(
      codigoReciboDisplay(r.compra, r.brazos)
    );
    const codigos = r.brazos.map((b) => normalizarBusqueda(b.codigo_boleta_qr)).join(' ');
    const consulta = q || qCodigo;
    return (
      nombre.includes(consulta) ||
      cui.includes(consulta) ||
      codigoRecibo.includes(consulta) ||
      (qCodigo && codigoRecibo.includes(qCodigo)) ||
      codigos.includes(consulta) ||
      (qCodigo && codigos.includes(qCodigo))
    );
  });
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

function normalizarBusqueda(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export default function Impresion() {
  const { organizacion, organizacionId, hasPermiso } = useAuth();
  const [recibos, setRecibos] = useState([]);
  const [cargadoresPorId, setCargadoresPorId] = useState({});
  const [busqueda, setBusqueda] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [detalle, setDetalle] = useState({
    cargador: null,
    cortejo: null,
    items: [],
    compra: null,
  });
  const [enviandoCorreo, setEnviandoCorreo] = useState(false);
  const [msgReenvio, setMsgReenvio] = useState(null);
  const [reciboPorCodigo, setReciboPorCodigo] = useState(null);
  const [buscandoCodigo, setBuscandoCodigo] = useState(false);

  const refresh = useCallback(async () => {
    const [brazos, cargadores, compras] = await Promise.all([
      getBrazosVendidosByOrg(organizacionId),
      getCargadoresByOrg(organizacionId),
      getComprasByOrg(organizacionId),
    ]);
    const vendidos = Array.isArray(brazos) ? brazos : [];
    const map = {};
    (Array.isArray(cargadores) ? cargadores : []).forEach((c) => {
      map[c.id] = c;
    });
    const comprasMap = {};
    (Array.isArray(compras) ? compras : []).forEach((c) => {
      comprasMap[c.id] = c;
    });
    setRecibos(agruparRecibos(vendidos, comprasMap));
    setCargadoresPorId(map);
  }, [organizacionId]);

  useEffect(() => {
    refresh();
    return subscribeData(organizacionId, refresh);
  }, [organizacionId, refresh]);

  useEffect(() => {
    const codigo = extraerCodigoBoleta(busqueda);
    if (!/^V[RT]-[A-Z0-9]+$/i.test(codigo)) {
      setReciboPorCodigo(null);
      return undefined;
    }

    let cancelado = false;
    setBuscandoCodigo(true);
    (async () => {
      const res = await buscarBoletaPorCodigo(organizacionId, codigo);
      if (cancelado) return;
      setBuscandoCodigo(false);
      if (res.error) {
        setReciboPorCodigo(null);
        return;
      }
      const recibo = reciboDesdeBusqueda(res);
      setReciboPorCodigo(recibo);
      if (recibo) setSelectedId(recibo.id);
    })();

    return () => {
      cancelado = true;
    };
  }, [busqueda, organizacionId]);

  const recibosLista = useMemo(() => {
    if (!reciboPorCodigo) return recibos;
    if (recibos.some((r) => r.id === reciboPorCodigo.id)) return recibos;
    return [reciboPorCodigo, ...recibos];
  }, [recibos, reciboPorCodigo]);

  const recibosFiltrados = useMemo(
    () => filtrarRecibos(recibosLista, cargadoresPorId, busqueda),
    [recibosLista, cargadoresPorId, busqueda]
  );

  const reciboSel = useMemo(
    () => recibosFiltrados.find((r) => r.id === selectedId) || null,
    [recibosFiltrados, selectedId]
  );

  useEffect(() => {
    if (!recibosFiltrados.length) {
      setSelectedId(null);
      return;
    }
    setSelectedId((prev) =>
      prev && recibosFiltrados.some((r) => r.id === prev) ? prev : recibosFiltrados[0].id
    );
  }, [recibosFiltrados]);

  useEffect(() => {
    setMsgReenvio(null);
    (async () => {
      if (!reciboSel) {
        setDetalle({ cargador: null, cortejo: null, items: [], compra: null });
        return;
      }
      const cargador = cargadoresPorId[reciboSel.brazos[0]?.cargador_id] || null;
      const cortejos = await getCortejosByOrg(organizacionId);
      const items = await Promise.all(
        reciboSel.brazos.map(async (b) => ({
          brazo: b,
          turno: await getTurnoById(b.turno_id),
        }))
      );
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

  if (!recibos.length) {
    return (
      <Layout title="Impresión de boletas" subtitle="Boleta con QR para validación y entrega">
        <p className="text-muted">No hay ventas confirmadas para imprimir.</p>
      </Layout>
    );
  }

  return (
    <Layout title="Impresión de boletas" subtitle="Busque por devoto(a), imprima o reenvíe boleta">
      <div className="impresion-controls no-print">
        <label className="impresion-controls__busqueda">
          Buscar {TERMINO_DEVOTO.toLowerCase()}
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Nombre, CUI o código VR- / VT-…"
            autoComplete="off"
          />
          <small className="field-hint">
            {buscandoCodigo
              ? 'Buscando por código…'
              : `${recibosFiltrados.length} de ${recibosLista.length} recibo(s)`}
          </small>
        </label>

        {recibosFiltrados.length > 0 ? (
          <label>
            Resultado
            <select
              value={selectedId || ''}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {recibosFiltrados.map((r) => (
                <option key={r.id} value={r.id}>
                  {etiquetaRecibo(r, cargadoresPorId)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="impresion-controls__sin-resultados text-muted">
            No hay coincidencias. Limpie la búsqueda o pruebe otro nombre.
          </p>
        )}

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
        <p className="text-muted no-print">Ajuste la búsqueda para ver una boleta.</p>
      )}

      <p className="impresion-print-tip no-print">
        Al imprimir o guardar PDF: desactive <strong>Encabezados y pies de página</strong>, active{' '}
        <strong>Gráficos en segundo plano</strong> y elija <strong>Guardar como PDF</strong>.
      </p>
    </Layout>
  );
}
