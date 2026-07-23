-- Entrega a tercero + receptor en brazos
ALTER TABLE public.brazos
  ADD COLUMN IF NOT EXISTS entregado_a_tercero BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS entregado_receptor_nombre TEXT;

DROP FUNCTION IF EXISTS public.marcar_entregado_brazo(UUID);

CREATE OR REPLACE FUNCTION public.marcar_entregado_brazo(
  p_brazo_id UUID,
  p_entregado_a_tercero BOOLEAN DEFAULT false,
  p_entregado_receptor_nombre TEXT DEFAULT NULL
)
RETURNS public.brazos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brazo public.brazos;
  v_receptor TEXT;
BEGIN
  v_receptor := NULLIF(TRIM(p_entregado_receptor_nombre), '');

  IF COALESCE(p_entregado_a_tercero, false) AND v_receptor IS NULL THEN
    RAISE EXCEPTION 'Indique el nombre de quien recibe el turno (tercero)';
  END IF;

  UPDATE public.brazos
  SET
    estado_entrega = 'entregado',
    entregado_en = NOW(),
    entregado_por = auth.uid(),
    entregado_a_tercero = COALESCE(p_entregado_a_tercero, false),
    entregado_receptor_nombre = CASE
      WHEN COALESCE(p_entregado_a_tercero, false) THEN v_receptor
      ELSE NULL
    END,
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

GRANT EXECUTE ON FUNCTION public.marcar_entregado_brazo(UUID, BOOLEAN, TEXT) TO authenticated;
