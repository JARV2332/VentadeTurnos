/**
 * Preregistro público de devotos (sin login).
 * GET  ?org=slug → meta org + textos del formulario
 * POST → inserta 1 sola vez por DPI; rate limit por IP y por org.
 */
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { getSupabaseConfig } from './_lib/verifyCaller.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Máx. envíos por IP (hash) en 10 minutos, por organización. */
const MAX_POR_IP_10_MIN = 5;
/** Máx. preregistros nuevos por organización en 60 segundos (anti-volcado). */
const MAX_POR_ORG_60_SEG = 80;

const orgCache = new Map();
const ORG_CACHE_MS = 60_000;

function normalizarCui(texto) {
  return String(texto || '').replace(/\D/g, '').slice(0, 13);
}

function isValidCui(texto) {
  return normalizarCui(texto).length === 13;
}

function normalizarWhatsapp(texto) {
  return String(texto || '').replace(/\D/g, '');
}

function isValidWhatsapp(texto) {
  const d = normalizarWhatsapp(texto);
  return d.length === 11 && d.startsWith('502');
}

function correoPareceValido(texto) {
  const c = String(texto || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c);
}

function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  const real = String(req.headers['x-real-ip'] || '').trim();
  return xf || real || req.socket?.remoteAddress || 'unknown';
}

function hashIp(ip) {
  return createHash('sha256').update(`preregistro:${ip}`).digest('hex').slice(0, 32);
}

async function resolverOrganizacion(admin, orgParam) {
  const slug = String(orgParam || '').trim();
  if (!slug) return null;

  const cached = orgCache.get(slug);
  if (cached && Date.now() - cached.at < ORG_CACHE_MS) {
    return cached.org;
  }

  let query = admin
    .from('organizaciones')
    .select('id, nombre_oficial, entidad_o_parroquia, subdominio_slug, telefono_contacto');
  if (UUID_RE.test(slug)) {
    query = query.eq('id', slug);
  } else {
    query = query.eq('subdominio_slug', slug);
  }

  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  orgCache.set(slug, { org: data, at: Date.now() });
  return data;
}

function leerConfigPreregistro(reciboRow) {
  const diseño =
    reciboRow?.diseño && typeof reciboRow.diseño === 'object' && !Array.isArray(reciboRow.diseño)
      ? reciboRow.diseño
      : {};
  const activo = diseño.preregistro_activo !== false;
  return {
    activo,
    titulo: String(diseño.preregistro_titulo || '').trim() || 'Preregistro de turnos',
    mensaje:
      String(diseño.preregistro_mensaje || '').trim() ||
      'Complete sus datos una sola vez. Con su DPI, en taquilla aparecerán automáticamente.',
    logo_url: diseño.logo_url || null,
    color_primario: diseño.color_primario || '#1d4ed8',
  };
}

async function comprobarRateLimit(admin, orgId, ipHash) {
  const hace10Min = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const hace60Seg = new Date(Date.now() - 60 * 1000).toISOString();

  const [{ count: porIp, error: e1 }, { count: porOrg, error: e2 }] = await Promise.all([
    admin
      .from('preregistro_rate')
      .select('id', { count: 'exact', head: true })
      .eq('organizacion_id', orgId)
      .eq('ip_hash', ipHash)
      .gte('created_at', hace10Min),
    admin
      .from('preregistro_rate')
      .select('id', { count: 'exact', head: true })
      .eq('organizacion_id', orgId)
      .gte('created_at', hace60Seg),
  ]);

  // Si la tabla aún no existe en prod, no bloqueamos el preregistro.
  if (e1 || e2) {
    const msg = `${e1?.message || ''} ${e2?.message || ''}`;
    if (/relation|does not exist|schema cache/i.test(msg)) {
      return { ok: true, sinTabla: true };
    }
    return { ok: true, sinTabla: true };
  }

  if ((porIp || 0) >= MAX_POR_IP_10_MIN) {
    return {
      ok: false,
      status: 429,
      error:
        'Demasiados intentos desde esta conexión. Espere unos minutos e intente de nuevo.',
    };
  }
  if ((porOrg || 0) >= MAX_POR_ORG_60_SEG) {
    return {
      ok: false,
      status: 429,
      error:
        'Hay mucha demanda en este momento. Espere 1 minuto e intente enviar de nuevo.',
    };
  }
  return { ok: true, sinTabla: false };
}

async function registrarRateEvento(admin, orgId, ipHash) {
  const { error } = await admin.from('preregistro_rate').insert({
    organizacion_id: orgId,
    ip_hash: ipHash,
  });
  if (error && !/relation|does not exist|schema cache/i.test(error.message || '')) {
    console.warn('preregistro_rate insert:', error.message);
  }
}

export default async function handler(req, res) {
  const { url, serviceKey } = getSupabaseConfig();
  if (!url || !serviceKey) {
    return res.status(500).json({ error: 'Servicio no configurado' });
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (req.method === 'GET') {
    const orgParam = String(req.query.org || '').trim();
    if (!orgParam) {
      return res.status(400).json({ error: 'Organización no indicada' });
    }
    const org = await resolverOrganizacion(admin, orgParam);
    if (!org) {
      return res.status(404).json({ error: 'Organización no encontrada' });
    }
    const { data: recibo } = await admin
      .from('configuracion_recibo')
      .select('formato, diseño')
      .eq('organizacion_id', org.id)
      .maybeSingle();
    const config = leerConfigPreregistro(recibo);
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    return res.status(200).json({
      organizacion: {
        id: org.id,
        nombre_oficial: org.nombre_oficial,
        entidad_o_parroquia: org.entidad_o_parroquia,
        subdominio_slug: org.subdominio_slug,
      },
      config,
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: 'JSON inválido' });
    }
  }
  body = body || {};

  // Honeypot anti-bots
  if (String(body.website || body.company || '').trim()) {
    return res.status(200).json({ ok: true, actualizado: false });
  }

  const orgParam = String(body.org || body.orgSlug || '').trim();
  if (!orgParam) {
    return res.status(400).json({ error: 'Organización no indicada' });
  }

  const org = await resolverOrganizacion(admin, orgParam);
  if (!org) {
    return res.status(404).json({ error: 'Organización no encontrada' });
  }

  const { data: recibo } = await admin
    .from('configuracion_recibo')
    .select('formato, diseño')
    .eq('organizacion_id', org.id)
    .maybeSingle();
  const config = leerConfigPreregistro(recibo);
  if (!config.activo) {
    return res.status(403).json({ error: 'El preregistro no está disponible en este momento.' });
  }

  const ipHash = hashIp(clientIp(req));
  const rate = await comprobarRateLimit(admin, org.id, ipHash);
  if (!rate.ok) {
    return res.status(rate.status || 429).json({ error: rate.error, codigo: 'RATE_LIMIT' });
  }

  const nombre = String(body.nombre_completo || '').trim();
  const cui = normalizarCui(body.cui_o_identificacion || body.cui || body.dpi);
  const whatsapp = normalizarWhatsapp(body.whatsapp);
  const correo = String(body.correo || '').trim().toLowerCase();
  const telefonoEmergencia = String(body.telefono_emergencia || '').replace(/\D/g, '');

  if (!nombre || nombre.length < 3) {
    return res.status(400).json({ error: 'Ingrese su nombre completo.' });
  }
  if (!isValidCui(cui)) {
    return res.status(400).json({ error: 'Ingrese un DPI/CUI válido (13 dígitos).' });
  }
  if (!isValidWhatsapp(whatsapp)) {
    return res.status(400).json({ error: 'WhatsApp inválido (+502 y 8 dígitos).' });
  }
  if (!correoPareceValido(correo)) {
    return res.status(400).json({ error: 'Ingrese un correo electrónico válido.' });
  }

  const { data: existente } = await admin
    .from('cargadores_organizacion')
    .select('id, nombre_completo')
    .eq('organizacion_id', org.id)
    .eq('cui_o_identificacion', cui)
    .maybeSingle();

  // 1 DPI = 1 preregistro: no se actualiza ni se duplica.
  if (existente?.id) {
    await registrarRateEvento(admin, org.id, ipHash);
    return res.status(409).json({
      codigo: 'DPI_YA_REGISTRADO',
      error:
        'Este DPI ya está preregistrado. No es necesario enviarlo otra vez. En taquilla indiquen su DPI para continuar.',
      ya_registrado: true,
    });
  }

  const campos = {
    organizacion_id: org.id,
    nombre_completo: nombre,
    whatsapp,
    correo,
    cui_o_identificacion: cui,
    telefono_emergencia: telefonoEmergencia || '',
  };

  const { data, error } = await admin
    .from('cargadores_organizacion')
    .insert(campos)
    .select('id, nombre_completo')
    .single();

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        codigo: 'DPI_YA_REGISTRADO',
        error:
          'Este DPI ya está preregistrado. No es necesario enviarlo otra vez. En taquilla indiquen su DPI para continuar.',
        ya_registrado: true,
      });
    }
    return res.status(500).json({ error: error.message || 'No se pudo completar el registro.' });
  }

  await registrarRateEvento(admin, org.id, ipHash);

  return res.status(201).json({
    ok: true,
    actualizado: false,
    mensaje:
      'Preregistro listo. En taquilla indiquen su DPI: sus datos aparecerán automáticamente para la venta.',
    id: data.id,
  });
}
