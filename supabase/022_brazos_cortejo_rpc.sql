-- Taquilla: JOIN cortejo→turnos→brazos (evita IN gigante + OFFSET lento)

CREATE INDEX IF NOT EXISTS idx_brazos_turno_numero
  ON public.brazos(turno_id, numero_brazo);

CREATE INDEX IF NOT EXISTS idx_turnos_cortejo_numero
  ON public.turnos(cortejo_id, numero_turno);

CREATE OR REPLACE FUNCTION public.get_brazos_cortejo(
  p_cortejo_id uuid,
  p_organizacion_id uuid
)
RETURNS SETOF public.brazos
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT b.*
  FROM public.turnos t
  INNER JOIN public.brazos b
    ON b.turno_id = t.id
   AND b.organizacion_id = p_organizacion_id
  WHERE t.cortejo_id = p_cortejo_id
  ORDER BY t.numero_turno ASC, b.lado ASC, b.numero_brazo ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_brazos_cortejo(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_brazos_cortejo(uuid, uuid) TO anon;
