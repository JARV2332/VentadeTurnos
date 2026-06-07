/** Resuelve el nombre del operador/vendedor para boleta y caja. */
export function construirMapaUsuariosAuth(usuarios = []) {
  const map = {};
  for (const u of usuarios) {
    const nombre = u.nombre?.trim() || u.email?.trim() || '';
    if (!nombre) continue;
    if (u.auth_user_id) map[u.auth_user_id] = nombre;
    if (u.id) map[u.id] = nombre;
  }
  return map;
}

export function resolverOperadorNombre({
  compra,
  brazo,
  operadorNombreProp,
  mapaUsuarios = {},
} = {}) {
  const directo =
    operadorNombreProp?.trim() ||
    compra?.operador_nombre?.trim() ||
    brazo?.operador_nombre?.trim();
  if (directo) return directo;

  const vid = compra?.vendedor_id || brazo?.vendedor_id;
  if (vid && mapaUsuarios[vid]) return mapaUsuarios[vid];
  return '';
}

export function nombreVendedorCuadre(vendedorId, operadorNombre, mapaUsuarios = {}) {
  const nombreDirecto = operadorNombre?.trim();
  if (nombreDirecto) return nombreDirecto;
  if (vendedorId && vendedorId !== 'sin-asignar' && mapaUsuarios[vendedorId]) {
    return mapaUsuarios[vendedorId];
  }
  if (vendedorId && vendedorId !== 'sin-asignar') return vendedorId;
  return 'Sin asignar';
}
