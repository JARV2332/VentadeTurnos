import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: '.env.local' });
const orgId = '0d9abd14-8a47-4a91-88b7-cb7f9650eb77';
const c = new pg.Client({
  connectionString: process.env.DATABASE_URL_NEW,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

let t = Date.now();
const cnt = await c.query(
  "SELECT count(*)::int AS n FROM brazos WHERE organizacion_id=$1 AND estado='vendido'",
  [orgId]
);
console.log('vendidos', cnt.rows[0].n, `${Date.now() - t}ms`);

t = Date.now();
await c.query(
  `SELECT json_agg(row_to_json(b)) FROM (
     SELECT id, turno_id, precio_pagado, codigo_boleta_qr, comprobante_url
     FROM brazos WHERE organizacion_id=$1 AND estado='vendido'
   ) b`,
  [orgId]
);
console.log('json_agg all fields', `${Date.now() - t}ms`);

t = Date.now();
await c.query(
  `SELECT json_agg(row_to_json(b)) FROM (
     SELECT id, turno_id, precio_pagado, codigo_boleta_qr
     FROM brazos WHERE organizacion_id=$1 AND estado='vendido'
   ) b`,
  [orgId]
);
console.log('json_agg sin comprobante', `${Date.now() - t}ms`);

const avg = await c.query(
  `SELECT avg(length(coalesce(comprobante_url,'')))::int AS avg_len,
          max(length(coalesce(comprobante_url,'')))::int AS max_len
   FROM brazos WHERE organizacion_id=$1 AND estado='vendido'`,
  [orgId]
);
console.log('comprobante_url bytes avg/max', avg.rows[0]);

await c.end();
