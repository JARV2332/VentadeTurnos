/**
 * Catálogo de pantallas / permisos del sistema.
 * Cada rol guarda un array de ids (ej. ['taquilla', 'entrega', 'impresion']).
 */

export const PANTALLAS = [
  { id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: '◫', grupo: 'Operación' },
  { id: 'taquilla', label: 'Taquilla', path: '/taquilla', icon: '▦', grupo: 'Operación' },
  { id: 'entrega', label: 'Entrega turnos', path: '/entrega', icon: '⎔', grupo: 'Operación' },
  { id: 'caja', label: 'Caja', path: '/caja', icon: '◈', grupo: 'Operación' },
  { id: 'impresion', label: 'Impresión', path: '/impresion', icon: '▣', grupo: 'Operación' },
  { id: 'config', label: 'Procesiones', path: '/config', icon: '⚙', grupo: 'Administración' },
  { id: 'config_correo', label: 'Correo y boletas', path: '/config/correo', icon: '✉', grupo: 'Administración' },
  {
    id: 'usuarios',
    label: 'Usuarios y roles',
    path: '/config/usuarios',
    icon: '◎',
    grupo: 'Administración',
  },
  {
    id: 'import_reservas',
    label: 'Apartados / Excel',
    path: '/config/reservas',
    icon: '▤',
    grupo: 'Administración',
  },
];

/** Permiso para gestionar roles y usuarios (solo administrador) */
export const PERMISO_GESTION_USUARIOS = 'usuarios';

export const PERMISOS_ADMIN_COMPLETO = PANTALLAS.map((p) => p.id);

export function tienePermiso(permisos, permisoId) {
  return Array.isArray(permisos) && permisos.includes(permisoId);
}

export function rutaInicioPorPermisos(permisos) {
  const pantalla = PANTALLAS.find((p) => tienePermiso(permisos, p.id));
  return pantalla?.path || '/';
}

export function pantallasPorGrupo() {
  const grupos = {};
  PANTALLAS.forEach((p) => {
    if (!grupos[p.grupo]) grupos[p.grupo] = [];
    grupos[p.grupo].push(p);
  });
  return grupos;
}

export function labelPermiso(permisoId) {
  return PANTALLAS.find((p) => p.id === permisoId)?.label || permisoId;
}
