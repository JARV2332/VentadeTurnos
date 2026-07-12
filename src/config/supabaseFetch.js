/**
 * Algunos proxies corporativos bloquean PATCH/DELETE cross-origin a Supabase.
 * Las mutaciones REST pasan por /api/rest-proxy (mismo origen → POST).
 */
const PROXY_PATH = '/api/rest-proxy';

function resolveUrl(input) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  if (input?.url) return input.url;
  return '';
}

function resolveMethod(input, init) {
  if (init?.method) return String(init.method).toUpperCase();
  if (input instanceof Request) return input.method.toUpperCase();
  return 'GET';
}

function mergeHeaders(input, init) {
  const headers = new Headers();
  if (input instanceof Request) {
    input.headers.forEach((value, key) => headers.set(key, value));
  }
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  }
  return headers;
}

async function resolveBody(input, init) {
  if (init?.body != null) return init.body;
  if (input instanceof Request && !['GET', 'HEAD'].includes(input.method)) {
    return input.clone().text();
  }
  return undefined;
}

function isSupabaseRestMutation(method, url) {
  if (!url.includes('.supabase.co/rest/v1/')) return false;
  return method === 'PATCH' || method === 'DELETE';
}

export function createSupabaseFetch(baseFetch = fetch) {
  return async (input, init = {}) => {
    const url = resolveUrl(input);
    const method = resolveMethod(input, init);

    if (isSupabaseRestMutation(method, url)) {
      const parsed = new URL(url);
      const headers = mergeHeaders(input, init);
      const body = await resolveBody(input, init);

      return baseFetch(PROXY_PATH, {
        method: 'POST',
        headers: {
          'Content-Type': headers.get('Content-Type') || 'application/json',
          Authorization: headers.get('Authorization') || '',
          apikey: headers.get('apikey') || '',
          Prefer: headers.get('Prefer') || '',
          Accept: headers.get('Accept') || '',
          'x-client-info': headers.get('x-client-info') || '',
          'X-Original-Method': method,
          'X-Original-Path': `${parsed.pathname}${parsed.search}`,
        },
        body,
      });
    }

    return baseFetch(input, init);
  };
}

/** Parchea fetch global antes de que cargue @supabase/supabase-js. */
export function installSupabaseFetchPatch() {
  if (typeof window === 'undefined' || window.__supabaseFetchPatched) return;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = createSupabaseFetch(nativeFetch);
  window.__supabaseFetchPatched = true;
}
