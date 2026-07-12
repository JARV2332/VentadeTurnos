-- Rendimiento: índices + RPC POST para liberar reservas (evita PATCH lento vía proxy)

CREATE INDEX IF NOT EXISTS idx_brazos_org_estado_updated
  ON public.brazos(organizacion_id, estado, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_compras_org_pago
  ON public.compras(organizacion_id, pago_confirmado_en DESC NULLS LAST);

CREATE OR REPLACE FUNCTION public.liberar_reservas_taquilla_expiradas(p_organizacion_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  cnt integer;
BEGIN
  UPDATE public.brazos
  SET
    estado = 'disponible',
    bloqueado_hasta = NULL,
    mesa_id = NULL,
    vendedor_id = NULL
  WHERE organizacion_id = p_organizacion_id
    AND estado = 'reservado'
    AND reserva_apartado = false
    AND bloqueado_hasta IS NOT NULL
    AND bloqueado_hasta < now();
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RETURN cnt;
END;
$$;

GRANT EXECUTE ON FUNCTION public.liberar_reservas_taquilla_expiradas(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.liberar_reservas_taquilla_expiradas(uuid) TO anon;
