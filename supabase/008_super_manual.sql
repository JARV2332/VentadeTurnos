-- Crear fila super admin DESPUÉS de crear el usuario en Authentication.
-- Supabase → Authentication → Users → Add user:
--   Email: super@ventadeturnos.com
--   Password: SuperAdmin2026!
--   Auto confirm: sí
-- Luego ejecuta este SQL (reemplaza AUTH_UID si hace falta):

INSERT INTO public.usuarios_app (
  auth_user_id,
  nombre,
  email,
  es_super_admin,
  organizacion_id,
  rol_id,
  activo
)
SELECT
  u.id,
  'Super Administrador',
  'super@ventadeturnos.com',
  true,
  NULL,
  NULL,
  true
FROM auth.users u
WHERE u.email = 'super@ventadeturnos.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.usuarios_app WHERE email = 'super@ventadeturnos.com'
  );
