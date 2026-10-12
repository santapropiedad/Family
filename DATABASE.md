# Base de datos — Family

Esquema completo en [`src/db/schema.sql`](src/db/schema.sql), aplicado con `npm run db:migrate`.
Funciona igual en PGlite (desarrollo/tests) y en un Postgres real (producción) — ver
[ARCHITECTURE.md](ARCHITECTURE.md).

## Entidades

| Tabla | Para qué |
|---|---|
| `families` | Una familia y sus ajustes (IA activa, memoria activa, inteligencia proactiva, moneda/zona horaria). |
| `family_members` | Perfil de cada integrante (nombre, rol, color, avatar, fecha de nacimiento). Tengan o no acceso a la app. |
| `users` | Credenciales de acceso (correo + hash de contraseña), 1:1 opcional con `family_members`. |
| `expense_categories` | Categorías de gasto; filas con `family_id NULL` son las 11 categorías globales de fábrica. |
| `tasks` / `task_assignments` | Tareas domésticas y a quién están asignadas (N:M). |
| `events` / `event_assignments` | Eventos del calendario y a quién involucran (N:M), usado para detectar conflictos. |
| `reminders` | Recordatorios, opcionalmente enlazados a una tarea, evento, cuenta o mantención. |
| `shopping_lists` / `shopping_items` | Lista(s) de compras de la familia. |
| `inventory_items` | Inventario doméstico con cantidad actual, mínima, frecuencia de compra aprendida y último precio. |
| `expenses` | Gastos registrados (manual o por la IA). |
| `budgets` | Presupuesto mensual por categoría, para las alertas de gasto. |
| `maintenance` | Equipos/artefactos del hogar y su calendario de mantención. |
| `bills` | Cuentas del hogar, con frecuencia y estado; pagar una genera el `expense` asociado. |
| `memories` | Memoria estructurada de la IA (permanente o temporal), nunca conversaciones completas. |
| `notifications` | Notificaciones por integrante o para toda la familia. |
| `ai_conversations` / `ai_messages` | Historial de conversación con el asistente, por integrante. |
| `ai_actions` | Cada herramienta que la IA intentó ejecutar: parámetros, nivel de confirmación, resultado. |
| `audit_logs` | Registro de auditoría de acciones sensibles (confirmaciones, rechazos). |

## Decisiones de diseño

- **IDs `UUID` generados en la aplicación** (`uuid` v4), no en la base de datos: mismo
  comportamiento en PGlite y Postgres real sin depender de extensiones (`pgcrypto`/`gen_random_uuid`)
  que no siempre están disponibles.
- **`family_members` separado de `users`**: un integrante (ej. un niño pequeño o un abuelo) puede
  existir en la app — con tareas, eventos, color — sin tener nunca una cuenta para iniciar sesión.
- **Fechas y timestamps como texto, no `Date` de JavaScript**: ambos drivers (`pg` y PGlite)
  parsean `DATE`/`TIMESTAMPTZ` a objetos `Date` por defecto, lo que rompe comparaciones y
  formateo simple. `src/db/client.ts` configura ambos drivers para devolver el texto crudo
  (`YYYY-MM-DD` / ISO 8601), y todo el código de dominio trata las fechas como strings de forma
  consistente.
- **Sin tabla `roles` dinámica ni `recurring_items`**: se evaluaron y se descartaron porque
  duplicarían lógica que ya vive en código (`src/lib/permissions.ts`) o en otras tablas
  (`inventory_items.avg_purchase_frequency_days`, `bills.frequency`) — ver "No crear tablas
  innecesarias" en el documento de especificación.
- **Aislamiento por familia a nivel de consulta**: toda función de servicio recibe `familyId`
  como primer argumento y lo usa en el `WHERE` de cada consulta; nunca se confía en un `id` que
  venga del cliente sin acotarlo a la familia de la sesión (ver [SECURITY.md](SECURITY.md)).

## Datos de demostración

`npm run db:seed` (ver [`src/db/seed.ts`](src/db/seed.ts)) crea la **Familia Fernández (demo)**
(`families.is_demo = TRUE`) con Papá (administrador), Mamá (adulta), Martina y Julián (niños), y
tareas, eventos, recordatorios, gastos, presupuestos, inventario, lista de compras, mantenciones,
cuentas y memoria de ejemplo — todo generado con las mismas funciones de servicio que usa la
aplicación en producción, no con inserciones SQL directas ni datos hardcodeados en el frontend.
