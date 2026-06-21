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
  const listaTurnos = Array.isArray(turnos) ? turnos : [];
  const listaBrazos = Array.isArray(brazos) ? brazos : [];
  return listaTurnos
    .slice()
    .sort((a, b) => a.numero_turno - b.numero_turno)
    .map((turno) => {
      const delTurno = listaBrazos.filter((b) => b.turno_id === turno.id);
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
function repertorioDeTurno(repertorioPorTurno, numero) {
  const raw = repertorioPorTurno?.[numero] || repertorioPorTurno?.[String(numero)] || {};
  const son = (raw.son || '').trim() || null;
  const alabado = (raw.alabado || '').trim() || null;
  return { son, alabado };
}

/** Todas las melodías del turno (Excel multi-fila, son + alabado persistidos). */
export function melodiasDeTurno(turno) {
  if (turno?.melodias?.length) {
    return turno.melodias.map((m) => String(m).trim()).filter(Boolean);
  }
  const lista = [];
  if (turno?.son?.trim()) lista.push(turno.son.trim());
  if (turno?.alabado?.trim()) {
    turno.alabado
      .split(/\s·\s|\n| \/ /)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((m) => lista.push(m));
  }
  return lista;
}

/** Lista { tipo, texto } para mostrar en UI — una entrada por melodía. */
export function repertorioTurnoLista(turno) {
  const melodias = melodiasDeTurno(turno);
  if (melodias.length === 0) return [];
  if (melodias.length === 1) {
    return [{ tipo: 'Melodía', texto: melodias[0] }];
  }
  return melodias.map((texto, i) => ({
    tipo: `Melodía ${i + 1}`,
    texto,
  }));
}

export function tieneRepertorio(turno) {
  return repertorioTurnoLista(turno).length > 0;
}

export function construirTurnosConfig({
  totalTurnos = 2,
  brazosDefault = 20,
  brazosExtraordinario,
  precioSalida = 0,
  precioEntrada = 0,
  precioOrdinario = 0,
  precioExtraordinario = 0,
  turnosExtraordinarios = [],
  repertorioPorTurno = {},
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
    const { son, alabado } = repertorioDeTurno(repertorioPorTurno, n);
    const baseRep = { son, alabado };

    if (n === 1) {
      turnos.push({
        numero_turno: n,
        tipo_turno: 'Salida',
        precio: precioSalida,
        total_brazos: brazosOrd,
        etiqueta: 'Salida',
        ...baseRep,
      });
    } else if (n === total) {
      turnos.push({
        numero_turno: n,
        tipo_turno: 'Entrada',
        precio: precioEntrada,
        total_brazos: brazosOrd,
        etiqueta: 'Entrada',
        ...baseRep,
      });
    } else if (extras.has(n)) {
      turnos.push({
        numero_turno: n,
        tipo_turno: 'Extraordinario',
        precio: precioExtraordinario,
        total_brazos: brazosExtra,
        etiqueta: `Extraordinario · turno ${n}`,
        ...baseRep,
      });
    } else {
      ordCount += 1;
      turnos.push({
        numero_turno: n,
        tipo_turno: 'Ordinario',
        precio: precioOrdinario,
        total_brazos: brazosOrd,
        etiqueta: `Ordinario ${ordCount}`,
        ...baseRep,
      });
    }
  }

  return turnos;
}

export function etiquetaTurno(turno) {
  if (turno.etiqueta) return turno.etiqueta;
  return turno.tipo_turno;
}

/** Etiqueta de honor/tipo para boleta y carrito (usa etiqueta completa del turno si existe). */
export function etiquetaHonorTurno(turno) {
  const etiqueta = turno?.etiqueta?.trim();
  if (etiqueta) return etiqueta;

  const tipo = turno?.tipo_turno || '';
  if (tipo === 'Salida') return 'Honor Salida';
  if (tipo === 'Entrada') return 'Honor Entrada';
  if (tipo === 'Extraordinario') return 'Extraordinario';
  if (tipo === 'Ordinario') return 'Ordinario';
  return tipo || 'Turno';
}

/** Son y alabado unidos para la boleta impresa */
export function textoMelodiaTurno(turno) {
  const melodias = melodiasDeTurno(turno);
  return melodias.join(' / ');
}

/** Números de turno libres entre 1 y el máximo existente (huecos). */
export function huecosNumerosTurno(turnos, hasta = null) {
  const lista = Array.isArray(turnos) ? turnos : [];
  const existentes = new Set(lista.map((t) => t.numero_turno));
  const max = hasta ?? Math.max(1, ...lista.map((t) => t.numero_turno), 0);
  const huecos = [];
  for (let n = 1; n <= max; n += 1) {
    if (!existentes.has(n)) huecos.push(n);
  }
  return huecos;
}

/** Siguiente número disponible al final del cortejo (max + 1). */
export function proximoNumeroTurno(turnos) {
  const lista = Array.isArray(turnos) ? turnos : [];
  const max = Math.max(0, ...lista.map((t) => t.numero_turno));
  return max + 1;
}

/** Valores sugeridos al agregar un turno a una procesión existente. */
export function sugerirDefaultsNuevoTurno(turnosExistentes, numeroTurno) {
  const lista = Array.isArray(turnosExistentes) ? turnosExistentes : [];
  const n = Number(numeroTurno);
  const porTipo = (tipo) => lista.find((t) => t.tipo_turno === tipo);
  const ordinarioRef = lista.find((t) => t.tipo_turno === 'Ordinario') || lista[0];
  const extraRef = lista.find((t) => t.tipo_turno === 'Extraordinario') || ordinarioRef;
  const maxNum = Math.max(0, ...lista.map((t) => t.numero_turno));

  let tipo_turno = 'Ordinario';
  let precio = ordinarioRef?.precio ?? 150;
  let total_brazos = ordinarioRef?.total_brazos ?? 20;
  let etiqueta = `Ordinario · turno ${n}`;

  if (n === 1) {
    tipo_turno = 'Salida';
    precio = porTipo('Salida')?.precio ?? ordinarioRef?.precio ?? 400;
    total_brazos = porTipo('Salida')?.total_brazos ?? ordinarioRef?.total_brazos ?? 20;
    etiqueta = 'Salida';
  } else if (n > maxNum) {
    tipo_turno = 'Entrada';
    precio = porTipo('Entrada')?.precio ?? ordinarioRef?.precio ?? 400;
    total_brazos = porTipo('Entrada')?.total_brazos ?? ordinarioRef?.total_brazos ?? 20;
    etiqueta = 'Entrada';
  } else if (turnosElegiblesExtraordinarios(maxNum + 1).includes(n)) {
    tipo_turno = 'Extraordinario';
    precio = extraRef?.precio ?? 300;
    total_brazos = extraRef?.total_brazos ?? ordinarioRef?.total_brazos ?? 12;
    etiqueta = `Extraordinario · turno ${n}`;
  }

  return { tipo_turno, precio, total_brazos, etiqueta };
}

/** Máximo número de turno en una procesión. */
export function maxNumeroTurno(turnos) {
  const nums = (turnos || []).map((t) => t.numero_turno);
  return nums.length ? Math.max(...nums) : 0;
}

/** Tipos permitidos al editar un turno existente (salida/entrada fijos en extremos). */
export function tiposTurnoEditables(numeroTurno, maxNumero) {
  const n = Number(numeroTurno);
  const max = Number(maxNumero) || 0;
  if (n === 1) return ['Salida'];
  if (max > 0 && n === max) return ['Entrada'];
  return ['Ordinario', 'Extraordinario'];
}

/** Precio y brazos de referencia según otro turno del mismo tipo en la procesión. */
export function referenciaPorTipoTurno(turnosExistentes, tipo) {
  const lista = Array.isArray(turnosExistentes) ? turnosExistentes : [];
  const ref = lista.find((t) => t.tipo_turno === tipo);
  const ordinario = lista.find((t) => t.tipo_turno === 'Ordinario');
  const extra = lista.find((t) => t.tipo_turno === 'Extraordinario');
  if (tipo === 'Extraordinario') {
    return {
      precio: ref?.precio ?? extra?.precio ?? ordinario?.precio ?? 300,
      total_brazos: ref?.total_brazos ?? extra?.total_brazos ?? ordinario?.total_brazos ?? 12,
    };
  }
  if (tipo === 'Salida' || tipo === 'Entrada') {
    const refTipo = lista.find((t) => t.tipo_turno === tipo);
    return {
      precio: refTipo?.precio ?? ordinario?.precio ?? 400,
      total_brazos: refTipo?.total_brazos ?? ordinario?.total_brazos ?? 20,
    };
  }
  return {
    precio: ref?.precio ?? ordinario?.precio ?? 150,
    total_brazos: ref?.total_brazos ?? ordinario?.total_brazos ?? 20,
  };
}

/**
 * Plan para aumentar o reducir brazos de un turno.
 * @returns {{ error?: string, agregar?: object[], eliminarIds?: string[] }}
 */
export function planAjusteBrazos(brazosDelTurno, { turnoId, numeroTurno, organizacionId, nuevoTotal }) {
  const total = Number(nuevoTotal);
  if (!validarBrazosPares(total)) {
    return { error: 'El total de brazos debe ser par y mayor que 0.' };
  }

  const delTurno = (brazosDelTurno || []).filter((b) => b.turno_id === turnoId);
  const actualTotal = delTurno.length;

  if (total === actualTotal) {
    return { agregar: [], eliminarIds: [] };
  }

  if (total > actualTotal) {
    if (actualTotal === 0) {
      const creados = crearBrazosParaTurno({
        turnoId,
        numeroTurno,
        totalBrazos: total,
        organizacionId,
      }).map(({ id, ...b }) => b);
      return { agregar: creados, eliminarIds: [] };
    }

    const actualPorLado = actualTotal / 2;
    const nuevoPorLado = total / 2;
    const agregar = [];
    for (let n = actualPorLado + 1; n <= nuevoPorLado; n += 1) {
      ['Izquierda', 'Derecha'].forEach((lado) => {
        agregar.push({
          organizacion_id: organizacionId,
          turno_id: turnoId,
          numero_turno: numeroTurno,
          numero_brazo: n,
          lado,
          estado: 'disponible',
        });
      });
    }
    return { agregar, eliminarIds: [] };
  }

  const nuevoPorLado = total / 2;
  const aEliminar = delTurno.filter((b) => b.numero_brazo > nuevoPorLado);
  const bloqueados = aEliminar.filter(
    (b) => b.estado !== 'disponible' || b.reserva_apartado || b.cargador_id
  );
  if (bloqueados.length > 0) {
    return {
      error:
        'No se puede reducir brazos: hay espacios vendidos, apartados o reservados en los brazos que se quitarían.',
    };
  }
  return { agregar: [], eliminarIds: aEliminar.map((b) => b.id) };
}
