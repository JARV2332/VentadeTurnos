import nodemailer from 'nodemailer';

export function createTransporter(user, pass) {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user, pass },
  });
}

export async function credencialesDeOrganizacion(admin, organizacionId) {
  const { data } = await admin
    .from('configuracion_correo')
    .select(
      'gmail_smtp_user, gmail_app_password, correo_remitente, nombre_remitente, gmail_password_configurada'
    )
    .eq('organizacion_id', organizacionId)
    .maybeSingle();

  if (!data) return null;

  const user = (data.gmail_smtp_user || data.correo_remitente || '').trim().toLowerCase();
  const pass = data.gmail_app_password?.replace(/\s/g, '');
  if (user && pass) {
    return { user, pass, origen: 'organizacion', nombreRemitente: data.nombre_remitente };
  }
  return null;
}

export function credencialesGlobales() {
  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, '');
  if (user && pass) {
    return { user, pass, origen: 'vercel', nombreRemitente: null };
  }
  return null;
}

export async function obtenerCredencialesSmtp(admin, organizacionId) {
  return (await credencialesDeOrganizacion(admin, organizacionId)) || credencialesGlobales();
}
