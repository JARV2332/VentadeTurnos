-- Revertir entrega errónea: vuelve a pendiente (solo brazos vendidos ya entregados).
CREATE OR REPLACE FUNCTION public.revertir_entrega_brazo(p_brazo_id UUID)
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
    estado_entrega = 'pendiente',
    entregado_en = NULL,
    entregado_por = NULL,
    entregado_a_tercero = false,
    entregado_receptor_nombre = NULL,
    updated_at = NOW()
  WHERE id = p_brazo_id
    AND organizacion_id = public.get_user_organizacion_id()
    AND estado = 'vendido'
    AND estado_entrega = 'entregado'
  RETURNING * INTO v_brazo;

  IF v_brazo.id IS NULL THEN
    RAISE EXCEPTION 'No se pudo revertir la entrega';
  END IF;
  RETURN v_brazo;
END;
$$;

GRANT EXECUTE ON FUNCTION public.revertir_entrega_brazo(UUID) TO authenticated;
