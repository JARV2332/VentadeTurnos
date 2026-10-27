-- Sexo del devoto (preregistro / taquilla).
ALTER TABLE public.cargadores_organizacion
  ADD COLUMN IF NOT EXISTS sexo TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cargadores_organizacion_sexo_check'
  ) THEN
    ALTER TABLE public.cargadores_organizacion
      ADD CONSTRAINT cargadores_organizacion_sexo_check
      CHECK (sexo IS NULL OR sexo IN ('M', 'F'));
  END IF;
END $$;

COMMENT ON COLUMN public.cargadores_organizacion.sexo IS
  'Sexo del devoto: M = masculino, F = femenino.';
