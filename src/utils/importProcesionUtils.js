/**
 * Importación de procesión desde Excel.
 * Columnas: Turno | Melodía | Asignacion de turno | Ofrenda
 *
 * - Varios renglones con la misma fila de turno = varias melodías.
 * - Asignación: disponible, reservado total (apartado), o mixto N reservados + M venta.
 */

import * as XLSX from 'xlsx';
import { validarBrazosPares } from './turnoUtils';

export const PROCESION_EXCEL_COLUMNAS = [
  { key: 'turno', label: 'Turno' },
  { key: 'melodia', label: 'Melodía' },
  { key: 'asignacion', label: 'Asignacion de turno' },
  { key: 'ofrenda', label: 'Ofrenda' },
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

/** @returns {{ tipo: 'disponible'|'reservado_total'|'mixto', totalBrazos: number, reservados: number, disponibles: number }} */
export function parseAsignacionTurno(texto, brazosDefault = 20) {
  const t = norm(texto);
  const fallback = Number(brazosDefault) || 20;

  if (!t) {
    return { tipo: 'disponible', totalBrazos: fallback, reservados: 0, disponibles: fallback };
  }

  if (
    /no\s*vender/.test(t) ||
    (/reservado/.test(t) && !/disponible/.test(t) && !/venta/.test(t))
  ) {
    return { tipo: 'reservado_total', totalBrazos: fallback, reservados: fallback, disponibles: 0 };
  }

  const mRes = t.match(/reservad[^\d]*(\d+)[^\d]*brazo/);
  const mDis = t.match(/disponible[^\d]*(?:para\s*la\s*venta\s*)?(\d+)/);

  if (mRes && mDis) {
    const reservados = Number(mRes[1]);
    const disponibles = Number(mDis[1]);
    const totalBrazos = reservados + disponibles;
    return { tipo: 'mixto', totalBrazos, reservados, disponibles };
  }

  if (/disponible/.test(t) && /venta/.test(t)) {
    return { tipo: 'disponible', totalBrazos: fallback, reservados: 0, disponibles: fallback };
  }

  return { tipo: 'disponible', totalBrazos: fallback, reservados: 0, disponibles: fallback };
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
  return m ? Number(m[1]) : null;
}

function encontrarFilaEncabezado(rows) {
  for (let i = 0; i < Math.min(rows.length, 30); i += 1) {
    const cells = (rows[i] || []).map((c) => norm(c));
    const tieneTurno = cells.some((c) => c === 'turno' || c.startsWith('turno '));
    const tieneMelodia = cells.some((c) => c.includes('melodia'));
    const tieneAsignacion = cells.some((c) => c.includes('asignacion'));
    const tieneOfrenda = cells.some((c) => c.includes('ofrenda'));
    if (tieneTurno && tieneMelodia && tieneAsignacion && tieneOfrenda) {
      const map = {};
      cells.forEach((c, idx) => {
        if (c === 'turno' || c.startsWith('turno ')) map.turno = idx;
        if (c.includes('melodia')) map.melodia = idx;
        if (c.includes('asignacion')) map.asignacion = idx;
        if (c.includes('ofrenda')) map.ofrenda = idx;
      });
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
    if (/programa de melodias/i.test(texto)) return;

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

  return bloques.map((bloque) => {
    let numero = extraerNumeroTurno(bloque.etiqueta);
    const tipo = detectarTipoTurno(bloque.etiqueta);

    if (numero === null) {
      if (tipo === 'Salida' && ultimoNumero === 0) numero = 1;
      else numero = ultimoNumero + 1;
    }

    if (numero <= ultimoNumero && !(tipo === 'Salida' && numero === 1 && ultimoNumero === 0)) {
      numero = ultimoNumero + 1;
    }

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

    if (turnoTxt) {
      if (actual) bloques.push(actual);
      actual = {
        filaExcel: i + 1,
        etiqueta: turnoTxt,
        melodias: melodia ? [melodia] : [],
        asignacionTexto: asignacion,
        ofrenda: parseOfrenda(ofrendaRaw),
      };
    } else if (actual && esFilaContinuacionMelodia(turnoTxt, melodia)) {
      actual.melodias.push(melodia);
      if (asignacion && !actual.asignacionTexto) actual.asignacionTexto = asignacion;
      if (ofrendaRaw && actual.ofrenda == null) actual.ofrenda = parseOfrenda(ofrendaRaw);
    } else if (actual && !melodia && !asignacion && !ofrendaRaw) {
      /* fila en blanco dentro del bloque — ignorar */
    } else if (actual) {
      /* turno vacío pero sin melodía: sigue siendo parte del bloque anterior si no hay nuevo turno */
      if (asignacion && !actual.asignacionTexto) actual.asignacionTexto = asignacion;
      if (ofrendaRaw && actual.ofrenda == null) actual.ofrenda = parseOfrenda(ofrendaRaw);
    } else if (melodia) {
      actual = {
        filaExcel: i + 1,
        etiqueta: melodia,
        melodias: [melodia],
        asignacionTexto: asignacion,
        ofrenda: parseOfrenda(ofrendaRaw),
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
    const asignacion = parseAsignacionTurno(bloque.asignacionTexto, brazosDefault);
    const { melodias, son, alabado } = melodiasParaPersistir(bloque.melodias);

    if (!validarBrazosPares(asignacion.totalBrazos)) {
      errores.push(
        `Fila ${bloque.filaExcel} (${bloque.etiqueta}): total de brazos (${asignacion.totalBrazos}) debe ser par.`
      );
    }

    if (bloque.ofrenda == null) {
      advertencias.push(`Fila ${bloque.filaExcel} (${bloque.etiqueta}): sin ofrenda — se usará Q 0.`);
    }

    return {
      numero_turno: bloque.numero_turno,
      tipo_turno: bloque.tipo_turno,
      etiqueta: bloque.etiqueta.trim(),
      precio: bloque.ofrenda ?? 0,
      total_brazos: asignacion.totalBrazos,
      melodias,
      son,
      alabado,
      asignacion,
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
        'No se encontraron las columnas Turno, Melodía, Asignacion de turno y Ofrenda. Verifique la plantilla.',
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

  return { turnosPlan, meta, advertencias, errores, error: null };
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
  if (asignacion.tipo === 'reservado_total') return 'Reservado (no vender)';
  if (asignacion.tipo === 'mixto') {
    return `Reservado ${asignacion.reservados} · Venta ${asignacion.disponibles}`;
  }
  return 'Disponible para venta';
}

export function descargarPlantillaProcesionExcel() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Programa de Melodias'],
    ['Procesión Solemne 2026'],
    ['15 de agosto de 2026'],
    [],
    PROCESION_EXCEL_COLUMNAS.map((c) => c.label),
    ['Honor Salida', 'Himno a la Asunción', 'Reservado 20 BRAZOS, disponible para la venta 26', 'Q250.00'],
    ['', 'La Granadera', '', ''],
    ['Turno 7', 'El Poder del amor', 'Disponible para la venta', 'Q30.00'],
    ['Turno 8', 'El Buey y la Mula', 'Disponible para la venta', 'Q30.00'],
    ['Extraordinario Portal', 'Ave María', 'RESERVADO, NO VENDER', 'Q60.00'],
    ['', 'El Jilguero', '', ''],
    ['Honor Entrada', 'La Danza de los Venados', 'RESERVADO, NO VENDER', 'Q250.00'],
  ]);
  ws['!cols'] = [{ wch: 28 }, { wch: 32 }, { wch: 42 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Turnos');
  XLSX.writeFile(wb, 'plantilla_procesion_turnos.xlsx');
}
