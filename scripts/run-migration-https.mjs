/**
 * Migración completa vía HTTPS (sin Postgres directo en tu PC).
 *
 * 1. Esquema → Management API (SUPABASE_ACCESS_TOKEN)
 * 2. Datos → REST backup + restore (service role)
 *
 * .env.local: ver .env.migration.example + SUPABASE_ACCESS_TOKEN
 *
 *   npm run db:migrate:https
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

run('1/3 Backup REST proyecto viejo', path.join(__dirname, 'backup-db.mjs'));
run('2/3 Esquema en proyecto nuevo (Management API)', path.join(__dirname, 'apply-schema-management.mjs'));
run('3/3 Restore datos en proyecto nuevo (REST)', path.join(__dirname, 'restore-rest-backup-cloud.mjs'));

console.log('\n🎉 Migración HTTPS terminada.\n');
console.log('Actualiza Vercel con:');
console.log('  REACT_APP_SUPABASE_URL=https://emmkatautioefhmvxejg.supabase.co');
console.log('  REACT_APP_SUPABASE_ANON_KEY=sb_publishable_2eCHPUySC-tupIYgMoCa6g_Us8vUiQd');
console.log('  SUPABASE_SERVICE_ROLE_KEY=<service_role del NUEVO proyecto>\n');
console.log('En Supabase nuevo → Database → Replication: activa brazos y turnos.\n');
