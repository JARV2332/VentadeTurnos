import * as XLSX from 'xlsx';
import { labelTipoTurno, formatFechaReporte, formatQ } from './cajaReportUtils';
import { nombreAsignado } from './listadoTurnosUtils';

export function esApartadoPendienteCobro(brazo) {
  return brazo?.estado === 'reservado' && Boolean(brazo?.reserva_apartado);
}

function timestampApartado(brazo) {
  const raw = brazo?.updated_at || brazo?.created_at;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? null : t;
}

function formatFechaHoraApartado(brazo) {
  const raw = brazo?.updated_at || brazo?.created_at;
  if (!raw) return '—';
  return new Intl.DateTimeFormat('es-GT', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(raw));
}

function diasHastaEvento(fechaEvento) {
  if (!fechaEvento) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const ev = new Date(`${fechaEvento}T12:00:00`);
  if (Number.isNaN(ev.getTime())) return null;
  return Math.round((ev - hoy) / (24 * 60 * 60 * 1000));
}

export function construirReporteApartadosPendientes({
  brazos = [],
  turnosPorId = {},
  cortejosPorId = {},
  cargadoresPorId = {},
  filtros = {},
}) {
  let lista = (brazos || []).filter(esApartadoPendienteCobro);

  if (filtros.cortejoId) {
    lista = lista.filter((b) => turnosPorId[b.turno_id]?.cortejo_id === filtros.cortejoId);
  }

  const filas = lista.map((brazo) => {
    const turno = turnosPorId[brazo.turno_id] || null;
    const cortejo = turno?.cortejo_id ? cortejosPorId[turno.cortejo_id] : null;
    const cargador = brazo.cargador_id ? cargadoresPorId[brazo.cargador_id] : null;
    const fechaEvento = cortejo?.fecha || null;

    return {
      id: brazo.id,
      brazo,
      turno,
      cortejo,
      cargador,
      procesion: cortejo?.nombre_evento || '—',
      fechaEvento,
      fechaEventoFmt: fechaEvento
        ? new Date(`${fechaEvento}T12:00:00`).toLocaleDateString('es-GT')
        : '—',
      diasParaEvento: diasHastaEvento(fechaEvento),
      numeroTurno: turno?.numero_turno ?? brazo.numero_turno ?? '—',
      honor: turno?.etiqueta || labelTipoTurno(turno?.tipo_turno),
      brazoLabel: `${brazo.numero_brazo} ${brazo.lado?.[0] || ''}`.trim(),
      nombre: nombreAsignado(brazo, cargador),
      dpi: cargador?.cui_o_identificacion || '—',
      whatsapp: cargador?.whatsapp || '—',
      apartadoDesde: formatFechaHoraApartado(brazo),
      apartadoTs: timestampApartado(brazo),
      precio: turno?.precio != null ? formatQ(turno.precio) : '—',
      notas: brazo.apartado_notas || '—',
    };
  });

  return filas.sort((a, b) => {
    const da = a.diasParaEvento ?? 99999;
    const db = b.diasParaEvento ?? 99999;
    if (da !== db) return da - db;
    const fa = a.fechaEvento || '9999';
    const fb = b.fechaEvento || '9999';
    if (fa !== fb) return fa.localeCompare(fb);
    const pa = a.procesion.localeCompare(b.procesion, 'es');
    if (pa !== 0) return pa;
    const na = Number(a.numeroTurno) || 0;
    const nb = Number(b.numeroTurno) || 0;
    if (na !== nb) return na - nb;
    return (a.apartadoTs || 0) - (b.apartadoTs || 0);
  });
}

export function exportApartadosPendientesExcel({ filas, orgNombre = '' }) {
  const wb = XLSX.utils.book_new();
  const generado = new Intl.DateTimeFormat('es-GT', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date());

  const datos = (filas || []).map((f) => ({
    Procesión: f.procesion,
    'Fecha evento': f.fechaEventoFmt,
    'Días al evento': f.diasParaEvento ?? '—',
    Turno: f.numeroTurno,
    Honor: f.honor,
    Brazo: f.brazoLabel,
    Persona: f.nombre,
    DPI: f.dpi,
    WhatsApp: f.whatsapp,
    'Apartado desde': f.apartadoDesde,
    Ofrenda: f.precio,
    Notas: f.notas,
  }));

  const meta = [
    ['Apartados pendientes de cobro'],
    [orgNombre || 'Organización'],
    [`Generado: ${generado}`],
    [`${filas?.length || 0} registro(s)`],
    [],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(meta), 'Info');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(datos), 'Apartados');
  XLSX.writeFile(wb, `apartados-pendientes-${Date.now()}.xlsx`);
}
