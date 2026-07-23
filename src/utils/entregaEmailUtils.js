import { formatFechaDiaMes } from './boletaUtils';

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

function labelTurno(turno, brazo) {
  const num = turno?.numero_turno ?? brazo?.numero_turno ?? '—';
  const honor = turno?.etiqueta || turno?.tipo_turno || '';
  return honor ? `Turno #${num} (${honor})` : `Turno #${num}`;
}

/**
 * Texto plano del correo de confirmación de entrega física.
 */
export function construirCorreoEntrega({
  cargador,
  brazo,
  turno,
  cortejo,
  organizacion,
  entregado_a_tercero,
  entregado_receptor_nombre,
  entregado_en,
}) {
  const primerNombre = cargador?.nombre_completo?.trim().split(/\s+/)[0] || 'devoto(a)';
  const nombreCompleto = cargador?.nombre_completo?.trim() || 'Devoto(a)';
  const evento = cortejo?.nombre_evento || 'la procesión';
  const fechaProcesion = formatFechaDiaMes(cortejo?.fecha);
  const fechaEntrega = formatFechaHoraEntrega(entregado_en || new Date().toISOString());
  const turnoTxt = labelTurno(turno, brazo);
  const org = organizacion?.nombre_oficial?.trim() || 'Organización';

  const asunto = `Confirmación de entrega — ${turnoTxt}`;

  let cuerpo;
  if (entregado_a_tercero && entregado_receptor_nombre?.trim()) {
    const receptor = entregado_receptor_nombre.trim();
    cuerpo = [
      `Estimado/a ${primerNombre},`,
      '',
      `Le confirmamos que su turno de ${evento}${fechaProcesion ? ` (${fechaProcesion})` : ''} fue entregado en físico.`,
      '',
      `• ${turnoTxt}`,
      `• Entregado a: ${receptor} (tercero autorizado)`,
      `• Fecha y hora: ${fechaEntrega}`,
      '',
      `El turno a nombre de ${nombreCompleto} fue recibido por ${receptor}. Conserve este correo como comprobante.`,
      '',
      `Atentamente,`,
      org,
    ].join('\n');
  } else {
    cuerpo = [
      `Estimado/a ${primerNombre},`,
      '',
      `Le confirmamos que su turno de ${evento}${fechaProcesion ? ` (${fechaProcesion})` : ''} fue entregado en físico.`,
      '',
      `• ${turnoTxt}`,
      `• Entregado personalmente a usted`,
      `• Fecha y hora: ${fechaEntrega}`,
      '',
      `Gracias por su participación. Conserve este correo como comprobante de entrega.`,
      '',
      `Atentamente,`,
      org,
    ].join('\n');
  }

  return { asunto, cuerpo, primerNombre, nombreCompleto, turnoTxt, fechaEntrega, evento };
}
