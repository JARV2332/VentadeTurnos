-- Apartados importados (Excel) y asignación parcial

ALTER TABLE public.brazos
  ADD COLUMN IF NOT EXISTS reserva_apartado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS asignado_nombre TEXT,
  ADD COLUMN IF NOT EXISTS apartado_notas TEXT;

COMMENT ON COLUMN public.brazos.reserva_apartado IS 'true = apartado vía importación (sin expiración 5 min)';
COMMENT ON COLUMN public.brazos.asignado_nombre IS 'Nombre mostrado si no hay cargador registrado';
COMMENT ON COLUMN public.brazos.apartado_notas IS 'Notas del apartado (ej. hermandad X)';
