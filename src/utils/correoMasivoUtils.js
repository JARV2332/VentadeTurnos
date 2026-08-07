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
 * Une nombres en español: "A", "A y B", "A, B y C".
 */
export function formatearListaNombres(nombres) {
  const lista = [];
  const vistos = new Set();
  (nombres || []).forEach((raw) => {
    const n = String(raw || '').trim();
    if (!n || n === '—') return;
    const key = n.toLowerCase();
    if (vistos.has(key)) return;
    vistos.add(key);
    lista.push(n);
  });
  if (!lista.length) return 'devoto(a)';
  if (lista.length === 1) return lista[0];
  if (lista.length === 2) return `${lista[0]} y ${lista[1]}`;
  return `${lista.slice(0, -1).join(', ')} y ${lista[lista.length - 1]}`;
}

/** Primer nombre de cada persona, unidos igual que formatearListaNombres. */
export function formatearPrimerosNombres(nombres) {
  return formatearListaNombres(
    (nombres || []).map((n) => {
      const t = String(n || '').trim();
      return t.split(/\s+/)[0] || t;
    })
  );
}

function nombresDeDestinatario(destinatario) {
  if (Array.isArray(destinatario?.nombres) && destinatario.nombres.length) {
    return destinatario.nombres;
  }
  const unico = String(destinatario?.nombre || '').trim();
  return unico ? [unico] : [];
}

/**
 * Personaliza el cuerpo: {nombre} / {nombre_completo}
 * Si varios devotos comparten el correo, concatena los nombres.
 */
export function personalizarTextoAviso(texto, destinatario) {
  const nombres = nombresDeDestinatario(destinatario);
  const nombreCompleto = formatearListaNombres(nombres);
  const primerNombre = formatearPrimerosNombres(nombres);
  return String(texto || '')
    .replace(/\{nombre_completo\}/gi, nombreCompleto)
    .replace(/\{nombre\}/gi, primerNombre);
}

/**
 * @param {'exitosos'|'excepto_fallidos'} modo
 *   - exitosos: solo correos con al menos un envío OK (y sin rebote)
 *   - excepto_fallidos: todos los devotos con correo, excepto los que tienen error/rebotado
 * Un mismo correo = un solo envío; se concatenan los nombres de todos los devotos.
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
    const nombre = c.nombre_completo?.trim() || '—';
    if (!porEmailCargador.has(email)) {
      porEmailCargador.set(email, {
        correo: email,
        nombres: nombre && nombre !== '—' ? [nombre] : [],
        cargadorId: c.id,
      });
      return;
    }
    const entry = porEmailCargador.get(email);
    const key = nombre.toLowerCase();
    if (
      nombre &&
      nombre !== '—' &&
      !entry.nombres.some((n) => n.toLowerCase() === key)
    ) {
      entry.nombres.push(nombre);
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
    const desdeCargadores = porEmailCargador.get(email);
    const nombreHistorial =
      (historial || []).find((r) => normalizarCorreo(r.destinatario) === email)?.metadata
        ?.cargador_nombre || '—';
    const nombres = [...(desdeCargadores?.nombres || [])];
    if (!nombres.length && nombreHistorial && nombreHistorial !== '—') {
      nombres.push(nombreHistorial);
    }
    const nombre = formatearListaNombres(nombres);

    if (motivo) {
      excluidos.push({
        correo: email,
        nombre,
        nombres,
        cantidadPersonas: Math.max(nombres.length, 1),
        motivo,
      });
      return;
    }

    incluidos.push({
      correo: email,
      nombre,
      nombres,
      cantidadPersonas: Math.max(nombres.length, 1),
      cargadorId: desdeCargadores?.cargadorId ?? null,
      tuvoExito: tieneExito.has(email),
    });
  });

  incluidos.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  excluidos.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  const personasIncluidas = incluidos.reduce(
    (acc, d) => acc + (d.cantidadPersonas || 1),
    0
  );
  const correosConVarios = incluidos.filter((d) => (d.cantidadPersonas || 1) > 1).length;

  return {
    incluidos,
    excluidos,
    personasIncluidas,
    correosConVarios,
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
