/** Plantilla predeterminada del cuerpo del correo de boleta. */
export const LEYENDA_CORREO_DEFAULT = `Reciba un fraterno saludo en Cristo Jesús y en nuestra Santísima Madre, la Virgen de la Asunción.

Por este medio nos dirigimos a usted para agradecerle su fervor y devoción, así como su valiosa participación en el solemne y tradicional {evento} de este año {anio}.

{turnos_bloque}Adjunto a este correo encontrará su boleta de pago junto con su respectivo código QR, el cual acredita la adquisición de su turno para el próximo {fecha_procesion}.
También puede consultar su boleta digital aquí: {enlace}
Código de su boleta: {codigo}

Para completar su proceso y poder portar con orgullo sobre sus hombros a nuestra Patrona, le solicitamos tomar nota de las siguientes instrucciones para la entrega de su cartulina oficial:

* Fecha única de entrega: {fecha_entrega}.

* Horario: {horario_entrega}.

* Requisito indispensable: Presentar el código QR adjunto en este correo, ya sea de forma digital (en su teléfono celular) o impreso en formato físico.

⚠️ Nota importante: Le recordamos que sin la presentación del código QR no será posible realizar la entrega de su cartulina.

Que Nuestra Señora de la Asunción bendiga a usted y a su familia, y que nos permita vivir con fe y devoción este magno día.

Fraternalmente,

{organizacion}`;

export const LEYENDA_CORREO_PLACEHOLDERS = [
  { token: '{nombre}', desc: 'Primer nombre del devoto(a)' },
  { token: '{nombre_completo}', desc: 'Nombre completo del devoto(a)' },
  { token: '{evento}', desc: 'Nombre de la procesión o evento' },
  { token: '{anio}', desc: 'Año del evento (desde la procesión)' },
  { token: '{fecha_procesion}', desc: 'Día y mes de la procesión (ej. 15 de agosto)' },
  { token: '{turnos_bloque}', desc: 'Lista de turnos y total de ofrenda' },
  { token: '{turnos}', desc: 'Solo la lista de turnos (con viñetas)' },
  { token: '{total}', desc: 'Total de ofrenda formateado' },
  { token: '{codigo}', desc: 'Código del recibo (VR-… o VT-…)' },
  { token: '{enlace}', desc: 'Enlace a la boleta digital' },
  { token: '{fecha_entrega}', desc: 'Fecha de entrega de cartulina (editable abajo)' },
  { token: '{horario_entrega}', desc: 'Horario de entrega (editable abajo)' },
  { token: '{organizacion}', desc: 'Nombre oficial de la asociación (firma)' },
];

export const CORREO_FECHA_ENTREGA_DEFAULT = 'Domingo 2 de agosto de 2026';
export const CORREO_HORARIO_ENTREGA_DEFAULT = 'De 8:00 a 15:00 horas';

/** Sustituye placeholders {clave} en la plantilla. */
export function aplicarLeyendaCorreo(plantilla, vars) {
  const base = (plantilla || '').trim() || LEYENDA_CORREO_DEFAULT;
  return Object.entries(vars).reduce(
    (texto, [clave, valor]) =>
      texto.replace(new RegExp(`\\{${clave}\\}`, 'g'), String(valor ?? '')),
    base
  );
}
