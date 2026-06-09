# Venta de Turnos — Material de promoción para cofradías y asociaciones

Documento de apoyo para contactar otras hermandades, cofradías y pastorales sobre el sistema usado en la **Pastoral de Religiosidad de la Virgen de la Asunción, Patrona de Guatemala (Zona 2)**.

**Demo en línea:** https://ventadeturnos.vercel.app  
**Repositorio:** https://github.com/JARV2332/VentadeTurnos

---

## Resumen del sistema

**Venta de Turnos** es una plataforma digital (SaaS multi-tenant) para gestionar, vender y controlar turnos en cortejos y procesiones. Está pensada para asociaciones, cofradías y pastorales que necesitan:

- Varias mesas de taquilla trabajando **al mismo tiempo**
- Información **sincronizada en tiempo real**
- Control de ventas, apartados, entregas y caja en un solo lugar
- Datos **separados por organización** (cada asociación ve solo lo suyo)

Ya fue utilizado en **operación real** en la Pastoral de Religiosidad de la Virgen de la Asunción (Zona 2).

---

## Versión completa (WhatsApp o correo)

**Asunto (si es correo):** Sistema digital para venta y control de turnos en procesiones

---

Buenas tardes, [nombre / hermandad / cofradía].

Les escribo desde la **Pastoral de Religiosidad de la Virgen de la Asunción, Patrona de Guatemala (Zona 2)**, donde ya utilizamos en operación real un sistema digital para la **venta, reserva y control de turnos** en nuestras procesiones.

Se llama **Venta de Turnos** y está pensado específicamente para asociaciones, cofradías y pastorales que cargan en cortejos. No es una planilla de Excel ni un cuaderno compartido: es una plataforma en línea donde varias mesas de taquilla trabajan **al mismo tiempo**, con la información **sincronizada en tiempo real**.

**¿Qué resuelve en la práctica?**

- **Configuración de la procesión:** cantidad de turnos, brazos por turno, precios, turnos de salida, entrada y extraordinarios.
- **Taquilla en vivo:** mapa visual del cortejo (lado izquierdo, eje y derecho), reserva temporal de espacios, venta en dos pasos (datos del devoto → pago).
- **Apartados:** carga manual o importación desde Excel de turnos ya apartados, con listado visual por turno.
- **Pagos:** efectivo, transferencia o tarjeta, con comprobante cuando corresponde.
- **Boletas con QR único:** impresión, envío por correo y consulta pública del comprobante.
- **Entrega en calle:** escaneo de QR o código manual para marcar turnos entregados.
- **Caja y reportes:** totales por vendedor y método de pago, gráficas, exportación a Excel/PDF, anulación de boletas y liberación de turnos.
- **Usuarios con roles:** cada persona ve solo lo que necesita (taquilla, caja, impresión, configuración, etc.).
- **Datos separados por organización:** cada asociación trabaja con su propia información, sin mezclarse con otras.

En nuestra experiencia, el mayor beneficio fue **orden, transparencia y velocidad**: menos confusiones entre mesas, mejor control de lo vendido y entregado, y reportes claros para tesorería.

Si les interesa conocerlo, pueden ver una **demostración en línea** aquí:

https://ventadeturnos.vercel.app

Con gusto les explico cómo lo implementamos, qué roles usamos en taquilla/caja y qué implicaría adaptarlo a su procesión.

Quedo atento/a.

[Nombre]  
Pastoral de Religiosidad — Virgen de la Asunción, Patrona de Guatemala (Zona 2)  
[Teléfono / WhatsApp]

---

## Versión corta (WhatsApp directo)

Buenas, [nombre]. Te escribo desde la **Pastoral de Religiosidad de la Virgen de la Asunción (Zona 2)**.

Este año usamos un sistema digital para **vender y controlar turnos** en procesión y nos funcionó muy bien: varias mesas de taquilla al mismo tiempo, mapa visual del cortejo, apartados (manual o Excel), boletas con QR, caja con reportes, entrega en calle y control por vendedor.

Está hecho para cofradías y asociaciones como la nuestra. Demo: https://ventadeturnos.vercel.app

Si te interesa para tu hermandad/cofradía, te cuento cómo lo usamos y qué incluye. ¿Te parece si coordinamos una llamada breve?

---

## Lista de funciones (para adjuntar o pegar)

**Venta de Turnos — funciones principales**

| # | Módulo | Descripción |
|---|--------|-------------|
| 1 | **Dashboard** | Ingresos, ocupación, espacios vendidos, disponibles y reservados |
| 2 | **Procesiones** | Alta, edición, duplicar procesión, agregar turnos faltantes |
| 3 | **Taquilla** | Venta en tiempo real, carrito multi-turno, búsqueda de apartados |
| 4 | **Apartados / Excel** | Importar listados y registrar apartados manuales |
| 5 | **Pagos** | Efectivo, transferencia, tarjeta (con comprobante cuando aplica) |
| 6 | **Boletas** | QR único, impresión PDF, envío por correo, diseño personalizable |
| 7 | **Entrega** | Escaneo QR en calle para marcar turnos entregados |
| 8 | **Caja** | Reportes, filtros, gráficas, export Excel/PDF, anulaciones |
| 9 | **Usuarios y roles** | Permisos por pantalla (taquilla, caja, impresión, administración) |
| 10 | **Multi-organización** | Cada asociación con datos propios y seguros |

### Detalle por área

#### Configuración
- Alta de procesiones, total de turnos, precios y brazos por turno
- Turno 1 = **Salida**, último turno = **Entrada**
- Turnos **extraordinarios** en posiciones elegidas (ej. 7, 14 y 16 de 20)
- Duplicar procesiones y agregar turnos faltantes a procesiones existentes

#### Taquilla
- Matriz visual: **Izquierda | Eje | Derecha**
- Reserva temporal de 5 minutos
- Venta en dos pasos: datos del cargador/devoto → pago
- Carrito con varios turnos en una sola boleta
- Búsqueda de apartados por nombre, CUI o WhatsApp
- Varias mesas de venta simultáneas con sincronización instantánea

#### Apartados
- Carga manual de apartados
- Importación desde Excel (plantillas incluidas)
- Listado visual por turno

#### Pagos y boletas
- Efectivo, transferencia o tarjeta
- Comprobante obligatorio en transferencia/tarjeta
- Boleta con código QR único
- Impresión y envío por correo electrónico
- Diseño de recibos personalizable

#### Entrega y caja
- Escaneo de QR o código manual para marcar entregado
- Totales por método de pago y por vendedor
- Reportes con filtros, gráficas y exportación Excel/PDF
- Anulación de boletas y liberación de turnos
- Edición de datos del devoto desde Impresión y Caja

#### Administración
- Usuarios con roles y permisos granulares
- Configuración de correo y plantillas de boleta
- Cada organización aislada (multi-tenant)

---

## Consejos para promocionarlo

1. **Mencionar uso real:** Decir que ya lo probaron en operación en Asunción Zona 2 genera más confianza que solo compartir el link de la demo.
2. **Ofrecer una demo breve:** 15 minutos por videollamada mostrando taquilla + caja suele ser más efectivo que mandar solo el enlace.
3. **Marca blanca:** Cada organización entra con su nombre, sus procesiones y sus usuarios; no comparten datos con otras asociaciones.
4. **Adaptar el mensaje:** Cambiar `[nombre]`, `[Teléfono / WhatsApp]` y el tono según si escribís a directivas, tesorería o coordinadores de taquilla.

---

## Datos de contacto (completar)

| Campo | Valor |
|-------|-------|
| Nombre | |
| Cargo / rol | |
| Organización | Pastoral de Religiosidad — Virgen de la Asunción, Patrona de Guatemala (Zona 2) |
| Teléfono / WhatsApp | |
| Correo | |

---

## Enlaces útiles

- **Demo:** https://ventadeturnos.vercel.app
- **Repositorio GitHub:** https://github.com/JARV2332/VentadeTurnos

### Credenciales de la demo (modo prueba)

| Rol | Correo | Contraseña |
|-----|--------|------------|
| Administrador | `admin@demo.com` | `demo123` |
| Vendedor | `vendedor@demo.com` | `demo123` |

**Organización demo:** Pastoral de Religiosidad Popular Nuestra Señora de La Asunción
