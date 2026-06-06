/** Plantilla predeterminada del cuerpo del correo de boleta. */
export const LEYENDA_CORREO_DEFAULT = `Estimado/a {nombre},

Turnos adquiridos para "{evento}":

{turnos}

Total ofrenda: {total}
Código recibo: {codigo}

En este correo encontrará su código QR (imagen adjunta y en el cuerpo del mensaje).
También puede abrir su boleta digital aquí: {enlace}

Para la entrega de cada turno físico, presente el QR correspondiente (VT-…) en taquilla.

Organización: {organizacion}`;

export const LEYENDA_CORREO_PLACEHOLDERS = [
  { token: '{nombre}', desc: 'Primer nombre del devoto(a)' },
  { token: '{nombre_completo}', desc: 'Nombre completo del devoto(a)' },
  { token: '{evento}', desc: 'Nombre de la procesión o evento' },
  { token: '{turnos}', desc: 'Lista automática de turnos y ofrendas' },
  { token: '{total}', desc: 'Total de ofrenda formateado' },
  { token: '{codigo}', desc: 'Código del recibo (VR-… o VT-…)' },
  { token: '{enlace}', desc: 'Enlace a la boleta digital' },
  { token: '{organizacion}', desc: 'Nombre oficial de la asociación' },
];

/** Sustituye placeholders {clave} en la plantilla. */
export function aplicarLeyendaCorreo(plantilla, vars) {
  const base = (plantilla || '').trim() || LEYENDA_CORREO_DEFAULT;
  return Object.entries(vars).reduce(
    (texto, [clave, valor]) =>
      texto.replace(new RegExp(`\\{${clave}\\}`, 'g'), String(valor ?? '')),
    base
  );
}
