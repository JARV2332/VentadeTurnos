/**
 * Boleta pública por código QR o recibo (sin login). Solo ventas confirmadas.
 * VT-… = brazo individual · VR-… = recibo multi-turno
 */
import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from './verifyCaller.js';

const BRAZO_FIELDS =
  'id, numero_turno, numero_brazo, lado, precio_pagado, codigo_boleta_qr, estado, estado_entrega, turno_id, cargador_id, organizacion_id, compra_id';

const TURNO_FIELDS =
  'id, numero_turno, etiqueta, tipo_turno, precio, cortejo_id, son, alabado';

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

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const codigo = String(req.query.codigo || '')
    .trim()
    .toUpperCase();
  const esVT = /^VT-[A-Z0-9]+$/.test(codigo);
  const esVR = /^VR-[A-Z0-9]+$/.test(codigo);

  if (!codigo || (!esVT && !esVR)) {
    return res.status(400).json({ error: 'Código de boleta inválido' });
  }

  const { url, serviceKey } = getSupabaseConfig();
  if (!serviceKey) {
    return res.status(503).json({ error: 'Servicio no configurado' });
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let brazos = [];
  let compra = null;
  let brazoPrincipal = null;

  if (esVR) {
    const { data: compraData, error: errCompra } = await admin
      .from('compras')
      .select('id, codigo_recibo, total_pagado, organizacion_id, cargador_id')
      .eq('codigo_recibo', codigo)
      .maybeSingle();

    if (errCompra) {
      return res.status(500).json({ error: 'Error al buscar la boleta' });
    }
    if (!compraData) {
      return res.status(404).json({ error: 'Boleta no encontrada' });
    }

    compra = compraData;

    const { data: brazosCompra, error: errBrazos } = await admin
      .from('brazos')
      .select(BRAZO_FIELDS)
      .eq('compra_id', compra.id)
      .eq('estado', 'vendido')
      .order('numero_turno', { ascending: true });

    if (errBrazos) {
      return res.status(500).json({ error: 'Error al buscar la boleta' });
    }
    if (!brazosCompra?.length) {
      return res.status(404).json({ error: 'Boleta no encontrada' });
    }

    brazos = brazosCompra;
    brazoPrincipal = brazosCompra[0];
  } else {
    const { data: brazo, error } = await admin
      .from('brazos')
      .select(BRAZO_FIELDS)
      .eq('codigo_boleta_qr', codigo)
      .eq('estado', 'vendido')
      .maybeSingle();

    if (error) {
      return res.status(500).json({ error: 'Error al buscar la boleta' });
    }
    if (!brazo) {
      return res.status(404).json({ error: 'Boleta no encontrada' });
    }

    brazoPrincipal = brazo;

    if (brazo.compra_id) {
      const [{ data: compraData }, { data: brazosCompra }] = await Promise.all([
        admin
          .from('compras')
          .select('id, codigo_recibo, total_pagado, organizacion_id, cargador_id')
          .eq('id', brazo.compra_id)
          .maybeSingle(),
        admin
          .from('brazos')
          .select(BRAZO_FIELDS)
          .eq('compra_id', brazo.compra_id)
          .eq('estado', 'vendido')
          .order('numero_turno', { ascending: true }),
      ]);

      compra = compraData || null;
      brazos = brazosCompra?.length ? brazosCompra : [brazo];
    } else {
      brazos = [brazo];
    }
  }

  const turnosPorId = await cargarTurnos(
    admin,
    brazos.map((b) => b.turno_id)
  );
  const turnoPrincipal = turnosPorId[brazoPrincipal.turno_id] || null;

  const [{ data: cortejo }, { data: org }, { data: cargador }, { data: recibo }] =
    await Promise.all([
      turnoPrincipal?.cortejo_id
        ? admin
            .from('cortejos')
            .select('id, nombre_evento, estado, fecha')
            .eq('id', turnoPrincipal.cortejo_id)
            .single()
        : Promise.resolve({ data: null }),
      admin
        .from('organizaciones')
        .select('id, nombre_oficial')
        .eq('id', brazoPrincipal.organizacion_id)
        .single(),
      brazoPrincipal.cargador_id
        ? admin
            .from('cargadores_organizacion')
            .select('nombre_completo, cui_o_identificacion')
            .eq('id', brazoPrincipal.cargador_id)
            .single()
        : Promise.resolve({ data: null }),
      admin
        .from('configuracion_recibo')
        .select('formato, diseño')
        .eq('organizacion_id', brazoPrincipal.organizacion_id)
        .maybeSingle(),
    ]);

  if (cortejo?.estado === 'inactiva') {
    return res.status(410).json({ error: 'Esta procesión ya no está activa' });
  }

  const items = armarItems(brazos, turnosPorId);

  return res.status(200).json({
    brazo: brazoPrincipal,
    turno: turnoPrincipal,
    cortejo,
    organizacion: org,
    cargador,
    reciboConfig: recibo || null,
    items,
    compra,
  });
}
