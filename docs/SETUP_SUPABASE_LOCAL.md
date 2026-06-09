# Supabase local — réplica de respaldo

Réplica en Docker de tu proyecto en la nube (`kolhnoectddjgfowyvux`), con los mismos datos del backup del **8 jun 2026**.

## Requisitos

- **Docker Desktop** en ejecución
- Node.js + `npm install`

## Comandos

| Comando | Acción |
|---------|--------|
| `npm run supabase:start` | Levanta Supabase local (Docker) |
| `npm run supabase:stop` | Detiene contenedores |
| `npm run supabase:status` | URLs, claves y puertos |
| `npm run db:apply:local` | Aplica esquema SQL en Postgres local |
| `npm run db:restore:local` | Restaura el backup JSON más reciente |
| `npm run db:backup:full` | Nuevo backup desde la **nube** (usa `DATABASE_URL`) |
| `npm run local:setup` | start + esquema + restore (todo en uno) |

## URLs locales

| Servicio | URL |
|----------|-----|
| **App React** (con `.env.local`) | http://localhost:3000 |
| **Supabase Studio** | http://127.0.0.1:54323 |
| **API REST** | http://127.0.0.1:54321/rest/v1 |
| **Postgres** | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

## Usar la app contra la réplica local

1. Asegúrate de que Docker esté corriendo.
2. `npm run supabase:start`
3. `.env.local` ya apunta a `http://127.0.0.1:54321`.
4. `npm start`

Los **8 usuarios** de la nube están restaurados en `auth.users` con las mismas contraseñas que tenían en producción.

## Actualizar la réplica desde la nube

```bash
# 1. Nuevo backup desde producción
npm run db:backup:full

# 2. Restaurar en local (usa el backup más reciente)
npm run db:restore:local
```

O indicar carpeta concreta:

```bash
npm run db:restore:local -- backups/2026-06-08_16-57-31
```

## Datos restaurados (última réplica)

| Tabla | Filas |
|-------|-------|
| organizaciones | 1 |
| cortejos | 3 |
| turnos | 109 |
| brazos | 4,470 |
| compras | 160 |
| cargadores | 326 |
| usuarios (auth) | 8 |

## Notas

- La carpeta `backups/` **no se sube a Git** (datos sensibles).
- Las claves locales de Supabase son **solo para desarrollo**; no usar en producción.
- Para volver a la nube, cambia en `.env.local` las variables `REACT_APP_SUPABASE_URL` y `REACT_APP_SUPABASE_ANON_KEY` por las de `_CLOUD`.
