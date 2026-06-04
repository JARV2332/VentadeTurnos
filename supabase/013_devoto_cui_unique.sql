-- CUI único por organización (identificador del devoto, además del UUID)
-- Ejecutar en Supabase SQL Editor

CREATE UNIQUE INDEX IF NOT EXISTS idx_cargadores_cui_org
  ON public.cargadores_organizacion (organizacion_id, cui_o_identificacion)
  WHERE cui_o_identificacion IS NOT NULL
    AND trim(cui_o_identificacion) <> '';

CREATE INDEX IF NOT EXISTS idx_cargadores_cui_lookup
  ON public.cargadores_organizacion (organizacion_id, cui_o_identificacion);
