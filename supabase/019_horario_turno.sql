-- Hora estimada de paso por turno en la procesión
ALTER TABLE public.turnos
  ADD COLUMN IF NOT EXISTS hora_estimada TIME;

COMMENT ON COLUMN public.turnos.hora_estimada IS 'Hora estimada de paso del turno en el recorrido (fecha en cortejos.fecha)';
