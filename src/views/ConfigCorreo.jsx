import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import BoletaCorreoPreview from '../components/BoletaCorreoPreview';
import { useAuth } from '../context/AuthContext';
import {
  getEmailConfig,
  saveEmailConfig,
  getCorreosEnviadosMock,
  subscribeMock,
  getCortejosByOrg,
} from '../services/mockService';
import { construirDatosBoletaEmail } from '../services/emailService';
import { DEMO_NOMBRE_ORGANIZACION } from '../data/mockData';

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

  const cortejoDemo = getCortejosByOrg(organizacionId)[0];

  const refresh = useCallback(() => {
    const saved = getEmailConfig(organizacionId);
    if (saved) setConfig({ ...DEFAULT_CONFIG, ...saved });
    setHistorial(getCorreosEnviadosMock(organizacionId));
  }, [organizacionId]);

  useEffect(() => {
    refresh();
    return subscribeMock(refresh);
  }, [refresh]);

  const previewDatos = construirDatosBoletaEmail({
    ...DEMO_PREVIEW,
    cortejo: cortejoDemo || { nombre_evento: 'Procesión Demo 2026' },
    organizacion,
    emailConfig: config,
  });
  previewDatos.destinatario = DEMO_PREVIEW.cargador.correo;

  const handleSave = (e) => {
    e.preventDefault();
    saveEmailConfig(organizacionId, config);
    setOkMsg('Configuración de correo guardada.');
    setTimeout(() => setOkMsg(''), 4000);
  };

  const update = (campo, valor) => {
    setConfig((prev) => ({ ...prev, [campo]: valor }));
  };

  return (
    <Layout
      title="Correo y boletas"
      subtitle="Remitente, plantilla y envío automático al confirmar venta"
    >
      {okMsg && <div className="alert alert--success">{okMsg}</div>}

      <div className="config-grid config-grid--wide">
        <form className="panel config-form" onSubmit={handleSave}>
          <h3 className="panel__title">Correo remitente de la organización</h3>
          <p className="text-muted config-hint">
            Al confirmar una venta en Taquilla, se envía automáticamente la boleta al correo
            del cargador. También puede imprimirse desde el módulo <strong>Impresión</strong>.
          </p>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={config.notificaciones_activas}
              onChange={(e) => update('notificaciones_activas', e.target.checked)}
            />
            Enviar boleta por correo al confirmar venta
          </label>

          <label>
            Correo de salida (From)
            <input
              type="email"
              placeholder="turnos@tuorganizacion.org"
              value={config.correo_remitente}
              onChange={(e) => update('correo_remitente', e.target.value)}
            />
            <small className="hint-ok">Este es el correo desde el cual salen las boletas</small>
          </label>

          <label>
            Nombre del remitente
            <input
              type="text"
              placeholder={DEMO_NOMBRE_ORGANIZACION}
              value={config.nombre_remitente}
              onChange={(e) => update('nombre_remitente', e.target.value)}
            />
          </label>

          <label>
            Correo de respuesta (Reply-To)
            <input
              type="email"
              placeholder="contacto@tuorganizacion.org"
              value={config.correo_respuesta}
              onChange={(e) => update('correo_respuesta', e.target.value)}
            />
          </label>

          <label>
            Pie de correo (firma)
            <textarea
              rows={2}
              value={config.pie_correo}
              onChange={(e) => update('pie_correo', e.target.value)}
            />
          </label>

          <div className="info-box">
            <strong>Modo demo:</strong> los correos no salen a internet; se registran abajo
            en el historial. Al conectar Supabase + Resend/SendGrid, configure{' '}
            <code>REACT_APP_EMAIL_WEBHOOK_URL</code> en el archivo <code>.env</code>.
          </div>

          <button type="submit" className="btn btn--primary">
            Guardar configuración
          </button>
        </form>

        <div className="panel">
          <h3 className="panel__title">Vista previa del correo</h3>
          <p className="text-muted config-hint">
            Así llegará la boleta al devoto/cargador tras cada venta confirmada.
          </p>
          <BoletaCorreoPreview datos={previewDatos} />
        </div>
      </div>

      <section className="panel">
        <h3 className="panel__title">Historial de envíos (demo) — {historial.length}</h3>
        {historial.length === 0 ? (
          <p className="text-muted">
            Aún no se han enviado correos. Confirma una venta en Taquilla con correo del cargador.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Para</th>
                  <th>Asunto</th>
                  <th>Boleta</th>
                </tr>
              </thead>
              <tbody>
                {historial.slice().reverse().map((c) => (
                  <tr key={c.id}>
                    <td>{new Date(c.enviado_en).toLocaleString('es-GT')}</td>
                    <td>{c.destinatario}</td>
                    <td>{c.asunto}</td>
                    <td><code>{c.brazo?.codigo_boleta_qr}</code></td>
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
