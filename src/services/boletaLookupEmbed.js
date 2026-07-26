/**
 * Búsqueda de boleta en 1 sola consulta PostgREST (embeds).
 * No depende de RPC ni de la API de Vercel.
 */
import { supabase } from '../config/supabaseClient';

const BRAZO_EMBED =
  'id, organizacion_id, turno_id, numero_turno, numero_brazo, lado, estado, cargador_id, precio_pagado, codigo_boleta_qr, compra_id, metodo_pago, estado_entrega, entregado_a_tercero, entregado_receptor_nombre, operador_nombre, pago_confirmado_en, updated_at, created_at';

const TURNO_EMBED =
  'id, cortejo_id, numero_turno, tipo_turno, etiqueta, precio, son, alabado, hora_estimada, organizacion_id, cortejos(id, nombre_evento, estado, fecha)';

const CARGADOR_EMBED =
  'id, nombre_completo, whatsapp, correo, cui_o_identificacion, telefono_emergencia';

const COMPRA_EMBED =
  'id, organizacion_id, cargador_id, codigo_recibo, total_pagado, estado, operador_nombre, vendedor_id, created_at';

function ordenarBrazos(brazos) {
  return [...(brazos || [])].sort((a, b) => {
    const t = (a.numero_turno ?? 0) - (b.numero_turno ?? 0);
    if (t !== 0) return t;
    const n = (a.numero_brazo ?? 0) - (b.numero_brazo ?? 0);
    if (n !== 0) return n;
    return String(a.lado || '').localeCompare(String(b.lado || ''));
  });
}

function turnoPlano(turnoRow) {
  if (!turnoRow) return null;
  const { cortejos, ...turno } = turnoRow;
  return { turno, cortejo: cortejos || null };
}

function armarResultado({ brazos, compra, cargador }) {
  const lista = ordenarBrazos(brazos);
  if (!lista.length) {
    return { error: 'Boleta no encontrada o no corresponde a esta organización.' };
  }

  const primero = lista[0];
  const { turno, cortejo } = turnoPlano(primero.turnos);
  if (cortejo?.estado === 'inactiva') {
    return { error: 'La procesión de esta boleta está inactiva.' };
  }

  const items = lista.map((b) => {
    const flat = turnoPlano(b.turnos);
    const { turnos: _t, ...brazo } = b;
    return { brazo, turno: flat.turno };
  });

  const brazosLimpios = items.map((i) => i.brazo);

  return {
    brazo: brazosLimpios[0],
    brazos: brazosLimpios,
    compra: compra || null,
    turno,
    cortejo,
    cargador: cargador || null,
    items,
  };
}

export async function buscarBoletaPorCodigoEmbed(organizacionId, codigoLimpio) {
  const esVR = /^VR-[A-Z0-9]+$/.test(codigoLimpio);

  if (esVR) {
    const { data, error } = await supabase
      .from('compras')
      .select(
        `${COMPRA_EMBED}, brazos!inner(${BRAZO_EMBED}, turnos(${TURNO_EMBED})), cargadores_organizacion(${CARGADOR_EMBED})`
      )
      .eq('organizacion_id', organizacionId)
      .eq('codigo_recibo', codigoLimpio)
      .eq('brazos.estado', 'vendido')
      .maybeSingle();

    if (error) return { error: error.message || String(error) };
    if (!data) {
      return { error: 'Boleta no encontrada o no corresponde a esta organización.' };
    }
    if (data.estado === 'anulada') {
      return { error: 'Esta boleta ya fue anulada.' };
    }

    const { brazos, cargadores_organizacion, ...compra } = data;
    return armarResultado({
      brazos,
      compra,
      cargador: cargadores_organizacion || null,
    });
  }

  const { data: brazoRow, error } = await supabase
    .from('brazos')
    .select(
      `${BRAZO_EMBED}, turnos(${TURNO_EMBED}), compras(${COMPRA_EMBED}), cargadores_organizacion(${CARGADOR_EMBED})`
    )
    .eq('organizacion_id', organizacionId)
    .eq('codigo_boleta_qr', codigoLimpio)
    .eq('estado', 'vendido')
    .maybeSingle();

  if (error) return { error: error.message || String(error) };
  if (!brazoRow) {
    return { error: 'Boleta no encontrada o no corresponde a esta organización.' };
  }

  if (brazoRow.compras?.estado === 'anulada') {
    return { error: 'Esta boleta ya fue anulada.' };
  }

  if (brazoRow.compra_id) {
    const { data: compraFull, error: errCompra } = await supabase
      .from('compras')
      .select(
        `${COMPRA_EMBED}, brazos!inner(${BRAZO_EMBED}, turnos(${TURNO_EMBED})), cargadores_organizacion(${CARGADOR_EMBED})`
      )
      .eq('id', brazoRow.compra_id)
      .eq('organizacion_id', organizacionId)
      .eq('brazos.estado', 'vendido')
      .maybeSingle();

    if (errCompra) return { error: errCompra.message || String(errCompra) };
    if (compraFull) {
      if (compraFull.estado === 'anulada') {
        return { error: 'Esta boleta ya fue anulada.' };
      }
      const { brazos, cargadores_organizacion, ...compra } = compraFull;
      return armarResultado({
        brazos,
        compra,
        cargador: cargadores_organizacion || null,
      });
    }
  }

  const { turnos, compras, cargadores_organizacion, ...brazo } = brazoRow;
  const { turno, cortejo } = turnoPlano(turnos);
  if (cortejo?.estado === 'inactiva') {
    return { error: 'La procesión de esta boleta está inactiva.' };
  }

  return {
    brazo,
    brazos: [brazo],
    compra: compras || null,
    turno,
    cortejo,
    cargador: cargadores_organizacion || null,
    items: [{ brazo, turno }],
  };
}
