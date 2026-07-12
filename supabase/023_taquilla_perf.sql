-- Taquilla: una sola llamada turnos + brazos (campos ligeros) + nombre devoto

CREATE OR REPLACE FUNCTION public.get_taquilla_cortejo(
  p_cortejo_id uuid,
  p_organizacion_id uuid
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT json_build_object(
    'turnos', COALESCE((
      SELECT json_agg(t ORDER BY t.numero_turno)
      FROM (
        SELECT
          id,
          cortejo_id,
          numero_turno,
          tipo_turno,
          etiqueta,
          precio,
          son,
          alabado,
          hora_estimada,
          total_brazos,
          organizacion_id
        FROM public.turnos
        WHERE cortejo_id = p_cortejo_id
      ) AS t
    ), '[]'::json),
    'brazos', COALESCE((
      SELECT json_agg(b ORDER BY b.numero_turno, b.lado_ord, b.numero_brazo)
      FROM (
        SELECT
          br.id,
          br.turno_id,
          br.numero_turno,
          br.numero_brazo,
          br.lado,
          br.estado,
          br.reserva_apartado,
          br.apartado_notas,
          br.asignado_nombre,
          br.cargador_id,
          br.bloqueado_hasta,
          br.mesa_id,
          br.vendedor_id,
          br.precio_pagado,
          c.nombre_completo AS cargador_nombre,
          CASE br.lado WHEN 'Izquierda' THEN 0 ELSE 1 END AS lado_ord
        FROM public.turnos t
        INNER JOIN public.brazos br
          ON br.turno_id = t.id
         AND br.organizacion_id = p_organizacion_id
        LEFT JOIN public.cargadores_organizacion c
          ON c.id = br.cargador_id
         AND c.organizacion_id = p_organizacion_id
        WHERE t.cortejo_id = p_cortejo_id
      ) AS b
    ), '[]'::json)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_taquilla_cortejo(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_taquilla_cortejo(uuid, uuid) TO anon;
