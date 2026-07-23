/**
 * HTML para correo de confirmación de entrega física de turno.
 */

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {{
 *   primerNombre: string,
 *   nombreCompleto: string,
 *   evento: string,
 *   turnoTxt: string,
 *   brazoTxt: string,
 *   fechaEntrega: string,
 *   entregado_a_tercero?: boolean,
 *   entregado_receptor_nombre?: string,
 *   organizacion?: string,
 * }} params
 */
export function buildEntregaEmailContent({
  primerNombre,
  nombreCompleto,
  evento,
  turnoTxt,
  brazoTxt,
  fechaEntrega,
  entregado_a_tercero,
  entregado_receptor_nombre,
  organizacion,
}) {
  const esTercero = entregado_a_tercero && entregado_receptor_nombre?.trim();
  const receptor = esTercero ? entregado_receptor_nombre.trim() : '';

  const mensajePrincipal = esTercero
    ? `Su turno de <strong>${escapeHtml(evento)}</strong> fue entregado a <strong>${escapeHtml(receptor)}</strong> (tercero autorizado), a nombre de ${escapeHtml(nombreCompleto)}.`
    : `Su turno de <strong>${escapeHtml(evento)}</strong> fue entregado personalmente. ¡Gracias por su participación!`;

  const filaReceptor = esTercero
    ? `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;width:38%;">Recibió</td>
        <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-size:14px;font-weight:600;">${escapeHtml(receptor)} <span style="color:#64748b;font-weight:500;">(tercero)</span></td>
      </tr>`
    : `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;width:38%;">Recibió</td>
        <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-size:14px;font-weight:600;">${escapeHtml(nombreCompleto)} <span style="color:#64748b;font-weight:500;">(titular)</span></td>
      </tr>`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.55;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.06);">
          <tr>
            <td style="background:linear-gradient(135deg,#4f46e5 0%,#6366f1 100%);padding:28px 28px 24px;text-align:center;">
              <div style="display:inline-block;width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,0.2);line-height:52px;font-size:26px;margin-bottom:12px;">✓</div>
              <h1 style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">Turno entregado</h1>
              <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.9);">Confirmación de entrega física</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px 8px;font-size:15px;">
              <p style="margin:0 0 12px;">Estimado/a <strong>${escapeHtml(primerNombre)}</strong>,</p>
              <p style="margin:0;color:#334155;">${mensajePrincipal}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:4px 16px;">
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;width:38%;">Turno</td>
                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-size:14px;font-weight:600;">${escapeHtml(turnoTxt)}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;">Brazo</td>
                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-size:14px;font-weight:600;">${escapeHtml(brazoTxt)}</td>
                </tr>
                ${filaReceptor}
                <tr>
                  <td style="padding:10px 0;color:#64748b;font-size:13px;">Fecha y hora</td>
                  <td style="padding:10px 0;font-size:14px;font-weight:600;">${escapeHtml(fechaEntrega)}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 28px;font-size:12px;color:#64748b;text-align:center;">
              Conserve este correo como comprobante.<br />
              ${organizacion ? `<strong style="color:#475569;">${escapeHtml(organizacion)}</strong>` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { html };
}
