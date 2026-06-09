export const ESTADOS_CORREO = {
  enviado: { label: 'Enviado', clase: 'correo-estado--ok' },
  error: { label: 'Error al enviar', clase: 'correo-estado--error' },
  rebotado: { label: 'Rebotado', clase: 'correo-estado--rebotado' },
};

export function etiquetaEstadoCorreo(estado) {
  return ESTADOS_CORREO[estado]?.label || estado || '—';
}

export function filtrarHistorialCorreos(historial, filtro) {
  const lista = historial || [];
  if (!filtro || filtro === 'todos') return lista;
  if (filtro === 'problemas') {
    return lista.filter((r) => r.estado === 'error' || r.estado === 'rebotado');
  }
  return lista.filter((r) => r.estado === filtro);
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
