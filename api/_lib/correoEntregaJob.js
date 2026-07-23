/**
 * Cola de correos de confirmación de entrega — envío en background con reintentos.
 */
import {
  buildEntregaEmailContent,
  buildEntregaTextoPlano,
  ENTREGA_EMAIL_ASUNTO,
} from './emailEntregaContent.js';
import { createTransporter, obtenerCredencialesSmtp } from './emailSmtp.js';

const TYPO_DOMINIOS = [
  { pattern: /@gmaii\./i, sugerencia: 'gmail.com' },
  { pattern: /@gmial\./i, sugerencia: 'gmail.com' },
  { pattern: /@gmal\./i, sugerencia: 'gmail.com' },
  { pattern: /@gmail\.con$/i, sugerencia: 'gmail.com' },
  { pattern: /@hotmal\./i, sugerencia: 'hotmail.com' },
];

const MAX_REINTENTOS = 3;
const ESPERA_REINTENTO_MS = 1500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function advertirEmail(correo) {
  const val = String(correo || '').trim();
  if (!val) return null;
  for (const { pattern, sugerencia } of TYPO_DOMINIOS) {
    if (pattern.test(val)) {
      return `El correo "${val}" parece tener un error de tipeo (¿${sugerencia}?). Corrija el email del devoto en Devotos.`;
    }
  }
  return null;
}

async function cargarDatosCorreo(admin, organizacionId, brazosEntregados, esTercero, receptor) {
  const brazo = brazosEntregados[0];

  const [{ data: cargador }, { data: org }, { data: emailConfig }] = await Promise.all([
    brazo.cargador_id
      ? admin.from('cargadores_organizacion').select('*').eq('id', brazo.cargador_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from('organizaciones').select('nombre_oficial').eq('id', organizacionId).maybeSingle(),
    admin
      .from('configuracion_correo')
      .select('correo_remitente, nombre_remitente, correo_respuesta')
      .eq('organizacion_id', organizacionId)
      .maybeSingle(),
  ]);

  const nombreOrg = org?.nombre_oficial || emailConfig?.nombre_remitente || '';
  const asunto = ENTREGA_EMAIL_ASUNTO;
  const primerNombre = cargador?.nombre_completo?.trim().split(/\s+/)[0] || 'devoto(a)';
  const nombreCompleto = cargador?.nombre_completo?.trim() || 'Devoto(a)';

  const destinatario = cargador?.correo?.trim().toLowerCase() || '';
  const textoPlano = buildEntregaTextoPlano({
    primerNombre,
    nombreCompleto,
    entregado_a_tercero: esTercero,
    entregado_receptor_nombre: esTercero ? receptor : null,
    organizacion: nombreOrg,
  });

  return {
    brazo,
    cargador,
    emailConfig,
    destinatario,
    asunto,
    nombreOrg,
    textoPlano,
    primerNombre,
    nombreCompleto,
    n: brazosEntregados.length,
  };
}

async function enviarCorreoSmtp(admin, organizacionId, datos, esTercero, receptor, brazosEntregados) {
  const {
    brazo,
    cargador,
    emailConfig,
    destinatario,
    asunto,
    nombreOrg,
    textoPlano,
    primerNombre,
    nombreCompleto,
    n,
  } = datos;

  if (!destinatario || !destinatario.includes('@')) {
    return { ok: false, error: 'El devoto(a) no tiene correo electrónico registrado.' };
  }
  if (!emailConfig?.correo_remitente?.trim()) {
    return { ok: false, error: 'Configure el correo remitente en Configuración → Correo.' };
  }

  const creds = await obtenerCredencialesSmtp(admin, organizacionId);
  if (!creds) {
    return {
      ok: false,
      error:
        'Configure Gmail en Correo y boletas (cuenta + contraseña de aplicación) o GMAIL_USER/GMAIL_APP_PASSWORD en Vercel.',
    };
  }

  const entregaHtml = buildEntregaEmailContent({
    primerNombre,
    nombreCompleto,
    entregado_a_tercero: esTercero,
    entregado_receptor_nombre: esTercero ? receptor : null,
    organizacion: nombreOrg,
  });

  const nombreVisible =
    emailConfig.nombre_remitente?.trim() || creds.nombreRemitente || 'Venta de turnos';
  const replyTo =
    emailConfig.correo_respuesta?.trim() || emailConfig.correo_remitente || creds.user;

  const transporter = createTransporter(creds.user, creds.pass);
  const info = await transporter.sendMail({
    from: `"${nombreVisible.replace(/"/g, '')}" <${creds.user}>`,
    replyTo,
    to: destinatario,
    subject: asunto,
    text: textoPlano,
    html: entregaHtml.html,
    attachments: entregaHtml.attachments?.length ? entregaHtml.attachments : undefined,
    headers: { 'X-Mailer': 'VentaDeTurnos', 'Auto-Submitted': 'no' },
  });

  return {
    ok: true,
    destinatario,
    asunto,
    advertencia: advertirEmail(destinatario),
    metadata: {
      modo: 'gmail',
      tipo: 'entrega_confirmada',
      message_id: info.messageId,
      brazo_ids: brazosEntregados.map((b) => b.id),
      cantidad: n,
      cargador_id: cargador?.id || null,
      enviado_en: new Date().toISOString(),
      origen_smtp: creds.origen,
      codigo_boleta: brazo.codigo_boleta_qr,
    },
  };
}

async function actualizarRegistroCola(admin, colaId, { estado, metadata, asunto, destinatario }) {
  if (!colaId) return;
  await admin
    .from('correos_enviados')
    .update({
      estado,
      asunto: asunto || undefined,
      destinatario: destinatario || undefined,
      metadata,
    })
    .eq('id', colaId);
}

export async function encolarCorreoEntrega(admin, organizacionId, payload) {
  const brazo = payload.brazosEntregados[0];
  const { data, error } = await admin
    .from('correos_enviados')
    .insert({
      organizacion_id: organizacionId,
      destinatario: payload.destinatarioPlaceholder || 'pendiente@cola.local',
      asunto: 'Confirmación de entrega (en cola)',
      codigo_boleta: brazo?.codigo_boleta_qr || null,
      estado: 'encolado',
      metadata: {
        tipo: 'entrega_confirmada',
        cola: true,
        brazo_ids: payload.brazosEntregados.map((b) => b.id),
        es_tercero: payload.esTercero,
        receptor: payload.receptor,
        intentos: 0,
        encolado_en: new Date().toISOString(),
      },
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

export async function procesarCorreoEntregaJob(admin, organizacionId, job) {
  const colaId = job.colaId;
  const brazosEntregados = job.brazosEntregados;
  const esTercero = Boolean(job.esTercero);
  const receptor = job.receptor || '';

  if (colaId && !job.skipClaim) {
    const { data: claimed } = await admin
      .from('correos_enviados')
      .update({
        estado: 'procesando',
        metadata: {
          tipo: 'entrega_confirmada',
          cola: true,
          brazo_ids: brazosEntregados.map((b) => b.id),
          es_tercero: esTercero,
          receptor,
          reclamado_en: new Date().toISOString(),
        },
      })
      .eq('id', colaId)
      .eq('estado', 'encolado')
      .select('id')
      .maybeSingle();

    if (!claimed) {
      return { ok: false, omitido: true, motivo: 'Correo ya en proceso o enviado' };
    }
  }

  let intentos = 0;
  let lastError = null;

  while (intentos < MAX_REINTENTOS) {
    intentos += 1;
    try {
      const datos = await cargarDatosCorreo(
        admin,
        organizacionId,
        brazosEntregados,
        esTercero,
        receptor
      );

      if (colaId) {
        await actualizarRegistroCola(admin, colaId, {
          destinatario: datos.destinatario || 'sin-correo@local',
          asunto: datos.asunto,
          metadata: {
            tipo: 'entrega_confirmada',
            cola: true,
            brazo_ids: brazosEntregados.map((b) => b.id),
            es_tercero: esTercero,
            receptor,
            intentos,
            ultimo_intento_en: new Date().toISOString(),
          },
        });
      }

      const result = await enviarCorreoSmtp(
        admin,
        organizacionId,
        datos,
        esTercero,
        receptor,
        brazosEntregados
      );

      if (!result.ok) {
        lastError = result.error;
        if (colaId) {
          await actualizarRegistroCola(admin, colaId, {
            estado: intentos >= MAX_REINTENTOS ? 'error' : 'encolado',
            asunto: datos.asunto,
            destinatario: datos.destinatario || 'sin-correo@local',
            metadata: {
              tipo: 'entrega_confirmada',
              cola: true,
              error: result.error,
              brazo_ids: brazosEntregados.map((b) => b.id),
              intentos,
              ultimo_intento_en: new Date().toISOString(),
            },
          });
        }
        if (intentos < MAX_REINTENTOS) {
          await sleep(ESPERA_REINTENTO_MS * intentos);
          continue;
        }
        return result;
      }

      if (colaId) {
        await actualizarRegistroCola(admin, colaId, {
          estado: 'enviado',
          asunto: result.asunto,
          destinatario: result.destinatario,
          metadata: {
            ...result.metadata,
            cola: true,
            intentos,
          },
        });
      }

      return result;
    } catch (err) {
      lastError = err.message || 'Error al enviar correo';
      if (colaId) {
        await actualizarRegistroCola(admin, colaId, {
          estado: intentos >= MAX_REINTENTOS ? 'error' : 'encolado',
          metadata: {
            tipo: 'entrega_confirmada',
            cola: true,
            error: lastError,
            brazo_ids: brazosEntregados.map((b) => b.id),
            es_tercero: esTercero,
            receptor,
            intentos,
            ultimo_intento_en: new Date().toISOString(),
          },
        });
      }
      if (intentos < MAX_REINTENTOS) {
        await sleep(ESPERA_REINTENTO_MS * intentos);
      }
    }
  }

  return { ok: false, error: lastError || 'Error al enviar correo' };
}

export async function procesarCorreosEntregaPendientes(admin, organizacionId, limit = 5) {
  const { data: pendientes } = await admin
    .from('correos_enviados')
    .select('id, metadata, codigo_boleta')
    .eq('organizacion_id', organizacionId)
    .eq('estado', 'encolado')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (!pendientes?.length) return;

  for (const row of pendientes) {
    const meta = row.metadata || {};
    const brazoIds = meta.brazo_ids || [];
    if (!brazoIds.length) continue;

    const { data: claimed } = await admin
      .from('correos_enviados')
      .update({
        estado: 'procesando',
        metadata: {
          ...meta,
          reclamado_en: new Date().toISOString(),
        },
      })
      .eq('id', row.id)
      .eq('estado', 'encolado')
      .select('id')
      .maybeSingle();

    if (!claimed) continue;

    const { data: brazos } = await admin.from('brazos').select('*').in('id', brazoIds);
    if (!brazos?.length) {
      await admin
        .from('correos_enviados')
        .update({
          estado: 'error',
          metadata: { ...meta, error: 'Brazos no encontrados para reenvío' },
        })
        .eq('id', row.id);
      continue;
    }

    await procesarCorreoEntregaJob(admin, organizacionId, {
      colaId: row.id,
      brazosEntregados: brazos,
      esTercero: Boolean(meta.es_tercero),
      receptor: meta.receptor || '',
      skipClaim: true,
    });
  }
}

export function programarCorreoEntregaEnBackground(waitUntil, admin, organizacionId, job) {
  const tarea = (async () => {
    try {
      await procesarCorreoEntregaJob(admin, organizacionId, job);
      await procesarCorreosEntregaPendientes(admin, organizacionId, 3);
    } catch (err) {
      console.error('[correoEntregaJob] background error:', err?.message || err);
    }
  })();

  if (typeof waitUntil === 'function') {
    waitUntil(tarea);
  } else {
    tarea.catch((err) => console.error('[correoEntregaJob] fire-and-forget error:', err));
  }
}
