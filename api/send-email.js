/**
 * Envío de correos vía Gmail SMTP (contraseña de aplicación en variables de servidor).
 * Variables en Vercel: GMAIL_USER, GMAIL_APP_PASSWORD
 */
import nodemailer from 'nodemailer';
import { verifyAuth } from './verifyAuth.js';

function getTransporter() {
  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, '');
  if (!user || !pass) {
    return null;
  }
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user, pass },
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const auth = await verifyAuth(req);
  if (auth.error) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const transporter = getTransporter();
  if (!transporter) {
    return res.status(500).json({
      error:
        'Configure GMAIL_USER y GMAIL_APP_PASSWORD en Vercel (Settings → Environment Variables).',
    });
  }

  const gmailUser = process.env.GMAIL_USER.trim();
  const { from, reply_to, to, subject, text, html } = req.body || {};

  const destinatario = String(to || '')
    .trim()
    .toLowerCase();
  if (!destinatario || !destinatario.includes('@')) {
    return res.status(400).json({ error: 'Destinatario no válido' });
  }
  if (!subject?.trim()) {
    return res.status(400).json({ error: 'Asunto requerido' });
  }

  // Gmail SMTP exige enviar desde la cuenta autenticada; el nombre visible sí puede personalizarse.
  let nombreVisible = 'Venta de turnos';
  const matchFrom = String(from || '').match(/^(.+?)\s*<([^>]+)>$/);
  if (matchFrom) {
    nombreVisible = matchFrom[1].trim() || nombreVisible;
  } else if (from && !from.includes('@')) {
    nombreVisible = from.trim();
  }

  const replyTo = String(reply_to || gmailUser).trim() || gmailUser;

  try {
    const info = await transporter.sendMail({
      from: `"${nombreVisible.replace(/"/g, '')}" <${gmailUser}>`,
      replyTo,
      to: destinatario,
      subject: subject.trim(),
      text: text || '',
      html: html || undefined,
    });

    return res.status(200).json({
      ok: true,
      messageId: info.messageId,
      destinatario,
    });
  } catch (err) {
    console.error('send-email:', err);
    const msg = err.message || 'Error al enviar';
    if (msg.includes('Invalid login') || msg.includes('535')) {
      return res.status(500).json({
        error:
          'Gmail rechazó la contraseña. Use una contraseña de aplicación (16 caracteres) con 2FA activo.',
      });
    }
    return res.status(500).json({ error: msg });
  }
}
