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
