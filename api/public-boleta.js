/**
 * Boleta pública por código QR (sin login). Solo ventas confirmadas.
 */
import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from './verifyCaller.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const codigo = String(req.query.codigo || '')
    .trim()
    .toUpperCase();
  if (!codigo || !/^VT-[A-Z0-9]+$/.test(codigo)) {
    return res.status(400).json({ error: 'Código de boleta inválido' });
  }

  const { url, serviceKey } = getSupabaseConfig();
  if (!serviceKey) {
    return res.status(503).json({ error: 'Servicio no configurado' });
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: brazo, error } = await admin
    .from('brazos')
    .select(
      'id, numero_turno, numero_brazo, precio_pagado, codigo_boleta_qr, estado, estado_entrega, turno_id, cargador_id, organizacion_id'
    )
    .eq('codigo_boleta_qr', codigo)
    .eq('estado', 'vendido')
    .maybeSingle();

  if (error) {
    return res.status(500).json({ error: 'Error al buscar la boleta' });
  }
  if (!brazo) {
    return res.status(404).json({ error: 'Boleta no encontrada' });
  }

  const { data: turno } = await admin
    .from('turnos')
    .select('id, etiqueta, tipo_turno, precio, cortejo_id')
    .eq('id', brazo.turno_id)
    .single();

  const [{ data: cortejo }, { data: org }, { data: cargador }, { data: recibo }] =
    await Promise.all([
      turno?.cortejo_id
        ? admin
            .from('cortejos')
            .select('id, nombre_evento, estado')
            .eq('id', turno.cortejo_id)
            .single()
        : Promise.resolve({ data: null }),
      admin.from('organizaciones').select('id, nombre_oficial').eq('id', brazo.organizacion_id).single(),
      brazo.cargador_id
        ? admin
            .from('cargadores_organizacion')
            .select('nombre_completo')
            .eq('id', brazo.cargador_id)
            .single()
        : Promise.resolve({ data: null }),
      admin
        .from('configuracion_recibo')
        .select('formato, diseño')
        .eq('organizacion_id', brazo.organizacion_id)
        .maybeSingle(),
    ]);

  if (cortejo?.estado === 'inactiva') {
    return res.status(410).json({ error: 'Esta procesión ya no está activa' });
  }

  return res.status(200).json({
    brazo,
    turno,
    cortejo,
    organizacion: org,
    cargador,
    reciboConfig: recibo || null,
  });
}
