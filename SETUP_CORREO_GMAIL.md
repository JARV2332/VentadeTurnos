# Envío de correos con Gmail

## 1. Variables en Vercel (obligatorio)

En **Vercel → proyecto VentadeTurnos → Settings → Environment Variables**:

| Variable | Valor | Entornos |
|----------|--------|----------|
| `GMAIL_USER` | Tu Gmail completo, ej. `turnos.hermandad@gmail.com` | Production, Preview |
| `GMAIL_APP_PASSWORD` | Contraseña de aplicación de 16 caracteres **sin espacios** | Production, Preview |

La contraseña de aplicación se crea en Google: Cuenta → Seguridad → Verificación en 2 pasos → Contraseñas de aplicaciones.

**No subas estas claves a GitHub.** Si se filtraron, revócalas en Google y crea una nueva.

## 2. Configuración en la app

En **Correo y boletas** (`/config/correo`):

- **Correo remitente:** debe ser el **mismo** que `GMAIL_USER` (Gmail no permite otro remitente con SMTP básico).
- **Nombre remitente:** el nombre visible (ej. nombre de la asociación).
- **Correo de respuesta:** puede ser el mismo Gmail u otro buzón.
- Activar **Enviar boletas automáticamente al confirmar venta**.

## 3. Redesplegar

Tras agregar las variables en Vercel, haga **Redeploy** del último deployment para que la API `/api/send-email` las use.

## 4. Probar

1. En taquilla, venda un turno con un cargador que tenga correo real.
2. Revise la bandeja del cargador (y spam).
3. En **Correo y boletas → Historial** debe aparecer el envío.

## Límites Gmail

- Cuenta personal: ~500 correos/día.
- Para alto volumen use Google Workspace o Resend con dominio propio.
