/**
 * Super admin: crea asociación + rol Administrador + usuario admin.
 */
import { createClient } from '@supabase/supabase-js';

const PERMISOS_ADMIN = [
  'dashboard', 'taquilla', 'entrega', 'caja', 'impresion',
  'config', 'config_correo', 'usuarios', 'import_reservas',
];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const url =
    process.env.REACT_APP_SUPABASE_URL ||
    'https://kolhnoectddjgfowyvux.supabase.co';
  const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!anonKey || !serviceKey) {
    return res.status(500).json({ error: 'Servidor sin configurar' });
  }

  const userClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authErr } = await userClient.auth.getUser(
    authHeader.slice(7)
  );
  if (authErr || !authData?.user) {
    return res.status(401).json({ error: 'Sesión inválida' });
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: superRow } = await admin
    .from('usuarios_app')
    .select('id, es_super_admin')
    .eq('auth_user_id', authData.user.id)
    .eq('es_super_admin', true)
    .eq('activo', true)
    .maybeSingle();

  if (!superRow) {
    return res.status(403).json({ error: 'Solo super administrador' });
  }

  const {
    nombreOficial,
    entidad,
    telefono,
    subdominioSlug,
    adminNombre,
    adminEmail,
    adminPassword,
  } = req.body || {};

  if (!nombreOficial?.trim() || !adminEmail?.trim() || !adminPassword) {
    return res.status(400).json({
      error: 'Nombre de asociación, correo y contraseña del administrador son obligatorios',
    });
  }

  const slug =
    subdominioSlug?.trim() ||
    `${nombreOficial.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}-${Date.now().toString(36).slice(-4)}`;

  const emailNorm = adminEmail.trim().toLowerCase();

  const { data: org, error: orgErr } = await admin
    .from('organizaciones')
    .insert({
      nombre_oficial: nombreOficial.trim(),
      entidad_o_parroquia: entidad?.trim() || null,
      telefono_contacto: telefono?.trim() || null,
      subdominio_slug: slug,
      creado_por: authData.user.id,
    })
    .select()
    .single();

  if (orgErr) {
    return res.status(400).json({ error: orgErr.message });
  }

  const { data: rol, error: rolErr } = await admin.from('roles_organizacion').insert({
    organizacion_id: org.id,
    nombre: 'Administrador',
    descripcion: 'Acceso total a la asociación',
    es_sistema: true,
    permisos: PERMISOS_ADMIN,
  }).select().single();

  if (rolErr) {
    return res.status(400).json({ error: rolErr.message });
  }

  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  let authAdmin = list?.users?.find((u) => u.email === emailNorm);

  if (!authAdmin) {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: emailNorm,
      password: adminPassword,
      email_confirm: true,
      user_metadata: { nombre: adminNombre || 'Administrador' },
    });
    if (createErr) {
      return res.status(400).json({ error: createErr.message });
    }
    authAdmin = created.user;
  }

  const { error: userErr } = await admin.from('usuarios_app').insert({
    organizacion_id: org.id,
    auth_user_id: authAdmin.id,
    nombre: adminNombre?.trim() || 'Administrador',
    email: emailNorm,
    rol_id: rol.id,
    activo: true,
    es_super_admin: false,
  });

  if (userErr) {
    return res.status(400).json({ error: userErr.message });
  }

  return res.status(200).json({ organizacion: org, rol, adminEmail: emailNorm });
}
