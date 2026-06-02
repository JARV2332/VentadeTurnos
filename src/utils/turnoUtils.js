/**
 * Utilidades para estructura real de turnos:
 * N brazos totales = N/2 Izquierda + N/2 Derecha (mismo número de brazo en cada lado).
 */

export const TIPOS_TURNO = ['Entrada', 'Ordinario', 'Extraordinario', 'Salida'];

export function validarBrazosPares(total) {
  return total > 0 && total % 2 === 0;
}

export function brazosPorLado(totalBrazos) {
  return totalBrazos / 2;
}

/** Genera registros de brazos: mitad izquierda + mitad derecha */
export function crearBrazosParaTurno({
  turnoId,
  numeroTurno,
  totalBrazos,
  organizacionId,
  idPrefix = 'brazo',
  overrides = {},
}) {
  if (!validarBrazosPares(totalBrazos)) {
    throw new Error('El total de brazos debe ser par (ej: 20 = 10 izquierda + 10 derecha)');
  }

  const cantidadLado = brazosPorLado(totalBrazos);
  const brazos = [];

  for (let n = 1; n <= cantidadLado; n += 1) {
    ['Izquierda', 'Derecha'].forEach((lado) => {
      brazos.push({
        id: `${idPrefix}-${turnoId}-${lado[0]}-${n}`,
        organizacion_id: organizacionId,
        turno_id: turnoId,
        numero_turno: numeroTurno,
        numero_brazo: n,
        lado,
        estado: 'disponible',
        bloqueado_hasta: null,
        vendedor_id: null,
        mesa_id: null,
        cargador_id: null,
        codigo_boleta_qr: null,
        precio_pagado: null,
        ...overrides,
      });
    });
  }

  return brazos;
}

/** Agrupa brazos por turno con columnas izquierda/derecha ordenadas */
export function agruparTurnosConBrazos(turnos, brazos) {
  return turnos
    .slice()
    .sort((a, b) => a.numero_turno - b.numero_turno)
    .map((turno) => {
      const delTurno = brazos.filter((b) => b.turno_id === turno.id);
      return {
        ...turno,
        izquierda: delTurno
          .filter((b) => b.lado === 'Izquierda')
          .sort((a, b) => a.numero_brazo - b.numero_brazo),
        derecha: delTurno
          .filter((b) => b.lado === 'Derecha')
          .sort((a, b) => a.numero_brazo - b.numero_brazo),
      };
    });
}

/** Turnos intermedios donde puede ir un extraordinario (ni 1 ni el último) */
export function turnosElegiblesExtraordinarios(totalTurnos) {
  const total = Math.max(2, Number(totalTurnos) || 2);
  const elegibles = [];
  for (let n = 2; n < total; n += 1) elegibles.push(n);
  return elegibles;
}

/**
 * Construye turnos: #1 = Salida, #N = Entrada, intermedios ordinarios salvo
 * los números listados en turnosExtraordinarios (ej. [7, 14, 16] de 20).
 */
export function construirTurnosConfig({
  totalTurnos = 2,
  brazosDefault = 20,
  brazosExtraordinario,
  precioSalida = 0,
  precioEntrada = 0,
  precioOrdinario = 0,
  precioExtraordinario = 0,
  turnosExtraordinarios = [],
}) {
  const total = Math.max(2, Number(totalTurnos) || 2);
  const elegibles = new Set(turnosElegiblesExtraordinarios(total));
  const extras = new Set(
    (turnosExtraordinarios || [])
      .map(Number)
      .filter((n) => elegibles.has(n))
  );
  const brazosOrd = Number(brazosDefault) || 20;
  const brazosExtra = Number(brazosExtraordinario ?? brazosDefault) || brazosOrd;

  const turnos = [];
  let ordCount = 0;

  for (let n = 1; n <= total; n += 1) {
    if (n === 1) {
      turnos.push({
        numero_turno: n,
        tipo_turno: 'Salida',
        precio: precioSalida,
        total_brazos: brazosOrd,
        etiqueta: 'Salida',
      });
    } else if (n === total) {
      turnos.push({
        numero_turno: n,
        tipo_turno: 'Entrada',
        precio: precioEntrada,
        total_brazos: brazosOrd,
        etiqueta: 'Entrada',
      });
    } else if (extras.has(n)) {
      turnos.push({
        numero_turno: n,
        tipo_turno: 'Extraordinario',
        precio: precioExtraordinario,
        total_brazos: brazosExtra,
        etiqueta: `Extraordinario · turno ${n}`,
      });
    } else {
      ordCount += 1;
      turnos.push({
        numero_turno: n,
        tipo_turno: 'Ordinario',
        precio: precioOrdinario,
        total_brazos: brazosOrd,
        etiqueta: `Ordinario ${ordCount}`,
      });
    }
  }

  return turnos;
}

export function etiquetaTurno(turno) {
  if (turno.etiqueta) return turno.etiqueta;
  return turno.tipo_turno;
}
