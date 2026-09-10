/**
 * Crea/actualiza usuarios demo en Supabase productivo (org separada, no Pastoral).
 * Uso: npm run db:seed-demo-prod
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

dotenv.config({ path: path.join(root, '.env.local') });
dotenv.config({ path: path.join(root, '.env') });

const url = process.env.REACT_APP_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Falta REACT_APP_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_SLUG = 'demo-ventadeturnos';
const DEMO_USERS = [
  {
    email: 'admin@demo.com',
    password: 'demo123',
    nombre: 'Admin Demo',
    rol: 'Administrador',
    telefono: '50255551001',
    cargo: 'Administrador demo',
  },
  {
    email: 'caja@demo.com',
    password: 'demo123',
    nombre: 'Caja Demo',
    rol: 'Operador de caja',
    telefono: '50255551002',
    cargo: 'Operador de caja demo',
  },
  {
    email: 'vendedor@demo.com',
    password: 'demo123',
    nombre: 'Vendedor Demo',
    rol: 'Vendedor taquilla',
    telefono: '50255551003',
    cargo: 'Vendedor demo',
  },
];

const PERMISOS = {
  Administrador: [
    'dashboard',
    'taquilla',
    'entrega',
    'ajuste_entrega',
    'caja',
    'impresion',
    'devotos',
    'consulta_turnos',
    'listado_turnos',
    'disponibilidad_turnos',
    'asistencia_turnos',
    'config',
    'config_correo',
    'correo_masivo',
    'config_recibo',
    'usuarios',
    'import_reservas',
    'apartados_pendientes',
    'reporte_entrega',
    'pendientes_por_turno',
    'pendientes_entrega_detalle',
  ],
  'Operador de caja': ['taquilla', 'entrega', 'impresion', 'caja', 'consulta_turnos', 'listado_turnos'],
  'Vendedor taquilla': ['taquilla', 'consulta_turnos'],
};

async function ensureAuthUser(email, password, nombre) {
  const { data: listed, error: listErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listErr) throw listErr;
  const found = listed?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());

  if (found) {
    const { data, error } = await admin.auth.admin.updateUserById(found.id, {
      password,
      email_confirm: true,
      user_metadata: { nombre },
    });
    if (error) throw error;
    console.log(`  Auth actualizado: ${email}`);
    return data.user;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre },
  });
  if (error) throw error;
  console.log(`  Auth creado: ${email}`);
  return data.user;
}

function crearBrazos(turnoId, numeroTurno, total, orgId) {
  const mitad = Math.floor(total / 2);
  const brazos = [];
  for (let i = 1; i <= mitad; i += 1) {
    brazos.push({
      organizacion_id: orgId,
      turno_id: turnoId,
      numero_turno: numeroTurno,
      numero_brazo: i,
      lado: 'Izquierda',
      estado: 'disponible',
    });
    brazos.push({
      organizacion_id: orgId,
      turno_id: turnoId,
      numero_turno: numeroTurno,
      numero_brazo: i,
      lado: 'Derecha',
      estado: 'disponible',
    });
  }
  return brazos;
}

console.log(`\nSembrando demo en ${url}\n`);

let { data: org } = await admin
  .from('organizaciones')
  .select('id')
  .eq('subdominio_slug', DEMO_SLUG)
  .maybeSingle();

if (!org?.id) {
  const { data: created, error } = await admin
    .from('organizaciones')
    .insert({
      nombre_oficial: 'Organización Demo — ventadeturnos.com',
      entidad_o_parroquia: 'Demo pública',
      telefono_contacto: '50200000000',
      subdominio_slug: DEMO_SLUG,
    })
    .select('id')
    .single();
  if (error) throw error;
  org = created;
  console.log('Organización demo creada:', org.id);
} else {
  console.log('Organización demo existente:', org.id);
}

const orgId = org.id;
const rolesMap = {};

for (const [nombre, permisos] of Object.entries(PERMISOS)) {
  const { data: exist } = await admin
    .from('roles_organizacion')
    .select('id')
    .eq('organizacion_id', orgId)
    .eq('nombre', nombre)
    .maybeSingle();

  if (exist?.id) {
    await admin
      .from('roles_organizacion')
      .update({ permisos, descripcion: nombre })
      .eq('id', exist.id);
    rolesMap[nombre] = exist.id;
    continue;
  }

  const { data: rol, error } = await admin
    .from('roles_organizacion')
    .insert({
      organizacion_id: orgId,
      nombre,
      descripcion: nombre,
      es_sistema: nombre === 'Administrador',
      permisos,
    })
    .select('id')
    .single();
  if (error) throw error;
  rolesMap[nombre] = rol.id;
}

for (const u of DEMO_USERS) {
  const authUser = await ensureAuthUser(u.email, u.password, u.nombre);
  const { data: exist } = await admin
    .from('usuarios_app')
    .select('id')
    .eq('email', u.email)
    .maybeSingle();

  const payload = {
    organizacion_id: orgId,
    auth_user_id: authUser.id,
    nombre: u.nombre,
    email: u.email,
    telefono: u.telefono,
    cargo: u.cargo,
    rol_id: rolesMap[u.rol],
    activo: true,
  };

  if (exist?.id) {
    const { error } = await admin.from('usuarios_app').update(payload).eq('id', exist.id);
    if (error) throw error;
    console.log(`  Perfil actualizado: ${u.email}`);
  } else {
    const { error } = await admin.from('usuarios_app').insert(payload);
    if (error) throw error;
    console.log(`  Perfil creado: ${u.email}`);
  }
}

const { data: cortejoExist } = await admin
  .from('cortejos')
  .select('id')
  .eq('organizacion_id', orgId)
  .eq('nombre_evento', 'Procesión Demo 2026')
  .maybeSingle();

if (!cortejoExist?.id) {
  const { data: cortejo, error } = await admin
    .from('cortejos')
    .insert({
      organizacion_id: orgId,
      nombre_evento: 'Procesión Demo 2026',
      fecha: '2026-12-15',
      descripcion: 'Datos de prueba para demostración pública',
      estado: 'activa',
    })
    .select('id')
    .single();
  if (error) throw error;

  const turnosDef = [
    [1, 'Salida', 'Salida', 400, 20],
    [2, 'Ordinario', 'Ordinario 1', 150, 20],
    [3, 'Ordinario', 'Ordinario 2', 150, 20],
    [4, 'Extraordinario', 'Extraordinario', 300, 12],
    [5, 'Ordinario', 'Ordinario 3', 150, 20],
    [6, 'Entrada', 'Entrada', 400, 20],
  ];

  const todosBrazos = [];
  for (const [num, tipo, etiqueta, precio, total] of turnosDef) {
    const { data: turno, error: tErr } = await admin
      .from('turnos')
      .insert({
        organizacion_id: orgId,
        cortejo_id: cortejo.id,
        numero_turno: num,
        tipo_turno: tipo,
        etiqueta,
        total_brazos: total,
        precio,
      })
      .select('id')
      .single();
    if (tErr) throw tErr;
    todosBrazos.push(...crearBrazos(turno.id, num, total, orgId));
  }

  for (let i = 0; i < todosBrazos.length; i += 100) {
    const { error: bErr } = await admin.from('brazos').insert(todosBrazos.slice(i, i + 100));
    if (bErr) throw bErr;
  }

  console.log('Procesión demo creada (6 turnos).');
} else {
  console.log('Procesión demo ya existía.');
}

console.log(`
✅ Demo listo en producción.

URL: https://ventade-turnos.vercel.app

Login:
  admin@demo.com / demo123
  caja@demo.com / demo123
  vendedor@demo.com / demo123
`);
