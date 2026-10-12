# Arquitectura — Family

## Visión general

```
Navegador (PWA, React 19)
   │  fetch /api/**  (cookie httpOnly con el JWT de sesión)
   ▼
Next.js App Router — Route Handlers (src/app/api/**)
   │  requireSession()  → verifica JWT, obtiene {familyId, role, familyMemberId}
   │  assertCapability() → verifica permisos por rol
   │  parseBody(schema)  → valida con zod
   ▼
Capa de servicios de dominio (src/services/**)
   │  siempre recibe familyId como primer argumento → aislamiento por familia
   ▼
Cliente de base de datos (src/db/client.ts)
   │  PGlite (dev/test) o pg.Pool (producción) — misma interfaz query()/exec()
   ▼
PostgreSQL (embebido o real)
```

La IA (texto y voz) **no tiene un camino propio hacia la base de datos**: pasa por la misma capa
de servicios, a través de un ejecutor de herramientas que aplica permisos y niveles de
confirmación (ver [AI.md](AI.md)).

## Por qué estas decisiones

- **PGlite en vez de "simular" una base de datos**: el requisito explícito era no fingir una base
  de datos con arrays en memoria. PGlite es Postgres real compilado a WebAssembly — mismo SQL,
  mismos tipos, mismas restricciones (`CHECK`, `UNIQUE`, `FOREIGN KEY`) que producción. Cambiar a
  un Postgres real es solo definir `DATABASE_URL`; el código de la aplicación no cambia.
- **Un solo esquema SQL (`src/db/schema.sql`)**, aplicado con `CREATE TABLE IF NOT EXISTS`, en vez
  de un sistema de migraciones incremental: para el tamaño de este proyecto, un esquema único y
  reproducible es más fácil de auditar que una cadena de migraciones. Si el proyecto crece,
  migrar a una herramienta como Drizzle o node-pg-migrate es un cambio localizado en `src/db/`.
- **JWT en cookie `httpOnly`** en vez de sesiones en base de datos: más simple de operar, sin
  tabla de sesiones que limpiar; el costo (no se puede revocar una sesión individual antes de que
  expire) se acepta para el tamaño de esta aplicación.
- **Capacidades por rol fijas en código** (`src/lib/permissions.ts`) en vez de una tabla `roles`
  configurable: la especificación define 3 roles con permisos conceptualmente fijos
  (administrador / adulto / niño). Una tabla de permisos dinámica habría sido una tabla
  "innecesaria" para un modelo que no necesita configurarse por familia.
- **Contrato de datos en `snake_case` de punta a punta** (base de datos → API → frontend): evita
  una capa de mapeo `camelCase`↔`snake_case` que es pura superficie para bugs sin aportar valor en
  una aplicación de este tamaño.

## Módulos y cómo se conectan

Cada módulo vive en `src/services/<módulo>.ts` y expone funciones puras sobre la base de datos
(sin conocer HTTP, sesiones ni IA). Los módulos se conectan llamándose entre sí directamente:

- `services/shopping.ts#recordPurchase` llama a `services/expenses.ts#createExpense` y actualiza
  `inventory_items` y `shopping_items` en la misma función — este es el flujo "compré leche por
  $8.990" de la especificación, ejecutado como una sola operación de dominio, no como 3 features
  separadas coordinadas por la UI.
- `services/bills.ts#payBill` llama a `createExpense` y programa la siguiente cuenta si es
  recurrente.
- `services/insights.ts` lee de tareas, cuentas, inventario, eventos y gastos para construir el
  resumen de "Familia Hoy" y la detección proactiva — es el único módulo que combina todos los
  demás, deliberadamente (es el motor de "inteligencia").

## Capa de API

Cada ruta sigue el mismo patrón (`src/lib/api.ts#handleRoute`): ejecuta la lógica, convierte
cualquier error en una respuesta JSON segura (`{error, code}` con el status HTTP correcto) sin
filtrar detalles internos, y registra el error real en el servidor. Las rutas que leen `cookies()`
están marcadas `export const dynamic = "force-dynamic"` para que Next.js no intente pre-renderizarlas
como contenido estático.

## Frontend

- App Router con páginas cliente (`"use client"`) que llaman a la API vía `fetch` (`src/lib/api-client.ts`).
- `SessionProvider` (contexto de React) carga la sesión una vez y la comparte con toda la app.
- Navegación: `Sidebar` (escritorio, los 7 módulos) y `BottomNav` (móvil, los 4 más usados + "Más").
- El asistente (`AssistantButton` + `AssistantPanel`) es un overlay flotante disponible en toda la
  app autenticada, para que "hablar con Family" esté siempre a una acción de distancia.

## Despliegue

La aplicación es un proyecto Next.js estándar: se despliega igual en Vercel, un contenedor Docker,
o cualquier host Node.js. Lo único específico de este proyecto es configurar `DATABASE_URL` hacia
un Postgres real antes de desplegar a producción (PGlite es para desarrollo/demo, no para múltiples
instancias del servidor en paralelo).
