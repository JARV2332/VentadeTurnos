-- Dirección / tramo del recorrido por turno (importación Excel de procesión).
ALTER TABLE public.turnos
  ADD COLUMN IF NOT EXISTS direccion TEXT;

COMMENT ON COLUMN public.turnos.direccion IS
  'Tramo del recorrido (calles) asociado al turno; opcional.';
