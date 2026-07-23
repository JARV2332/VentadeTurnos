/**
 * Reenvía PATCH/DELETE de Supabase REST desde el servidor (sin CORS del navegador).
 */
import { getSupabaseConfig } from './_lib/verifyCaller.js';
import { verifyAuth } from './_lib/verifyAuth.js';

const ALLOWED_METHODS = new Set(['PATCH', 'DELETE']);
const AUTH_CACHE_MS = 60_000;
const authCache = new Map();

async function verifyAuthCached(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { status: 401, error: 'No autorizado' };
  }

  const token = authHeader.slice(7);
  const cached = authCache.get(token);
  if (cached && cached.expires > Date.now()) {
    return cached.result;
  }

  const result = await verifyAuth(req);
  if (!result.status) {
    authCache.set(token, { result, expires: Date.now() + AUTH_CACHE_MS });
    if (authCache.size > 200) {
      const now = Date.now();
      for (const [key, entry] of authCache) {
        if (entry.expires <= now) authCache.delete(key);
      }
    }
  }
  return result;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await verifyAuthCached(req);
  if (auth.status) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const originalMethod = (req.headers['x-original-method'] || '').toUpperCase();
  if (!ALLOWED_METHODS.has(originalMethod)) {
    return res.status(400).json({ error: 'Método no permitido en proxy' });
  }

  const originalPath = req.headers['x-original-path'] || '';
  if (!originalPath.startsWith('/rest/v1/') || originalPath.includes('..')) {
    return res.status(400).json({ error: 'Ruta inválida' });
  }

  const { url: baseUrl } = getSupabaseConfig();
  if (!baseUrl) {
    return res.status(500).json({ error: 'Supabase URL no configurada' });
  }

  const apikey = req.headers['apikey'];
  if (!apikey) {
    return res.status(400).json({ error: 'Falta apikey' });
  }

  const targetUrl = `${baseUrl.replace(/\/$/, '')}${originalPath}`;
  const forwardHeaders = {
    apikey,
    Authorization: req.headers['authorization'] || '',
    'Content-Type': req.headers['content-type'] || 'application/json',
  };
  if (req.headers['prefer']) forwardHeaders.Prefer = req.headers['prefer'];
  if (req.headers['x-client-info']) forwardHeaders['x-client-info'] = req.headers['x-client-info'];

  let body;
  if (req.body != null && req.body !== '') {
    body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: originalMethod,
      headers: forwardHeaders,
      body,
    });

    const responseBody = await upstream.text();
    const contentType = upstream.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);
    const preferenceApplied = upstream.headers.get('preference-applied');
    if (preferenceApplied) res.setHeader('preference-applied', preferenceApplied);

    return res.status(upstream.status).send(responseBody);
  } catch (err) {
    console.error('rest-proxy:', err);
    return res.status(502).json({ error: 'Error al contactar Supabase' });
  }
}
