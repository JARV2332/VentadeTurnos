/**
 * Destinatarios para correo masivo (novenario / avisos):
 * prioriza correos con envío exitoso y excluye errores/rebotados.
 */

export function normalizarCorreo(correo) {
  return String(correo || '')
    .trim()
    .toLowerCase();
}

export function correoPareceValido(correo) {
  const v = normalizarCorreo(correo);
  return Boolean(v && v.includes('@') && !v.endsWith('@local') && v.length >= 5);
}

/**
 * Personaliza el cuerpo: {nombre} / {nombre_completo}
 */
export function personalizarTextoAviso(texto, destinatario) {
  const nombreCompleto = destinatario?.nombre || 'devoto(a)';
  const primerNombre = nombreCompleto.split(/\s+/)[0] || nombreCompleto;
  return String(texto || '')
    .replace(/\{nombre_completo\}/gi, nombreCompleto)
    .replace(/\{nombre\}/gi, primerNombre);
}

/**
 * @param {'exitosos'|'excepto_fallidos'} modo
 *   - exitosos: solo correos con al menos un envío OK (y sin rebote)
 *   - excepto_fallidos: todos los devotos con correo, excepto los que tienen error/rebotado
 */
export function construirDestinatariosCorreoMasivo({
  historial = [],
  cargadores = [],
  modo = 'exitosos',
} = {}) {
  const porEmailCargador = new Map();
  (cargadores || []).forEach((c) => {
    const email = normalizarCorreo(c.correo);
    if (!correoPareceValido(email)) return;
    if (!porEmailCargador.has(email)) {
      porEmailCargador.set(email, {
        correo: email,
        nombre: c.nombre_completo?.trim() || '—',
        cargadorId: c.id,
      });
    }
  });

  const tieneExito = new Set();
  const tieneError = new Set();
  const tieneRebote = new Set();

  (historial || []).forEach((row) => {
    const email = normalizarCorreo(row.destinatario);
    if (!correoPareceValido(email)) return;
    if (row.estado === 'enviado') tieneExito.add(email);
    if (row.estado === 'error') tieneError.add(email);
    if (row.estado === 'rebotado') tieneRebote.add(email);
  });

  /** Rebotado siempre fuera; error solo si nunca hubo envío exitoso. */
  const motivoExclusion = (email) => {
    if (tieneRebote.has(email)) return 'Marcado como rebotado';
    if (tieneError.has(email) && !tieneExito.has(email)) {
      return 'Solo tiene errores de envío (nunca llegó)';
    }
    return null;
  };

  const excluidos = [];
  const incluidos = [];
  const emailsBase =
    modo === 'excepto_fallidos'
      ? new Set([...porEmailCargador.keys()])
      : new Set([...tieneExito]);

  emailsBase.forEach((email) => {
    const motivo = motivoExclusion(email);
    const nombreBase =
      porEmailCargador.get(email)?.nombre ||
      (historial || []).find((r) => normalizarCorreo(r.destinatario) === email)?.metadata
        ?.cargador_nombre ||
      '—';

    if (motivo) {
      excluidos.push({ correo: email, nombre: nombreBase, motivo });
      return;
    }

    const base = porEmailCargador.get(email) || {
      correo: email,
      nombre: nombreBase,
      cargadorId: null,
    };
    incluidos.push({
      ...base,
      correo: email,
      tuvoExito: tieneExito.has(email),
    });
  });

  incluidos.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  excluidos.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  return {
    incluidos,
    excluidos,
    totalExitososHistorial: tieneExito.size,
    totalConProblema: new Set([...tieneError, ...tieneRebote]).size,
  };
}

export const MAX_IMAGEN_BYTES = 900 * 1024;

export function leerImagenComoBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('Seleccione una imagen.'));
      return;
    }
    if (!String(file.type || '').startsWith('image/')) {
      reject(new Error('El archivo debe ser una imagen (JPG, PNG, WEBP o GIF).'));
      return;
    }
    if (file.size > MAX_IMAGEN_BYTES) {
      reject(
        new Error(
          `La imagen pesa ${(file.size / 1024).toFixed(0)} KB. Máximo 900 KB. Redúzcala antes de adjuntar.`
        )
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      resolve({
        base64,
        mime: file.type,
        nombre: file.name || 'novenario.jpg',
        previewUrl: dataUrl,
        size: file.size,
      });
    };
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.readAsDataURL(file);
  });
}
