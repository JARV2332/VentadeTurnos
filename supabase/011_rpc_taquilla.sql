-- Funciones RPC para taquilla (reservar / vender / entregar)
-- Ejecutar en Supabase SQL Editor si aparece 404 en reservar_brazo

ALTER TABLE public.brazos ADD COLUMN IF NOT EXISTS metodo_pago TEXT;
ALTER TABLE public.brazos ADD COLUMN IF NOT EXISTS comprobante_url TEXT;
ALTER TABLE public.brazos ADD COLUMN IF NOT EXISTS pago_confirmado_en TIMESTAMPTZ;
ALTER TABLE public.brazos ADD COLUMN IF NOT EXISTS estado_entrega TEXT DEFAULT 'pendiente';
ALTER TABLE public.brazos ADD COLUMN IF NOT EXISTS entregado_en TIMESTAMPTZ;
ALTER TABLE public.brazos ADD COLUMN IF NOT EXISTS entregado_por UUID;
ALTER TABLE public.brazos ADD COLUMN IF NOT EXISTS reserva_apartado BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.reservar_brazo(
  p_brazo_id UUID,
  p_mesa_id UUID,
  p_vendedor_id UUID
)
RETURNS public.brazos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brazo public.brazos;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'brazos' AND column_name = 'reserva_apartado'
  ) AND (SELECT reserva_apartado FROM public.brazos WHERE id = p_brazo_id) = true THEN
    RAISE EXCEPTION 'Espacio apartado por importación';
  END IF;

  UPDATE public.brazos
  SET
    estado = 'reservado',
    bloqueado_hasta = NOW() + INTERVAL '5 minutes',
    mesa_id = p_mesa_id,
    vendedor_id = p_vendedor_id,
    updated_at = NOW()
  WHERE id = p_brazo_id
    AND organizacion_id = public.get_user_organizacion_id()
    AND (
      estado = 'disponible'
      OR (estado = 'reservado' AND bloqueado_hasta < NOW())
    )
  RETURNING * INTO v_brazo;

  IF v_brazo.id IS NULL THEN
    RAISE EXCEPTION 'El espacio no está disponible';
  END IF;
  RETURN v_brazo;
END;
$$;

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
  -- gen_random_uuid() viene en PostgreSQL 14+ (no requiere extensión pgcrypto)
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

CREATE OR REPLACE FUNCTION public.marcar_entregado_brazo(p_brazo_id UUID)
RETURNS public.brazos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brazo public.brazos;
BEGIN
  UPDATE public.brazos
  SET
    estado_entrega = 'entregado',
    entregado_en = NOW(),
    entregado_por = auth.uid(),
    updated_at = NOW()
  WHERE id = p_brazo_id
    AND organizacion_id = public.get_user_organizacion_id()
    AND estado = 'vendido'
    AND estado_entrega = 'pendiente'
  RETURNING * INTO v_brazo;

  IF v_brazo.id IS NULL THEN
    RAISE EXCEPTION 'No se pudo marcar entregado';
  END IF;
  RETURN v_brazo;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reservar_brazo TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_venta_brazo TO authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_entregado_brazo TO authenticated;
