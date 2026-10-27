-- Eventos de preregistro público (rate limit por IP / org).
-- No guarda IP en claro: solo hash.

CREATE TABLE IF NOT EXISTS public.preregistro_rate (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id UUID NOT NULL REFERENCES public.organizaciones(id) ON DELETE CASCADE,
  ip_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_preregistro_rate_org_created
  ON public.preregistro_rate (organizacion_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_preregistro_rate_org_ip_created
  ON public.preregistro_rate (organizacion_id, ip_hash, created_at DESC);

ALTER TABLE public.preregistro_rate ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.preregistro_rate IS
  'Solo para rate-limit del API público de preregistro (service role).';
