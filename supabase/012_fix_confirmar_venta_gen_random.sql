-- Fix error 42883: function gen_random_bytes(integer) does not exist
-- Ejecutar en Supabase → SQL Editor → Run (proyecto kolhnoectddjgfowyvux)

-- Opcional (recomendado para otras funciones): habilitar pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.confirmar_venta_brazo(
  p_brazo_id UUID,
  p_cargador_id UUID,
  p_precio_pagado NUMERIC,
  p_metodo_pago TEXT DEFAULT 'efectivo',
  p_comprobante_url TEXT DEFAULT NULL
)
RETURNS public.brazos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brazo public.brazos;
  v_codigo TEXT;
BEGIN
  v_codigo := 'VT-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 10));

  UPDATE public.brazos
  SET
    estado = 'vendido',
    cargador_id = p_cargador_id,
    precio_pagado = p_precio_pagado,
    codigo_boleta_qr = v_codigo,
    bloqueado_hasta = NULL,
    metodo_pago = COALESCE(p_metodo_pago, 'efectivo'),
    comprobante_url = p_comprobante_url,
    pago_confirmado_en = NOW(),
    estado_entrega = 'pendiente',
    updated_at = NOW()
  WHERE id = p_brazo_id
    AND organizacion_id = public.get_user_organizacion_id()
    AND estado = 'reservado'
  RETURNING * INTO v_brazo;

  IF v_brazo.id IS NULL THEN
    RAISE EXCEPTION 'No se pudo confirmar la venta';
  END IF;
  RETURN v_brazo;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirmar_venta_brazo TO authenticated;
