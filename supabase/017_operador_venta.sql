-- Operador de venta: nombre visible en boleta + vendedor en brazos para cuadre en caja
-- Ejecutar en Supabase SQL Editor

ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS operador_nombre TEXT;

ALTER TABLE public.brazos
  ADD COLUMN IF NOT EXISTS operador_nombre TEXT;

-- Quitar versión anterior (7 params) para no quedar con dos funciones homónimas
DROP FUNCTION IF EXISTS public.confirmar_venta_compra(
  UUID[], UUID, NUMERIC[], TEXT, TEXT, UUID, UUID
);

-- Por si ya se intentó correr este script y quedó la versión nueva a medias
DROP FUNCTION IF EXISTS public.confirmar_venta_compra(
  UUID[], UUID, NUMERIC[], TEXT, TEXT, UUID, UUID, TEXT
);

CREATE OR REPLACE FUNCTION public.confirmar_venta_compra(
  p_brazo_ids UUID[],
  p_cargador_id UUID,
  p_precios NUMERIC[],
  p_metodo_pago TEXT DEFAULT 'efectivo',
  p_comprobante_url TEXT DEFAULT NULL,
  p_mesa_id UUID DEFAULT NULL,
  p_vendedor_id UUID DEFAULT NULL,
  p_operador_nombre TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID;
  v_compra public.compras;
  v_codigo_recibo TEXT;
  v_total NUMERIC(10,2) := 0;
  v_i INT;
  v_brazo public.brazos;
  v_codigo_brazo TEXT;
  v_brazos JSONB := '[]'::JSONB;
  v_n INT;
  v_operador TEXT;
BEGIN
  v_org := public.get_user_organizacion_id();
  v_n := COALESCE(array_length(p_brazo_ids, 1), 0);
  v_operador := NULLIF(TRIM(p_operador_nombre), '');

  IF v_n = 0 THEN
    RAISE EXCEPTION 'Debe incluir al menos un brazo';
  END IF;

  IF v_n <> COALESCE(array_length(p_precios, 1), 0) THEN
    RAISE EXCEPTION 'Precios no coinciden con cantidad de brazos';
  END IF;

  FOR v_i IN 1..v_n LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.brazos
      WHERE id = p_brazo_ids[v_i]
        AND organizacion_id = v_org
        AND estado = 'reservado'
    ) THEN
      RAISE EXCEPTION 'Brazo % no reservado o no disponible', p_brazo_ids[v_i];
    END IF;
    v_total := v_total + COALESCE(p_precios[v_i], 0);
  END LOOP;

  v_codigo_recibo := 'VR-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 10));

  INSERT INTO public.compras (
    organizacion_id, cargador_id, codigo_recibo, total_pagado,
    metodo_pago, comprobante_url, mesa_id, vendedor_id, operador_nombre
  ) VALUES (
    v_org, p_cargador_id, v_codigo_recibo, v_total,
    COALESCE(p_metodo_pago, 'efectivo'), p_comprobante_url, p_mesa_id, p_vendedor_id, v_operador
  )
  RETURNING * INTO v_compra;

  FOR v_i IN 1..v_n LOOP
    v_codigo_brazo := 'VT-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 10));

    UPDATE public.brazos
    SET
      estado = 'vendido',
      cargador_id = p_cargador_id,
      precio_pagado = p_precios[v_i],
      codigo_boleta_qr = v_codigo_brazo,
      compra_id = v_compra.id,
      bloqueado_hasta = NULL,
      metodo_pago = COALESCE(p_metodo_pago, 'efectivo'),
      comprobante_url = p_comprobante_url,
      pago_confirmado_en = NOW(),
      estado_entrega = 'pendiente',
      vendedor_id = p_vendedor_id,
      mesa_id = p_mesa_id,
      operador_nombre = v_operador,
      updated_at = NOW()
    WHERE id = p_brazo_ids[v_i]
      AND organizacion_id = v_org
      AND estado = 'reservado'
    RETURNING * INTO v_brazo;

    IF v_brazo.id IS NULL THEN
      RAISE EXCEPTION 'No se pudo vender brazo %', p_brazo_ids[v_i];
    END IF;

    v_brazos := v_brazos || to_jsonb(v_brazo);
  END LOOP;

  RETURN jsonb_build_object(
    'compra', to_jsonb(v_compra),
    'brazos', v_brazos
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirmar_venta_compra(
  UUID[], UUID, NUMERIC[], TEXT, TEXT, UUID, UUID, TEXT
) TO authenticated;
