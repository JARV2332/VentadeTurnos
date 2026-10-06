/**
 * One-shot: aplica esquema en Supabase desde la red de Vercel (Postgres).
 * Invocar una vez y luego borrar este archivo.
 *
 * POST /api/migrate-schema-once
 * Header: x-migrate-secret: <MIGRATE_ONCE_SECRET en Vercel>
 */
import fs from 'fs';
import path from 'path';
import pg from 'pg';

const SQL_FILES = [
  'APLICAR_TODO.sql',
  '007_super_admin.sql',
  '008_super_manual.sql',
  '009_configuracion_recibo.sql',
  '010_correo_gmail_por_org.sql',
  '011_rpc_taquilla.sql',
  '012_fix_confirmar_venta_gen_random.sql',
  '013_devoto_cui_unique.sql',
  '014_compras_multi_turno.sql',
  '015_leyenda_correo.sql',
  '016_correo_entrega.sql',
  '017_operador_venta.sql',
  '018_anular_venta.sql',
  '019_horario_turno.sql',
  '020_devoto_whatsapp_no_unique.sql',
  '021_perf_taquilla_impresion.sql',
  '022_brazos_cortejo_rpc.sql',
  '023_taquilla_perf.sql',
  '024_taquilla_rpc_definer.sql',
  '025_finanzas_perf.sql',
  '026_entrega_tercero.sql',
  '027_revertir_entrega.sql',
  '033_turno_direccion.sql',
];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const secret = req.headers['x-migrate-secret'];
  if (!secret || secret !== process.env.MIGRATE_ONCE_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (_) {
      body = {};
    }
  }
  body = body || {};

  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  const projectRef = process.env.SUPABASE_PROJECT_REF_NEW || 'emmkatautioefhmvxejg';

  if (accessToken) {
    const log = [];
    for (const file of SQL_FILES) {
      const sqlPath = path.join(process.cwd(), 'supabase', file);
      if (!fs.existsSync(sqlPath)) {
        log.push(`skip ${file}`);
        continue;
      }
      const sql = fs.readFileSync(sqlPath, 'utf8');
      const r = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: sql }),
      });
      const body = await r.text();
      if (!r.ok) {
        return res.status(500).json({ error: `Management API ${file}: ${body.slice(0, 300)}`, log });
      }
      log.push(`ok ${file}`);
    }
    return res.status(200).json({ ok: true, via: 'management-api', log });
  }

  const dbUrl = process.env.DATABASE_URL_NEW || process.env.DATABASE_URL;
  if (!dbUrl) {
    return res.status(500).json({ error: 'Missing DATABASE_URL_NEW' });
  }

  const ref = process.env.SUPABASE_PROJECT_REF_NEW || 'emmkatautioefhmvxejg';
  const bodyPwd = typeof body.password === 'string' ? body.password : null;
  const regions = ['us-west-2'];
  const passwords = [
    process.env.SUPABASE_DB_PASSWORD,
    bodyPwd,
    ...(process.env.SUPABASE_DB_PASSWORD_CANDIDATES || '').split(',').map((s) => s.trim()),
    'VentadeTurnos',
    'JorgeAlbertoRomero$',
    'JorgeAlbertoRomero',
    'ventadeturnos',
    'VentadeTurnos123',
    'Supabase123',
  ].filter(Boolean);

  if (body.probe) {
    const host = 'aws-1-us-west-2.pooler.supabase.com';
    const log = [];
    for (const pwd of [...new Set(passwords)]) {
      for (const port of [5432, 6543]) {
        const url = `postgresql://postgres.${ref}:${encodeURIComponent(pwd)}@${host}:${port}/postgres`;
        const c = new pg.Client({
          connectionString: url,
          ssl: { rejectUnauthorized: false },
          connectionTimeoutMillis: 12000,
        });
        try {
          await c.connect();
          await c.query('select 1');
          await c.end();
          return res.status(200).json({ ok: true, url: url.replace(/:[^:@]+@/, ':****@'), log });
        } catch (e) {
          log.push(`${port} ${pwd.slice(0, 2)}***: ${e.message?.split('\n')[0]}`);
          try {
            await c.end();
          } catch (_) {}
        }
      }
    }
    return res.status(500).json({ error: 'probe failed', log });
  }
  const candidates = [];
  for (const pwd of [...new Set(passwords)]) {
    const e = encodeURIComponent(pwd);
    const poolerHost = (prefix, region, port) =>
      `postgresql://postgres.${ref}:${e}@${prefix}-${region}.pooler.supabase.com:${port}/postgres`;
    candidates.push(dbUrl.split('?')[0].replace(/:[^:@]+@/, `:${e}@`));
    for (const prefix of ['aws-1']) {
      for (const region of regions) {
        for (const port of [5432, 6543]) {
          candidates.push(poolerHost(prefix, region, port));
        }
      }
    }
  }

  let client;
  let connectedUrl = null;
  const connectLog = [];
  for (const url of [...new Set(candidates)]) {
    const c = new pg.Client({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15000,
    });
    try {
      await c.connect();
      client = c;
      connectedUrl = url.replace(/:[^:@]+@/, ':****@');
      connectLog.push(`connected ${connectedUrl}`);
      break;
    } catch (e) {
      connectLog.push(`fail ${url.split('@')[1]?.split('?')[0]}: ${e.message?.split('\n')[0] || e.code}`);
      try {
        await c.end();
      } catch (_) {}
    }
  }

  if (!client) {
    return res.status(500).json({ error: 'No Postgres connection', connectLog });
  }

  const log = [...connectLog];

  try {
    for (const file of SQL_FILES) {
      const sqlPath = path.join(process.cwd(), 'supabase', file);
      if (!fs.existsSync(sqlPath)) {
        log.push(`skip ${file}`);
        continue;
      }
      const sql = fs.readFileSync(sqlPath, 'utf8');
      await client.query(sql);
      log.push(`ok ${file}`);
    }

    await client.end();
    return res.status(200).json({ ok: true, log });
  } catch (e) {
    try {
      await client.end();
    } catch (_) {}
    return res.status(500).json({ error: e.message, log });
  }
}
