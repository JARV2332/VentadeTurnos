-- Búsqueda de boleta para entrega en una sola llamada (QR VR-/VT-)

CREATE INDEX IF NOT EXISTS idx_compras_org_codigo_recibo
  ON public.compras(organizacion_id, codigo_recibo);

CREATE INDEX IF NOT EXISTS idx_brazos_org_qr_vendido
  ON public.brazos(organizacion_id, codigo_boleta_qr)
  WHERE estado = 'vendido';

CREATE OR REPLACE FUNCTION public.buscar_boleta_entrega(p_codigo TEXT)
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
  v_brazos JSONB;
  v_items JSONB;
  v_turno JSONB;
  v_cortejo JSONB;
  v_cargador JSONB;
  v_cortejo_estado TEXT;
BEGIN
  v_org := public.get_user_organizacion_id();
  IF v_org IS NULL THEN
    RETURN jsonb_build_object('error', 'Organización no identificada');
  END IF;

  v_codigo := UPPER(TRIM(COALESCE(p_codigo, '')));
  IF v_codigo !~ '^V[RT]-[A-Z0-9]+$' THEN
    RETURN jsonb_build_object('error', 'Código de boleta inválido.');
  END IF;

  IF v_codigo LIKE 'VR-%' THEN
    SELECT * INTO v_compra
    FROM public.compras
    WHERE organizacion_id = v_org
      AND codigo_recibo = v_codigo
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'Boleta no encontrada o no corresponde a esta organización.');
    END IF;

    IF COALESCE(v_compra.estado, 'activa') = 'anulada' THEN
      RETURN jsonb_build_object('error', 'Esta boleta ya fue anulada.');
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.numero_turno, b.numero_brazo, b.lado), '[]'::jsonb)
    INTO v_brazos
    FROM public.brazos b
    WHERE b.compra_id = v_compra.id
      AND b.organizacion_id = v_org
      AND b.estado = 'vendido';

    IF v_brazos = '[]'::jsonb OR v_brazos IS NULL THEN
      RETURN jsonb_build_object('error', 'Boleta no encontrada o no corresponde a esta organización.');
    END IF;
  ELSE
    SELECT * INTO v_brazo
    FROM public.brazos
    WHERE organizacion_id = v_org
      AND codigo_boleta_qr = v_codigo
      AND estado = 'vendido'
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'Boleta no encontrada o no corresponde a esta organización.');
    END IF;

    v_compra := NULL;

    IF v_brazo.compra_id IS NOT NULL THEN
      SELECT * INTO v_compra
      FROM public.compras
      WHERE id = v_brazo.compra_id
        AND organizacion_id = v_org
      LIMIT 1;

      IF FOUND AND COALESCE(v_compra.estado, 'activa') = 'anulada' THEN
        RETURN jsonb_build_object('error', 'Esta boleta ya fue anulada.');
      END IF;

      SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.numero_turno, b.numero_brazo, b.lado), '[]'::jsonb)
      INTO v_brazos
      FROM public.brazos b
      WHERE b.compra_id = v_brazo.compra_id
        AND b.organizacion_id = v_org
        AND b.estado = 'vendido';
    ELSE
      v_brazos := jsonb_build_array(to_jsonb(v_brazo));
    END IF;
  END IF;

  SELECT to_jsonb(t) INTO v_turno
  FROM public.turnos t
  WHERE t.id = (v_brazos->0->>'turno_id')::uuid
  LIMIT 1;

  IF v_turno IS NOT NULL AND v_turno->>'cortejo_id' IS NOT NULL THEN
    SELECT to_jsonb(cj), cj.estado INTO v_cortejo, v_cortejo_estado
    FROM public.cortejos cj
    WHERE cj.id = (v_turno->>'cortejo_id')::uuid
    LIMIT 1;

    IF v_cortejo_estado = 'inactiva' THEN
      RETURN jsonb_build_object('error', 'La procesión de esta boleta está inactiva.');
    END IF;
  END IF;

  SELECT to_jsonb(cg) INTO v_cargador
  FROM public.cargadores_organizacion cg
  WHERE cg.id = (v_brazos->0->>'cargador_id')::uuid
  LIMIT 1;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'brazo', bj,
        'turno', (
          SELECT to_jsonb(t)
          FROM public.turnos t
          WHERE t.id = (bj->>'turno_id')::uuid
        )
      )
      ORDER BY (bj->>'numero_turno')::int NULLS LAST, bj->>'numero_brazo', bj->>'lado'
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM jsonb_array_elements(v_brazos) AS bj;

  RETURN jsonb_build_object(
    'brazo', v_brazos->0,
    'brazos', v_brazos,
    'compra', (
      SELECT to_jsonb(c)
      FROM public.compras c
      WHERE c.id = COALESCE(
        v_compra.id,
        NULLIF(v_brazos->0->>'compra_id', '')::uuid
      )
      LIMIT 1
    ),
    'turno', v_turno,
    'cortejo', v_cortejo,
    'cargador', v_cargador,
    'items', v_items
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.buscar_boleta_entrega(TEXT) TO authenticated;
