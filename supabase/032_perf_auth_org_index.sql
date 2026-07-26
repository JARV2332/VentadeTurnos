-- Acelerar get_user_organizacion_id (usada en cada RPC/RLS)
CREATE INDEX IF NOT EXISTS idx_usuarios_app_auth_user_activo
  ON public.usuarios_app(auth_user_id)
  WHERE activo = true;

-- Forzar a PostgREST a recargar el catálogo de funciones
NOTIFY pgrst, 'reload schema';
