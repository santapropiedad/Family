# Asistente de IA — Family

## Dos motores, una sola interfaz

La app siempre expone el mismo asistente (`POST /api/ai/chat`, usado por el panel de texto y por
voz). Internamente hay dos motores intercambiables (`src/ai/chat.ts`):

1. **Claude** (`src/ai/claude.ts`), si `ANTHROPIC_API_KEY` está configurada: conversación libre en
   lenguaje natural, con un loop de uso de herramientas (tool use) del SDK oficial de Anthropic.
2. **Motor de reglas** (`src/ai/rules.ts` + `src/ai/parsing.ts`), si no hay clave configurada:
   interpreta por patrones los comandos más comunes en español de Chile — agregar compras,
   registrar gastos ("compré leche por $8.990"), crear recordatorios/tareas con fechas relativas
   ("mañana", "pasado mañana", días de la semana), asignar tareas por nombre, y consultar lo
   pendiente, la agenda de un integrante o cuánto se ha gastado.

Esto cumple dos cosas a la vez: la especificación pide no fingir que la IA funciona, y pide no
bloquear el proyecto por falta de una credencial que el usuario debe proporcionar. El motor de
reglas es real y funcional (no una simulación), simplemente mucho más limitado que Claude: no
sostiene conversación libre ni entiende frases fuera de los patrones cubiertos.

## Arquitectura de herramientas (el modelo nunca toca la base de datos)

```
Claude / motor de reglas
   │  decide llamar una herramienta (nombre + parámetros)
   ▼
src/ai/executor.ts — executeTool(ctx, toolName, params)
   │  1. busca la herramienta en el registro (src/ai/tools.ts)
   │  2. verifica el permiso del rol del integrante (requiredCapability)
   │  3. revisa el nivel de confirmación
   │  4. si es "auto": ejecuta el handler (que llama a src/services/**) y registra en ai_actions
   │  5. si es "confirm" / "always_confirm": NO ejecuta — queda pending_confirmation en ai_actions
   ▼
Resultado (ejecutado, o pendiente de confirmación) + registro en audit_logs
```

Cada herramienta (~20, cubriendo tareas, eventos, recordatorios, compras/inventario, gastos,
mantenciones, cuentas, familia y memoria) declara en `src/ai/tools.ts`:

- su esquema de parámetros (usado como `input_schema` de Claude),
- la **capacidad** requerida (`src/lib/permissions.ts`) — así un niño no puede, por ejemplo,
  pagar una cuenta aunque se lo pida a la IA con mucha insistencia,
- su **nivel de confirmación**.

## Niveles de confirmación (spec sección 16)

- 🟢 **auto**: agregar a compras, crear tarea/evento/recordatorio, registrar un gasto no
  recurrente, consultar cualquier dato — se ejecuta de inmediato.
- 🟡 **confirm**: eliminar una tarea o evento.
- 🔴 **always_confirm**: pagar una cuenta (acción financiera sensible).

Lo importante: **la confirmación nunca se basa en que el modelo "diga" que el usuario confirmó**.
Cuando una herramienta no es `auto`, el ejecutor guarda la acción como `pending_confirmation` en
`ai_actions` y devuelve su `actionId`. La UI muestra un botón Confirmar/Cancelar; solo al llamar
`POST /api/ai/actions/:id/confirm` (una petición HTTP autenticada, independiente de lo que diga la
conversación) se ejecuta de verdad la herramienta (`confirmPendingAction`). Rechazar
(`/reject`) la marca como `rejected` sin ejecutar nada. Esto es válido tanto si el usuario llega a
esa confirmación hablando con Claude como si llega usando el motor de reglas.

## Memoria (spec sección 12)

Tabla `memories`: cada fila es un dato estructurado y corto (`content`), no una conversación
completa. Se diferencia por `type` (`permanent` / `temporary`, con `expires_at` para lo temporal).
La familia puede ver, editar, borrar una memoria puntual o borrar toda la memoria desde la
pantalla "Familia" (`DELETE /api/memories`), y desactivar la memoria por completo desde los
ajustes de IA de la familia (`family.ai_memory_enabled`).

## Inteligencia proactiva (spec sección 15)

`src/services/insights.ts#detectInsights` corre bajo demanda (pantalla "Inteligencia", resumen de
"Familia Hoy") y revisa: cuentas por vencer en los próximos 3 días, productos que probablemente se
estén terminando (según `inventory_items.avg_purchase_frequency_days`, aprendido compra a compra),
tareas atrasadas, cruces de horario entre eventos de un mismo integrante, y categorías de gasto que
subieron ≥15% respecto del mes anterior. **Es puramente informativo**: no es una herramienta que la
IA pueda invocar para ejecutar algo, solo alimenta la UI y los resúmenes. Se puede desactivar por
familia (`family.ai_proactive_enabled`), igual que las sugerencias de compra habitual
(`family.shopping_suggestions_enabled`).

## Resúmenes diario/nocturno

`GET /api/summary?mode=morning|night` (`src/services/insights.ts#buildSpokenSummary`) devuelve un
texto corto listo para mostrarse o leerse en voz alta, construido solo con datos reales (tareas
pendientes/completadas, próximo evento, cuenta más urgente, productos pendientes).

## Seguridad de la IA

- Toda acción pasa por la verificación de permisos del rol (nunca un acceso directo a la base de
  datos desde el modelo).
- Toda acción (ejecutada, pendiente, rechazada o fallida) queda en `ai_actions`, visible en la
  pantalla "Familia" → "Actividad de la IA".
- Las respuestas financieras (`query_expenses_summary`) se construyen solo a partir de lo
  almacenado en `expenses`/`budgets`; el modelo no puede inventar cifras porque no tiene otra
  fuente de esos números que la herramienta.
