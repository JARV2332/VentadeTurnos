/**
 * Configura variables de entorno en el proyecto Vercel enlazado (.vercel/project.json).
 * Lee SUPABASE_SERVICE_ROLE_KEY_NEW de .env.local
 *
 *   npx vercel link          (cuenta/proyecto destino)
 *   npm run vercel:setup-env
 *   npx vercel --prod
 */
import { spawnSync } from 'child_process';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

dotenv.config({ path: path.join(root, '.env.local') });

const projectFile = path.join(root, '.vercel', 'project.json');
if (!fs.existsSync(projectFile)) {
  console.error(`
❌ No hay proyecto enlazado. Primero:

  npx vercel login
  npx vercel link

`);
  process.exit(1);
}

const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY_NEW || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  console.error('❌ Falta SUPABASE_SERVICE_ROLE_KEY_NEW en .env.local');
  process.exit(1);
}

const vars = {
  REACT_APP_MOCK_MODE: 'false',
  REACT_APP_SUPABASE_URL: 'https://dblphvmvusbgopcejbyh.supabase.co',
  REACT_APP_SUPABASE_ANON_KEY: 'sb_publishable_IpP44gZyVDxYNz5IkKuWdA_pbBtDNvA',
  REACT_APP_APP_URL: process.env.REACT_APP_APP_URL || 'https://ventadeturnos.vercel.app',
  REACT_APP_EMAIL_WEBHOOK_URL: '/api/send-email',
  SUPABASE_SERVICE_ROLE_KEY: serviceKey,
};

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const envs = ['production', 'preview'];

function run(args, input) {
  const r = spawnSync(npx, args, {
    cwd: root,
    stdio: input ? ['pipe', 'inherit', 'inherit'] : 'inherit',
    input,
    shell: process.platform === 'win32',
  });
  return r.status ?? 1;
}

console.log('\n⚙️  Configurando Vercel env vars\n');
console.log('   Proyecto:', JSON.parse(fs.readFileSync(projectFile, 'utf8')).projectName || '(linked)');
console.log('   App URL:', vars.REACT_APP_APP_URL);
console.log('');

for (const env of envs) {
  for (const [name, value] of Object.entries(vars)) {
    run(['vercel', 'env', 'rm', name, env, '--yes']);
    const code = run(['vercel', 'env', 'add', name, env], `${value}\n`);
    if (code !== 0) process.exit(code);
    console.log(`   ✓ ${name} (${env})`);
  }
}

console.log('\n✅ Variables listas. Redeploy:\n   npx vercel --prod\n');
