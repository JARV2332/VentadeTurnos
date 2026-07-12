/**
 * Algunos proxies corporativos bloquean PATCH/DELETE cross-origin a Supabase.
 * Las mutaciones REST pasan por /api/rest-proxy (mismo origen → POST).
 */
const PROXY_PATH = '/api/rest-proxy';

function isRestMutation(method, url) {
  if (typeof url !== 'string' || !url.includes('/rest/v1/')) return false;
  const m = (method || 'GET').toUpperCase();
  return m === 'PATCH' || m === 'DELETE';
}

export function createSupabaseFetch(baseFetch = fetch) {
  return async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = init?.method || 'GET';

    if (isRestMutation(method, url)) {
      const parsed = new URL(url);
      const headers = new Headers(init.headers);
      return baseFetch(PROXY_PATH, {
        method: 'POST',
        headers: {
          'Content-Type': headers.get('Content-Type') || 'application/json',
          Authorization: headers.get('Authorization') || '',
          apikey: headers.get('apikey') || '',
          Prefer: headers.get('Prefer') || '',
          'x-client-info': headers.get('x-client-info') || '',
          'X-Original-Method': method.toUpperCase(),
          'X-Original-Path': `${parsed.pathname}${parsed.search}`,
        },
        body: init.body,
      });
    }

    return baseFetch(input, init);
  };
}
