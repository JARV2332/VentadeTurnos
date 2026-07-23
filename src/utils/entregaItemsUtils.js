/** Items { brazo, turno } a partir del resultado de buscarBoletaPorCodigo. */
export function itemsDesdeResultado(resultado) {
  if (resultado?.items?.length) return resultado.items;
  if (resultado?.brazos?.length) {
    const turnoDefault = resultado.turno;
    return resultado.brazos.map((b) => ({
      brazo: b,
      turno: turnoDefault,
    }));
  }
  if (resultado?.brazo) {
    return [{ brazo: resultado.brazo, turno: resultado.turno }];
  }
  return [];
}

/** Brazos vendidos aún pendientes de entrega física. */
export function brazosPendientesEntrega(items) {
  return (items || []).filter(
    (i) => i.brazo?.estado === 'vendido' && i.brazo?.estado_entrega !== 'entregado'
  );
}

export function resumenEntregaItems(items) {
  const lista = items || [];
  const pendientes = brazosPendientesEntrega(lista);
  const entregados = lista.filter((i) => i.brazo?.estado_entrega === 'entregado');
  return {
    total: lista.length,
    pendientes: pendientes.length,
    entregados: entregados.length,
    todosEntregados: lista.length > 0 && pendientes.length === 0,
    hayPendientes: pendientes.length > 0,
  };
}
