import { isValidCui, normalizarCui } from './cuiUtils';
import { labelTipoTurno } from './cajaReportUtils';

export function normalizarTextoBusqueda(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function palabrasBusqueda(qNorm) {
  return qNorm.split(/\s+/).filter((w) => w.length >= 2);
}

export function queryValidaBusquedaDevoto(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return false;
  const digits = q.replace(/\D/g, '');
  if (digits.length >= 4) return true;
  return normalizarTextoBusqueda(q).length >= 2;
}

export function cargadorCoincideBusqueda(cargador, query) {
  if (!cargador) return false;
  const qNorm = normalizarTextoBusqueda(query);
  if (qNorm.length < 2) return false;

  const qDigits = String(query || '').replace(/\D/g, '');
  const qCui = normalizarCui(query);
  const nombre = normalizarTextoBusqueda(cargador.nombre_completo);
  const cui = normalizarCui(cargador.cui_o_identificacion);
  const correo = normalizarTextoBusqueda(cargador.correo);
  const wa = String(cargador.whatsapp || '').replace(/\D/g, '');

  if (isValidCui(qCui) && cui === qCui) return true;
  if (qDigits.length >= 4 && cui && cui.includes(qDigits)) return true;
  if (qDigits.length >= 8 && wa && (wa.includes(qDigits) || wa.endsWith(qDigits.slice(-8)))) {
    return true;
  }
  if (qNorm.includes('@') && correo && correo.includes(qNorm)) return true;
  if (correo && qNorm.length >= 3 && correo.includes(qNorm)) return true;
  if (nombre.includes(qNorm)) return true;

  const palabras = palabrasBusqueda(qNorm);
  if (palabras.length && palabras.every((w) => nombre.includes(w))) return true;

  return false;
}

export function apartadoSinCargadorCoincide(brazo, query) {
  if (brazo?.estado !== 'reservado' || !brazo?.reserva_apartado || brazo?.cargador_id) {
    return false;
  }
  const qNorm = normalizarTextoBusqueda(query);
  if (qNorm.length < 2) return false;

  const qDigits = String(query || '').replace(/\D/g, '');
  const nombre = normalizarTextoBusqueda(brazo.asignado_nombre);
  const notas = String(brazo.apartado_notas || '');

  if (nombre && nombre.includes(qNorm)) return true;
  const palabras = palabrasBusqueda(qNorm);
  if (palabras.length && nombre && palabras.every((w) => nombre.includes(w))) return true;
  if (qDigits.length >= 4 && notas.replace(/\D/g, '').includes(qDigits)) return true;

  return false;
}

export function filtrarCargadoresPorBusqueda(cargadores, query) {
  return (cargadores || []).filter((c) => cargadorCoincideBusqueda(c, query));
}

export function etiquetaEstadoAsignacion(brazo) {
  if (brazo?.estado === 'vendido') {
    return brazo.estado_entrega === 'entregado' ? 'Entregado' : 'Pagado';
  }
  if (brazo?.estado === 'reservado' && brazo?.reserva_apartado) return 'Apartado';
  if (brazo?.estado === 'reservado') return 'Reserva taquilla';
  return brazo?.estado || '—';
}

export function claseEstadoAsignacion(brazo) {
  if (brazo?.estado === 'vendido') {
    return brazo.estado_entrega === 'entregado' ? 'estado--entregado' : 'estado--pagado';
  }
  if (brazo?.reserva_apartado) return 'estado--apartado';
  if (brazo?.estado === 'reservado') return 'estado--reservado';
  return '';
}

export function enriquecerAsignaciones({ brazos, cargadoresPorId, turnosPorId, cortejosPorId }) {
  return (brazos || [])
    .map((brazo) => {
      const turno = turnosPorId[brazo.turno_id] || null;
      const cortejo = turno ? cortejosPorId[turno.cortejo_id] : null;
      const cargador = brazo.cargador_id ? cargadoresPorId[brazo.cargador_id] : null;
      return {
        brazo,
        turno,
        cortejo,
        cargador,
        numero_turno: brazo.numero_turno ?? turno?.numero_turno,
        honor: turno?.etiqueta || labelTipoTurno(turno?.tipo_turno),
        tipo_turno: turno?.tipo_turno,
        procesion: cortejo?.nombre_evento || '—',
        procesion_activa: cortejo?.estado === 'activa',
        estadoLabel: etiquetaEstadoAsignacion(brazo),
        estadoClass: claseEstadoAsignacion(brazo),
      };
    })
    .sort(
      (a, b) =>
        (a.procesion || '').localeCompare(b.procesion || '', 'es') ||
        (a.numero_turno || 0) - (b.numero_turno || 0) ||
        (a.brazo.numero_brazo || 0) - (b.brazo.numero_brazo || 0)
    );
}
