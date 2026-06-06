-- Leyenda personalizable del cuerpo del correo de boletas
-- Ejecutar en Supabase SQL Editor
--
-- Nota: CREATE OR REPLACE VIEW no permite insertar columnas en medio;
-- hay que eliminar la vista y volver a crearla.

ALTER TABLE public.configuracion_correo
  ADD COLUMN IF NOT EXISTS leyenda_correo TEXT;

COMMENT ON COLUMN public.configuracion_correo.leyenda_correo IS
  'Plantilla del cuerpo del correo. Placeholders: {nombre}, {evento}, {turnos}, {total}, {codigo}, {enlace}, {organizacion}, etc.';

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
  gmail_smtp_user,
  gmail_password_configurada,
  created_at,
  updated_at
FROM public.configuracion_correo;

GRANT SELECT ON public.configuracion_correo_safe TO authenticated;
