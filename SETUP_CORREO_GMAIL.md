# Gmail por asociación (hermandad / cofradía)

Cada organización configura **su propio Gmail** en la app: **Correo y boletas** (`/config/correo`).

## En la aplicación

1. **Gmail de la asociación** — ej. `turnos.hermandad@gmail.com`
2. **Contraseña de aplicación** — 16 caracteres (Google, con 2FA activo)
3. **Nombre remitente**, pie de correo, etc.
4. Pulsar **Guardar configuración**

La contraseña **no se vuelve a mostrar** al recargar (por seguridad). Para cambiarla, escriba la nueva y guarde.

## En Google (por cada asociación)

1. Cuenta Google de la hermandad → **Seguridad**
2. Activar **verificación en 2 pasos**
3. **Contraseñas de aplicaciones** → crear una para “Correo”
4. Copiar los 16 caracteres (con o sin espacios; la app los quita)

## SQL en Supabase (una vez)

Ejecutar `supabase/010_correo_gmail_por_org.sql` en el SQL Editor.

## Fallback global (opcional)

Si una asociación **no** configuró Gmail, Vercel puede usar variables globales:

- `GMAIL_USER`
- `GMAIL_APP_PASSWORD`

Prioridad: **primero** credenciales de la asociación en la base de datos, **después** las de Vercel.

## Seguridad

- No comparta contraseñas de aplicación en chats ni correos.
- Si se filtró, revóquela en Google y cree otra.
- Cada asociación debe usar su propia cuenta Gmail.
