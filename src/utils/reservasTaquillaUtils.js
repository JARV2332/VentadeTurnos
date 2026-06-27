export const MINUTOS_RESERVA_TAQUILLA_COLGADA = 15;

/** Reserva temporal de taquilla (no apartado) sin confirmar más de N minutos. */
export function esReservaTaquillaColgada(brazo, minutos = MINUTOS_RESERVA_TAQUILLA_COLGADA) {
  if (brazo?.estado !== 'reservado' || brazo?.reserva_apartado) return false;
  const ref = brazo.updated_at || brazo.created_at;
  if (!ref) return false;
  const ageMs = Date.now() - new Date(ref).getTime();
  return ageMs > minutos * 60 * 1000;
}

export function contarReservasTaquillaColgadas(brazos, minutos = MINUTOS_RESERVA_TAQUILLA_COLGADA) {
  return (brazos || []).filter((b) => esReservaTaquillaColgada(b, minutos)).length;
}

export function listarReservasTaquillaColgadas(brazos, minutos = MINUTOS_RESERVA_TAQUILLA_COLGADA) {
  return (brazos || []).filter((b) => esReservaTaquillaColgada(b, minutos));
}
