/**
 * Boletas públicas por CUI/DPI (sin login). Solo ventas confirmadas de la organización indicada.
 */
import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from './_lib/verifyCaller.js';

const BRAZO_FIELDS =
  'id, numero_turno, numero_brazo, lado, precio_pagado, codigo_boleta_qr, estado, estado_entrega, turno_id, cargador_id, organizacion_id, compra_id, operador_nombre, vendedor_id';

const TURNO_FIELDS =
  'id, numero_turno, etiqueta, tipo_turno, precio, cortejo_id, son, alabado';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizarCui(texto) {
  return String(texto || '').replace(/\D/g, '');
}

async function resolverOrganizacion(admin, orgParam) {
  const slug = String(orgParam || '').trim();
  if (!slug) return null;

  let query = admin.from('organizaciones').select('id, nombre_oficial, subdominio_slug');
  if (UUID_RE.test(slug)) {
    query = query.eq('id', slug);
  } else {
    query = query.eq('subdominio_slug', slug);
  }

  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  return data;
}

async function cargarTurnos(admin, turnoIds) {
  const ids = [...new Set(turnoIds.filter(Boolean))];
  if (ids.length === 0) return {};
  const { data } = await admin.from('turnos').select(TURNO_FIELDS).in('id', ids);
  return Object.fromEntries((data || []).map((t) => [t.id, t]));
}

function armarItems(brazos, turnosPorId) {
  return (brazos || []).map((brazo) => ({
    brazo,
    turno: turnosPorId[brazo.turno_id] || null,
  }));
}

function agruparBrazos(brazos) {
  const map = new Map();
  (brazos || []).forEach((b) => {
    const key = b.compra_id || `solo-${b.id}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(b);
  });
  return [...map.values()].map((grupo) =>
    [...grupo].sort((a, b) => (a.numero_turno || 0) - (b.numero_turno || 0))
  );
}

async function armarBoleta(admin, brazosGrupo, cargador, orgId) {
  const brazoPrincipal = brazosGrupo[0];
  const turnosPorId = await cargarTurnos(
    admin,
    brazosGrupo.map((b) => b.turno_id)
  );
  const turnoPrincipal = turnosPorId[brazoPrincipal.turno_id] || null;
  const items = armarItems(brazosGrupo, turnosPorId);

  let compra = null;
  if (brazoPrincipal.compra_id) {
    const { data } = await admin
      .from('compras')
      .select('id, codigo_recibo, total_pagado, organizacion_id, cargador_id, operador_nombre, vendedor_id')
      .eq('id', brazoPrincipal.compra_id)
      .maybeSingle();
    compra = data || null;
  }

  const [{ data: cortejo }, { data: recibo }] = await Promise.all([
    turnoPrincipal?.cortejo_id
      ? admin
          .from('cortejos')
          .select('id, nombre_evento, estado, fecha')
          .eq('id', turnoPrincipal.cortejo_id)
          .single()
      : Promise.resolve({ data: null }),
    admin
      .from('configuracion_recibo')
      .select('formato, diseño')
      .eq('organizacion_id', orgId)
      .maybeSingle(),
  ]);

  if (cortejo?.estado === 'inactiva') {
    return null;
  }

  return {
    brazo: brazoPrincipal,
    turno: turnoPrincipal,
    cortejo,
    cargador,
    items,
    compra,
    reciboConfig: recibo || null,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const orgParam = String(req.query.org || '').trim();
  if (!orgParam) {
    return res.status(400).json({ error: 'Organización no indicada' });
  }

  const { url, serviceKey } = getSupabaseConfig();
  if (!serviceKey) {
    return res.status(503).json({ error: 'Servicio no configurado' });
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const organizacion = await resolverOrganizacion(admin, orgParam);
  if (!organizacion) {
    return res.status(404).json({ error: 'Organización no encontrada' });
  }

  const cuiRaw = String(req.query.cui || '').trim();
  if (!cuiRaw) {
    return res.status(200).json({ organizacion, boletas: [] });
  }

  const cui = normalizarCui(cuiRaw);
  if (cui.length < 4 || cui.length > 20) {
    return res.status(400).json({ error: 'Ingrese un DPI/CUI válido' });
  }

  const { data: cargador, error: errCargador } = await admin
    .from('cargadores_organizacion')
    .select('id, nombre_completo, cui_o_identificacion')
    .eq('organizacion_id', organizacion.id)
    .eq('cui_o_identificacion', cui)
    .maybeSingle();

  if (errCargador) {
    return res.status(500).json({ error: 'Error al buscar sus turnos' });
  }

  if (!cargador) {
    return res.status(404).json({
      error: 'No encontramos boletas con ese DPI. Verifique el número e intente de nuevo.',
    });
  }

  const { data: brazos, error: errBrazos } = await admin
    .from('brazos')
    .select(BRAZO_FIELDS)
    .eq('cargador_id', cargador.id)
    .eq('organizacion_id', organizacion.id)
    .eq('estado', 'vendido')
    .order('numero_turno', { ascending: true });

  if (errBrazos) {
    return res.status(500).json({ error: 'Error al buscar sus turnos' });
  }

  if (!brazos?.length) {
    return res.status(404).json({
      error: 'No encontramos boletas pagadas a su nombre con ese DPI.',
    });
  }

  const grupos = agruparBrazos(brazos);
  const boletas = (
    await Promise.all(
      grupos.map((grupo) => armarBoleta(admin, grupo, cargador, organizacion.id))
    )
  ).filter(Boolean);

  if (!boletas.length) {
    return res.status(404).json({
      error: 'No hay boletas activas disponibles para descargar en este momento.',
    });
  }

  return res.status(200).json({
    organizacion,
    cargador,
    boletas,
  });
}
