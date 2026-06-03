/**
 * Cliente Supabase + Realtime
 * En modo MOCK (REACT_APP_MOCK_MODE=true) no se conecta a la red.
 */
import { createClient } from '@supabase/supabase-js';

export const MOCK_MODE = process.env.REACT_APP_MOCK_MODE !== 'false';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://kolhnoectddjgfowyvux.supabase.co';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || '';

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
