import { etiquetaAsignado } from './importReservasUtils';
import { TIPOS_TURNO, etiquetaHonorTurno } from './turnoUtils';
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

function turnoApartadoItem(item) {
  const turno = item.turno || {};
  const honor = turno.etiqueta?.trim() || etiquetaHonorTurno(turno);
  const nombres = [...new Set((item.detalle || []).map((d) => d.etiqueta).filter(Boolean))];
  return {
    turnoId: turno.id,
    numero: turno.numero_turno,
    tipo: turno.tipo_turno || 'Otro',
    tipoLabel: labelTipoTurno(turno.tipo_turno),
    honor,
    apartados: item.apartados || 0,
    brazoIds: (item.detalle || []).map((d) => d.brazo?.id).filter(Boolean),
    nombresPreview:
      nombres.length <= 3
        ? nombres.join(', ')
        : `${nombres.slice(0, 2).join(', ')} (+${nombres.length - 2})`,
    resumenItem: item,
  };
}

/**
 * Liberación masiva: agrupado por tipo con cada turno (#, honor, devotos).
 */
export function resumenApartadosMasivo(resumen) {
  const turnosConApartados = (resumen || [])
    .filter((item) => item.apartados > 0)
    .map(turnoApartadoItem)
    .sort((a, b) => a.numero - b.numero);

  const porTipo = new Map();
  turnosConApartados.forEach((t) => {
    if (!porTipo.has(t.tipo)) {
      porTipo.set(t.tipo, {
        tipo: t.tipo,
        label: t.tipoLabel,
        turnos: [],
        apartados: 0,
        brazoIds: [],
      });
    }
    const g = porTipo.get(t.tipo);
    g.turnos.push(t);
    g.apartados += t.apartados;
    g.brazoIds.push(...t.brazoIds);
  });

  const orden = [...TIPOS_TURNO, 'Otro'];
  const gruposTipo = [...porTipo.values()].sort((a, b) => {
    const ia = orden.indexOf(a.tipo);
    const ib = orden.indexOf(b.tipo);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  return { turnosConApartados, gruposTipo };
}

/** Filtra grupos masivos por número de turno, honor, tipo o nombre de devoto. */
export function filtrarApartadosMasivo(gruposTipo, busqueda) {
  const q = String(busqueda || '').trim().toLowerCase();
  if (!q) return gruposTipo;

  const qDigits = q.replace(/\D/g, '');

  return gruposTipo
    .map((grupo) => ({
      ...grupo,
      turnos: grupo.turnos.filter((t) => {
        const honor = (t.honor || '').toLowerCase();
        const tipo = (t.tipoLabel || '').toLowerCase();
        const nombres = (t.nombresPreview || '').toLowerCase();
        const numStr = String(t.numero);
        return (
          honor.includes(q) ||
          tipo.includes(q) ||
          nombres.includes(q) ||
          numStr.includes(q) ||
          (qDigits.length > 0 && numStr.includes(qDigits))
        );
      }),
    }))
    .filter((g) => g.turnos.length > 0);
}
