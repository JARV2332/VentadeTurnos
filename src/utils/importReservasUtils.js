/**
 * Importación de apartados (Excel / CSV).
 *
 * Formato listado (recomendado): DPI | APELLIDO | NOMBRE | CANTIDAD | TURNO
 * Formato coordenadas (legacy): Turno | Brazo | Lado | …
 */

import * as XLSX from 'xlsx';
import { normalizarCui, normalizarDpiImport, parseCantidadImport } from './cuiUtils';

export const PLANTILLA_LISTADO_COLUMNAS = [
  { key: 'dpi', label: 'DPI', obligatorio: false, ejemplo: '1234567890101' },
  { key: 'apellido', label: 'Apellido', obligatorio: true, ejemplo: 'Pérez' },
  { key: 'nombre', label: 'Nombre', obligatorio: true, ejemplo: 'Juan Carlos' },
  { key: 'cantidad', label: 'Cantidad', obligatorio: true, ejemplo: '2' },
  { key: 'turno', label: 'Turno', obligatorio: true, ejemplo: '7' },
];

export const PLANTILLA_COLUMNAS = [
  { key: 'turno', label: 'Turno', obligatorio: true, ejemplo: '7' },
  { key: 'brazo', label: 'Brazo', obligatorio: true, ejemplo: '3' },
  { key: 'lado', label: 'Lado', obligatorio: true, ejemplo: 'Izquierda' },
  { key: 'nombre', label: 'Nombre devoto(a)', obligatorio: false, ejemplo: 'Juan Pérez' },
  { key: 'whatsapp', label: 'WhatsApp', obligatorio: false, ejemplo: '50212345678' },
  { key: 'correo', label: 'Correo', obligatorio: false, ejemplo: 'juan@correo.com' },
  { key: 'cui', label: 'CUI / ID', obligatorio: false, ejemplo: '' },
  { key: 'telefono_emergencia', label: 'Tel. emergencia', obligatorio: false, ejemplo: '' },
  { key: 'notas', label: 'Notas', obligatorio: false, ejemplo: 'Apartado hermandad' },
];

const HEADER_MAP = {
  dpi: ['dpi', 'cui', 'identificacion', 'identificación', 'cedula', 'cédula'],
  apellido: ['apellido', 'apellidos'],
  nombre: ['nombre', 'nombres', 'nombre_cargador', 'nombre completo', 'cargador', 'asignado', 'persona'],
  cantidad: ['cantidad', 'cant', 'qty', 'numero', 'número', 'num', 'espacios', 'brazos'],
  turno: ['turno', 'numero_turno', 'n_turno', '# turno'],
  brazo: ['brazo', 'numero_brazo', 'n_brazo', '# brazo', 'no brazo'],
  lado: ['lado', 'columna', 'izq/der'],
  whatsapp: ['whatsapp', 'wa', 'telefono', 'teléfono', 'celular'],
  correo: ['correo', 'email', 'e-mail'],
  cui: ['cui', 'identificacion', 'identificación', 'dpi'],
  telefono_emergencia: ['telefono_emergencia', 'tel emergencia', 'emergencia'],
  notas: ['notas', 'observaciones', 'comentario'],
};

function normHeader(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function mapHeaders(headerRow) {
  const map = {};
  headerRow.forEach((raw, idx) => {
    const h = normHeader(raw);
    Object.entries(HEADER_MAP).forEach(([key, aliases]) => {
      if (aliases.some((a) => h === normHeader(a) || h.includes(normHeader(a)))) {
        if (map[key] === undefined) map[key] = idx;
      }
    });
  });
  return map;
}

export function normalizarLado(valor) {
  const v = normHeader(valor);
  if (v.startsWith('izq') || v === 'i' || v === 'iz') return 'Izquierda';
  if (v.startsWith('der') || v === 'd' || v === 'dr') return 'Derecha';
  if (v === 'izquierda') return 'Izquierda';
  if (v === 'derecha') return 'Derecha';
  return null;
}

function filaAVacio(cells) {
  return cells.every((c) => !String(c ?? '').trim());
}

export function combinarNombreDevoto(apellido, nombre) {
  const a = String(apellido || '').trim();
  const n = String(nombre || '').trim();
  if (a && n) return `${a} ${n}`;
  return a || n || '';
}

export function parseNumeroTurnoImport(texto) {
  const t = String(texto || '').trim();
  if (/^\d+$/.test(t)) return Number(t);
  const m = t.match(/turno\s*(\d+)/i);
  if (m) return Number(m[1]);
  return null;
}

export function normalizarTextoTurno(texto) {
  return normHeader(texto)
    .replace(/\bextraordinario\b/g, '')
    .replace(/\bdel\b/g, 'de')
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolverTurnoEnLista(turnos, turnoTexto) {
  const lista = Array.isArray(turnos) ? turnos : [];
  const texto = String(turnoTexto || '').trim();
  if (!texto) return null;

  const num = parseNumeroTurnoImport(texto);
  if (num !== null) {
    const porNumero = lista.find((t) => t.numero_turno === num);
    if (porNumero) return porNumero;
  }

  const tgt = normalizarTextoTurno(texto);
  const exacta = lista.find((t) => normalizarTextoTurno(t.etiqueta) === tgt);
  if (exacta) return exacta;

  return (
    lista.find((t) => {
      const e = normalizarTextoTurno(t.etiqueta);
      return e.includes(tgt) || tgt.includes(e);
    }) || null
  );
}

export function ordenarBrazosParaApartado(brazos) {
  const ladoOrd = { Izquierda: 0, Derecha: 1 };
  return [...(brazos || [])].sort((a, b) => {
    if (a.numero_brazo !== b.numero_brazo) return a.numero_brazo - b.numero_brazo;
    return (ladoOrd[a.lado] ?? 0) - (ladoOrd[b.lado] ?? 0);
  });
}

/** Brazos libres o apartados vacíos (sin devoto asignado). */
export function brazosElegiblesParaApartado(brazos) {
  return ordenarBrazosParaApartado(brazos).filter((b) => {
    if (b.estado === 'vendido') return false;
    if (b.estado === 'disponible') return true;
    if (
      b.estado === 'reservado' &&
      b.reserva_apartado &&
      !b.cargador_id &&
      !b.asignado_nombre
    ) {
      return true;
    }
    return false;
  });
}

function detectarFormato(colMap) {
  const tieneListado =
    colMap.cantidad !== undefined &&
    colMap.turno !== undefined &&
    (colMap.apellido !== undefined || colMap.nombre !== undefined);
  if (tieneListado) return 'listado';

  if (colMap.turno !== undefined && colMap.brazo !== undefined && colMap.lado !== undefined) {
    return 'coordenadas';
  }

  return null;
}

function parseFilasListado(rows, headerIdx, colMap) {
  const filas = [];
  const errores = [];
  const advertencias = [];

  for (let i = headerIdx + 1; i < rows.length; i += 1) {
    const cells = rows[i].map((c) => String(c ?? '').trim());
    if (filaAVacio(cells)) continue;

    const get = (key) => {
      const idx = colMap[key];
      return idx !== undefined ? cells[idx]?.trim() || '' : '';
    };

    const dpiRaw = get('dpi') || get('cui');
    const { dpi, advertencia: advDpi } = normalizarDpiImport(dpiRaw);
    const apellido = get('apellido');
    const nombre = get('nombre');
    const nombreCompleto = combinarNombreDevoto(apellido, nombre);
    const { cantidad, advertencia: advCant } = parseCantidadImport(get('cantidad'));
    const turno = get('turno');

    if (advDpi) advertencias.push(`Fila ${i + 1}: ${advDpi}`);
    if (advCant) advertencias.push(`Fila ${i + 1}: ${advCant}`);

    if (!nombreCompleto) {
      errores.push(`Fila ${i + 1}: falta apellido o nombre del devoto(a).`);
      continue;
    }
    if (!cantidad || cantidad < 1) {
      errores.push(`Fila ${i + 1}: cantidad inválida (mínimo 1).`);
      continue;
    }
    if (!turno) {
      errores.push(`Fila ${i + 1}: falta el turno.`);
      continue;
    }

    filas.push({
      modo: 'listado',
      filaExcel: i + 1,
      dpi,
      cui: dpi,
      apellido,
      nombre,
      nombre_completo: nombreCompleto,
      cantidad,
      turno,
      whatsapp: get('whatsapp'),
      correo: get('correo'),
      telefono_emergencia: get('telefono_emergencia'),
      notas: get('notas'),
    });
  }

  return { filas, errores, advertencias };
}

function parseFilasCoordenadas(rows, headerIdx, colMap) {
  const filas = [];

  for (let i = headerIdx + 1; i < rows.length; i += 1) {
    const cells = rows[i].map((c) => String(c ?? '').trim());
    if (filaAVacio(cells)) continue;

    const get = (key) => {
      const idx = colMap[key];
      return idx !== undefined ? cells[idx]?.trim() || '' : '';
    };

    const nombreCompleto = get('nombre') || combinarNombreDevoto(get('apellido'), '');

    filas.push({
      modo: 'coordenadas',
      filaExcel: i + 1,
      turno: get('turno'),
      brazo: get('brazo'),
      lado: get('lado'),
      nombre: nombreCompleto,
      nombre_completo: nombreCompleto,
      cui: normalizarCui(get('cui') || get('dpi')),
      whatsapp: get('whatsapp'),
      correo: get('correo'),
      telefono_emergencia: get('telefono_emergencia'),
      notas: get('notas'),
    });
  }

  return { filas, errores: [], advertencias: [] };
}

export function parseFilasTabla(rows) {
  if (!rows?.length) return { error: 'El archivo está vacío.', filas: [], formato: null, errores: [] };

  let headerIdx = 0;
  let colMap = mapHeaders(rows[0].map((c) => String(c ?? '').trim()));
  let formato = detectarFormato(colMap);

  if (!formato) {
    headerIdx = 1;
    colMap = mapHeaders((rows[1] || []).map((c) => String(c ?? '').trim()));
    formato = detectarFormato(colMap);
  }

  if (!formato) {
    return {
      error:
        'No se reconoció el formato. Use columnas DPI, Apellido, Nombre, Cantidad, Turno — o Turno, Brazo, Lado.',
      filas: [],
      formato: null,
      errores: [],
    };
  }

  const parsed =
    formato === 'listado'
      ? parseFilasListado(rows, headerIdx, colMap)
      : parseFilasCoordenadas(rows, headerIdx, colMap);

  const advertencias = parsed.advertencias || [];

  if (!parsed.filas.length && parsed.errores?.length) {
    return {
      error: parsed.errores.join(' '),
      filas: [],
      formato,
      errores: parsed.errores,
      advertencias,
    };
  }

  if (!parsed.filas.length) {
    return { error: 'No se encontraron filas de datos válidas.', filas: [], formato, errores: [], advertencias };
  }

  return {
    filas: parsed.filas,
    formato,
    errores: parsed.errores || [],
    advertencias,
    error: null,
  };
}

export function parseCSVText(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const rows = lines.map((line) => {
    const sep = line.includes(';') ? ';' : ',';
    return line.split(sep).map((c) => c.replace(/^"|"$/g, '').trim());
  });
  return parseFilasTabla(rows);
}

export async function parseArchivoImport(file) {
  const name = file.name.toLowerCase();

  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    const text = await file.text();
    return parseCSVText(text);
  }

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    return parseFilasTabla(rows);
  }

  return { error: 'Formato no soportado. Use .xlsx o .csv', filas: [], formato: null, errores: [] };
}

export function generarCSVPlantillaListado() {
  const header = PLANTILLA_LISTADO_COLUMNAS.map((c) => c.label).join(',');
  const ejemplo1 = PLANTILLA_LISTADO_COLUMNAS.map((c) => c.ejemplo).join(',');
  const ejemplo2 = ['9876543210101', 'López', 'María', '1', '8'].join(',');
  return `${header}\n${ejemplo1}\n${ejemplo2}`;
}

export function generarCSVPlantilla() {
  const header = PLANTILLA_COLUMNAS.map((c) => c.label).join(',');
  const ejemplo = PLANTILLA_COLUMNAS.map((c) => c.ejemplo).join(',');
  const ejemplo2 = ['3', '5', 'Derecha', '', '', '', '', '', 'Apartado sin nombre'].join(',');
  return `${header}\n${ejemplo}\n${ejemplo2}`;
}

export function descargarPlantillaListado() {
  const ws = XLSX.utils.aoa_to_sheet([
    PLANTILLA_LISTADO_COLUMNAS.map((c) => c.label),
    PLANTILLA_LISTADO_COLUMNAS.map((c) => c.ejemplo),
    ['9876543210101', 'López', 'María', '1', '8'],
    ['', 'García', 'Pedro', '2', 'Turno 7'],
  ]);
  ws['!cols'] = [{ wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 10 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Apartados');
  XLSX.writeFile(wb, 'plantilla_apartados_listado.xlsx');
}

export function descargarPlantilla() {
  const csv = generarCSVPlantillaListado();
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'plantilla_apartados_listado.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/** @deprecated usar descargarPlantillaListado */
export function descargarPlantillaExcel() {
  descargarPlantillaListado();
}

export function descargarPlantillaCoordenadas() {
  const csv = generarCSVPlantilla();
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'plantilla_apartados_coordenadas.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function etiquetaAsignado(brazo, cargador) {
  if (cargador?.nombre_completo) return cargador.nombre_completo;
  if (brazo?.cargador?.nombre_completo) return brazo.cargador.nombre_completo;
  if (brazo?.asignado_nombre) return brazo.asignado_nombre;
  if (brazo?.reserva_apartado) return 'Apartado';
  return null;
}

export function resumenFilasImport(filas, formato) {
  if (formato === 'listado') {
    const personas = filas.length;
    const espacios = filas.reduce((s, f) => s + (Number(f.cantidad) || 0), 0);
    return { personas, espacios };
  }
  return { personas: filas.length, espacios: filas.length };
}
