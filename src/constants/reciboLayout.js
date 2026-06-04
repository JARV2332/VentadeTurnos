/** Tamaño del lienzo del recibo por formato (px) */
export const CANVAS_RECIBO = {
  termico_58: { width: 220, height: 420 },
  termico_80: { width: 302, height: 500 },
  media_carta: { width: 520, height: 340 },
};

export const ELEMENTOS_RECIBO = [
  { id: 'logo', label: 'Logo' },
  { id: 'titulo', label: 'Título' },
  { id: 'evento', label: 'Evento' },
  { id: 'turno', label: 'Turno' },
  { id: 'cargador', label: 'Devoto(a)' },
  { id: 'qr', label: 'Código QR' },
  { id: 'precio', label: 'Precio' },
  { id: 'pie', label: 'Pie de boleta' },
];

const DEFAULTS = {
  termico_58: {
    logo: { x: 60, y: 8, w: 100, h: 48 },
    titulo: { x: 8, y: 62, w: 204, h: 36 },
    evento: { x: 8, y: 100, w: 204, h: 28 },
    turno: { x: 8, y: 132, w: 204, h: 56 },
    cargador: { x: 8, y: 192, w: 204, h: 44 },
    qr: { x: 40, y: 242, w: 140, h: 130 },
    precio: { x: 8, y: 378, w: 204, h: 32 },
    pie: { x: 8, y: 390, w: 204, h: 24 },
  },
  termico_80: {
    logo: { x: 91, y: 10, w: 120, h: 52 },
    titulo: { x: 12, y: 68, w: 278, h: 40 },
    evento: { x: 12, y: 110, w: 278, h: 30 },
    turno: { x: 12, y: 144, w: 278, h: 64 },
    cargador: { x: 12, y: 212, w: 278, h: 48 },
    qr: { x: 71, y: 266, w: 160, h: 150 },
    precio: { x: 12, y: 424, w: 278, h: 36 },
    pie: { x: 12, y: 464, w: 278, h: 28 },
  },
  media_carta: {
    logo: { x: 16, y: 12, w: 100, h: 56 },
    titulo: { x: 16, y: 72, w: 240, h: 40 },
    evento: { x: 16, y: 114, w: 240, h: 28 },
    turno: { x: 16, y: 146, w: 180, h: 56 },
    cargador: { x: 16, y: 206, w: 240, h: 44 },
    qr: { x: 320, y: 40, w: 180, h: 200 },
    precio: { x: 16, y: 258, w: 160, h: 36 },
    pie: { x: 16, y: 300, w: 488, h: 28 },
  },
};

export function getDefaultLayout(formato) {
  const canvas = CANVAS_RECIBO[formato] || CANVAS_RECIBO.termico_80;
  const base = DEFAULTS[formato] || DEFAULTS.termico_80;
  return {
    version: 1,
    canvas,
    elementos: { ...base },
  };
}

export function mergeReciboLayout(formato, layoutGuardado) {
  const def = getDefaultLayout(formato);
  if (!layoutGuardado?.elementos) return def;
  const elementos = { ...def.elementos };
  Object.keys(def.elementos).forEach((id) => {
    const g = layoutGuardado.elementos[id];
    if (g && typeof g === 'object') {
      elementos[id] = {
        x: Number(g.x) ?? def.elementos[id].x,
        y: Number(g.y) ?? def.elementos[id].y,
        w: Number(g.w) ?? def.elementos[id].w,
        h: Number(g.h) ?? def.elementos[id].h,
      };
    }
  });
  return {
    version: 1,
    canvas: layoutGuardado.canvas || def.canvas,
    elementos,
  };
}
