import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const url = process.env.DATABASE_URL_NEW || process.env.DATABASE_URL;
if (!url) {
  console.error('Falta DATABASE_URL_NEW en .env.local');
  process.exit(1);
}

const sql = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', '024_taquilla_rpc_definer.sql'),
  'utf8'
);
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query(sql);
await client.query("NOTIFY pgrst, 'reload schema'");
await client.end();
console.log('024_taquilla_rpc_definer.sql aplicado OK');
