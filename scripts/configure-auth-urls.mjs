/**
 * Configura Site URL y Redirect URLs en Supabase Auth (Management API).
 * Requiere SUPABASE_ACCESS_TOKEN en .env.local
 *   npm run db:auth:urls
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { authCallbackUrl } from '../src/utils/authRedirect.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF =
  process.env.SUPABASE_PROJECT_REF_NEW ||
  process.env.SUPABASE_PROJECT_REF ||
  'dblphvmvusbgopcejbyh';

const SITE_URL = 'https://ventadeturnos.vercel.app';
const REDIRECT_URLS = [
  `${SITE_URL}/`,
  `${SITE_URL}/restablecer-contrasena`,
  `${SITE_URL}/confirmar-correo`,
  `${SITE_URL}/**`,
  'http://localhost:3000/**',
];

if (!TOKEN) {
  console.error(`
❌ Falta SUPABASE_ACCESS_TOKEN en .env.local

1. https://supabase.com/dashboard/account/tokens → Generate new token
2. Agrega: SUPABASE_ACCESS_TOKEN=sbp_...
3. npm run db:auth:urls
`);
  process.exit(1);
}

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    site_url: SITE_URL,
    additional_redirect_urls: REDIRECT_URLS,
  }),
});

const body = await res.text();
if (!res.ok) {
  console.error(`❌ HTTP ${res.status}: ${body.slice(0, 800)}`);
  process.exit(1);
}

console.log('\n✅ Auth URL Configuration actualizada\n');
console.log('   Site URL:', SITE_URL);
console.log('   Redirect URLs:');
REDIRECT_URLS.forEach((u) => console.log('   -', u));
console.log('\n   Callback app restablecer:', authCallbackUrl('/restablecer-contrasena'));
console.log('   Callback app confirmar:', authCallbackUrl('/confirmar-correo'));
console.log('');
