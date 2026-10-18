# Guía paso a paso: lector de boletas, Familia+ Voz, y lo nuevo en Hoy/Calendario

Mismo tono que `guia-usuario-no-tecnico.md`: un paso a la vez, lenguaje simple, sin asumir que
algo "ya se hizo solo". Esta guía cubre lo que se agregó en la sesión del 18 de octubre de 2026.

## 1. Lector de boletas (Gastos)

**Qué hace**: le sacás una foto a una boleta del supermercado, la app lee el total, la fecha y
los productos, y vos confirmás antes de que se guarde nada.

**Configurar la clave (una sola vez)**:
1. "Entra a **tabscanner.com**, creá tu cuenta gratis (no pide tarjeta, 200 boletas al mes)."
2. "Andá a 'Claves API' en el menú y copiá tu clave."
3. Claude la agrega a `.env.local` (para probar en el computador) y le pide al usuario que la
   agregue también en **Vercel → Settings → Environment Variables** como `TABSCANNER_API_KEY`,
   para que funcione en la app real.

**Usarlo día a día**:
1. Entrá a **Gastos**.
2. Tocá **"📷 Leer boleta del supermercado"**.
3. Elegí o sacá la foto de la boleta.
4. La app te muestra una pantalla de revisión: el total, la fecha, la tienda, y cada producto
   con su cantidad y unidad (unidades/kilos/litros) — **todo editable** antes de guardar.
5. Si avisa "⚠️ ya existe un gasto con la misma fecha y monto", revisá que no sea la misma
   boleta escaneada dos veces (no bloquea, solo avisa).
6. Tocá **"Guardar gasto y actualizar inventario"**. Se crea el gasto (categoría Supermercado) y
   se suma cada producto al inventario de una sola vez.

**Si algo sale mal**: si el botón muestra un aviso en vez de intentar leer la boleta, falta
configurar `TABSCANNER_API_KEY` (ver arriba). Si dice que no pudo leer el monto, pedir una foto
más clara, con buena luz y sin cortar el total.

## 2. Familia+ Voz (asistente por voz, gratis)

**Dos formas de hablarle, no confundirlas**:
- **Botón del micrófono** 🎙️ (al lado del cuadro de texto, abajo del todo): tocás **una vez**,
  decís tu pedido, y se apaga solo. Esta es la forma confiable en cualquier celular.
- **"Manos libres"** (el botón "🙌 Manos libres: ON/OFF" arriba del panel): una vez activado,
  queda escuchando en segundo plano esperando que digas **"Hey Familia"**. Es más cómodo cuando
  funciona bien, pero en Android a veces el celular corta la escucha sola y queda pitando sin
  escuchar nada de verdad (ver la trampa en `SKILL.md`) — si eso pasa, avisa solo y recomienda
  usar el botón normal en su lugar.

**Cómo entrar**: desde el menú principal, "Familia+ Voz" (icono 🎙️), o el botón flotante morado
en cualquier pantalla.

**Comandos que entiende** (sin necesitar `ANTHROPIC_API_KEY` — funciona gratis siempre):
- Gastos: "¿cuánto hemos gastado este mes?", "¿cuánto hemos gastado en supermercado?",
  "registra un gasto de 5.000 pesos en transporte", "muéstrame los últimos gastos".
- Inventario y compras: "¿cuánta leche queda?", "agrega dos kilos de arroz a la lista de
  compras", "registra que compré tres litros de leche" (sin precio, solo actualiza inventario).
- Tareas: "crea una tarea para limpiar la cocina", "marca como completada la tarea de sacar la
  basura", "¿qué tareas están pendientes?".
- Calendario: "¿qué tenemos programado para mañana?", "crea un evento para el sábado a las diez
  de la mañana" (si no decís un título, queda como "Evento familiar" — editable después en
  Calendario).
- Casa: "¿qué mantenimientos están pendientes?".

**Gastos grandes piden confirmación**: si el monto es $30.000 o más, el asistente pregunta
"¿confirmas?" antes de guardar — montos menores se registran directo.

**Si "Manos libres" no funciona en un celular**: usar el botón normal del micrófono en su lugar.
Si el aviso de error muestra un "código:" al final (ej. `no-speech`, `audio-capture`), guardar
ese dato — sirve para seguir ajustando la causa real en vez de adivinar.

## 3. "Hoy": ver tareas y eventos por Día, Semana o Mes

En la pantalla principal (Hoy), debajo de "FAMILIA" hay un selector **Día / Semana / Mes** que
cambia qué tareas (con fecha) y eventos se muestran — sigue respetando que cada persona solo ve
lo suyo (lo que le pidió el usuario: "que corresponda al usuario que ingresa").

## 4. Calendario: vista en cuadros (Mes) y edición completa

Arriba del calendario hay un selector **Lista / Mes**:
- **Lista**: los próximos eventos, uno debajo del otro.
- **Mes**: un calendario tradicional en cuadros; tocando un día se ve el detalle de sus eventos.

Cada evento tiene:
- **✎ Editar**: cambiar título, fecha y hora.
- **+1 día / +1 sem.**: reagendar rápido sin abrir el formulario completo.

Lo mismo existe en **Casa en Orden** para las tareas (✎ editar título/fecha, ⏰ postergar
+15 min / +1 hora / +1 día).

## 5. Categorías nuevas en Gastos

Se agregaron 7 categorías (además de las que ya había): **Supermercado, Farmacia, Ropa, Útiles
Escolares, Feria, Luz, Agua**. Aparecen solas en el selector de categoría — no hace falta
crearlas a mano, y se agregan automáticamente a cualquier familia nueva que se registre.
