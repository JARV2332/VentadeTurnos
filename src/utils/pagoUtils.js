export const METODOS_PAGO = [
  { id: 'efectivo', label: 'Efectivo', icon: '💵', requiereComprobante: false },
  { id: 'transferencia', label: 'Transferencia', icon: '🏦', requiereComprobante: true },
  { id: 'tarjeta', label: 'Tarjeta', icon: '💳', requiereComprobante: true },
];

export function labelMetodoPago(id) {
  return METODOS_PAGO.find((m) => m.id === id)?.label || id;
}

export function metodoRequiereComprobante(id) {
  return METODOS_PAGO.find((m) => m.id === id)?.requiereComprobante ?? false;
}

/** Lee imagen y devuelve data URL para almacenamiento mock */
export function leerImagenComoDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('Seleccione una imagen (JPG, PNG, etc.)'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      reject(new Error('La imagen no debe superar 5 MB'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}
