/**
 * Marca entrega física (RPC) y envía correo de confirmación desde el servidor.
 * Acepta un brazo (brazoId) o varios del mismo recibo (brazoIds).
 */
import { createClient } from '@supabase/supabase-js';
import { verifyOrgMember } from './verifyOrgMember.js';
import { getSupabaseConfig } from './verifyCaller.js';
import { buildEntregaEmailContent } from './emailEntregaContent.js';
import { createTransporter, obtenerCredencialesSmtp } from './emailSmtp.js';

const TYPO_DOMINIOS = [
  { pattern: /@gmaii\./i, sugerencia: 'gmail.com' },
  { pattern: /@gmial\./i, sugerencia: 'gmail.com' },
  { pattern: /@gmal\./i, sugerencia: 'gmail.com' },
  { pattern: /@gmail\.con$/i, sugerencia: 'gmail.com' },
  { pattern: /@hotmal\./i, sugerencia: 'hotmail.com' },
];

function advertirEmail(correo) {
  const val = String(correo || '').trim();
  if (!val) return null;
  for (const { pattern, sugerencia } of TYPO_DOMINIOS) {
    if (pattern.test(val)) {
      return `El correo "${val}" parece tener un error de tipeo (¿${sugerencia}?). Corrija el email del devoto en Devotos.`;
    }
  }
  return null;
}

function labelTurno(turno, brazo) {
  const num = turno?.numero_turno ?? brazo?.numero_turno ?? '—';
  const honor = turno?.etiqueta || turno?.tipo_turno || '';
  return honor ? `Turno #${num} (${honor})` : `Turno #${num}`;
}

function labelBrazo(brazo) {
  if (!brazo) return '—';
  const lado = brazo.lado ? ` ${String(brazo.lado).charAt(0).toUpperCase()}` : '';
  return `Brazo ${brazo.numero_brazo}${lado}`.trim();
}

function formatFechaHoraEntrega(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-GT', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

async function registrarCorreo(admin, organizacionId, row) {
  await admin.from('correos_enviados').insert({
    organizacion_id: organizacionId,
    destinatario: row.destinatario,
    asunto: row.asunto,
    codigo_boleta: row.codigo_boleta || null,
    estado: row.estado || 'enviado',
    metadata: row.metadata || {},
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const {
    organizacionId,
    brazoId,
    brazoIds,
    entregado_a_tercero,
    entregado_receptor_nombre,
    enviarCorreo,
  } = req.body || {};

  const ids = Array.isArray(brazoIds) && brazoIds.length ? brazoIds : brazoId ? [brazoId] : [];

  if (!organizacionId || !ids.length) {
    return res.status(400).json({ error: 'organizacionId y al menos un brazo son obligatorios' });
  }

  const member = await verifyOrgMember(req, organizacionId);
  if (member.error) {
    return res.status(member.status).json({ error: member.error });
  }

  const esTercero = Boolean(entregado_a_tercero);
  const receptor = esTercero ? String(entregado_receptor_nombre || '').trim() : '';
  if (esTercero && !receptor) {
    return res.status(400).json({ error: 'Indique el nombre de quien recibe el turno (tercero).' });
  }

  const { url, anonKey } = getSupabaseConfig();
  const userClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: { Authorization: req.headers.authorization || '' },
    },
  });

  const brazosEntregados = [];
  for (const id of ids) {
    const { data: brazo, error: rpcErr } = await userClient.rpc('marcar_entregado_brazo', {
      p_brazo_id: id,
      p_entregado_a_tercero: esTercero,
      p_entregado_receptor_nombre: esTercero ? receptor : null,
    });

    if (rpcErr) {
      const msg = rpcErr.message || 'No se pudo marcar entregado';
      if (brazosEntregados.length) {
        return res.status(400).json({
          error: `${msg} (${brazosEntregados.length} de ${ids.length} ya se marcaron entregados)`,
          brazos: brazosEntregados,
        });
      }
      return res.status(400).json({ error: msg });
    }
    brazosEntregados.push(brazo);
  }

  const brazo = brazosEntregados[0];
  let correo = { ok: false, omitido: true, motivo: 'Correo no solicitado' };

  if (enviarCorreo) {
    const { admin } = member;
    const turnoIds = [...new Set(brazosEntregados.map((b) => b.turno_id).filter(Boolean))];

    const [{ data: cargador }, { data: turnos }, { data: org }, { data: emailConfig }] =
      await Promise.all([
        brazo.cargador_id
          ? admin.from('cargadores_organizacion').select('*').eq('id', brazo.cargador_id).maybeSingle()
          : Promise.resolve({ data: null }),
        turnoIds.length
          ? admin.from('turnos').select('*').in('id', turnoIds)
          : Promise.resolve({ data: [] }),
        admin.from('organizaciones').select('nombre_oficial').eq('id', organizacionId).maybeSingle(),
        admin
          .from('configuracion_correo')
          .select('correo_remitente, nombre_remitente, correo_respuesta')
          .eq('organizacion_id', organizacionId)
          .maybeSingle(),
      ]);

    const turnosMap = Object.fromEntries((turnos || []).map((t) => [t.id, t]));
    const turno = turnosMap[brazo.turno_id] || null;

    let cortejo = null;
    if (turno?.cortejo_id) {
      const { data } = await admin.from('cortejos').select('*').eq('id', turno.cortejo_id).maybeSingle();
      cortejo = data;
    }

    const destinatario = cargador?.correo?.trim().toLowerCase() || '';
    const advertencia = advertirEmail(destinatario);
    const n = brazosEntregados.length;
    const detalleBrazos = brazosEntregados
      .map((b) => labelBrazo(b))
      .join(', ');
    const turnoTxt =
      n > 1
        ? `${n} turnos — ${labelTurno(turno, brazo)}`
        : labelTurno(turno, brazo);
    const brazoTxt = n > 1 ? detalleBrazos : labelBrazo(brazo);
    const fechaEntrega = formatFechaHoraEntrega(brazosEntregados[brazosEntregados.length - 1]?.entregado_en);
    const evento = cortejo?.nombre_evento || 'la procesión';
    const nombreOrg = org?.nombre_oficial || emailConfig?.nombre_remitente || '';
    const asunto =
      n > 1
        ? `Confirmación de entrega — ${n} turnos`
        : `Confirmación de entrega — ${labelTurno(turno, brazo)}`;

    if (!destinatario || !destinatario.includes('@')) {
      correo = {
        ok: false,
        error: 'El devoto(a) no tiene correo electrónico registrado.',
      };
    } else if (!emailConfig?.correo_remitente?.trim()) {
      correo = {
        ok: false,
        error: 'Configure el correo remitente en Configuración → Correo.',
      };
    } else {
      const creds = await obtenerCredencialesSmtp(admin, organizacionId);
      if (!creds) {
        correo = {
          ok: false,
          error:
            'Configure Gmail en Correo y boletas (cuenta + contraseña de aplicación) o GMAIL_USER/GMAIL_APP_PASSWORD en Vercel.',
        };
      } else {
        const entregaHtml = buildEntregaEmailContent({
          primerNombre: cargador.nombre_completo?.trim().split(/\s+/)[0] || 'devoto(a)',
          nombreCompleto: cargador.nombre_completo?.trim() || 'Devoto(a)',
          evento,
          turnoTxt,
          brazoTxt,
          fechaEntrega,
          entregado_a_tercero: esTercero,
          entregado_receptor_nombre: esTercero ? receptor : null,
          organizacion: nombreOrg,
        });

        const nombreVisible =
          emailConfig.nombre_remitente?.trim() || creds.nombreRemitente || 'Venta de turnos';
        const replyTo =
          emailConfig.correo_respuesta?.trim() || emailConfig.correo_remitente || creds.user;

        const textoPlano =
          n > 1
            ? esTercero
              ? `Confirmación de entrega de ${n} turnos (${detalleBrazos}) a ${receptor} (tercero). Fecha: ${fechaEntrega}.`
              : `Confirmación de entrega de ${n} turnos (${detalleBrazos}). Fecha: ${fechaEntrega}.`
            : esTercero
              ? `Confirmación de entrega de ${turnoTxt} (${brazoTxt}) a ${receptor} (tercero). Fecha: ${fechaEntrega}.`
              : `Confirmación de entrega de ${turnoTxt} (${brazoTxt}). Fecha: ${fechaEntrega}.`;

        try {
          const transporter = createTransporter(creds.user, creds.pass);
          const info = await transporter.sendMail({
            from: `"${nombreVisible.replace(/"/g, '')}" <${creds.user}>`,
            replyTo,
            to: destinatario,
            subject: asunto,
            text: textoPlano,
            html: entregaHtml.html,
            headers: { 'X-Mailer': 'VentaDeTurnos', 'Auto-Submitted': 'no' },
          });

          await registrarCorreo(admin, organizacionId, {
            destinatario,
            asunto,
            codigo_boleta: brazo.codigo_boleta_qr,
            estado: 'enviado',
            metadata: {
              modo: 'gmail',
              tipo: 'entrega_confirmada',
              message_id: info.messageId,
              brazo_ids: brazosEntregados.map((b) => b.id),
              cantidad: n,
              cargador_id: cargador?.id || null,
              enviado_en: new Date().toISOString(),
              origen_smtp: creds.origen,
            },
          });

          correo = {
            ok: true,
            destinatario,
            asunto,
            advertencia,
          };
        } catch (err) {
          const msg = err.message || 'Error al enviar correo';
          await registrarCorreo(admin, organizacionId, {
            destinatario,
            asunto,
            codigo_boleta: brazo.codigo_boleta_qr,
            estado: 'error',
            metadata: {
              modo: 'gmail',
              tipo: 'entrega_confirmada',
              error: msg,
              brazo_ids: brazosEntregados.map((b) => b.id),
              enviado_en: new Date().toISOString(),
            },
          });
          correo = { ok: false, error: msg, advertencia };
        }
      }
    }
  }

  return res.status(200).json({
    data: brazosEntregados.length === 1 ? brazosEntregados[0] : brazosEntregados,
    brazos: brazosEntregados,
    correo,
  });
}
