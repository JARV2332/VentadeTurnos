const CACHE_PREFIX = 'vtd_taquilla_v1';

export function cacheKeyTaquilla(organizacionId, cortejoId) {
  return `${CACHE_PREFIX}_${organizacionId}_${cortejoId}`;
}

export function leerCacheTaquilla(organizacionId, cortejoId) {
  if (!organizacionId || !cortejoId || typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(cacheKeyTaquilla(organizacionId, cortejoId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.turnos) && parsed.turnos.length) return parsed.turnos;
  } catch {
    /* caché corrupta */
  }
  return null;
}

export function guardarCacheTaquilla(organizacionId, cortejoId, turnos) {
  if (!organizacionId || !cortejoId || !turnos?.length || typeof sessionStorage === 'undefined') {
    return;
  }
  try {
    sessionStorage.setItem(
      cacheKeyTaquilla(organizacionId, cortejoId),
      JSON.stringify({ turnos, ts: Date.now() })
    );
  } catch {
    /* quota */
  }
}
