/**
 * Crea organización demo, roles, usuarios Auth y datos de procesión.
 * Requiere .env.local:
 *   REACT_APP_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (Settings → API → service_role)
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
const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!url || !serviceKey) {
  console.error(`
❌ Configura en .env.local:

REACT_APP_SUPABASE_URL=https://kolhnoectddjgfowyvux.supabase.co
REACT_APP_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=eyJ...  (service_role, solo servidor)

Obtén service_role en: Supabase → Settings → API
`);
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_USERS = [
  { email: 'admin@demo.com', password: 'demo123', nombre: 'María Administradora', rol: 'Administrador', telefono: '50255551001', cargo: 'Administradora general' },
  { email: 'caja@demo.com', password: 'demo123', nombre: 'Ana Operadora Caja', rol: 'Operador de caja', telefono: '50255551002', cargo: 'Operadora de caja' },
  { email: 'vendedor@demo.com', password: 'demo123', nombre: 'Carlos Vendedor', rol: 'Vendedor taquilla', telefono: '50255551003', cargo: 'Vendedor de taquilla' },
];

const PERMISOS = {
  Administrador: ['dashboard', 'taquilla', 'entrega', 'caja', 'impresion', 'config', 'config_correo', 'usuarios', 'import_reservas'],
  'Operador de caja': ['taquilla', 'entrega', 'impresion'],
  'Vendedor taquilla': ['taquilla'],
};

function crearBrazos(turnoId, numeroTurno, total, orgId) {
  const mitad = Math.floor(total / 2);
  const brazos = [];
  for (let i = 1; i <= mitad; i++) {
    brazos.push({ organizacion_id: orgId, turno_id: turnoId, numero_turno: numeroTurno, numero_brazo: i, lado: 'Izquierda', estado: 'disponible' });
    brazos.push({ organizacion_id: orgId, turno_id: turnoId, numero_turno: numeroTurno, numero_brazo: i, lado: 'Derecha', estado: 'disponible' });
  }
  return brazos;
}

async function ensureAuthUser(email, password, nombre) {
  const { data: list } = await admin.auth.admin.listUsers();
  const found = list?.users?.find((u) => u.email === email);
  if (found) return found;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre },
  });
  if (error) throw error;
  return data.user;
}

console.log('Sembrando datos demo...');

const { data: orgExistente } = await admin
  .from('organizaciones')
  .select('id')
  .eq('subdominio_slug', 'pastoral-nuestra-senora-asuncion')
  .maybeSingle();

let orgId = orgExistente?.id;

if (!orgId) {
  const { data: org, error: orgErr } = await admin
    .from('organizaciones')
    .insert({
      nombre_oficial: 'Pastoral de Religiosidad Popular Nuestra Señora de La Asunción',
      entidad_o_parroquia: 'Nuestra Señora de La Asunción',
      telefono_contacto: '50255551234',
      subdominio_slug: 'pastoral-nuestra-senora-asuncion',
    })
    .select()
    .single();
  if (orgErr) throw orgErr;
  orgId = org.id;
  console.log('Organización creada:', orgId);
}

const rolesMap = {};
for (const [nombre, permisos] of Object.entries(PERMISOS)) {
  const { data: exist } = await admin
    .from('roles_organizacion')
    .select('id')
    .eq('organizacion_id', orgId)
    .eq('nombre', nombre)
    .maybeSingle();

  if (exist?.id) {
    rolesMap[nombre] = exist.id;
    continue;
  }

  const { data: rol, error } = await admin.from('roles_organizacion').insert({
    organizacion_id: orgId,
    nombre,
    descripcion: nombre,
    es_sistema: nombre === 'Administrador',
    permisos,
  }).select().single();
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

  if (!exist) {
    const { error } = await admin.from('usuarios_app').insert({
      organizacion_id: orgId,
      auth_user_id: authUser.id,
      nombre: u.nombre,
      email: u.email,
      telefono: u.telefono,
      cargo: u.cargo,
      rol_id: rolesMap[u.rol],
      activo: true,
    });
    if (error) throw error;
    console.log('Usuario app:', u.email);
  }
}

const { data: cortejoExist } = await admin
  .from('cortejos')
  .select('id')
  .eq('organizacion_id', orgId)
  .eq('nombre_evento', 'Desfile Anual 2026')
  .maybeSingle();

let cortejoId = cortejoExist?.id;

if (!cortejoId) {
  const { data: cortejo, error } = await admin.from('cortejos').insert({
    organizacion_id: orgId,
    nombre_evento: 'Desfile Anual 2026',
    fecha: '2026-06-15',
    descripcion: 'Procesión demo — 12 turnos',
    estado: 'activa',
  }).select().single();
  if (error) throw error;
  cortejoId = cortejo.id;

  const turnosDef = [
    [1, 'Salida', 'Salida', 400, 20, 'Marcha fúnebre de salida', null],
    [2, 'Ordinario', 'Ordinario 1', 150, 20, 'El Retorno', null],
    [3, 'Ordinario', 'Ordinario 2', 150, 20, null, null],
    [4, 'Ordinario', 'Ordinario 3', 150, 20, null, null],
    [5, 'Ordinario', 'Ordinario 4', 150, 20, null, null],
    [6, 'Ordinario', 'Ordinario 5', 150, 20, null, null],
    [7, 'Extraordinario', 'Extraordinario · turno 7', 300, 12, null, 'Dulce nombre de Jesús'],
    [8, 'Ordinario', 'Ordinario 6', 150, 20, 'La Peregrina', null],
    [9, 'Ordinario', 'Ordinario 7', 150, 20, null, null],
    [10, 'Ordinario', 'Ordinario 8', 150, 20, null, null],
    [11, 'Ordinario', 'Ordinario 9', 150, 20, null, null],
    [12, 'Entrada', 'Entrada', 400, 20, 'Entrada solemne', 'Salve Regina'],
  ];

  const todosBrazos = [];

  for (const [num, tipo, etiqueta, precio, total, son, alabado] of turnosDef) {
    const { data: turno, error: tErr } = await admin.from('turnos').insert({
      organizacion_id: orgId,
      cortejo_id: cortejoId,
      numero_turno: num,
      tipo_turno: tipo,
      etiqueta,
      total_brazos: total,
      precio,
      son,
      alabado,
    }).select().single();
    if (tErr) throw tErr;
    todosBrazos.push(...crearBrazos(turno.id, num, total, orgId));
  }

  const chunk = 100;
  for (let i = 0; i < todosBrazos.length; i += chunk) {
    const { error: bErr } = await admin.from('brazos').insert(todosBrazos.slice(i, i + chunk));
    if (bErr) throw bErr;
  }

  await admin.from('mesas_vendedores').insert([
    { organizacion_id: orgId, nombre_mesa: 'Mesa Principal', estado: 'activa' },
    { organizacion_id: orgId, nombre_mesa: 'Mesa Lateral', estado: 'activa' },
  ]);

  await admin.from('configuracion_correo').upsert({
    organizacion_id: orgId,
    correo_remitente: 'turnos@pastoral-asuncion.org',
    nombre_remitente: 'Pastoral de Religiosidad Popular Nuestra Señora de La Asunción',
    correo_respuesta: 'contacto@pastoral-asuncion.org',
    notificaciones_activas: true,
    pie_correo: 'Gracias por su participación.',
  }, { onConflict: 'organizacion_id' });

  console.log('Procesión demo con turnos y brazos creada.');
}

console.log(`
✅ Seed completado.

Login demo:
  admin@demo.com / demo123
  caja@demo.com / demo123
  vendedor@demo.com / demo123

En .env.local y Vercel:
  REACT_APP_MOCK_MODE=false
  REACT_APP_SUPABASE_URL=${url}
  REACT_APP_SUPABASE_ANON_KEY=${anonKey || '(tu anon/publishable key)'}
`);
