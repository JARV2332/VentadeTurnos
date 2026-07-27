export const ESTADOS_CORREO = {
  enviado: { label: 'Enviado', clase: 'correo-estado--ok' },
  error: { label: 'Error al enviar', clase: 'correo-estado--error' },
  rebotado: { label: 'Rebotado', clase: 'correo-estado--rebotado' },
  encolado: { label: 'Pendiente (cola)', clase: 'correo-estado--pendiente' },
  procesando: { label: 'Enviando…', clase: 'correo-estado--pendiente' },
};

export const ESTADOS_PENDIENTES_REENVIO = ['error', 'encolado', 'procesando'];

export function etiquetaEstadoCorreo(estado) {
  return ESTADOS_CORREO[estado]?.label || estado || '—';
}

export function filtrarHistorialCorreos(historial, filtro) {
  const lista = historial || [];
  if (!filtro || filtro === 'todos') return lista;
  if (filtro === 'problemas') {
    return lista.filter((r) => r.estado === 'error' || r.estado === 'rebotado');
  }
  if (filtro === 'pendientes') {
    return lista.filter((r) => ESTADOS_PENDIENTES_REENVIO.includes(r.estado));
  }
  return lista.filter((r) => r.estado === filtro);
}

/** Combina fecha (YYYY-MM-DD) y hora (HH:MM) local → ISO. */
export function construirDesdeLocal(fechaYYYYMMDD, horaHHMM) {
  const fecha = String(fechaYYYYMMDD || '').trim();
  const hora = String(horaHHMM || '00:00').trim() || '00:00';
  if (!fecha) return null;
  const d = new Date(`${fecha}T${hora}:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Correos no enviados desde una fecha-hora (error / encolado / procesando). */
export function filtrarPendientesDesde(historial, desdeIso) {
  const lista = historial || [];
  const desdeMs = desdeIso ? new Date(desdeIso).getTime() : NaN;
  return lista.filter((r) => {
    if (!ESTADOS_PENDIENTES_REENVIO.includes(r.estado)) return false;
    if (Number.isNaN(desdeMs)) return true;
    return new Date(r.created_at).getTime() >= desdeMs;
  });
}

export function exportarErroresCsv(errores) {
  const filas = [
    ['Nombre', 'Correo', 'Codigo boleta', 'Error'],
    ...(errores || []).map((e) => [
      e.nombre || '',
      e.destinatario || '',
      e.codigo || '',
      e.error || '',
    ]),
  ];
  const csv = filas
    .map((cols) =>
      cols
        .map((c) => `"${String(c || '').replace(/"/g, '""')}"`)
        .join(',')
    )
    .join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `correos-con-error-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
