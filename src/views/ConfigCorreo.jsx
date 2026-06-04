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
  });

  return (
    <Layout title="Correo y boletas" subtitle="Remitente, plantilla y historial de envíos">
      {okMsg && <div className="alert alert--success">{okMsg}</div>}

      <p className="recibo-config-intro">
        Personalice logo, formato térmico o media carta y textos en{' '}
        <Link to="/config/recibo">Diseño de recibos</Link>.
      </p>

      <div className="config-grid">
        <section className="card">
          <h3 className="panel__title">Configuración SMTP / remitente</h3>
          <form onSubmit={handleSave} className="auth-form">
            <label>
              Correo remitente
              <input
                type="email"
                value={config.correo_remitente}
                onChange={(e) => setConfig({ ...config, correo_remitente: e.target.value })}
                required
              />
            </label>
            <label>
              Nombre remitente
              <input
                type="text"
                value={config.nombre_remitente}
                onChange={(e) => setConfig({ ...config, nombre_remitente: e.target.value })}
                required
              />
            </label>
            <label>
              Correo de respuesta
              <input
                type="email"
                value={config.correo_respuesta || ''}
                onChange={(e) => setConfig({ ...config, correo_respuesta: e.target.value })}
              />
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
