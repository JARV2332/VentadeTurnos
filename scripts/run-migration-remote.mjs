/**
 * Aplica esquema en proyecto nuevo vía API en Vercel + restore REST local.
 *
 * Uso:
 *   node scripts/run-migration-remote.mjs TU_PASSWORD_DB
 *   node scripts/run-migration-remote.mjs   (usa SUPABASE_DB_PASSWORD en .env.local)
 */
import { spawnSync } from 'child_process';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
dotenv.config({ path: path.join(root, '.env.local') });

const password = process.argv[2] || process.env.SUPABASE_DB_PASSWORD;
const secret = process.env.MIGRATE_ONCE_SECRET || 'wk4ln8RN5pyiMD2b7Pvf1L3HjUzatcqe';

if (!password) {
  console.error('❌ Pasa la contraseña: node scripts/run-migration-remote.mjs TU_PASSWORD');
  process.exit(1);
}

const backupsRoot = path.join(root, 'backups');
const backupDir = fs
  .readdirSync(backupsRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(backupsRoot, d.name, 'manifest.json')))
  .map((d) => d.name)
  .sort()
  .reverse()[0];

if (!backupDir) {
  console.error('❌ No hay carpeta backups/ con manifest.json');
  process.exit(1);
}

console.log('\n1/2 Aplicando esquema vía Vercel (aws-1-us-west-2)…\n');
const body = JSON.stringify({ password });
const curl = spawnSync(
  'curl.exe',
  [
    '-s',
    '-X',
    'POST',
    'https://ventade-turnos.vercel.app/api/migrate-schema-once',
    '-H',
    `x-migrate-secret: ${secret}`,
    '-H',
    'Content-Type: application/json',
    '-d',
    body,
  ],
  { encoding: 'utf8' }
);

const out = curl.stdout || curl.stderr || '';
console.log(out);
if (!out.includes('"ok":true')) {
  console.error('\n❌ Esquema no aplicado. Revisa contraseña o usa SQL Editor.\n');
  process.exit(1);
}

console.log(`\n2/2 Restore datos (${backupDir})…\n`);
const node = process.execPath;
const restore = spawnSync(
  node,
  [path.join(__dirname, 'restore-rest-backup-cloud.mjs'), path.join('backups', backupDir)],
  { cwd: root, stdio: 'inherit', env: { ...process.env, SUPABASE_DB_PASSWORD: password } }
);
process.exit(restore.status ?? 1);
