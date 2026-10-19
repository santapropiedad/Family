# Guía paso a paso: "Hoy" por integrante, ícono de la app, y ajuste del lector de boletas

Continúa `funcionalidades-2026-10-18.md`. Mismo tono: un paso a la vez, lenguaje simple.

## 1. "Hoy": prioridades y tareas de los hijos

Los hijos (menores) no tienen acceso propio a la app, así que lo suyo se ve en la pantalla de
sus padres. Diseño final, después de varias vueltas con el usuario:

- **PRIORIDADES DE HOY** (arriba de todo): mezcla lo propio del adulto que inició sesión, lo sin
  asignar, y lo de **cualquier hijo** de la familia — cada tarea de un hijo muestra su nombre al
  lado (ej. "Ordenar habitación  Martina") para distinguirla de lo propio.
- **Tareas / Eventos** (la sección con el selector Día/Semana/Mes, más abajo): muestra **solo**
  lo propio del adulto (o sin asignar) — lo de los hijos no se repite ahí, solo aparece en
  Prioridades.

Esto es automático por **rol** (admin/adult ven a los hijos; un hijo, si algún día inicia
sesión, solo ve lo suyo) — nunca hace falta "activarlo" ni configurarlo por separado para cada
adulto de la familia (Juan y Teany ven exactamente lo mismo sin nada que tocar).

## 2. Ícono de la app

El ícono (favicon, el de instalar en el celular, y el de iOS) se reemplazó por una imagen que
mandó el usuario, en vez del placeholder morado con "F+" que traía desde que se armó la app.
Si el usuario quiere cambiarlo de nuevo en el futuro:

1. Pedirle la imagen (puede pegarla directo en el chat).
2. Guardarla centrada sobre un lienzo cuadrado en `public/app-icon.png` (rellenando el borde con
   el color de la propia esquina de la imagen, para que no se note el recuadro si la imagen
   original no era cuadrada).
3. No hace falta tocar nada más — `src/app/icon.tsx`, `src/app/apple-icon.tsx` y
   `src/app/icons/[size]/route.tsx` ya leen ese archivo (vía el helper
   `src/app/icon-source.ts`) y lo usan a cualquier tamaño que pidan.

## 3. Lector de boletas: líneas de descuento

Si una boleta real tiene una línea de descuento o devolución (monto negativo), el lector ya no
la trata como un producto — se descarta automáticamente al leer la boleta, y el total del gasto
(que ya viene neto de descuentos) no cambia. Si el usuario reporta un error de "lineTotal" o
similar al guardar una boleta, es probable que sea este mismo tipo de línea — revisar
`normalizeReceiptResult` en `src/services/receipts.ts`.

## 4. Familia+ Voz: cómo ampliar las frases que entiende

El usuario reportó que el asistente "solo entiende ciertas frases" — es esperado, es un motor de
reglas (`src/ai/rules.ts`), no IA libre. Cuando pida que entienda una frase nueva:

1. Pedirle la frase **exacta** que probó (copiada tal cual, no parafraseada).
2. Agregar un nuevo patrón de regex a `handleWithRules` en `src/ai/rules.ts`, siguiendo el estilo
   de los que ya existen (comentario arriba con el ejemplo de frase, regex, llamada a
   `executeTool`, respuesta).
3. Si la frase se parece a una ya cubierta pero con otra palabra (ej. sinónimo), ampliar esa
   regex existente en vez de duplicar un patrón nuevo.
4. Avisarle que esto sigue siendo gratis — la alternativa (entender *cualquier* forma de
   decirlo) requiere activar `ANTHROPIC_API_KEY`, que tiene costo por uso.
