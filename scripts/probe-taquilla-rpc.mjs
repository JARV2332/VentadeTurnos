import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: '.env.local' });

const url = 'https://dblphvmvusbgopcejbyh.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY_NEW;

async function rpc(name, body, range) {
  const t = Date.now();
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
  if (range) headers.Range = range;
  const r = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let info = text.slice(0, 150);
  try {
    const j = JSON.parse(text);
    if (Array.isArray(j)) info = `array len=${j.length}`;
    else if (j?.brazos) info = `turnos=${j.turnos?.length} brazos=${j.brazos?.length}`;
    else if (j.message) info = j.message;
  } catch {
    /* raw */
  }
  console.log(name, range || 'no-range', 'status', r.status, `${Date.now() - t}ms`, info);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL_NEW,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
const { rows } = await client.query(
  "SELECT id, organizacion_id, nombre_evento FROM cortejos WHERE estado='activa' ORDER BY fecha LIMIT 1"
);
const { id: cortejoId, organizacion_id: orgId, nombre_evento } = rows[0];
const cnt = await client.query(
  'SELECT count(*)::int AS n FROM brazos b JOIN turnos t ON t.id=b.turno_id WHERE t.cortejo_id=$1',
  [cortejoId]
);
console.log('cortejo', nombre_evento, 'brazos', cnt.rows[0].n);

await rpc('get_taquilla_cortejo', { p_cortejo_id: cortejoId, p_organizacion_id: orgId });
await rpc('get_brazos_cortejo_json', { p_cortejo_id: cortejoId, p_organizacion_id: orgId });

const turnoIds = (
  await client.query('SELECT id FROM turnos WHERE cortejo_id=$1 LIMIT 20', [cortejoId])
).rows.map((r) => r.id);
await client.end();
const inList = turnoIds.join(',');
const t0 = Date.now();
const r = await fetch(
  `${url}/rest/v1/brazos?select=id,turno_id,estado&organizacion_id=eq.${orgId}&turno_id=in.(${inList})`,
  { headers: { apikey: key, Authorization: `Bearer ${key}` } }
);
console.log('REST in(20 turnos)', r.status, `${Date.now() - t0}ms`, (await r.text()).slice(0, 120));
