import { crearStoreInicial, DEMO_EMAIL_CONFIG } from '../data/mockData';
import {
  construirTurnosConfig,
  crearBrazosParaTurno,
  agruparTurnosConBrazos,
} from '../utils/turnoUtils';
import { normalizarLado } from '../utils/importReservasUtils';

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
      son: cfg.son || null,
      alabado: cfg.alabado || null,
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

function upsertCargadorParcial(organizacionId, datos) {
  const cui = String(datos.cui || '').replace(/\D/g, '');
  const whatsapp = datos.whatsapp?.replace(/\D/g, '');

  let cargador = cui.length === 13 ? buscarCargadorPorCui(organizacionId, cui) : null;
  if (!cargador && whatsapp && whatsapp.length >= 11) {
    cargador = buscarCargadorPorWhatsapp(organizacionId, whatsapp);
  }

  if (whatsapp && whatsapp.length >= 11) {
    if (!cargador) {
      cargador = {
        id: `carg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        organizacion_id: organizacionId,
        nombre_completo: datos.nombre?.trim() || 'Sin nombre',
        whatsapp,
        correo: datos.correo?.trim() || '',
        cui_o_identificacion: cui || '',
        telefono_emergencia: datos.telefono_emergencia?.trim() || '',
      };
      store.cargadores.push(cargador);
    } else {
      cargador = {
        ...cargador,
        nombre_completo: datos.nombre?.trim() || cargador.nombre_completo,
        correo: datos.correo?.trim() || cargador.correo,
        cui_o_identificacion: cui || cargador.cui_o_identificacion,
        telefono_emergencia:
          datos.telefono_emergencia?.trim() || cargador.telefono_emergencia,
        whatsapp: whatsapp || cargador.whatsapp,
      };
      store.cargadores = store.cargadores.map((c) =>
        c.id === cargador.id ? cargador : c
      );
    }
    return cargador;
  }

  if (cargador) return cargador;
  return null;
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

  filas.forEach((fila) => {
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
    const nombreSolo = fila.nombre?.trim() || null;

    const actualizado = {
      ...brazo,
      estado: 'reservado',
      reserva_apartado: true,
      bloqueado_hasta: null,
      cargador_id: cargador?.id || null,
      asignado_nombre: cargador ? null : nombreSolo,
      apartado_notas: fila.notas?.trim() || null,
      vendedor_id: usuarioId || null,
      mesa_id: null,
    };

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
