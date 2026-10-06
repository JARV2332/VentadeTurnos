/**
 * Importación de procesión desde Excel.
 *
 * Formato recomendado:
 *   Turno | Dirección | Marcha | Precio | Brazos
 *
 * Formato anterior (sigue soportado):
 *   Turno | Melodía | Asignacion de turno | Ofrenda
 *
 * - Varios renglones con la misma fila de turno = varias marchas/melodías.
 * - Asignación (opcional): disponible, reservado total, o mixto N reservados + M venta.
 * - Si hay columna Brazos, ese número define el total del turno.
 */

import * as XLSX from 'xlsx';
import { validarBrazosPares } from './turnoUtils';

/** Columnas de la plantilla descargable (formato nuevo). */
export const PROCESION_EXCEL_COLUMNAS = [
  { key: 'turno', label: 'Turno' },
  { key: 'direccion', label: 'Dirección' },
  { key: 'melodia', label: 'Marcha' },
  { key: 'ofrenda', label: 'Precio' },
  { key: 'brazos', label: 'Brazos' },
];

function norm(texto) {
  return String(texto || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function filaVacia(cells) {
  return (cells || []).every((c) => !String(c ?? '').trim());
}

function parseOfrenda(valor) {
  const raw = String(valor ?? '').trim();
  if (!raw) return null;
  const limpio = raw.replace(/[^\d.,]/g, '').replace(',', '.');
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

function parseBrazosCol(valor) {
  const raw = String(valor ?? '').trim();
  if (!raw) return null;
  const n = parseInt(raw.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizarBrazosDefault(brazosDefault) {
  let n = Number(brazosDefault) || 20;
  if (n < 2) n = 2;
  if (n % 2 !== 0) n += 1;
  return n;
}

function ajustarPar(n) {
  let v = Math.max(0, Number(n) || 0);
  if (v % 2 !== 0) v += 1;
  return v;
}

function extraerNumerosMixto(texto) {
  const t = norm(texto);
  const mRes = t.match(/reservad[^\d]*(\d+)/);
  const mDis = t.match(/disponible[^\d]*(?:para\s*la\s*venta\s*)?(\d+)/);
  if (!mRes || !mDis) return null;
  let reservados = ajustarPar(Number(mRes[1]) || 0);
  let disponibles = ajustarPar(Number(mDis[1]) || 0);
  let totalBrazos = reservados + disponibles;
  if (totalBrazos % 2 !== 0) totalBrazos += 1;
  disponibles = totalBrazos - reservados;
  return { reservados, disponibles, totalBrazos };
}

/** Infiere brazos/turno desde filas del Excel que traen cantidades explícitas (ej. 20+26=46). */
export function inferirBrazosDefaultDesdeBloques(bloques) {
  const totals = [];
  (bloques || []).forEach((bloque) => {
    if (bloque.brazosExplicitos) totals.push(ajustarPar(bloque.brazosExplicitos));
    const mixto = extraerNumerosMixto(bloque.asignacionTexto);
    if (mixto?.totalBrazos) totals.push(mixto.totalBrazos);
  });
  if (!totals.length) return 20;
  return Math.max(...totals);
}

export function contarBrazosTurnosPlan(turnosPlan) {
  return (turnosPlan || []).reduce((s, t) => s + (Number(t.total_brazos) || 0), 0);
}

/** @returns {{ tipo: 'disponible'|'reservado_total'|'mixto', totalBrazos: number, reservados: number, disponibles: number }} */
export function parseAsignacionTurno(texto, brazosDefault = 20) {
  const t = norm(texto);
  const total = normalizarBrazosDefault(brazosDefault);

  if (!t) {
    return { tipo: 'disponible', totalBrazos: total, reservados: 0, disponibles: total };
  }

  if (/no\s*vender/.test(t)) {
    return { tipo: 'reservado_total', totalBrazos: total, reservados: total, disponibles: 0 };
  }

  const mixto = extraerNumerosMixto(texto);
  const tieneDisponible = /disponible/.test(t) && /venta/.test(t);

  if (mixto && tieneDisponible) {
    return {
      tipo: 'mixto',
      totalBrazos: mixto.totalBrazos,
      reservados: mixto.reservados,
      disponibles: mixto.disponibles,
    };
  }

  const mRes = t.match(/reservad[^\d]*(\d+)/);
  if (mRes && tieneDisponible) {
    let reservados = Math.min(ajustarPar(Number(mRes[1]) || 0), total);
    const disponibles = total - reservados;
    return { tipo: 'mixto', totalBrazos: total, reservados, disponibles };
  }

  if (/reservado/.test(t) && !tieneDisponible) {
    return { tipo: 'reservado_total', totalBrazos: total, reservados: total, disponibles: 0 };
  }

  return { tipo: 'disponible', totalBrazos: total, reservados: 0, disponibles: total };
}

export function detectarTipoTurno(etiqueta) {
  const e = norm(etiqueta);
  if (/extraordinario/.test(e)) return 'Extraordinario';
  if (/honor\s*salida/.test(e) || e === 'salida') return 'Salida';
  if (/honor\s*entrada/.test(e) || e === 'entrada') return 'Entrada';
  return 'Ordinario';
}

export function extraerNumeroTurno(etiqueta) {
  const m = String(etiqueta || '').match(/turno\s*(\d+)/i);
  if (m) return Number(m[1]);
  const solo = String(etiqueta || '').trim().match(/^(\d+)$/);
  return solo ? Number(solo[1]) : null;
}

function mapearColumna(c) {
  if (c === 'turno' || c.startsWith('turno ')) return 'turno';
  if (c.includes('direccion') || c.includes('recorrido')) return 'direccion';
  if (c.includes('melodia') || c.includes('marcha') || c === 'son' || c.startsWith('son ')) {
    return 'melodia';
  }
  if (c.includes('asignacion')) return 'asignacion';
  if (c.includes('ofrenda') || c === 'precio' || c.startsWith('precio ')) return 'ofrenda';
  if (c === 'brazos' || c.startsWith('brazos ') || c.includes('total brazos')) return 'brazos';
  return null;
}

function encontrarFilaEncabezado(rows) {
  for (let i = 0; i < Math.min(rows.length, 30); i += 1) {
    const cells = (rows[i] || []).map((c) => norm(c));
    const map = {};
    cells.forEach((c, idx) => {
      const key = mapearColumna(c);
      if (key && map[key] === undefined) map[key] = idx;
    });
    const tieneTurno = map.turno !== undefined;
    const tieneMelodia = map.melodia !== undefined;
    if (tieneTurno && tieneMelodia) {
      return { headerIdx: i, colMap: map };
    }
  }
  return null;
}

function inferirMeta(rows, headerIdx) {
  const meta = { nombre_evento: '', fecha: '' };
  const previas = rows.slice(0, headerIdx).filter((r) => !filaVacia(r));

  previas.forEach((row) => {
    const texto = row.map((c) => String(c ?? '').trim()).filter(Boolean).join(' ').trim();
    if (!texto) return;
    if (/programa de melodias/i.test(texto) || /programa de marchas/i.test(texto)) return;

    const fechaMatch = texto.match(/(\d{1,2})\s+de\s+\w+\s+de\s+(\d{4})/i);
    if (fechaMatch) {
      const meses = {
        enero: '01',
        febrero: '02',
        marzo: '03',
        abril: '04',
        mayo: '05',
        junio: '06',
        julio: '07',
        agosto: '08',
        septiembre: '09',
        octubre: '10',
        noviembre: '11',
        diciembre: '12',
      };
      const partes = norm(texto).split(' de ');
      const mes = meses[partes[1]?.trim()] || '08';
      const dia = String(fechaMatch[1]).padStart(2, '0');
      meta.fecha = `${fechaMatch[2]}-${mes}-${dia}`;
      return;
    }

    if (!meta.nombre_evento && texto.length > 3) {
      meta.nombre_evento = texto;
    }
  });

  return meta;
}

function asignarNumerosTurno(bloques) {
  let ultimoNumero = 0;
  const usados = new Set();

  return bloques.map((bloque) => {
    let numero = extraerNumeroTurno(bloque.etiqueta);
    const tipo = detectarTipoTurno(bloque.etiqueta);

    if (numero === null) {
      if (tipo === 'Salida' && !usados.has(1)) numero = 1;
      else numero = ultimoNumero + 1;
    }

    while (usados.has(numero)) numero += 1;

    usados.add(numero);
    ultimoNumero = Math.max(ultimoNumero, numero);
    return { ...bloque, numero_turno: numero, tipo_turno: tipo };
  });
}

/** Separa melodías para BD: 1ª en son, resto en alabado (separador ·). */
export function melodiasParaPersistir(melodias) {
  const lista = (Array.isArray(melodias) ? melodias : [])
    .map((m) => String(m || '').trim())
    .filter(Boolean);
  return {
    melodias: lista,
    son: lista[0] || null,
    alabado: lista.length > 1 ? lista.slice(1).join(' · ') : null,
  };
}

export function esFilaContinuacionMelodia(turnoTxt, melodia) {
  return !String(turnoTxt || '').trim() && !!String(melodia || '').trim();
}

function resolverAsignacion(bloque, brazosDefault) {
  let asignacion = parseAsignacionTurno(bloque.asignacionTexto, brazosDefault);
  if (bloque.brazosExplicitos == null) return asignacion;

  const total = ajustarPar(bloque.brazosExplicitos);
  if (!bloque.asignacionTexto) {
    return { tipo: 'disponible', totalBrazos: total, reservados: 0, disponibles: total };
  }
  if (asignacion.tipo === 'disponible') {
    return { tipo: 'disponible', totalBrazos: total, reservados: 0, disponibles: total };
  }
  if (asignacion.tipo === 'reservado_total') {
    return { tipo: 'reservado_total', totalBrazos: total, reservados: total, disponibles: 0 };
  }
  const reservados = Math.min(asignacion.reservados, total);
  return {
    ...asignacion,
    totalBrazos: total,
    reservados,
    disponibles: total - reservados,
  };
}

function bloquesDesdeFilas(rows, headerIdx, colMap) {
  const bloques = [];
  let actual = null;

  const get = (row, key) => {
    const idx = colMap[key];
    return idx !== undefined ? String(row[idx] ?? '').trim() : '';
  };

  for (let i = headerIdx + 1; i < rows.length; i += 1) {
    const row = rows[i] || [];
    if (filaVacia(row)) continue;

    const turnoTxt = get(row, 'turno');
    const melodia = get(row, 'melodia');
    const asignacion = get(row, 'asignacion');
    const ofrendaRaw = get(row, 'ofrenda');
    const direccion = get(row, 'direccion');
    const brazosRaw = get(row, 'brazos');
    const brazosNum = parseBrazosCol(brazosRaw);

    if (turnoTxt) {
      if (actual) bloques.push(actual);
      actual = {
        filaExcel: i + 1,
        etiqueta: turnoTxt,
        melodias: melodia ? [melodia] : [],
        asignacionTexto: asignacion,
        ofrenda: parseOfrenda(ofrendaRaw),
        direccion: direccion || '',
        brazosExplicitos: brazosNum,
      };
    } else if (actual && esFilaContinuacionMelodia(turnoTxt, melodia)) {
      actual.melodias.push(melodia);
      if (asignacion && !actual.asignacionTexto) actual.asignacionTexto = asignacion;
      if (ofrendaRaw && actual.ofrenda == null) actual.ofrenda = parseOfrenda(ofrendaRaw);
      if (direccion && !actual.direccion) actual.direccion = direccion;
      if (brazosNum != null && actual.brazosExplicitos == null) actual.brazosExplicitos = brazosNum;
    } else if (actual && !melodia && !asignacion && !ofrendaRaw && !direccion && !brazosRaw) {
      /* fila en blanco dentro del bloque — ignorar */
    } else if (actual) {
      if (asignacion && !actual.asignacionTexto) actual.asignacionTexto = asignacion;
      if (ofrendaRaw && actual.ofrenda == null) actual.ofrenda = parseOfrenda(ofrendaRaw);
      if (direccion && !actual.direccion) actual.direccion = direccion;
      if (brazosNum != null && actual.brazosExplicitos == null) actual.brazosExplicitos = brazosNum;
    } else if (melodia) {
      actual = {
        filaExcel: i + 1,
        etiqueta: melodia,
        melodias: [melodia],
        asignacionTexto: asignacion,
        ofrenda: parseOfrenda(ofrendaRaw),
        direccion: direccion || '',
        brazosExplicitos: brazosNum,
      };
    }
  }

  if (actual) bloques.push(actual);
  return bloques;
}

export function construirTurnosPlanDesdeBloques(bloques, { brazosDefault = 20 } = {}) {
  const numerados = asignarNumerosTurno(bloques);
  const advertencias = [];
  const errores = [];

  const turnosPlan = numerados.map((bloque) => {
    const asignacion = resolverAsignacion(bloque, brazosDefault);
    const { melodias, son, alabado } = melodiasParaPersistir(bloque.melodias);
    const direccion = String(bloque.direccion || '').trim() || null;

    if (!validarBrazosPares(asignacion.totalBrazos)) {
      errores.push(
        `Fila ${bloque.filaExcel} (${bloque.etiqueta}): total de brazos (${asignacion.totalBrazos}) debe ser par.`
      );
    }

    if (bloque.ofrenda == null) {
      advertencias.push(`Fila ${bloque.filaExcel} (${bloque.etiqueta}): sin precio — se usará Q 0.`);
    }

    return {
      numero_turno: bloque.numero_turno,
      tipo_turno: bloque.tipo_turno,
      etiqueta: bloque.etiqueta.trim(),
      precio: bloque.ofrenda ?? 0,
      total_brazos: asignacion.totalBrazos,
      direccion,
      melodias,
      son,
      alabado,
      asignacion,
      asignacionTexto: bloque.asignacionTexto || '',
      filaExcel: bloque.filaExcel,
    };
  });

  const nums = turnosPlan.map((t) => t.numero_turno);
  const dup = nums.filter((n, i) => nums.indexOf(n) !== i);
  if (dup.length) {
    errores.push(`Números de turno duplicados: ${[...new Set(dup)].join(', ')}`);
  }

  return { turnosPlan, advertencias, errores };
}

export function parseFilasProcesionExcel(rows, { brazosDefault = 20 } = {}) {
  if (!rows?.length) {
    return { error: 'El archivo está vacío.', turnosPlan: [], meta: {}, advertencias: [], errores: [] };
  }

  const header = encontrarFilaEncabezado(rows);
  if (!header) {
    return {
      error:
        'No se encontraron columnas Turno y Marcha/Melodía. Use: Turno, Dirección, Marcha, Precio, Brazos (o el formato anterior con Melodía / Asignacion / Ofrenda).',
      turnosPlan: [],
      meta: {},
      advertencias: [],
      errores: [],
    };
  }

  const meta = inferirMeta(rows, header.headerIdx);
  const bloques = bloquesDesdeFilas(rows, header.headerIdx, header.colMap);

  if (!bloques.length) {
    return {
      error: 'No hay turnos en el archivo (debajo del encabezado).',
      turnosPlan: [],
      meta,
      advertencias: [],
      errores: [],
    };
  }

  const { turnosPlan, advertencias, errores } = construirTurnosPlanDesdeBloques(bloques, {
    brazosDefault,
  });

  return { turnosPlan, meta, advertencias, errores, bloques, error: null };
}

export async function parseArchivoProcesionExcel(file, { brazosDefault = 20 } = {}) {
  const name = file.name.toLowerCase();

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    return parseFilasProcesionExcel(rows, { brazosDefault });
  }

  if (name.endsWith('.csv')) {
    const text = await file.text();
    const sep = text.includes(';') ? ';' : ',';
    const rows = text.split(/\r?\n/).map((line) =>
      line.split(sep).map((c) => c.replace(/^"|"$/g, '').trim())
    );
    return parseFilasProcesionExcel(rows, { brazosDefault });
  }

  return {
    error: 'Formato no soportado. Use .xlsx o .csv',
    turnosPlan: [],
    meta: {},
    advertencias: [],
    errores: [],
  };
}

export function etiquetaAsignacion(asignacion) {
  if (!asignacion) return '—';
  if (asignacion.tipo === 'reservado_total') {
    return `Reservado (no vender) · ${asignacion.totalBrazos} brazos`;
  }
  if (asignacion.tipo === 'mixto') {
    return `Reservado ${asignacion.reservados} · Venta ${asignacion.disponibles} (${asignacion.totalBrazos} total)`;
  }
  return `Disponible para venta · ${asignacion.totalBrazos} brazos`;
}

/** Reconstruye el plan con el brazosDefault actual del formulario. */
export function reconstruirTurnosPlanExcel(excelImport, brazosDefault) {
  if (!excelImport?.bloques?.length) {
    return { turnosPlan: excelImport?.turnosPlan || [], errores: [], advertencias: [] };
  }
  return construirTurnosPlanDesdeBloques(excelImport.bloques, { brazosDefault });
}

export function descargarPlantillaProcesionExcel() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Programa de Marchas'],
    ['Procesión Solemne 2026'],
    ['15 de agosto de 2026'],
    [],
    PROCESION_EXCEL_COLUMNAS.map((c) => c.label),
    ['Honor Salida', 'Iglesia — 6a. Avenida', 'Himno a la Asunción', '250', '46'],
    ['', '', 'La Granadera', '', ''],
    ['Turno 7', '6a. Avenida y 3a. Calle', 'El Poder del amor', '30', '20'],
    ['Turno 8', 'Parque Central', 'El Buey y la Mula', '30', '20'],
    ['Extraordinario Portal', 'Portal — Plaza', 'Ave María', '60', '20'],
    ['', '', 'El Jilguero', '', ''],
    ['Honor Entrada', 'Iglesia — atrio', 'La Danza de los Venados', '250', '20'],
  ]);
  ws['!cols'] = [{ wch: 24 }, { wch: 28 }, { wch: 28 }, { wch: 10 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Turnos');
  XLSX.writeFile(wb, 'plantilla_procesion_turnos.xlsx');
}
