# Venta de Turnos

Plataforma **SaaS multi-tenant** para gestión, venta y control de turnos en cortejos y procesiones. Pensada para asociaciones, hermandades y pastorales: taquilla en vivo, boletas con QR, caja, entrega en calle y configuración flexible del recorrido.

**Repositorio:** [github.com/JARV2332/VentadeTurnos](https://github.com/JARV2332/VentadeTurnos)  
**Demo en vivo:** [ventadeturnos.vercel.app](https://ventadeturnos.vercel.app)

---

## Características

| Módulo | Descripción |
|--------|-------------|
| **Configuración** | Alta de procesiones, total de turnos, precios y brazos por turno |
| **Diseño de turnos** | Turno **1 = Salida**, último = **Entrada**; extraordinarios en posiciones elegidas (ej. 7, 14 y 16 de 20) |
| **Taquilla** | Matriz Izquierda \| eje \| Derecha, reserva 5 min, venta en dos pasos (cargador → pago) |
| **Pagos** | Efectivo, transferencia o tarjeta; comprobante obligatorio en transferencia/tarjeta |
| **Boletas** | QR único, envío por correo (mock o webhook), impresión |
| **Entrega** | Escaneo QR o código manual para marcar entregado |
| **Caja** | Totales por método de pago y vendedor |
| **Correo** | Remitente, plantilla y historial (demo) |

Cada organización ve solo sus datos (**RLS** en Supabase cuando se conecte el backend).

---

## Demo (modo mock)

Con `REACT_APP_MOCK_MODE=true` no hace falta Supabase: datos en memoria y persistencia de sesión en el navegador.

| Rol | Correo | Contraseña |
|-----|--------|------------|
| Administrador | `admin@demo.com` | `demo123` |
| Vendedor | `vendedor@demo.com` | `demo123` |

**Organización demo:** Pastoral de Religiosidad Popular Nuestra Señora de La Asunción

---

## Stack

- **React** (Create React App) + **React Router**
- **Supabase** (Auth, Postgres, Realtime) — script SQL en `supabase/migrations/`
- **Vercel** — despliegue estático + SPA rewrites
- **html5-qrcode** / **qrcode.react**

---

## Inicio rápido

```bash
git clone https://github.com/JARV2332/VentadeTurnos.git
cd VentadeTurnos
npm install
cp .env.example .env
npm start
```

Abre [http://localhost:3000](http://localhost:3000).

---

## Variables de entorno

Copia `.env.example` a `.env`:

| Variable | Descripción |
|----------|-------------|
| `REACT_APP_MOCK_MODE` | `true` = demo sin Supabase |
| `REACT_APP_SUPABASE_URL` | URL del proyecto Supabase |
| `REACT_APP_SUPABASE_ANON_KEY` | Clave anónima de Supabase |
| `REACT_APP_APP_URL` | URL pública de la app (correos, enlaces) |
| `REACT_APP_EMAIL_WEBHOOK_URL` | Webhook para envío real de boletas (opcional) |

En **Vercel**, las variables de build van en `vercel.json` (producción Supabase). Para desarrollo local con mock:

```
REACT_APP_MOCK_MODE=true
```

Detalle completo: `SETUP_SUPABASE.md`.

---

## Despliegue en Vercel (producción con Supabase)

1. Aplica el esquema en Supabase: ejecuta `supabase/APLICAR_TODO.sql` (ver `SETUP_SUPABASE.md`).
2. Semilla demo: `npm run db:seed` (requiere `SUPABASE_SERVICE_ROLE_KEY` en `.env.local`).
3. Importa el repo en [vercel.com/new](https://vercel.com/new) o haz push a `main` (auto-deploy).
4. `vercel.json` ya define `REACT_APP_MOCK_MODE=false` y las credenciales públicas de Supabase.
5. En Vercel → **Settings → Environment Variables**, añade **solo en servidor** (Production):
   - `SUPABASE_SERVICE_ROLE_KEY` = clave `service_role` (Settings → API en Supabase). Necesaria para crear usuarios (`/api/invite-app-user`).

El archivo `vercel.json` incluye rewrites SPA y rutas `/api/*` para funciones serverless.

**CLI (opcional):**

```bash
npx vercel
npx vercel --prod
```

---

## Estructura del proyecto

```
src/
├── components/     # UI: Sidebar, TurnoCartulina, BoletaCard, QrScanner…
├── config/         # Cliente Supabase
├── context/        # Auth multi-tenant
├── data/           # mockData.js (demo)
├── services/       # mockService, emailService
├── utils/          # turnos, boletas, pagos
└── views/          # Landing, Dashboard, Taquilla, Caja…
supabase/migrations/001_schema_rls.sql
```

---

## Lógica de turnos

Para una procesión de **N** turnos:

- **Turno 1** → Salida (inicio del recorrido en el templo)
- **Turno N** → Entrada (cierre)
- **Turnos 2 … N−1** → Ordinarios por defecto
- **Extraordinarios** → eliges los números exactos (no tienen que ser consecutivos)

Cada turno tiene un total de **brazos par** (mitad izquierda + mitad derecha).

---

## Supabase (producción)

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Ejecuta `supabase/migrations/001_schema_rls.sql` en el SQL Editor.
3. Pon `REACT_APP_MOCK_MODE=false` y las credenciales en `.env` / Vercel.
4. Crea usuarios en Auth y asígnalos en `usuarios_roles` con su `organizacion_id`.

---

## Scripts

| Comando | Acción |
|---------|--------|
| `npm start` | Desarrollo en puerto 3000 |
| `npm run build` | Build de producción |
| `npm test` | Tests (Jest) |

---

## Licencia

Proyecto privado — uso según acuerdo con la organización propietaria.
