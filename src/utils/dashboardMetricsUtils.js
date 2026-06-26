export function fechaHoyKey(fecha = new Date()) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fechaVentaKeyLocal(venta) {
  const raw = venta?.pago_confirmado_en || venta?.updated_at || venta?.created_at;
  if (!raw) return null;
  return fechaHoyKey(new Date(raw));
}

export function enriquecerDashboardMetrics({
  fin = {},
  brazos = [],
  cortejos = [],
  turnos = [],
}) {
  const turnosPorId = Object.fromEntries((turnos || []).map((t) => [t.id, t]));
  const totalBrazos = (brazos || []).length;
  const vendidos =
    fin.brazosVendidos ??
    fin.vendidos ??
    (brazos || []).filter((b) => b.estado === 'vendido').length;
  const disponibles = (brazos || []).filter((b) => b.estado === 'disponible').length;
  const reservados = (brazos || []).filter((b) => b.estado === 'reservado').length;
  const pendientesEntrega = (brazos || []).filter(
    (b) => b.estado === 'vendido' && b.estado_entrega !== 'entregado'
  ).length;
  const apartadosSinPagar = (brazos || []).filter(
    (b) => b.estado === 'reservado' && b.reserva_apartado
  ).length;

  const hoyKey = fechaHoyKey();
  const ventasHoyList = (fin.ventas || []).filter((v) => fechaVentaKeyLocal(v) === hoyKey);
  const ventasHoy = ventasHoyList.length;
  const montoHoy = ventasHoyList.reduce((s, v) => s + Number(v.precio_pagado || 0), 0);

  const cortejosActivos = (cortejos || []).filter((c) => c.estado === 'activa');
  const porProcesion = cortejosActivos.map((cortejo) => {
    const brazosProc = (brazos || []).filter(
      (b) => turnosPorId[b.turno_id]?.cortejo_id === cortejo.id
    );
    const vendidosProc = brazosProc.filter((b) => b.estado === 'vendido');
    const total = brazosProc.length;
    const recaudadoProc = vendidosProc.reduce((s, b) => s + Number(b.precio_pagado || 0), 0);
    return {
      id: cortejo.id,
      nombre: cortejo.nombre_evento,
      totalBrazos: total,
      vendidos: vendidosProc.length,
      disponibles: brazosProc.filter((b) => b.estado === 'disponible').length,
      reservados: brazosProc.filter((b) => b.estado === 'reservado').length,
      apartados: brazosProc.filter((b) => b.estado === 'reservado' && b.reserva_apartado).length,
      pendientesEntrega: vendidosProc.filter((b) => b.estado_entrega !== 'entregado').length,
      recaudado: recaudadoProc,
      ocupacion: total ? Math.round((vendidosProc.length / total) * 100) : 0,
    };
  });

  return {
    ...fin,
    vendidos,
    totalBrazos,
    disponibles,
    reservados,
    cortejosActivos: cortejosActivos.length,
    ocupacion: totalBrazos ? Math.round((vendidos / totalBrazos) * 100) : 0,
    ventasHoy,
    montoHoy,
    pendientesEntrega,
    apartadosSinPagar,
    porProcesion,
  };
}
