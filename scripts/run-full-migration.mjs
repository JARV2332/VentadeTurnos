/**
 * Migración completa viejo → nuevo (esquema + backup + restore).
 * Preserva auth.users si el backup full incluye auth.
 *
 * Requiere .env.local — ver .env.migration.example
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const node = process.execPath;

function run(label, script, extraArgs = []) {
  console.log(`\n━━━ ${label} ━━━\n`);
  const r = spawnSync(node, [script, ...extraArgs], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run('1/3 Backup proyecto viejo', path.join(__dirname, 'backup-pg-full.mjs'));
run('2/3 Esquema en proyecto nuevo', path.join(__dirname, 'apply-schema-cloud.mjs'));
run('3/3 Restore datos en proyecto nuevo', path.join(__dirname, 'restore-backup-cloud.mjs'));

console.log('\n🎉 Migración terminada.\n');
console.log('Actualiza Vercel con:');
console.log('  REACT_APP_SUPABASE_URL=https://dblphvmvusbgopcejbyh.supabase.co');
console.log('  REACT_APP_SUPABASE_ANON_KEY=sb_publishable_IpP44gZyVDxYNz5IkKuWdA_pbBtDNvA');
console.log('  SUPABASE_SERVICE_ROLE_KEY=<service_role del NUEVO proyecto>\n');
console.log('En Supabase nuevo → Database → Replication: activa brazos y turnos.\n');
