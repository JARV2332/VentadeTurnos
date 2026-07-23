/**
 * Supabase a veces redirige recovery a localhost (Site URL por defecto).
 * Si el enlace cae en localhost, reenvía a producción con el mismo hash.
 */
const PRODUCTION_APP_URL =
  process.env.REACT_APP_APP_URL?.replace(/\/$/, '') || 'https://ventade-turnos.vercel.app';

export function redirectAuthCallbackFromLocalhost() {
  if (typeof window === 'undefined') return;

  const { hostname, hash, search, pathname } = window.location;
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') return;
  if (!hash || !hash.includes('access_token=')) return;

  let targetPath = pathname;
  if (hash.includes('type=recovery') && !pathname.includes('restablecer-contrasena')) {
    targetPath = '/restablecer-contrasena';
  } else if (
    (hash.includes('type=signup') || hash.includes('type=email')) &&
    !pathname.includes('confirmar-correo')
  ) {
    targetPath = '/confirmar-correo';
  }

  const dest = `${PRODUCTION_APP_URL}${targetPath}${search || ''}${hash}`;
  window.location.replace(dest);
}
