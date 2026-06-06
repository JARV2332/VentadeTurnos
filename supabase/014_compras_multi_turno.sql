-- Compras multi-turno: un devoto, N brazos, un recibo (VR-…) + QR por brazo (VT-…)
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.compras (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id     UUID NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  cargador_id         UUID NOT NULL REFERENCES public.cargadores_organizacion(id),
  codigo_recibo       TEXT NOT NULL UNIQUE,
  total_pagado        NUMERIC(10,2) NOT NULL DEFAULT 0,
  metodo_pago         TEXT DEFAULT 'efectivo',
  comprobante_url     TEXT,
  pago_confirmado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  vendedor_id         UUID,
  mesa_id             UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compras_org ON public.compras(organizacion_id);
CREATE INDEX IF NOT EXISTS idx_compras_cargador ON public.compras(cargador_id);

ALTER TABLE public.brazos
  ADD COLUMN IF NOT EXISTS compra_id UUID REFERENCES public.compras(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_brazos_compra ON public.brazos(compra_id);

CREATE OR REPLACE FUNCTION public.confirmar_venta_compra(
  p_brazo_ids UUID[],
  p_cargador_id UUID,
  p_precios NUMERIC[],
  p_metodo_pago TEXT DEFAULT 'efectivo',
  p_comprobante_url TEXT DEFAULT NULL,
  p_mesa_id UUID DEFAULT NULL,
  p_vendedor_id UUID DEFAULT NULL
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
BEGIN
  v_org := public.get_user_organizacion_id();
  v_n := COALESCE(array_length(p_brazo_ids, 1), 0);

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
    metodo_pago, comprobante_url, mesa_id, vendedor_id
  ) VALUES (
    v_org, p_cargador_id, v_codigo_recibo, v_total,
    COALESCE(p_metodo_pago, 'efectivo'), p_comprobante_url, p_mesa_id, p_vendedor_id
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

GRANT EXECUTE ON FUNCTION public.confirmar_venta_compra TO authenticated;
