/**
 * HTML para correo de confirmación de entrega física de turno.
 * La imagen va incrustada (CID) para verse dentro del cuerpo del correo.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const ENTREGA_EMAIL_ASUNTO = 'Confirmación de entrega — Nuestra Señora de la Asunción';

/** Content-ID para imagen inline en el cuerpo del correo. */
export const ENTREGA_IMAGEN_CID = 'asuncion-entrega@ventadeturnos';

const CUERPO_PARRAFOS = [
  'Nos llena de satisfacción informarte que ya hemos entregado el turno correspondiente para acompañar a Nuestra Señora de la Asunción este próximo 15 de agosto.',
  'Tienes en tus manos el privilegio de ser parte de un momento sagrado. Más que un cortejo, viviremos un día donde las calles se visten de fiesta y la fe se transforma en arte, devoción y oración compartida bajo la mirada amorosa de la Virgen.',
  'Aguardamos con entusiasmo este 15 de agosto para caminar juntos.',
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let imagenEntregaCache = null;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Fallback por URL pública si no se puede leer el archivo en el servidor. */
export function urlImagenEntregaEmail() {
  const base = (
    process.env.REACT_APP_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    'https://ventade-turnos.vercel.app'
  ).replace(/\/$/, '');
  return `${base}/email/asuncion-entrega.png`;
}

function cargarImagenEntrega() {
  if (imagenEntregaCache) return imagenEntregaCache;
  const rutas = [
    path.join(__dirname, 'assets', 'asuncion-entrega.png'),
    path.join(process.cwd(), 'public', 'email', 'asuncion-entrega.png'),
  ];
  for (const ruta of rutas) {
    try {
      if (fs.existsSync(ruta)) {
        imagenEntregaCache = fs.readFileSync(ruta);
        return imagenEntregaCache;
      }
    } catch {
      /* siguiente ruta */
    }
  }
  return null;
}

/** Adjunto inline para que la imagen se vea dentro del cuerpo del correo. */
export function adjuntoImagenEntregaInline() {
  const content = cargarImagenEntrega();
  if (!content) return null;
  return {
    filename: 'asuncion-entrega.png',
    content,
    cid: ENTREGA_IMAGEN_CID,
    contentDisposition: 'inline',
    contentType: 'image/png',
  };
}

export function buildEntregaTextoPlano({
  primerNombre,
  nombreCompleto,
  entregado_a_tercero,
  entregado_receptor_nombre,
  organizacion,
}) {
  const esTercero = entregado_a_tercero && entregado_receptor_nombre?.trim();
  const lineas = [
    `Estimado/a ${primerNombre || 'devoto(a)'},`,
    '',
    ...CUERPO_PARRAFOS,
  ];

  if (esTercero) {
    lineas.push(
      '',
      `Nota: El turno fue entregado a ${entregado_receptor_nombre.trim()} (tercero autorizado), a nombre de ${nombreCompleto || 'el titular'}.`
    );
  }

  lineas.push('', organizacion ? `Atentamente, ${organizacion}` : 'Atentamente,');

  return lineas.join('\n');
}

/**
 * @param {{
 *   primerNombre: string,
 *   nombreCompleto?: string,
 *   entregado_a_tercero?: boolean,
 *   entregado_receptor_nombre?: string,
 *   organizacion?: string,
 * }} params
 * @returns {{ html: string, attachments: object[] }}
 */
export function buildEntregaEmailContent({
  primerNombre,
  nombreCompleto,
  entregado_a_tercero,
  entregado_receptor_nombre,
  organizacion,
}) {
  const esTercero = entregado_a_tercero && entregado_receptor_nombre?.trim();
  const receptor = esTercero ? entregado_receptor_nombre.trim() : '';

  const adjunto = adjuntoImagenEntregaInline();
  const imgSrc = adjunto ? `cid:${ENTREGA_IMAGEN_CID}` : urlImagenEntregaEmail();

  const notaTercero = esTercero
    ? `<p style="margin:20px 0 0;padding:14px 16px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;font-size:13px;color:#0369a1;line-height:1.5;">
        El turno fue entregado a <strong>${escapeHtml(receptor)}</strong> (tercero autorizado), a nombre de ${escapeHtml(nombreCompleto || 'el titular')}.
      </p>`
    : '';

  const parrafosHtml = CUERPO_PARRAFOS.map(
    (p) =>
      `<p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.65;">${escapeHtml(p)}</p>`
  ).join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0;padding:0;background:#eef4fb;font-family:Georgia,'Times New Roman',serif;color:#1e293b;line-height:1.6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef4fb;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #dbeafe;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(30,58,95,0.08);">
          <tr>
            <td style="background:linear-gradient(160deg,#1e40af 0%,#3b82f6 50%,#93c5fd 100%);padding:32px 28px 28px;text-align:center;">
              <p style="margin:0 0 8px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.85);font-family:Arial,Helvetica,sans-serif;">Confirmación de entrega</p>
              <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;font-family:Georgia,'Times New Roman',serif;">Nuestra Señora de la Asunción</h1>
              <p style="margin:10px 0 0;font-size:14px;color:rgba(255,255,255,0.92);font-family:Arial,Helvetica,sans-serif;">15 de agosto · 2026</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px;font-family:Arial,Helvetica,sans-serif;">
              <p style="margin:0 0 18px;font-size:15px;color:#0f172a;">Estimado/a <strong>${escapeHtml(primerNombre)}</strong>,</p>
              ${parrafosHtml}
              ${notaTercero}
            </td>
          </tr>
          <tr>
            <td style="padding:12px 16px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(180deg,#f8fbff 0%,#eef4fb 100%);border-radius:14px;overflow:hidden;border:1px solid #dbeafe;">
                <tr>
                  <td align="center" style="padding:12px 12px 16px;line-height:0;">
                    <img
                      src="${escapeHtml(imgSrc)}"
                      alt="Nuestra Señora de la Asunción — Tradicional Rezado, 15 de agosto 2026"
                      width="520"
                      style="display:block;width:100%;max-width:520px;height:auto;border-radius:10px;margin:0 auto;"
                    />
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 28px;font-size:12px;color:#64748b;text-align:center;font-family:Arial,Helvetica,sans-serif;">
              ${organizacion ? `<strong style="color:#475569;display:block;margin-bottom:4px;">${escapeHtml(organizacion)}</strong>` : ''}
              Conserve este correo como comprobante de entrega.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const attachments = adjunto ? [adjunto] : [];

  return { html, attachments };
}
