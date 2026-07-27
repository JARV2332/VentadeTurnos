/**
 * Reenvía un registro de correos_enviados (error / encolado / procesando).
 */
import { buildBoletaEmailContent } from './emailBoletaContent.js';
import { createTransporter, obtenerCredencialesSmtp } from './emailSmtp.js';
import { advertirEmail, procesarCorreoEntregaJob } from './correoEntregaJob.js';

const ESTADOS_REENVIABLES = ['error', 'encolado', 'procesando'];

function esEntrega(row) {
  const tipo = row?.metadata?.tipo;
  return tipo === 'entrega_confirmada' || tipo === 'entrega' || Boolean(row?.metadata?.cola);
}

async function reenviarEntrega(admin, organizacionId, row) {
  const meta = row.metadata || {};
  const brazoIds = meta.brazo_ids || (meta.brazo_id ? [meta.brazo_id] : []);
  if (!brazoIds.length) {
    return { ok: false, error: 'Sin brazo_ids para reenviar entrega' };
  }

  const { data: brazos } = await admin.from('brazos').select('*').in('id', brazoIds);
  if (!brazos?.length) {
    return { ok: false, error: 'Brazos no encontrados' };
  }

  await admin
    .from('correos_enviados')
    .update({
      estado: 'encolado',
      metadata: {
        ...meta,
        tipo: 'entrega_confirmada',
        cola: true,
        reintento_manual_en: new Date().toISOString(),
        error: null,
      },
    })
    .eq('id', row.id)
    .eq('organizacion_id', organizacionId)
    .in('estado', ESTADOS_REENVIABLES);

  const result = await procesarCorreoEntregaJob(admin, organizacionId, {
    colaId: row.id,
    brazosEntregados: brazos,
    esTercero: Boolean(meta.es_tercero),
    receptor: meta.receptor || '',
    skipClaim: false,
  });

  if (result.omitido) {
    return { ok: false, error: result.motivo || 'Omitido' };
  }
  return result.ok
    ? { ok: true, destinatario: result.destinatario, asunto: result.asunto, tipo: 'entrega' }
    : { ok: false, error: result.error || 'Error al reenviar entrega', tipo: 'entrega' };
}

async function reenviarBoleta(admin, organizacionId, row) {
  const meta = row.metadata || {};
  const destinatario = String(row.destinatario || '')
    .trim()
    .toLowerCase();
  if (!destinatario || !destinatario.includes('@') || destinatario.endsWith('@local')) {
    return { ok: false, error: 'Destinatario no válido', tipo: 'boleta' };
  }

  const aviso = advertirEmail(destinatario);
  if (aviso) {
    return { ok: false, error: aviso, tipo: 'boleta' };
  }

  const creds = await obtenerCredencialesSmtp(admin, organizacionId);
  if (!creds) {
    return {
      ok: false,
      error: 'Configure Gmail en Correo y boletas',
      tipo: 'boleta',
    };
  }

  const brazoId = meta.brazo_id;
  let brazo = null;
  let cargador = null;

  if (brazoId) {
    const { data: b } = await admin.from('brazos').select('*').eq('id', brazoId).maybeSingle();
    brazo = b;
  }

  if (brazo?.cargador_id || meta.cargador_id) {
    const { data: c } = await admin
      .from('cargadores_organizacion')
      .select('nombre_completo, correo')
      .eq('id', brazo?.cargador_id || meta.cargador_id)
      .maybeSingle();
    cargador = c;
  }

  const { data: org } = await admin
    .from('organizaciones')
    .select('nombre_oficial')
    .eq('id', organizacionId)
    .maybeSingle();

  const { data: emailConfig } = await admin
    .from('configuracion_correo')
    .select('correo_remitente, nombre_remitente, correo_respuesta')
    .eq('organizacion_id', organizacionId)
    .maybeSingle();

  const nombreOrg =
    org?.nombre_oficial || emailConfig?.nombre_remitente || creds.nombreRemitente || 'Venta de turnos';
  const nombre =
    cargador?.nombre_completo?.trim().split(/\s+/)[0] ||
    meta.cargador_nombre?.trim().split(/\s+/)[0] ||
    'devoto(a)';
  const codigo =
    row.codigo_boleta || brazo?.codigo_boleta_qr || '';
  const enlace = meta.enlace_boleta || '';

  const asunto = row.asunto?.trim() || `Su boleta de turno — ${nombreOrg}`;
  const text = [
    `Estimado(a) ${nombre},`,
    '',
    'Le reenviamos su boleta de turno.',
    codigo ? `Código: ${codigo}` : null,
    enlace ? `Ver boleta: ${enlace}` : null,
    '',
    nombreOrg,
  ]
    .filter((line) => line != null)
    .join('\n');

  const built = await buildBoletaEmailContent({
    text,
    codigo_boleta: codigo,
    enlace_boleta: enlace || undefined,
  });

  const fromName = (emailConfig?.nombre_remitente || nombreOrg).replace(/"/g, '');
  const fromEmail = emailConfig?.correo_remitente || creds.user;
  const transporter = createTransporter(creds.user, creds.pass);

  try {
    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      replyTo: emailConfig?.correo_respuesta || fromEmail,
      to: destinatario,
      subject: asunto,
      text,
      html: built.html || undefined,
      attachments: built.attachments?.length ? built.attachments : undefined,
      headers: {
        'X-Mailer': 'VentaDeTurnos',
        'Auto-Submitted': 'no',
      },
    });

    await admin
      .from('correos_enviados')
      .update({
        estado: 'enviado',
        destinatario,
        asunto,
        metadata: {
          ...meta,
          error: null,
          reintento_manual_en: new Date().toISOString(),
          reenviado_ok: true,
        },
      })
      .eq('id', row.id)
      .eq('organizacion_id', organizacionId);

    return { ok: true, destinatario, asunto, tipo: 'boleta' };
  } catch (e) {
    const errorMsg = e.message || 'Error SMTP al reenviar boleta';
    await admin
      .from('correos_enviados')
      .update({
        estado: 'error',
        metadata: {
          ...meta,
          error: errorMsg,
          reintento_manual_en: new Date().toISOString(),
        },
      })
      .eq('id', row.id)
      .eq('organizacion_id', organizacionId);
    return { ok: false, error: errorMsg, tipo: 'boleta' };
  }
}

/**
 * @returns {Promise<{ ok: boolean, error?: string, destinatario?: string, asunto?: string, tipo?: string }>}
 */
export async function reenviarCorreoPendiente(admin, organizacionId, correoId) {
  if (!correoId) {
    return { ok: false, error: 'correoId requerido' };
  }

  const { data: row, error } = await admin
    .from('correos_enviados')
    .select('id, destinatario, asunto, codigo_boleta, estado, created_at, metadata')
    .eq('id', correoId)
    .eq('organizacion_id', organizacionId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!row) return { ok: false, error: 'Registro no encontrado' };
  if (!ESTADOS_REENVIABLES.includes(row.estado)) {
    return { ok: false, error: `Estado "${row.estado}" no se puede reenviar` };
  }

  return esEntrega(row)
    ? reenviarEntrega(admin, organizacionId, row)
    : reenviarBoleta(admin, organizacionId, row);
}
