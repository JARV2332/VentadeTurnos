import { etiquetaAsignado } from './importReservasUtils';
import { normalizarCui, isValidCui } from './cuiUtils';

function norm(texto) {
  return String(texto || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function iterApartadosEnTurnos(turnos) {
  const items = [];
  (turnos || []).forEach((turno) => {
    const brazos = [...(turno.izquierda || []), ...(turno.derecha || [])];
    brazos.forEach((brazo) => {
      if (brazo.reserva_apartado && brazo.estado === 'reservado') {
        items.push({ brazo, turno });
      }
    });
  });
  return items;
}

function dpiDeBrazo(brazo) {
  const deCargador = normalizarCui(brazo.cargador?.cui_o_identificacion || '');
  if (deCargador) return deCargador;
  const m = String(brazo.apartado_notas || '').match(/DPI\s*(\d{13})/);
  return m ? m[1] : '';
}

function nombreDeBrazo(brazo) {
  const n = etiquetaAsignado(brazo, brazo.cargador);
  if (n && n !== 'Apartado') return n;
  return brazo.asignado_nombre || '';
}

function coincideNombre(nombre, qNorm) {
  const n = norm(nombre);
  if (!n || !qNorm) return false;
  if (n.includes(qNorm)) return true;
  const palabras = qNorm.split(/\s+/).filter((w) => w.length >= 2);
  return palabras.length > 0 && palabras.every((w) => n.includes(w));
}

function coincideDpi(dpi, qDpi) {
  if (!dpi || !qDpi) return false;
  if (dpi === qDpi) return true;
  if (dpi.includes(qDpi) || qDpi.includes(dpi)) return true;
  return false;
}

/** Busca apartados por DPI (parcial o completo) o por nombre. */
export function buscarApartadosEnTurnos(turnos, query) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];

  const qNorm = norm(q);
  const qDpi = normalizarCui(q);
  const buscaDpi = qDpi.length >= 3;

  return iterApartadosEnTurnos(turnos)
    .map(({ brazo, turno }) => ({
      brazo,
      turno,
      nombre: nombreDeBrazo(brazo),
      dpi: dpiDeBrazo(brazo),
    }))
    .filter((item) => {
      if (buscaDpi && (item.dpi || isValidCui(q))) {
        return coincideDpi(item.dpi, qDpi);
      }
      return coincideNombre(item.nombre, qNorm);
    });
}

/** Agrupa resultados por devoto + turno (varios brazos del mismo apartado). */
export function agruparApartadosBusqueda(resultados) {
  const map = new Map();

  resultados.forEach((item) => {
    const key = `${item.nombre}|${item.dpi}|${item.turno.id}`;
    if (!map.has(key)) {
      map.set(key, {
        nombre: item.nombre,
        dpi: item.dpi,
        turno: item.turno,
        brazos: [],
      });
    }
    map.get(key).brazos.push(item.brazo);
  });

  return [...map.values()].sort((a, b) => {
    const na = norm(a.nombre).localeCompare(norm(b.nombre));
    if (na !== 0) return na;
    return a.turno.numero_turno - b.turno.numero_turno;
  });
}

/** Agrupa por devoto (puede tener varios turnos). */
export function agruparApartadosPorDevoto(gruposPorTurno) {
  const map = new Map();

  gruposPorTurno.forEach((g) => {
    const key = `${norm(g.nombre)}|${g.dpi || ''}`;
    if (!map.has(key)) {
      map.set(key, {
        nombre: g.nombre,
        dpi: g.dpi,
        brazos: [],
        turnosResumen: [],
      });
    }
    const entry = map.get(key);
    g.brazos.forEach((b) => {
      if (!entry.brazos.some((x) => x.id === b.id)) entry.brazos.push(b);
    });
    const yaTurno = entry.turnosResumen.find((t) => t.turno.id === g.turno.id);
    if (yaTurno) {
      yaTurno.cantidad += g.brazos.length;
    } else {
      entry.turnosResumen.push({ turno: g.turno, cantidad: g.brazos.length });
    }
  });

  return [...map.values()].sort((a, b) => norm(a.nombre).localeCompare(norm(b.nombre)));
}

export function formDesdeApartado(brazo, cargador) {
  const dpiMatch = brazo.apartado_notas?.match(/DPI\s*(\d{13})/);
  if (cargador) {
    return {
      nombre_completo: cargador.nombre_completo || '',
      whatsapp: cargador.whatsapp || '',
      correo: cargador.correo || '',
      cui_o_identificacion: normalizarCui(cargador.cui_o_identificacion || ''),
      telefono_emergencia: cargador.telefono_emergencia || '',
    };
  }
  return {
    nombre_completo: brazo.asignado_nombre || brazo.cargador?.nombre_completo || '',
    whatsapp: '',
    correo: '',
    cui_o_identificacion: dpiMatch?.[1] || '',
    telefono_emergencia: '',
  };
}
