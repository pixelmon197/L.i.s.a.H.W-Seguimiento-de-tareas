# L.i.s.a.H.W · PWA de seguimiento de tareas

Aplicación web progresiva (PWA) para registrar y consultar tareas con **fecha límite, lugar y coordenadas**, que funciona **sin conexión**, sincroniza con un servidor cuando hay conectividad y muestra **avisos locales**.

Actividad 12 · PWA para seguimiento de tareas con ubicación y avisos de vencimiento.

## Identidad visual

La interfaz sigue la temática del logo **L.i.s.a.H.W**: fondo negro con acentos turquesa neón (`#3de0cb`). El logo se usa como icono de la app (`public/icons/`) y en el encabezado. Los colores están definidos como variables al inicio de `public/css/styles.css`.

## Tecnologías

| Pieza | Uso |
|---|---|
| HTML + CSS + JavaScript (módulos ES) | Interfaz, sin frameworks ni dependencias |
| IndexedDB | Almacenamiento local de tareas |
| Service Worker + Cache API | App shell disponible sin conexión |
| Web App Manifest | Instalación como app |
| Geolocation API | Coordenadas de la tarea (con permiso) |
| Notifications API (vía Service Worker) | Avisos locales |
| Node.js (sin dependencias) | Servidor estático + API de sincronización |

## Ejecutar en local

Requiere Node.js 18 o superior.

```bash
npm start
# abre http://localhost:3000
```

`localhost` se considera contexto seguro, así que Service Worker, geolocalización y notificaciones funcionan sin HTTPS. En cualquier otro dominio se necesita **HTTPS**.

## Estructura

```
├── server.js                  # Servidor estático + API (/api/health, /api/tasks, /api/tasks/sync)
├── public/
│   ├── index.html             # Formulario y listado
│   ├── sw.js                  # Service Worker
│   ├── manifest.webmanifest
│   ├── css/styles.css
│   ├── icons/
│   └── js/
│       ├── app.js             # Lógica de interfaz
│       ├── db.js              # IndexedDB
│       ├── sync.js            # Sincronización con el servidor
│       ├── geo.js             # Geolocalización
│       ├── notify.js          # Avisos locales
│       └── config.js          # URL base de la API
└── docs/
    ├── DISENO.md              # Parte 1: datos, pantallas, esquema local/servidor
    └── PRUEBAS.md             # Parte 3: plan y reporte de pruebas
```

## Cómo cumple cada requerimiento

**Req. 1 · Registro y almacenamiento local.** Formulario para crear y editar tareas; los registros se guardan en IndexedDB y siguen ahí tras cerrar y abrir la app. El encabezado muestra el estado de conexión y cuántos cambios faltan por sincronizar.

**Req. 2 · Funcionamiento offline.**
- `sw.js` precarga los recursos esenciales; la app abre y se consulta sin internet.
- Cada alta, edición, cambio de estado o eliminación se marca `syncStatus: "pending"`.
- Al recuperar la conexión (evento `online`) o al abrir la app se envían los pendientes a `POST /api/tasks/sync`.
- **Sin duplicados:** el `id` es un UUID generado en el cliente y el servidor hace *upsert* por id. Una tarea solo pasa a `synced` cuando el servidor devuelve su id en `confirmed`.
- Si no hay servidor (por ejemplo, en GitHub Pages), la app funciona igual y los cambios quedan pendientes.

**Req. 3 · Geolocalización.** El permiso se pide solo al pulsar *Usar mi ubicación*. Si se deniega, falla o se agota el tiempo, se muestra un mensaje y la tarea se puede guardar sin ubicación. Las coordenadas se guardan con precisión y enlazan a OpenStreetMap.

**Req. 4 · Avisos.** Se muestra un aviso local al registrar o actualizar una tarea y al consultar una tarea pendiente (botón *Consultar*), siempre que el usuario haya concedido el permiso con *Activar avisos*. Al abrir la app también se resume cuántas tareas vencen en 24 h. **No se usan temporizadores para avisos futuros con la página cerrada.**

## Publicar

**Solo la PWA (GitHub Pages).** Sube el repositorio y activa Pages sobre la carpeta `/public` (Settings → Pages; si solo permite raíz o `/docs`, copia el contenido de `public/` a `docs/`). Todas las rutas son relativas, así que funciona en `usuario.github.io/repositorio/`. Allí no hay API: la app opera con IndexedDB y los cambios quedan "pendientes".

**PWA + API de sincronización (Render, Railway, Fly.io, etc.).** Crea un *Web Service* de Node con comando de inicio `npm start`. Si la PWA se aloja en un dominio y la API en otro, pon la URL de la API en `public/js/config.js` (`API_BASE`). El servidor ya permite CORS.

> Nota: en hosting gratuito el archivo `data/tasks.json` puede perderse al reiniciar. Para algo más que una práctica, sustituye el archivo por una base de datos.

## Ampliación: notificaciones push (opcional)

`sw.js` ya incluye el manejador del evento `push`. Para usarlo hace falta: generar claves VAPID, suscribir al usuario con `registration.pushManager.subscribe()`, guardar la suscripción en el servidor y enviar los avisos con una librería como `web-push` desde un proceso programado. Esto requiere HTTPS y soporte del navegador (en iOS, solo con la app instalada en pantalla de inicio).

## Limitaciones conocidas

- Los avisos de vencimiento futuros no se garantizan con la app cerrada (sin push).
- `navigator.onLine` indica que hay red, no que haya internet; por eso la app además consulta `/api/health`.
- Resolución de conflictos simple: gana la versión con `updatedAt` más reciente.
- El servidor no tiene autenticación ni usuarios; todas las tareas son compartidas.
- Notificaciones: algunos navegadores móviles solo las permiten con la app instalada y HTTPS.
- Tras cambiar archivos estáticos hay que subir `CACHE_VERSION` en `sw.js` para que los usuarios reciban la nueva versión.
