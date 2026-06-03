/**
 * Cliente Supabase + Realtime
 * En modo MOCK (REACT_APP_MOCK_MODE=true) no se conecta a la red.
 */
import { createClient } from '@supabase/supabase-js';

/**
 * Modo demo local: mock por defecto en dev; en producción Supabase salvo REACT_APP_MOCK_MODE=true explícito.
 */
export const MOCK_MODE =
  process.env.NODE_ENV === 'production'
    ? process.env.REACT_APP_MOCK_MODE === 'true'
    : process.env.REACT_APP_MOCK_MODE !== 'false';

const supabaseUrl =
  process.env.REACT_APP_SUPABASE_URL || 'https://kolhnoectddjgfowyvux.supabase.co';

/** Clave pública (publishable/anon). Fallback si Vercel no inyecta env en el build. */
const supabaseAnonKey =
  process.env.REACT_APP_SUPABASE_ANON_KEY ||
  'sb_publishable_5-iRvKIihqoUGQi2HsY28g_FME_RxTa';

if (!MOCK_MODE && !supabaseAnonKey) {
  throw new Error(
    'Falta REACT_APP_SUPABASE_ANON_KEY. Configúrala en Vercel o .env.production'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});

/**
 * Suscripción Realtime filtrada por organización.
 * Canal: brazos:organizacion_id=eq.{organizacionId}
 */
export function subscribeBrazos(organizacionId, onChange) {
  if (MOCK_MODE) return () => {};

  const channel = supabase
    .channel(`brazos:org:${organizacionId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'brazos',
        filter: `organizacion_id=eq.${organizacionId}`,
      },
      (payload) => onChange(payload)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export const EMAIL_WEBHOOK_URL =
  process.env.REACT_APP_EMAIL_WEBHOOK_URL || '';
