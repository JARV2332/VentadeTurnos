export const DELAY_OPCIONES_SEG = [
  { value: 3, label: '3 segundos' },
  { value: 5, label: '5 segundos (recomendado)' },
  { value: 10, label: '10 segundos' },
  { value: 15, label: '15 segundos' },
  { value: 30, label: '30 segundos' },
  { value: 60, label: '1 minuto' },
];

export const DELAY_DEFAULT_SEG = 5;

export function dormir(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatearDuracionEstimada(cantidad, delaySeg) {
  const totalSeg = Math.max(0, cantidad) * Math.max(0, delaySeg);
  if (totalSeg < 60) return `~${totalSeg} s`;
  const minutos = Math.ceil(totalSeg / 60);
  if (minutos < 60) return `~${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto ? `~${horas} h ${resto} min` : `~${horas} h`;
}

export function analizarColaReenvio(recibos, cargadoresPorId) {
  const conCorreo = [];
  const sinCorreo = [];
  (recibos || []).forEach((recibo) => {
    const cargador = cargadoresPorId[recibo.brazos[0]?.cargador_id];
    if (cargador?.correo?.trim()) {
      conCorreo.push(recibo);
    } else {
      sinCorreo.push(recibo);
    }
  });
  return { conCorreo, sinCorreo, total: (recibos || []).length };
}
