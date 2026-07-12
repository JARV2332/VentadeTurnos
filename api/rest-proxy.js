/**
 * Reenvía PATCH/DELETE de Supabase REST desde el servidor (sin CORS del navegador).
 */
import { getSupabaseConfig } from './verifyCaller.js';
import { verifyAuth } from './verifyAuth.js';

const ALLOWED_METHODS = new Set(['PATCH', 'DELETE']);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await verifyAuth(req);
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
