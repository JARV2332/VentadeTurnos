import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import Loader from '../components/Loader';
import { useAuth } from '../context/AuthContext';
import { getCargadoresByOrg, getCorreosEnviados } from '../services/dataService';
import { ejecutarCorreoMasivo } from '../services/correoMasivoService';
import {
  construirDestinatariosCorreoMasivo,
  leerImagenComoBase64,
} from '../utils/correoMasivoUtils';
import {
  DELAY_DEFAULT_SEG,
  DELAY_OPCIONES_SEG,
  formatearDuracionEstimada,
} from '../utils/reenvioMasivoUtils';
import { exportarErroresCsv } from '../utils/correoHistorialUtils';

const MODOS = [
  {
    value: 'exitosos',
    label: 'Solo correos que ya recibieron bien (recomendado)',
  },
  {
    value: 'excepto_fallidos',
    label: 'Todos los devotos con correo, excepto los que dieron error',
  },
];

export default function CorreoMasivo() {
  const { organizacionId, organizacion } = useAuth();
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [historial, setHistorial] = useState([]);
  const [cargadores, setCargadores] = useState([]);
  const [modo, setModo] = useState('exitosos');
  const [asunto, setAsunto] = useState('Novenario — Nuestra Señora de la Asunción');
  const [texto, setTexto] = useState(
    'Estimado/a {nombre},\n\nCompartimos con usted el rezo del novenario.\n\nQue Nuestra Señora de la Asunción interceda por usted y su familia.\n'
  );
  const [imagen, setImagen] = useState(null);
  const [delaySeg, setDelaySeg] = useState(DELAY_DEFAULT_SEG);
  const [enviando, setEnviando] = useState(false);
  const [progreso, setProgreso] = useState(null);
  const [resultado, setResultado] = useState(null);
  const cancelRef = useRef({ cancelled: false });

  const cargar = useCallback(async () => {
    if (!organizacionId) return;
    setCargando(true);
    setError('');
    try {
      const [correos, listaCargadores] = await Promise.all([
        getCorreosEnviados(organizacionId),
        getCargadoresByOrg(organizacionId),
      ]);
      setHistorial(Array.isArray(correos) ? correos : []);
      setCargadores(Array.isArray(listaCargadores) ? listaCargadores : []);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los destinatarios.');
    } finally {
      setCargando(false);
    }
  }, [organizacionId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const { incluidos, excluidos } = useMemo(
    () => construirDestinatariosCorreoMasivo({ historial, cargadores, modo }),
    [historial, cargadores, modo]
  );

  const estimado = formatearDuracionEstimada(incluidos.length, delaySeg);

  const onElegirImagen = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    try {
      const data = await leerImagenComoBase64(file);
      setImagen(data);
    } catch (err) {
      setImagen(null);
      setError(err.message || 'No se pudo cargar la imagen.');
    }
  };

  const handleEnviar = async () => {
    if (!asunto.trim()) {
      setError('Escriba el asunto del correo.');
      return;
    }
    if (!texto.trim()) {
      setError('Escriba el texto del rezo o mensaje.');
      return;
    }
    if (!incluidos.length) {
      setError('No hay destinatarios válidos con este filtro.');
      return;
    }
    if (
      !window.confirm(
        `Se enviarán ${incluidos.length} correos uno por uno (pausa ${delaySeg}s). Estimado ${estimado}.\n\n¿Continuar?`
      )
    ) {
      return;
    }

    cancelRef.current = { cancelled: false };
    setEnviando(true);
    setResultado(null);
    setError('');
    setProgreso({ fase: 'enviando', indice: 0, total: incluidos.length });

    const res = await ejecutarCorreoMasivo({
      organizacionId,
      organizacion,
      destinatarios: incluidos,
      asunto: asunto.trim(),
      texto,
      imagen,
      delaySegundos: delaySeg,
      signal: cancelRef.current,
      onProgress: setProgreso,
    });

    setResultado(res);
    setEnviando(false);
    setProgreso(null);
    await cargar();
  };

  const pct =
    progreso?.total > 0 ? Math.round((progreso.indice / progreso.total) * 100) : 0;

  return (
    <Layout
      title="Correo masivo (novenario)"
      subtitle="Texto libre e imagen a correos que sí funcionan"
    >
      <p className="text-muted config-hint" style={{ marginBottom: '1rem' }}>
        <Link to="/config/correo">← Volver a Correo y boletas</Link>
        {' · '}
        Gmail tiene límite diario: use pausa de 5 s o más. Los correos con error o rebote se
        excluyen automáticamente.
      </p>

      {error && <div className="alert alert--error">{error}</div>}

      {cargando ? (
        <Loader text="Cargando destinatarios…" />
      ) : (
        <>
          <section className="panel">
            <h3 className="panel__title">Mensaje</h3>
            <div className="listado-turnos__filtros-grid">
              <label style={{ gridColumn: '1 / -1' }}>
                Asunto
                <input
                  type="text"
                  value={asunto}
                  onChange={(e) => setAsunto(e.target.value)}
                  disabled={enviando}
                  maxLength={180}
                />
              </label>
              <label style={{ gridColumn: '1 / -1' }}>
                Texto del rezo / mensaje
                <textarea
                  rows={10}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  disabled={enviando}
                  placeholder="Escriba aquí el novenario…"
                />
              </label>
            </div>
            <p className="text-muted config-hint">
              Puede usar <code>{'{nombre}'}</code> o <code>{'{nombre_completo}'}</code> para
              personalizar.
            </p>

            <label className="config-hint" style={{ display: 'block', marginTop: '0.75rem' }}>
              Imagen adjunta (opcional, máx. 900 KB)
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={onElegirImagen}
                disabled={enviando}
                style={{ display: 'block', marginTop: '0.35rem' }}
              />
            </label>
            {imagen && (
              <div style={{ marginTop: '0.75rem' }}>
                <img
                  src={imagen.previewUrl}
                  alt="Vista previa"
                  style={{
                    maxWidth: '280px',
                    width: '100%',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                  }}
                />
                <div className="listado-turnos__acciones" style={{ marginTop: '0.5rem' }}>
                  <span className="text-muted">
                    {imagen.nombre} · {(imagen.size / 1024).toFixed(0)} KB
                  </span>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    disabled={enviando}
                    onClick={() => setImagen(null)}
                  >
                    Quitar imagen
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="panel" style={{ marginTop: '1rem' }}>
            <h3 className="panel__title">Destinatarios</h3>
            <div className="listado-turnos__filtros-grid">
              <label>
                Quiénes reciben
                <select
                  value={modo}
                  onChange={(e) => setModo(e.target.value)}
                  disabled={enviando}
                >
                  {MODOS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Pausa entre correos
                <select
                  value={delaySeg}
                  onChange={(e) => setDelaySeg(Number(e.target.value))}
                  disabled={enviando}
                >
                  {DELAY_OPCIONES_SEG.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <p className="text-muted config-hint listado-turnos__resumen">
              <strong>{incluidos.length}</strong> destinatario(s) · excluidos por error/rebote:{' '}
              <strong>{excluidos.length}</strong> · tiempo estimado {estimado}
            </p>

            <div className="listado-turnos__acciones">
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={cargar}
                disabled={enviando || cargando}
              >
                Actualizar lista
              </button>
              {!enviando ? (
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={handleEnviar}
                  disabled={!incluidos.length}
                >
                  Enviar a {incluidos.length} correo(s)
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => {
                    cancelRef.current.cancelled = true;
                  }}
                >
                  Cancelar envío
                </button>
              )}
            </div>

            {enviando && progreso && (
              <div className="alert" style={{ marginTop: '0.75rem' }}>
                Enviando {progreso.indice}/{progreso.total} ({pct}%)
                {progreso.etiqueta ? ` · ${progreso.etiqueta}` : ''}
                {progreso.fase === 'espera' ? ' · esperando pausa…' : ''}
              </div>
            )}

            {resultado && (
              <div
                className={`alert ${resultado.error.length ? 'alert--error' : ''}`}
                style={{ marginTop: '0.75rem' }}
              >
                Enviados: <strong>{resultado.ok.length}</strong>
                {' · '}
                Errores: <strong>{resultado.error.length}</strong>
                {resultado.cancelado ? ' · cancelado' : ''}
                {resultado.error.length > 0 && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    style={{ marginLeft: '0.5rem' }}
                    onClick={() =>
                      exportarErroresCsv(
                        resultado.error.map((e) => ({
                          nombre: e.nombre,
                          destinatario: e.correo,
                          codigo: '',
                          error: e.error,
                        }))
                      )
                    }
                  >
                    Exportar errores CSV
                  </button>
                )}
              </div>
            )}

            <div className="table-wrap" style={{ marginTop: '0.75rem', maxHeight: '22rem' }}>
              <table className="data-table data-table--compact">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Correo</th>
                  </tr>
                </thead>
                <tbody>
                  {incluidos.slice(0, 200).map((d) => (
                    <tr key={d.correo}>
                      <td>{d.nombre}</td>
                      <td>{d.correo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {incluidos.length > 200 && (
                <p className="text-muted config-hint">
                  Mostrando 200 de {incluidos.length}. Se enviará a todos.
                </p>
              )}
            </div>
          </section>
        </>
      )}
    </Layout>
  );
}
