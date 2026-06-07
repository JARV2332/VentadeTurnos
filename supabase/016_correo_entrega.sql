-- Campos de entrega editables para la leyenda del correo
-- Ejecutar en Supabase SQL Editor

ALTER TABLE public.configuracion_correo
  ADD COLUMN IF NOT EXISTS correo_fecha_entrega TEXT,
  ADD COLUMN IF NOT EXISTS correo_horario_entrega TEXT;

DROP VIEW IF EXISTS public.configuracion_correo_safe;

CREATE VIEW public.configuracion_correo_safe AS
SELECT
  id,
  organizacion_id,
  correo_remitente,
  nombre_remitente,
  correo_respuesta,
  notificaciones_activas,
  pie_correo,
  leyenda_correo,
  correo_fecha_entrega,
  correo_horario_entrega,
  gmail_smtp_user,
  gmail_password_configurada,
  created_at,
  updated_at
FROM public.configuracion_correo;

GRANT SELECT ON public.configuracion_correo_safe TO authenticated;
