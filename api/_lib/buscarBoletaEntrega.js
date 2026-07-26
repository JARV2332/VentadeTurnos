const BRAZO_FIELDS =
  'id, organizacion_id, turno_id, numero_turno, numero_brazo, lado, estado, reserva_apartado, apartado_notas, asignado_nombre, cargador_id, bloqueado_hasta, mesa_id, vendedor_id, precio_pagado, codigo_boleta_qr, compra_id, metodo_pago, comprobante_url, estado_entrega, entregado_a_tercero, entregado_receptor_nombre, operador_nombre, pago_confirmado_en, updated_at, created_at';

const TURNO_FIELDS =
  'id, cortejo_id, numero_turno, tipo_turno, etiqueta, precio, son, alabado, hora_estimada, total_brazos, organizacion_id';

const COMPRA_FIELDS =
  'id, organizacion_id, cargador_id, codigo_recibo, total_pagado, estado, operador_nombre, vendedor_id, created_at';

function normalizarCodigo(codigo) {
  const limpio =
    String(codigo || '')
      .trim()
      .toUpperCase()
      .match(/V[RT]-[A-Z0-9]+/)?.[0] || String(codigo || '').trim().toUpperCase();
  return limpio;
}

function mapRpcPayload(rpcData) {
  return {
    brazo: rpcData.brazo,
    brazos: rpcData.brazos || [],
    compra: rpcData.compra || null,
    turno: rpcData.turno || null,
    cortejo: rpcData.cortejo || null,
    cargador: rpcData.cargador || null,
    items: rpcData.items || [],
  };
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

async function cargarTurnos(admin, turnoIds) {
  const ids = [...new Set((turnoIds || []).filter(Boolean))];
  if (!ids.length) return {};
  const { data, error } = await admin.from('turnos').select(TURNO_FIELDS).in('id', ids);
  if (error) throw error;
  return Object.fromEntries((data || []).map((t) => [t.id, t]));
}

async function buscarBoletaEntregaQueries(admin, organizacionId, codigoLimpio) {
  const esVR = /^VR-[A-Z0-9]+$/.test(codigoLimpio);
  let compra = null;
  let brazos = [];
  let brazoPrincipal = null;

  if (esVR) {
    const { data: compraData, error: errCompra } = await admin
      .from('compras')
      .select(COMPRA_FIELDS)
      .eq('organizacion_id', organizacionId)
      .eq('codigo_recibo', codigoLimpio)
      .maybeSingle();

    if (errCompra) throw errCompra;
    if (!compraData) {
      return { error: 'Boleta no encontrada o no corresponde a esta organización.' };
    }
    if (compraData.estado === 'anulada') {
      return { error: 'Esta boleta ya fue anulada.' };
    }

    compra = compraData;

    const { data: brazosCompra, error: errBrazos } = await admin
      .from('brazos')
      .select(BRAZO_FIELDS)
      .eq('compra_id', compra.id)
      .eq('organizacion_id', organizacionId)
      .eq('estado', 'vendido')
      .order('numero_turno', { ascending: true })
      .order('numero_brazo', { ascending: true });

    if (errBrazos) throw errBrazos;
    if (!brazosCompra?.length) {
      return { error: 'Boleta no encontrada o no corresponde a esta organización.' };
    }

    brazos = brazosCompra;
    brazoPrincipal = brazosCompra[0];
  } else {
    const { data: brazo, error } = await admin
      .from('brazos')
      .select(BRAZO_FIELDS)
      .eq('organizacion_id', organizacionId)
      .eq('codigo_boleta_qr', codigoLimpio)
      .eq('estado', 'vendido')
      .maybeSingle();

    if (error) throw error;
    if (!brazo) {
      return { error: 'Boleta no encontrada o no corresponde a esta organización.' };
    }

    brazoPrincipal = brazo;

    if (brazo.compra_id) {
      const [{ data: compraData }, { data: brazosCompra }] = await Promise.all([
        admin
          .from('compras')
          .select(COMPRA_FIELDS)
          .eq('id', brazo.compra_id)
          .eq('organizacion_id', organizacionId)
          .maybeSingle(),
        admin
          .from('brazos')
          .select(BRAZO_FIELDS)
          .eq('compra_id', brazo.compra_id)
          .eq('organizacion_id', organizacionId)
          .eq('estado', 'vendido')
          .order('numero_turno', { ascending: true })
          .order('numero_brazo', { ascending: true }),
      ]);

      compra = compraData || null;
      if (compra?.estado === 'anulada') {
        return { error: 'Esta boleta ya fue anulada.' };
      }
      brazos = brazosCompra?.length ? brazosCompra : [brazo];
    } else {
      brazos = [brazo];
    }
  }

  const [turnosPorId, cargadorRes] = await Promise.all([
    cargarTurnos(
      admin,
      brazos.map((b) => b.turno_id)
    ),
    brazoPrincipal.cargador_id
      ? admin
          .from('cargadores_organizacion')
          .select('*')
          .eq('id', brazoPrincipal.cargador_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const turnoPrincipal = turnosPorId[brazoPrincipal.turno_id] || null;
  const cortejoId = turnoPrincipal?.cortejo_id;

  const { data: cortejo } = cortejoId
    ? await admin.from('cortejos').select('*').eq('id', cortejoId).maybeSingle()
    : { data: null };

  if (cortejo?.estado === 'inactiva') {
    return { error: 'La procesión de esta boleta está inactiva.' };
  }

  const items = brazos.map((b) => ({
    brazo: b,
    turno: turnosPorId[b.turno_id] || null,
  }));

  return {
    brazo: brazoPrincipal,
    brazos,
    compra,
    turno: turnoPrincipal,
    cortejo: cortejo || null,
    cargador: cargadorRes.data || null,
    items,
  };
}

export async function buscarBoletaEntrega(admin, organizacionId, codigo) {
  const codigoLimpio = normalizarCodigo(codigo);
  if (!codigoLimpio) {
    return { error: 'Código de boleta inválido.' };
  }

  const { data: rpcData, error: rpcError } = await admin.rpc('buscar_boleta_entrega_org', {
    p_codigo: codigoLimpio,
    p_organizacion_id: organizacionId,
  });

  if (!rpcError && rpcData && typeof rpcData === 'object' && !Array.isArray(rpcData)) {
    if (rpcData.error) return { error: rpcData.error };
    return mapRpcPayload(rpcData);
  }

  if (rpcError && !isMissingRpc(rpcError)) {
    throw rpcError;
  }

  return buscarBoletaEntregaQueries(admin, organizacionId, codigoLimpio);
}
