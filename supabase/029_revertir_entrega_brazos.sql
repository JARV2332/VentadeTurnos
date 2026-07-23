-- Revertir entrega de varios brazos del mismo recibo (boleta multi-turno VR-).

CREATE OR REPLACE FUNCTION public.revertir_entrega_brazos(p_brazo_ids UUID[])
RETURNS SETOF public.brazos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID;
  v_cnt integer;
BEGIN
  v_org := public.get_user_organizacion_id();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Organización no identificada';
  END IF;

  IF p_brazo_ids IS NULL OR array_length(p_brazo_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Indique al menos un turno';
  END IF;

  RETURN QUERY
  UPDATE public.brazos
  SET
    estado_entrega = 'pendiente',
    entregado_en = NULL,
    entregado_por = NULL,
    entregado_a_tercero = false,
    entregado_receptor_nombre = NULL,
    updated_at = NOW()
  WHERE id = ANY(p_brazo_ids)
    AND organizacion_id = v_org
    AND estado = 'vendido'
    AND estado_entrega = 'entregado'
  RETURNING *;

  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt = 0 THEN
    RAISE EXCEPTION 'No se pudo revertir la entrega (ningún turno estaba entregado)';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.revertir_entrega_brazos(UUID[]) TO authenticated;
