/** Marca brazos reservados (apartados) según la asignación del Excel al crear la procesión. */

export function aplicarAsignacionBrazos(brazos, asignacion) {
  const lista = Array.isArray(brazos) ? brazos.map((b) => ({ ...b })) : [];
  if (!asignacion || asignacion.tipo === 'disponible') return lista;

  const nota = 'Apartado — reservado al crear procesión (Excel)';

  if (asignacion.tipo === 'reservado_total') {
    return lista.map((b) => ({
      ...b,
      estado: 'reservado',
      reserva_apartado: true,
      apartado_notas: nota,
    }));
  }

  if (asignacion.tipo === 'mixto') {
    const n = Math.max(0, Number(asignacion.reservados) || 0);
    return lista.map((b, i) =>
      i < n
        ? {
            ...b,
            estado: 'reservado',
            reserva_apartado: true,
            apartado_notas: nota,
          }
        : b
    );
  }

  return lista;
}
