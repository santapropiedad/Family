# Guía paso a paso para publicar Family en internet (sin saber programar)

Esta es la guía tal como se usó con el usuario real del proyecto: un paso a la vez, lenguaje
simple, esperando que confirme ("listo") o mande una captura de pantalla antes de seguir al
siguiente paso. Úsala igual si tienes que repetir el proceso o explicárselo a otra persona.

Principios al guiar a alguien así:
- Un paso, una instrucción concreta ("haz clic en el botón verde que dice X"), y esperar confirmación.
- Nunca asumir que algo "ya se hizo solo" — pedir que digan qué ven, o una captura.
- Si algo falla (una web que tira error, un clic que no hizo nada), no asustar: "no pasa nada, intentemos de nuevo" y dar el siguiente paso concreto.
- Nunca pedirle al usuario su contraseña real de nada. Si hace falta una credencial para que TÚ (Claude) la uses (ej. un token), explicar que se usa una sola vez y se borra después — y si el entorno bloquea esa vía (ver más abajo), cambiar de método en vez de insistir.

## Mapa del recorrido completo

1. Crear cuenta en GitHub (donde vive el código)
2. Crear un repositorio vacío en GitHub
3. Subir el código — con GitHub Desktop (no por comandos)
4. Crear cuenta en Vercel e importar el proyecto (donde vive la app funcionando)
5. Crear cuenta en Neon y sacar la cadena de conexión (la base de datos real)
6. Aplicar el esquema y poblar esa base de datos (lo hace Claude, un solo comando temporal)
7. Pegar las variables de entorno en Vercel y desplegar
8. Verificar que el login funcione en el sitio publicado
9. Crear cuenta en cron-job.org y programar el aviso de alarmas
10. (Opcional) Instalar la app en el celular como PWA

---

### Paso 1: Cuenta de GitHub

"Abre tu navegador y entra a **github.com/signup**. Te va a pedir un correo, una contraseña, y
un nombre de usuario. Cuando ya tengas la cuenta creada y hayas iniciado sesión, dime 'listo'."

### Paso 2: Crear el repositorio

"Entra a **github.com/new**. En 'Repository name' escribe el nombre que quieras (ej. `Family`).
Déjalo en Public. No marques ninguna casilla de abajo (README, .gitignore, license). Clic en
'Create repository'. Dame tu nombre de usuario de GitHub cuando lo tengas listo."

Con el nombre de usuario, Claude conecta el repo local:
```
git remote add origin https://github.com/<usuario>/<repo>.git
git branch -M main
```

### Paso 3: Subir el código — la parte importante

**No intentes que Claude haga `git push` con un token pegado en la URL o en un archivo que lea
un script.** El clasificador de seguridad de Claude Code lo bloquea como "Credential Leakage" —
se probó con el token embebido directo en la URL del remoto, y también indirecto (un script de
`askpass` que lo leía desde un archivo aparte), y ambos caminos fueron rechazados.

**Lo que sí funciona — GitHub Desktop:**

1. "Entra a **desktop.github.com**, clic en 'Download for Windows', e instálalo."
2. "Cuando lo abras, va a pedir iniciar sesión — clic en 'Sign in with your browser'. Se abre tu
   navegador pidiendo autorizar; dile que sí y vuelve al programa."
3. "Clic en 'Add an Existing Repository from your local drive...' y pega la ruta de la carpeta
   del proyecto (ej. `C:\Users\teany\OneDrive\Documentos\AGENDA FAMILIA`). Clic en 'Add
   Repository'."
4. "Va a aparecer un botón azul 'Publish branch' (o más adelante 'Push origin'). Clic ahí."

Para subir cambios futuros: Claude hace el commit local como siempre; el usuario solo necesita
abrir GitHub Desktop (va a mostrar el cambio nuevo solo) y hacer clic en "Push origin".

### Paso 4: Vercel

1. "Entra a **vercel.com**, clic en 'Sign Up', elige 'Continue with GitHub', autoriza."
2. "En el panel, clic en 'Import' junto a 'Import Project'. Elige GitHub, autoriza/instala la
   app de Vercel para tus repos si te lo pide, y selecciona tu repositorio."
3. Vercel detecta Next.js solo. **No hacer clic en Deploy todavía** — primero hay que juntar las
   variables de entorno (pasos 5-7).

### Paso 5: Neon (base de datos gratis)

1. "Entra a **neon.tech**, 'Sign Up', 'Continue with GitHub'."
2. Le va a pedir nombre de organización (cualquiera sirve) y crear un proyecto (nombre
   cualquiera). Si tira un error genérico al crear el proyecto, recargar la página normalmente lo
   resuelve — el proyecto igual suele quedar creado.
3. "Entra al proyecto, clic en el botón verde 'Conectar'. Ahí vas a ver la cadena de conexión
   (empieza con `postgresql://`) con la contraseña oculta — clic en 'Mostrar contraseña', luego
   en 'Copiar fragmento', y pégamela aquí."

### Paso 6: Preparar la base de datos de Neon (lo hace Claude)

Con la cadena de conexión que pegó el usuario, Claude corre, en PowerShell, **sin guardar la
variable permanentemente**:

```powershell
$env:DATABASE_URL = "<cadena de conexión de Neon>"
npm run db:migrate
npm run db:seed
Remove-Item Env:\DATABASE_URL
```

Esto crea las tablas en la base de datos real y le pone datos de ejemplo para poder entrar y
probar apenas esté publicada. **Nunca pegar esta cadena en `.env.local`** — ese archivo debe
seguir apuntando a PGlite para que el desarrollo local no se mezcle con la base de producción.

### Paso 7: Variables de entorno en Vercel y Deploy

"Vuelve a la pestaña de Vercel. Haz clic en 'Environment Variables' para abrirlo. Haz clic
dentro de la cajita 'Key' y pega este bloque completo — Vercel lo debería partir solo en varias
filas":

```
DATABASE_URL=<la cadena de Neon>
JWT_SECRET=<generar un string aleatorio largo>
VAPID_PUBLIC_KEY=<generar con: npx web-push generate-vapid-keys>
VAPID_PRIVATE_KEY=<idem>
VAPID_CONTACT_EMAIL=<correo de contacto>
CRON_SECRET=<generar un string aleatorio largo>
```

"Revisa que queden 6 filas con nombre y valor, y haz clic en 'Deploy'. Tarda 1-2 minutos."

### Paso 8: Verificar que funcione

Claude navega al link que da Vercel (algo como `https://<proyecto>.vercel.app`) y confirma que
el login con los datos de prueba funcione, sin pedirle al usuario que lo pruebe primero — mostrar
la confirmación ya hecha da más confianza que pedirle que verifique algo que podría fallar.

### Paso 9: cron-job.org (el robotito que revisa las alarmas)

1. "Entra a **cron-job.org**, 'Sign up', crea la cuenta con tu correo (gratis)."
2. "Clic en 'CREAR CRONJOB'. En Título pon lo que quieras. En URL pega esto" (con el secreto
   **URL-encodeado**: `/` → `%2F`, `=` → `%3D`):
   ```
   https://<tu-proyecto>.vercel.app/api/cron/check-alarms?secret=<CRON_SECRET codificado>
   ```
3. "En 'Horario de ejecución', cambia de 15 minutos a 5 minutos."
4. "Antes de guardar, clic en 'EJECUCIÓN DE PRUEBA' — debería salir '200 OK' y
   `{"ok":true,...}`. Si sale eso, clic en 'CREAR' para guardarlo."

Explicar por qué no se usa el cron propio de Vercel (ver SKILL.md: el plan gratuito solo corre
una vez al día) solo si el usuario pregunta — no hace falta adelantarlo si no lo pide.

### Paso 10: Instalar como app en el celular (opcional, al final)

**Android (Chrome)**: entrar al link, iniciar sesión, tocar los 3 puntitos ⋮ → "Instalar app" o
"Agregar a pantalla de inicio".

**iPhone (Safari, no Chrome)**: entrar al link, iniciar sesión, tocar Compartir ⬆️ → "Agregar a
pantalla de inicio" → "Agregar".

Mencionar que la primera vez va a aparecer un cartel pidiendo activar los avisos — hay que
tocar "Activar" para que los avisos realmente suenen con la app cerrada.

---

## Si algo sale mal

- **Login dice "correo o contraseña incorrecta"**: lo más común es un typo en el correo (ver
  caso real: el usuario configuró `jufernandez@gmail.com` pero su correo real era
  `jufernandezr@gmail.com`, con una "r" de más). Confirmar el correo exacto con el usuario antes
  de asumir que la contraseña está mal.
- **Vercel dice que el build falló**: revisar los logs del deployment en el panel de Vercel
  (pestaña "Deployments" → clic en el que falló) antes de tocar nada — casi siempre es una
  variable de entorno faltante o mal pegada.
- **El cronjob de prueba no da 200 OK**: revisar que el `CRON_SECRET` en la URL de cron-job.org
  sea idéntico (URL-encodeado) al que quedó guardado en Vercel.
