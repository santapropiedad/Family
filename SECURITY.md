# Seguridad — Family

## Autenticación

- Contraseñas con `bcryptjs` (12 rondas), nunca en texto plano ni en logs.
- Sesión como JWT firmado (`JWT_SECRET`), guardado en una cookie `httpOnly`, `sameSite=lax`, y
  `secure` en producción — no accesible desde JavaScript del navegador (mitiga robo de sesión por
  XSS).
- `JWT_SECRET` es obligatorio: la app falla explícitamente al firmar/verificar si no está
  configurado, en vez de usar un valor por defecto inseguro.

## Autorización

- Tres roles fijos (`admin` / `adult` / `child`), con una matriz de capacidades en
  `src/lib/permissions.ts`. Cada ruta de API y cada herramienta de IA llama a
  `assertCapability(role, capability)` antes de mutar nada.
- Un niño solo puede actuar sobre sus propios registros (`canActOnOwnRecordOnly`): por ejemplo,
  puede completar una tarea asignada a él, pero no eliminar ni reasignar la de otra persona, ni
  ver información financiera.
- No eliminar al único administrador de una familia (`removeMember` lo bloquea explícitamente).

## Aislamiento entre familias (multi-tenant)

Toda función de `src/services/**` recibe `familyId` como primer parámetro y lo usa en el `WHERE`
de cada consulta SQL — nunca se devuelve ni se modifica una fila por su `id` sin acotarla también
por `family_id`. El `familyId` siempre viene de la sesión verificada (`requireSession()`), nunca de
un parámetro que el cliente pueda enviar. Cubierto por pruebas automatizadas
(`tests/tenant-isolation.test.ts`): una familia no puede leer, listar ni modificar tareas, gastos
ni integrantes de otra, incluso conociendo un ID válido.

## Validación de entradas

Todo cuerpo de petición que muta datos se valida con `zod` (`src/lib/validation.ts`) antes de
tocar la base de datos: tipos, longitudes máximas, formatos (UUID, email), rangos numéricos. Un
error de validación se traduce en un `400` con un mensaje claro, nunca en una consulta SQL con
datos sin verificar.

## Protección contra acciones no autorizadas de la IA

Ver [AI.md](AI.md) para el detalle completo. En resumen:

- El modelo de lenguaje **nunca** tiene acceso directo a la base de datos; solo puede invocar
  herramientas controladas que pasan por la misma verificación de permisos que la API.
- Las acciones sensibles (pagos, eliminar datos) quedan en `pending_confirmation` y solo se
  ejecutan tras una confirmación explícita del usuario por una ruta de API separada — nunca porque
  el modelo "declare" que el usuario confirmó dentro de la conversación.
- Toda acción de la IA (ejecutada, pendiente, rechazada o fallida) se registra en `ai_actions`,
  visible para la familia, y las confirmaciones/rechazos quedan además en `audit_logs`.

## Manejo de errores

`src/lib/errors.ts` distingue errores seguros de mostrar (`AppError` y sus subclases, siempre en
español, sin detalles técnicos) de cualquier otro error, que se registra en el log del servidor
(`console.error`) y se devuelve al cliente como un mensaje genérico ("Algo salió mal..."). Nunca se
filtran mensajes de la base de datos, rutas de archivos ni stack traces al navegador.

## Privacidad de datos

- Los datos de cada familia (gastos, memoria, conversaciones con la IA) solo son visibles para
  integrantes de esa familia, autenticados.
- La memoria de la IA es estructurada y editable/borrable por la familia (sección "Familia"); no
  se almacenan transcripciones completas de conversaciones como "memoria" (sí se guarda el
  historial de chat en `ai_messages` para dar contexto a la conversación, acotado por familia, y
  se puede desactivar la IA por completo desde los ajustes de familia).
- Ninguna clave de API (Anthropic) se expone al frontend: el cliente de Claude se instancia solo
  en código de servidor (`src/ai/claude.ts`, ejecutado en rutas de API).

## Pendiente para un entorno de producción real

- Límite de intentos de login (rate limiting) — no implementado en esta versión.
- Rotación/revocación de `JWT_SECRET` y sesiones individuales (hoy expiran a los 30 días, sin
  revocación anticipada).
- Políticas de contraseña más estrictas que el mínimo de 8 caracteres.
