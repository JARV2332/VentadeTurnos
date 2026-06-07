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

import {
  LEYENDA_CORREO_DEFAULT,
  LEYENDA_CORREO_PLACEHOLDERS,
  CORREO_FECHA_ENTREGA_DEFAULT,
  CORREO_HORARIO_ENTREGA_DEFAULT,
} from '../utils/emailTemplateUtils';

import { MOCK_MODE } from '../config/supabaseClient';

import { DEMO_NOMBRE_ORGANIZACION } from '../data/mockData';



const EMAIL_WEBHOOK = process.env.REACT_APP_EMAIL_WEBHOOK_URL || '';



const DEFAULT_CONFIG = {

  correo_remitente: '',

  nombre_remitente: DEMO_NOMBRE_ORGANIZACION,

  correo_respuesta: '',

  gmail_smtp_user: '',

  gmail_app_password: '',

  gmail_password_configurada: false,

  notificaciones_activas: true,

  pie_correo: 'Gracias por su participación en nuestros eventos.',

  leyenda_correo: LEYENDA_CORREO_DEFAULT,

  correo_fecha_entrega: CORREO_FECHA_ENTREGA_DEFAULT,

  correo_horario_entrega: CORREO_HORARIO_ENTREGA_DEFAULT,

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

  const [error, setError] = useState('');

  const [cortejoDemo, setCortejoDemo] = useState(null);



  const refresh = useCallback(async () => {

    const saved = await getEmailConfig(organizacionId);

    if (saved) {

      setConfig({

        ...DEFAULT_CONFIG,

        ...saved,

        gmail_app_password: '',

      });

    } else {

      setConfig({

        ...DEFAULT_CONFIG,

        nombre_remitente: organizacion?.nombre_oficial || DEFAULT_CONFIG.nombre_remitente,

      });

    }

    const correos = await getCorreosEnviados(organizacionId);
    setHistorial(Array.isArray(correos) ? correos : []);

    const cortejos = await getCortejosByOrg(organizacionId);

    setCortejoDemo(cortejos[0] || null);

  }, [organizacionId, organizacion?.nombre_oficial]);



  useEffect(() => {

    refresh();

    return subscribeData(organizacionId, refresh);

  }, [organizacionId, refresh]);



  const handleSave = async (e) => {

    e.preventDefault();

    setError('');

    const res = await saveEmailConfig(organizacionId, config);

    if (res?.error) {

      setError(res.error);

      return;

    }

    setConfig((c) => ({ ...c, ...res, gmail_app_password: '' }));

    setOkMsg('Configuración de correo guardada.');

    setTimeout(() => setOkMsg(''), 5000);

  };



  const syncGmailUser = (correo) => {

    setConfig((c) => ({

      ...c,

      correo_remitente: correo,

      gmail_smtp_user: correo,

    }));

  };



  const previewData = construirDatosBoletaEmail({

    organizacion,

    cargador: DEMO_PREVIEW.cargador,

    brazo: DEMO_PREVIEW.brazo,

    turno: DEMO_PREVIEW.turno,

    cortejo: cortejoDemo,

    emailConfig: config,

  });



  const gmailListo =

    config.gmail_password_configurada &&

    (config.gmail_smtp_user || config.correo_remitente)?.includes('@');

  const envioRealActivo = !MOCK_MODE && Boolean(EMAIL_WEBHOOK) && gmailListo;



  return (

    <Layout title="Correo y boletas" subtitle="Gmail por asociación, remitente y historial">

      {okMsg && <div className="alert alert--success">{okMsg}</div>}

      {error && <div className="alert alert--error">{error}</div>}



      <p className="recibo-config-intro">

        Personalice boletas en <Link to="/config/recibo">Diseño de recibos</Link>. Cada hermandad o

        cofradía configura <strong>su propia cuenta Gmail</strong> aquí abajo.

      </p>



      <section className="panel info-box correo-ayuda">

        <h3 className="panel__title">Gmail por asociación</h3>

        <ul className="correo-ayuda__lista">

          <li>

            Cada organización guarda su <strong>Gmail</strong> y su <strong>contraseña de

            aplicación</strong> (16 caracteres con doble autenticación en Google).

          </li>

          <li>

            El <strong>correo remitente</strong> debe ser el mismo Gmail (Gmail no permite enviar como

            otra cuenta distinta).

          </li>

          <li>

            La contraseña se guarda cifrada en la base de datos; al volver a entrar no se muestra (deje

            el campo vacío si no desea cambiarla).

          </li>

        </ul>

        {gmailListo ? (

          <p className="alert alert--success correo-ayuda__estado">

            Gmail configurado para esta asociación. Los envíos usan{' '}

            <strong>{config.gmail_smtp_user || config.correo_remitente}</strong>.

          </p>

        ) : (

          <p className="alert alert--warning correo-ayuda__estado">

            Complete la cuenta Gmail y la contraseña de aplicación para activar el envío real.

          </p>

        )}

      </section>



      <div className="config-grid">

        <section className="card">

          <h3 className="panel__title">Cuenta Gmail de la asociación</h3>

          <form onSubmit={handleSave} className="auth-form">

            <fieldset className="config-seccion">

              <legend>Envío (Gmail SMTP)</legend>

              <label>

                Gmail de la asociación

                <input

                  type="email"

                  value={config.gmail_smtp_user || config.correo_remitente || ''}

                  onChange={(e) => syncGmailUser(e.target.value.trim().toLowerCase())}

                  placeholder="turnos.suhermandad@gmail.com"

                  required

                />

                <small className="field-hint">

                  Misma cuenta donde creó la contraseña de aplicación en Google

                </small>

              </label>

              <label>

                Contraseña de aplicación Gmail

                <input

                  type="password"

                  value={config.gmail_app_password}

                  onChange={(e) =>

                    setConfig({ ...config, gmail_app_password: e.target.value })

                  }

                  placeholder={

                    config.gmail_password_configurada

                      ? '•••••••••••••••• (dejar vacío para no cambiar)'

                      : '16 caracteres sin espacios'

                  }

                  autoComplete="new-password"

                />

                <small className="field-hint">

                  Google → Seguridad → Verificación en 2 pasos → Contraseñas de aplicaciones

                </small>

              </label>

              {config.gmail_password_configurada && (

                <p className="text-muted" style={{ fontSize: '0.85rem' }}>

                  ✓ Ya hay una contraseña guardada para esta asociación.

                </p>

              )}

            </fieldset>



            <fieldset className="config-seccion">

              <legend>Texto del correo</legend>

              <label>

                Leyenda del correo (mensaje que recibe el devoto)

                <textarea

                  rows={12}

                  className="correo-leyenda-textarea"

                  value={config.leyenda_correo ?? LEYENDA_CORREO_DEFAULT}

                  onChange={(e) => setConfig({ ...config, leyenda_correo: e.target.value })}

                  spellCheck

                />

                <small className="field-hint">

                  Use los marcadores entre llaves; al enviar se reemplazan con los datos reales de la

                  venta. La vista previa a la derecha se actualiza al guardar o al editar.

                </small>

              </label>

              <div className="config-grid">
                <label>
                  Fecha de entrega de cartulina ({'{fecha_entrega}'})
                  <input
                    type="text"
                    value={config.correo_fecha_entrega ?? CORREO_FECHA_ENTREGA_DEFAULT}
                    onChange={(e) => setConfig({ ...config, correo_fecha_entrega: e.target.value })}
                    placeholder={CORREO_FECHA_ENTREGA_DEFAULT}
                  />
                </label>
                <label>
                  Horario de entrega ({'{horario_entrega}'})
                  <input
                    type="text"
                    value={config.correo_horario_entrega ?? CORREO_HORARIO_ENTREGA_DEFAULT}
                    onChange={(e) => setConfig({ ...config, correo_horario_entrega: e.target.value })}
                    placeholder={CORREO_HORARIO_ENTREGA_DEFAULT}
                  />
                </label>
              </div>

              <div className="correo-placeholders">

                <p className="correo-placeholders__titulo">Marcadores disponibles</p>

                <ul className="correo-placeholders__lista">

                  {LEYENDA_CORREO_PLACEHOLDERS.map((p) => (

                    <li key={p.token}>

                      <code>{p.token}</code> — {p.desc}

                    </li>

                  ))}

                </ul>

                <button

                  type="button"

                  className="btn btn--ghost btn--sm"

                  onClick={() =>
                    setConfig({
                      ...config,
                      leyenda_correo: LEYENDA_CORREO_DEFAULT,
                      correo_fecha_entrega: CORREO_FECHA_ENTREGA_DEFAULT,
                      correo_horario_entrega: CORREO_HORARIO_ENTREGA_DEFAULT,
                    })
                  }

                >

                  Restaurar leyenda predeterminada

                </button>

              </div>

              <label>

                Nombre remitente (visible en De:)

                <input

                  type="text"

                  value={config.nombre_remitente}

                  onChange={(e) => setConfig({ ...config, nombre_remitente: e.target.value })}

                  placeholder={organizacion?.nombre_oficial || 'Nombre de la asociación'}

                  required

                />

              </label>

              <label>

                Correo de respuesta (Responder a)

                <input

                  type="email"

                  value={config.correo_respuesta || ''}

                  onChange={(e) => setConfig({ ...config, correo_respuesta: e.target.value })}

                  placeholder="Opcional — otro buzón de la asociación"

                />

              </label>

              <label>

                Pie de correo (texto final antes de la firma)

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

            </fieldset>



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


