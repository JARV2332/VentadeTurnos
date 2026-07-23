const CUERPO_PARRAFOS = [
  'Nos llena de satisfacción informarte que ya hemos entregado el turno correspondiente para acompañar a Nuestra Señora de la Asunción este próximo 15 de agosto.',
  'Tienes en tus manos el privilegio de ser parte de un momento sagrado. Más que un cortejo, viviremos un día donde las calles se visten de fiesta y la fe se transforma en arte, devoción y oración compartida bajo la mirada amorosa de la Virgen.',
  'Aguardamos con entusiasmo este 15 de agosto para caminar juntos.',
];

export const ENTREGA_EMAIL_ASUNTO = 'Confirmación de entrega — Nuestra Señora de la Asunción';

/**
 * Texto plano del correo de confirmación de entrega física.
 */
export function construirCorreoEntrega({
  cargador,
  organizacion,
  entregado_a_tercero,
  entregado_receptor_nombre,
}) {
  const primerNombre = cargador?.nombre_completo?.trim().split(/\s+/)[0] || 'devoto(a)';
  const nombreCompleto = cargador?.nombre_completo?.trim() || 'Devoto(a)';
  const org = organizacion?.nombre_oficial?.trim() || 'Organización';
  const asunto = ENTREGA_EMAIL_ASUNTO;

  const lineas = [`Estimado/a ${primerNombre},`, '', ...CUERPO_PARRAFOS];

  if (entregado_a_tercero && entregado_receptor_nombre?.trim()) {
    lineas.push(
      '',
      `Nota: El turno fue entregado a ${entregado_receptor_nombre.trim()} (tercero autorizado), a nombre de ${nombreCompleto}.`
    );
  }

  lineas.push('', `Atentamente,`, org);

  const cuerpo = lineas.join('\n');

  return { asunto, cuerpo, primerNombre, nombreCompleto };
}
