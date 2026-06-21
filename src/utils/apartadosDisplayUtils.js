import { etiquetaAsignado } from './importReservasUtils';
import { etiquetaHonorTurno } from './turnoUtils';
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

function turnoApartadoItem(item) {
  const turno = item.turno || {};
  const honor = turno.etiqueta?.trim() || etiquetaHonorTurno(turno);
  const nombres = [...new Set((item.detalle || []).map((d) => d.etiqueta).filter(Boolean))];
  const formales = item.apartados_formales || 0;
  const taquilla = item.reservas_taquilla || 0;
  let reservadosLabel = `${item.apartados || 0} reservado(s)`;
  if (formales && taquilla) {
    reservadosLabel = `${item.apartados} reservado(s) (${formales} apartado(s), ${taquilla} taquilla)`;
  } else if (taquilla && !formales) {
    reservadosLabel = `${taquilla} reserva(s) taquilla`;
  } else if (formales) {
    reservadosLabel = `${formales} apartado(s)`;
  }
  return {
    turnoId: turno.id,
    numero: turno.numero_turno,
    tipo: turno.tipo_turno || 'Otro',
    tipoLabel: labelTipoTurno(turno.tipo_turno),
    honor,
    apartados: item.apartados || 0,
    reservadosLabel,
    brazoIds: (item.detalle || []).map((d) => d.brazo?.id).filter(Boolean),
    nombresPreview:
      nombres.length <= 3
        ? nombres.join(', ')
        : `${nombres.slice(0, 2).join(', ')} (+${nombres.length - 2})`,
    resumenItem: item,
  };
}

/** Lista de turnos con apartados (para select de liberación). */
export function listaTurnosConApartados(resumen) {
  return (resumen || [])
    .filter((item) => item.apartados > 0)
    .map(turnoApartadoItem)
    .sort((a, b) => a.numero - b.numero);
}

/** Todos los brazo IDs apartados de la procesión. */
export function todosBrazoIdsApartados(resumen) {
  return (resumen || []).flatMap((item) =>
    (item.detalle || []).map((d) => d.brazo?.id).filter(Boolean)
  );
}
