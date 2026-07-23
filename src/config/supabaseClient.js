/**
 * Cliente Supabase + Realtime
 * En modo MOCK (REACT_APP_MOCK_MODE=true) no se conecta a la red.
 */
import { createClient } from '@supabase/supabase-js';
import { createSupabaseFetch } from './supabaseFetch';

/**
 * Desarrollo: mock si REACT_APP_MOCK_MODE !== 'false'.
 * Producción: SIEMPRE Supabase (ignora REACT_APP_MOCK_MODE=true en Vercel).
 */
export const MOCK_MODE =
  process.env.NODE_ENV === 'production'
    ? false
    : process.env.REACT_APP_MOCK_MODE !== 'false';

const supabaseUrl =
  process.env.REACT_APP_SUPABASE_URL || 'https://emmkatautioefhmvxejg.supabase.co';

/** Clave pública (publishable/anon). Fallback si Vercel no inyecta env en el build. */
const supabaseAnonKey =
  process.env.REACT_APP_SUPABASE_ANON_KEY ||
  'sb_publishable_2eCHPUySC-tupIYgMoCa6g_Us8vUiQd';

if (!MOCK_MODE && !supabaseAnonKey) {
  throw new Error(
    'Falta REACT_APP_SUPABASE_ANON_KEY. Configúrala en Vercel o .env.production'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    fetch: MOCK_MODE ? undefined : createSupabaseFetch(),
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});

/**
 * Un canal Realtime por organización; varios listeners (Taquilla usa dos effects).
 * No se puede llamar .on() después de .subscribe() en el mismo canal.
 */
const brazosRealtimeHub = new Map();

function getBrazosHub(organizacionId) {
  if (brazosRealtimeHub.has(organizacionId)) {
    return brazosRealtimeHub.get(organizacionId);
  }

  const listeners = new Set();
  const channel = supabase.channel(`brazos:org:${organizacionId}`);

  const notifyListeners = (payload) => {
    listeners.forEach((fn) => {
      try {
        fn(payload);
      } catch (e) {
        console.error('subscribeBrazos listener:', e);
      }
    });
  };

  channel
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'brazos',
        filter: `organizacion_id=eq.${organizacionId}`,
      },
      notifyListeners
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'turnos',
        filter: `organizacion_id=eq.${organizacionId}`,
      },
      notifyListeners
    )
    .subscribe();

  const hub = { channel, listeners };
  brazosRealtimeHub.set(organizacionId, hub);
  return hub;
}

/**
 * Suscripción Realtime filtrada por organización (tabla brazos).
 */
export function subscribeBrazos(organizacionId, onChange) {
  if (MOCK_MODE || !organizacionId) return () => {};

  const hub = getBrazosHub(organizacionId);
  hub.listeners.add(onChange);

  return () => {
    hub.listeners.delete(onChange);
    if (hub.listeners.size === 0) {
      supabase.removeChannel(hub.channel);
      brazosRealtimeHub.delete(organizacionId);
    }
  };
}
export const EMAIL_WEBHOOK_URL =
  process.env.REACT_APP_EMAIL_WEBHOOK_URL || '';
