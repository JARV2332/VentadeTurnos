/**
 * Plantilla e importación de apartados (Excel / CSV).
 * Columnas mínimas: turno, brazo, lado. El resto es opcional (como en taquilla).
 */

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
  turno: ['turno', 'numero_turno', 'n_turno', '# turno'],
  brazo: ['brazo', 'numero_brazo', 'n_brazo', '# brazo', 'no brazo'],
  lado: ['lado', 'columna', 'izq/der'],
  nombre: ['nombre', 'nombre_cargador', 'nombre completo', 'cargador', 'asignado', 'persona'],
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

export function parseFilasTabla(rows) {
  if (!rows?.length) return { error: 'El archivo está vacío.', filas: [] };

  let headerIdx = 0;
  let colMap = mapHeaders(rows[0].map((c) => String(c ?? '').trim()));

  if (colMap.turno === undefined || colMap.brazo === undefined || colMap.lado === undefined) {
    headerIdx = 1;
    colMap = mapHeaders((rows[1] || []).map((c) => String(c ?? '').trim()));
  }

  if (colMap.turno === undefined || colMap.brazo === undefined || colMap.lado === undefined) {
    return {
      error:
        'Faltan columnas obligatorias: Turno, Brazo y Lado. Descargue la plantilla y úsela como guía.',
      filas: [],
    };
  }

  const filas = [];
  for (let i = headerIdx + 1; i < rows.length; i += 1) {
    const cells = rows[i].map((c) => String(c ?? '').trim());
    if (filaAVacio(cells)) continue;

    const get = (key) => {
      const idx = colMap[key];
      return idx !== undefined ? cells[idx]?.trim() || '' : '';
    };

    filas.push({
      filaExcel: i + 1,
      turno: get('turno'),
      brazo: get('brazo'),
      lado: get('lado'),
      nombre: get('nombre'),
      whatsapp: get('whatsapp'),
      correo: get('correo'),
      cui: get('cui'),
      telefono_emergencia: get('telefono_emergencia'),
      notas: get('notas'),
    });
  }

  return { filas, colMap };
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

  if (name.endsWith('.csv')) {
    const text = await file.text();
    return parseCSVText(text);
  }

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return {
      error:
        'Para subir desde Excel: Archivo → Guardar como → CSV UTF-8 (.csv) y súbalo aquí. También puede usar la plantilla CSV.',
      filas: [],
    };
  }

  return { error: 'Formato no soportado. Use .csv (desde Excel: Guardar como CSV)', filas: [] };
}

export function generarCSVPlantilla() {
  const header = PLANTILLA_COLUMNAS.map((c) => c.label).join(',');
  const ejemplo = PLANTILLA_COLUMNAS.map((c) => c.ejemplo).join(',');
  const ejemplo2 = ['3', '5', 'Derecha', '', '', '', '', '', 'Apartado sin nombre'].join(',');
  return `${header}\n${ejemplo}\n${ejemplo2}`;
}

export function descargarPlantilla() {
  const csv = generarCSVPlantilla();
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'plantilla_apartados_turnos.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/** Abre la plantilla CSV (Excel la abre sin problema) */
export function descargarPlantillaExcel() {
  descargarPlantilla();
}

export function etiquetaAsignado(brazo, cargador) {
  if (cargador?.nombre_completo) return cargador.nombre_completo;
  if (brazo?.asignado_nombre) return brazo.asignado_nombre;
  if (brazo?.reserva_apartado) return 'Apartado';
  return null;
}
