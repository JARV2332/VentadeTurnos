import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import BoletaCorreoPreview from '../components/BoletaCorreoPreview';
import { useAuth } from '../context/AuthContext';
import {
  getEmailConfig,
  saveEmailConfig,
  getCorreosEnviados,
  subscribeData,
  getCortejosByOrg,
} from '../services/dataService';
import { construirDatosBoletaEmail } from '../services/emailService';
import { MOCK_MODE } from '../config/supabaseClient';
import { DEMO_NOMBRE_ORGANIZACION } from '../data/mockData';

const EMAIL_WEBHOOK = process.env.REACT_APP_EMAIL_WEBHOOK_URL || '';

const DEFAULT_CONFIG = {
  correo_remitente: 'turnos@pastoral-asuncion.org',
  nombre_remitente: DEMO_NOMBRE_ORGANIZACION,
  correo_respuesta: 'contacto@pastoral-asuncion.org',
  notificaciones_activas: true,
  pie_correo: 'Gracias por su participación en nuestros eventos.',
};

const DEMO_PREVIEW = {
  cargador: {
    nombre_completo: 'Juan Pérez López',
    correo: 'juan.perez@correo.com',
  },
  brazo: {
    numero_turno: 6,
    numero_brazo: 3,
    lado: 'Izquierda',
    codigo_boleta_qr: 'VT-DEMO0001',
    precio_pagado: 150,
  },
  turno: { tipo_turno: 'Ordinario', etiqueta: 'Ordinario 5', precio: 150 },
};

export default function ConfigCorreo() {
  const { organizacionId, organizacion } = useAuth();
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [historial, setHistorial] = useState([]);
  const [okMsg, setOkMsg] = useState('');
  const [cortejoDemo, setCortejoDemo] = useState(null);

  const refresh = useCallback(async () => {
    const saved = await getEmailConfig(organizacionId);
    if (saved) setConfig({ ...DEFAULT_CONFIG, ...saved });
    setHistorial(await getCorreosEnviados(organizacionId));
    const cortejos = await getCortejosByOrg(organizacionId);
    setCortejoDemo(cortejos[0] || null);
  }, [organizacionId]);

  useEffect(() => {
    refresh();
    return subscribeData(organizacionId, refresh);
  }, [organizacionId, refresh]);

  const handleSave = async (e) => {
    e.preventDefault();
    await saveEmailConfig(organizacionId, config);
    setOkMsg('Configuración de correo guardada.');
  };

  const previewData = construirDatosBoletaEmail({
    organizacion,
    cargador: DEMO_PREVIEW.cargador,
    brazo: DEMO_PREVIEW.brazo,
    turno: DEMO_PREVIEW.turno,
    cortejo: cortejoDemo,
    emailConfig: config,
  });

  const envioRealActivo = !MOCK_MODE && Boolean(EMAIL_WEBHOOK);

  return (
    <Layout title="Correo y boletas" subtitle="Remitente, plantilla y historial de envíos">
      {okMsg && <div className="alert alert--success">{okMsg}</div>}

      <p className="recibo-config-intro">
        Personalice logo, formato térmico o media carta y textos en{' '}
        <Link to="/config/recibo">Diseño de recibos</Link>.
      </p>

      <section className="panel info-box correo-ayuda">
        <h3 className="panel__title">¿Cómo funcionan estos correos?</h3>
        <ul className="correo-ayuda__lista">
          <li>
            <strong>Correo remitente</strong> — Es el que aparece en <em>De:</em> cuando el cargador
            recibe la boleta. Debe ser un correo <strong>real de su organización</strong> (ej.{' '}
            <code>turnos@suasociacion.org</code>), autorizado en su proveedor de envío (Resend,
            SendGrid, etc.).
          </li>
          <li>
            <strong>Nombre remitente</strong> — El nombre visible junto al correo (ej.{' '}
            <em>Pastoral La Asunción</em>). Puede ser el nombre de la asociación.
          </li>
          <li>
            <strong>Correo de respuesta</strong> — Si el cargador pulsa <em>Responder</em>, el mensaje
            va a este buzón (puede ser otro, ej. <code>contacto@suasociacion.org</code>). Si lo deja
            vacío, se usa el mismo remitente.
          </li>
        </ul>
        <p className="text-muted correo-ayuda__nota">
          No conviene poner correos al azar (Gmail personal sin configurar, etc.): muchos servidores los
          rechazan o caen en spam. Use un dominio verificado de la asociación.
        </p>
        {!envioRealActivo && (
          <p className="alert alert--warning correo-ayuda__estado">
            Modo actual: los correos se <strong>registran en el historial</strong> pero no salen a internet
            hasta configurar <code>REACT_APP_EMAIL_WEBHOOK_URL</code> en Vercel (webhook de Resend,
            SendGrid o similar).
          </p>
        )}
        {envioRealActivo && (
          <p className="alert alert--success correo-ayuda__estado">
            Envío real activo: las boletas se envían al correo del cargador al confirmar la venta.
          </p>
        )}
      </section>

      <div className="config-grid">
        <section className="card">
          <h3 className="panel__title">Remitente y respuestas</h3>
          <form onSubmit={handleSave} className="auth-form">
            <label>
              Correo remitente (De:)
              <input
                type="email"
                value={config.correo_remitente}
                onChange={(e) => setConfig({ ...config, correo_remitente: e.target.value })}
                placeholder="turnos@suasociacion.org"
                required
              />
              <small className="field-hint">Debe estar verificado en su servicio de envío de correos</small>
            </label>
            <label>
              Nombre remitente
              <input
                type="text"
                value={config.nombre_remitente}
                onChange={(e) => setConfig({ ...config, nombre_remitente: e.target.value })}
                placeholder={organizacion?.nombre_oficial || 'Nombre de la asociación'}
                required
              />
              <small className="field-hint">Texto que ve el cargador junto al correo</small>
            </label>
            <label>
              Correo de respuesta (Responder a)
              <input
                type="email"
                value={config.correo_respuesta || ''}
                onChange={(e) => setConfig({ ...config, correo_respuesta: e.target.value })}
                placeholder="contacto@suasociacion.org"
              />
              <small className="field-hint">Opcional. Buzón donde recibirán las respuestas</small>
            </label>
            <label>
              Pie de correo
              <textarea
                rows={3}
                value={config.pie_correo || ''}
                onChange={(e) => setConfig({ ...config, pie_correo: e.target.value })}
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={config.notificaciones_activas}
                onChange={(e) =>
                  setConfig({ ...config, notificaciones_activas: e.target.checked })
                }
              />
              Enviar boletas automáticamente al confirmar venta
            </label>
            <button type="submit" className="btn btn--primary">
              Guardar configuración
            </button>
          </form>
        </section>

        <section className="card">
          <h3 className="panel__title">Vista previa de boleta por correo</h3>
          <BoletaCorreoPreview data={previewData} />
        </section>
      </div>

      <section className="card" style={{ marginTop: '1.25rem' }}>
        <h3 className="panel__title">Historial de envíos</h3>
        {historial.length === 0 ? (
          <p className="text-muted">Aún no hay correos registrados.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Destinatario</th>
                  <th>Boleta</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.created_at).toLocaleString('es-GT')}</td>
                    <td>{row.destinatario}</td>
                    <td>{row.codigo_boleta || '—'}</td>
                    <td>{row.estado}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Layout>
  );
}
