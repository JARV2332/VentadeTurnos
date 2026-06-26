const STORAGE_PREFIX = 'vtd_cortejo_pref_';

export function leerCortejoPreferido(organizacionId) {
  if (!organizacionId || typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${organizacionId}`);
  } catch {
    return null;
  }
}

export function guardarCortejoPreferido(organizacionId, cortejoId) {
  if (!organizacionId || !cortejoId || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${organizacionId}`, cortejoId);
  } catch {
    /* quota / modo privado */
  }
}

/** Restaura la última procesión elegida o la activa por defecto. */
export function resolverCortejoInicial(cortejos, organizacionId, prevId) {
  const lista = cortejos || [];
  if (prevId && lista.some((c) => c.id === prevId)) return prevId;

  const preferido = leerCortejoPreferido(organizacionId);
  if (preferido && lista.some((c) => c.id === preferido)) return preferido;

  const activa = lista.find((c) => c.estado === 'activa');
  return activa?.id || lista[0]?.id || '';
}

export function cambiarCortejoPreferido(organizacionId, cortejoId, setCortejoId) {
  if (!cortejoId) return;
  setCortejoId(cortejoId);
  guardarCortejoPreferido(organizacionId, cortejoId);
}
