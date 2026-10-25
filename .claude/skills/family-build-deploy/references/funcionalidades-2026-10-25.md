# Guía paso a paso: comando de voz con Groq, decisión de dejar el motor de reglas, y varios ajustes de UI

Continúa `funcionalidades-2026-10-19.md`. Mismo tono: un paso a la vez, lenguaje simple.

## 1. Comando de voz: ahora transcribe con Groq (Whisper), no el navegador

El usuario pidió explícitamente que **solo la transcripción de voz** (lo que Family IA "escucha")
usara Groq — el "cerebro" que decide qué hacer siguió siendo el mismo de antes (Claude si hay
`ANTHROPIC_API_KEY`, si no el motor de reglas). No confundir esto con "cambiar el cerebro a Groq",
que el usuario rechazó explícitamente.

- Al tocar el micrófono, el navegador graba audio (con detección de silencio para cortar sola,
  `src/lib/voice.ts` → `GroqVoiceProvider`) y lo manda a `/api/voice/transcribe`, que llama a la
  API de Groq (`whisper-large-v3-turbo`) usando `GROQ_API_KEY`.
- **"Hey Familia" (wake word) y la respuesta hablada (TTS) siguen siendo 100% locales y gratis**
  en el navegador (`WebSpeechProvider`) — Groq no tiene forma gratuita de escuchar en segundo
  plano todo el tiempo, y no tiene una voz confiable en español.
- Clave gratis en `console.groq.com/keys` — si el formulario de creación de clave falla con un
  error de Cloudflare ("La verificación falló"), recargar la página suele resolverlo.
- **El botón de micrófono ahora activa la escucha con un solo toque**, al estilo Gemini/Alexa
  (antes había que tocar el botón flotante para abrir el panel, y *después* tocar el micrófono de
  adentro para empezar a escuchar) — ver `AssistantButton.tsx` (`autoListenOnOpen`).

## 2. El "cerebro" sigue sin `ANTHROPIC_API_KEY` — decisión consciente del usuario

El usuario preguntó cuánto le alcanzarían $5 USD de crédito de Anthropic (estimado: ~150-250
intercambios, 1-2 meses de uso liviano) y decidió **no activarlo por ahora**, y también rechazó
la alternativa gratis (usar el LLM de Groq como cerebro) — prefiere quedarse con el motor de
reglas (`src/ai/rules.ts`) tal cual. **No sugerir de nuevo activar Claude o Groq como cerebro
salvo que el usuario lo pida él mismo.**

Se amplió el motor de reglas con, entre otros:
- Comandos de **eliminar**: tarea, evento, recordatorio, cuenta del hogar, producto de la lista de
  compras (antes solo existía crear/consultar, no eliminar, para la mayoría de estas entidades).
- Saludos básicos (hola/gracias/chao) — antes algo tan simple como "gracias" caía en "no entendí".
- Se corrigió un bug real: **"recuérdame X" nunca funcionaba** — el patrón esperaba por error la
  palabra "recordarme" (mal escrita) en vez de "recuérdame" (la forma correcta en español). Si el
  usuario reporta que una frase "obvia" no funciona, vale la pena probarla literal antes de asumir
  que el patrón ya cubre esa forma.

## 3. "Cuentas del hogar": existe, pero solo por chat/voz, no como pantalla propia

Se construyó una pantalla completa `/cuentas` (listar, agregar, pagar, eliminar) y el usuario pidió
sacarla **porque duplicaba con "Control de Gastos"** — lección general: antes de agregar un ícono
de menú nuevo, pensar si cabe mejor como comando de Family IA o como parte de una pantalla ya
existente. Lo que quedó:

- **No hay pantalla ni ícono de "Cuentas"** en el menú.
- Para eliminar una cuenta (luz, agua, etc.), se le dice a Family IA: *"elimina la cuenta de
  electricidad"* — pide confirmación antes de borrar, igual que con tareas/eventos
  (`delete_bill` en `src/ai/tools.ts` + patrón en `src/ai/rules.ts`).
- Crear/pagar cuentas sigue existiendo por dentro (`POST /api/bills`, `POST /api/bills/[id]/pay`)
  pero **sin ninguna pantalla que lo use** — si el usuario pide volver a verlas/crearlas desde la
  app, ahí sí amerita reconstruir una UI (ya existe toda la lógica del lado del servidor).

Mismo patrón con **"Inteligencia"**: tenía su propio ícono de menú aparte, pero la mitad de lo que
mostraba ya se repetía en "Hoy" (cuentas por vencer, tareas atrasadas). Se eliminó esa pantalla y
sus 3 avisos realmente únicos (compra habitual, conflicto de horario, gasto inusual) se movieron
directo a una sección nueva "SUGERENCIAS" dentro de "Hoy".

## 4. "Hoy": una tarea atrasada ya no aparece repetida

Antes, una tarea atrasada aparecía **dos veces** en "Prioridades de hoy": como aviso rojo ("lleva
X días atrasada") y de nuevo en la lista normal de tareas (con el nombre de quien la tiene). Ahora
se calculan los días de atraso directo sobre la tarea (`daysLateFor` en
`src/services/insights.ts`) y se muestran junto al título, en una sola línea — ej. **"Ordenar
habitación · lleva 7 días atrasada"** con el nombre del integrante al lado.

## 5. Casa en Orden: un solo botón "Editar" (antes eran dos)

Editar (lápiz) y posponer (reloj) eran dos botones separados; ahora un solo **"✎ Editar"** abre
todo junto: título, fecha/hora, atajos rápidos de posponer (+15 min, +1 hora, +1 día), y
Guardar/Cancelar/Eliminar. Ver `src/app/casa/page.tsx`.

## 6. Avisos: se puede revisar y (re)activar en cualquier momento

Antes solo existía **una** oportunidad de activar los avisos push (el cartel que aparece una sola
vez al abrir la app) — si alguien tocaba "Ahora no" por error, no había forma de volver a
intentarlo en ningún lado del menú. Ahora el panel de la campanita (🔔, arriba a la derecha)
siempre muestra el estado real y, si están desactivados, un botón para activarlos:

- **"🔔 Avisos activados en este dispositivo"** → ya funciona, no hace falta nada.
- **"🔕 Avisos desactivados"** + botón **"Activar"** → lo prende en el momento.
- **"🔕 Bloqueados por el navegador"** → hay que ir a la configuración del sitio en el navegador
  del celular (no se puede volver a pedir el permiso por JavaScript una vez que lo rechazó).

Recordar también (no cambió, pero se le explicó al usuario): los avisos son **por cuenta, no por
dispositivo** — si una tarea está asignada solo a Juan, solo el celular donde Juan tiene su sesión
iniciada (y activó avisos ahí) recibe el aviso. Hoy en día **solo las tareas con fecha y hora**
generan avisos push — eventos, cuentas y recordatorios todavía no (serviría agregarlo si el
usuario lo pide).

## 7. Ojo: existe una cuenta demo en la MISMA base de datos de producción

`demo@familiaplus.cl` (ver `src/db/seed.ts`) no es solo para desarrollo local — quedó sembrada
también en la base de datos real de producción en algún momento del proceso de deploy original.
Causó una confusión real: el usuario vio "La cuenta de Electricidad vence..." / "Agua" en lo que
creía su familia real, y resultaron ser justo las cuentas de ejemplo de la semilla demo (mismo
nombre, mismo proveedor "Aguas Andinas"). **Si el usuario reporta datos genéricos o que no
reconoce, revisar primero si puede estar en la cuenta demo** (se distingue porque el encabezado
dice "Familia Fernández (demo)") antes de asumir un bug de datos.

## 8. Variable de entorno nueva

```
GROQ_API_KEY=<gratis en console.groq.com/keys — usada solo para transcribir voz (Whisper)>
```

Sin esta clave, el botón de micrófono vuelve a fallar al transcribir (no hay más fallback de voz
que el navegador si `GROQ_API_KEY` falta, a diferencia de `ANTHROPIC_API_KEY` que sí tiene un
fallback completo con el motor de reglas).
