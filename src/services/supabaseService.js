/**
 * Capa de datos Supabase (async).
 */
import { supabase, subscribeBrazos } from '../config/supabaseClient';
import {
  agruparTurnosConBrazos,
  construirTurnosConfig,
  crearBrazosParaTurno,
} from '../utils/turnoUtils';
import { normalizarLado } from '../utils/importReservasUtils';
import { PERMISOS_ADMIN_COMPLETO } from '../config/permisos';

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

async function confirmarVentaDirecto(brazoId, cargador, precioPagado, pagoData = {}) {
  const codigo = generarCodigoBoletaCliente();
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

export function subscribeSupabase(organizacionId, callback) {
  return subscribeBrazos(organizacionId, () => callback());
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

export async function getTurnosAgrupados(cortejoId, organizacionId) {
  const turnos = await getTurnosByCortejo(cortejoId);
  const brazos = (await getBrazosByOrg(organizacionId)).filter((b) =>
    turnos.some((t) => t.id === b.turno_id)
  );
  return agruparTurnosConBrazos(turnos, brazos);
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

export async function buscarCargadorPorWhatsapp(organizacionId, whatsapp) {
  const limpio = whatsapp.replace(/\D/g, '');
  const { data } = await supabase
    .from('cargadores_organizacion')
    .select('*')
    .eq('organizacion_id', organizacionId)
    .eq('whatsapp', limpio)
    .maybeSingle();
  return data;
}

export async function reservarBrazo(brazoId, mesaId, vendedorId) {
  const { data, error } = await supabase.rpc('reservar_brazo', {
    p_brazo_id: brazoId,
    p_mesa_id: mesaId,
    p_vendedor_id: vendedorId,
  });
  if (error) {
    if (isMissingRpc(error)) {
      return reservarBrazoDirecto(brazoId, mesaId, vendedorId);
    }
    return err(error);
  }
  return { data };
}

export async function confirmarVenta(brazoId, cargadorData, precioPagado, pagoData = {}) {
  const orgId = cargadorData.organizacion_id;
  const whatsapp = cargadorData.whatsapp?.replace(/\D/g, '');
  if (!whatsapp) return { error: 'WhatsApp obligatorio' };

  let cargador = await buscarCargadorPorWhatsapp(orgId, whatsapp);
  if (!cargador) {
    const { data, error } = await supabase
      .from('cargadores_organizacion')
      .insert({
        organizacion_id: orgId,
        nombre_completo: cargadorData.nombre_completo,
        whatsapp,
        correo: cargadorData.correo?.trim() || '',
        cui_o_identificacion: cargadorData.cui_o_identificacion || '',
        telefono_emergencia: cargadorData.telefono_emergencia || '',
      })
      .select()
      .single();
    if (error) return err(error);
    cargador = data;
  } else {
    const { data, error } = await supabase
      .from('cargadores_organizacion')
      .update({
        nombre_completo: cargadorData.nombre_completo || cargador.nombre_completo,
        correo: cargadorData.correo || cargador.correo,
        cui_o_identificacion: cargadorData.cui_o_identificacion || cargador.cui_o_identificacion,
        telefono_emergencia: cargadorData.telefono_emergencia || cargador.telefono_emergencia,
      })
      .eq('id', cargador.id)
      .select()
      .single();
    if (error) return err(error);
    cargador = data;
  }

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

export async function buscarBoletaPorCodigo(organizacionId, codigo) {
  const codigoLimpio = codigo.trim().toUpperCase();
  const { data: brazo, error } = await supabase
    .from('brazos')
    .select('*')
    .eq('organizacion_id', organizacionId)
    .eq('codigo_boleta_qr', codigoLimpio)
    .eq('estado', 'vendido')
    .maybeSingle();

  if (error) return err(error);
  if (!brazo) return { error: 'Boleta no encontrada o no corresponde a esta organización.' };

  const { data: turno } = await supabase.from('turnos').select('*').eq('id', brazo.turno_id).single();
  const { data: cortejo } = await supabase.from('cortejos').select('*').eq('id', turno.cortejo_id).single();
  if (cortejo?.estado === 'inactiva') {
    return { error: 'La procesión de esta boleta está inactiva.' };
  }
  const cargador = brazo.cargador_id ? await getCargadorById(brazo.cargador_id) : null;
  return { brazo, turno, cortejo, cargador };
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
  const { data: brazos, error } = await supabase
    .from('brazos')
    .select('*')
    .eq('organizacion_id', organizacionId)
    .eq('estado', 'vendido');
  if (error) throw error;

  const { data: turnos } = await supabase
    .from('turnos')
    .select('id, precio, cortejo_id')
    .eq('organizacion_id', organizacionId);

  const presupuestoTotal = (turnos || []).reduce((s, t) => {
    const delTurno = (brazos || []).filter((b) => b.turno_id === t.id);
    return s + Number(t.precio) * (delTurno.length || 0);
  }, 0);

  const recaudado = (brazos || []).reduce((s, b) => s + Number(b.precio_pagado || 0), 0);

  const ventas = (brazos || []).map((b) => ({
    ...b,
    vendedor_id: b.vendedor_id,
    mesa_id: b.mesa_id,
  }));

  const mesas = await getMesasByOrg(organizacionId);
  const porMesa = (mesas || []).map((mesa) => {
    const ventasMesa = ventas.filter((b) => b.mesa_id === mesa.id);
    return {
      ...mesa,
      ventas: ventasMesa.length,
      total: ventasMesa.reduce((s, b) => s + Number(b.precio_pagado || 0), 0),
    };
  });

  return {
    ventas,
    recaudado,
    presupuestoTotal,
    brazosVendidos: brazos?.length || 0,
    porMesa,
  };
}

export async function getDashboardMetrics(organizacionId) {
  const fin = await getFinanzasByOrg(organizacionId);
  const cortejos = await getCortejosByOrg(organizacionId);
  const totalBrazos = (await getBrazosByOrg(organizacionId)).length;
  const vendidos = fin.brazosVendidos;
  return {
    ...fin,
    cortejosActivos: cortejos.length,
    ocupacion: totalBrazos ? Math.round((vendidos / totalBrazos) * 100) : 0,
  };
}

const EMAIL_CONFIG_PUBLIC =
  'id, organizacion_id, correo_remitente, nombre_remitente, correo_respuesta, notificaciones_activas, pie_correo, gmail_smtp_user, gmail_password_configurada, created_at, updated_at';

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
  const { data, error } = await supabase
    .from('correos_enviados')
    .insert({ organizacion_id: organizacionId, ...datos })
    .select()
    .single();
  if (error) return err(error);
  return data;
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
  const turnosPlan = construirTurnosConfig(configProcesion);
  const { data: nuevoCortejo, error: cErr } = await supabase
    .from('cortejos')
    .insert({
      organizacion_id: organizacionId,
      nombre_evento: cortejo.nombre_evento,
      fecha: cortejo.fecha,
      descripcion: cortejo.descripcion,
      estado: 'activa',
      config_procesion: configProcesion,
    })
    .select()
    .single();
  if (cErr) return err(cErr);

  const turnosCreados = [];
  const brazosCreados = [];

  for (const cfg of turnosPlan) {
    const { data: turno, error: tErr } = await supabase
      .from('turnos')
      .insert({
        organizacion_id: organizacionId,
        cortejo_id: nuevoCortejo.id,
        numero_turno: cfg.numero_turno,
        tipo_turno: cfg.tipo_turno,
        etiqueta: cfg.etiqueta,
        total_brazos: cfg.total_brazos,
        precio: cfg.precio,
        son: cfg.son,
        alabado: cfg.alabado,
      })
      .select()
      .single();
    if (tErr) return err(tErr);

    turnosCreados.push(turno);

    const brazos = crearBrazosParaTurno({
      turnoId: turno.id,
      numeroTurno: turno.numero_turno,
      totalBrazos: cfg.total_brazos,
      organizacionId,
      idPrefix: 'brazo',
    }).map(({ id, ...b }) => b);

    brazosCreados.push(...brazos);
  }

  for (let i = 0; i < brazosCreados.length; i += 80) {
    const { error: bErr } = await supabase.from('brazos').insert(brazosCreados.slice(i, i + 80));
    if (bErr) return err(bErr);
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

export async function getResumenApartados(cortejoId, organizacionId) {
  const turnos = await getTurnosAgrupados(cortejoId, organizacionId);
  return turnos.map((turno) => {
    const todos = [
      ...(Array.isArray(turno.izquierda) ? turno.izquierda : []),
      ...(Array.isArray(turno.derecha) ? turno.derecha : []),
    ];
    const apartados = todos.filter((b) => b.reserva_apartado);
    return { turno, apartados, total: todos.length, apartadosCount: apartados.length };
  });
}

export async function aplicarImportApartados(cortejoId, organizacionId, filas) {
  for (const fila of filas) {
    const lado = normalizarLado(fila.lado);
    const { data: turno } = await supabase
      .from('turnos')
      .select('id')
      .eq('cortejo_id', cortejoId)
      .eq('numero_turno', fila.numero_turno)
      .maybeSingle();
    if (!turno) continue;

    await supabase
      .from('brazos')
      .update({
        estado: 'reservado',
        reserva_apartado: true,
        asignado_nombre: fila.asignado_nombre || null,
        apartado_notas: fila.apartado_notas || null,
        bloqueado_hasta: null,
      })
      .eq('turno_id', turno.id)
      .eq('numero_brazo', fila.numero_brazo)
      .eq('lado', lado);
  }
  return { ok: true, aplicados: filas.length };
}
