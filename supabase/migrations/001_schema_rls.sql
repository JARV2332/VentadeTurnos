-- ============================================================
-- ventadeturnos.com — Esquema Multi-Tenant con RLS estricto
-- Ejecutar en el SQL Editor de Supabase (Proyecto → SQL)
-- ============================================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────
-- TIPOS ENUMERADOS
-- ─────────────────────────────────────────────────────────────
CREATE TYPE rol_usuario AS ENUM ('administrador', 'vendedor');
CREATE TYPE estado_mesa AS ENUM ('activa', 'cerrada');
CREATE TYPE tipo_turno AS ENUM ('Ordinario', 'Especial', 'Honor', 'Destacado');
CREATE TYPE lado_brazo AS ENUM ('Izquierda', 'Derecha', 'Centro');
CREATE TYPE estado_brazo AS ENUM ('disponible', 'reservado', 'vendido');

-- ─────────────────────────────────────────────────────────────
-- FUNCIÓN HELPER: obtener organizacion_id del usuario autenticado
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_user_organizacion_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organizacion_id
  FROM public.usuarios_roles
  WHERE usuario_id = auth.uid()
  LIMIT 1;
$$;

-- ─────────────────────────────────────────────────────────────
-- TABLA: organizaciones (Tenant raíz)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.organizaciones (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre_oficial  TEXT NOT NULL,
  entidad_o_parroquia TEXT,
  telefono_contacto   TEXT,
  subdominio_slug     TEXT NOT NULL UNIQUE,
  creado_por      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- TABLA: usuarios_roles (vincula auth.users ↔ organización + rol)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.usuarios_roles (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organizacion_id UUID NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  rol             rol_usuario NOT NULL DEFAULT 'vendedor',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (usuario_id, organizacion_id)
);

CREATE INDEX idx_usuarios_roles_usuario ON public.usuarios_roles(usuario_id);
CREATE INDEX idx_usuarios_roles_org ON public.usuarios_roles(organizacion_id);

CREATE TYPE estado_cortejo AS ENUM ('activa', 'inactiva');

-- ─────────────────────────────────────────────────────────────
-- TABLA: cortejos (eventos / procesiones)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.cortejos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organizacion_id UUID NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  nombre_evento   TEXT NOT NULL,
  fecha           DATE NOT NULL,
  descripcion     TEXT,
  estado          estado_cortejo NOT NULL DEFAULT 'activa',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cortejos_org ON public.cortejos(organizacion_id);
CREATE INDEX idx_cortejos_estado ON public.cortejos(organizacion_id, estado);

-- ─────────────────────────────────────────────────────────────
-- TABLA: turnos (configuración de precios por turno)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.turnos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organizacion_id UUID NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  cortejo_id      UUID NOT NULL REFERENCES public.cortejos(id) ON DELETE CASCADE,
  numero_turno    INTEGER NOT NULL,
  tipo_turno      tipo_turno NOT NULL DEFAULT 'Ordinario',
  precio          NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cortejo_id, numero_turno)
);

CREATE INDEX idx_turnos_org ON public.turnos(organizacion_id);
CREATE INDEX idx_turnos_cortejo ON public.turnos(cortejo_id);

-- ─────────────────────────────────────────────────────────────
-- TABLA: mesas_vendedores
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.mesas_vendedores (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organizacion_id UUID NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  nombre_mesa     TEXT NOT NULL,
  vendedor_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  estado          estado_mesa NOT NULL DEFAULT 'activa',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mesas_org ON public.mesas_vendedores(organizacion_id);

-- ─────────────────────────────────────────────────────────────
-- TABLA: cargadores_organizacion (catálogo PRIVADO por tenant)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.cargadores_organizacion (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organizacion_id     UUID NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  nombre_completo     TEXT NOT NULL,
  whatsapp            TEXT NOT NULL CHECK (whatsapp ~ '^502[0-9]{8}$'),
  correo              TEXT,
  cui_o_identificacion TEXT,
  telefono_emergencia  TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organizacion_id, whatsapp)
);

CREATE INDEX idx_cargadores_org ON public.cargadores_organizacion(organizacion_id);
CREATE INDEX idx_cargadores_whatsapp ON public.cargadores_organizacion(organizacion_id, whatsapp);

-- ─────────────────────────────────────────────────────────────
-- TABLA: configuracion_correo (remitente por organización)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.configuracion_correo (
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

ALTER TABLE public.configuracion_correo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "correo_select" ON public.configuracion_correo
  FOR SELECT USING (organizacion_id = public.get_user_organizacion_id());

CREATE POLICY "correo_insert" ON public.configuracion_correo
  FOR INSERT WITH CHECK (organizacion_id = public.get_user_organizacion_id());

CREATE POLICY "correo_update" ON public.configuracion_correo
  FOR UPDATE USING (organizacion_id = public.get_user_organizacion_id());

-- ─────────────────────────────────────────────────────────────
-- TABLA: brazos (matriz de espacios en tiempo real)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.brazos (
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
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (turno_id, numero_brazo, lado)
);

CREATE INDEX idx_brazos_org ON public.brazos(organizacion_id);
CREATE INDEX idx_brazos_turno ON public.brazos(turno_id);
CREATE INDEX idx_brazos_estado ON public.brazos(organizacion_id, estado);
CREATE INDEX idx_brazos_realtime ON public.brazos(organizacion_id, updated_at);

-- ─────────────────────────────────────────────────────────────
-- TRIGGER: updated_at automático
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_organizaciones_updated BEFORE UPDATE ON public.organizaciones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_cortejos_updated BEFORE UPDATE ON public.cortejos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_cargadores_updated BEFORE UPDATE ON public.cargadores_organizacion
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_brazos_updated BEFORE UPDATE ON public.brazos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- HABILITAR ROW LEVEL SECURITY EN TODAS LAS TABLAS DE NEGOCIO
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.organizaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cortejos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turnos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mesas_vendedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cargadores_organizacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brazos ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- POLÍTICAS RLS: organizaciones
-- ─────────────────────────────────────────────────────────────
CREATE POLICY "org_select_own" ON public.organizaciones
  FOR SELECT USING (id = public.get_user_organizacion_id());

CREATE POLICY "org_insert_authenticated" ON public.organizaciones
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND creado_por = auth.uid());

CREATE POLICY "org_update_own" ON public.organizaciones
  FOR UPDATE USING (id = public.get_user_organizacion_id());

-- ─────────────────────────────────────────────────────────────
-- POLÍTICAS RLS: usuarios_roles
-- ─────────────────────────────────────────────────────────────
CREATE POLICY "roles_select_own_org" ON public.usuarios_roles
  FOR SELECT USING (organizacion_id = public.get_user_organizacion_id());

CREATE POLICY "roles_insert_own_org" ON public.usuarios_roles
  FOR INSERT WITH CHECK (organizacion_id = public.get_user_organizacion_id());

CREATE POLICY "roles_update_own_org" ON public.usuarios_roles
  FOR UPDATE USING (organizacion_id = public.get_user_organizacion_id());

CREATE POLICY "roles_delete_own_org" ON public.usuarios_roles
  FOR DELETE USING (organizacion_id = public.get_user_organizacion_id());

-- ─────────────────────────────────────────────────────────────
-- POLÍTICAS RLS: cortejos
-- ─────────────────────────────────────────────────────────────
CREATE POLICY "cortejos_select" ON public.cortejos
  FOR SELECT USING (organizacion_id = public.get_user_organizacion_id());

CREATE POLICY "cortejos_insert" ON public.cortejos
  FOR INSERT WITH CHECK (organizacion_id = public.get_user_organizacion_id());

CREATE POLICY "cortejos_update" ON public.cortejos
  FOR UPDATE USING (organizacion_id = public.get_user_organizacion_id());

CREATE POLICY "cortejos_delete" ON public.cortejos
  FOR DELETE USING (organizacion_id = public.get_user_organizacion_id());

-- ─────────────────────────────────────────────────────────────
-- POLÍTICAS RLS: turnos
-- ─────────────────────────────────────────────────────────────
CREATE POLICY "turnos_select" ON public.turnos
  FOR SELECT USING (organizacion_id = public.get_user_organizacion_id());

CREATE POLICY "turnos_insert" ON public.turnos
  FOR INSERT WITH CHECK (organizacion_id = public.get_user_organizacion_id());

CREATE POLICY "turnos_update" ON public.turnos
  FOR UPDATE USING (organizacion_id = public.get_user_organizacion_id());

CREATE POLICY "turnos_delete" ON public.turnos
  FOR DELETE USING (organizacion_id = public.get_user_organizacion_id());

-- ─────────────────────────────────────────────────────────────
-- POLÍTICAS RLS: mesas_vendedores
-- ─────────────────────────────────────────────────────────────
CREATE POLICY "mesas_select" ON public.mesas_vendedores
  FOR SELECT USING (organizacion_id = public.get_user_organizacion_id());

CREATE POLICY "mesas_insert" ON public.mesas_vendedores
  FOR INSERT WITH CHECK (organizacion_id = public.get_user_organizacion_id());

CREATE POLICY "mesas_update" ON public.mesas_vendedores
  FOR UPDATE USING (organizacion_id = public.get_user_organizacion_id());

CREATE POLICY "mesas_delete" ON public.mesas_vendedores
  FOR DELETE USING (organizacion_id = public.get_user_organizacion_id());

-- ─────────────────────────────────────────────────────────────
-- POLÍTICAS RLS: cargadores_organizacion (catálogo privado)
-- ─────────────────────────────────────────────────────────────
CREATE POLICY "cargadores_select" ON public.cargadores_organizacion
  FOR SELECT USING (organizacion_id = public.get_user_organizacion_id());

CREATE POLICY "cargadores_insert" ON public.cargadores_organizacion
  FOR INSERT WITH CHECK (organizacion_id = public.get_user_organizacion_id());

CREATE POLICY "cargadores_update" ON public.cargadores_organizacion
  FOR UPDATE USING (organizacion_id = public.get_user_organizacion_id());

CREATE POLICY "cargadores_delete" ON public.cargadores_organizacion
  FOR DELETE USING (organizacion_id = public.get_user_organizacion_id());

-- ─────────────────────────────────────────────────────────────
-- POLÍTICAS RLS: brazos (matriz en tiempo real)
-- ─────────────────────────────────────────────────────────────
CREATE POLICY "brazos_select" ON public.brazos
  FOR SELECT USING (organizacion_id = public.get_user_organizacion_id());

CREATE POLICY "brazos_insert" ON public.brazos
  FOR INSERT WITH CHECK (organizacion_id = public.get_user_organizacion_id());

CREATE POLICY "brazos_update" ON public.brazos
  FOR UPDATE USING (organizacion_id = public.get_user_organizacion_id());

CREATE POLICY "brazos_delete" ON public.brazos
  FOR DELETE USING (organizacion_id = public.get_user_organizacion_id());

-- ─────────────────────────────────────────────────────────────
-- REALTIME: habilitar publicación para brazos
-- (Dashboard → Database → Replication → brazos)
-- O ejecutar:
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.brazos;
-- ─────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────
-- FUNCIÓN: reservar brazo con bloqueo de 5 minutos (anti-sobreventa)
-- ─────────────────────────────────────────────────────────────
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
    RAISE EXCEPTION 'El espacio no está disponible o fue reservado por otra mesa';
  END IF;

  RETURN v_brazo;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- FUNCIÓN: confirmar venta de brazo
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirmar_venta_brazo(
  p_brazo_id UUID,
  p_cargador_id UUID,
  p_precio_pagado NUMERIC
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
  v_codigo := 'VT-' || UPPER(SUBSTRING(encode(gen_random_bytes(6), 'hex'), 1, 10));

  UPDATE public.brazos
  SET
    estado = 'vendido',
    cargador_id = p_cargador_id,
    precio_pagado = p_precio_pagado,
    codigo_boleta_qr = v_codigo,
    bloqueado_hasta = NULL,
    updated_at = NOW()
  WHERE id = p_brazo_id
    AND organizacion_id = public.get_user_organizacion_id()
    AND estado = 'reservado'
    AND vendedor_id = auth.uid()
  RETURNING * INTO v_brazo;

  IF v_brazo.id IS NULL THEN
    RAISE EXCEPTION 'No se pudo confirmar la venta. Verifique la reserva activa.';
  END IF;

  RETURN v_brazo;
END;
$$;
