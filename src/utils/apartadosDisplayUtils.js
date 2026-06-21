import { etiquetaAsignado } from './importReservasUtils';
import { TIPOS_TURNO } from './turnoUtils';
import { labelTipoTurno } from './cajaReportUtils';

function dpiDesdeApartado(brazo, cargador) {
  const cui = cargador?.cui_o_identificacion?.trim();
  if (cui) return cui;
  const m = String(brazo?.apartado_notas || '').match(/DPI\s*(\d{13})/);
  return m?.[1] || '';
}

/** Agrupa apartados de un turno por nombre (para cartulina Taquilla). */
export function resumenApartadosTurno(turno) {
  const todos = [
    ...(Array.isArray(turno?.izquierda) ? turno.izquierda : []),
    ...(Array.isArray(turno?.derecha) ? turno.derecha : []),
  ];
  const grupos = new Map();

  todos
    .filter((b) => b.reserva_apartado && b.estado === 'reservado')
    .forEach((b) => {
      const nombre = etiquetaAsignado(b, b.cargador) || 'Apartado';
      const prev = grupos.get(nombre) || { nombre, cantidad: 0 };
      prev.cantidad += 1;
      grupos.set(nombre, prev);
    });

  return [...grupos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/** Tabla general estilo Excel: turno + devoto + cantidad. */
export function filasGeneralesApartados(resumen) {
  const filas = [];

  (resumen || []).forEach((item) => {
    const grupos = new Map();

    (item.detalle || []).forEach((d) => {
      const nombre = d.etiqueta || 'Apartado';
      const dpi = dpiDesdeApartado(d.brazo, d.cargador);
      const key = `${nombre}|${dpi}`;
      if (!grupos.has(key)) {
        grupos.set(key, {
          nombre,
          dpi,
          cantidad: 0,
          brazos: [],
        });
      }
      const g = grupos.get(key);
      g.cantidad += 1;
      g.brazos.push({
        id: d.brazo.id,
        numero: d.brazo.numero_brazo,
        lado: d.brazo.lado,
      });
    });

    grupos.forEach((g) => {
      filas.push({
        turnoId: item.turno.id,
        turnoNum: item.turno.numero_turno,
        turnoEtiqueta: item.turno.etiqueta || item.turno.tipo_turno,
        ...g,
      });
    });
  });

  return filas.sort(
    (a, b) =>
      a.turnoNum - b.turnoNum ||
      a.nombre.localeCompare(b.nombre, 'es')
  );
}

/** Agrupa apartados por tipo/honor de turno (Salida, Ordinario, Extraordinario, Entrada). */
export function resumenApartadosPorTipo(resumen) {
  const map = new Map();

  (resumen || []).forEach((item) => {
    const tipo = item.turno?.tipo_turno || 'Otro';
    if (!map.has(tipo)) {
      map.set(tipo, {
        tipo,
        label: labelTipoTurno(tipo),
        turnosConApartados: 0,
        apartados: 0,
        brazoIds: [],
      });
    }
    const g = map.get(tipo);
    if (item.apartados > 0) g.turnosConApartados += 1;
    g.apartados += item.apartados || 0;
    (item.detalle || []).forEach((d) => {
      if (d.brazo?.id) g.brazoIds.push(d.brazo.id);
    });
  });

  const orden = [...TIPOS_TURNO, 'Otro'];
  return [...map.values()]
    .filter((g) => g.apartados > 0)
    .sort((a, b) => {
      const ia = orden.indexOf(a.tipo);
      const ib = orden.indexOf(b.tipo);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
}

/** Todos los brazo IDs apartados de la procesión. */
export function todosBrazoIdsApartados(resumen) {
  return (resumen || []).flatMap((item) =>
    (item.detalle || []).map((d) => d.brazo?.id).filter(Boolean)
  );
}
