-- Anular venta / boleta: libera brazos y marca compra como anulada
-- Ejecutar en Supabase SQL Editor

ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'activa';

ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS anulada_en TIMESTAMPTZ;

ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS anulada_por UUID;

ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'compras_estado_check'
  ) THEN
    ALTER TABLE public.compras
      ADD CONSTRAINT compras_estado_check
      CHECK (estado IN ('activa', 'anulada'));
  END IF;
END $$;

ALTER TABLE public.compras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS compras_select ON public.compras;
CREATE POLICY compras_select ON public.compras
  FOR SELECT USING (organizacion_id = public.get_user_organizacion_id());

DROP POLICY IF EXISTS compras_update ON public.compras;
CREATE POLICY compras_update ON public.compras
  FOR UPDATE USING (organizacion_id = public.get_user_organizacion_id());

CREATE OR REPLACE FUNCTION public.anular_venta_por_codigo(
  p_codigo TEXT,
  p_motivo TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID;
  v_codigo TEXT;
  v_compra public.compras;
  v_brazo public.brazos;
  v_brazos UUID[];
  v_entregados INT;
  v_n INT;
BEGIN
  v_org := public.get_user_organizacion_id();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Organización no identificada';
  END IF;

  v_codigo := UPPER(TRIM(COALESCE(p_codigo, '')));
  IF v_codigo !~ '^V[RT]-[A-Z0-9]+$' THEN
    RAISE EXCEPTION 'Código de boleta inválido';
  END IF;

  IF v_codigo LIKE 'VR-%' THEN
    SELECT * INTO v_compra
    FROM public.compras
    WHERE organizacion_id = v_org
      AND codigo_recibo = v_codigo
      AND COALESCE(estado, 'activa') = 'activa'
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Boleta no encontrada o ya anulada';
    END IF;

    SELECT ARRAY_AGG(id ORDER BY numero_turno, numero_brazo, lado)
    INTO v_brazos
    FROM public.brazos
    WHERE compra_id = v_compra.id
      AND organizacion_id = v_org
      AND estado = 'vendido';

    IF v_brazos IS NULL OR array_length(v_brazos, 1) IS NULL THEN
      RAISE EXCEPTION 'Boleta no encontrada o ya anulada';
    END IF;
  ELSE
    SELECT * INTO v_brazo
    FROM public.brazos
    WHERE organizacion_id = v_org
      AND codigo_boleta_qr = v_codigo
      AND estado = 'vendido'
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Boleta no encontrada o ya anulada';
    END IF;

    IF v_brazo.compra_id IS NOT NULL THEN
      SELECT * INTO v_compra
      FROM public.compras
      WHERE id = v_brazo.compra_id
        AND organizacion_id = v_org
        AND COALESCE(estado, 'activa') = 'activa';

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Compra asociada no encontrada o ya anulada';
      END IF;

      SELECT ARRAY_AGG(id ORDER BY numero_turno, numero_brazo, lado)
      INTO v_brazos
      FROM public.brazos
      WHERE compra_id = v_compra.id
        AND organizacion_id = v_org
        AND estado = 'vendido';
    ELSE
      v_brazos := ARRAY[v_brazo.id];
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_entregados
  FROM public.brazos
  WHERE id = ANY(v_brazos)
    AND estado_entrega = 'entregado';

  IF v_entregados > 0 THEN
    RAISE EXCEPTION 'No se puede anular: uno o más turnos ya fueron entregados';
  END IF;

  UPDATE public.brazos
  SET
    estado = 'disponible',
    cargador_id = NULL,
    codigo_boleta_qr = NULL,
    precio_pagado = NULL,
    compra_id = NULL,
    bloqueado_hasta = NULL,
    vendedor_id = NULL,
    mesa_id = NULL,
    metodo_pago = NULL,
    comprobante_url = NULL,
    pago_confirmado_en = NULL,
    operador_nombre = NULL,
    estado_entrega = 'pendiente',
    entregado_en = NULL,
    entregado_por = NULL,
    reserva_apartado = false,
    asignado_nombre = NULL,
    apartado_notas = NULL,
    updated_at = NOW()
  WHERE id = ANY(v_brazos)
    AND organizacion_id = v_org
    AND estado = 'vendido';

  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'No se pudo liberar ningún espacio';
  END IF;

  IF v_compra.id IS NOT NULL THEN
    UPDATE public.compras
    SET
      estado = 'anulada',
      anulada_en = NOW(),
      anulada_por = auth.uid(),
      motivo_anulacion = NULLIF(TRIM(p_motivo), '')
    WHERE id = v_compra.id
      AND organizacion_id = v_org;
  END IF;

  RETURN jsonb_build_object(
    'codigo', v_codigo,
    'brazos_liberados', v_n,
    'compra_id', v_compra.id,
    'motivo', NULLIF(TRIM(p_motivo), '')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.anular_venta_por_codigo(TEXT, TEXT) TO authenticated;
