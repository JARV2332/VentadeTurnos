const CACHE = new Map();
const TTL_MS = 90_000;
const MAX_ENTRIES = 80;

function ahora() {
  return Date.now();
}

function podarCache() {
  if (CACHE.size <= MAX_ENTRIES) return;
  const ordenados = [...CACHE.entries()].sort((a, b) => a[1].ts - b[1].ts);
  while (CACHE.size > MAX_ENTRIES && ordenados.length) {
    CACHE.delete(ordenados.shift()[0]);
  }
}

export function cacheKeyBoleta(organizacionId, codigo) {
  return `${organizacionId}:${String(codigo || '').trim().toUpperCase()}`;
}

export function getBoletaCache(organizacionId, codigo) {
  const key = cacheKeyBoleta(organizacionId, codigo);
  const hit = CACHE.get(key);
  if (!hit) return null;
  if (ahora() - hit.ts > TTL_MS) {
    CACHE.delete(key);
    return null;
  }
  return hit.data;
}

export function setBoletaCache(organizacionId, codigo, data) {
  if (!data || data.error) return;
  const key = cacheKeyBoleta(organizacionId, codigo);
  CACHE.set(key, { ts: ahora(), data });
  podarCache();
}

export function invalidateBoletaCache(organizacionId, codigo) {
  CACHE.delete(cacheKeyBoleta(organizacionId, codigo));
}

export function invalidateBoletaCachePorBrazos(organizacionId, brazos, compra) {
  if (compra?.codigo_recibo) {
    invalidateBoletaCache(organizacionId, compra.codigo_recibo);
  }
  for (const b of brazos || []) {
    if (b?.codigo_boleta_qr) {
      invalidateBoletaCache(organizacionId, b.codigo_boleta_qr);
    }
  }
}
