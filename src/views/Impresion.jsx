import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import BoletaContraseñaTurno from '../components/BoletaContraseñaTurno';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';
import {
  getBrazosByOrg,
  getCortejosByOrg,
  getCargadoresByOrg,
  getTurnoById,
  subscribeData,
} from '../services/dataService';
import { enviarBoletaPorCorreo } from '../services/emailService';
import { construirEnlaceBoletaWhatsapp } from '../utils/whatsappUtils';
import { localDigitsFromGtPhone } from '../utils/phoneGtUtils';
import { TERMINO_DEVOTO } from '../constants/terminologia';

function normalizarBusqueda(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function filtrarVentas(ventas, cargadoresPorId, busqueda) {
  const q = normalizarBusqueda(busqueda);
  if (!q) return ventas;

  return ventas.filter((v) => {
    const cargador = cargadoresPorId[v.cargador_id];
    const nombre = normalizarBusqueda(cargador?.nombre_completo);
    const cui = normalizarBusqueda(cargador?.cui_o_identificacion);
    const codigo = normalizarBusqueda(v.codigo_boleta_qr);
    const turno = String(v.numero_turno ?? '');
    return (
      nombre.includes(q) ||
      cui.includes(q) ||
      codigo.includes(q) ||
      turno.includes(q)
    );
  });
}

function etiquetaVenta(v, cargadoresPorId) {
  const nombre = cargadoresPorId[v.cargador_id]?.nombre_completo?.trim() || 'Sin nombre';
  return `${nombre} — Turno ${v.numero_turno} · Brazo ${v.numero_brazo} (${v.codigo_boleta_qr})`;
}

export default function Impresion() {
  const { organizacion, organizacionId, hasPermiso } = useAuth();
  const [ventas, setVentas] = useState([]);
  const [cargadoresPorId, setCargadoresPorId] = useState({});
  const [busqueda, setBusqueda] = useState('');
  const [selected, setSelected] = useState(null);
  const [detalle, setDetalle] = useState({ cargador: null, turno: null, cortejo: null });
  const [enviandoCorreo, setEnviandoCorreo] = useState(false);
  const [msgReenvio, setMsgReenvio] = useState(null);

  const refresh = useCallback(async () => {
    const [brazos, cargadores] = await Promise.all([
      getBrazosByOrg(organizacionId),
      getCargadoresByOrg(organizacionId),
    ]);
    const vendidos = (Array.isArray(brazos) ? brazos : []).filter((b) => b.estado === 'vendido');
    const map = {};
    (Array.isArray(cargadores) ? cargadores : []).forEach((c) => {
      map[c.id] = c;
    });
    setVentas(vendidos);
    setCargadoresPorId(map);
  }, [organizacionId]);

  useEffect(() => {
    refresh();
    return subscribeData(organizacionId, refresh);
  }, [organizacionId, refresh]);

  const ventasFiltradas = useMemo(
    () => filtrarVentas(ventas, cargadoresPorId, busqueda),
    [ventas, cargadoresPorId, busqueda]
  );

  useEffect(() => {
    if (!ventasFiltradas.length) {
      setSelected(null);
      return;
    }
    setSelected((prev) =>
      prev && ventasFiltradas.some((v) => v.id === prev.id) ? prev : ventasFiltradas[0]
    );
  }, [ventasFiltradas]);

  useEffect(() => {
    setMsgReenvio(null);
    (async () => {
      if (!selected) {
        setDetalle({ cargador: null, turno: null, cortejo: null });
        return;
      }
      const cargador = cargadoresPorId[selected.cargador_id] || null;
      const turno = await getTurnoById(selected.turno_id);
      const cortejos = await getCortejosByOrg(organizacionId);
      const cortejo = cortejos.find((c) => c.id === turno?.cortejo_id) || null;
      setDetalle({ cargador, turno, cortejo });
    })();
  }, [selected, organizacionId, cargadoresPorId]);

  const { cargador, turno, cortejo } = detalle;

  const enlaceWhatsapp =
    selected && cargador
      ? construirEnlaceBoletaWhatsapp({
          cargador,
          brazo: selected,
          turno,
          cortejo,
          organizacion,
        })
      : null;

  const handlePrint = () => window.print();

  const handleReenviarCorreo = async () => {
    if (!selected || !cargador) return;
    setEnviandoCorreo(true);
    setMsgReenvio(null);
    try {
      const res = await enviarBoletaPorCorreo({
        organizacionId,
        organizacion,
        cargador,
        brazo: selected,
        turno,
        cortejo,
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

  if (!ventas.length) {
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
            placeholder="Nombre, CUI o código de boleta…"
            autoComplete="off"
          />
          <small className="field-hint">
            {ventasFiltradas.length} de {ventas.length} boleta(s)
          </small>
        </label>

        {ventasFiltradas.length > 0 ? (
          <label>
            Resultado
            <select
              value={selected?.id || ''}
              onChange={(e) =>
                setSelected(ventasFiltradas.find((v) => v.id === e.target.value) || null)
              }
            >
              {ventasFiltradas.map((v) => (
                <option key={v.id} value={v.id}>
                  {etiquetaVenta(v, cargadoresPorId)}
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
            disabled={!selected}
          >
            Imprimir boleta
          </button>
          {(hasPermiso('config_recibo') || hasPermiso('config_correo')) && (
            <Link to="/config/recibo" className="btn btn--ghost">
              Diseño del recibo
            </Link>
          )}
        </div>
      </div>

      {selected && (
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

      {selected ? (
        <div className="impresion-boleta print-area">
          <BoletaContraseñaTurno
            organizacion={organizacion}
            brazo={selected}
            turno={turno}
            cortejo={cortejo}
          />
          <p className="text-muted impresion-hint no-print">
            Estado entrega: <StatusBadge status={selected.estado_entrega} />
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
