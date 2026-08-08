/**
 * HTML para avisos / novenario: texto libre + imagen(es) opcional(es) (inline CID + adjunto).
 */

export const AVISO_IMAGEN_CID = 'aviso-imagen@ventadeturnos';

const MIME_PERMITIDOS = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const MAX_BYTES = 900 * 1024;
const MAX_IMAGENES = 5;
const MAX_TOTAL_BYTES = Math.floor(3.2 * 1024 * 1024);

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function textoAHtml(texto) {
  const raw = String(texto || '').trim();
  if (!raw) return '';
  return raw
    .split(/\n{2,}/)
    .map((bloque) => {
      const lineas = escapeHtml(bloque).replace(/\n/g, '<br/>');
      return `<p style="margin:0 0 14px;font-size:15px;color:#334155;line-height:1.65;">${lineas}</p>`;
    })
    .join('');
}

function normalizarListaImagenes({ imagenes, imagenBase64, imagenMime, imagenNombre }) {
  if (Array.isArray(imagenes) && imagenes.length) {
    return imagenes
      .map((img) => ({
        base64: img?.base64 ?? img?.imagenBase64,
        mime: img?.mime ?? img?.imagenMime,
        nombre: img?.nombre ?? img?.imagenNombre,
      }))
      .filter((img) => img.base64 && img.mime);
  }
  if (imagenBase64 && imagenMime) {
    return [{ base64: imagenBase64, mime: imagenMime, nombre: imagenNombre }];
  }
  return [];
}

/**
 * @param {{
 *   texto?: string,
 *   nombre?: string,
 *   organizacion?: string,
 *   imagenes?: Array<{ base64?: string, mime?: string, nombre?: string }>,
 *   imagenBase64?: string,
 *   imagenMime?: string,
 *   imagenNombre?: string,
 * }} params
 */
export function buildAvisoEmailContent({
  texto,
  nombre,
  organizacion,
  imagenes,
  imagenBase64,
  imagenMime,
  imagenNombre,
}) {
  const attachments = [];
  const lista = normalizarListaImagenes({
    imagenes,
    imagenBase64,
    imagenMime,
    imagenNombre,
  }).slice(0, MAX_IMAGENES);

  let totalBytes = 0;
  const imgRows = [];

  lista.forEach((img, index) => {
    const mime = String(img.mime || '').toLowerCase().trim();
    const b64raw = String(img.base64 || '')
      .replace(/^data:[^;]+;base64,/, '')
      .trim();

    if (!b64raw || !mime) return;

    if (!MIME_PERMITIDOS.has(mime)) {
      throw new Error('Cada imagen debe ser JPG, PNG, WEBP o GIF.');
    }
    const buffer = Buffer.from(b64raw, 'base64');
    if (!buffer.length) {
      throw new Error('No se pudo leer una de las imágenes adjuntas.');
    }
    if (buffer.length > MAX_BYTES) {
      throw new Error('Una imagen supera el máximo de 900 KB. Redúzcala e intente de nuevo.');
    }
    totalBytes += buffer.length;
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new Error(
        'El total de imágenes supera ~3.2 MB. Reduzca el tamaño o quite alguna.'
      );
    }

    const cid = index === 0 ? AVISO_IMAGEN_CID : `aviso-imagen-${index}@ventadeturnos`;
    const filename =
      String(img.nombre || `novenario-${index + 1}.jpg`)
        .replace(/[^\w.\-áéíóúñÁÉÍÓÚÑ ]+/gi, '_')
        .slice(0, 80) || `novenario-${index + 1}.jpg`;

    attachments.push({
      filename,
      content: buffer,
      contentType: mime === 'image/jpg' ? 'image/jpeg' : mime,
      cid,
      contentDisposition: 'inline',
    });

    imgRows.push(`
      <tr>
        <td style="padding:8px 16px ${index === lista.length - 1 ? '24px' : '8px'};">
          <img
            src="cid:${cid}"
            alt="Imagen ${index + 1}"
            width="520"
            style="display:block;width:100%;max-width:520px;height:auto;border-radius:10px;margin:0 auto;"
          />
        </td>
      </tr>`);
  });

  const imgBlock = imgRows.join('');

  // Evitar saludo doble: si el texto ya empieza con "Estimado…", no anteponer otro.
  const textoYaTieneSaludo = /^\s*estimad/i.test(String(texto || ''));
  const plural = /\sy\s/i.test(String(nombre || ''));
  const saludoTitulo = plural ? 'Estimados/as' : 'Estimado/a';
  const saludo =
    nombre && !textoYaTieneSaludo
      ? `<p style="margin:0 0 16px;font-size:15px;color:#0f172a;">${saludoTitulo} <strong>${escapeHtml(nombre)}</strong>,</p>`
      : '';

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Georgia,'Times New Roman',serif;color:#1e293b;line-height:1.6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
          <tr>
            <td style="padding:28px 28px 8px;font-family:Arial,Helvetica,sans-serif;">
              ${saludo}
              ${textoAHtml(texto)}
            </td>
          </tr>
          ${imgBlock}
          <tr>
            <td style="padding:0 28px 28px;font-size:12px;color:#64748b;text-align:center;font-family:Arial,Helvetica,sans-serif;">
              ${organizacion ? `<strong style="color:#475569;display:block;margin-bottom:4px;">${escapeHtml(organizacion)}</strong>` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { html, attachments };
}
