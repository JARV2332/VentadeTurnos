/**
 * Envío de boletas por Gmail SMTP — credenciales por organización o fallback en Vercel.
 */
import nodemailer from 'nodemailer';
import { verifyOrgMember } from './verifyOrgMember.js';
import { buildBoletaEmailContent } from './emailBoletaContent.js';

function createTransporter(user, pass) {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user, pass },
  });
}

async function credencialesDeOrganizacion(admin, organizacionId) {
  const { data } = await admin
    .from('configuracion_correo')
    .select(
      'gmail_smtp_user, gmail_app_password, correo_remitente, gmail_password_configurada'
    )
    .eq('organizacion_id', organizacionId)
    .maybeSingle();

  if (!data) return null;

  const user = (data.gmail_smtp_user || data.correo_remitente || '').trim().toLowerCase();
  const pass = data.gmail_app_password?.replace(/\s/g, '');
  if (user && pass) {
    return { user, pass, origen: 'organizacion' };
  }
  return null;
}

function credencialesGlobales() {
  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, '');
  if (user && pass) {
    return { user, pass, origen: 'vercel' };
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { organizacionId, from, reply_to, to, subject, text, html, codigo_boleta, enlace_boleta } =
    req.body || {};

  if (!organizacionId) {
    return res.status(400).json({ error: 'organizacionId es obligatorio' });
  }

  const member = await verifyOrgMember(req, organizacionId);
  if (member.error) {
    return res.status(member.status).json({ error: member.error });
  }

  const creds =
    (await credencialesDeOrganizacion(member.admin, organizacionId)) || credencialesGlobales();

  if (!creds) {
    return res.status(500).json({
      error:
        'Configure Gmail en Correo y boletas (cuenta + contraseña de aplicación) o GMAIL_USER/GMAIL_APP_PASSWORD en Vercel.',
    });
  }

  const destinatario = String(to || '')
    .trim()
    .toLowerCase();
  if (!destinatario || !destinatario.includes('@')) {
    return res.status(400).json({ error: 'Destinatario no válido' });
  }
  if (!subject?.trim()) {
    return res.status(400).json({ error: 'Asunto requerido' });
  }

  let nombreVisible = 'Venta de turnos';
  const matchFrom = String(from || '').match(/^(.+?)\s*<([^>]+)>$/);
  if (matchFrom) {
    nombreVisible = matchFrom[1].trim() || nombreVisible;
  } else if (from && !from.includes('@')) {
    nombreVisible = from.trim();
  }

  const replyTo = String(reply_to || creds.user).trim() || creds.user;

  try {
    let mailHtml = html;
    let attachments = [];

    if (!mailHtml && codigo_boleta) {
      const built = await buildBoletaEmailContent({
        text: text || '',
        codigo_boleta,
        enlace_boleta,
      });
      mailHtml = built.html;
      attachments = built.attachments;
    }

    const transporter = createTransporter(creds.user, creds.pass);
    const info = await transporter.sendMail({
      from: `"${nombreVisible.replace(/"/g, '')}" <${creds.user}>`,
      replyTo,
      to: destinatario,
      subject: subject.trim(),
      text: text || '',
      html: mailHtml || undefined,
      attachments: attachments.length ? attachments : undefined,
    });

    return res.status(200).json({
      ok: true,
      messageId: info.messageId,
      destinatario,
      origen: creds.origen,
    });
  } catch (err) {
    console.error('send-email:', err);
    const msg = err.message || 'Error al enviar';
    if (msg.includes('Invalid login') || msg.includes('535')) {
      return res.status(500).json({
        error:
          'Gmail rechazó la contraseña. Revise la contraseña de aplicación en Correo y boletas (16 caracteres, 2FA activo).',
      });
    }
    return res.status(500).json({ error: msg });
  }
}
