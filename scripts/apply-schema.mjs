/**
 * Aplica supabase/APLICAR_TODO.sql vía conexión Postgres directa.
 * Requiere en .env.local:
 *   DATABASE_URL=postgresql://postgres:TU_PASSWORD@db.kolhnoectddjgfowyvux.supabase.co:5432/postgres
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

dotenv.config({ path: path.join(root, '.env.local') });
dotenv.config({ path: path.join(root, '.env') });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL || DATABASE_URL.includes('[YOUR-PASSWORD]')) {
  console.error(`
❌ Falta DATABASE_URL con la contraseña real de la base de datos.

1. Supabase → Project Settings → Database → Database password
2. Crea .env.local en la raíz del proyecto:

DATABASE_URL=postgresql://postgres:TU_PASSWORD@db.kolhnoectddjgfowyvux.supabase.co:5432/postgres

O pega el contenido de supabase/APLICAR_TODO.sql en el SQL Editor de Supabase y ejecuta Run.
`);
  process.exit(1);
}

const sqlPath = path.join(root, 'supabase', 'APLICAR_TODO.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const client = new pg.Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log('Conectado a Supabase Postgres. Aplicando esquema...');
  await client.query(sql);
  console.log('✅ Esquema aplicado correctamente.');
} catch (err) {
  console.error('❌ Error aplicando esquema:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
