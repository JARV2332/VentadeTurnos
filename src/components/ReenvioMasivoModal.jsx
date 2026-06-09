import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ejecutarReenvioMasivo } from '../services/reenvioBoletasService';
import {
  DELAY_DEFAULT_SEG,
  DELAY_OPCIONES_SEG,
  analizarColaReenvio,
  formatearDuracionEstimada,
} from '../utils/reenvioMasivoUtils';
import { exportarErroresCsv } from '../utils/correoHistorialUtils';

export default function ReenvioMasivoModal({
  abierto,
  onCerrar,
  recibosTodos,
  recibosFiltrados,
  cargadoresPorId,
  organizacionId,
  organizacion,
  hayFiltroActivo,
}) {
  const [alcance, setAlcance] = useState('filtrados');
  const [delaySeg, setDelaySeg] = useState(DELAY_DEFAULT_SEG);
  const [fase, setFase] = useState('config');
  const [progreso, setProgreso] = useState(null);
  const [resultados, setResultados] = useState(null);
  const signalRef = useRef({ cancelled: false });

  const recibosSeleccionados = useMemo(() => {
    if (alcance === 'todos') return recibosTodos || [];
    return recibosFiltrados || [];
  }, [alcance, recibosTodos, recibosFiltrados]);

  const { conCorreo, sinCorreo } = useMemo(
    () => analizarColaReenvio(recibosSeleccionados, cargadoresPorId),
    [recibosSeleccionados, cargadoresPorId]
  );

  const duracionEstimada = formatearDuracionEstimada(conCorreo.length, delaySeg);

  useEffect(() => {
    if (!abierto) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    setAlcance(hayFiltroActivo ? 'filtrados' : 'todos');
    setDelaySeg(DELAY_DEFAULT_SEG);
    setFase('config');
    setProgreso(null);
    setResultados(null);
    signalRef.current = { cancelled: false };
  }, [abierto, hayFiltroActivo]);

  const handleCerrar = () => {
    if (fase === 'enviando') return;
    onCerrar();
  };

  const handleCancelarEnvio = () => {
    signalRef.current.cancelled = true;
  };

  const handleIniciar = async () => {
    if (!conCorreo.length) return;
    signalRef.current = { cancelled: false };
    setFase('enviando');
    setResultados(null);
    setProgreso({ fase: 'enviando', indice: 0, total: conCorreo.length });

    const res = await ejecutarReenvioMasivo({
      organizacionId,
      organizacion,
      recibos: conCorreo,
      cargadoresPorId,
      delaySegundos: delaySeg,
      signal: signalRef.current,
      onProgress: (p) => {
        setProgreso(p);
        if (p.fase === 'fin' && p.resultados) {
          setResultados(p.resultados);
        }
      },
    });

    setResultados(res);
    setFase('fin');
  };

  if (!abierto) return null;

  const pct =
    progreso?.total > 0
      ? Math.round((progreso.indice / progreso.total) * 100)
      : 0;

  return createPortal(
    <div
      className="modal-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && fase !== 'enviando') handleCerrar();
      }}
    >
      <div
        className="modal-edit-turno modal-edit-turno--wide reenvio-masivo-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reenvio-masivo-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="reenvio-masivo-titulo" className="modal-edit-turno__titulo">
          Reenvío masivo de boletas
        </h2>

        {fase === 'config' && (
          <>
            <p className="text-muted config-hint">
              Se enviará el recibo/boleta por correo a cada devoto(a) con email registrado.
              Entre cada envío hay una pausa para reducir el riesgo de bloqueo por Gmail.
            </p>

            <div className="reenvio-masivo-modal__campo">
              <span className="reenvio-masivo-modal__label">Destinatarios</span>
              <label className="reenvio-masivo-modal__radio">
                <input
                  type="radio"
                  name="alcance-reenvio"
                  value="filtrados"
                  checked={alcance === 'filtrados'}
                  onChange={() => setAlcance('filtrados')}
                  disabled={!hayFiltroActivo && recibosFiltrados?.length === recibosTodos?.length}
                />
                Resultados filtrados ({recibosFiltrados?.length || 0} recibo(s))
              </label>
              <label className="reenvio-masivo-modal__radio">
                <input
                  type="radio"
                  name="alcance-reenvio"
                  value="todos"
                  checked={alcance === 'todos'}
                  onChange={() => setAlcance('todos')}
                />
                Todos los recibos ({recibosTodos?.length || 0})
              </label>
            </div>

            <label className="reenvio-masivo-modal__campo">
              <span className="reenvio-masivo-modal__label">Pausa entre correos</span>
              <select value={delaySeg} onChange={(e) => setDelaySeg(Number(e.target.value))}>
                {DELAY_OPCIONES_SEG.map((op) => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="reenvio-masivo-modal__resumen">
              <p>
                <strong>{conCorreo.length}</strong> correo(s) a enviar
                {sinCorreo.length > 0 && (
                  <span className="text-muted">
                    {' '}
                    · {sinCorreo.length} sin correo (se omiten)
                  </span>
                )}
              </p>
              <p className="text-muted">
                Duración estimada: {duracionEstimada}
                {conCorreo.length > 50 && delaySeg < 10 && (
                  <span className="reenvio-masivo-modal__aviso">
                    {' '}
                    — Con muchos destinatarios, use 10 s o más.
                  </span>
                )}
              </p>
            </div>

            <p className="reenvio-masivo-modal__gmail-hint text-muted">
              Gmail puede limitar cuentas que envían muchos correos seguidos. No cierre esta ventana
              mientras el proceso esté en curso.
            </p>

            <div className="modal-edit-turno__actions">
              <button type="button" className="btn btn--ghost" onClick={handleCerrar}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleIniciar}
                disabled={!conCorreo.length}
              >
                Iniciar reenvío ({conCorreo.length})
              </button>
            </div>
          </>
        )}

        {fase === 'enviando' && (
          <>
            <p className="reenvio-masivo-modal__estado">
              Enviando {progreso?.indice || 0} de {progreso?.total || conCorreo.length}…
            </p>
            {progreso?.etiqueta && (
              <p className="text-muted reenvio-masivo-modal__actual">
                {progreso.etiqueta}
                {progreso.destinatario && (
                  <span> · {progreso.destinatario}</span>
                )}
              </p>
            )}
            {progreso?.fase === 'espera' && (
              <p className="text-muted reenvio-masivo-modal__espera">
                Esperando {delaySeg} s antes del siguiente envío…
              </p>
            )}
            <div className="reenvio-masivo-modal__barra" aria-hidden="true">
              <div className="reenvio-masivo-modal__barra-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="modal-edit-turno__actions">
              <button type="button" className="btn btn--ghost" onClick={handleCancelarEnvio}>
                Detener después del actual
              </button>
            </div>
          </>
        )}

        {fase === 'fin' && resultados && (
          <>
            <div className="reenvio-masivo-modal__resumen reenvio-masivo-modal__resumen--fin">
              <p>
                <strong className="reenvio-masivo-modal__ok">{resultados.ok.length} enviado(s)</strong>
                {resultados.error.length > 0 && (
                  <span className="reenvio-masivo-modal__error">
                    {' '}
                    · {resultados.error.length} error(es)
                  </span>
                )}
                {resultados.cancelado && (
                  <span className="text-muted"> · Detenido antes de terminar</span>
                )}
              </p>
            </div>

            {resultados.error.length > 0 && (
              <>
                <ul className="reenvio-masivo-modal__errores">
                  {resultados.error.map((e) => (
                    <li key={e.reciboId}>
                      <strong>{e.nombre || e.etiqueta}</strong>
                      {e.destinatario && <span> · {e.destinatario}</span>}
                      {e.codigo && <span> · {e.codigo}</span>}
                      <br />
                      {e.error}
                    </li>
                  ))}
                </ul>
                <p className="text-muted reenvio-masivo-modal__rebote-hint">
                  Si Gmail aceptó el correo pero rebotó después, revise la bandeja del remitente
                  (&quot;No entregado&quot;) y marque esos casos en{' '}
                  <strong>Configuración → Correo → Historial</strong>.
                </p>
              </>
            )}

            <div className="modal-edit-turno__actions">
              {resultados.error.length > 0 && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => exportarErroresCsv(resultados.error)}
                >
                  Descargar errores (CSV)
                </button>
              )}
              <button type="button" className="btn btn--primary" onClick={handleCerrar}>
                Cerrar
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
