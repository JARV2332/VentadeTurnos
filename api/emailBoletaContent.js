/**
 * HTML + adjunto PNG con QR para correos de boleta (Gmail SMTP).
 */
import QRCode from 'qrcode';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function textoAHtml(text) {
  return escapeHtml(text).replace(/\n/g, '<br />\n');
}

/**
 * @param {{ text: string, codigo_boleta: string, enlace_boleta?: string }} params
 */
export async function buildBoletaEmailContent({ text, codigo_boleta, enlace_boleta }) {
  const codigo = String(codigo_boleta || '').trim();
  if (!codigo) {
    return { html: undefined, attachments: [] };
  }

  const qrBuffer = await QRCode.toBuffer(codigo, {
    type: 'png',
    width: 220,
    margin: 2,
    errorCorrectionLevel: 'M',
  });

  const link = String(enlace_boleta || '').trim();
  const linkBlock = link
    ? `<p style="margin:16px 0 0;">
        <a href="${escapeHtml(link)}" style="color:#4f46e5;font-weight:600;text-decoration:none;">
          Abrir boleta digital en el navegador
        </a>
      </p>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#1e293b;line-height:1.55;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:24px 28px;font-size:15px;">
              ${textoAHtml(text)}
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:2px solid #e2e8f0;border-radius:12px;background:#fafafa;">
                <tr>
                  <td align="center" style="padding:20px;">
                    <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#334155;">Código QR de su boleta</p>
                    <img src="cid:boleta-qr" alt="QR ${escapeHtml(codigo)}" width="220" height="220" style="display:block;margin:0 auto;border-radius:8px;" />
                    <p style="margin:12px 0 0;font-family:Consolas,Monaco,monospace;font-size:14px;font-weight:700;letter-spacing:0.02em;">${escapeHtml(codigo)}</p>
                    <p style="margin:8px 0 0;font-size:12px;color:#64748b;">Presente este QR en taquilla para retirar su turno físico.</p>
                    ${linkBlock}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const attachments = [
    {
      filename: `boleta-${codigo}.png`,
      content: qrBuffer,
      cid: 'boleta-qr',
    },
  ];

  return { html, attachments };
}
