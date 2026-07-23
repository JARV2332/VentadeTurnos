/**
 * Configura variables de entorno en Vercel.
 *
 * Producción → proyecto VIEJO (hasta terminar migración):
 *   npm run vercel:setup-env
 *
 * Después de migración completa → proyecto NUEVO:
 *   npm run vercel:setup-env:new
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

const projectMeta = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
const projectName = projectMeta.projectName || 'ventade-turnos';
const defaultAppUrl =
  projectName.includes('ventade-turnos') || projectName === 'ventade-turnos'
    ? 'https://ventade-turnos.vercel.app'
    : 'https://ventadeturnos.vercel.app';

const appUrl =
  process.env.REACT_APP_APP_URL ||
  (process.argv.includes('--app-url')
    ? process.argv[process.argv.indexOf('--app-url') + 1]
    : defaultAppUrl);

const useNew = process.argv.includes('--new') || process.env.VERCEL_ENV_TARGET === 'new';

const serviceKey = useNew
  ? process.env.SUPABASE_SERVICE_ROLE_KEY_NEW
  : process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  console.error(
    useNew
      ? '❌ Falta SUPABASE_SERVICE_ROLE_KEY_NEW en .env.local'
      : '❌ Falta SUPABASE_SERVICE_ROLE_KEY en .env.local'
  );
  process.exit(1);
}

const vars = useNew
  ? {
      REACT_APP_MOCK_MODE: 'false',
      REACT_APP_SUPABASE_URL:
        process.env.REACT_APP_SUPABASE_URL_NEW || 'https://emmkatautioefhmvxejg.supabase.co',
      REACT_APP_SUPABASE_ANON_KEY:
        process.env.REACT_APP_SUPABASE_ANON_KEY_NEW ||
        'sb_publishable_2eCHPUySC-tupIYgMoCa6g_Us8vUiQd',
      REACT_APP_APP_URL: appUrl,
      REACT_APP_EMAIL_WEBHOOK_URL: '/api/send-email',
      SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    }
  : {
      REACT_APP_MOCK_MODE: 'false',
      REACT_APP_SUPABASE_URL:
        process.env.REACT_APP_SUPABASE_URL || 'https://kolhnoectddjgfowyvux.supabase.co',
      REACT_APP_SUPABASE_ANON_KEY:
        process.env.REACT_APP_SUPABASE_ANON_KEY ||
        'sb_publishable_5-iRvKIihqoUGQi2HsY28g_FME_RxTa',
      REACT_APP_APP_URL: appUrl,
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

console.log(`\n⚙️  Configurando Vercel env vars (${useNew ? 'NUEVO' : 'VIEJO / producción actual'})\n`);
console.log('   Proyecto:', projectName);
console.log('   App URL:', appUrl);
console.log('   Supabase:', vars.REACT_APP_SUPABASE_URL);
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
console.log(
  'ℹ️  Hay 2 cuentas Vercel: repite link + npm run vercel:setup-env:new en la otra cuenta.\n' +
    '   • jromerodev28 → ventade-turnos.vercel.app\n' +
    '   • jorge-romeros → ventadeturnos.vercel.app\n'
);
