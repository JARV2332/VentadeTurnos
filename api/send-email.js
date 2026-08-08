/**
 * Envío de boletas por Gmail SMTP — credenciales por organización o fallback en Vercel.
 * También: action=reenviar-pendiente (correoId) para reintentar error/encolado.
 * tipo=aviso: texto libre + imagen(es) (novenario / comunicados).
 */
import { verifyOrgMember } from './_lib/verifyOrgMember.js';
import { buildBoletaEmailContent } from './_lib/emailBoletaContent.js';
import { buildEntregaEmailContent } from './_lib/emailEntregaContent.js';
import { buildAvisoEmailContent } from './_lib/emailAvisoContent.js';
import { createTransporter, obtenerCredencialesSmtp } from './_lib/emailSmtp.js';
import { reenviarCorreoPendiente } from './_lib/reenviarCorreoPendiente.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const body = req.body || {};
  const {
    organizacionId,
    from,
    reply_to,
    to,
    bcc,
    subject,
    text,
    html,
    codigo_boleta,
    enlace_boleta,
    tipo,
    entrega,
    aviso,
    action,
    correoId,
  } = body;

  if (!organizacionId) {
    return res.status(400).json({ error: 'organizacionId es obligatorio' });
  }

  const member = await verifyOrgMember(req, organizacionId);
  if (member.error) {
    return res.status(member.status).json({ error: member.error });
  }

  if (action === 'reenviar-pendiente') {
    const result = await reenviarCorreoPendiente(member.admin, organizacionId, correoId);
    if (!result.ok) {
      return res.status(400).json({ error: result.error || 'No se pudo reenviar' });
    }
    return res.status(200).json(result);
  }

  const creds = await obtenerCredencialesSmtp(member.admin, organizacionId);

  if (!creds) {
    return res.status(500).json({
      error:
        'Configure Gmail en Correo y boletas (cuenta + contraseña de aplicación) o GMAIL_USER/GMAIL_APP_PASSWORD en Vercel.',
    });
  }

  const MAX_BCC = 50;
  const bccList = [];
  const bccRaw = Array.isArray(bcc) ? bcc : bcc ? String(bcc).split(/[,;]+/) : [];
  const vistosBcc = new Set();
  for (const raw of bccRaw) {
    const email = String(raw || '')
      .trim()
      .toLowerCase();
    if (!email || !email.includes('@') || vistosBcc.has(email)) continue;
    vistosBcc.add(email);
    bccList.push(email);
    if (bccList.length > MAX_BCC) {
      return res.status(400).json({
        error: `Máximo ${MAX_BCC} destinatarios en copia oculta por envío.`,
      });
    }
  }

  let destinatario = String(to || '')
    .trim()
    .toLowerCase();
  // Con BCC: el "Para" puede ser la propia cuenta (nadie ve la lista).
  if (!destinatario && bccList.length) {
    destinatario = String(creds.user || '')
      .trim()
      .toLowerCase();
  }
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
    let mailText = text || '';

    if (tipo === 'aviso' || aviso) {
      const built = buildAvisoEmailContent({
        texto: aviso?.texto ?? text ?? '',
        nombre: aviso?.nombre,
        organizacion: aviso?.organizacion,
        imagenes: aviso?.imagenes,
        imagenBase64: aviso?.imagenBase64,
        imagenMime: aviso?.imagenMime,
        imagenNombre: aviso?.imagenNombre,
      });
      mailHtml = built.html;
      attachments = built.attachments || [];
      mailText = String(aviso?.texto ?? text ?? '').trim();
    } else if (!mailHtml && tipo === 'entrega' && entrega) {
      const built = buildEntregaEmailContent(entrega);
      mailHtml = built.html;
      attachments = built.attachments || [];
    } else if (!mailHtml && codigo_boleta) {
      const built = await buildBoletaEmailContent({
        text: text || '',
        codigo_boleta,
        enlace_boleta,
      });
      mailHtml = built.html;
      attachments = built.attachments;
    }

    const transporter = createTransporter(creds.user, creds.pass);
    const mailOptions = {
      from: `"${nombreVisible.replace(/"/g, '')}" <${creds.user}>`,
      replyTo,
      to: destinatario,
      subject: subject.trim(),
      text: mailText || text || '',
      html: mailHtml || undefined,
      attachments: attachments.length ? attachments : undefined,
      headers: {
        'X-Mailer': 'VentaDeTurnos',
        'Auto-Submitted': 'no',
      },
    };
    if (bccList.length) {
      mailOptions.bcc = bccList;
    }

    const info = await transporter.sendMail(mailOptions);

    return res.status(200).json({
      ok: true,
      messageId: info.messageId,
      destinatario,
      bccCount: bccList.length || undefined,
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
