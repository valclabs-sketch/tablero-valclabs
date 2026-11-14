# Tablero ValClabs 🚀

Tablero kanban del equipo: tareas por persona, recordatorios, notificaciones y notas de reuniones.
Funciona en el computador y en el celular (se puede instalar como app).

**Funciones**
- Columnas *Por hacer → En progreso → En revisión → Hecho*. Arrastra las tarjetas (en el celular: mantén presionada la tarjeta y luego arrástrala).
- Cada tarea tiene responsable, proyecto, urgencia (se ve en la tarjeta), fecha límite y recordatorio.
- Filtros por **persona, proyecto, urgencia (alta, media, baja), día** (hoy, mañana, próximos 7 días, vencidas, fecha exacta) y **búsqueda por nombre de tarea**.
- **Notas de reuniones** con asistentes, proyecto y acuerdos. Un botón convierte cada acuerdo en una tarea y se la asigna a la persona que nombres en la línea.
- **Notificaciones**: cuando te asignan una tarea, la mueven o llega la hora de un recordatorio. También avisa una vez al día de las tareas que vencen hoy.
- Botón «Agregar a mi calendario» (.ics) para tener el recordatorio también en Google Calendar o en el calendario del iPhone.

---

## Puesta en marcha (una sola vez, ~15 minutos)

Mientras no completes el paso 1, el tablero funciona en **modo local**: los datos se guardan solo en ese navegador. Sirve para probarlo.

### 1. Base de datos compartida (Supabase, gratis)
1. Crea una cuenta en <https://supabase.com> y un proyecto nuevo.
2. Ve a **SQL Editor**, pega todo el contenido de [`supabase/schema.sql`](supabase/schema.sql) y pulsa **Run**.
3. En **Project Settings → API** copia la *Project URL* y la clave *anon public*.
4. Pégalas en [`config.js`](config.js) (`SUPABASE_URL` y `SUPABASE_ANON_KEY`) y guarda el cambio en GitHub.
5. En **Authentication → URL Configuration**, pon la dirección del tablero (`https://valclabs-sketch.github.io/tablero-valclabs/`) como *Site URL*.

Cada persona entra con su correo y contraseña (botón «Crear cuenta»). Cuando todo el equipo tenga cuenta, puedes cerrar el registro en **Authentication → Providers → Email → Allow new users to sign up** (desactivado) para que nadie más pueda entrar.

> La clave *anon* puede estar en el código público: solo deja leer o escribir a quien haya iniciado sesión.

### 2. Notificaciones push en el celular, con la app cerrada (opcional)
Con la app abierta o en segundo plano, los avisos funcionan desde el paso 1. Para recibirlos con la app **cerrada**, GitHub revisa cada 15 minutos y manda los avisos push:

1. Las claves VAPID ya están creadas: la pública está en `config.js` y la privada se guardó como secreto del repositorio.
2. En GitHub → **Settings → Secrets and variables → Actions** agrega:
   - `SUPABASE_URL`: la misma URL del paso 1.
   - `SUPABASE_SERVICE_KEY`: Supabase → Project Settings → API → *service_role* (**secreta, nunca la pongas en el código**).
3. En cada celular: abre el tablero → **Equipo → Activar notificaciones**.
   - **iPhone**: primero Safari → Compartir → **Agregar a pantalla de inicio**, abre la app desde el ícono y ahí actívalas (requiere iOS 16.4 o superior).
   - **Android**: Chrome → menú ⋮ → **Instalar app**.

### 3. Publicación
El sitio se publica solo con GitHub Pages desde la rama `main`. Cada cambio que subas queda en línea en un par de minutos.

---

## Estructura
| Archivo | Para qué sirve |
|---|---|
| `index.html`, `styles.css`, `app.js` | La aplicación |
| `store.js` | Guarda los datos (modo local o Supabase) |
| `config.js` | Claves de conexión |
| `sw.js`, `manifest.webmanifest` | Instalación como app, uso sin conexión y avisos push |
| `supabase/schema.sql` | Tablas de la base de datos |
| `scripts/send-reminders.mjs` + `.github/workflows/recordatorios.yml` | Envío de recordatorios push cada 15 min |

Colores de marca: violeta `#5e35b1`, violeta noche `#2d1b69`, lavanda `#d1c4e9` / `#f3f0ff`, magenta `#dc0c89`. Tipografía Montserrat.
