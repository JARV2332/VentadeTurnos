-- Son y alabado por turno (repertorio del cortejo)
ALTER TABLE public.turnos
  ADD COLUMN IF NOT EXISTS son TEXT,
  ADD COLUMN IF NOT EXISTS alabado TEXT;

COMMENT ON COLUMN public.turnos.son IS 'Pieza o son que se toca en este turno';
COMMENT ON COLUMN public.turnos.alabado IS 'Alabado que corresponde a este turno';
