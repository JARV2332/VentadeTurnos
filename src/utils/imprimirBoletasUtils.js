/** Carga boletas únicas por código QR / recibo (deduplica compras multi-turno). */
export async function cargarBoletasPorCodigos(organizacionId, codigos, buscarBoletaPorCodigo) {
  const unicos = [...new Set((codigos || []).filter(Boolean))];
  const boletas = [];
  const comprasVistas = new Set();

  for (const codigo of unicos) {
    const res = await buscarBoletaPorCodigo(organizacionId, codigo);
    if (res?.error) continue;
    const key = res.compra?.id || res.brazo?.id || codigo;
    if (comprasVistas.has(key)) continue;
    comprasVistas.add(key);
    boletas.push(res);
  }

  return boletas;
}

export function codigosBoletaDesdeFilas(filas) {
  return (filas || [])
    .filter((f) => f.puedeVerBoleta && f.codigoBusqueda)
    .map((f) => f.codigoBusqueda);
}
