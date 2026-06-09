import { crearStoreInicial, DEMO_EMAIL_CONFIG } from '../data/mockData';
import {
  construirTurnosConfig,
  crearBrazosParaTurno,
  agruparTurnosConBrazos,
} from '../utils/turnoUtils';
import {
  normalizarLado,
  brazosElegiblesParaApartado,
  combinarNombreDevoto,
  resolverTurnoEnLista,
} from '../utils/importReservasUtils';
import { isValidCui, normalizarCui } from '../utils/cuiUtils';
import { aplicarAsignacionBrazos } from '../utils/aplicarAsignacionBrazos';
import { RESET_BRAZO_VENTA, normalizarCodigoBoleta } from '../utils/ventaAnulacionUtils';
import { normalizarHoraInput, calcularHoraTurno } from '../utils/turnoHorarioUtils';

let store = crearStoreInicial();
const listeners = new Set();

function emit(event, payload) {
  listeners.forEach((fn) => fn(event, payload));
}

export function getStore() {
  return store;
}

export function resetStore() {
  store = crearStoreInicial();
  emit('reset', store);
}

export function subscribeMock(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function getBrazosByOrg(organizacionId) {
  return store.brazos.filter((b) => b.organizacion_id === organizacionId);
}

export function getBrazosVendidosByOrg(organizacionId) {
  return store.brazos.filter((b) => b.organizacion_id === organizacionId && b.estado === 'vendido');
}

export function getCortejosByOrg(organizacionId, { incluirInactivas = false } = {}) {
  return store.cortejos.filter((c) => {
    if (c.organizacion_id !== organizacionId) return false;
    if (!incluirInactivas && c.estado === 'inactiva') return false;
    return true;
  });
}

function getTurnoIdsDeCortejosActivos(organizacionId) {
  const activos = getCortejosByOrg(organizacionId);
  const ids = new Set(activos.map((c) => c.id));
  return store.turnos.filter((t) => ids.has(t.cortejo_id)).map((t) => t.id);
}

export function desactivarProcesionMock(cortejoId, organizacionId) {
  const cortejo = store.cortejos.find(
    (c) => c.id === cortejoId && c.organizacion_id === organizacionId
  );
  if (!cortejo) return { error: 'Procesión no encontrada' };

  store.cortejos = store.cortejos.map((c) =>
    c.id === cortejoId ? { ...c, estado: 'inactiva' } : c
  );
  emit('procesion:actualizada', { cortejoId, estado: 'inactiva' });
  return { ok: true };
}

export function activarProcesionMock(cortejoId, organizacionId) {
  const cortejo = store.cortejos.find(
    (c) => c.id === cortejoId && c.organizacion_id === organizacionId
  );
  if (!cortejo) return { error: 'Procesión no encontrada' };

  store.cortejos = store.cortejos.map((c) =>
    c.id === cortejoId ? { ...c, estado: 'activa' } : c
  );
  emit('procesion:actualizada', { cortejoId, estado: 'activa' });
  return { ok: true };
}

export function eliminarProcesionMock(cortejoId, organizacionId) {
  const cortejo = store.cortejos.find(
    (c) => c.id === cortejoId && c.organizacion_id === organizacionId
  );
  if (!cortejo) return { error: 'Procesión no encontrada' };

  const turnoIds = store.turnos
    .filter((t) => t.cortejo_id === cortejoId)
    .map((t) => t.id);

  store.cortejos = store.cortejos.filter((c) => c.id !== cortejoId);
  store.turnos = store.turnos.filter((t) => t.cortejo_id !== cortejoId);
  store.brazos = store.brazos.filter((b) => !turnoIds.includes(b.turno_id));

  emit('procesion:eliminada', { cortejoId });
  return { ok: true };
}

function claveBrazoMock(b) {
  return `${b.numero_turno}|${b.numero_brazo}|${b.lado}`;
}

function camposApartadoCopiadosMock(brazoOrigen) {
  if (!brazoOrigen?.reserva_apartado || brazoOrigen.estado === 'vendido') return {};
  return {
    estado: 'reservado',
    reserva_apartado: true,
    asignado_nombre: brazoOrigen.asignado_nombre || null,
    apartado_notas: brazoOrigen.apartado_notas || null,
    cargador_id: brazoOrigen.cargador_id || null,
  };
}

export function duplicarProcesionMock(cortejoOrigenId, datos, organizacionId) {
  const nombre = datos?.nombre_evento?.trim();
  if (!nombre) return { error: 'Indique un nombre para la copia.' };

  const origen = store.cortejos.find(
    (c) => c.id === cortejoOrigenId && c.organizacion_id === organizacionId
  );
  if (!origen) return { error: 'Procesión no encontrada.' };

  const turnosOrigen = getTurnosByCortejo(cortejoOrigenId);
  if (!turnosOrigen.length) return { error: 'La procesión no tiene turnos para copiar.' };

  const turnoIdsOrigen = new Set(turnosOrigen.map((t) => t.id));
  const brazosOrigen = store.brazos.filter(
    (b) => b.organizacion_id === organizacionId && turnoIdsOrigen.has(b.turno_id)
  );
  const brazosPorClave = new Map(brazosOrigen.map((b) => [claveBrazoMock(b), b]));

  const ts = Date.now();
  const nuevoCortejo = {
    id: `cortejo-${ts}`,
    organizacion_id: organizacionId,
    nombre_evento: nombre,
    fecha: datos?.fecha || origen.fecha,
    descripcion: origen.descripcion,
    estado: 'activa',
    config_procesion: {
      ...(origen.config_procesion || {}),
      fuente: 'duplicado',
      duplicadoDe: cortejoOrigenId,
    },
  };
  store.cortejos.push(nuevoCortejo);

  const nuevosTurnos = [];
  const nuevosBrazos = [];

  turnosOrigen.forEach((turnoOrigen, i) => {
    const turnoId = `turno-${ts}-${i}`;
    nuevosTurnos.push({
      id: turnoId,
      organizacion_id: organizacionId,
      cortejo_id: nuevoCortejo.id,
      numero_turno: turnoOrigen.numero_turno,
      tipo_turno: turnoOrigen.tipo_turno,
      etiqueta: turnoOrigen.etiqueta,
      total_brazos: turnoOrigen.total_brazos,
      precio: turnoOrigen.precio,
      son: turnoOrigen.son,
      alabado: turnoOrigen.alabado,
      hora_estimada: turnoOrigen.hora_estimada || null,
    });

    const brazos = crearBrazosParaTurno({
      turnoId,
      numeroTurno: turnoOrigen.numero_turno,
      totalBrazos: turnoOrigen.total_brazos,
      organizacionId,
      idPrefix: `brazo-${ts}`,
    }).map((b) => {
      const origenBrazo = brazosPorClave.get(claveBrazoMock(b));
      return { ...b, ...camposApartadoCopiadosMock(origenBrazo) };
    });
    nuevosBrazos.push(...brazos);
  });

  store.turnos.push(...nuevosTurnos);
  store.brazos.push(...nuevosBrazos);
  emit('matriz', { cortejo: nuevoCortejo, turnos: nuevosTurnos, brazos: nuevosBrazos });
  emit('procesion:creada', { cortejo: nuevoCortejo });

  try {
    sessionStorage.setItem('vtd_ultimo_cortejo', nuevoCortejo.id);
  } catch (_) {
    /* ignore */
  }

  return { cortejo: nuevoCortejo, turnos: nuevosTurnos, brazos: nuevosBrazos };
}

export function getTurnosByCortejo(cortejoId) {
  return store.turnos
    .filter((t) => t.cortejo_id === cortejoId)
    .sort((a, b) => a.numero_turno - b.numero_turno);
}

export function getTurnosByIdsMock(turnoIds) {
  const ids = new Set((turnoIds || []).filter(Boolean));
  const map = {};
  store.turnos.forEach((t) => {
    if (ids.has(t.id)) map[t.id] = t;
  });
  return map;
}

export function updateTurnoMock(organizacionId, turnoId, datos) {
  const idx = store.turnos.findIndex(
    (t) => t.id === turnoId && t.organizacion_id === organizacionId
  );
  if (idx === -1) return { error: 'Turno no encontrado.' };

  const actualizado = {
    ...store.turnos[idx],
    etiqueta: datos.etiqueta?.trim() || null,
    son: datos.son?.trim() || null,
    alabado: datos.alabado?.trim() || null,
  };
  if (datos.hora_estimada !== undefined) {
    actualizado.hora_estimada = normalizarHoraInput(datos.hora_estimada);
  }
  store.turnos[idx] = actualizado;
  emit('turno:actualizado', { turno: actualizado });
  return { data: actualizado };
}

export function actualizarHorarioProcesionMock(organizacionId, cortejoId, { horaInicio, minutosEntreTurnos }) {
  if (!horaInicio?.trim()) return { error: 'Indique la hora de inicio.' };
  const gap = Math.max(1, Number(minutosEntreTurnos) || 5);
  const sorted = getTurnosByCortejo(cortejoId).filter((t) => t.organizacion_id === organizacionId);
  if (!sorted.length) return { error: 'No hay turnos en esta procesión.' };

  sorted.forEach((t, i) => {
    const idx = store.turnos.findIndex((x) => x.id === t.id);
    if (idx === -1) return;
    store.turnos[idx] = {
      ...store.turnos[idx],
      hora_estimada: calcularHoraTurno(horaInicio, gap, i),
    };
  });
  emit('turno:actualizado', { cortejoId });
  return { data: { actualizados: sorted.length } };
}

export function agregarTurnoProcesionMock(organizacionId, cortejoId, datos) {
  const numero = Number(datos.numero_turno);
  if (!Number.isInteger(numero) || numero < 1) {
    return { error: 'Indique un número de turno válido (entero ≥ 1).' };
  }

  const cortejo = store.cortejos.find(
    (c) => c.id === cortejoId && c.organizacion_id === organizacionId
  );
  if (!cortejo) return { error: 'Procesión no encontrada.' };

  const existentes = getTurnosByCortejo(cortejoId);
  if (existentes.some((t) => t.numero_turno === numero)) {
    return { error: `Ya existe el turno #${numero} en esta procesión.` };
  }

  const totalBrazos = Number(datos.total_brazos) || 0;
  if (totalBrazos <= 0 || totalBrazos % 2 !== 0) {
    return { error: 'El total de brazos debe ser par y mayor que 0.' };
  }

  const ts = Date.now();
  const turnoId = `turno-add-${ts}`;
  const turno = {
    id: turnoId,
    organizacion_id: organizacionId,
    cortejo_id: cortejoId,
    numero_turno: numero,
    tipo_turno: datos.tipo_turno?.trim() || 'Ordinario',
    etiqueta: datos.etiqueta?.trim() || null,
    total_brazos: totalBrazos,
    precio: Number(datos.precio) || 0,
    son: datos.son?.trim() || null,
    alabado: datos.alabado?.trim() || null,
  };

  const brazos = crearBrazosParaTurno({
    turnoId,
    numeroTurno: numero,
    totalBrazos,
    organizacionId,
    idPrefix: `brazo-add-${ts}`,
  });

  store.turnos.push(turno);
  store.brazos.push(...brazos);
  emit('turno:actualizado', { turno });
  emit('matriz', { cortejoId, turno, brazos });
  return { data: turno, brazos };
}

export function getTurnosAgrupados(cortejoId, organizacionId) {
  const turnos = getTurnosByCortejo(cortejoId);
  const brazos = getBrazosByOrg(organizacionId).filter((b) =>
    turnos.some((t) => t.id === b.turno_id)
  );
  const cargadoresPorId = Object.fromEntries(
    getCargadoresByOrg(organizacionId).map((c) => [c.id, c])
  );
  const brazosEnriquecidos = brazos.map((b) => ({
    ...b,
    cargador: cargadoresPorId[b.cargador_id] || null,
  }));
  return agruparTurnosConBrazos(turnos, brazosEnriquecidos);
}

export function getCargadoresByOrg(organizacionId) {
  return store.cargadores.filter((c) => c.organizacion_id === organizacionId);
}

export function updateDevotoMock(organizacionId, cargadorId, datos) {
  if (!cargadorId) return { error: 'Devoto no válido.' };

  const idx = store.cargadores.findIndex(
    (c) => c.id === cargadorId && c.organizacion_id === organizacionId
  );
  if (idx === -1) return { error: 'Devoto(a) no encontrado(a).' };

  const whatsapp = String(datos.whatsapp || '').replace(/\D/g, '');
  const cuiNorm = normalizarCui(datos.cui_o_identificacion);

  if (!datos.nombre_completo?.trim()) {
    return { error: 'Nombre del devoto(a) obligatorio.' };
  }
  if (!isValidCui(cuiNorm)) {
    return { error: 'Ingrese un CUI válido (13 dígitos).' };
  }
  if (!/^502[0-9]{8}$/.test(whatsapp)) {
    return { error: 'WhatsApp inválido (+502 y 8 dígitos).' };
  }

  const otroCui = buscarCargadorPorCui(organizacionId, cuiNorm);
  if (otroCui && otroCui.id !== cargadorId) {
    return { error: 'Ese CUI ya está registrado en otro devoto(a).' };
  }

  const otroWa = buscarCargadorPorWhatsapp(organizacionId, whatsapp);
  if (otroWa && otroWa.id !== cargadorId) {
    return { error: 'Ese WhatsApp ya está registrado en otro devoto(a).' };
  }

  const actualizado = {
    ...store.cargadores[idx],
    nombre_completo: datos.nombre_completo.trim(),
    whatsapp,
    correo: datos.correo?.trim() || '',
    cui_o_identificacion: cuiNorm,
    telefono_emergencia: datos.telefono_emergencia?.replace(/\D/g, '') || '',
  };

  store.cargadores[idx] = actualizado;
  emit('devoto:actualizado', { cargador: actualizado });
  return { data: actualizado };
}

export function getEmailConfig(organizacionId) {
  const raw = store.emailConfig?.[organizacionId];
  if (!raw) return null;
  const { gmail_app_password, ...pub } = raw;
  return pub;
}

export function saveEmailConfig(organizacionId, config) {
  if (!store.emailConfig) store.emailConfig = { ...DEMO_EMAIL_CONFIG };
  const prev = store.emailConfig[organizacionId] || {};
  const nuevaPass = config.gmail_app_password?.replace(/\s/g, '');
  const next = {
    ...prev,
    correo_remitente: config.correo_remitente,
    nombre_remitente: config.nombre_remitente,
    correo_respuesta: config.correo_respuesta,
    notificaciones_activas: config.notificaciones_activas !== false,
    pie_correo: config.pie_correo,
    leyenda_correo: config.leyenda_correo?.trim() || null,
    correo_fecha_entrega: config.correo_fecha_entrega?.trim() || null,
    correo_horario_entrega: config.correo_horario_entrega?.trim() || null,
    gmail_smtp_user: config.gmail_smtp_user?.trim() || config.correo_remitente?.trim(),
  };
  if (nuevaPass) {
    next.gmail_app_password = nuevaPass;
    next.gmail_password_configurada = true;
  }
  store.emailConfig[organizacionId] = next;
  emit('email:config', { organizacionId });
  const { gmail_app_password, ...pub } = next;
  return pub;
}

export function getReciboConfig(organizacionId) {
  return store.reciboConfig?.[organizacionId] || null;
}

export function saveReciboConfig(organizacionId, { formato, diseño }) {
  if (!store.reciboConfig) store.reciboConfig = {};
  store.reciboConfig[organizacionId] = {
    organizacion_id: organizacionId,
    formato: formato || 'termico_80',
    diseño: diseño || {},
  };
  emit('recibo:config', { organizacionId });
  return { data: store.reciboConfig[organizacionId] };
}

export function registrarCorreoEnviadoMock(organizacionId, datos) {
  if (!store.correosEnviados) store.correosEnviados = {};
  if (!store.correosEnviados[organizacionId]) store.correosEnviados[organizacionId] = [];
  const registro = { id: `mail-${Date.now()}`, ...datos };
  store.correosEnviados[organizacionId].push(registro);
  emit('email:enviado', registro);
  return registro;
}

export function getCorreosEnviadosMock(organizacionId) {
  return store.correosEnviados?.[organizacionId] || [];
}

/** Busca boleta vendida por código QR o recibo VR- (solo organización activa del usuario). */
export function buscarBoletaPorCodigo(organizacionId, codigo) {
  const codigoLimpio =
    String(codigo || '')
      .trim()
      .toUpperCase()
      .match(/V[RT]-[A-Z0-9]+/)?.[0] || String(codigo || '').trim().toUpperCase();

  if (!codigoLimpio) {
    return { error: 'Código de boleta inválido.' };
  }

  if (/^VR-[A-Z0-9]+$/.test(codigoLimpio)) {
    const compra = (store.compras || []).find(
      (c) => c.organizacion_id === organizacionId && c.codigo_recibo === codigoLimpio
    );
    if (!compra) {
      return { error: 'Boleta no encontrada o no corresponde a esta organización.' };
    }
    if (compra.estado === 'anulada') {
      return { error: 'Esta boleta ya fue anulada.' };
    }
    const brazos = store.brazos.filter(
      (b) => b.compra_id === compra.id && b.estado === 'vendido'
    );
    if (!brazos.length) {
      return { error: 'Boleta no encontrada o no corresponde a esta organización.' };
    }
    const brazo = brazos[0];
    const turno = store.turnos.find((t) => t.id === brazo.turno_id);
    const cortejo = store.cortejos.find((c) => c.id === turno?.cortejo_id);
    const cargador = store.cargadores.find((c) => c.id === brazo.cargador_id);
    if (cortejo?.estado === 'inactiva') {
      return { error: 'La procesión de esta boleta está inactiva.' };
    }
    const items = brazos.map((b) => ({
      brazo: b,
      turno: store.turnos.find((t) => t.id === b.turno_id),
    }));
    return { brazo, brazos, compra, turno, cortejo, cargador, items };
  }

  const brazo = store.brazos.find(
    (b) =>
      b.organizacion_id === organizacionId &&
      b.codigo_boleta_qr?.toUpperCase() === codigoLimpio &&
      b.estado === 'vendido'
  );

  if (!brazo) {
    return { error: 'Boleta no encontrada o no corresponde a esta organización.' };
  }

  let brazos = [brazo];
  let compra = null;
  if (brazo.compra_id) {
    compra = (store.compras || []).find((c) => c.id === brazo.compra_id) || null;
    const delCompra = store.brazos.filter(
      (b) => b.compra_id === brazo.compra_id && b.estado === 'vendido'
    );
    if (delCompra.length) brazos = delCompra;
  }

  const turno = store.turnos.find((t) => t.id === brazo.turno_id);
  const cortejo = store.cortejos.find((c) => c.id === turno?.cortejo_id);
  const cargador = store.cargadores.find((c) => c.id === brazo.cargador_id);

  if (cortejo?.estado === 'inactiva') {
    return { error: 'La procesión de esta boleta está inactiva.' };
  }

  const items = brazos.map((b) => ({
    brazo: b,
    turno: store.turnos.find((t) => t.id === b.turno_id),
  }));

  return { brazo, brazos, compra, turno, cortejo, cargador, items };
}

export function anularVentaPorCodigoMock(organizacionId, codigo, motivo = '') {
  const codigoLimpio = normalizarCodigoBoleta(codigo);
  if (!codigoLimpio || !/^V[RT]-[A-Z0-9]+$/.test(codigoLimpio)) {
    return { error: 'Código de boleta inválido.' };
  }
  if (!motivo?.trim()) {
    return { error: 'Indique el motivo de la anulación.' };
  }

  const preview = buscarBoletaPorCodigo(organizacionId, codigoLimpio);
  if (preview.error) return preview;

  const brazos = preview.brazos || [];
  if (!brazos.length) {
    return { error: 'Boleta no encontrada o ya anulada.' };
  }

  if (brazos.some((b) => b.estado_entrega === 'entregado')) {
    return {
      error: 'No se puede anular: uno o más turnos ya fueron entregados al devoto(a).',
    };
  }

  brazos.forEach((b) => {
    const idx = store.brazos.findIndex((x) => x.id === b.id);
    if (idx === -1) return;
    store.brazos[idx] = { ...store.brazos[idx], ...RESET_BRAZO_VENTA };
    emit('brazos', { eventType: 'UPDATE', new: store.brazos[idx] });
  });

  if (preview.compra?.id) {
    const cIdx = (store.compras || []).findIndex((c) => c.id === preview.compra.id);
    if (cIdx !== -1) {
      store.compras[cIdx] = {
        ...store.compras[cIdx],
        estado: 'anulada',
        anulada_en: new Date().toISOString(),
        motivo_anulacion: motivo.trim(),
      };
    }
  }

  return {
    data: {
      codigo: codigoLimpio,
      brazos_liberados: brazos.length,
      compra_id: preview.compra?.id || null,
      motivo: motivo.trim(),
    },
  };
}

/** Marca el turno físico como entregado tras validar QR. */
export function marcarEntregadoMock(brazoId, organizacionId, usuarioId) {
  const brazo = store.brazos.find(
    (b) => b.id === brazoId && b.organizacion_id === organizacionId && b.estado === 'vendido'
  );

  if (!brazo) return { error: 'Boleta no válida' };
  if (brazo.estado_entrega === 'entregado') {
    return { error: 'Este turno ya fue entregado anteriormente.' };
  }

  const actualizado = {
    ...brazo,
    estado_entrega: 'entregado',
    entregado_en: new Date().toISOString(),
    entregado_por: usuarioId,
  };

  store.brazos = store.brazos.map((b) => (b.id === brazoId ? actualizado : b));
  emit('brazos', { eventType: 'UPDATE', new: actualizado });
  emit('entrega:confirmada', { brazo: actualizado });
  return { data: actualizado };
}

export function buscarCargadorPorCui(organizacionId, cui) {
  const limpio = String(cui || '').replace(/\D/g, '');
  if (!limpio) return null;
  return store.cargadores.find(
    (c) =>
      c.organizacion_id === organizacionId &&
      String(c.cui_o_identificacion || '').replace(/\D/g, '') === limpio
  );
}

export function buscarCargadorPorWhatsapp(organizacionId, whatsapp) {
  const limpio = whatsapp.replace(/\D/g, '');
  return store.cargadores.find(
    (c) => c.organizacion_id === organizacionId && c.whatsapp === limpio
  );
}

export function reservarBrazoMock(brazoId, mesaId, vendedorId, organizacionId) {
  const brazo = store.brazos.find(
    (b) => b.id === brazoId && b.organizacion_id === organizacionId
  );
  if (!brazo) return { error: 'Espacio no encontrado' };

  const expirado =
    brazo.estado === 'reservado' &&
    brazo.bloqueado_hasta &&
    new Date(brazo.bloqueado_hasta) < new Date();

  if (brazo.estado === 'reservado' && brazo.reserva_apartado) {
    return { error: 'Espacio apartado por importación. Continúe la venta desde taquilla.' };
  }

  if (brazo.estado !== 'disponible' && !expirado) {
    return { error: 'El espacio no está disponible' };
  }

  const actualizado = {
    ...brazo,
    estado: 'reservado',
    bloqueado_hasta: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    mesa_id: mesaId,
    vendedor_id: vendedorId,
  };

  store.brazos = store.brazos.map((b) => (b.id === brazoId ? actualizado : b));
  emit('brazos', { eventType: 'UPDATE', new: actualizado });
  return { data: actualizado };
}

export function confirmarVentaMock(brazoId, cargadorData, precioPagado, organizacionId, pagoData = {}) {
  const brazo = store.brazos.find(
    (b) => b.id === brazoId && b.organizacion_id === organizacionId
  );
  if (!brazo || brazo.estado !== 'reservado') {
    return { error: 'Reserva no válida' };
  }

  const whatsappReq = cargadorData.whatsapp?.replace(/\D/g, '');
  const cuiNorm = String(cargadorData.cui_o_identificacion || '').replace(/\D/g, '');
  if (!whatsappReq || whatsappReq.length < 11) {
    return { error: 'WhatsApp obligatorio para confirmar la venta' };
  }
  if (cuiNorm.length !== 13) {
    return { error: 'Ingrese un CUI válido (13 dígitos).' };
  }

  let cargador = buscarCargadorPorCui(organizacionId, cuiNorm);
  const porWhatsapp = buscarCargadorPorWhatsapp(organizacionId, cargadorData.whatsapp);
  if (cargador && porWhatsapp && cargador.id !== porWhatsapp.id) {
    return {
      error:
        'Este CUI y este WhatsApp están registrados en devotos distintos. Verifique los datos.',
    };
  }
  if (!cargador) cargador = porWhatsapp;

  if (!cargador) {
    cargador = {
      id: `carg-${Date.now()}`,
      organizacion_id: organizacionId,
      ...cargadorData,
      whatsapp: whatsappReq,
      cui_o_identificacion: cuiNorm,
      correo: cargadorData.correo?.trim() || '',
    };
    store.cargadores.push(cargador);
  } else {
    cargador = {
      ...cargador,
      nombre_completo: cargadorData.nombre_completo || cargador.nombre_completo,
      whatsapp: whatsappReq,
      correo: cargadorData.correo || cargador.correo,
      cui_o_identificacion: cuiNorm,
      telefono_emergencia: cargadorData.telefono_emergencia || cargador.telefono_emergencia,
    };
    store.cargadores = store.cargadores.map((c) =>
      c.id === cargador.id ? cargador : c
    );
  }

  const codigo = `VT-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
  const actualizado = {
    ...brazo,
    estado: 'vendido',
    cargador_id: cargador.id,
    precio_pagado: precioPagado,
    codigo_boleta_qr: codigo,
    bloqueado_hasta: null,
    reserva_apartado: false,
    asignado_nombre: null,
    apartado_notas: null,
    estado_entrega: 'pendiente',
    entregado_en: null,
    entregado_por: null,
    metodo_pago: pagoData?.metodo_pago || 'efectivo',
    comprobante_url: pagoData?.comprobante_url || null,
    pago_confirmado_en: new Date().toISOString(),
  };

  store.brazos = store.brazos.map((b) => (b.id === brazoId ? actualizado : b));
  emit('brazos', { eventType: 'UPDATE', new: actualizado });
  return { data: actualizado, cargador, codigo };
}

function upsertCargadorVentaMock(organizacionId, cargadorData) {
  const whatsappReq = cargadorData.whatsapp?.replace(/\D/g, '');
  const cuiNorm = String(cargadorData.cui_o_identificacion || '').replace(/\D/g, '');
  if (!whatsappReq || whatsappReq.length < 11) {
    return { error: 'WhatsApp obligatorio para confirmar la venta' };
  }
  if (cuiNorm.length !== 13) {
    return { error: 'Ingrese un CUI válido (13 dígitos).' };
  }

  let cargador = buscarCargadorPorCui(organizacionId, cuiNorm);
  const porWhatsapp = buscarCargadorPorWhatsapp(organizacionId, cargadorData.whatsapp);
  if (cargador && porWhatsapp && cargador.id !== porWhatsapp.id) {
    return {
      error:
        'Este CUI y este WhatsApp están registrados en devotos distintos. Verifique los datos.',
    };
  }
  if (!cargador) cargador = porWhatsapp;

  if (!cargador) {
    cargador = {
      id: `carg-${Date.now()}`,
      organizacion_id: organizacionId,
      ...cargadorData,
      whatsapp: whatsappReq,
      cui_o_identificacion: cuiNorm,
      correo: cargadorData.correo?.trim() || '',
    };
    store.cargadores.push(cargador);
  } else {
    cargador = {
      ...cargador,
      nombre_completo: cargadorData.nombre_completo || cargador.nombre_completo,
      whatsapp: whatsappReq,
      correo: cargadorData.correo || cargador.correo,
      cui_o_identificacion: cuiNorm,
      telefono_emergencia: cargadorData.telefono_emergencia || cargador.telefono_emergencia,
    };
    store.cargadores = store.cargadores.map((c) =>
      c.id === cargador.id ? cargador : c
    );
  }
  return { cargador };
}

export function confirmarVentaCompraMock(
  brazoIds,
  cargadorData,
  precios,
  organizacionId,
  pagoData = {}
) {
  const ids = Array.isArray(brazoIds) ? brazoIds : [];
  if (!ids.length) return { error: 'Seleccione al menos un turno' };

  const upsert = upsertCargadorVentaMock(organizacionId, cargadorData);
  if (upsert.error) return upsert;
  const { cargador } = upsert;

  const brazosVenta = [];
  let total = 0;

  for (let i = 0; i < ids.length; i += 1) {
    const brazoId = ids[i];
    const brazo = store.brazos.find(
      (b) => b.id === brazoId && b.organizacion_id === organizacionId
    );
    if (!brazo || brazo.estado !== 'reservado') {
      return { error: 'Uno o más espacios ya no están reservados. Actualice la taquilla.' };
    }
    const precio = Number(precios[i] ?? 0);
    total += precio;
    brazosVenta.push({ brazo, precio });
  }

  const compraId = `compra-${Date.now()}`;
  const codigoRecibo = `VR-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
  const compra = {
    id: compraId,
    organizacion_id: organizacionId,
    cargador_id: cargador.id,
    codigo_recibo: codigoRecibo,
    total_pagado: total,
    metodo_pago: pagoData?.metodo_pago || 'efectivo',
    comprobante_url: pagoData?.comprobante_url || null,
    pago_confirmado_en: new Date().toISOString(),
    vendedor_id: pagoData?.vendedor_id || null,
    mesa_id: pagoData?.mesa_id || null,
    operador_nombre: (pagoData?.operador_nombre || '').trim() || null,
  };
  store.compras = store.compras || [];
  store.compras.push(compra);

  const brazosActualizados = brazosVenta.map(({ brazo, precio }) => {
    const codigo = `VT-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
    return {
      ...brazo,
      estado: 'vendido',
      cargador_id: cargador.id,
      precio_pagado: precio,
      codigo_boleta_qr: codigo,
      compra_id: compraId,
      bloqueado_hasta: null,
      reserva_apartado: false,
      asignado_nombre: null,
      apartado_notas: null,
      estado_entrega: 'pendiente',
      entregado_en: null,
      entregado_por: null,
      metodo_pago: pagoData?.metodo_pago || 'efectivo',
      comprobante_url: pagoData?.comprobante_url || null,
      pago_confirmado_en: compra.pago_confirmado_en,
      vendedor_id: pagoData?.vendedor_id || null,
      mesa_id: pagoData?.mesa_id || null,
      operador_nombre: compra.operador_nombre,
    };
  });

  store.brazos = store.brazos.map((b) => {
    const upd = brazosActualizados.find((x) => x.id === b.id);
    return upd || b;
  });
  brazosActualizados.forEach((b) => emit('brazos', { eventType: 'UPDATE', new: b }));

  return {
    compra,
    brazos: brazosActualizados,
    cargador,
    codigo: codigoRecibo,
    data: brazosActualizados[0],
  };
}

export function getComprasByOrgMock(organizacionId) {
  return (store.compras || []).filter((c) => c.organizacion_id === organizacionId);
}

/** Genera procesión: turno 1 salida, último entrada, extraordinarios en posiciones elegidas */
export function generarProcesionMock(cortejo, configProcesion, organizacionId) {
  const turnosPlan =
    configProcesion?.turnosPlan?.length > 0
      ? configProcesion.turnosPlan
      : construirTurnosConfig(configProcesion);
  const ts = Date.now();

  const nuevoCortejo = {
    id: `cortejo-${ts}`,
    organizacion_id: organizacionId,
    estado: 'activa',
    ...cortejo,
  };
  store.cortejos.push(nuevoCortejo);

  const nuevosTurnos = [];
  const nuevosBrazos = [];

  turnosPlan.forEach((cfg, i) => {
    const turnoId = `turno-${ts}-${i}`;
    nuevosTurnos.push({
      id: turnoId,
      organizacion_id: organizacionId,
      cortejo_id: nuevoCortejo.id,
      numero_turno: cfg.numero_turno,
      tipo_turno: cfg.tipo_turno,
      precio: cfg.precio,
      total_brazos: cfg.total_brazos,
      etiqueta: cfg.etiqueta || null,
      son: cfg.son || null,
      alabado: cfg.alabado || null,
    });

    const brazos = aplicarAsignacionBrazos(
      crearBrazosParaTurno({
        turnoId,
        numeroTurno: cfg.numero_turno,
        totalBrazos: cfg.total_brazos,
        organizacionId,
        idPrefix: `brazo-${ts}`,
      }),
      cfg.asignacion
    );
    nuevosBrazos.push(...brazos);
  });

  store.turnos.push(...nuevosTurnos);
  store.brazos.push(...nuevosBrazos);
  emit('matriz', { cortejo: nuevoCortejo, turnos: nuevosTurnos, brazos: nuevosBrazos });
  emit('procesion:creada', { cortejo: nuevoCortejo });

  try {
    sessionStorage.setItem('vtd_ultimo_cortejo', nuevoCortejo.id);
  } catch (_) { /* ignore */ }

  return { cortejo: nuevoCortejo, turnos: nuevosTurnos, brazos: nuevosBrazos };
}

/** @deprecated usar generarProcesionMock */
export function generarMatrizMock(cortejo, turnosConfig, organizacionId) {
  const total = turnosConfig.length || 2;
  return generarProcesionMock(
    cortejo,
    {
      totalTurnos: total,
      brazosDefault: turnosConfig[0]?.brazos_por_turno * 2 || 20,
      precioOrdinario: turnosConfig[0]?.precio || 150,
      precioSalida: turnosConfig[0]?.precio || 150,
      precioEntrada: turnosConfig[0]?.precio || 150,
      turnosExtraordinarios: [],
    },
    organizacionId
  );
}

export function getFinanzasByOrg(organizacionId) {
  const turnoIdsActivos = new Set(getTurnoIdsDeCortejosActivos(organizacionId));
  const brazos = getBrazosByOrg(organizacionId).filter((b) => turnoIdsActivos.has(b.turno_id));
  const vendidos = brazos.filter((b) => b.estado === 'vendido');
  const turnos = store.turnos.filter(
    (t) => t.organizacion_id === organizacionId && turnoIdsActivos.has(t.id)
  );
  const mesas = store.mesas.filter((m) => m.organizacion_id === organizacionId);

  const presupuestoTotal = brazos.reduce((sum, b) => {
    const turno = turnos.find((t) => t.id === b.turno_id);
    return sum + (turno?.precio || 0);
  }, 0);

  const recaudado = vendidos.reduce((sum, b) => sum + Number(b.precio_pagado || 0), 0);

  const porMesa = mesas.map((mesa) => {
    const ventas = vendidos.filter((b) => b.mesa_id === mesa.id);
    return {
      ...mesa,
      ventas: ventas.length,
      total: ventas.reduce((s, b) => s + Number(b.precio_pagado || 0), 0),
    };
  });

  const porVendedor = {};
  const porMetodo = { efectivo: 0, transferencia: 0, tarjeta: 0 };
  const mapaUsuarios = {};
  store.usuarios
    .filter((u) => u.organizacion_id === organizacionId)
    .forEach((u) => {
      const nombre = u.nombre?.trim() || u.email?.trim() || '';
      if (nombre) mapaUsuarios[u.id] = nombre;
    });

  vendidos.forEach((b) => {
    const key = b.vendedor_id || 'sin-asignar';
    const nombre =
      b.operador_nombre?.trim() ||
      (key !== 'sin-asignar' ? mapaUsuarios[key] : '') ||
      'Sin asignar';
    if (!porVendedor[key]) porVendedor[key] = { ventas: 0, total: 0, nombre };
    if (!porVendedor[key].nombre && nombre) porVendedor[key].nombre = nombre;
    porVendedor[key].ventas += 1;
    porVendedor[key].total += Number(b.precio_pagado || 0);
    const metodo = b.metodo_pago || 'efectivo';
    if (porMetodo[metodo] !== undefined) porMetodo[metodo] += Number(b.precio_pagado || 0);
  });

  const ventasEnriquecidas = vendidos.map((b) => {
    const turno = turnos.find((t) => t.id === b.turno_id);
    const cortejo = store.cortejos.find((c) => c.id === turno?.cortejo_id);
    return {
      ...b,
      operador_nombre:
        b.operador_nombre?.trim() ||
        (b.vendedor_id ? mapaUsuarios[b.vendedor_id] : '') ||
        '',
      tipo_turno: turno?.tipo_turno || null,
      turno_etiqueta: turno?.etiqueta || turno?.tipo_turno || '',
      numero_turno: b.numero_turno ?? turno?.numero_turno,
      hora_estimada: turno?.hora_estimada || null,
      fecha_evento: cortejo?.fecha || null,
      cortejo_nombre: cortejo?.nombre_evento || null,
    };
  });

  return {
    totalBrazos: brazos.length,
    vendidos: vendidos.length,
    disponibles: brazos.filter((b) => b.estado === 'disponible').length,
    reservados: brazos.filter((b) => b.estado === 'reservado').length,
    presupuestoTotal,
    recaudado,
    ocupacion: brazos.length ? Math.round((vendidos.length / brazos.length) * 100) : 0,
    porMesa,
    porVendedor,
    porMetodo,
    ventas: ventasEnriquecidas,
    mapaUsuarios,
  };
}

export function getDashboardMetrics(organizacionId) {
  const fin = getFinanzasByOrg(organizacionId);
  const cortejos = getCortejosByOrg(organizacionId);
  return { ...fin, cortejosActivos: cortejos.length };
}

// ── Roles y usuarios (RBAC) ──

export function getRolesByOrg(organizacionId) {
  return store.roles
    .filter((r) => r.organizacion_id === organizacionId)
    .sort((a, b) => (a.es_sistema === b.es_sistema ? 0 : a.es_sistema ? -1 : 1));
}

export function getRolById(rolId, organizacionId) {
  return store.roles.find(
    (r) => r.id === rolId && r.organizacion_id === organizacionId
  );
}

export function getUsuariosByOrg(organizacionId) {
  return store.usuarios
    .filter((u) => u.organizacion_id === organizacionId)
    .map((u) => {
      const rol = getRolById(u.rol_id, organizacionId);
      return { ...u, rol_nombre: rol?.nombre || '—', permisos: rol?.permisos || [] };
    });
}

export function buscarUsuarioLogin(email, password) {
  const emailNorm = email?.trim().toLowerCase();
  const usuario = store.usuarios.find(
    (u) => u.email.toLowerCase() === emailNorm && u.password === password && u.activo !== false
  );
  if (!usuario) return null;
  const rol = getRolById(usuario.rol_id, usuario.organizacion_id);
  if (!rol) return null;
  return { usuario, rol };
}

export function updatePerfilMock(userId, organizacionId, datos) {
  const idx = store.usuarios.findIndex(
    (u) => u.id === userId && u.organizacion_id === organizacionId
  );
  if (idx < 0) return { error: 'Usuario no encontrado.' };

  const actual = store.usuarios[idx];
  const quiereCambiarPass = Boolean(
    datos.passwordActual || datos.passwordNueva || datos.passwordConfirmar
  );

  if (quiereCambiarPass) {
    if (!datos.passwordActual) {
      return { error: 'Indique su contraseña actual.' };
    }
    if (actual.password !== datos.passwordActual) {
      return { error: 'La contraseña actual no es correcta.' };
    }
    if (!datos.passwordNueva || datos.passwordNueva.length < 6) {
      return { error: 'La nueva contraseña debe tener al menos 6 caracteres.' };
    }
    if (datos.passwordNueva !== datos.passwordConfirmar) {
      return { error: 'La confirmación de contraseña no coincide.' };
    }
  }

  store.usuarios[idx] = {
    ...actual,
    nombre: datos.nombre?.trim() || actual.nombre,
    telefono: datos.telefono?.trim() || '',
    cargo: datos.cargo?.trim() || '',
    avatar_url: datos.avatar_url || null,
    ...(quiereCambiarPass ? { password: datos.passwordNueva } : {}),
  };

  emit('usuarios', { eventType: 'UPDATE' });
  return { data: store.usuarios[idx] };
}

export function saveRolMock(organizacionId, datos, rolId = null) {
  const permisos = [...new Set((datos.permisos || []).filter(Boolean))];
  if (permisos.length === 0) {
    return { error: 'El rol debe tener al menos un permiso de pantalla.' };
  }

  if (rolId) {
    const idx = store.roles.findIndex(
      (r) => r.id === rolId && r.organizacion_id === organizacionId
    );
    if (idx < 0) return { error: 'Rol no encontrado.' };
    if (store.roles[idx].es_sistema && !permisos.includes('usuarios')) {
      return { error: 'El rol Administrador debe conservar acceso a Usuarios y roles.' };
    }
    store.roles[idx] = {
      ...store.roles[idx],
      nombre: datos.nombre?.trim() || store.roles[idx].nombre,
      descripcion: datos.descripcion?.trim() || '',
      permisos,
    };
    emit('roles', { eventType: 'UPDATE' });
    return { data: store.roles[idx] };
  }

  const nuevo = {
    id: `rol-${Date.now()}`,
    organizacion_id: organizacionId,
    nombre: datos.nombre?.trim() || 'Nuevo rol',
    descripcion: datos.descripcion?.trim() || '',
    es_sistema: false,
    permisos,
  };
  store.roles.push(nuevo);
  emit('roles', { eventType: 'INSERT', new: nuevo });
  return { data: nuevo };
}

export function deleteRolMock(rolId, organizacionId) {
  const rol = getRolById(rolId, organizacionId);
  if (!rol) return { error: 'Rol no encontrado.' };
  if (rol.es_sistema) return { error: 'No se puede eliminar un rol del sistema.' };
  const enUso = store.usuarios.some((u) => u.rol_id === rolId);
  if (enUso) return { error: 'Hay usuarios con este rol. Reasígnelos antes de eliminar.' };
  store.roles = store.roles.filter((r) => r.id !== rolId);
  emit('roles', { eventType: 'DELETE' });
  return { ok: true };
}

export function saveUsuarioMock(organizacionId, datos, usuarioId = null) {
  const rol = getRolById(datos.rol_id, organizacionId);
  if (!rol) return { error: 'Seleccione un rol válido.' };

  const emailNorm = datos.email?.trim().toLowerCase();
  if (!emailNorm) return { error: 'El correo es obligatorio.' };

  const duplicado = store.usuarios.find(
    (u) => u.email.toLowerCase() === emailNorm && u.id !== usuarioId
  );
  if (duplicado) return { error: 'Ya existe un usuario con ese correo.' };

  if (usuarioId) {
    const idx = store.usuarios.findIndex(
      (u) => u.id === usuarioId && u.organizacion_id === organizacionId
    );
    if (idx < 0) return { error: 'Usuario no encontrado.' };
    const actual = store.usuarios[idx];
    store.usuarios[idx] = {
      ...actual,
      nombre: datos.nombre?.trim() || actual.nombre,
      email: emailNorm,
      rol_id: datos.rol_id,
      activo: datos.activo !== false,
      ...(datos.password?.trim() ? { password: datos.password } : {}),
    };
    emit('usuarios', { eventType: 'UPDATE' });
    return { data: store.usuarios[idx] };
  }

  if (!datos.password?.trim()) {
    return { error: 'La contraseña es obligatoria para usuarios nuevos.' };
  }

  const nuevo = {
    id: `user-${Date.now()}`,
    organizacion_id: organizacionId,
    nombre: datos.nombre?.trim() || 'Usuario',
    email: emailNorm,
    password: datos.password,
    rol_id: datos.rol_id,
    activo: true,
  };
  store.usuarios.push(nuevo);
  emit('usuarios', { eventType: 'INSERT', new: nuevo });
  return { data: nuevo };
}

export function setUsuarioActivoMock(organizacionId, usuario, activo) {
  return saveUsuarioMock(
    organizacionId,
    {
      nombre: usuario.nombre,
      email: usuario.email,
      password: '',
      rol_id: usuario.rol_id,
      activo: activo !== false,
    },
    usuario.id
  );
}

// ── Importación apartados (Excel / CSV) ──

function buscarBrazoPorCoordenadas(cortejoId, organizacionId, numeroTurno, numeroBrazo, lado) {
  const turno = store.turnos.find(
    (t) =>
      t.cortejo_id === cortejoId &&
      t.organizacion_id === organizacionId &&
      t.numero_turno === numeroTurno
  );
  if (!turno) return null;
  return store.brazos.find(
    (b) =>
      b.turno_id === turno.id &&
      b.numero_brazo === numeroBrazo &&
      b.lado === lado
  );
}

function whatsappPlaceholderDesdeCui(cui) {
  const d = normalizarCui(cui);
  if (!isValidCui(d)) return '';
  return `502${d.slice(-8)}`;
}

function upsertCargadorParcial(organizacionId, datos) {
  const cui = normalizarCui(datos.cui || datos.dpi || '');
  const whatsappRaw = datos.whatsapp?.replace(/\D/g, '') || '';
  const whatsapp =
    whatsappRaw.length >= 11 ? whatsappRaw : whatsappPlaceholderDesdeCui(cui);
  const nombreCompleto =
    datos.nombre_completo?.trim() ||
    combinarNombreDevoto(datos.apellido, datos.nombre) ||
    datos.nombre?.trim() ||
    'Sin nombre';

  let cargador = isValidCui(cui) ? buscarCargadorPorCui(organizacionId, cui) : null;
  if (!cargador && whatsapp.length >= 11) {
    cargador = buscarCargadorPorWhatsapp(organizacionId, whatsapp);
  }

  const campos = {
    nombre_completo: nombreCompleto,
    cui_o_identificacion: cui || cargador?.cui_o_identificacion || '',
    whatsapp: whatsapp || cargador?.whatsapp || '',
    correo: datos.correo?.trim() || cargador?.correo || '',
    telefono_emergencia:
      datos.telefono_emergencia?.trim() || cargador?.telefono_emergencia || '',
  };

  if (!cargador && campos.whatsapp) {
    cargador = {
      id: `carg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      organizacion_id: organizacionId,
      ...campos,
    };
    store.cargadores.push(cargador);
    return cargador;
  }

  if (cargador) {
    cargador = { ...cargador, ...campos };
    store.cargadores = store.cargadores.map((c) => (c.id === cargador.id ? cargador : c));
    return cargador;
  }

  return null;
}

function marcarBrazoApartadoMock(brazo, fila, cargador, usuarioId) {
  const nombreSolo =
    fila.nombre_completo?.trim() || fila.nombre?.trim() || cargador?.nombre_completo || null;
  const dpi = normalizarCui(fila.dpi || fila.cui || '');
  const notasBase = fila.notas?.trim() || '';
  const notasDpi = !cargador && isValidCui(dpi) ? `DPI ${dpi}` : '';
  const apartadoNotas = [notasBase, notasDpi].filter(Boolean).join(' · ') || null;
  return {
    ...brazo,
    estado: 'reservado',
    reserva_apartado: true,
    bloqueado_hasta: null,
    cargador_id: cargador?.id || null,
    asignado_nombre: cargador ? null : nombreSolo,
    apartado_notas: apartadoNotas,
    vendedor_id: null,
    mesa_id: null,
  };
}

export function getResumenApartados(cortejoId, organizacionId) {
  const turnos = store.turnos
    .filter((t) => t.cortejo_id === cortejoId && t.organizacion_id === organizacionId)
    .sort((a, b) => a.numero_turno - b.numero_turno);

  return turnos.map((turno) => {
    const brazos = store.brazos.filter((b) => b.turno_id === turno.id);
    const apartados = brazos.filter(
      (b) => b.estado === 'reservado' && b.reserva_apartado
    );
    const vendidos = brazos.filter((b) => b.estado === 'vendido');
    const libres = brazos.filter((b) => b.estado === 'disponible');
    return {
      turno,
      total: brazos.length,
      apartados: apartados.length,
      vendidos: vendidos.length,
      libres: libres.length,
      detalle: apartados.map((b) => {
        const cargador = store.cargadores.find((c) => c.id === b.cargador_id);
        return {
          brazo: b,
          cargador,
          etiqueta:
            cargador?.nombre_completo ||
            b.asignado_nombre ||
            b.apartado_notas ||
            'Apartado',
        };
      }),
    };
  });
}

export function aplicarImportApartadosMock(cortejoId, organizacionId, filas, { usuarioId } = {}) {
  const resultados = [];
  let ok = 0;
  let omitidos = 0;

  const turnos = store.turnos.filter(
    (t) => t.cortejo_id === cortejoId && t.organizacion_id === organizacionId
  );
  const brazosApartadosIds = new Set();

  filas.forEach((fila) => {
    if (fila.modo === 'listado' || (!fila.brazo && fila.cantidad)) {
      const turno = resolverTurnoEnLista(turnos, fila.turno);
      if (!turno) {
        resultados.push({
          fila: fila.filaExcel,
          ok: false,
          mensaje: `No se encontró el turno "${fila.turno}"`,
        });
        omitidos += 1;
        return;
      }

      const cargador = upsertCargadorParcial(organizacionId, fila);
      const pool = store.brazos
        .filter((b) => b.turno_id === turno.id)
        .filter((b) => !brazosApartadosIds.has(b.id));
      const elegibles = brazosElegiblesParaApartado(pool);
      const cantidad = Number(fila.cantidad) || 0;

      if (elegibles.length < cantidad) {
        resultados.push({
          fila: fila.filaExcel,
          ok: false,
          mensaje: `Turno ${turno.numero_turno}: solo hay ${elegibles.length} espacio(s) libre(s), se pidieron ${cantidad}`,
        });
        omitidos += 1;
        return;
      }

      const asignados = elegibles.slice(0, cantidad);
      let filaOk = 0;

      asignados.forEach((brazo) => {
        const actualizado = marcarBrazoApartadoMock(brazo, fila, cargador, usuarioId);
        store.brazos = store.brazos.map((b) => (b.id === brazo.id ? actualizado : b));
        brazosApartadosIds.add(brazo.id);
        filaOk += 1;
        ok += 1;
      });

      if (filaOk > 0) {
        resultados.push({
          fila: fila.filaExcel,
          ok: true,
          mensaje: `${fila.nombre_completo}: ${filaOk} espacio(s) apartado(s) en turno ${turno.numero_turno}`,
        });
      }
      return;
    }

    const numeroTurno = parseInt(fila.turno, 10);
    const numeroBrazo = parseInt(fila.brazo, 10);
    const lado = normalizarLado(fila.lado);

    if (!numeroTurno || !numeroBrazo || !lado) {
      resultados.push({
        fila: fila.filaExcel,
        ok: false,
        mensaje: 'Turno, brazo o lado inválido',
      });
      omitidos += 1;
      return;
    }

    const brazo = buscarBrazoPorCoordenadas(
      cortejoId,
      organizacionId,
      numeroTurno,
      numeroBrazo,
      lado
    );

    if (!brazo) {
      resultados.push({
        fila: fila.filaExcel,
        ok: false,
        mensaje: `No existe turno ${numeroTurno}, brazo ${numeroBrazo} ${lado}`,
      });
      omitidos += 1;
      return;
    }

    if (brazo.estado === 'vendido') {
      resultados.push({
        fila: fila.filaExcel,
        ok: false,
        mensaje: 'Ya está vendido',
      });
      omitidos += 1;
      return;
    }

    const cargador = upsertCargadorParcial(organizacionId, fila);
    const actualizado = marcarBrazoApartadoMock(brazo, fila, cargador, usuarioId);
    store.brazos = store.brazos.map((b) => (b.id === brazo.id ? actualizado : b));
    resultados.push({
      fila: fila.filaExcel,
      ok: true,
      mensaje: `Apartado T${numeroTurno} B${numeroBrazo} ${lado}`,
      brazo: actualizado,
    });
    ok += 1;
  });

  emit('brazos', { eventType: 'IMPORT', cortejoId });
  return { ok, omitidos, total: filas.length, resultados };
}
