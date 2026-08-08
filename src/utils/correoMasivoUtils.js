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
/** Máx. imágenes por aviso (novenario). */
export const MAX_IMAGENES_AVISO = 5;
/**
 * Tope combinado (~3.2 MB) para no superar el body de la API (Vercel ~4.5 MB en base64).
 */
export const MAX_TOTAL_IMAGENES_BYTES = Math.floor(3.2 * 1024 * 1024);

function mimeDesdeNombre(nombre) {
  const ext = String(nombre || '')
    .split('.')
    .pop()
    ?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return '';
}

export function leerImagenComoBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('Seleccione una imagen.'));
      return;
    }
    const mime = String(file.type || '').trim() || mimeDesdeNombre(file.name);
    if (!mime.startsWith('image/')) {
      reject(new Error(`«${file.name || 'archivo'}» no es una imagen (JPG, PNG, WEBP o GIF).`));
      return;
    }
    if (file.size > MAX_IMAGEN_BYTES) {
      reject(
        new Error(
          `«${file.name || 'imagen'}» pesa ${(file.size / 1024).toFixed(0)} KB. Máximo 900 KB por archivo.`
        )
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      resolve({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        base64,
        mime: mime === 'image/jpg' ? 'image/jpeg' : mime,
        nombre: file.name || 'novenario.jpg',
        previewUrl: dataUrl,
        size: file.size,
      });
    };
    reader.onerror = () => reject(new Error(`No se pudo leer «${file.name || 'la imagen'}».`));
    reader.readAsDataURL(file);
  });
}

/**
 * Lee varias imágenes y las agrega a las ya elegidas (máx. MAX_IMAGENES_AVISO).
 * @returns {Promise<{ imagenes: object[], advertencias: string[] }>}
 */
export async function agregarImagenesAviso(existentes = [], files = []) {
  const actuales = Array.isArray(existentes) ? [...existentes] : [];
  const listaFiles = Array.from(files || []).filter(Boolean);
  const advertencias = [];

  if (!listaFiles.length) {
    return { imagenes: actuales, advertencias };
  }

  const cupo = MAX_IMAGENES_AVISO - actuales.length;
  if (cupo <= 0) {
    throw new Error(`Ya hay ${MAX_IMAGENES_AVISO} imágenes. Quite alguna para agregar otra.`);
  }

  if (listaFiles.length > cupo) {
    advertencias.push(
      `Solo se agregaron ${cupo} de ${listaFiles.length} (máximo ${MAX_IMAGENES_AVISO}).`
    );
  }

  const aLeer = listaFiles.slice(0, cupo);
  const leidas = [];
  const resultados = await Promise.allSettled(aLeer.map((file) => leerImagenComoBase64(file)));
  resultados.forEach((res, i) => {
    if (res.status === 'fulfilled') {
      leidas.push(res.value);
      return;
    }
    advertencias.push(res.reason?.message || `No se pudo leer «${aLeer[i]?.name || 'imagen'}».`);
  });

  if (!leidas.length) {
    throw new Error(advertencias.join(' ') || 'No se pudieron cargar las imágenes.');
  }

  const combinadas = [...actuales, ...leidas];
  let total = combinadas.reduce((acc, img) => acc + (img.size || 0), 0);
  while (total > MAX_TOTAL_IMAGENES_BYTES && combinadas.length > actuales.length) {
    const quitada = combinadas.pop();
    total -= quitada?.size || 0;
    advertencias.push(
      `«${quitada?.nombre || 'imagen'}» no cabe: el total de adjuntos no puede pasar de ${(
        MAX_TOTAL_IMAGENES_BYTES /
        1024 /
        1024
      ).toFixed(1)} MB. Reduzca el tamaño de las imágenes.`
    );
  }

  if (combinadas.length === actuales.length) {
    throw new Error(
      `No hay espacio: el total de adjuntos no puede pasar de ${(
        MAX_TOTAL_IMAGENES_BYTES /
        1024 /
        1024
      ).toFixed(1)} MB. Reduzca las imágenes.`
    );
  }

  return { imagenes: combinadas, advertencias };
}
