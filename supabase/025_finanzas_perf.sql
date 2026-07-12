-- Finanzas / Caja: ventas y compras en JSON (SECURITY DEFINER, sin OFFSET lento ni RLS fila a fila)

CREATE INDEX IF NOT EXISTS idx_brazos_org_vendido_pago
  ON public.brazos(organizacion_id, pago_confirmado_en DESC NULLS LAST)
  WHERE estado = 'vendido';

CREATE INDEX IF NOT EXISTS idx_compras_org_pago
  ON public.compras(organizacion_id, pago_confirmado_en DESC NULLS LAST);

CREATE OR REPLACE FUNCTION public.get_finanzas_ventas_json(p_organizacion_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_org_access(p_organizacion_id);

  RETURN COALESCE((
    SELECT json_agg(row_to_json(x))
    FROM (
      SELECT
        b.id,
        b.turno_id,
        COALESCE(b.numero_turno, t.numero_turno) AS numero_turno,
        b.numero_brazo,
        b.lado,
        b.estado,
        b.precio_pagado,
        b.codigo_boleta_qr,
        b.compra_id,
        b.cargador_id,
        b.mesa_id,
        COALESCE(b.vendedor_id, c.vendedor_id) AS vendedor_id,
        COALESCE(NULLIF(trim(b.operador_nombre), ''), NULLIF(trim(c.operador_nombre), '')) AS operador_nombre,
        b.metodo_pago,
        (b.comprobante_url IS NOT NULL AND b.comprobante_url <> '') AS tiene_comprobante,
        b.estado_entrega,
        b.pago_confirmado_en,
        b.updated_at,
        b.created_at,
        t.tipo_turno,
        COALESCE(t.etiqueta, t.tipo_turno) AS turno_etiqueta,
        t.hora_estimada,
        cj.fecha AS fecha_evento,
        cj.nombre_evento AS cortejo_nombre
      FROM public.brazos b
      LEFT JOIN public.turnos t ON t.id = b.turno_id
      LEFT JOIN public.cortejos cj ON cj.id = t.cortejo_id
      LEFT JOIN public.compras c ON c.id = b.compra_id
      WHERE b.organizacion_id = p_organizacion_id
        AND b.estado = 'vendido'
    ) x
  ), '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_finanzas_ventas_json(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_finanzas_ventas_json(uuid) TO anon;

CREATE OR REPLACE FUNCTION public.get_compras_org_json(p_organizacion_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_org_access(p_organizacion_id);

  RETURN COALESCE((
    SELECT json_agg(row_to_json(c))
    FROM (
      SELECT
        id,
        organizacion_id,
        codigo_recibo,
        total_pagado,
        cargador_id,
        vendedor_id,
        operador_nombre,
        metodo_pago,
        (comprobante_url IS NOT NULL AND comprobante_url <> '') AS tiene_comprobante,
        estado,
        pago_confirmado_en,
        created_at
      FROM public.compras
      WHERE organizacion_id = p_organizacion_id
    ) c
  ), '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_compras_org_json(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_compras_org_json(uuid) TO anon;

CREATE OR REPLACE FUNCTION public.get_brazos_vendidos_org_json(p_organizacion_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_org_access(p_organizacion_id);

  RETURN COALESCE((
    SELECT json_agg(row_to_json(b))
    FROM (
      SELECT
        id,
        turno_id,
        numero_turno,
        numero_brazo,
        lado,
        estado,
        precio_pagado,
        codigo_boleta_qr,
        compra_id,
        cargador_id,
        mesa_id,
        vendedor_id,
        operador_nombre,
        metodo_pago,
        (comprobante_url IS NOT NULL AND comprobante_url <> '') AS tiene_comprobante,
        estado_entrega,
        pago_confirmado_en,
        updated_at,
        created_at
      FROM public.brazos
      WHERE organizacion_id = p_organizacion_id
        AND estado = 'vendido'
    ) b
  ), '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_brazos_vendidos_org_json(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_brazos_vendidos_org_json(uuid) TO anon;
