import { getDefaultLayout, mergeReciboLayout } from './reciboLayout';

/** Formatos de impresión de boleta / recibo */
export const FORMATOS_RECIBO = [
  { id: 'termico_58', label: 'Térmico 58 mm', descripcion: 'Impresoras POS pequeñas' },
  { id: 'termico_80', label: 'Térmico 80 mm', descripcion: 'Estándar en taquilla' },
  { id: 'media_carta', label: 'Media carta', descripcion: '8.5" × 5.5" (horizontal)' },
];

export const DEFAULT_RECIBO_CONFIG = {
  formato: 'termico_80',
  logo_url: null,
  logo_ancho_px: 120,
  logo_alineacion: 'centro',
  titulo_personalizado: '',
  mostrar_nombre_org: true,
  mostrar_evento: true,
  mostrar_turno: true,
  mostrar_etiqueta_turno: true,
  mostrar_cargador: true,
  mostrar_precio: true,
  mostrar_codigo_texto: true,
  mensaje_qr: 'Presente este QR para retirar su turno',
  pie_texto: '',
  color_primario: '#6366f1',
  tamano_fuente: 'normal',
  editor_visual: true,
};

export function mergeReciboConfig(guardado) {
  if (!guardado || typeof guardado !== 'object') {
    const formato = DEFAULT_RECIBO_CONFIG.formato;
    return {
      ...DEFAULT_RECIBO_CONFIG,
      layout: getDefaultLayout(formato),
    };
  }
  const diseño =
    guardado.diseño &&
    typeof guardado.diseño === 'object' &&
    !Array.isArray(guardado.diseño)
      ? guardado.diseño
      : !Array.isArray(guardado)
        ? guardado
        : {};
  const formato = guardado.formato || diseño.formato || DEFAULT_RECIBO_CONFIG.formato;
  const merged = {
    ...DEFAULT_RECIBO_CONFIG,
    ...diseño,
    formato,
  };
  merged.layout = mergeReciboLayout(formato, diseño.layout || guardado.layout);
  return merged;
}
