-- Roles personalizados y permisos por pantalla (RBAC)

CREATE TABLE IF NOT EXISTS public.roles_organizacion (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organizacion_id UUID NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  descripcion     TEXT,
  es_sistema      BOOLEAN NOT NULL DEFAULT false,
  permisos        JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organizacion_id, nombre)
);

CREATE TABLE IF NOT EXISTS public.usuarios_app (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organizacion_id UUID NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  auth_user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  nombre          TEXT NOT NULL,
  email           TEXT NOT NULL,
  password_hash   TEXT,
  rol_id          UUID NOT NULL REFERENCES public.roles_organizacion(id),
  activo          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organizacion_id, email)
);

CREATE INDEX idx_roles_org ON public.roles_organizacion(organizacion_id);
CREATE INDEX idx_usuarios_app_org ON public.usuarios_app(organizacion_id);

ALTER TABLE public.roles_organizacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios_app ENABLE ROW LEVEL SECURITY;
