/**
 * URL pública de la app para enlaces de correo (confirmación, recuperación).
 * En producción usa REACT_APP_APP_URL; en local usa window.location.origin.
 */
export function getAppUrl() {
  const configured = process.env.REACT_APP_APP_URL?.replace(/\/$/, '');
  if (configured && !configured.includes('localhost')) {
    return configured;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/$/, '');
  }
  return 'https://ventadeturnos.vercel.app';
}

export function authCallbackUrl(path) {
  const base = getAppUrl();
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}
