-- Super administrador de plataforma (gestiona todas las asociaciones)
-- Ejecutar en Supabase SQL Editor después de APLICAR_TODO.sql

ALTER TABLE public.usuarios_app
  ADD COLUMN IF NOT EXISTS es_super_admin BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.usuarios_app
  ADD COLUMN IF NOT EXISTS organizacion_activa_id UUID REFERENCES public.organizaciones(id) ON DELETE SET NULL;

-- Super admin no pertenece a una sola org; admin de org sí
ALTER TABLE public.usuarios_app
  ALTER COLUMN organizacion_id DROP NOT NULL;

ALTER TABLE public.usuarios_app
  ALTER COLUMN rol_id DROP NOT NULL;

ALTER TABLE public.usuarios_app DROP CONSTRAINT IF EXISTS usuarios_app_org_rol_check;
ALTER TABLE public.usuarios_app ADD CONSTRAINT usuarios_app_org_rol_check CHECK (
  (es_super_admin = true AND organizacion_id IS NULL AND rol_id IS NULL)
  OR (es_super_admin = false AND organizacion_id IS NOT NULL AND rol_id IS NOT NULL)
);

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios_app
    WHERE auth_user_id = auth.uid()
      AND es_super_admin = true
      AND activo = true
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_organizacion_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(u.organizacion_activa_id, u.organizacion_id)
  FROM public.usuarios_app u
  WHERE u.auth_user_id = auth.uid() AND u.activo = true
  LIMIT 1;
$$;

-- Super admin: ver todas las organizaciones
DROP POLICY IF EXISTS "org_select_own" ON public.organizaciones;
CREATE POLICY "org_select_own" ON public.organizaciones
  FOR SELECT USING (
    public.is_platform_admin()
    OR id = public.get_user_organizacion_id()
  );

DROP POLICY IF EXISTS "org_insert_authenticated" ON public.organizaciones;
CREATE POLICY "org_insert_authenticated" ON public.organizaciones
  FOR INSERT WITH CHECK (
    public.is_platform_admin()
    OR (auth.uid() IS NOT NULL AND creado_por = auth.uid())
  );

DROP POLICY IF EXISTS "org_update_own" ON public.organizaciones;
CREATE POLICY "org_update_own" ON public.organizaciones
  FOR UPDATE USING (
    public.is_platform_admin()
    OR id = public.get_user_organizacion_id()
  );

-- Super puede leer/actualizar su fila en usuarios_app
DROP POLICY IF EXISTS "usuarios_app_select_self" ON public.usuarios_app;
CREATE POLICY "usuarios_app_select_self" ON public.usuarios_app
  FOR SELECT USING (
    auth_user_id = auth.uid()
    OR (public.is_platform_admin() AND organizacion_id IS NOT NULL)
  );

DROP POLICY IF EXISTS "usuarios_app_update_self" ON public.usuarios_app;
CREATE POLICY "usuarios_app_update_self" ON public.usuarios_app
  FOR UPDATE USING (auth_user_id = auth.uid());

-- RPC: super admin elige asociación activa
CREATE OR REPLACE FUNCTION public.set_organizacion_activa(p_org_id UUID)
RETURNS public.usuarios_app
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user public.usuarios_app;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Solo super administrador';
  END IF;

  IF p_org_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.organizaciones WHERE id = p_org_id) THEN
    RAISE EXCEPTION 'Organización no encontrada';
  END IF;

  UPDATE public.usuarios_app
  SET organizacion_activa_id = p_org_id, updated_at = NOW()
  WHERE auth_user_id = auth.uid() AND es_super_admin = true
  RETURNING * INTO v_user;

  RETURN v_user;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_organizacion_activa(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
