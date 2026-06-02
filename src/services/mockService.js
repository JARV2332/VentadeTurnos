import { crearStoreInicial, DEMO_EMAIL_CONFIG } from '../data/mockData';
import {
  construirTurnosConfig,
  crearBrazosParaTurno,
  agruparTurnosConBrazos,
} from '../utils/turnoUtils';

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

export function getTurnosByCortejo(cortejoId) {
  return store.turnos.filter((t) => t.cortejo_id === cortejoId);
}

export function getTurnosAgrupados(cortejoId, organizacionId) {
  const turnos = getTurnosByCortejo(cortejoId);
  const brazos = getBrazosByOrg(organizacionId).filter((b) =>
    turnos.some((t) => t.id === b.turno_id)
  );
  return agruparTurnosConBrazos(turnos, brazos);
}

export function getCargadoresByOrg(organizacionId) {
  return store.cargadores.filter((c) => c.organizacion_id === organizacionId);
}

export function getEmailConfig(organizacionId) {
  return store.emailConfig?.[organizacionId] || null;
}

export function saveEmailConfig(organizacionId, config) {
  if (!store.emailConfig) store.emailConfig = { ...DEMO_EMAIL_CONFIG };
  store.emailConfig[organizacionId] = { ...config };
  emit('email:config', { organizacionId });
  return store.emailConfig[organizacionId];
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

/** Busca boleta vendida por código QR (solo organización activa del usuario). */
export function buscarBoletaPorCodigo(organizacionId, codigo) {
  const codigoLimpio = codigo.trim().toUpperCase();
  const brazo = store.brazos.find(
    (b) =>
      b.organizacion_id === organizacionId &&
      b.codigo_boleta_qr?.toUpperCase() === codigoLimpio &&
      b.estado === 'vendido'
  );

  if (!brazo) {
    return { error: 'Boleta no encontrada o no corresponde a esta organización.' };
  }

  const turno = store.turnos.find((t) => t.id === brazo.turno_id);
  const cortejo = store.cortejos.find((c) => c.id === turno?.cortejo_id);
  const cargador = store.cargadores.find((c) => c.id === brazo.cargador_id);

  if (cortejo?.estado === 'inactiva') {
    return { error: 'La procesión de esta boleta está inactiva.' };
  }

  return { brazo, turno, cortejo, cargador };
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

  let cargador = buscarCargadorPorWhatsapp(organizacionId, cargadorData.whatsapp);
  if (!cargador) {
    cargador = {
      id: `carg-${Date.now()}`,
      organizacion_id: organizacionId,
      ...cargadorData,
      whatsapp: cargadorData.whatsapp.replace(/\D/g, ''),
      correo: cargadorData.correo?.trim() || '',
    };
    store.cargadores.push(cargador);
  } else {
    cargador = {
      ...cargador,
      nombre_completo: cargadorData.nombre_completo || cargador.nombre_completo,
      correo: cargadorData.correo || cargador.correo,
      cui_o_identificacion: cargadorData.cui_o_identificacion || cargador.cui_o_identificacion,
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

/** Genera procesión: turno 1 salida, último entrada, extraordinarios en posiciones elegidas */
export function generarProcesionMock(cortejo, configProcesion, organizacionId) {
  const turnosPlan = construirTurnosConfig(configProcesion);
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
    });

    const brazos = crearBrazosParaTurno({
      turnoId,
      numeroTurno: cfg.numero_turno,
      totalBrazos: cfg.total_brazos,
      organizacionId,
      idPrefix: `brazo-${ts}`,
    });
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
  vendidos.forEach((b) => {
    const key = b.vendedor_id || 'sin-asignar';
    if (!porVendedor[key]) porVendedor[key] = { ventas: 0, total: 0 };
    porVendedor[key].ventas += 1;
    porVendedor[key].total += Number(b.precio_pagado || 0);
    const metodo = b.metodo_pago || 'efectivo';
    if (porMetodo[metodo] !== undefined) porMetodo[metodo] += Number(b.precio_pagado || 0);
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
    ventas: vendidos,
  };
}

export function getDashboardMetrics(organizacionId) {
  const fin = getFinanzasByOrg(organizacionId);
  const cortejos = getCortejosByOrg(organizacionId);
  return { ...fin, cortejosActivos: cortejos.length };
}
