/**
 * Preregistro público de devotos (sin login).
 * GET  ?org=slug → meta org + textos del formulario
 * POST { org, nombre_completo, cui, whatsapp, correo, telefono_emergencia? }
 * Upsert en cargadores_organizacion por CUI (mismo catálogo que taquilla).
 */
import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from './_lib/verifyCaller.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

async function resolverOrganizacion(admin, orgParam) {
  const slug = String(orgParam || '').trim();
  if (!slug) return null;

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
      'Complete sus datos para agilizar la compra en taquilla. Al llegar, indiquen su DPI.',
    logo_url: diseño.logo_url || null,
    color_primario: diseño.color_primario || '#1d4ed8',
  };
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

  // Honeypot anti-bots: si viene lleno, fingimos éxito
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
    .select('id')
    .eq('organizacion_id', org.id)
    .eq('cui_o_identificacion', cui)
    .maybeSingle();

  const campos = {
    organizacion_id: org.id,
    nombre_completo: nombre,
    whatsapp,
    correo,
    cui_o_identificacion: cui,
    telefono_emergencia: telefonoEmergencia || '',
  };

  if (existente?.id) {
    const { data, error } = await admin
      .from('cargadores_organizacion')
      .update(campos)
      .eq('id', existente.id)
      .eq('organizacion_id', org.id)
      .select('id, nombre_completo')
      .single();
    if (error) {
      return res.status(500).json({ error: error.message || 'No se pudo actualizar el registro.' });
    }
    return res.status(200).json({
      ok: true,
      actualizado: true,
      mensaje:
        'Sus datos ya estaban registrados y fueron actualizados. En taquilla indiquen su DPI para continuar la compra.',
      id: data.id,
    });
  }

  const { data, error } = await admin
    .from('cargadores_organizacion')
    .insert(campos)
    .select('id, nombre_completo')
    .single();

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        error: 'Ese DPI ya está registrado. Si necesita corregir datos, vuelva a enviar el formulario.',
      });
    }
    return res.status(500).json({ error: error.message || 'No se pudo completar el registro.' });
  }

  return res.status(201).json({
    ok: true,
    actualizado: false,
    mensaje:
      'Preregistro listo. En taquilla indiquen su DPI: sus datos aparecerán automáticamente para la venta.',
    id: data.id,
  });
}
