/**
 * Capa de datos Supabase (async).
 */
import { supabase, subscribeBrazos } from '../config/supabaseClient';
import {
  agruparTurnosConBrazos,
  construirTurnosConfig,
  crearBrazosParaTurno,
  validarBrazosPares,
  planAjusteBrazos,
  tiposTurnoEditables,
  maxNumeroTurno,
} from '../utils/turnoUtils';
import {
  normalizarLado,
  brazosElegiblesParaApartado,
  combinarNombreDevoto,
  resolverTurnoEnLista,
} from '../utils/importReservasUtils';
import { isValidCui, normalizarCui } from '../utils/cuiUtils';
import { aplicarAsignacionBrazos } from '../utils/aplicarAsignacionBrazos';
import { RESET_BRAZO_VENTA, RESET_BRAZO_APARTADO, esBrazoReservadoLiberable, normalizarCodigoBoleta } from '../utils/ventaAnulacionUtils';
import { PERMISOS_ADMIN_COMPLETO } from '../config/permisos';
import { normalizarHoraInput, calcularHoraTurno } from '../utils/turnoHorarioUtils';
import {
  filtrarCargadoresPorBusqueda,
  apartadoSinCargadorCoincide,
  enriquecerAsignaciones,
  queryValidaBusquedaDevoto,
} from '../utils/consultaDevotoUtils';
import { enriquecerDashboardMetrics } from '../utils/dashboardMetricsUtils';
import { MINUTOS_RESERVA_TAQUILLA_COLGADA } from '../utils/reservasTaquillaUtils';

function err(error) {
  if (!error) return null;
  return { error: error.message || String(error) };
}

function isMissingRpc(error) {
  if (!error) return false;
  const msg = error.message || '';
  const code = error.code || '';
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    /Could not find the function/i.test(msg) ||
    (/not find/i.test(msg) && /function/i.test(msg))
  );
}

function isMissingColumn(error, column) {
  if (!error) return false;
  const msg = error.message || '';
  return (
    error.code === 'PGRST204' ||
    (msg.includes(column) && /column|Could not find/i.test(msg))
  );
}

function sinCamposApartado(brazos) {
  return brazos.map(({ reserva_apartado, apartado_notas, ...b }) => b);
}

const BRAZOS_INSERT_LOTE = 40;
const BRAZOS_INSERT_DELAY_MS = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function esErrorDuplicado(error) {
  if (!error) return false;
  const code = error.code || '';
  const msg = String(error.message || error);
  return code === '23505' || /duplicate key|unique constraint/i.test(msg);
}

function filaBrazoParaInsert(b) {
  const fila = {
    organizacion_id: b.organizacion_id,
    turno_id: b.turno_id,
    numero_turno: b.numero_turno,
    numero_brazo: b.numero_brazo,
    lado: b.lado,
    estado: b.estado || 'disponible',
  };
  if (b.reserva_apartado) {
    fila.reserva_apartado = true;
    if (b.asignado_nombre) fila.asignado_nombre = b.asignado_nombre;
    if (b.apartado_notas) fila.apartado_notas = b.apartado_notas;
    if (b.cargador_id) fila.cargador_id = b.cargador_id;
  }
  return fila;
}

/** Inserta brazos en lotes pequeños (generar procesión). Sin reintentos ciegos. */
async function insertarBrazosEnLotes(brazos, { sinApartado = false, lote = BRAZOS_INSERT_LOTE, delayMs = BRAZOS_INSERT_DELAY_MS } = {}) {
  const filas = (sinApartado ? sinCamposApartado(brazos) : brazos).map(filaBrazoParaInsert);
  for (let i = 0; i < filas.length; i += lote) {
    const chunk = filas.slice(i, i + lote);
    const { error } = await supabase.from('brazos').insert(chunk);
    if (!error) {
      if (delayMs > 0) await sleep(delayMs);
      continue;
    }

    if (
      !sinApartado &&
      (isMissingColumn(error, 'reserva_apartado') || isMissingColumn(error, 'apartado_notas'))
    ) {
      return insertarBrazosEnLotes(brazos, { sinApartado: true, lote, delayMs });
    }

    return error;
  }
  return null;
}

/** Inserción lenta 1×1 para duplicar procesiones grandes sin saturar Supabase. */
async function insertarBrazosUnoAUno(brazos, { sinApartado = false, delayMs = 80 } = {}) {
  const filas = (sinApartado ? sinCamposApartado(brazos) : brazos).map(filaBrazoParaInsert);

  for (let i = 0; i < filas.length; i += 1) {
    const fila = filas[i];
    const { error } = await supabase.from('brazos').insert(fila);

    if (!error) {
      if (delayMs > 0 && i < filas.length - 1) await sleep(delayMs);
      continue;
    }

    if (
      !sinApartado &&
      (isMissingColumn(error, 'reserva_apartado') || isMissingColumn(error, 'apartado_notas'))
    ) {
      return insertarBrazosUnoAUno(brazos, { sinApartado: true, delayMs });
    }

    if (esErrorDuplicado(error)) {
      return error;
    }

    return error;
  }

  return null;
}

async function rollbackCortejoCompleto(cortejoId) {
  const { data: turnos } = await supabase.from('turnos').select('id').eq('cortejo_id', cortejoId);
  const turnoIds = (turnos || []).map((t) => t.id);
  if (turnoIds.length) {
    await supabase.from('brazos').delete().in('turno_id', turnoIds);
  }
  await supabase.from('turnos').delete().eq('cortejo_id', cortejoId);
  await supabase.from('cortejos').delete().eq('id', cortejoId);
}

/** Trae todos los brazos de un cortejo (Supabase limita ~1000 filas por consulta). */
export async function getBrazosByCortejo(cortejoId, organizacionId) {
  const turnos = await getTurnosByCortejo(cortejoId);
  const turnoIds = turnos.map((t) => t.id);
  if (!turnoIds.length) return [];

  const PAGE = 500;
  const all = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('brazos')
      .select('*')
      .eq('organizacion_id', organizacionId)
      .in('turno_id', turnoIds)
      .order('turno_id')
      .order('numero_brazo')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return all;
}

function generarCodigoBoletaCliente() {
  const bytes = new Uint8Array(5);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `VT-${hex.toUpperCase().slice(0, 10)}`;
}

async function reservarBrazoDirecto(brazoId, mesaId, vendedorId) {
  const { data: actual, error: fetchErr } = await supabase
    .from('brazos')
    .select('*')
    .eq('id', brazoId)
    .single();
  if (fetchErr) return err(fetchErr);

  if (actual.reserva_apartado) {
    return { error: 'Espacio apartado por importación' };
  }

  const expirado =
    actual.estado === 'reservado' &&
    actual.bloqueado_hasta &&
    new Date(actual.bloqueado_hasta) < new Date();

  if (actual.estado !== 'disponible' && !expirado) {
    return { error: 'El espacio no está disponible o fue reservado por otra mesa' };
  }

  const bloqueadoHasta = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('brazos')
    .update({
      estado: 'reservado',
      bloqueado_hasta: bloqueadoHasta,
      mesa_id: mesaId || null,
      vendedor_id: vendedorId || null,
    })
    .eq('id', brazoId)
    .select()
    .single();

  if (error) return err(error);
  return { data };
}

async function sincronizarOperadorVenta(compraId, brazoIds, pagoData = {}) {
  const operadorNombre = (pagoData.operador_nombre || '').trim() || null;
  const patch = {
    vendedor_id: pagoData.vendedor_id || null,
    mesa_id: pagoData.mesa_id || null,
    operador_nombre: operadorNombre,
  };

  const actualizar = async (table, builder) => {
    let q = builder(supabase.from(table).update(patch));
    let { error } = await q;
    if (error?.code === '42703') {
      const { operador_nombre: _omit, ...sinOperador } = patch;
      q = builder(supabase.from(table).update(sinOperador));
      ({ error } = await q);
    }
    return error;
  };

  const tareas = [];
  if (compraId) {
    tareas.push(actualizar('compras', (q) => q.eq('id', compraId)));
  }
  if (brazoIds?.length) {
    tareas.push(actualizar('brazos', (q) => q.in('id', brazoIds)));
  }
  await Promise.all(tareas);
}

async function confirmarVentaDirecto(brazoId, cargador, precioPagado, pagoData = {}) {
  const codigo = generarCodigoBoletaCliente();
  const operadorNombre = (pagoData.operador_nombre || '').trim() || null;
  const payload = {
    estado: 'vendido',
    cargador_id: cargador.id,
    precio_pagado: precioPagado,
    codigo_boleta_qr: codigo,
    bloqueado_hasta: null,
    metodo_pago: pagoData.metodo_pago || 'efectivo',
    comprobante_url: pagoData.comprobante_url || null,
    pago_confirmado_en: new Date().toISOString(),
    estado_entrega: 'pendiente',
    reserva_apartado: false,
    vendedor_id: pagoData.vendedor_id || null,
    mesa_id: pagoData.mesa_id || null,
    operador_nombre: operadorNombre,
  };

  const { data: brazo, error } = await supabase
    .from('brazos')
    .update(payload)
    .eq('id', brazoId)
    .eq('estado', 'reservado')
    .select()
    .single();

  if (error) return err(error);
  return { data: brazo, cargador, codigo: brazo.codigo_boleta_qr || codigo };
}

export async function fetchPerfilByAuthId(authUserId) {
  const { data, error } = await supabase
    .from('usuarios_app')
    .select('*')
    .eq('auth_user_id', authUserId)
    .eq('activo', true)
    .maybeSingle();

  if (error) return err(error);
  if (!data) {
    return {
      error:
        'Perfil no encontrado en usuarios_app. Ejecute 007_super_admin.sql y npm run db:seed-super.',
    };
  }

  const user = {
    id: data.id,
    authUserId: data.auth_user_id,
    email: data.email,
    nombre: data.nombre,
    telefono: data.telefono || '',
    cargo: data.cargo || '',
    avatar_url: data.avatar_url || null,
    esSuperAdmin: Boolean(data.es_super_admin),
  };

  if (data.es_super_admin) {
    const orgId = data.organizacion_activa_id;
    let organizacion = null;
    if (orgId) {
      const { data: orgData } = await supabase
        .from('organizaciones')
        .select('*')
        .eq('id', orgId)
        .maybeSingle();
      organizacion = orgData;
    }
    return {
      user,
      esSuperAdmin: true,
      organizacion,
      organizacion_id: orgId,
      rol_id: null,
      rol_nombre: 'Super Administrador',
      permisos: orgId ? [...PERMISOS_ADMIN_COMPLETO, 'plataforma'] : ['plataforma'],
    };
  }

  const { data: rol } = await supabase
    .from('roles_organizacion')
    .select('id, nombre, permisos')
    .eq('id', data.rol_id)
    .maybeSingle();

  const { data: orgData } = await supabase
    .from('organizaciones')
    .select('*')
    .eq('id', data.organizacion_id)
    .maybeSingle();

  return {
    user,
    esSuperAdmin: false,
    organizacion: orgData,
    organizacion_id: data.organizacion_id,
    rol_id: data.rol_id,
    rol_nombre: rol?.nombre,
    permisos: rol?.permisos || [],
  };
}

export async function listOrganizacionesPlataforma() {
  const { data, error } = await supabase
    .from('organizaciones')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function setOrganizacionActiva(orgId) {
  const { data, error } = await supabase.rpc('set_organizacion_activa', {
    p_org_id: orgId,
  });
  if (error) return err(error);
  return { data };
}

export async function crearOrganizacionPlataforma(payload) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { error: 'Sesión expirada' };
  }
  try {
    const res = await fetch('/api/crear-organizacion-plataforma', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { error: json.error || 'Error al crear asociación' };
    return { data: json };
  } catch {
    return { error: 'No se pudo crear la asociación (requiere Vercel + SERVICE_ROLE)' };
  }
}

export async function updatePerfilSupabase(userId, organizacionId, datos, email) {
  const quiereCambiarPass = Boolean(
    datos.passwordActual || datos.passwordNueva || datos.passwordConfirmar
  );

  if (quiereCambiarPass) {
    if (!datos.passwordActual) return { error: 'Indique su contraseña actual.' };
    const { error: signErr } = await supabase.auth.signInWithPassword({
      email,
      password: datos.passwordActual,
    });
    if (signErr) return { error: 'La contraseña actual no es correcta.' };
    if (!datos.passwordNueva || datos.passwordNueva.length < 6) {
      return { error: 'La nueva contraseña debe tener al menos 6 caracteres.' };
    }
    if (datos.passwordNueva !== datos.passwordConfirmar) {
      return { error: 'La confirmación de contraseña no coincide.' };
    }
    const { error: upErr } = await supabase.auth.updateUser({ password: datos.passwordNueva });
    if (upErr) return err(upErr);
  }

  const { data, error } = await supabase
    .from('usuarios_app')
    .update({
      nombre: datos.nombre?.trim(),
      telefono: datos.telefono?.trim() || '',
      cargo: datos.cargo?.trim() || '',
      avatar_url: datos.avatar_url || null,
    })
    .eq('id', userId)
    .eq('organizacion_id', organizacionId)
    .select()
    .single();

  if (error) return err(error);
  return { data };
}

export function subscribeSupabase(organizacionId, callback, debounceMs = 400) {
  if (!organizacionId || typeof callback !== 'function') return () => {};

  let timer = null;
  const debounced = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      callback();
    }, debounceMs);
  };

  const unsub = subscribeBrazos(organizacionId, debounced);
  return () => {
    if (timer) clearTimeout(timer);
    unsub();
  };
}

export async function getCortejosByOrg(organizacionId, { incluirInactivas = false } = {}) {
  let q = supabase.from('cortejos').select('*').eq('organizacion_id', organizacionId);
  if (!incluirInactivas) q = q.eq('estado', 'activa');
  const { data, error } = await q.order('fecha', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getTurnoById(turnoId) {
  if (!turnoId) return null;
  const { data } = await supabase.from('turnos').select('*').eq('id', turnoId).maybeSingle();
  return data;
}

export async function getTurnosByIds(turnoIds) {
  const ids = [...new Set((turnoIds || []).filter(Boolean))];
  if (!ids.length) return {};
  const { data, error } = await supabase.from('turnos').select('*').in('id', ids);
  if (error) throw error;
  return Object.fromEntries((data || []).map((t) => [t.id, t]));
}

export async function updateTurno(organizacionId, turnoId, datos) {
  if (!turnoId) return { error: 'Turno no válido.' };

  const { data: turnoActual, error: fetchErr } = await supabase
    .from('turnos')
    .select('*')
    .eq('id', turnoId)
    .eq('organizacion_id', organizacionId)
    .maybeSingle();
  if (fetchErr) return err(fetchErr);
  if (!turnoActual) return { error: 'Turno no encontrado.' };

  if (datos.tipo_turno !== undefined) {
    const hermanos = await getTurnosByCortejo(turnoActual.cortejo_id);
    const maxNum = maxNumeroTurno(hermanos);
    const permitidos = tiposTurnoEditables(turnoActual.numero_turno, maxNum);
    const tipo = String(datos.tipo_turno).trim();
    if (!permitidos.includes(tipo)) {
      return {
        error: `El turno #${turnoActual.numero_turno} solo puede ser: ${permitidos.join(' o ')}.`,
      };
    }
  }

  const payload = {
    etiqueta: datos.etiqueta?.trim() || null,
    son: datos.son?.trim() || null,
    alabado: datos.alabado?.trim() || null,
  };
  if (datos.tipo_turno !== undefined) payload.tipo_turno = String(datos.tipo_turno).trim();
  if (datos.precio !== undefined) payload.precio = Number(datos.precio) || 0;
  if (datos.total_brazos !== undefined) {
    payload.total_brazos = Number(datos.total_brazos) || turnoActual.total_brazos;
  }
  if (datos.hora_estimada !== undefined) {
    payload.hora_estimada = normalizarHoraInput(datos.hora_estimada);
  }

  const nuevoTotal = payload.total_brazos ?? turnoActual.total_brazos;
  if (Number(nuevoTotal) !== Number(turnoActual.total_brazos)) {
    const { data: brazos, error: brazosErr } = await supabase
      .from('brazos')
      .select('*')
      .eq('turno_id', turnoId)
      .eq('organizacion_id', organizacionId);
    if (brazosErr) return err(brazosErr);

    const plan = planAjusteBrazos(brazos || [], {
      turnoId,
      numeroTurno: turnoActual.numero_turno,
      organizacionId,
      nuevoTotal,
    });
    if (plan.error) return { error: plan.error };

    if (plan.eliminarIds?.length) {
      const { error: delErr } = await supabase.from('brazos').delete().in('id', plan.eliminarIds);
      if (delErr) return err(delErr);
    }
    if (plan.agregar?.length) {
      const bErr = await insertarBrazosEnLotes(plan.agregar);
      if (bErr) {
        return { error: `Error al ajustar brazos del turno: ${bErr.message || bErr}` };
      }
    }
  }

  let { data, error } = await supabase
    .from('turnos')
    .update(payload)
    .eq('id', turnoId)
    .eq('organizacion_id', organizacionId)
    .select()
    .single();

  if (error && datos.hora_estimada !== undefined && isMissingColumn(error, 'hora_estimada')) {
    delete payload.hora_estimada;
    ({ data, error } = await supabase
      .from('turnos')
      .update(payload)
      .eq('id', turnoId)
      .eq('organizacion_id', organizacionId)
      .select()
      .single());
  }

  if (error) return err(error);
  return { data };
}

export async function actualizarHorarioProcesion(organizacionId, cortejoId, { horaInicio, minutosEntreTurnos }) {
  if (!horaInicio?.trim()) return { error: 'Indique la hora de inicio.' };
  const gap = Math.max(1, Number(minutosEntreTurnos) || 5);

  const turnos = await getTurnosByCortejo(cortejoId);
  if (!turnos.length) return { error: 'No hay turnos en esta procesión.' };

  const sorted = [...turnos].sort((a, b) => a.numero_turno - b.numero_turno);
  const updates = sorted.map((t, i) => ({
    id: t.id,
    hora_estimada: calcularHoraTurno(horaInicio, gap, i),
  }));

  for (const u of updates) {
    const { error } = await supabase
      .from('turnos')
      .update({ hora_estimada: u.hora_estimada })
      .eq('id', u.id)
      .eq('organizacion_id', organizacionId);
    if (error) {
      if (isMissingColumn(error, 'hora_estimada')) {
        return {
          error:
            'Falta la columna hora_estimada. Ejecute supabase/019_horario_turno.sql en Supabase.',
        };
      }
      return err(error);
    }
  }

  return { data: { actualizados: updates.length } };
}

export async function agregarTurnoProcesion(organizacionId, cortejoId, datos) {
  const numero = Number(datos.numero_turno);
  if (!Number.isInteger(numero) || numero < 1) {
    return { error: 'Indique un número de turno válido (entero ≥ 1).' };
  }

  const { data: cortejo, error: cErr } = await supabase
    .from('cortejos')
    .select('id')
    .eq('id', cortejoId)
    .eq('organizacion_id', organizacionId)
    .maybeSingle();
  if (cErr) return err(cErr);
  if (!cortejo) return { error: 'Procesión no encontrada.' };

  const existentes = await getTurnosByCortejo(cortejoId);
  if (existentes.some((t) => t.numero_turno === numero)) {
    return { error: `Ya existe el turno #${numero} en esta procesión.` };
  }

  const totalBrazos = Number(datos.total_brazos) || 0;
  if (!validarBrazosPares(totalBrazos)) {
    return { error: 'El total de brazos debe ser par y mayor que 0.' };
  }

  const tipo = datos.tipo_turno?.trim() || 'Ordinario';
  const payload = {
    organizacion_id: organizacionId,
    cortejo_id: cortejoId,
    numero_turno: numero,
    tipo_turno: tipo,
    etiqueta: datos.etiqueta?.trim() || null,
    total_brazos: totalBrazos,
    precio: Number(datos.precio) || 0,
    son: datos.son?.trim() || null,
    alabado: datos.alabado?.trim() || null,
  };

  const { data: turno, error: tErr } = await supabase
    .from('turnos')
    .insert(payload)
    .select()
    .single();
  if (tErr) return err(tErr);

  const brazosTurno = crearBrazosParaTurno({
    turnoId: turno.id,
    numeroTurno: turno.numero_turno,
    totalBrazos,
    organizacionId,
    idPrefix: 'brazo',
  }).map(({ id, ...b }) => b);

  const bErr = await insertarBrazosEnLotes(brazosTurno);
  if (bErr) {
    await supabase.from('turnos').delete().eq('id', turno.id);
    return { error: `Error al crear brazos del turno: ${bErr.message || bErr}` };
  }

  return { data: turno, brazos: brazosTurno };
}

export async function getTurnosByCortejo(cortejoId) {
  const { data, error } = await supabase
    .from('turnos')
    .select('*')
    .eq('cortejo_id', cortejoId)
    .order('numero_turno');
  if (error) throw error;
  return data || [];
}

export async function getBrazosByOrg(organizacionId) {
  const { data, error } = await supabase
    .from('brazos')
    .select('*')
    .eq('organizacion_id', organizacionId);
  if (error) throw error;
  return data || [];
}

/** Solo ventas confirmadas, paginado (Impresión / finanzas). */
export async function getBrazosVendidosByOrg(organizacionId) {
  const PAGE = 500;
  const all = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('brazos')
      .select('*')
      .eq('organizacion_id', organizacionId)
      .eq('estado', 'vendido')
      .order('updated_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return all;
}

export async function getTurnosAgrupados(cortejoId, organizacionId) {
  const turnos = await getTurnosByCortejo(cortejoId);
  const brazos = await getBrazosByCortejo(cortejoId, organizacionId);
  const cargadores = await getCargadoresByOrg(organizacionId);
  const cargadoresPorId = Object.fromEntries(cargadores.map((c) => [c.id, c]));
  const brazosEnriquecidos = brazos.map((b) => ({
    ...b,
    cargador: cargadoresPorId[b.cargador_id] || null,
  }));
  return agruparTurnosConBrazos(turnos, brazosEnriquecidos);
}

export async function getMesasByOrg(organizacionId) {
  const { data, error } = await supabase
    .from('mesas_vendedores')
    .select('*')
    .eq('organizacion_id', organizacionId);
  if (error) throw error;
  return data || [];
}

export async function getCargadorById(cargadorId) {
  if (!cargadorId) return null;
  const { data } = await supabase
    .from('cargadores_organizacion')
    .select('*')
    .eq('id', cargadorId)
    .maybeSingle();
  return data;
}

export async function getCargadoresByOrg(organizacionId) {
  const { data, error } = await supabase
    .from('cargadores_organizacion')
    .select('*')
    .eq('organizacion_id', organizacionId);
  if (error) throw error;
  return data || [];
}

export async function updateDevoto(organizacionId, cargadorId, datos) {
  if (!cargadorId) return { error: 'Devoto no válido.' };

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

  const { data: actual, error: findErr } = await supabase
    .from('cargadores_organizacion')
    .select('id')
    .eq('id', cargadorId)
    .eq('organizacion_id', organizacionId)
    .maybeSingle();
  if (findErr) return err(findErr);
  if (!actual) return { error: 'Devoto(a) no encontrado(a).' };

  const otroCui = await buscarCargadorPorCui(organizacionId, cuiNorm);
  if (otroCui && otroCui.id !== cargadorId) {
    return { error: 'Ese CUI ya está registrado en otro devoto(a).' };
  }

  const campos = {
    nombre_completo: datos.nombre_completo.trim(),
    whatsapp,
    correo: datos.correo?.trim() || '',
    cui_o_identificacion: cuiNorm,
    telefono_emergencia: datos.telefono_emergencia?.replace(/\D/g, '') || '',
  };

  const { data, error } = await supabase
    .from('cargadores_organizacion')
    .update(campos)
    .eq('id', cargadorId)
    .eq('organizacion_id', organizacionId)
    .select()
    .single();

  if (error) return err(error);
  return { data };
}

export async function createDevoto(organizacionId, datos) {
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

  const otroCui = await buscarCargadorPorCui(organizacionId, cuiNorm);
  if (otroCui) return { error: 'Ese CUI ya está registrado.' };

  const campos = {
    organizacion_id: organizacionId,
    nombre_completo: datos.nombre_completo.trim(),
    whatsapp,
    correo: datos.correo?.trim() || '',
    cui_o_identificacion: cuiNorm,
    telefono_emergencia: datos.telefono_emergencia?.replace(/\D/g, '') || '',
  };

  const { data, error } = await supabase
    .from('cargadores_organizacion')
    .insert(campos)
    .select()
    .single();

  if (error) return err(error);
  return { data };
}

export async function deleteDevoto(organizacionId, cargadorId) {
  if (!cargadorId) return { error: 'Devoto no válido.' };

  const { data: actual, error: findErr } = await supabase
    .from('cargadores_organizacion')
    .select('id, nombre_completo')
    .eq('id', cargadorId)
    .eq('organizacion_id', organizacionId)
    .maybeSingle();
  if (findErr) return err(findErr);
  if (!actual) return { error: 'Devoto(a) no encontrado(a).' };

  const { data: brazos, error: bErr } = await supabase
    .from('brazos')
    .select('id')
    .eq('cargador_id', cargadorId)
    .eq('organizacion_id', organizacionId)
    .limit(1);
  if (bErr) return err(bErr);
  if (brazos?.length) {
    return {
      error:
        'No se puede eliminar: tiene turnos asociados (ventas o apartados). Puede editar los datos del devoto(a).',
    };
  }

  const { error } = await supabase
    .from('cargadores_organizacion')
    .delete()
    .eq('id', cargadorId)
    .eq('organizacion_id', organizacionId);

  if (error) return err(error);
  return { ok: true, nombre: actual.nombre_completo };
}

export async function buscarCargadorPorCui(organizacionId, cui) {
  const limpio = normalizarCui(cui);
  if (!limpio) return null;
  const { data } = await supabase
    .from('cargadores_organizacion')
    .select('*')
    .eq('organizacion_id', organizacionId)
    .eq('cui_o_identificacion', limpio)
    .maybeSingle();
  return data;
}

export async function buscarCargadorPorWhatsapp(organizacionId, whatsapp) {
  const limpio = whatsapp.replace(/\D/g, '');
  const { data } = await supabase
    .from('cargadores_organizacion')
    .select('*')
    .eq('organizacion_id', organizacionId)
    .eq('whatsapp', limpio)
    .limit(1)
    .maybeSingle();
  return data;
}

/** Turnos asignados a un devoto(a): vendidos y apartados. */
export async function buscarTurnosDevoto(organizacionId, query) {
  const q = String(query || '').trim();
  if (!queryValidaBusquedaDevoto(q)) {
    return { error: 'Ingrese al menos 2 letras, un correo o 4 dígitos de DPI/WhatsApp.' };
  }

  const [cargadores, brazosVendidosRes, brazosApartadosRes, turnosRaw, cortejosRaw] =
    await Promise.all([
      getCargadoresByOrg(organizacionId),
      supabase
        .from('brazos')
        .select('*')
        .eq('organizacion_id', organizacionId)
        .eq('estado', 'vendido'),
      supabase
        .from('brazos')
        .select('*')
        .eq('organizacion_id', organizacionId)
        .eq('estado', 'reservado')
        .eq('reserva_apartado', true),
      supabase.from('turnos').select('*').eq('organizacion_id', organizacionId),
      getCortejosByOrg(organizacionId, { incluirInactivas: true }),
    ]);

  if (brazosVendidosRes.error) return err(brazosVendidosRes.error);
  if (brazosApartadosRes.error) return err(brazosApartadosRes.error);
  if (turnosRaw.error) return err(turnosRaw.error);

  const brazosRaw = [...(brazosVendidosRes.data || []), ...(brazosApartadosRes.data || [])];

  const cargadoresMatch = filtrarCargadoresPorBusqueda(cargadores, q);
  const cargadorIds = new Set(cargadoresMatch.map((c) => c.id));
  const cargadoresPorId = Object.fromEntries(cargadores.map((c) => [c.id, c]));
  const turnosPorId = Object.fromEntries((turnosRaw.data || []).map((t) => [t.id, t]));
  const cortejosPorId = Object.fromEntries((cortejosRaw || []).map((c) => [c.id, c]));

  const brazos = brazosRaw.filter(
    (b) =>
      (b.cargador_id && cargadorIds.has(b.cargador_id)) || apartadoSinCargadorCoincide(b, q)
  );

  const asignaciones = enriquecerAsignaciones({
    brazos,
    cargadoresPorId,
    turnosPorId,
    cortejosPorId,
  });

  const cargadoresEnResultado = [
    ...new Set(
      asignaciones.map((a) => a.cargador?.id).filter(Boolean)
    ),
  ]
    .map((id) => cargadoresPorId[id])
    .filter(Boolean);

  const perfiles =
    cargadoresEnResultado.length > 0
      ? cargadoresEnResultado
      : cargadoresMatch.length
        ? cargadoresMatch
        : asignaciones.length
          ? []
          : [];

  if (!asignaciones.length && !perfiles.length) {
    return {
      cargadores: [],
      asignaciones: [],
      mensaje: 'No se encontraron turnos ni apartados para esa búsqueda.',
    };
  }

  return {
    cargadores: perfiles,
    asignaciones,
    mensaje: null,
  };
}

export async function reservarBrazo(brazoId, mesaId, vendedorId) {
  const { data, error } = await supabase.rpc('reservar_brazo', {
    p_brazo_id: brazoId,
    p_mesa_id: mesaId ?? null,
    p_vendedor_id: vendedorId ?? null,
  });
  if (error) {
    if (isMissingRpc(error)) {
      return reservarBrazoDirecto(brazoId, mesaId, vendedorId);
    }
    return err(error);
  }
  return { data };
}

/** Libera en BD reservas de taquilla cuyos 5 minutos ya vencieron (no toca apartados formales). */
export async function liberarReservasTaquillaExpiradas(organizacionId) {
  if (!organizacionId) return { liberados: 0 };
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('brazos')
    .update({
      estado: 'disponible',
      bloqueado_hasta: null,
      mesa_id: null,
      vendedor_id: null,
    })
    .eq('organizacion_id', organizacionId)
    .eq('estado', 'reservado')
    .eq('reserva_apartado', false)
    .not('bloqueado_hasta', 'is', null)
    .lt('bloqueado_hasta', now)
    .select('id');

  if (error) {
    if (isMissingColumn(error, 'reserva_apartado')) {
      const { data: data2, error: error2 } = await supabase
        .from('brazos')
        .update({
          estado: 'disponible',
          bloqueado_hasta: null,
          mesa_id: null,
          vendedor_id: null,
        })
        .eq('organizacion_id', organizacionId)
        .eq('estado', 'reservado')
        .not('bloqueado_hasta', 'is', null)
        .lt('bloqueado_hasta', now)
        .select('id');
      if (error2) return err(error2);
      return { liberados: data2?.length || 0 };
    }
    return err(error);
  }
  return { liberados: data?.length || 0 };
}

/** Cuenta reservas de taquilla colgadas sin descargar todos los brazos. */
export async function contarReservasTaquillaColgadasOrg(
  organizacionId,
  minutos = MINUTOS_RESERVA_TAQUILLA_COLGADA
) {
  if (!organizacionId) return 0;
  const nowIso = new Date().toISOString();
  const cutoff = new Date(Date.now() - minutos * 60 * 1000).toISOString();

  let query = supabase
    .from('brazos')
    .select('id', { count: 'exact', head: true })
    .eq('organizacion_id', organizacionId)
    .eq('estado', 'reservado')
    .eq('reserva_apartado', false)
    .not('bloqueado_hasta', 'is', null)
    .gt('bloqueado_hasta', nowIso)
    .lt('updated_at', cutoff);

  let { count, error } = await query;
  if (error && isMissingColumn(error, 'reserva_apartado')) {
    ({ count, error } = await supabase
      .from('brazos')
      .select('id', { count: 'exact', head: true })
      .eq('organizacion_id', organizacionId)
      .eq('estado', 'reservado')
      .not('bloqueado_hasta', 'is', null)
      .gt('bloqueado_hasta', nowIso)
      .lt('updated_at', cutoff));
  }
  if (error) {
    console.error('contarReservasTaquillaColgadasOrg:', error);
    return 0;
  }
  return count || 0;
}

async function upsertDevotoVenta(orgId, cargadorData) {
  const whatsapp = cargadorData.whatsapp?.replace(/\D/g, '');
  const cuiNorm = normalizarCui(cargadorData.cui_o_identificacion);
  if (!whatsapp) return { error: 'WhatsApp obligatorio' };
  if (!isValidCui(cuiNorm)) {
    return { error: 'Ingrese un CUI válido (13 dígitos).' };
  }
  if (!cargadorData.nombre_completo?.trim()) {
    return { error: 'Nombre del devoto(a) obligatorio.' };
  }

  let devoto = await buscarCargadorPorCui(orgId, cuiNorm);

  const campos = {
    nombre_completo: cargadorData.nombre_completo.trim(),
    whatsapp,
    correo: cargadorData.correo?.trim() || '',
    cui_o_identificacion: cuiNorm,
    telefono_emergencia: cargadorData.telefono_emergencia || '',
  };

  if (!devoto) {
    const { data, error } = await supabase
      .from('cargadores_organizacion')
      .insert({ organizacion_id: orgId, ...campos })
      .select()
      .single();
    if (error) return err(error);
    return { cargador: data };
  }

  const { data, error } = await supabase
    .from('cargadores_organizacion')
    .update(campos)
    .eq('id', devoto.id)
    .select()
    .single();
  if (error) return err(error);
  return { cargador: data };
}

export async function confirmarVenta(brazoId, cargadorData, precioPagado, pagoData = {}) {
  const orgId = cargadorData.organizacion_id;
  const upsert = await upsertDevotoVenta(orgId, cargadorData);
  if (upsert.error) return upsert;
  const cargador = upsert.cargador;

  const { data: brazo, error } = await supabase.rpc('confirmar_venta_brazo', {
    p_brazo_id: brazoId,
    p_cargador_id: cargador.id,
    p_precio_pagado: precioPagado,
    p_metodo_pago: pagoData.metodo_pago || 'efectivo',
    p_comprobante_url: pagoData.comprobante_url || null,
  });
  if (error) {
    if (isMissingRpc(error)) {
      return confirmarVentaDirecto(brazoId, cargador, precioPagado, pagoData);
    }
    return err(error);
  }
  return { data: brazo, cargador, codigo: brazo.codigo_boleta_qr };
}

export async function getComprasByOrg(organizacionId) {
  const { data, error } = await supabase
    .from('compras')
    .select('*')
    .eq('organizacion_id', organizacionId)
    .order('pago_confirmado_en', { ascending: false });
  if (error) {
    if (error.code === '42P01') return [];
    throw error;
  }
  return data || [];
}

export async function confirmarVentaCompra(brazoIds, cargadorData, precios, pagoData = {}) {
  const orgId = cargadorData.organizacion_id;
  const upsert = await upsertDevotoVenta(orgId, cargadorData);
  if (upsert.error) return upsert;
  const cargador = upsert.cargador;

  const ids = Array.isArray(brazoIds) ? brazoIds : [];
  const listaPrecios = Array.isArray(precios) ? precios : [];

  const { data, error } = await supabase.rpc('confirmar_venta_compra', {
    p_brazo_ids: ids,
    p_cargador_id: cargador.id,
    p_precios: listaPrecios,
    p_metodo_pago: pagoData.metodo_pago || 'efectivo',
    p_comprobante_url: pagoData.comprobante_url || null,
    p_mesa_id: pagoData.mesa_id || null,
    p_vendedor_id: pagoData.vendedor_id || null,
    p_operador_nombre: (pagoData.operador_nombre || '').trim() || null,
  });

  if (error) {
    if (isMissingRpc(error)) {
      return confirmarVentaCompraDirecto(ids, cargador, listaPrecios, orgId, pagoData);
    }
    return err(error);
  }

  const compra = data?.compra;
  const brazos = Array.isArray(data?.brazos) ? data.brazos : [];
  await sincronizarOperadorVenta(compra?.id, ids, pagoData);

  const operadorNombre = (pagoData.operador_nombre || '').trim() || null;
  const compraFinal = compra
    ? {
        ...compra,
        operador_nombre: compra.operador_nombre || operadorNombre,
        vendedor_id: compra.vendedor_id || pagoData.vendedor_id || null,
        mesa_id: compra.mesa_id ?? pagoData.mesa_id ?? null,
      }
    : null;
  const brazosFinal = brazos.map((b) => ({
    ...b,
    operador_nombre: b.operador_nombre || operadorNombre,
    vendedor_id: b.vendedor_id || pagoData.vendedor_id || null,
    mesa_id: b.mesa_id ?? pagoData.mesa_id ?? null,
  }));

  return {
    compra: compraFinal,
    brazos: brazosFinal,
    cargador,
    codigo: compraFinal?.codigo_recibo,
    data: brazosFinal[0] || null,
  };
}

async function confirmarVentaCompraDirecto(brazoIds, cargador, precios, orgId, pagoData) {
  const ids = brazoIds || [];
  if (!ids.length) return { error: 'Seleccione al menos un turno' };

  const total = precios.reduce((s, p) => s + Number(p || 0), 0);
  const codigoRecibo = `VR-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

  const operadorNombre = (pagoData.operador_nombre || '').trim() || null;
  const { data: compra, error: compraErr } = await supabase
    .from('compras')
    .insert({
      organizacion_id: orgId,
      cargador_id: cargador.id,
      codigo_recibo: codigoRecibo,
      total_pagado: total,
      metodo_pago: pagoData.metodo_pago || 'efectivo',
      comprobante_url: pagoData.comprobante_url || null,
      vendedor_id: pagoData.vendedor_id || null,
      mesa_id: pagoData.mesa_id || null,
      operador_nombre: operadorNombre,
    })
    .select()
    .single();

  if (compraErr) return err(compraErr);

  const brazosActualizados = [];
  for (let i = 0; i < ids.length; i += 1) {
    const res = await confirmarVentaDirecto(ids[i], cargador, precios[i], pagoData);
    if (res.error) return res;
    const { data: brazoUpd, error: linkErr } = await supabase
      .from('brazos')
      .update({ compra_id: compra.id })
      .eq('id', ids[i])
      .select()
      .single();
    if (linkErr) return err(linkErr);
    brazosActualizados.push(brazoUpd || res.data);
  }

  return {
    compra,
    brazos: brazosActualizados,
    cargador,
    codigo: codigoRecibo,
    data: brazosActualizados[0] || null,
  };
}

export async function buscarBoletaPorCodigo(organizacionId, codigo) {
  const codigoLimpio = String(codigo || '')
    .trim()
    .toUpperCase()
    .match(/V[RT]-[A-Z0-9]+/)?.[0] || String(codigo || '').trim().toUpperCase();

  if (!codigoLimpio) {
    return { error: 'Código de boleta inválido.' };
  }

  const esVR = /^VR-[A-Z0-9]+$/.test(codigoLimpio);

  if (esVR) {
    const { data: compra, error: errCompra } = await supabase
      .from('compras')
      .select('*')
      .eq('organizacion_id', organizacionId)
      .eq('codigo_recibo', codigoLimpio)
      .maybeSingle();

    if (errCompra) return err(errCompra);
    if (!compra) {
      return { error: 'Boleta no encontrada o no corresponde a esta organización.' };
    }
    if (compra.estado === 'anulada') {
      return { error: 'Esta boleta ya fue anulada.' };
    }

    const { data: brazos, error: errBrazos } = await supabase
      .from('brazos')
      .select('*')
      .eq('compra_id', compra.id)
      .eq('estado', 'vendido')
      .order('numero_turno', { ascending: true });

    if (errBrazos) return err(errBrazos);
    if (!brazos?.length) {
      return { error: 'Boleta no encontrada o no corresponde a esta organización.' };
    }

    const brazo = brazos[0];
    const { data: turno } = await supabase.from('turnos').select('*').eq('id', brazo.turno_id).single();
    const { data: cortejo } = turno?.cortejo_id
      ? await supabase.from('cortejos').select('*').eq('id', turno.cortejo_id).single()
      : { data: null };
    if (cortejo?.estado === 'inactiva') {
      return { error: 'La procesión de esta boleta está inactiva.' };
    }
    const cargador = brazo.cargador_id ? await getCargadorById(brazo.cargador_id) : null;
    const items = await Promise.all(
      brazos.map(async (b) => ({
        brazo: b,
        turno: b.turno_id === turno?.id ? turno : await getTurnoById(b.turno_id),
      }))
    );

    return { brazo, brazos, compra, turno, cortejo, cargador, items };
  }

  const { data: brazo, error } = await supabase
    .from('brazos')
    .select('*')
    .eq('organizacion_id', organizacionId)
    .eq('codigo_boleta_qr', codigoLimpio)
    .eq('estado', 'vendido')
    .maybeSingle();

  if (error) return err(error);
  if (!brazo) return { error: 'Boleta no encontrada o no corresponde a esta organización.' };

  let brazos = [brazo];
  let compra = null;

  if (brazo.compra_id) {
    const [{ data: compraData }, { data: brazosCompra }] = await Promise.all([
      supabase.from('compras').select('*').eq('id', brazo.compra_id).maybeSingle(),
      supabase
        .from('brazos')
        .select('*')
        .eq('compra_id', brazo.compra_id)
        .eq('estado', 'vendido')
        .order('numero_turno', { ascending: true }),
    ]);
    compra = compraData || null;
    if (brazosCompra?.length) brazos = brazosCompra;
  }

  const { data: turno } = await supabase.from('turnos').select('*').eq('id', brazo.turno_id).single();
  const { data: cortejo } = turno?.cortejo_id
    ? await supabase.from('cortejos').select('*').eq('id', turno.cortejo_id).single()
    : { data: null };
  if (cortejo?.estado === 'inactiva') {
    return { error: 'La procesión de esta boleta está inactiva.' };
  }
  const cargador = brazo.cargador_id ? await getCargadorById(brazo.cargador_id) : null;
  const items = await Promise.all(
    brazos.map(async (b) => ({
      brazo: b,
      turno: b.turno_id === turno?.id ? turno : await getTurnoById(b.turno_id),
    }))
  );

  return { brazo, brazos, compra, turno, cortejo, cargador, items };
}

async function anularVentaPorCodigoDirecto(organizacionId, codigo, motivo) {
  const preview = await buscarBoletaPorCodigo(organizacionId, codigo);
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

  const ids = brazos.map((b) => b.id);
  const { error: upErr } = await supabase
    .from('brazos')
    .update(RESET_BRAZO_VENTA)
    .in('id', ids)
    .eq('organizacion_id', organizacionId)
    .eq('estado', 'vendido');

  if (upErr) return err(upErr);

  if (preview.compra?.id) {
    const payloadCompra = {
      estado: 'anulada',
      anulada_en: new Date().toISOString(),
      motivo_anulacion: motivo?.trim() || null,
    };
    const { error: cErr } = await supabase
      .from('compras')
      .update(payloadCompra)
      .eq('id', preview.compra.id)
      .eq('organizacion_id', organizacionId);

    if (cErr && !isMissingColumn(cErr, 'estado')) {
      return err(cErr);
    }
  }

  return {
    data: {
      codigo: normalizarCodigoBoleta(codigo),
      brazos_liberados: brazos.length,
      compra_id: preview.compra?.id || null,
      motivo: motivo?.trim() || null,
    },
  };
}

export async function anularVentaPorCodigo(organizacionId, codigo, motivo = '') {
  const codigoLimpio = normalizarCodigoBoleta(codigo);
  if (!codigoLimpio || !/^V[RT]-[A-Z0-9]+$/.test(codigoLimpio)) {
    return { error: 'Código de boleta inválido.' };
  }
  if (!motivo?.trim()) {
    return { error: 'Indique el motivo de la anulación.' };
  }

  const { data, error } = await supabase.rpc('anular_venta_por_codigo', {
    p_codigo: codigoLimpio,
    p_motivo: motivo.trim(),
  });

  if (error) {
    if (isMissingRpc(error)) {
      return anularVentaPorCodigoDirecto(organizacionId, codigoLimpio, motivo.trim());
    }
    const msg = error.message || String(error);
    if (/entregad/i.test(msg)) {
      return { error: 'No se puede anular: uno o más turnos ya fueron entregados al devoto(a).' };
    }
    if (/no encontrad|ya anulad/i.test(msg)) {
      return { error: 'Boleta no encontrada o ya anulada.' };
    }
    return err(error);
  }

  return { data };
}

const METODOS_PAGO_VALIDOS = new Set(['efectivo', 'transferencia', 'tarjeta']);

function metodoRequiereComprobantePago(metodo) {
  return metodo === 'transferencia' || metodo === 'tarjeta';
}

export async function actualizarPagoPorCodigo(organizacionId, codigo, pagoData = {}) {
  const codigoLimpio = normalizarCodigoBoleta(codigo);
  if (!codigoLimpio || !/^V[RT]-[A-Z0-9]+$/.test(codigoLimpio)) {
    return { error: 'Código de boleta inválido.' };
  }

  const metodo = pagoData.metodo_pago || 'efectivo';
  if (!METODOS_PAGO_VALIDOS.has(metodo)) {
    return { error: 'Método de pago inválido.' };
  }

  const comprobante = pagoData.comprobante_url || null;
  if (metodoRequiereComprobantePago(metodo) && !comprobante) {
    return { error: 'Suba la foto del comprobante de transferencia o voucher de pago.' };
  }

  const preview = await buscarBoletaPorCodigo(organizacionId, codigoLimpio);
  if (preview.error) return preview;

  const brazos = preview.brazos || [];
  if (!brazos.length) {
    return { error: 'Boleta no encontrada o ya anulada.' };
  }

  const payload = {
    metodo_pago: metodo,
    comprobante_url: metodoRequiereComprobantePago(metodo) ? comprobante : null,
  };

  const ids = brazos.map((b) => b.id);
  const { error: upErr } = await supabase
    .from('brazos')
    .update(payload)
    .in('id', ids)
    .eq('organizacion_id', organizacionId)
    .eq('estado', 'vendido');

  if (upErr) return err(upErr);

  if (preview.compra?.id) {
    const { error: cErr } = await supabase
      .from('compras')
      .update(payload)
      .eq('id', preview.compra.id)
      .eq('organizacion_id', organizacionId);
    if (cErr) return err(cErr);
  }

  return {
    data: {
      codigo: codigoLimpio,
      metodo_pago: metodo,
      brazos_actualizados: brazos.length,
    },
  };
}

export async function marcarEntregado(brazoId) {
  const { data, error } = await supabase.rpc('marcar_entregado_brazo', { p_brazo_id: brazoId });
  if (error) {
    if (isMissingRpc(error)) {
      const { data: brazo, error: upErr } = await supabase
        .from('brazos')
        .update({
          estado_entrega: 'entregado',
          entregado_en: new Date().toISOString(),
        })
        .eq('id', brazoId)
        .eq('estado', 'vendido')
        .select()
        .single();
      if (upErr) return err(upErr);
      return { data: brazo };
    }
    return err(error);
  }
  return { data };
}

export async function getFinanzasByOrg(organizacionId) {
  const [{ data: brazos, error }, { data: compras }, usuarios, cortejosRaw] = await Promise.all([
    supabase
      .from('brazos')
      .select('*')
      .eq('organizacion_id', organizacionId)
      .eq('estado', 'vendido'),
    supabase.from('compras').select('id, vendedor_id, operador_nombre').eq('organizacion_id', organizacionId),
    getUsuariosByOrg(organizacionId),
    getCortejosByOrg(organizacionId, { incluirInactivas: true }),
  ]);
  if (error) throw error;

  const comprasMap = Object.fromEntries((compras || []).map((c) => [c.id, c]));
  const mapaUsuarios = {};
  for (const u of usuarios || []) {
    const nombre = u.nombre?.trim() || u.email?.trim() || '';
    if (!nombre) continue;
    if (u.auth_user_id) mapaUsuarios[u.auth_user_id] = nombre;
    if (u.id) mapaUsuarios[u.id] = nombre;
  }

  const cortejosMap = Object.fromEntries((cortejosRaw || []).map((c) => [c.id, c]));

  const { data: turnos } = await supabase
    .from('turnos')
    .select('id, precio, cortejo_id, numero_turno, tipo_turno, etiqueta, hora_estimada')
    .eq('organizacion_id', organizacionId);

  const turnosMap = Object.fromEntries((turnos || []).map((t) => [t.id, t]));

  const presupuestoTotal = (turnos || []).reduce((s, t) => {
    const delTurno = (brazos || []).filter((b) => b.turno_id === t.id);
    return s + Number(t.precio) * (delTurno.length || 0);
  }, 0);

  const recaudado = (brazos || []).reduce((s, b) => s + Number(b.precio_pagado || 0), 0);

  const ventas = (brazos || []).map((b) => {
    const compra = b.compra_id ? comprasMap[b.compra_id] : null;
    const turno = turnosMap[b.turno_id];
    const operador_nombre =
      b.operador_nombre?.trim() ||
      compra?.operador_nombre?.trim() ||
      mapaUsuarios[b.vendedor_id] ||
      mapaUsuarios[compra?.vendedor_id] ||
      '';
    return {
      ...b,
      vendedor_id: b.vendedor_id || compra?.vendedor_id || null,
      mesa_id: b.mesa_id,
      operador_nombre,
      tipo_turno: turno?.tipo_turno || null,
      turno_etiqueta: turno?.etiqueta || turno?.tipo_turno || '',
      numero_turno: b.numero_turno ?? turno?.numero_turno,
      hora_estimada: turno?.hora_estimada || null,
      fecha_evento: cortejosMap[turno?.cortejo_id]?.fecha || null,
      cortejo_nombre: cortejosMap[turno?.cortejo_id]?.nombre_evento || null,
    };
  });

  const mesas = await getMesasByOrg(organizacionId);
  const porMesa = (mesas || []).map((mesa) => {
    const ventasMesa = ventas.filter((b) => b.mesa_id === mesa.id);
    return {
      ...mesa,
      ventas: ventasMesa.length,
      total: ventasMesa.reduce((s, b) => s + Number(b.precio_pagado || 0), 0),
    };
  });

  const porVendedor = {};
  const porMetodo = { efectivo: 0, transferencia: 0, tarjeta: 0 };
  ventas.forEach((b) => {
    const vid = b.vendedor_id || 'sin-asignar';
    const nombre =
      b.operador_nombre?.trim() ||
      (vid !== 'sin-asignar' ? mapaUsuarios[vid] : '') ||
      'Sin asignar';
    if (!porVendedor[vid]) porVendedor[vid] = { ventas: 0, total: 0, nombre };
    if (!porVendedor[vid].nombre && nombre) porVendedor[vid].nombre = nombre;
    porVendedor[vid].ventas += 1;
    porVendedor[vid].total += Number(b.precio_pagado || 0);
    const metodo = b.metodo_pago || 'efectivo';
    if (porMetodo[metodo] !== undefined) {
      porMetodo[metodo] += Number(b.precio_pagado || 0);
    }
  });

  return {
    ventas,
    recaudado,
    presupuestoTotal,
    brazosVendidos: brazos?.length || 0,
    porMesa,
    porVendedor,
    porMetodo,
    mapaUsuarios,
  };
}

export async function getDashboardMetrics(organizacionId) {
  const fin = await getFinanzasByOrg(organizacionId);
  const cortejos = await getCortejosByOrg(organizacionId, { incluirInactivas: true });
  const brazos = await getBrazosByOrg(organizacionId);
  const { data: turnos } = await supabase
    .from('turnos')
    .select('id, cortejo_id, precio, numero_turno')
    .eq('organizacion_id', organizacionId);

  return enriquecerDashboardMetrics({
    fin,
    brazos,
    cortejos,
    turnos: turnos || [],
  });
}

const EMAIL_CONFIG_PUBLIC =
  'id, organizacion_id, correo_remitente, nombre_remitente, correo_respuesta, notificaciones_activas, pie_correo, leyenda_correo, correo_fecha_entrega, correo_horario_entrega, gmail_smtp_user, gmail_password_configurada, created_at, updated_at';

export async function getEmailConfig(organizacionId) {
  const { data } = await supabase
    .from('configuracion_correo_safe')
    .select('*')
    .eq('organizacion_id', organizacionId)
    .maybeSingle();
  return data;
}

export async function saveEmailConfig(organizacionId, config) {
  const payload = {
    organizacion_id: organizacionId,
    correo_remitente: config.correo_remitente,
    nombre_remitente: config.nombre_remitente,
    correo_respuesta: config.correo_respuesta || null,
    notificaciones_activas: config.notificaciones_activas !== false,
    pie_correo: config.pie_correo || null,
    leyenda_correo: config.leyenda_correo?.trim() || null,
    correo_fecha_entrega: config.correo_fecha_entrega?.trim() || null,
    correo_horario_entrega: config.correo_horario_entrega?.trim() || null,
    gmail_smtp_user: config.gmail_smtp_user?.trim() || config.correo_remitente?.trim() || null,
  };

  const nuevaPass = config.gmail_app_password?.replace(/\s/g, '');
  if (nuevaPass) {
    payload.gmail_app_password = nuevaPass;
    payload.gmail_password_configurada = true;
  }

  const { data: existente } = await supabase
    .from('configuracion_correo')
    .select('id')
    .eq('organizacion_id', organizacionId)
    .maybeSingle();

  let result;
  if (existente?.id) {
    result = await supabase
      .from('configuracion_correo')
      .update(payload)
      .eq('organizacion_id', organizacionId)
      .select(EMAIL_CONFIG_PUBLIC)
      .single();
  } else {
    if (!nuevaPass) {
      return {
        error:
          'La primera vez debe guardar la contraseña de aplicación de Gmail en la sección Cuenta Gmail.',
      };
    }
    result = await supabase
      .from('configuracion_correo')
      .insert({ ...payload, gmail_password_configurada: true })
      .select(EMAIL_CONFIG_PUBLIC)
      .single();
  }

  if (result.error) return err(result.error);
  return result.data;
}

export async function getReciboConfig(organizacionId) {
  const { data, error } = await supabase
    .from('configuracion_recibo')
    .select('*')
    .eq('organizacion_id', organizacionId)
    .maybeSingle();
  if (error) return err(error);
  return data;
}

export async function saveReciboConfig(organizacionId, { formato, diseño }) {
  const payload = {
    organizacion_id: organizacionId,
    formato: formato || 'termico_80',
    diseño: diseño || {},
  };
  const { data, error } = await supabase
    .from('configuracion_recibo')
    .upsert(payload, { onConflict: 'organizacion_id' })
    .select()
    .single();
  if (error) return err(error);
  return { data };
}

export async function getCorreosEnviados(organizacionId) {
  const { data } = await supabase
    .from('correos_enviados')
    .select('*')
    .eq('organizacion_id', organizacionId)
    .order('created_at', { ascending: false });
  return data || [];
}

export async function registrarCorreoEnviado(organizacionId, datos) {
  const row = {
    organizacion_id: organizacionId,
    destinatario:
      datos.destinatario?.trim() ||
      datos.cargador?.correo?.trim() ||
      '',
    asunto: datos.asunto || null,
    codigo_boleta:
      datos.codigo_boleta ||
      datos.compra?.codigo_recibo ||
      datos.brazo?.codigo_boleta_qr ||
      null,
    estado: datos.estado || 'enviado',
    metadata: {
      modo: datos.modo || null,
      enviado_en: datos.enviado_en || new Date().toISOString(),
      enlace_boleta: datos.enlaceBoleta || null,
      remitente: datos.remitente || null,
      nombre_remitente: datos.nombreRemitente || null,
      responder_a: datos.responderA || null,
      brazo_id: datos.brazo?.id || null,
      turno_id: datos.turno?.id || null,
      cortejo_id: datos.cortejo?.id || null,
      cargador_id: datos.cargador?.id || null,
      cargador_nombre: datos.cargador?.nombre_completo?.trim() || null,
      error: datos.error || null,
    },
  };

  const { data, error } = await supabase
    .from('correos_enviados')
    .insert(row)
    .select()
    .single();
  if (error) return err(error);
  return data;
}

export async function updateCorreoEnviadoEstado(organizacionId, correoId, estado, nota) {
  if (!correoId) return { error: 'Registro no válido.' };

  const { data: actual, error: readErr } = await supabase
    .from('correos_enviados')
    .select('metadata')
    .eq('id', correoId)
    .eq('organizacion_id', organizacionId)
    .maybeSingle();

  if (readErr) return err(readErr);
  if (!actual) return { error: 'Registro no encontrado.' };

  const metadata = {
    ...(actual.metadata || {}),
    ...(nota ? { nota_rebote: nota } : {}),
    marcado_rebotado_en:
      estado === 'rebotado' ? new Date().toISOString() : actual.metadata?.marcado_rebotado_en,
  };

  const { data, error } = await supabase
    .from('correos_enviados')
    .update({ estado, metadata })
    .eq('id', correoId)
    .eq('organizacion_id', organizacionId)
    .select()
    .single();

  if (error) return err(error);
  return { data };
}

export async function getRolesByOrg(organizacionId) {
  const { data, error } = await supabase
    .from('roles_organizacion')
    .select('*')
    .eq('organizacion_id', organizacionId)
    .order('es_sistema', { ascending: false });
  if (error) throw error;
  return (data || []).map((rol) => ({
    ...rol,
    permisos: Array.isArray(rol.permisos) ? rol.permisos : [],
  }));
}

export async function getUsuariosByOrg(organizacionId) {
  const { data, error } = await supabase
    .from('usuarios_app')
    .select('*, roles_organizacion(nombre, permisos)')
    .eq('organizacion_id', organizacionId);
  if (error) throw error;
  return (data || []).map((u) => ({
    ...u,
    rol_nombre: u.roles_organizacion?.nombre || '—',
    permisos: u.roles_organizacion?.permisos || [],
  }));
}

export async function saveRol(organizacionId, datos, rolId = null) {
  const permisos = [...new Set((datos.permisos || []).filter(Boolean))];
  if (!permisos.length) return { error: 'El rol debe tener al menos un permiso.' };

  if (rolId) {
    const { data, error } = await supabase
      .from('roles_organizacion')
      .update({ nombre: datos.nombre, descripcion: datos.descripcion, permisos })
      .eq('id', rolId)
      .eq('organizacion_id', organizacionId)
      .select()
      .single();
    if (error) return err(error);
    return { data };
  }

  const { data, error } = await supabase
    .from('roles_organizacion')
    .insert({
      organizacion_id: organizacionId,
      nombre: datos.nombre,
      descripcion: datos.descripcion,
      permisos,
    })
    .select()
    .single();
  if (error) return err(error);
  return { data };
}

async function callUserApi(path, body) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { error: 'Sesión expirada. Vuelva a iniciar sesión.' };
  }

  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: json.error || `Error del servidor (${res.status})` };
    }
    return { data: json.data };
  } catch (e) {
    const msg = e?.message || '';
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      return {
        error:
          'No se pudo conectar con el servidor. Verifique SUPABASE_SERVICE_ROLE_KEY en Vercel y que la API /api esté desplegada.',
      };
    }
    return { error: msg || 'Error de red al guardar el usuario.' };
  }
}

export async function saveUsuario(organizacionId, datos, usuarioId = null) {
  const emailNorm = datos.email?.trim().toLowerCase();
  if (!emailNorm) return { error: 'El correo es obligatorio.' };

  const { data: rol, error: rolErr } = await supabase
    .from('roles_organizacion')
    .select('id')
    .eq('id', datos.rol_id)
    .eq('organizacion_id', organizacionId)
    .maybeSingle();
  if (rolErr) return err(rolErr);
  if (!rol) return { error: 'Seleccione un rol válido.' };

  if (usuarioId) {
    if (datos.password?.trim() && datos.password.trim().length < 6) {
      return { error: 'La nueva contraseña debe tener al menos 6 caracteres.' };
    }
    return callUserApi('/api/update-app-user', {
      organizacionId,
      usuarioId,
      nombre: datos.nombre?.trim() || 'Usuario',
      email: emailNorm,
      password: datos.password?.trim() || undefined,
      rol_id: datos.rol_id,
      activo: datos.activo !== false,
    });
  }

  if (!datos.password?.trim()) {
    return { error: 'La contraseña es obligatoria para usuarios nuevos.' };
  }
  if (datos.password.trim().length < 6) {
    return { error: 'La contraseña debe tener al menos 6 caracteres.' };
  }

  return callUserApi('/api/invite-app-user', {
    organizacionId,
    nombre: datos.nombre?.trim() || 'Usuario',
    email: emailNorm,
    password: datos.password,
    rol_id: datos.rol_id,
  });
}

export async function deleteRol(rolId, organizacionId) {
  const { count } = await supabase
    .from('usuarios_app')
    .select('id', { count: 'exact', head: true })
    .eq('rol_id', rolId);
  if (count > 0) return { error: 'Hay usuarios con este rol.' };

  const { error } = await supabase
    .from('roles_organizacion')
    .delete()
    .eq('id', rolId)
    .eq('organizacion_id', organizacionId);
  if (error) return err(error);
  return { ok: true };
}

export async function generarProcesion(cortejo, configProcesion, organizacionId) {
  const turnosPlan =
    configProcesion?.turnosPlan?.length > 0
      ? configProcesion.turnosPlan
      : construirTurnosConfig(configProcesion);

  const configGuardado = {
    fuente: configProcesion?.fuente || 'manual',
    brazosDefault: configProcesion?.brazosDefault,
    totalTurnos: turnosPlan.length,
  };

  const { data: nuevoCortejo, error: cErr } = await supabase
    .from('cortejos')
    .insert({
      organizacion_id: organizacionId,
      nombre_evento: cortejo.nombre_evento,
      fecha: cortejo.fecha,
      descripcion: cortejo.descripcion,
      estado: 'activa',
      config_procesion: configGuardado,
    })
    .select()
    .single();
  if (cErr) return err(cErr);

  const rollbackCortejo = async () => {
    await rollbackCortejoCompleto(nuevoCortejo.id);
  };

  const turnosCreados = [];
  const brazosCreados = [];

  try {
    for (const cfg of turnosPlan) {
      const totalBrazos = Number(cfg.total_brazos) || 0;
      if (!totalBrazos || totalBrazos % 2 !== 0) {
        await rollbackCortejo();
        return {
          error: `Turno "${cfg.etiqueta || cfg.numero_turno}": total de brazos inválido (${totalBrazos}). Debe ser par y mayor que 0.`,
        };
      }

      const { data: turno, error: tErr } = await supabase
        .from('turnos')
        .insert({
          organizacion_id: organizacionId,
          cortejo_id: nuevoCortejo.id,
          numero_turno: cfg.numero_turno,
          tipo_turno: cfg.tipo_turno,
          etiqueta: cfg.etiqueta,
          total_brazos: totalBrazos,
          precio: cfg.precio ?? 0,
          son: cfg.son,
          alabado: cfg.alabado,
        })
        .select()
        .single();
      if (tErr) {
        await rollbackCortejo();
        return err(tErr);
      }

      turnosCreados.push(turno);

      const brazosTurno = aplicarAsignacionBrazos(
        crearBrazosParaTurno({
          turnoId: turno.id,
          numeroTurno: turno.numero_turno,
          totalBrazos,
          organizacionId,
          idPrefix: 'brazo',
        }),
        cfg.asignacion
      ).map(({ id, ...b }) => b);

      const bErr = await insertarBrazosEnLotes(brazosTurno);
      if (bErr) {
        await rollbackCortejo();
        return {
          error: `Error al crear brazos del turno "${cfg.etiqueta || cfg.numero_turno}" (${totalBrazos} espacios): ${bErr.message || bErr}`,
        };
      }

      brazosCreados.push(...brazosTurno);
    }
  } catch (e) {
    await rollbackCortejo();
    return { error: e.message || String(e) };
  }

  try {
    sessionStorage.setItem('vtd_ultimo_cortejo', nuevoCortejo.id);
  } catch (_) {
    /* ignore */
  }

  return { cortejo: nuevoCortejo, turnos: turnosCreados, brazos: brazosCreados };
}

export async function desactivarProcesion(cortejoId, organizacionId) {
  const { error } = await supabase
    .from('cortejos')
    .update({ estado: 'inactiva' })
    .eq('id', cortejoId)
    .eq('organizacion_id', organizacionId);
  if (error) return err(error);
  return { ok: true };
}

export async function activarProcesion(cortejoId, organizacionId) {
  const { error } = await supabase
    .from('cortejos')
    .update({ estado: 'activa' })
    .eq('id', cortejoId)
    .eq('organizacion_id', organizacionId);
  if (error) return err(error);
  return { ok: true };
}

export async function eliminarProcesion(cortejoId, organizacionId) {
  const { error } = await supabase
    .from('cortejos')
    .delete()
    .eq('id', cortejoId)
    .eq('organizacion_id', organizacionId);
  if (error) return err(error);
  return { ok: true };
}

function claveBrazo(b) {
  return `${b.numero_turno}|${b.numero_brazo}|${b.lado}`;
}

function camposApartadoCopiados(brazoOrigen) {
  if (!brazoOrigen?.reserva_apartado || brazoOrigen.estado === 'vendido') return {};
  return {
    estado: 'reservado',
    reserva_apartado: true,
    asignado_nombre: brazoOrigen.asignado_nombre || null,
    apartado_notas: brazoOrigen.apartado_notas || null,
    cargador_id: brazoOrigen.cargador_id || null,
  };
}

/** Duplica una procesión: turnos, melodías y apartados (sin ventas). */
export async function duplicarProcesion(cortejoOrigenId, datos, organizacionId) {
  const nombre = datos?.nombre_evento?.trim();
  if (!nombre) return { error: 'Indique un nombre para la copia.' };

  const { data: origen, error: oErr } = await supabase
    .from('cortejos')
    .select('*')
    .eq('id', cortejoOrigenId)
    .eq('organizacion_id', organizacionId)
    .maybeSingle();
  if (oErr) return err(oErr);
  if (!origen) return { error: 'Procesión no encontrada.' };

  const turnosOrigen = await getTurnosByCortejo(cortejoOrigenId);
  if (!turnosOrigen.length) return { error: 'La procesión no tiene turnos para copiar.' };

  const brazosOrigen = await getBrazosByCortejo(cortejoOrigenId, organizacionId);
  const brazosPorClave = new Map(brazosOrigen.map((b) => [claveBrazo(b), b]));

  const configGuardado = {
    ...(origen.config_procesion && typeof origen.config_procesion === 'object'
      ? origen.config_procesion
      : {}),
    fuente: 'duplicado',
    duplicadoDe: cortejoOrigenId,
  };

  const { data: nuevoCortejo, error: cErr } = await supabase
    .from('cortejos')
    .insert({
      organizacion_id: organizacionId,
      nombre_evento: nombre,
      fecha: datos?.fecha || origen.fecha,
      descripcion: origen.descripcion,
      estado: 'activa',
      config_procesion: configGuardado,
    })
    .select()
    .single();
  if (cErr) return err(cErr);

  const rollbackCortejo = async () => {
    await rollbackCortejoCompleto(nuevoCortejo.id);
  };

  const turnosCreados = [];
  const brazosCreados = [];

  try {
    for (const turnoOrigen of turnosOrigen) {
      const totalBrazos = Number(turnoOrigen.total_brazos) || 0;
      if (!totalBrazos || totalBrazos % 2 !== 0) {
        await rollbackCortejo();
        return {
          error: `Turno "${turnoOrigen.etiqueta || turnoOrigen.numero_turno}": total de brazos inválido.`,
        };
      }

      const { data: turno, error: tErr } = await supabase
        .from('turnos')
        .insert({
          organizacion_id: organizacionId,
          cortejo_id: nuevoCortejo.id,
          numero_turno: turnoOrigen.numero_turno,
          tipo_turno: turnoOrigen.tipo_turno,
          etiqueta: turnoOrigen.etiqueta,
          total_brazos: totalBrazos,
          precio: turnoOrigen.precio ?? 0,
          son: turnoOrigen.son,
          alabado: turnoOrigen.alabado,
          hora_estimada: turnoOrigen.hora_estimada || null,
        })
        .select()
        .single();
      if (tErr) {
        await rollbackCortejo();
        return err(tErr);
      }

      turnosCreados.push(turno);

      const brazosTurno = crearBrazosParaTurno({
        turnoId: turno.id,
        numeroTurno: turno.numero_turno,
        totalBrazos,
        organizacionId,
        idPrefix: 'brazo',
      }).map(({ id, ...b }) => {
        const origenBrazo = brazosPorClave.get(claveBrazo(b));
        return { ...b, ...camposApartadoCopiados(origenBrazo) };
      });

      const bErr = await insertarBrazosUnoAUno(brazosTurno, { delayMs: 80 });
      if (bErr) {
        await rollbackCortejo();
        const etiquetaTurno = turnoOrigen.etiqueta || `Turno ${turnoOrigen.numero_turno}`;
        return {
          error: esErrorDuplicado(bErr)
            ? `Error al copiar "${etiquetaTurno}": ya existían espacios duplicados (¿intento anterior a medias?). Elimine la copia incompleta en la lista e intente de nuevo.`
            : `Error al copiar brazos de "${etiquetaTurno}": ${bErr.message || bErr}. No cierre la pestaña; espere a que termine.`,
        };
      }

      brazosCreados.push(...brazosTurno);
      await sleep(120);
    }
  } catch (e) {
    await rollbackCortejo();
    return { error: e.message || String(e) };
  }

  try {
    sessionStorage.setItem('vtd_ultimo_cortejo', nuevoCortejo.id);
  } catch (_) {
    /* ignore */
  }

  return { cortejo: nuevoCortejo, turnos: turnosCreados, brazos: brazosCreados };
}

export async function setUsuarioActivo(organizacionId, usuario, activo) {
  if (!usuario?.id) return { error: 'Usuario no válido.' };
  return saveUsuario(
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

export async function getResumenApartados(cortejoId, organizacionId) {
  const turnos = await getTurnosAgrupados(cortejoId, organizacionId);
  const cargadores = await getCargadoresByOrg(organizacionId);
  const cargadoresPorId = Object.fromEntries(cargadores.map((c) => [c.id, c]));

  return turnos.map((turno) => {
    const todos = [
      ...(Array.isArray(turno.izquierda) ? turno.izquierda : []),
      ...(Array.isArray(turno.derecha) ? turno.derecha : []),
    ];
    const reservadosLista = todos.filter((b) => b.estado === 'reservado');
    const apartadosFormales = reservadosLista.filter((b) => b.reserva_apartado);
    const reservasTaquilla = reservadosLista.filter((b) => !b.reserva_apartado);
    const vendidos = todos.filter((b) => b.estado === 'vendido');
    const libres = todos.filter((b) => b.estado === 'disponible');

    return {
      turno,
      total: todos.length,
      apartados: reservadosLista.length,
      apartados_formales: apartadosFormales.length,
      reservas_taquilla: reservasTaquilla.length,
      vendidos: vendidos.length,
      libres: libres.length,
      detalle: reservadosLista.map((b) => {
        const cargador = cargadoresPorId[b.cargador_id];
        return {
          brazo: b,
          cargador,
          etiqueta:
            cargador?.nombre_completo ||
            b.asignado_nombre ||
            b.apartado_notas ||
            (b.reserva_apartado ? 'Apartado' : 'Reserva taquilla'),
        };
      }),
    };
  });
}

function whatsappPlaceholderDesdeCui(cui) {
  const d = normalizarCui(cui);
  if (!isValidCui(d)) return '';
  return `502${d.slice(-8)}`;
}

async function upsertCargadorParcialImport(organizacionId, datos) {
  const cui = normalizarCui(datos.cui || datos.dpi || '');
  const whatsappRaw = datos.whatsapp?.replace(/\D/g, '') || '';
  const whatsapp =
    whatsappRaw.length >= 11 ? whatsappRaw : whatsappPlaceholderDesdeCui(cui);
  const nombreCompleto =
    datos.nombre_completo?.trim() ||
    combinarNombreDevoto(datos.apellido, datos.nombre) ||
    datos.nombre?.trim() ||
    'Sin nombre';

  let cargador = isValidCui(cui) ? await buscarCargadorPorCui(organizacionId, cui) : null;

  if (!isValidCui(cui) && !whatsapp) return null;

  const campos = {
    nombre_completo: nombreCompleto,
    cui_o_identificacion: cui || cargador?.cui_o_identificacion || '',
    whatsapp: whatsapp || cargador?.whatsapp || '',
    correo: datos.correo?.trim() || cargador?.correo || '',
    telefono_emergencia:
      datos.telefono_emergencia?.trim() || cargador?.telefono_emergencia || '',
  };

  if (!cargador && campos.whatsapp) {
    const { data, error } = await supabase
      .from('cargadores_organizacion')
      .insert({ organizacion_id: organizacionId, ...campos })
      .select()
      .single();
    if (!error) return data;
    if (isValidCui(cui)) {
      cargador = await buscarCargadorPorCui(organizacionId, cui);
    }
  }

  if (cargador) {
    const { data, error } = await supabase
      .from('cargadores_organizacion')
      .update(campos)
      .eq('id', cargador.id)
      .select()
      .single();
    if (error) return cargador;
    return data;
  }

  return null;
}

async function marcarBrazoApartado(brazo, fila, cargador, usuarioId) {
  const nombreSolo =
    fila.nombre_completo?.trim() || fila.nombre?.trim() || cargador?.nombre_completo || null;
  const dpi = normalizarCui(fila.dpi || fila.cui || '');
  const notasBase = fila.notas?.trim() || '';
  const notasDpi = !cargador && isValidCui(dpi) ? `DPI ${dpi}` : '';
  const apartadoNotas = [notasBase, notasDpi].filter(Boolean).join(' · ') || null;

  const { error } = await supabase
    .from('brazos')
    .update({
      estado: 'reservado',
      reserva_apartado: true,
      bloqueado_hasta: null,
      cargador_id: cargador?.id || null,
      asignado_nombre: cargador ? null : nombreSolo,
      apartado_notas: apartadoNotas,
      vendedor_id: null,
      mesa_id: null,
    })
    .eq('id', brazo.id);

  return error;
}

export async function aplicarImportApartados(cortejoId, organizacionId, filas, { usuarioId } = {}) {
  const resultados = [];
  let ok = 0;
  let omitidos = 0;

  const { data: turnosData } = await supabase
    .from('turnos')
    .select('*')
    .eq('cortejo_id', cortejoId)
    .eq('organizacion_id', organizacionId);
  const turnos = turnosData || [];

  const turnoIds = turnos.map((t) => t.id);
  let brazosPorTurno = {};

  if (turnoIds.length) {
    const todosBrazos = await getBrazosByCortejo(cortejoId, organizacionId);
    brazosPorTurno = todosBrazos.reduce((acc, b) => {
      if (!acc[b.turno_id]) acc[b.turno_id] = [];
      acc[b.turno_id].push(b);
      return acc;
    }, {});
  }

  const brazosApartadosIds = new Set();

  for (const fila of filas) {
    if (fila.modo === 'listado' || (!fila.brazo && fila.cantidad)) {
      const turno = resolverTurnoEnLista(turnos, fila.turno);
      if (!turno) {
        resultados.push({
          fila: fila.filaExcel,
          ok: false,
          mensaje: `No se encontró el turno "${fila.turno}"`,
        });
        omitidos += 1;
        continue;
      }

      const cargador = await upsertCargadorParcialImport(organizacionId, fila);
      const pool = (brazosPorTurno[turno.id] || []).filter((b) => !brazosApartadosIds.has(b.id));
      const elegibles = brazosElegiblesParaApartado(pool);
      const cantidad = Number(fila.cantidad) || 0;

      if (elegibles.length < cantidad) {
        resultados.push({
          fila: fila.filaExcel,
          ok: false,
          mensaje: `Turno ${turno.numero_turno}: solo hay ${elegibles.length} espacio(s) libre(s), se pidieron ${cantidad}`,
        });
        omitidos += 1;
        continue;
      }

      const asignados = elegibles.slice(0, cantidad);
      let filaOk = 0;

      for (const brazo of asignados) {
        const error = await marcarBrazoApartado(brazo, fila, cargador, usuarioId);
        if (error) {
          resultados.push({
            fila: fila.filaExcel,
            ok: false,
            mensaje: `Error en brazo ${brazo.numero_brazo} ${brazo.lado}: ${error.message}`,
          });
          omitidos += 1;
          continue;
        }

        brazosApartadosIds.add(brazo.id);
        const idx = brazosPorTurno[turno.id].findIndex((b) => b.id === brazo.id);
        if (idx >= 0) {
          brazosPorTurno[turno.id][idx] = {
            ...brazosPorTurno[turno.id][idx],
            estado: 'reservado',
            reserva_apartado: true,
            cargador_id: cargador?.id || null,
            asignado_nombre: cargador ? null : fila.nombre_completo,
          };
        }
        filaOk += 1;
        ok += 1;
      }

      if (filaOk > 0) {
        resultados.push({
          fila: fila.filaExcel,
          ok: true,
          mensaje: `${fila.nombre_completo}: ${filaOk} espacio(s) apartado(s) en turno ${turno.numero_turno}`,
        });
      }
      continue;
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
      continue;
    }

    const turno = turnos.find((t) => t.numero_turno === numeroTurno);
    if (!turno) {
      resultados.push({
        fila: fila.filaExcel,
        ok: false,
        mensaje: `No existe turno ${numeroTurno}, brazo ${numeroBrazo} ${lado}`,
      });
      omitidos += 1;
      continue;
    }

    const brazo = (brazosPorTurno[turno.id] || []).find(
      (b) => b.numero_brazo === numeroBrazo && b.lado === lado
    );

    if (!brazo) {
      resultados.push({
        fila: fila.filaExcel,
        ok: false,
        mensaje: `No existe turno ${numeroTurno}, brazo ${numeroBrazo} ${lado}`,
      });
      omitidos += 1;
      continue;
    }

    if (brazo.estado === 'vendido') {
      resultados.push({
        fila: fila.filaExcel,
        ok: false,
        mensaje: 'Ya está vendido',
      });
      omitidos += 1;
      continue;
    }

    const cargador = await upsertCargadorParcialImport(organizacionId, fila);
    const error = await marcarBrazoApartado(brazo, fila, cargador, usuarioId);

    if (error) {
      resultados.push({
        fila: fila.filaExcel,
        ok: false,
        mensaje: error.message || 'Error al apartar',
      });
      omitidos += 1;
      continue;
    }

    brazosApartadosIds.add(brazo.id);
    resultados.push({
      fila: fila.filaExcel,
      ok: true,
      mensaje: `Apartado T${numeroTurno} B${numeroBrazo} ${lado}`,
    });
    ok += 1;
  }

  return { ok, omitidos, total: filas.length, resultados };
}

export async function quitarApartados(organizacionId, cortejoId, { brazoIds = [], turnoId } = {}) {
  if (!organizacionId || !cortejoId) {
    return { error: 'Organización o procesión no válida.' };
  }

  let ids = [...new Set((brazoIds || []).filter(Boolean))];

  if (turnoId) {
    const { data: turno, error: turnoErr } = await supabase
      .from('turnos')
      .select('id')
      .eq('id', turnoId)
      .eq('cortejo_id', cortejoId)
      .eq('organizacion_id', organizacionId)
      .maybeSingle();

    if (turnoErr) return err(turnoErr);
    if (!turno) return { error: 'Turno no encontrado en esta procesión.' };

    const { data: brazosTurno, error: bErr } = await supabase
      .from('brazos')
      .select('id, estado, reserva_apartado')
      .eq('turno_id', turnoId)
      .eq('organizacion_id', organizacionId);

    if (bErr) return err(bErr);

    const reservadosTurno = (brazosTurno || [])
      .filter(esBrazoReservadoLiberable)
      .map((b) => b.id);
    ids = [...new Set([...ids, ...reservadosTurno])];
  }

  if (!ids.length) {
    return { error: 'No hay reservas para liberar.' };
  }

  const { data: brazos, error: readErr } = await supabase
    .from('brazos')
    .select('id, estado, reserva_apartado, numero_brazo, lado, turno_id')
    .in('id', ids)
    .eq('organizacion_id', organizacionId);

  if (readErr) return err(readErr);

  const quitables = (brazos || []).filter(esBrazoReservadoLiberable);
  const omitidos = (brazos || []).length - quitables.length;

  if (!quitables.length) {
    return {
      error: 'Ningún espacio seleccionado está reservado (puede estar vendido o ya libre).',
      omitidos,
    };
  }

  const { error: updateErr } = await supabase
    .from('brazos')
    .update(RESET_BRAZO_APARTADO)
    .in(
      'id',
      quitables.map((b) => b.id)
    )
    .eq('organizacion_id', organizacionId)
    .eq('estado', 'reservado');

  if (updateErr) return err(updateErr);

  return {
    ok: quitables.length,
    omitidos,
    total: ids.length,
    mensaje: `${quitables.length} reserva(s) liberada(s)${omitidos ? ` · ${omitidos} omitida(s)` : ''}.`,
  };
}
