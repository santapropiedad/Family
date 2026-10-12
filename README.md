# Familia+

Familia+ es un asistente familiar inteligente con voz e IA que centraliza en una sola aplicación:
tareas del hogar, mantenciones, cuentas, compras e inventario, gastos, calendario, recordatorios y
un asistente conversacional que puede consultar y modificar todo lo anterior.

> La idea central: **"Familia+ sabe qué está pasando en la familia y ayuda a decidir qué hacer."**

## Qué incluye

- **Familia Hoy**: saludo, prioridades del día, resumen por integrante, próximos eventos y resumen general.
- **Casa en Orden**: tareas domésticas, mantenciones de equipos (con próxima fecha calculada) y cuentas (con pago que genera el gasto y la próxima cuenta si es recurrente).
- **Compras Inteligentes**: lista de compras conectada al inventario; "registrar compra" crea el gasto, actualiza el inventario y quita el ítem de la lista en una sola acción.
- **Control de Gastos**: registro rápido, categorías, resumen mensual, presupuestos con alertas.
- **Calendario**: eventos familiares con asignación a integrantes y detección de conflictos de horario.
- **Recordatorios**: con fecha, hora y recurrencia; conectables a tareas, eventos, cuentas o mantenciones.
- **Inteligencia**: motor proactivo que detecta cuentas por vencer, compras habituales, tareas atrasadas, conflictos de calendario y gasto anormal — solo informa, nunca ejecuta nada por sí sola.
- **FAMILIA+ IA**: asistente de texto y voz con herramientas controladas (crear/consultar/editar) y tres niveles de confirmación (automático, con confirmación, siempre confirmar).
- **Memoria**: datos permanentes y temporales que la IA puede usar, editables y borrables por la familia.
- **Seguridad**: roles (administrador / adulto / niño), aislamiento estricto por familia, y registro de auditoría de toda acción de la IA.

Ver también: [ARCHITECTURE.md](ARCHITECTURE.md), [AI.md](AI.md), [DATABASE.md](DATABASE.md), [SECURITY.md](SECURITY.md).

## Tecnologías

- **Next.js 16** (App Router) + **React 19** + **TypeScript** estricto
- **Tailwind CSS v4**
- **PostgreSQL**: `@electric-sql/pglite` (Postgres embebido, WASM) en desarrollo/tests; `pg` contra un Postgres real (ej. Supabase) en producción — mismo esquema SQL en ambos casos, sin tablas de mentira ni arreglos en memoria.
- **Autenticación**: JWT en cookie `httpOnly` + `bcryptjs` para contraseñas.
- **IA**: SDK oficial de Anthropic (`@anthropic-ai/sdk`), con un motor de reglas local como respaldo cuando no hay clave configurada (ver [AI.md](AI.md)).
- **Voz**: Web Speech API del navegador (reconocimiento y síntesis), detrás de una interfaz desacoplada (`src/lib/voice.ts`) para poder cambiar de proveedor sin tocar la UI.
- **Vitest** para pruebas automatizadas.

## Instalación y ejecución local

Requiere Node.js 20+ (probado con Node 24) y npm.

```bash
npm install
cp .env.example .env.local
```

Edita `.env.local`:

```ini
JWT_SECRET=genera-un-valor-aleatorio-largo
DATABASE_URL=
ANTHROPIC_API_KEY=
```

- Deja `DATABASE_URL` vacío para usar PGlite (Postgres embebido en un archivo local `.pglite-data/`) — no necesitas instalar ni configurar nada más.
- Deja `ANTHROPIC_API_KEY` vacío para probar la app igual: el asistente funciona en "modo reglas" (ver [AI.md](AI.md)).

> ⚠️ PGlite (el Postgres embebido) no soporta que dos procesos escriban a la vez en
> `.pglite-data/`. Detén el servidor (`npm run dev`) antes de correr `db:migrate` o `db:seed`;
> hacerlo con el servidor corriendo puede corromper los datos y obligar a borrar
> `.pglite-data/` y regenerarlos.

Aplica el esquema de base de datos y carga una familia de demostración:

```bash
npm run db:migrate
npm run db:seed
```

El seed crea la **Familia Fernández (demo)** — Papá, Mamá, Martina, Julián y Matheo — con tareas,
compras (agrupadas por tienda: Supermercado / Feria), gastos, eventos, mantenciones y cuentas de
ejemplo, y muestra en la consola el correo y contraseña para iniciar sesión
(`demo@familiaplus.cl` / `FamiliaDemo2026!`).

Levanta el servidor de desarrollo:

```bash
npm run dev
```

Abre `http://localhost:3000`, inicia sesión con la cuenta demo (ya precargada en el formulario) o
crea tu propia familia desde "Crear tu propia familia".

### Pruebas

```bash
npm test
```

Corre toda la suite (permisos, aislamiento entre familias, flujos conectados, motor de IA,
inteligencia proactiva, etc.) contra una base PGlite en memoria, aislada por archivo de prueba.

### Compilar para producción

```bash
npm run build
npm start
```

## Configurar un Postgres real (producción)

Cualquier Postgres funciona (Supabase, Neon, RDS, uno propio). Define `DATABASE_URL` con la cadena
de conexión y vuelve a correr `npm run db:migrate` (y `npm run db:seed` si quieres datos de
demostración) apuntando a esa base — el código de la aplicación no cambia entre PGlite y Postgres
real.

```ini
DATABASE_URL=postgresql://usuario:password@host:5432/basededatos
```

## Configurar la IA (Claude)

Sin `ANTHROPIC_API_KEY`, Familia+ funciona con un motor de reglas local que entiende los comandos
más comunes (agregar compras, registrar gastos, crear recordatorios/tareas, consultar lo
pendiente). Para conversación libre y comprensión de lenguaje natural abierto:

1. Crea una clave en https://console.anthropic.com/.
2. Agrégala a `.env.local`: `ANTHROPIC_API_KEY=sk-ant-...`.
3. Reinicia el servidor. El asistente (texto y voz) empezará a usar Claude automáticamente.

Detalle completo de la arquitectura de IA, las herramientas disponibles y los niveles de
confirmación en [AI.md](AI.md).

### Escanear boletas (Control de Gastos)

El botón "📷 Escanear boleta y registrar gasto" en Gastos sube una foto de la boleta, Claude
(visión) extrae monto, comercio, fecha y categoría, y el gasto se registra automáticamente
(`source: "receipt_scan"`), sin pasos manuales. **Requiere `ANTHROPIC_API_KEY`** — no existe un
modo de reglas para leer imágenes; sin la clave, el botón muestra un mensaje explicando que hay
que registrar el gasto a mano mientras tanto.

## Asistente de voz

El botón 🎙️ flotante (o la página "Hoy") abre el panel del asistente. El micrófono usa el
reconocimiento de voz nativo del navegador (Web Speech API) — funciona en Chrome y Edge de
escritorio y Android; Safari/iOS tiene soporte parcial. Si el navegador no lo soporta, el panel
avisa y permite escribir en texto, que funciona siempre. Las respuestas se leen en voz alta por
defecto (se puede silenciar con el ícono 🔊/🔇).

## Estructura del proyecto

```
src/
  app/            Páginas (App Router) y rutas de API (app/api/**)
  components/     Componentes de UI reutilizables (nav, asistente, sesión)
  services/       Lógica de dominio (tareas, compras, gastos, casa, memoria, inteligencia…)
  ai/             Motor de IA: definición de herramientas, ejecutor con permisos/confirmación,
                  cliente de Claude, motor de reglas de respaldo, parsing de lenguaje natural
  lib/            Auth, permisos, validación (zod), errores seguros, cliente API del navegador
  db/             Esquema SQL, migraciones, cliente de base de datos, datos de demostración
  types/          Tipos de dominio compartidos
tests/            Pruebas automatizadas (Vitest)
```

## Pruebas realizadas

- Automatizadas (`npm test`): autenticación, permisos por rol, aislamiento entre familias,
  flujos conectados (compra → gasto → inventario → lista), conflictos de calendario,
  mantenciones y cuentas recurrentes, memoria, niveles de confirmación de la IA, motor de reglas
  de lenguaje natural, inteligencia proactiva.
- Manuales: `npm run build` sin errores, flujo completo en navegador (registro, login, crear
  tareas/eventos/gastos/compras, chat del asistente en modo reglas y confirmaciones).
- **No probado en este entorno**: el asistente con una `ANTHROPIC_API_KEY` real (sin esa clave no
  se puede verificar el camino de Claude en vivo), ni el micrófono/voz en un navegador real con
  hardware de audio.

## Futuras mejoras

- Notificaciones push reales (hoy la base de datos ya registra `notifications`; falta el canal de
  entrega push/móvil).
- Proveedor de voz en la nube (STT/TTS) como alternativa a la Web Speech API del navegador —la
  interfaz en `src/lib/voice.ts` ya está preparada para ello.
- Gráficos de tendencia de gastos y exportación de datos.
- App nativa o empaquetado con Capacitor/Tauri a partir de la misma base PWA.
