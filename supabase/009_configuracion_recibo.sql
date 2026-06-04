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
