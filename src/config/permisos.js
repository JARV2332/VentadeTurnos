/**
 * Catálogo de pantallas / permisos del sistema.
 * Cada rol guarda un array de ids (ej. ['taquilla', 'entrega', 'impresion']).
 */

export const PANTALLAS = [
  {
    id: 'plataforma',
    label: 'Asociaciones',
    path: '/plataforma',
    icon: '◇',
    grupo: 'Plataforma',
  },
  { id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: '◫', grupo: 'Operación' },
  { id: 'taquilla', label: 'Taquilla', path: '/taquilla', icon: '▦', grupo: 'Operación' },
  { id: 'entrega', label: 'Entrega turnos', path: '/entrega', icon: '⎔', grupo: 'Operación' },
  { id: 'caja', label: 'Caja', path: '/caja', icon: '◈', grupo: 'Reportes' },
  { id: 'impresion', label: 'Impresión', path: '/impresion', icon: '▣', grupo: 'Reportes' },
  { id: 'devotos', label: 'Devotos', path: '/devotos', icon: '👤', grupo: 'Operación' },
  {
    id: 'consulta_turnos',
    label: 'Consulta turnos',
    path: '/consulta-turnos',
    icon: '⌕',
    grupo: 'Reportes',
    visibleConPermisos: ['devotos', 'taquilla', 'entrega', 'impresion', 'caja', 'dashboard'],
  },
  {
    id: 'listado_turnos',
    label: 'Listado turnos',
    path: '/listado-turnos',
    icon: '☰',
    grupo: 'Reportes',
    visibleConPermisos: ['devotos', 'taquilla', 'entrega', 'impresion', 'caja', 'dashboard', 'consulta_turnos'],
  },
  {
    id: 'disponibilidad_turnos',
    label: 'Disponibilidad',
    path: '/disponibilidad-turnos',
    icon: '▢',
    grupo: 'Reportes',
    visibleConPermisos: ['devotos', 'taquilla', 'entrega', 'impresion', 'caja', 'dashboard', 'listado_turnos', 'consulta_turnos'],
  },
  { id: 'config', label: 'Procesiones', path: '/config', icon: '⚙', grupo: 'Administración' },
  { id: 'config_correo', label: 'Correo y boletas', path: '/config/correo', icon: '✉', grupo: 'Administración' },
  {
    id: 'config_recibo',
    label: 'Diseño de recibos',
    path: '/config/recibo',
    icon: '🧾',
    grupo: 'Administración',
  },
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
  {
    id: 'apartados_pendientes',
    label: 'Apartados por cobrar',
    path: '/apartados-pendientes',
    icon: '◫',
    grupo: 'Reportes',
    visibleConPermisos: ['import_reservas', 'taquilla', 'caja', 'dashboard', 'listado_turnos'],
  },
];

/** Plantillas rápidas al crear roles (incluyen pantallas de reportes nuevas). */
export const PLANTILLAS_ROL = {
  taquilla: {
    nombre: 'Operador de taquilla',
    descripcion: 'Venta, consulta de devotos y disponibilidad de turnos.',
    permisos: [
      'taquilla',
      'devotos',
      'consulta_turnos',
      'listado_turnos',
      'disponibilidad_turnos',
    ],
  },
  caja: {
    nombre: 'Operador de caja',
    descripcion: 'Cierre diario, impresión y reportes de ventas.',
    permisos: ['caja', 'impresion', 'consulta_turnos', 'listado_turnos', 'apartados_pendientes'],
  },
  entrega: {
    nombre: 'Operador de entrega',
    descripcion: 'Escaneo QR, entrega física e impresión de boletas.',
    permisos: ['entrega', 'consulta_turnos', 'listado_turnos', 'impresion'],
  },
  coordinacion: {
    nombre: 'Coordinación',
    descripcion: 'Dashboard, reportes, apartados y consultas operativas.',
    permisos: [
      'dashboard',
      'consulta_turnos',
      'listado_turnos',
      'disponibilidad_turnos',
      'apartados_pendientes',
      'caja',
      'impresion',
      'devotos',
    ],
  },
};

/** Permiso para gestionar roles y usuarios (solo administrador) */
export const PERMISO_GESTION_USUARIOS = 'usuarios';

/** Permisos al crear una org nueva (devotos se asigna explícitamente al rol). */
export const PERMISOS_ADMIN_COMPLETO = PANTALLAS.filter(
  (p) => p.id !== 'devotos'
).map((p) => p.id);

export function tienePermiso(permisos, permisoId) {
  return Array.isArray(permisos) && permisos.includes(permisoId);
}

export function puedeVerPantalla(hasPermisoFn, pantalla) {
  if (hasPermisoFn(pantalla.id)) return true;
  return (pantalla.visibleConPermisos || []).some((id) => hasPermisoFn(id));
}

export function rutaInicioPorPermisos(permisos, esSuperAdmin = false) {
  if (esSuperAdmin && tienePermiso(permisos, 'plataforma') && !tienePermiso(permisos, 'dashboard')) {
    return '/plataforma';
  }
  const pantalla = PANTALLAS.find((p) => tienePermiso(permisos, p.id) && p.id !== 'plataforma');
  if (pantalla) return pantalla.path;
  if (tienePermiso(permisos, 'plataforma')) return '/plataforma';
  return '/';
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
