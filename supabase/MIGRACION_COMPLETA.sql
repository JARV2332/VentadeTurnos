-- MIGRACION_COMPLETA.sql — generado automáticamente
-- 2026-07-14T23:48:49.454Z
-- Pegar en Supabase nuevo → SQL Editor → Run


-- ═══ APLICAR_TODO.sql ═══

    -- ============================================================
    -- ventadeturnos.com — ESQUEMA COMPLETO (proyecto vacío)
    -- Pegar y ejecutar en: Supabase → SQL Editor → Run
    -- Proyecto: kolhnoectddjgfowyvux
    -- ============================================================

    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    -- ── Tipos ──
    DO $$ BEGIN
      CREATE TYPE estado_mesa AS ENUM ('activa', 'cerrada');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      CREATE TYPE lado_brazo AS ENUM ('Izquierda', 'Derecha', 'Centro');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      CREATE TYPE estado_brazo AS ENUM ('disponible', 'reservado', 'vendido');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      CREATE TYPE estado_cortejo AS ENUM ('activa', 'inactiva');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    -- ── Trigger helper (sin dependencias de tablas) ──
    CREATE OR REPLACE FUNCTION public.set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    -- ── Organizaciones ──
    CREATE TABLE IF NOT EXISTS public.organizaciones (
      id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      nombre_oficial  TEXT NOT NULL,
      entidad_o_parroquia TEXT,
      telefono_contacto   TEXT,
      subdominio_slug     TEXT NOT NULL UNIQUE,
      creado_por      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- ── Roles RBAC por organización ──
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

    -- ── Usuarios de la app (vinculados a auth.users) ──
    CREATE TABLE IF NOT EXISTS public.usuarios_app (
      id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      organizacion_id UUID NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
      auth_user_id    UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
      nombre          TEXT NOT NULL,
      email           TEXT NOT NULL,
      telefono        TEXT,
      cargo           TEXT,
      avatar_url      TEXT,
      rol_id          UUID NOT NULL REFERENCES public.roles_organizacion(id),
      activo          BOOLEAN NOT NULL DEFAULT true,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (organizacion_id, email)
    );

    -- ── Cortejos / procesiones ──
    CREATE TABLE IF NOT EXISTS public.cortejos (
      id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      organizacion_id UUID NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
      nombre_evento   TEXT NOT NULL,
      fecha           DATE NOT NULL,
      descripcion     TEXT,
      estado          estado_cortejo NOT NULL DEFAULT 'activa',
      config_procesion JSONB,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- ── Turnos ──
    CREATE TABLE IF NOT EXISTS public.turnos (
      id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      organizacion_id UUID NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
      cortejo_id      UUID NOT NULL REFERENCES public.cortejos(id) ON DELETE CASCADE,
      numero_turno    INTEGER NOT NULL,
      tipo_turno      TEXT NOT NULL DEFAULT 'Ordinario',
      etiqueta        TEXT,
      total_brazos    INTEGER NOT NULL DEFAULT 20,
      precio          NUMERIC(10,2) NOT NULL DEFAULT 0,
      son             TEXT,
      alabado         TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (cortejo_id, numero_turno)
    );

    -- ── Mesas ──
    CREATE TABLE IF NOT EXISTS public.mesas_vendedores (
      id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      organizacion_id UUID NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
      nombre_mesa     TEXT NOT NULL,
      vendedor_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
      estado          estado_mesa NOT NULL DEFAULT 'activa',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- ── Cargadores (catálogo privado) ──
    CREATE TABLE IF NOT EXISTS public.cargadores_organizacion (
      id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      organizacion_id     UUID NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
      nombre_completo     TEXT NOT NULL,
      whatsapp            TEXT NOT NULL,
      correo              TEXT,
      cui_o_identificacion TEXT,
      telefono_emergencia  TEXT,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- ── Config correo ──
    CREATE TABLE IF NOT EXISTS public.configuracion_correo (
      id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      organizacion_id     UUID NOT NULL UNIQUE REFERENCES public.organizaciones(id) ON DELETE CASCADE,
      correo_remitente    TEXT NOT NULL,
      nombre_remitente    TEXT NOT NULL,
      correo_respuesta    TEXT,
      notificaciones_activas BOOLEAN NOT NULL DEFAULT TRUE,
      pie_correo          TEXT,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- ── Log de correos enviados ──
    CREATE TABLE IF NOT EXISTS public.correos_enviados (
      id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      organizacion_id UUID NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
      destinatario    TEXT NOT NULL,
      asunto          TEXT,
      codigo_boleta   TEXT,
      estado          TEXT DEFAULT 'enviado',
      metadata        JSONB DEFAULT '{}'::jsonb,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- ── Brazos (matriz en tiempo real) ──
    CREATE TABLE IF NOT EXISTS public.brazos (
      id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      organizacion_id UUID NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
      turno_id        UUID NOT NULL REFERENCES public.turnos(id) ON DELETE CASCADE,
      numero_turno    INTEGER NOT NULL,
      numero_brazo    INTEGER NOT NULL,
      lado            lado_brazo NOT NULL DEFAULT 'Centro',
      estado          estado_brazo NOT NULL DEFAULT 'disponible',
      bloqueado_hasta TIMESTAMPTZ,
      vendedor_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
      mesa_id         UUID REFERENCES public.mesas_vendedores(id) ON DELETE SET NULL,
      cargador_id     UUID REFERENCES public.cargadores_organizacion(id) ON DELETE SET NULL,
      codigo_boleta_qr TEXT UNIQUE,
      precio_pagado   NUMERIC(10,2),
      metodo_pago     TEXT CHECK (metodo_pago IN ('efectivo', 'transferencia', 'tarjeta')),
      comprobante_url TEXT,
      pago_confirmado_en TIMESTAMPTZ,
      estado_entrega  TEXT DEFAULT 'pendiente' CHECK (estado_entrega IN ('pendiente', 'entregado')),
      entregado_en    TIMESTAMPTZ,
      entregado_por   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
      reserva_apartado BOOLEAN NOT NULL DEFAULT false,
      asignado_nombre TEXT,
      apartado_notas  TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (turno_id, numero_brazo, lado)
    );

    -- ── Índices ──
    CREATE INDEX IF NOT EXISTS idx_usuarios_app_auth ON public.usuarios_app(auth_user_id);
    CREATE INDEX IF NOT EXISTS idx_usuarios_app_org ON public.usuarios_app(organizacion_id);
    CREATE INDEX IF NOT EXISTS idx_roles_org ON public.roles_organizacion(organizacion_id);
    CREATE INDEX IF NOT EXISTS idx_cortejos_org ON public.cortejos(organizacion_id);
    CREATE INDEX IF NOT EXISTS idx_turnos_cortejo ON public.turnos(cortejo_id);
    CREATE INDEX IF NOT EXISTS idx_brazos_org ON public.brazos(organizacion_id);
    CREATE INDEX IF NOT EXISTS idx_brazos_turno ON public.brazos(turno_id);
    CREATE INDEX IF NOT EXISTS idx_brazos_qr ON public.brazos(codigo_boleta_qr);
    CREATE INDEX IF NOT EXISTS idx_cargadores_whatsapp ON public.cargadores_organizacion(organizacion_id, whatsapp);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_cargadores_cui_org
      ON public.cargadores_organizacion (organizacion_id, cui_o_identificacion)
      WHERE cui_o_identificacion IS NOT NULL AND trim(cui_o_identificacion) <> '';

    -- ── Helpers sesión (después de crear usuarios_app y roles_organizacion) ──
    CREATE OR REPLACE FUNCTION public.get_user_organizacion_id()
    RETURNS UUID
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = public
    AS $$
      SELECT organizacion_id
      FROM public.usuarios_app
      WHERE auth_user_id = auth.uid() AND activo = true
      LIMIT 1;
    $$;

    CREATE OR REPLACE FUNCTION public.get_user_permisos()
    RETURNS JSONB
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = public
    AS $$
      SELECT COALESCE(r.permisos, '[]'::jsonb)
      FROM public.usuarios_app u
      JOIN public.roles_organizacion r ON r.id = u.rol_id
      WHERE u.auth_user_id = auth.uid() AND u.activo = true
      LIMIT 1;
    $$;

    -- ── Triggers updated_at ──
    DROP TRIGGER IF EXISTS trg_organizaciones_updated ON public.organizaciones;
    CREATE TRIGGER trg_organizaciones_updated BEFORE UPDATE ON public.organizaciones
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    DROP TRIGGER IF EXISTS trg_cortejos_updated ON public.cortejos;
    CREATE TRIGGER trg_cortejos_updated BEFORE UPDATE ON public.cortejos
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    DROP TRIGGER IF EXISTS trg_cargadores_updated ON public.cargadores_organizacion;
    CREATE TRIGGER trg_cargadores_updated BEFORE UPDATE ON public.cargadores_organizacion
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    DROP TRIGGER IF EXISTS trg_brazos_updated ON public.brazos;
    CREATE TRIGGER trg_brazos_updated BEFORE UPDATE ON public.brazos
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    DROP TRIGGER IF EXISTS trg_usuarios_app_updated ON public.usuarios_app;
    CREATE TRIGGER trg_usuarios_app_updated BEFORE UPDATE ON public.usuarios_app
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

    -- ── RLS ──
    ALTER TABLE public.organizaciones ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.roles_organizacion ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.usuarios_app ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.cortejos ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.turnos ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.mesas_vendedores ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.cargadores_organizacion ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.configuracion_correo ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.correos_enviados ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.brazos ENABLE ROW LEVEL SECURITY;

    -- Políticas organizaciones
    DROP POLICY IF EXISTS "org_select_own" ON public.organizaciones;
    CREATE POLICY "org_select_own" ON public.organizaciones FOR SELECT USING (id = public.get_user_organizacion_id());
    DROP POLICY IF EXISTS "org_insert_authenticated" ON public.organizaciones;
    CREATE POLICY "org_insert_authenticated" ON public.organizaciones FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND creado_por = auth.uid());
    DROP POLICY IF EXISTS "org_update_own" ON public.organizaciones;
    CREATE POLICY "org_update_own" ON public.organizaciones FOR UPDATE USING (id = public.get_user_organizacion_id());

    -- Políticas genéricas por tenant
    DO $$
    DECLARE t TEXT;
    BEGIN
      FOREACH t IN ARRAY ARRAY[
        'roles_organizacion','usuarios_app','cortejos','turnos',
        'mesas_vendedores','cargadores_organizacion','configuracion_correo',
        'correos_enviados','brazos'
      ]
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (organizacion_id = public.get_user_organizacion_id())', t || '_select', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (organizacion_id = public.get_user_organizacion_id())', t || '_insert', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (organizacion_id = public.get_user_organizacion_id())', t || '_update', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING (organizacion_id = public.get_user_organizacion_id())', t || '_delete', t);
      END LOOP;
    END $$;

    -- Usuario puede leer su propio registro en cualquier org al iniciar sesión
    DROP POLICY IF EXISTS "usuarios_app_select_self" ON public.usuarios_app;
    CREATE POLICY "usuarios_app_select_self" ON public.usuarios_app
      FOR SELECT USING (auth_user_id = auth.uid());

    -- ── RPC: reservar brazo ──
    CREATE OR REPLACE FUNCTION public.reservar_brazo(
      p_brazo_id UUID,
      p_mesa_id UUID,
      p_vendedor_id UUID
    )
    RETURNS public.brazos
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_brazo public.brazos;
    BEGIN
      IF (SELECT reserva_apartado FROM public.brazos WHERE id = p_brazo_id) = true THEN
        RAISE EXCEPTION 'Espacio apartado por importación';
      END IF;

      UPDATE public.brazos
      SET
        estado = 'reservado',
        bloqueado_hasta = NOW() + INTERVAL '5 minutes',
        mesa_id = p_mesa_id,
        vendedor_id = p_vendedor_id,
        updated_at = NOW()
      WHERE id = p_brazo_id
        AND organizacion_id = public.get_user_organizacion_id()
        AND (
          estado = 'disponible'
          OR (estado = 'reservado' AND bloqueado_hasta < NOW())
        )
      RETURNING * INTO v_brazo;

      IF v_brazo.id IS NULL THEN
        RAISE EXCEPTION 'El espacio no está disponible';
      END IF;
      RETURN v_brazo;
    END;
    $$;

    -- ── RPC: confirmar venta ──
    CREATE OR REPLACE FUNCTION public.confirmar_venta_brazo(
      p_brazo_id UUID,
      p_cargador_id UUID,
      p_precio_pagado NUMERIC,
      p_metodo_pago TEXT DEFAULT 'efectivo',
      p_comprobante_url TEXT DEFAULT NULL
    )
    RETURNS public.brazos
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_brazo public.brazos;
      v_codigo TEXT;
    BEGIN
      v_codigo := 'VT-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 10));

      UPDATE public.brazos
      SET
        estado = 'vendido',
        cargador_id = p_cargador_id,
        precio_pagado = p_precio_pagado,
        codigo_boleta_qr = v_codigo,
        bloqueado_hasta = NULL,
        reserva_apartado = false,
        asignado_nombre = NULL,
        apartado_notas = NULL,
        metodo_pago = COALESCE(p_metodo_pago, 'efectivo'),
        comprobante_url = p_comprobante_url,
        pago_confirmado_en = NOW(),
        estado_entrega = 'pendiente',
        updated_at = NOW()
      WHERE id = p_brazo_id
        AND organizacion_id = public.get_user_organizacion_id()
        AND estado = 'reservado'
      RETURNING * INTO v_brazo;

      IF v_brazo.id IS NULL THEN
        RAISE EXCEPTION 'No se pudo confirmar la venta';
      END IF;
      RETURN v_brazo;
    END;
    $$;

    -- ── RPC: marcar entregado ──
    CREATE OR REPLACE FUNCTION public.marcar_entregado_brazo(p_brazo_id UUID)
    RETURNS public.brazos
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE v_brazo public.brazos;
    BEGIN
      UPDATE public.brazos
      SET estado_entrega = 'entregado', entregado_en = NOW(), entregado_por = auth.uid(), updated_at = NOW()
      WHERE id = p_brazo_id
        AND organizacion_id = public.get_user_organizacion_id()
        AND estado = 'vendido'
        AND estado_entrega = 'pendiente'
      RETURNING * INTO v_brazo;
      IF v_brazo.id IS NULL THEN RAISE EXCEPTION 'No se pudo marcar entregado'; END IF;
      RETURN v_brazo;
    END;
    $$;

    GRANT EXECUTE ON FUNCTION public.reservar_brazo TO authenticated;
    GRANT EXECUTE ON FUNCTION public.confirmar_venta_brazo TO authenticated;
    GRANT EXECUTE ON FUNCTION public.marcar_entregado_brazo TO authenticated;

    -- ── Realtime ──
    DO $$
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.brazos;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    -- Listo. Después ejecutar: npm run db:seed (con SERVICE_ROLE_KEY en .env)


-- ═══ 007_super_admin.sql ═══

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


-- ═══ 008_super_manual.sql ═══

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


-- ═══ 009_configuracion_recibo.sql ═══

-- Diseño personalizable de boletas / recibos por organización
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.configuracion_recibo (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organizacion_id UUID NOT NULL UNIQUE REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  formato         TEXT NOT NULL DEFAULT 'termico_80'
    CHECK (formato IN ('termico_58', 'termico_80', 'media_carta')),
  diseño          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_config_recibo_org ON public.configuracion_recibo(organizacion_id);

DROP TRIGGER IF EXISTS trg_config_recibo_updated ON public.configuracion_recibo;
CREATE TRIGGER trg_config_recibo_updated BEFORE UPDATE ON public.configuracion_recibo
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.configuracion_recibo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "config_recibo_select" ON public.configuracion_recibo;
CREATE POLICY "config_recibo_select" ON public.configuracion_recibo
  FOR SELECT USING (organizacion_id = public.get_user_organizacion_id());

DROP POLICY IF EXISTS "config_recibo_insert" ON public.configuracion_recibo;
CREATE POLICY "config_recibo_insert" ON public.configuracion_recibo
  FOR INSERT WITH CHECK (organizacion_id = public.get_user_organizacion_id());

DROP POLICY IF EXISTS "config_recibo_update" ON public.configuracion_recibo;
CREATE POLICY "config_recibo_update" ON public.configuracion_recibo
  FOR UPDATE USING (organizacion_id = public.get_user_organizacion_id());


-- ═══ 010_correo_gmail_por_org.sql ═══

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


-- ═══ 011_rpc_taquilla.sql ═══

-- Funciones RPC para taquilla (reservar / vender / entregar)
-- Ejecutar en Supabase SQL Editor si aparece 404 en reservar_brazo

ALTER TABLE public.brazos ADD COLUMN IF NOT EXISTS metodo_pago TEXT;
ALTER TABLE public.brazos ADD COLUMN IF NOT EXISTS comprobante_url TEXT;
ALTER TABLE public.brazos ADD COLUMN IF NOT EXISTS pago_confirmado_en TIMESTAMPTZ;
ALTER TABLE public.brazos ADD COLUMN IF NOT EXISTS estado_entrega TEXT DEFAULT 'pendiente';
ALTER TABLE public.brazos ADD COLUMN IF NOT EXISTS entregado_en TIMESTAMPTZ;
ALTER TABLE public.brazos ADD COLUMN IF NOT EXISTS entregado_por UUID;
ALTER TABLE public.brazos ADD COLUMN IF NOT EXISTS reserva_apartado BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.reservar_brazo(
  p_brazo_id UUID,
  p_mesa_id UUID,
  p_vendedor_id UUID
)
RETURNS public.brazos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brazo public.brazos;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'brazos' AND column_name = 'reserva_apartado'
  ) AND (SELECT reserva_apartado FROM public.brazos WHERE id = p_brazo_id) = true THEN
    RAISE EXCEPTION 'Espacio apartado por importación';
  END IF;

  UPDATE public.brazos
  SET
    estado = 'reservado',
    bloqueado_hasta = NOW() + INTERVAL '5 minutes',
    mesa_id = p_mesa_id,
    vendedor_id = p_vendedor_id,
    updated_at = NOW()
  WHERE id = p_brazo_id
    AND organizacion_id = public.get_user_organizacion_id()
    AND (
      estado = 'disponible'
      OR (estado = 'reservado' AND bloqueado_hasta < NOW())
    )
  RETURNING * INTO v_brazo;

  IF v_brazo.id IS NULL THEN
    RAISE EXCEPTION 'El espacio no está disponible';
  END IF;
  RETURN v_brazo;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirmar_venta_brazo(
  p_brazo_id UUID,
  p_cargador_id UUID,
  p_precio_pagado NUMERIC,
  p_metodo_pago TEXT DEFAULT 'efectivo',
  p_comprobante_url TEXT DEFAULT NULL
)
RETURNS public.brazos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brazo public.brazos;
  v_codigo TEXT;
BEGIN
  -- gen_random_uuid() viene en PostgreSQL 14+ (no requiere extensión pgcrypto)
  v_codigo := 'VT-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 10));

  UPDATE public.brazos
  SET
    estado = 'vendido',
    cargador_id = p_cargador_id,
    precio_pagado = p_precio_pagado,
    codigo_boleta_qr = v_codigo,
    bloqueado_hasta = NULL,
    metodo_pago = COALESCE(p_metodo_pago, 'efectivo'),
    comprobante_url = p_comprobante_url,
    pago_confirmado_en = NOW(),
    estado_entrega = 'pendiente',
    updated_at = NOW()
  WHERE id = p_brazo_id
    AND organizacion_id = public.get_user_organizacion_id()
    AND estado = 'reservado'
  RETURNING * INTO v_brazo;

  IF v_brazo.id IS NULL THEN
    RAISE EXCEPTION 'No se pudo confirmar la venta';
  END IF;
  RETURN v_brazo;
END;
$$;

CREATE OR REPLACE FUNCTION public.marcar_entregado_brazo(p_brazo_id UUID)
RETURNS public.brazos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brazo public.brazos;
BEGIN
  UPDATE public.brazos
  SET
    estado_entrega = 'entregado',
    entregado_en = NOW(),
    entregado_por = auth.uid(),
    updated_at = NOW()
  WHERE id = p_brazo_id
    AND organizacion_id = public.get_user_organizacion_id()
    AND estado = 'vendido'
    AND estado_entrega = 'pendiente'
  RETURNING * INTO v_brazo;

  IF v_brazo.id IS NULL THEN
    RAISE EXCEPTION 'No se pudo marcar entregado';
  END IF;
  RETURN v_brazo;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reservar_brazo TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_venta_brazo TO authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_entregado_brazo TO authenticated;


-- ═══ 012_fix_confirmar_venta_gen_random.sql ═══

-- Fix error 42883: function gen_random_bytes(integer) does not exist
-- Ejecutar en Supabase → SQL Editor → Run (proyecto kolhnoectddjgfowyvux)

-- Opcional (recomendado para otras funciones): habilitar pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.confirmar_venta_brazo(
  p_brazo_id UUID,
  p_cargador_id UUID,
  p_precio_pagado NUMERIC,
  p_metodo_pago TEXT DEFAULT 'efectivo',
  p_comprobante_url TEXT DEFAULT NULL
)
RETURNS public.brazos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brazo public.brazos;
  v_codigo TEXT;
BEGIN
  v_codigo := 'VT-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 10));

  UPDATE public.brazos
  SET
    estado = 'vendido',
    cargador_id = p_cargador_id,
    precio_pagado = p_precio_pagado,
    codigo_boleta_qr = v_codigo,
    bloqueado_hasta = NULL,
    metodo_pago = COALESCE(p_metodo_pago, 'efectivo'),
    comprobante_url = p_comprobante_url,
    pago_confirmado_en = NOW(),
    estado_entrega = 'pendiente',
    updated_at = NOW()
  WHERE id = p_brazo_id
    AND organizacion_id = public.get_user_organizacion_id()
    AND estado = 'reservado'
  RETURNING * INTO v_brazo;

  IF v_brazo.id IS NULL THEN
    RAISE EXCEPTION 'No se pudo confirmar la venta';
  END IF;
  RETURN v_brazo;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirmar_venta_brazo TO authenticated;


-- ═══ 013_devoto_cui_unique.sql ═══

-- CUI único por organización (identificador del devoto, además del UUID)
-- Ejecutar en Supabase SQL Editor

CREATE UNIQUE INDEX IF NOT EXISTS idx_cargadores_cui_org
  ON public.cargadores_organizacion (organizacion_id, cui_o_identificacion)
  WHERE cui_o_identificacion IS NOT NULL
    AND trim(cui_o_identificacion) <> '';

CREATE INDEX IF NOT EXISTS idx_cargadores_cui_lookup
  ON public.cargadores_organizacion (organizacion_id, cui_o_identificacion);


-- ═══ 014_compras_multi_turno.sql ═══

-- Compras multi-turno: un devoto, N brazos, un recibo (VR-…) + QR por brazo (VT-…)
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.compras (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id     UUID NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  cargador_id         UUID NOT NULL REFERENCES public.cargadores_organizacion(id),
  codigo_recibo       TEXT NOT NULL UNIQUE,
  total_pagado        NUMERIC(10,2) NOT NULL DEFAULT 0,
  metodo_pago         TEXT DEFAULT 'efectivo',
  comprobante_url     TEXT,
  pago_confirmado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  vendedor_id         UUID,
  mesa_id             UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compras_org ON public.compras(organizacion_id);
CREATE INDEX IF NOT EXISTS idx_compras_cargador ON public.compras(cargador_id);

ALTER TABLE public.brazos
  ADD COLUMN IF NOT EXISTS compra_id UUID REFERENCES public.compras(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_brazos_compra ON public.brazos(compra_id);

CREATE OR REPLACE FUNCTION public.confirmar_venta_compra(
  p_brazo_ids UUID[],
  p_cargador_id UUID,
  p_precios NUMERIC[],
  p_metodo_pago TEXT DEFAULT 'efectivo',
  p_comprobante_url TEXT DEFAULT NULL,
  p_mesa_id UUID DEFAULT NULL,
  p_vendedor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID;
  v_compra public.compras;
  v_codigo_recibo TEXT;
  v_total NUMERIC(10,2) := 0;
  v_i INT;
  v_brazo public.brazos;
  v_codigo_brazo TEXT;
  v_brazos JSONB := '[]'::JSONB;
  v_n INT;
BEGIN
  v_org := public.get_user_organizacion_id();
  v_n := COALESCE(array_length(p_brazo_ids, 1), 0);

  IF v_n = 0 THEN
    RAISE EXCEPTION 'Debe incluir al menos un brazo';
  END IF;

  IF v_n <> COALESCE(array_length(p_precios, 1), 0) THEN
    RAISE EXCEPTION 'Precios no coinciden con cantidad de brazos';
  END IF;

  FOR v_i IN 1..v_n LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.brazos
      WHERE id = p_brazo_ids[v_i]
        AND organizacion_id = v_org
        AND estado = 'reservado'
    ) THEN
      RAISE EXCEPTION 'Brazo % no reservado o no disponible', p_brazo_ids[v_i];
    END IF;
    v_total := v_total + COALESCE(p_precios[v_i], 0);
  END LOOP;

  v_codigo_recibo := 'VR-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 10));

  INSERT INTO public.compras (
    organizacion_id, cargador_id, codigo_recibo, total_pagado,
    metodo_pago, comprobante_url, mesa_id, vendedor_id
  ) VALUES (
    v_org, p_cargador_id, v_codigo_recibo, v_total,
    COALESCE(p_metodo_pago, 'efectivo'), p_comprobante_url, p_mesa_id, p_vendedor_id
  )
  RETURNING * INTO v_compra;

  FOR v_i IN 1..v_n LOOP
    v_codigo_brazo := 'VT-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 10));

    UPDATE public.brazos
    SET
      estado = 'vendido',
      cargador_id = p_cargador_id,
      precio_pagado = p_precios[v_i],
      codigo_boleta_qr = v_codigo_brazo,
      compra_id = v_compra.id,
      bloqueado_hasta = NULL,
      metodo_pago = COALESCE(p_metodo_pago, 'efectivo'),
      comprobante_url = p_comprobante_url,
      pago_confirmado_en = NOW(),
      estado_entrega = 'pendiente',
      updated_at = NOW()
    WHERE id = p_brazo_ids[v_i]
      AND organizacion_id = v_org
      AND estado = 'reservado'
    RETURNING * INTO v_brazo;

    IF v_brazo.id IS NULL THEN
      RAISE EXCEPTION 'No se pudo vender brazo %', p_brazo_ids[v_i];
    END IF;

    v_brazos := v_brazos || to_jsonb(v_brazo);
  END LOOP;

  RETURN jsonb_build_object(
    'compra', to_jsonb(v_compra),
    'brazos', v_brazos
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirmar_venta_compra TO authenticated;


-- ═══ 015_leyenda_correo.sql ═══

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


-- ═══ 016_correo_entrega.sql ═══

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


-- ═══ 017_operador_venta.sql ═══

-- Operador de venta: nombre visible en boleta + vendedor en brazos para cuadre en caja
-- Ejecutar en Supabase SQL Editor

ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS operador_nombre TEXT;

ALTER TABLE public.brazos
  ADD COLUMN IF NOT EXISTS operador_nombre TEXT;

-- Quitar versión anterior (7 params) para no quedar con dos funciones homónimas
DROP FUNCTION IF EXISTS public.confirmar_venta_compra(
  UUID[], UUID, NUMERIC[], TEXT, TEXT, UUID, UUID
);

-- Por si ya se intentó correr este script y quedó la versión nueva a medias
DROP FUNCTION IF EXISTS public.confirmar_venta_compra(
  UUID[], UUID, NUMERIC[], TEXT, TEXT, UUID, UUID, TEXT
);

CREATE OR REPLACE FUNCTION public.confirmar_venta_compra(
  p_brazo_ids UUID[],
  p_cargador_id UUID,
  p_precios NUMERIC[],
  p_metodo_pago TEXT DEFAULT 'efectivo',
  p_comprobante_url TEXT DEFAULT NULL,
  p_mesa_id UUID DEFAULT NULL,
  p_vendedor_id UUID DEFAULT NULL,
  p_operador_nombre TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID;
  v_compra public.compras;
  v_codigo_recibo TEXT;
  v_total NUMERIC(10,2) := 0;
  v_i INT;
  v_brazo public.brazos;
  v_codigo_brazo TEXT;
  v_brazos JSONB := '[]'::JSONB;
  v_n INT;
  v_operador TEXT;
BEGIN
  v_org := public.get_user_organizacion_id();
  v_n := COALESCE(array_length(p_brazo_ids, 1), 0);
  v_operador := NULLIF(TRIM(p_operador_nombre), '');

  IF v_n = 0 THEN
    RAISE EXCEPTION 'Debe incluir al menos un brazo';
  END IF;

  IF v_n <> COALESCE(array_length(p_precios, 1), 0) THEN
    RAISE EXCEPTION 'Precios no coinciden con cantidad de brazos';
  END IF;

  FOR v_i IN 1..v_n LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.brazos
      WHERE id = p_brazo_ids[v_i]
        AND organizacion_id = v_org
        AND estado = 'reservado'
    ) THEN
      RAISE EXCEPTION 'Brazo % no reservado o no disponible', p_brazo_ids[v_i];
    END IF;
    v_total := v_total + COALESCE(p_precios[v_i], 0);
  END LOOP;

  v_codigo_recibo := 'VR-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 10));

  INSERT INTO public.compras (
    organizacion_id, cargador_id, codigo_recibo, total_pagado,
    metodo_pago, comprobante_url, mesa_id, vendedor_id, operador_nombre
  ) VALUES (
    v_org, p_cargador_id, v_codigo_recibo, v_total,
    COALESCE(p_metodo_pago, 'efectivo'), p_comprobante_url, p_mesa_id, p_vendedor_id, v_operador
  )
  RETURNING * INTO v_compra;

  FOR v_i IN 1..v_n LOOP
    v_codigo_brazo := 'VT-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 10));

    UPDATE public.brazos
    SET
      estado = 'vendido',
      cargador_id = p_cargador_id,
      precio_pagado = p_precios[v_i],
      codigo_boleta_qr = v_codigo_brazo,
      compra_id = v_compra.id,
      bloqueado_hasta = NULL,
      metodo_pago = COALESCE(p_metodo_pago, 'efectivo'),
      comprobante_url = p_comprobante_url,
      pago_confirmado_en = NOW(),
      estado_entrega = 'pendiente',
      vendedor_id = p_vendedor_id,
      mesa_id = p_mesa_id,
      operador_nombre = v_operador,
      updated_at = NOW()
    WHERE id = p_brazo_ids[v_i]
      AND organizacion_id = v_org
      AND estado = 'reservado'
    RETURNING * INTO v_brazo;

    IF v_brazo.id IS NULL THEN
      RAISE EXCEPTION 'No se pudo vender brazo %', p_brazo_ids[v_i];
    END IF;

    v_brazos := v_brazos || to_jsonb(v_brazo);
  END LOOP;

  RETURN jsonb_build_object(
    'compra', to_jsonb(v_compra),
    'brazos', v_brazos
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirmar_venta_compra(
  UUID[], UUID, NUMERIC[], TEXT, TEXT, UUID, UUID, TEXT
) TO authenticated;


-- ═══ 018_anular_venta.sql ═══

-- Anular venta / boleta: libera brazos y marca compra como anulada
-- Ejecutar en Supabase SQL Editor

ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'activa';

ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS anulada_en TIMESTAMPTZ;

ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS anulada_por UUID;

ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'compras_estado_check'
  ) THEN
    ALTER TABLE public.compras
      ADD CONSTRAINT compras_estado_check
      CHECK (estado IN ('activa', 'anulada'));
  END IF;
END $$;

ALTER TABLE public.compras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS compras_select ON public.compras;
CREATE POLICY compras_select ON public.compras
  FOR SELECT USING (organizacion_id = public.get_user_organizacion_id());

DROP POLICY IF EXISTS compras_update ON public.compras;
CREATE POLICY compras_update ON public.compras
  FOR UPDATE USING (organizacion_id = public.get_user_organizacion_id());

CREATE OR REPLACE FUNCTION public.anular_venta_por_codigo(
  p_codigo TEXT,
  p_motivo TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID;
  v_codigo TEXT;
  v_compra public.compras;
  v_brazo public.brazos;
  v_brazos UUID[];
  v_entregados INT;
  v_n INT;
BEGIN
  v_org := public.get_user_organizacion_id();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Organización no identificada';
  END IF;

  v_codigo := UPPER(TRIM(COALESCE(p_codigo, '')));
  IF v_codigo !~ '^V[RT]-[A-Z0-9]+$' THEN
    RAISE EXCEPTION 'Código de boleta inválido';
  END IF;

  IF v_codigo LIKE 'VR-%' THEN
    SELECT * INTO v_compra
    FROM public.compras
    WHERE organizacion_id = v_org
      AND codigo_recibo = v_codigo
      AND COALESCE(estado, 'activa') = 'activa'
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Boleta no encontrada o ya anulada';
    END IF;

    SELECT ARRAY_AGG(id ORDER BY numero_turno, numero_brazo, lado)
    INTO v_brazos
    FROM public.brazos
    WHERE compra_id = v_compra.id
      AND organizacion_id = v_org
      AND estado = 'vendido';

    IF v_brazos IS NULL OR array_length(v_brazos, 1) IS NULL THEN
      RAISE EXCEPTION 'Boleta no encontrada o ya anulada';
    END IF;
  ELSE
    SELECT * INTO v_brazo
    FROM public.brazos
    WHERE organizacion_id = v_org
      AND codigo_boleta_qr = v_codigo
      AND estado = 'vendido'
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Boleta no encontrada o ya anulada';
    END IF;

    IF v_brazo.compra_id IS NOT NULL THEN
      SELECT * INTO v_compra
      FROM public.compras
      WHERE id = v_brazo.compra_id
        AND organizacion_id = v_org
        AND COALESCE(estado, 'activa') = 'activa';

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Compra asociada no encontrada o ya anulada';
      END IF;

      SELECT ARRAY_AGG(id ORDER BY numero_turno, numero_brazo, lado)
      INTO v_brazos
      FROM public.brazos
      WHERE compra_id = v_compra.id
        AND organizacion_id = v_org
        AND estado = 'vendido';
    ELSE
      v_brazos := ARRAY[v_brazo.id];
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_entregados
  FROM public.brazos
  WHERE id = ANY(v_brazos)
    AND estado_entrega = 'entregado';

  IF v_entregados > 0 THEN
    RAISE EXCEPTION 'No se puede anular: uno o más turnos ya fueron entregados';
  END IF;

  UPDATE public.brazos
  SET
    estado = 'disponible',
    cargador_id = NULL,
    codigo_boleta_qr = NULL,
    precio_pagado = NULL,
    compra_id = NULL,
    bloqueado_hasta = NULL,
    vendedor_id = NULL,
    mesa_id = NULL,
    metodo_pago = NULL,
    comprobante_url = NULL,
    pago_confirmado_en = NULL,
    operador_nombre = NULL,
    estado_entrega = 'pendiente',
    entregado_en = NULL,
    entregado_por = NULL,
    reserva_apartado = false,
    asignado_nombre = NULL,
    apartado_notas = NULL,
    updated_at = NOW()
  WHERE id = ANY(v_brazos)
    AND organizacion_id = v_org
    AND estado = 'vendido';

  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'No se pudo liberar ningún espacio';
  END IF;

  IF v_compra.id IS NOT NULL THEN
    UPDATE public.compras
    SET
      estado = 'anulada',
      anulada_en = NOW(),
      anulada_por = auth.uid(),
      motivo_anulacion = NULLIF(TRIM(p_motivo), '')
    WHERE id = v_compra.id
      AND organizacion_id = v_org;
  END IF;

  RETURN jsonb_build_object(
    'codigo', v_codigo,
    'brazos_liberados', v_n,
    'compra_id', v_compra.id,
    'motivo', NULLIF(TRIM(p_motivo), '')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.anular_venta_por_codigo(TEXT, TEXT) TO authenticated;


-- ═══ 019_horario_turno.sql ═══

-- Hora estimada de paso por turno en la procesión
ALTER TABLE public.turnos
  ADD COLUMN IF NOT EXISTS hora_estimada TIME;

COMMENT ON COLUMN public.turnos.hora_estimada IS 'Hora estimada de paso del turno en el recorrido (fecha en cortejos.fecha)';


-- ═══ 020_devoto_whatsapp_no_unique.sql ═══

-- WhatsApp y correo pueden repetirse entre devotos distintos.
-- El identificador único por organización es el CUI (idx_cargadores_cui_org).

ALTER TABLE public.cargadores_organizacion
  DROP CONSTRAINT IF EXISTS cargadores_organizacion_organizacion_id_whatsapp_key;


-- ═══ 021_perf_taquilla_impresion.sql ═══

-- Rendimiento: índices + RPC POST para liberar reservas (evita PATCH lento vía proxy)

CREATE INDEX IF NOT EXISTS idx_brazos_org_estado_updated
  ON public.brazos(organizacion_id, estado, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_compras_org_pago
  ON public.compras(organizacion_id, pago_confirmado_en DESC NULLS LAST);

CREATE OR REPLACE FUNCTION public.liberar_reservas_taquilla_expiradas(p_organizacion_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  cnt integer;
BEGIN
  UPDATE public.brazos
  SET
    estado = 'disponible',
    bloqueado_hasta = NULL,
    mesa_id = NULL,
    vendedor_id = NULL
  WHERE organizacion_id = p_organizacion_id
    AND estado = 'reservado'
    AND reserva_apartado = false
    AND bloqueado_hasta IS NOT NULL
    AND bloqueado_hasta < now();
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RETURN cnt;
END;
$$;

GRANT EXECUTE ON FUNCTION public.liberar_reservas_taquilla_expiradas(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.liberar_reservas_taquilla_expiradas(uuid) TO anon;


-- ═══ 022_brazos_cortejo_rpc.sql ═══

-- Taquilla: JOIN cortejo→turnos→brazos (evita IN gigante + OFFSET lento)

CREATE INDEX IF NOT EXISTS idx_brazos_turno_numero
  ON public.brazos(turno_id, numero_brazo);

CREATE INDEX IF NOT EXISTS idx_turnos_cortejo_numero
  ON public.turnos(cortejo_id, numero_turno);

CREATE OR REPLACE FUNCTION public.get_brazos_cortejo(
  p_cortejo_id uuid,
  p_organizacion_id uuid
)
RETURNS SETOF public.brazos
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT b.*
  FROM public.turnos t
  INNER JOIN public.brazos b
    ON b.turno_id = t.id
   AND b.organizacion_id = p_organizacion_id
  WHERE t.cortejo_id = p_cortejo_id
  ORDER BY t.numero_turno ASC, b.lado ASC, b.numero_brazo ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_brazos_cortejo(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_brazos_cortejo(uuid, uuid) TO anon;


-- ═══ 023_taquilla_perf.sql ═══

-- Taquilla: una sola llamada turnos + brazos (campos ligeros) + nombre devoto

CREATE OR REPLACE FUNCTION public.get_taquilla_cortejo(
  p_cortejo_id uuid,
  p_organizacion_id uuid
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT json_build_object(
    'turnos', COALESCE((
      SELECT json_agg(t ORDER BY t.numero_turno)
      FROM (
        SELECT
          id,
          cortejo_id,
          numero_turno,
          tipo_turno,
          etiqueta,
          precio,
          son,
          alabado,
          hora_estimada,
          total_brazos,
          organizacion_id
        FROM public.turnos
        WHERE cortejo_id = p_cortejo_id
      ) AS t
    ), '[]'::json),
    'brazos', COALESCE((
      SELECT json_agg(b ORDER BY b.numero_turno, b.lado_ord, b.numero_brazo)
      FROM (
        SELECT
          br.id,
          br.turno_id,
          br.numero_turno,
          br.numero_brazo,
          br.lado,
          br.estado,
          br.reserva_apartado,
          br.apartado_notas,
          br.asignado_nombre,
          br.cargador_id,
          br.bloqueado_hasta,
          br.mesa_id,
          br.vendedor_id,
          br.precio_pagado,
          c.nombre_completo AS cargador_nombre,
          CASE br.lado WHEN 'Izquierda' THEN 0 ELSE 1 END AS lado_ord
        FROM public.turnos t
        INNER JOIN public.brazos br
          ON br.turno_id = t.id
         AND br.organizacion_id = p_organizacion_id
        LEFT JOIN public.cargadores_organizacion c
          ON c.id = br.cargador_id
         AND c.organizacion_id = p_organizacion_id
        WHERE t.cortejo_id = p_cortejo_id
      ) AS b
    ), '[]'::json)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_taquilla_cortejo(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_taquilla_cortejo(uuid, uuid) TO anon;


-- ═══ 024_taquilla_rpc_definer.sql ═══

-- Taquilla: RPC SECURITY DEFINER (sin RLS lento) + JSON sin límite PostgREST de 1000 filas

CREATE OR REPLACE FUNCTION public.assert_org_access(p_organizacion_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN;
  END IF;
  IF p_organizacion_id IS NULL
     OR p_organizacion_id IS DISTINCT FROM public.get_user_organizacion_id() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assert_org_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_org_access(uuid) TO anon;

CREATE OR REPLACE FUNCTION public.get_taquilla_cortejo(
  p_cortejo_id uuid,
  p_organizacion_id uuid
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_org_access(p_organizacion_id);

  RETURN (
    SELECT json_build_object(
      'turnos', COALESCE((
        SELECT json_agg(t ORDER BY t.numero_turno)
        FROM (
          SELECT
            id,
            cortejo_id,
            numero_turno,
            tipo_turno,
            etiqueta,
            precio,
            son,
            alabado,
            hora_estimada,
            total_brazos,
            organizacion_id
          FROM public.turnos
          WHERE cortejo_id = p_cortejo_id
        ) AS t
      ), '[]'::json),
      'brazos', COALESCE((
        SELECT json_agg(b ORDER BY b.numero_turno, b.lado_ord, b.numero_brazo)
        FROM (
          SELECT
            br.id,
            br.turno_id,
            br.numero_turno,
            br.numero_brazo,
            br.lado,
            br.estado,
            br.reserva_apartado,
            br.apartado_notas,
            br.asignado_nombre,
            br.cargador_id,
            br.bloqueado_hasta,
            br.mesa_id,
            br.vendedor_id,
            br.precio_pagado,
            c.nombre_completo AS cargador_nombre,
            CASE br.lado WHEN 'Izquierda' THEN 0 ELSE 1 END AS lado_ord
          FROM public.turnos t
          INNER JOIN public.brazos br
            ON br.turno_id = t.id
           AND br.organizacion_id = p_organizacion_id
          LEFT JOIN public.cargadores_organizacion c
            ON c.id = br.cargador_id
           AND c.organizacion_id = p_organizacion_id
          WHERE t.cortejo_id = p_cortejo_id
        ) AS b
      ), '[]'::json)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_taquilla_cortejo(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_taquilla_cortejo(uuid, uuid) TO anon;

CREATE OR REPLACE FUNCTION public.get_brazos_cortejo_json(
  p_cortejo_id uuid,
  p_organizacion_id uuid
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_org_access(p_organizacion_id);

  RETURN COALESCE((
    SELECT json_agg(b ORDER BY b.numero_turno, b.lado_ord, b.numero_brazo)
    FROM (
      SELECT
        br.*,
        CASE br.lado WHEN 'Izquierda' THEN 0 ELSE 1 END AS lado_ord
      FROM public.turnos t
      INNER JOIN public.brazos br
        ON br.turno_id = t.id
       AND br.organizacion_id = p_organizacion_id
      WHERE t.cortejo_id = p_cortejo_id
    ) AS b
  ), '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_brazos_cortejo_json(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_brazos_cortejo_json(uuid, uuid) TO anon;

CREATE OR REPLACE FUNCTION public.get_brazos_cortejo(
  p_cortejo_id uuid,
  p_organizacion_id uuid
)
RETURNS SETOF public.brazos
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_org_access(p_organizacion_id);

  RETURN QUERY
  SELECT b.*
  FROM public.turnos t
  INNER JOIN public.brazos b
    ON b.turno_id = t.id
   AND b.organizacion_id = p_organizacion_id
  WHERE t.cortejo_id = p_cortejo_id
  ORDER BY t.numero_turno ASC, b.lado ASC, b.numero_brazo ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_brazos_cortejo(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_brazos_cortejo(uuid, uuid) TO anon;

DROP FUNCTION IF EXISTS public.get_brazos_cortejo_offset(uuid, uuid, integer, integer);
DROP FUNCTION IF EXISTS public.get_brazos_cortejo_offset(uuid, integer, integer, uuid);


-- ═══ 025_finanzas_perf.sql ═══

-- Finanzas / Caja: ventas y compras en JSON (SECURITY DEFINER, sin OFFSET lento ni RLS fila a fila)

CREATE INDEX IF NOT EXISTS idx_brazos_org_vendido_pago
  ON public.brazos(organizacion_id, pago_confirmado_en DESC NULLS LAST)
  WHERE estado = 'vendido';

CREATE INDEX IF NOT EXISTS idx_compras_org_pago
  ON public.compras(organizacion_id, pago_confirmado_en DESC NULLS LAST);

CREATE OR REPLACE FUNCTION public.get_finanzas_ventas_json(p_organizacion_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_org_access(p_organizacion_id);

  RETURN COALESCE((
    SELECT json_agg(row_to_json(x))
    FROM (
      SELECT
        b.id,
        b.turno_id,
        COALESCE(b.numero_turno, t.numero_turno) AS numero_turno,
        b.numero_brazo,
        b.lado,
        b.estado,
        b.precio_pagado,
        b.codigo_boleta_qr,
        b.compra_id,
        b.cargador_id,
        b.mesa_id,
        COALESCE(b.vendedor_id, c.vendedor_id) AS vendedor_id,
        COALESCE(NULLIF(trim(b.operador_nombre), ''), NULLIF(trim(c.operador_nombre), '')) AS operador_nombre,
        b.metodo_pago,
        (b.comprobante_url IS NOT NULL AND b.comprobante_url <> '') AS tiene_comprobante,
        b.estado_entrega,
        b.pago_confirmado_en,
        b.updated_at,
        b.created_at,
        t.tipo_turno,
        COALESCE(t.etiqueta, t.tipo_turno) AS turno_etiqueta,
        t.hora_estimada,
        cj.fecha AS fecha_evento,
        cj.nombre_evento AS cortejo_nombre
      FROM public.brazos b
      LEFT JOIN public.turnos t ON t.id = b.turno_id
      LEFT JOIN public.cortejos cj ON cj.id = t.cortejo_id
      LEFT JOIN public.compras c ON c.id = b.compra_id
      WHERE b.organizacion_id = p_organizacion_id
        AND b.estado = 'vendido'
    ) x
  ), '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_finanzas_ventas_json(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_finanzas_ventas_json(uuid) TO anon;

CREATE OR REPLACE FUNCTION public.get_compras_org_json(p_organizacion_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_org_access(p_organizacion_id);

  RETURN COALESCE((
    SELECT json_agg(row_to_json(c))
    FROM (
      SELECT
        id,
        organizacion_id,
        codigo_recibo,
        total_pagado,
        cargador_id,
        vendedor_id,
        operador_nombre,
        metodo_pago,
        (comprobante_url IS NOT NULL AND comprobante_url <> '') AS tiene_comprobante,
        estado,
        pago_confirmado_en,
        created_at
      FROM public.compras
      WHERE organizacion_id = p_organizacion_id
    ) c
  ), '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_compras_org_json(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_compras_org_json(uuid) TO anon;

CREATE OR REPLACE FUNCTION public.get_brazos_vendidos_org_json(p_organizacion_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_org_access(p_organizacion_id);

  RETURN COALESCE((
    SELECT json_agg(row_to_json(b))
    FROM (
      SELECT
        id,
        turno_id,
        numero_turno,
        numero_brazo,
        lado,
        estado,
        precio_pagado,
        codigo_boleta_qr,
        compra_id,
        cargador_id,
        mesa_id,
        vendedor_id,
        operador_nombre,
        metodo_pago,
        (comprobante_url IS NOT NULL AND comprobante_url <> '') AS tiene_comprobante,
        estado_entrega,
        pago_confirmado_en,
        updated_at,
        created_at
      FROM public.brazos
      WHERE organizacion_id = p_organizacion_id
        AND estado = 'vendido'
    ) b
  ), '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_brazos_vendidos_org_json(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_brazos_vendidos_org_json(uuid) TO anon;
