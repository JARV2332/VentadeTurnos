# Supabase — ventadeturnos.com

Proyecto: `kolhnoectddjgfowyvux`  
URL: https://kolhnoectddjgfowyvux.supabase.co

## 1. Aplicar el esquema (tablas, RLS, RPC)

**Opción A — SQL Editor (recomendado si no tienes la contraseña de Postgres)**

1. Supabase → **SQL Editor** → New query  
2. Copia y ejecuta todo el archivo `supabase/APLICAR_TODO.sql` → **Run**

**Opción B — script local**

Crea `.env.local` (no lo subas a git):

```env
DATABASE_URL=postgresql://postgres:TU_PASSWORD@db.kolhnoectddjgfowyvux.supabase.co:5432/postgres
```

La contraseña está en **Project Settings → Database → Database password**.

```bash
npm run db:apply
```

## 2. Datos demo (organización, roles, usuarios, procesión)

En `.env.local` añade:

```env
REACT_APP_SUPABASE_URL=https://kolhnoectddjgfowyvux.supabase.co
REACT_APP_SUPABASE_ANON_KEY=tu-anon-o-publishable-key
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # Settings → API → service_role (solo servidor)
```

```bash
npm run db:seed
```

Usuarios demo:

| Correo | Contraseña |
|--------|------------|
| admin@demo.com | demo123 |
| caja@demo.com | demo123 |
| vendedor@demo.com | demo123 |

## 3. Variables en Vercel

| Variable | Valor |
|----------|--------|
| `REACT_APP_MOCK_MODE` | `false` |
| `REACT_APP_SUPABASE_URL` | `https://kolhnoectddjgfowyvux.supabase.co` |
| `REACT_APP_SUPABASE_ANON_KEY` | Anon key (Settings → API) |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role (solo servidor, para `/api/invite-app-user` y seed) |

Opcional: `REACT_APP_EMAIL_WEBHOOK_URL` para envío de boletas por correo.

## 4. Desarrollo local

`.env.local`:

```env
REACT_APP_MOCK_MODE=false
REACT_APP_SUPABASE_URL=https://kolhnoectddjgfowyvux.supabase.co
REACT_APP_SUPABASE_ANON_KEY=...
```

```bash
npm start
```

> Crear usuarios desde la pantalla **Usuarios** en local requiere `vercel dev` o despliegue en Vercel (función `api/invite-app-user.js`). En local puedes usar `npm run db:seed`.

## 5. Realtime

Tras aplicar el SQL, en Supabase → **Database → Replication** activa la publicación para la tabla `brazos` si no está ya incluida en el script.

## 6. Clave anon vs publishable

Si `sb_publishable_...` no funciona con el cliente JS, usa la **anon key** (JWT) de Settings → API.
