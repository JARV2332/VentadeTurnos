import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import BoletaRecibo from '../components/BoletaRecibo';
import BoletaContraseñaTurno from '../components/BoletaContraseñaTurno';
import ReciboCanvasEditor from '../components/recibo/ReciboCanvasEditor';
import { useAuth } from '../context/AuthContext';
import { getReciboConfig, saveReciboConfig, getCortejosByOrg } from '../services/dataService';
import { leerImagenComoDataUrl } from '../utils/pagoUtils';
import { getDefaultLayout } from '../constants/reciboLayout';
import {
  DEFAULT_RECIBO_CONFIG,
  FORMATOS_RECIBO,
  mergeReciboConfig,
} from '../constants/reciboDefaults';

const DEMO_BOLETA = {
  cargador: {
    nombre_completo: 'María José Álvarez López',
    cui_o_identificacion: '2998722460101',
  },
  brazo: {
    numero_turno: 1,
    codigo_boleta_qr: 'VT-DEMO0001',
    precio_pagado: 250,
    estado_entrega: 'pendiente',
  },
  turno: {
    tipo_turno: 'Salida',
    etiqueta: 'Salida',
    precio: 250,
    son: 'Himno De La Asunción / Las Tortugas',
    alabado: 'La Granadera / La Patrona De Mi Pueblo',
  },
};

export default function ConfigRecibo() {
  const { organizacionId, organizacion } = useAuth();
  const [diseño, setDiseño] = useState({ ...DEFAULT_RECIBO_CONFIG });
  const [okMsg, setOkMsg] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [cortejoDemo, setCortejoDemo] = useState(null);

  const setCampo = (campo, valor) => setDiseño((d) => ({ ...d, [campo]: valor }));

  const cambiarFormato = (nuevoFormato) => {
    setDiseño((d) => {
      if (d.formato === nuevoFormato) return d;
      const layout = getDefaultLayout(nuevoFormato);
      return { ...d, formato: nuevoFormato, layout };
    });
  };

  const setLayout = (layout) => setDiseño((d) => ({ ...d, layout, editor_visual: true }));

  const refresh = useCallback(async () => {
    const saved = await getReciboConfig(organizacionId);
    if (saved?.error) {
      setError(saved.error);
      setDiseño(mergeReciboConfig(null));
    } else {
      setDiseño(mergeReciboConfig(saved));
    }
    const cortejos = await getCortejosByOrg(organizacionId);
    setCortejoDemo(
      cortejos[0] || {
        nombre_evento: 'Inscripciones Procesión Patronal',
        fecha: '2026-08-15',
      }
    );
  }, [organizacionId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleLogo = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    try {
      const dataUrl = await leerImagenComoDataUrl(file);
      setCampo('logo_url', dataUrl);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setGuardando(true);
    try {
      const res = await saveReciboConfig(organizacionId, {
        formato: diseño.formato,
        diseño: { ...diseño },
      });
      if (res?.error) {
        setError(res.error);
        return;
      }
      setOkMsg('Diseño de recibo guardado. Se aplicará en impresión y correos.');
      setTimeout(() => setOkMsg(''), 5000);
    } finally {
      setGuardando(false);
    }
  };

  const configPreview = mergeReciboConfig({ formato: diseño.formato, diseño });

  return (
    <Layout
      title="Diseño de recibos"
      subtitle="Personalice boletas térmicas o media carta con su logo y textos"
    >
      {okMsg && <div className="alert alert--success">{okMsg}</div>}
      {error && <div className="alert alert--error">{error}</div>}

      <p className="text-muted recibo-config-intro">
        Cada boleta lleva un <strong>código QR único</strong> (ej. VT-…) para validar en entrega.
        Configure el aspecto visual aquí; la impresión usa el formato elegido.
      </p>

      <div className="config-grid config-grid--wide recibo-config-grid">
        <form className="panel config-form" onSubmit={handleSave}>
          <h3 className="panel__title">Plantilla</h3>

          <fieldset className="config-seccion">
            <legend>Formato de impresión</legend>
            <div className="formato-recibo-opciones">
              {FORMATOS_RECIBO.map((f) => (
                <label key={f.id} className="formato-recibo-opcion">
                  <input
                    type="radio"
                    name="formato"
                    value={f.id}
                    checked={diseño.formato === f.id}
                    onChange={() => cambiarFormato(f.id)}
                  />
                  <span>
                    <strong>{f.label}</strong>
                    <small>{f.descripcion}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="config-seccion">
            <legend>Logo</legend>
            <p className="config-seccion__desc">PNG o JPG recomendado, fondo transparente si puede.</p>
            {diseño.logo_url ? (
              <div className="recibo-logo-preview">
                <img src={diseño.logo_url} alt="Logo" style={{ maxWidth: diseño.logo_ancho_px }} />
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setCampo('logo_url', null)}
                >
                  Quitar logo
                </button>
              </div>
            ) : (
              <label className="btn btn--secondary btn--sm">
                Subir logo
                <input type="file" accept="image/*" hidden onChange={handleLogo} />
              </label>
            )}
            <label>
              Ancho del logo (px)
              <input
                type="number"
                min={40}
                max={400}
                value={diseño.logo_ancho_px}
                onChange={(e) => setCampo('logo_ancho_px', Number(e.target.value))}
              />
            </label>
            <label>
              Alineación del logo
              <select
                value={diseño.logo_alineacion}
                onChange={(e) => setCampo('logo_alineacion', e.target.value)}
              >
                <option value="centro">Centro</option>
                <option value="izquierda">Izquierda</option>
              </select>
            </label>
          </fieldset>

          <fieldset className="config-seccion">
            <legend>Textos y colores</legend>
            <label>
              Título (vacío = nombre de la organización)
              <input
                type="text"
                value={diseño.titulo_personalizado}
                onChange={(e) => setCampo('titulo_personalizado', e.target.value)}
                placeholder={organizacion?.nombre_oficial}
              />
            </label>
            <label>
              Mensaje bajo el QR
              <input
                type="text"
                value={diseño.mensaje_qr}
                onChange={(e) => setCampo('mensaje_qr', e.target.value)}
              />
            </label>
            <label>
              Pie de boleta (opcional)
              <textarea
                rows={2}
                value={diseño.pie_texto}
                onChange={(e) => setCampo('pie_texto', e.target.value)}
                placeholder="Ej. No transferible · Gracias por su fe"
              />
            </label>
            <div className="form-row form-row--2">
              <label>
                Color principal
                <input
                  type="color"
                  value={diseño.color_primario}
                  onChange={(e) => setCampo('color_primario', e.target.value)}
                />
              </label>
              <label>
                Tamaño de texto
                <select
                  value={diseño.tamano_fuente}
                  onChange={(e) => setCampo('tamano_fuente', e.target.value)}
                >
                  <option value="compacto">Compacto</option>
                  <option value="normal">Normal</option>
                  <option value="grande">Grande</option>
                </select>
              </label>
            </div>
          </fieldset>

          <fieldset className="config-seccion">
            <legend>Contraseña formal (media carta)</legend>
            <p className="config-seccion__desc">
              Estilo de inscripción procesional. El logo se sube arriba. Sin dirección, De: ni Autor:.
            </p>
            <label>
              Saludo superior
              <input
                type="text"
                value={diseño.encabezado_saludo || ''}
                onChange={(e) => setCampo('encabezado_saludo', e.target.value)}
              />
            </label>
            <label>
              Línea pastoral (debajo del nombre de la parroquia)
              <input
                type="text"
                value={diseño.linea_pastoral || ''}
                onChange={(e) => setCampo('linea_pastoral', e.target.value)}
              />
            </label>
            <label>
              Título inscripción (vacío = nombre del evento)
              <input
                type="text"
                value={diseño.titulo_inscripcion || ''}
                onChange={(e) => setCampo('titulo_inscripcion', e.target.value)}
                placeholder="Inscripciones Procesión Patronal"
              />
            </label>
            <label>
              Texto de constancia (centro)
              <textarea
                rows={2}
                value={diseño.texto_constancia || ''}
                onChange={(e) => setCampo('texto_constancia', e.target.value)}
              />
            </label>
            <label>
              Ciudad para la fecha del día
              <input
                type="text"
                value={diseño.ciudad_lugar || ''}
                onChange={(e) => setCampo('ciudad_lugar', e.target.value)}
                placeholder="Guatemala de la Asunción"
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={diseño.mostrar_fecha_emision !== false}
                onChange={(e) => setCampo('mostrar_fecha_emision', e.target.checked)}
              />
              Mostrar fecha del día en la boleta
            </label>
            <label>
              Uniformidad — caballeros
              <input
                type="text"
                value={diseño.uniformidad_caballeros || ''}
                onChange={(e) => setCampo('uniformidad_caballeros', e.target.value)}
              />
            </label>
            <label>
              Uniformidad — damas
              <input
                type="text"
                value={diseño.uniformidad_damas || ''}
                onChange={(e) => setCampo('uniformidad_damas', e.target.value)}
              />
            </label>
            <label>
              Texto previo a la fecha de entrega
              <input
                type="text"
                value={diseño.texto_entrega_prefijo || ''}
                onChange={(e) => setCampo('texto_entrega_prefijo', e.target.value)}
              />
            </label>
            <div className="form-row form-row--3">
              <label>
                Día entrega
                <input
                  type="text"
                  value={diseño.entrega_dia || ''}
                  onChange={(e) => setCampo('entrega_dia', e.target.value)}
                  placeholder="28"
                />
              </label>
              <label>
                Mes entrega
                <input
                  type="text"
                  value={diseño.entrega_mes || ''}
                  onChange={(e) => setCampo('entrega_mes', e.target.value.toUpperCase())}
                  placeholder="JULIO"
                />
              </label>
              <label>
                Año entrega (vacío = año actual)
                <input
                  type="text"
                  value={diseño.entrega_anio || ''}
                  onChange={(e) => setCampo('entrega_anio', e.target.value)}
                  placeholder="2026"
                />
              </label>
            </div>
            <label>
              Tamaño QR (px)
              <input
                type="number"
                min={40}
                max={96}
                value={diseño.qr_tamano_px || 56}
                onChange={(e) => setCampo('qr_tamano_px', Number(e.target.value))}
              />
            </label>
          </fieldset>

          <fieldset className="config-seccion">
            <legend>Qué mostrar en la boleta</legend>
            <div className="recibo-toggles">
              {[
                ['mostrar_nombre_org', 'Nombre organización (si no hay título)'],
                ['mostrar_evento', 'Nombre del evento / procesión'],
                ['mostrar_turno', 'Número de turno'],
                ['mostrar_etiqueta_turno', 'Etiqueta del turno'],
                ['mostrar_cargador', 'Nombre del devoto(a)'],
                ['mostrar_precio', 'Ofrenda pagada'],
                ['mostrar_codigo_texto', 'Código alfanumérico bajo QR'],
              ].map(([key, label]) => (
                <label key={key} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={diseño[key] !== false}
                    onChange={(e) => setCampo(key, e.target.checked)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="form-actions">
            <button type="submit" className="btn btn--primary" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar diseño'}
            </button>
            <Link to="/config/correo" className="btn btn--ghost">
              Correo y envíos →
            </Link>
          </div>
        </form>

        <section className="panel recibo-preview-panel">
          <h3 className="panel__title">Editor visual</h3>
          <p className="text-muted panel__subtitle">
            {FORMATOS_RECIBO.find((f) => f.id === diseño.formato)?.label} — arrastre y ajuste tamaño
          </p>
          <div className="recibo-preview-stage recibo-preview-stage--editor">
            <ReciboCanvasEditor
              cfg={configPreview}
              layout={configPreview.layout}
              onLayoutChange={setLayout}
              organizacion={organizacion}
              cortejo={cortejoDemo}
              turno={DEMO_BOLETA.turno}
              cargador={DEMO_BOLETA.cargador}
              brazo={DEMO_BOLETA.brazo}
            />
          </div>
          <details className="recibo-preview-print-hint" open>
            <summary>Vista contraseña formal (impresión)</summary>
            <div className="recibo-preview-stage recibo-preview-stage--formal">
              <BoletaContraseñaTurno
                organizacion={organizacion}
                cortejo={cortejoDemo}
                turno={DEMO_BOLETA.turno}
                cargador={DEMO_BOLETA.cargador}
                brazo={DEMO_BOLETA.brazo}
                config={configPreview}
              />
            </div>
          </details>
          <details className="recibo-preview-print-hint">
            <summary>Vista boleta térmica / canvas</summary>
            <div className="recibo-preview-stage">
              <BoletaRecibo
                organizacion={organizacion}
                cortejo={cortejoDemo}
                turno={DEMO_BOLETA.turno}
                cargador={DEMO_BOLETA.cargador}
                brazo={DEMO_BOLETA.brazo}
                config={configPreview}
              />
            </div>
          </details>
        </section>
      </div>
    </Layout>
  );
}
