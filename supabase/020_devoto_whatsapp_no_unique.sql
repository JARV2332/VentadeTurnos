-- WhatsApp y correo pueden repetirse entre devotos distintos.
-- El identificador único por organización es el CUI (idx_cargadores_cui_org).

ALTER TABLE public.cargadores_organizacion
  DROP CONSTRAINT IF EXISTS cargadores_organizacion_organizacion_id_whatsapp_key;
