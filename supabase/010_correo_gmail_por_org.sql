-- Credenciales Gmail SMTP por organización (cada asociación su cuenta)
-- Ejecutar en Supabase SQL Editor

ALTER TABLE public.configuracion_correo
  ADD COLUMN IF NOT EXISTS gmail_smtp_user TEXT,
  ADD COLUMN IF NOT EXISTS gmail_app_password TEXT,
  ADD COLUMN IF NOT EXISTS gmail_password_configurada BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.configuracion_correo.gmail_app_password IS
  'Contraseña de aplicación Gmail (16 caracteres). Solo la lee el servidor vía service role.';

-- Vista sin contraseña (la app solo consulta esto)
CREATE OR REPLACE VIEW public.configuracion_correo_safe AS
SELECT
  id,
  organizacion_id,
  correo_remitente,
  nombre_remitente,
  correo_respuesta,
  notificaciones_activas,
  pie_correo,
  gmail_smtp_user,
  gmail_password_configurada,
  created_at,
  updated_at
FROM public.configuracion_correo;

GRANT SELECT ON public.configuracion_correo_safe TO authenticated;
