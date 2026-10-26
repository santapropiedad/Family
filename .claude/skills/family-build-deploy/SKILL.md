---
name: family-build-deploy
description: Documenta cómo se construyó y desplegó la app "Family" (antes "Familia+") — arquitectura técnica, decisiones y el paso a paso para guiar a un usuario sin conocimientos de programación por GitHub, GitHub Desktop, Vercel, Neon, cron-job.org y Tabscanner. Usa esta skill SIEMPRE que el usuario pregunte cómo se hizo/desplegó la app, pida volver a desplegarla, reportar que "se cayó" el sitio o los avisos, pedir ayuda para configurar de nuevo las variables de entorno, el cron, o la clave de Tabscanner (lector de boletas), o pedir que le expliques el proceso o alguna función nueva a otra persona — incluso si no menciona "deploy" o "skill" explícitamente (ej. "¿cómo subiste esto a internet?", "los avisos dejaron de llegar", "quiero hacer lo mismo para otra app mía", "explícame otra vez cómo funciona todo esto", "¿cómo uso el lector de boletas/Familia+ Voz?").
---

# Family: cómo se construyó y se desplegó

Esta skill es la memoria técnica del proyecto **Family** (carpeta `C:\Users\teany\OneDrive\Documentos\AGENDA FAMILIA`), un asistente familiar con IA y voz. El dueño del proyecto **no sabe programar** — cada vez que esta skill guíe pasos fuera del código (crear cuentas, pegar variables, etc.), hazlo con el mismo tono simple, un paso a la vez, esperando confirmación, que se usó originalmente (ver `references/guia-usuario-no-tecnico.md`).

## Arquitectura final (resumen para ti, Claude)

| Pieza | Qué es | Por qué |
|---|---|---|
| **Next.js 16** (App Router, React 19, TS) | Framework de la app | Ya estaba elegido desde el inicio del proyecto |
| **Base de datos** | `PGlite` (Postgres embebido) en desarrollo; **Neon** (Postgres real, gratis) en producción | `src/db/client.ts` cambia de uno a otro automáticamente según si `DATABASE_URL` está seteada — el resto del código nunca sabe cuál está usando |
| **Hosting** | **Vercel** (plan Hobby, gratis) | El repo está en GitHub y Vercel lo redespliega solo con cada `git push` a `main` |
| **Avisos con la app cerrada** | **Web Push** nativo del navegador (no Outlook, no email, no SMS) | Gratis, sin cuenta de terceros; `src/services/push.ts` + `public/sw.js` |
| **Quién revisa las alarmas cada minuto** | **cron-job.org** (externo, gratis) llamando a `/api/cron/check-alarms` | El cron propio de Vercel en el plan Hobby **solo corre una vez al día** (confirmado con los docs oficiales de Vercel, enero 2026) — insuficiente para avisar 15 min antes / 10 min después de vencer una tarea |
| **Lector de boletas** | **Tabscanner API v2** (`api3.tabscanner.com`, gratis hasta 200 boletas/mes, sin tarjeta) | OCR de boletas de supermercado — ver `src/services/receipts.ts`. Sube la foto, consulta el resultado (polling), y el usuario confirma antes de guardar nada |
| **Comando de voz (transcripción)** | **Groq** (Whisper `whisper-large-v3-turbo`, gratis) | `src/lib/voice.ts` (`GroqVoiceProvider`) graba el audio y lo manda a `/api/voice/transcribe`; mucho más confiable que el reconocimiento del navegador, sobre todo en celular |
| **"Hey Familia" (wake word) y respuesta hablada (TTS)** | **Web Speech API** del navegador (gratis) | Siguen siendo locales a propósito — no hay forma gratuita de escuchar en segundo plano todo el tiempo con una API, y Groq no tiene voz confiable en español. `WebSpeechProvider` en `src/lib/voice.ts` |
| **El "cerebro" (entender el pedido y decidir qué hacer)** | Motor de reglas local (`src/ai/rules.ts`), **no Claude** | `ANTHROPIC_API_KEY` está deliberadamente sin configurar — decisión de costo del usuario (ver "Otras trampas" abajo). Si se configura esa clave, usa `claude-sonnet-4-5` en su lugar (`src/ai/claude.ts`) sin tocar nada más |

## Mapa de archivos clave

- `src/db/schema.sql` — esquema completo; se aplica igual en PGlite y en Neon con `npm run db:migrate`.
- `src/db/client.ts` — decide PGlite vs Postgres real según `process.env.DATABASE_URL`.
- `src/services/alarms.ts` — `checkTaskAlarms` (usado por el polling del navegador) y `checkAndPushTaskAlarms` / `checkAllFamiliesTaskAlarms` (usados por el cron externo; estos SÍ envían push).
- `src/app/api/cron/check-alarms/route.ts` — endpoint que llama cron-job.org, protegido con `CRON_SECRET` (header `x-cron-secret` o `?secret=`).
- `src/services/push.ts` + `public/sw.js` — suscripciones Web Push y el service worker que muestra la notificación nativa.
- `src/components/NotificationsBell.tsx` — panel de la campanita (🔔): historial de avisos + estado real de los avisos push en este dispositivo, con botón para (re)activarlos en cualquier momento (no solo en el cartel de la primera vez).
- `src/lib/voice.ts` + `src/ai/groqVoice.ts` + `src/app/api/voice/transcribe/route.ts` — captura de voz (Groq Whisper) separada del "cerebro" (Claude/reglas); ver sección de arquitectura arriba.
- `.env.example` — lista todas las variables con comentarios; es la fuente de verdad de qué configurar en Vercel.
- `src/app/globals.css` (`@media (max-width: 480px) { html { font-size: 15px; } }`) + `src/components/AppShell.tsx` — compactación para celular: un solo cambio de tamaño base en vez de tocar cada pantalla.

### Variables de entorno exactas (Vercel → Settings → Environment Variables)

```
DATABASE_URL=<cadena de conexión de Neon>
JWT_SECRET=<string aleatorio largo>
VAPID_PUBLIC_KEY=<generada con: npx web-push generate-vapid-keys>
VAPID_PRIVATE_KEY=<idem>
VAPID_CONTACT_EMAIL=<correo de contacto>
CRON_SECRET=<string aleatorio largo>
ANTHROPIC_API_KEY=<opcional — sin ella, el asistente usa el motor de reglas local. Deliberadamente SIN configurar por ahora (decisión de costo del usuario, 25 oct 2026) — no sugerir activarla salvo que el usuario lo pida>
TABSCANNER_API_KEY=<opcional — sin ella, "Leer boleta" muestra un aviso en vez de fallar>
GROQ_API_KEY=<gratis en console.groq.com/keys — usada SOLO para transcribir voz (Whisper); sin ella el micrófono falla al transcribir, no hay otro fallback>
```

## Decisiones de arquitectura y el porqué

- **PGlite en dev, Postgres real en producción, mismo `schema.sql`**: evita mantener dos esquemas o lógica condicional en los servicios — `getDb()` es la única función que sabe cuál motor está activo.
- **cron-job.org en vez del cron de Vercel**: se verificó con una búsqueda web (no se asumió) que el plan Hobby de Vercel limita los Cron Jobs a una ejecución diaria. Como el sistema de alarmas necesita revisar cada 1-5 minutos, se usa un disparador externo y gratuito que sí permite esa frecuencia, apuntando a una ruta protegida por secreto.
- **Web Push en vez de email/Outlook**: el usuario preguntó por Outlook específicamente, pero Web Push logra el mismo resultado (aviso con la app cerrada) sin necesitar una cuenta de servicio de correo, sin SMTP/Graph API, y sin costo — más simple de mantener.
- **Admin puede resetear el acceso de otro integrante sin su contraseña, pero cambiar la propia sí exige la contraseña actual**: la autoridad del admin viene de su rol (verificado por capability), no de conocer contraseñas ajenas; el autoservicio exige la contraseña actual como defensa extra en un dispositivo familiar compartido. Ver `setMemberLogin` vs `updateCredentials` en `src/services/members.ts`.
- **GitHub Desktop en vez de `git push` por terminal para el usuario**: ver la lección de seguridad abajo.

## Lección de seguridad: cómo NO subir el código por el usuario

Cuando el usuario no tiene `git` configurado con GitHub, **no intentes pasar un Personal Access Token por la línea de comandos** — ni directo en la URL del remoto, ni indirecto (por ejemplo vía un script de `askpass` que lea el token de un archivo). El clasificador de modo automático de Claude Code bloquea ambos intentos como "Credential Leakage", sin importar la indirección usada.

**Lo que sí funciona**: guiar al usuario a instalar **GitHub Desktop**, iniciar sesión ahí (flujo OAuth por navegador, el usuario autoriza con un clic), usar **"Add an Existing Repository from your local drive"** apuntando a la carpeta del proyecto, y **"Publish branch"** / **"Push origin"**. Esto es además más apropiado para alguien sin experiencia técnica: no hay comandos, solo botones.

Para cambios futuros al código: tú (Claude) haces `git add` + `git commit` localmente como siempre; el usuario abre GitHub Desktop y hace clic en "Push origin" — avísale explícitamente cuándo necesitas que haga ese paso, no asumas que un commit local ya llegó a producción.

## Otras trampas ya resueltas (no las repitas)

- **PGlite no soporta dos procesos escribiendo a la vez** en `.pglite-data/`. Siempre detén `npm run dev` antes de `db:migrate` o `db:seed` en local (`Get-Process node | Stop-Process -Force`) — **incluso si el servidor ya estaba corriendo de antes y solo querés correr una migración rápida**. Ya pasó más de una vez en la misma sesión por olvidarlo: el síntoma es que la migración "funciona" (no tira error) pero los cambios no aparecen en la app, porque el servidor sigue usando su propia conexión abierta sin enterarse del archivo reescrito por el otro proceso.
- **El `CRON_SECRET` debe ir URL-encodeado** en la URL que se configura en cron-job.org: `/` → `%2F`, `=` → `%3D`. Si no, cron-job.org puede mandarlo mal cortado.
- **Neon a veces tira un error genérico ("Algo salió mal")** al crear el primer proyecto — recargar la página y reintentar normalmente lo resuelve; no es un problema real de la cuenta.
- **Para poblar la base de datos de Neon antes del primer deploy**: corre `db:migrate` y `db:seed` localmente con `$env:DATABASE_URL` seteada a la cadena de Neon solo para esos comandos (nunca la dejes en `.env.local`, que debe seguir apuntando a PGlite para desarrollo normal).
- **Verifica la documentación de una API externa contra la cuenta real, no solo contra lo que encuentres buscando**: la integración de Tabscanner se armó primero según `docs.tabscanner.com` (API v1: `api.tabscanner.com/api/2/process`), pero el panel real de la cuenta del usuario mostraba una ruta distinta (`v2/receipts` en `api3.tabscanner.com`) — Tabscanner había migrado a v2 sin que la doc vieja lo dejara claro. Se detectó porque el usuario compartió una captura del panel, no porque se haya dudado de la doc de entrada. Antes de dar una integración de API externa por terminada, pedí o revisé el panel real de la cuenta cuando estuvo disponible.
- **Los campos de hora en el navegador usan `vh`, no `dvh`, por error fácil de cometer**: en celular, Chrome muestra/oculta la barra de direcciones al hacer scroll, y `100vh`/`85vh` no descuenta eso — puede dejar contenido (como el cuadro de texto de un panel flotante) fuera de la parte visible de la pantalla. Usar `dvh` (dynamic viewport height) en cualquier panel o modal fijo a pantalla completa pensado para celular.
- **`new Date("2026-10-18")` (fecha sin hora) se interpreta como medianoche UTC**, no medianoche local — al mostrarla con `.toLocaleDateString()` en hora de Chile (UTC-3/-4) retrocede un día. Pasa con cualquier campo tipo `due_date` (solo fecha, sin hora) que se muestre con `new Date(string)` directo. Fix: si el string es puro `YYYY-MM-DD` (regex `/^\d{4}-\d{2}-\d{2}$/`), agregarle `T00:00:00` antes de pasarlo a `new Date()` — eso lo ancla a medianoche *local* en vez de UTC. Ojo: los timestamps que vuelven de Postgres (`start_at` de eventos, `created_at`, etc.) NO tienen 'T' — vienen como `"2026-10-19 18:00:00-04"` (espacio, no 'T') — así que el chequeo para decidir si un string ya trae hora debe ser "¿es exactamente `YYYY-MM-DD`?", no "¿contiene una 'T'?".
- **El reconocimiento de voz continuo (`continuous: true`) de Android Chrome no es confiable para "wake word" en segundo plano**: en algunos celulares corta la sesión casi al instante en vez de mantenerla escuchando, y cada reinicio automático dispara el sonido del sistema (pitido) — no silenciable desde JS. Si se reintenta sin un freno, el celular queda pitando sin parar sin escuchar nunca nada de verdad. Mitigación aplicada en `src/lib/voice.ts` (`startWakeWordListening`): back-off creciente entre reintentos y, tras varios reinicios seguidos demasiado rápidos, dejar de insistir y avisar con el código de error real en vez de pitar para siempre. Esto es una mitigación, no una solución completa — la causa raíz es una limitación real de la plataforma (Google reserva la activación por voz en segundo plano verdadera a su propio Asistente, con hardware dedicado de bajo consumo que una página web no puede usar).
- **Los diálogos nativos `window.confirm()` bloquean la automatización del navegador de pruebas** (usado para verificar cambios en vivo) — un clic en un botón "Eliminar" que dispara `confirm()` puede no completarse de forma confiable vía automatización. Para verificar o limpiar datos de prueba que dependen de un `confirm()`, usar `fetch(...,{method:'DELETE'})` directo contra la API en vez de clickear el botón de la UI. Esto es una limitación del entorno de pruebas, no un bug de la app.
- **Tabscanner devuelve las líneas de descuento/devolución con monto negativo** (ej. "Descuento promoción -500"), y tratarlas como un producto más rompe la validación al guardar (`lineTotal` no puede ser negativo). Bug real reportado por el usuario al probar con una boleta de verdad — se arregló descartando en `normalizeReceiptResult` (`src/services/receipts.ts`) cualquier línea con `lineTotal <= 0` antes de ofrecerla como producto a agregar al inventario.
- **GitHub Desktop puede mostrar "Fetch origin" en vez de "Push origin" aunque haya commits sin subir**, si el usuario ya los había subido por otra vía (o en una interacción anterior) y el panel no se refrescó todavía — no asumas que "no aparece el botón Push" significa que algo salió mal; compará el hash del último commit local (`git log --oneline -1`) contra el que se ve en GitHub antes de alarmar al usuario.
- **"Hoy" dividido por integrante: terminó en un diseño distinto al primero que se probó.** El usuario pidió varias veces reacomodar esto (ver commits del 18-19 oct); el diseño final y definitivo es: "PRIORIDADES DE HOY" mezcla lo propio del adulto + lo sin asignar + lo de cualquier hijo, con el nombre del hijo como etiqueta al lado de cada ítem (`childOwnerName()` en `src/app/page.tsx`, cruza `tasks` por id ya que `summary.priorities` no trae el assignee) — pero la sección "Tareas/Eventos" (con el selector Día/Semana/Mes) muestra *solo* lo propio del usuario que inició sesión, sin mezclar lo de los hijos ahí. No tiene nada que ver con qué usuario es (Juan o Teany) — es por **rol** (`admin`/`adult` ven a los hijos, `child` no), así que nunca hace falta "repetir" esta configuración para otro adulto.
- **El asistente de voz gratis solo entiende las frases que están en `src/ai/rules.ts`**, no lenguaje libre — es la naturaleza de un motor de reglas determinista, no un bug. Si el usuario reporta que "no entiende ciertas frases", la respuesta correcta es pedirle la frase exacta que probó y agregar un nuevo patrón de regex, no prometer comprensión abierta (eso requeriría `ANTHROPIC_API_KEY`, que tiene costo).
- **El usuario decidió, consciente del costo, quedarse en modo reglas (sin `ANTHROPIC_API_KEY`) y también rechazó la alternativa gratis de usar el LLM de Groq como "cerebro"** (25 oct 2026) — Groq se usa únicamente para transcribir voz (STT), nunca para interpretar el pedido. No ofrecer de nuevo cambiar el cerebro salvo que el usuario lo pida él mismo; si pide que el asistente "entienda más cosas", la respuesta es ampliar `src/ai/rules.ts`, no cambiar de motor.
- **Antes de agregar un ícono/pantalla nueva al menú, pensar si cabe mejor como comando de Family IA o como parte de una pantalla ya existente.** Se construyó una pantalla "Cuentas" completa (con su propio ícono) y el usuario pidió sacarla por duplicar con "Control de Gastos" — la función (eliminar una cuenta) se volvió a exponer, pero como comando de chat/voz (`delete_bill`), sin pantalla propia. Mismo patrón con "Inteligencia": se eliminó el ícono/pantalla aparte y sus avisos únicos se fusionaron dentro de "Hoy". El usuario valora un menú corto y sin duplicados por sobre tener una pantalla dedicada para todo.
- **El gusto visual de una función nueva no está garantizado aunque funcione perfecto.** Se agregó un botón "+ Categoría" en Gastos, totalmente funcional y probado, y el usuario pidió revertirlo solo porque "no me gustó como quedó" — se revirtió limpio (incluyendo el endpoint/schema que había quedado sin uso). Para agregados de UI chicos/opcionales, está bien mostrarlos directo en vez de sobre-pensar el diseño, pero conviene mantener el cambio aislado (componente/ruta propia) para poder revertirlo fácil si no convence.
- **Existe una cuenta demo (`demo@familiaplus.cl`, ver `src/db/seed.ts`) sembrada también en la base de datos REAL de producción**, no solo en desarrollo local — causó que el usuario confundiera datos de ejemplo (una cuenta "Electricidad"/"Agua" con el mismo proveedor "Aguas Andinas" de la semilla) con datos reales de su familia. Si reporta ver algo genérico o que no reconoce, primero verificar si puede estar en la cuenta demo (el encabezado dice "Familia Fernández (demo)") antes de investigar un bug de datos.
- **En `src/ai/rules.ts`, los patrones de regex comparan `text.toLowerCase()` directo, SIN quitar tildes** (a diferencia de `src/ai/parsing.ts`, que sí usa `stripAccents` para fechas/cantidades). Un patrón nuevo que incluya una palabra con tilde en alguna conjugación hablada (ej. "pospón") y solo escriba la forma sin tilde ("pospon") no va a coincidir cuando el usuario diga la forma correcta. Escribir ambas variantes en el regex (`posp[oó]n`) o pasar el texto por `stripAccents` primero.
- **Un `(?!...)` (negative lookahead) para excluir una frase de un patrón genérico debe cubrir TODOS los artículos posibles ("el/la/los/las/un/una"), no solo uno**: se agregó una exclusión para que "agrega una tarea/evento/cuenta/mantención..." no cayera en el patrón genérico de "agregar a la lista de compras", pero solo contemplaba "un/una" — "agrega **la** cuenta de luz..." se seguía colando como si fuera un producto de supermercado. Probar la exclusión con los dos artículos (y sin artículo) antes de darla por buena.
- **El manifiesto de la PWA (`src/app/manifest.ts`) se sirve en `/manifest.webmanifest` por convención de Next.js, no en `/manifest.json`** — un `layout.tsx` que apunte al nombre equivocado deja a Chrome sin forma de detectar que la app es instalable (sin error visible, simplemente nunca aparece "Instalar app"). Más sutil todavía: el `matcher` de `middleware.ts` (que redirige a `/login` sin sesión) debe excluir el nombre *real* del archivo (`manifest.webmanifest`) — excluir el nombre viejo/equivocado no sirve de nada, porque Chrome pide el manifiesto sin enviar la cookie de sesión, así que si el middleware lo intercepta, entrega el HTML de `/login` en vez del manifiesto, y la instalación falla en silencio otra vez. Verificar ambas cosas juntas si "Instalar app" no aparece.

## El paso a paso completo para guiar al usuario

El recorrido completo, con el lenguaje simple exacto usado (crear cuenta en GitHub → repo → GitHub Desktop → Vercel → Neon → variables de entorno → cron-job.org → instalar como PWA en el celular) está en **`references/guia-usuario-no-tecnico.md`**. Léelo antes de repetir este proceso con este usuario o con cualquier otro usuario no técnico — tiene el tono exacto a replicar (explicaciones cortas, un paso a la vez, nada de jerga, pedir capturas de pantalla para confirmar).

## Cómo usar las funciones agregadas el 18 de octubre de 2026

Lector de boletas (Tabscanner), Familia+ Voz (comandos, "Manos libres"), el selector Día/Semana/Mes
en Hoy, la vista Mes del Calendario, y las categorías de Gastos nuevas — el paso a paso con el
mismo tono para explicárselo al usuario está en **`references/funcionalidades-2026-10-18.md`**.

## Cambios del 19 de octubre de 2026

"Hoy" dividido por integrante (diseño final arriba, en "Otras trampas"), ícono de la app
reemplazado por el del usuario, y la corrección del lector de boletas con líneas de descuento —
el detalle y el paso a paso están en **`references/funcionalidades-2026-10-19.md`**.

## Cambios del 25 de octubre de 2026

Comando de voz migrado a Groq (solo transcripción, un solo toque para hablar), decisión consciente
del usuario de quedarse sin `ANTHROPIC_API_KEY` ampliando el motor de reglas en su lugar, "Cuentas"
e "Inteligencia" sacadas del menú (fusionadas en Hoy / movidas a comandos de chat), tareas atrasadas
ya no se repiten en "Hoy", botón "Editar" unificado en Casa en Orden, la campanita de Avisos ahora
permite revisar/reactivar los avisos push en cualquier momento, y Family IA ampliada con posponer/
reprogramar/editar en tareas, eventos, recordatorios, cuentas y mantenciones — el detalle completo
está en **`references/funcionalidades-2026-10-25.md`**.
