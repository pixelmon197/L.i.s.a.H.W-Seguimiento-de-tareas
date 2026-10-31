# Parte 3 · Pruebas

Llena la columna **Resultado obtenido** y **Estado** al ejecutar cada prueba, y guarda una captura como evidencia.

## Cómo simular las condiciones

- **Sin conexión:** Chrome → DevTools (F12) → *Network* → *Throttling* → **Offline** (o *Application* → *Service Workers* → *Offline*). En el celular, modo avión.
- **Sin servidor pero con red:** abrir la PWA desde GitHub Pages, o detener `npm start` tras cargar la página.
- **Permisos:** icono del candado junto a la URL → *Configuración del sitio* → Ubicación / Notificaciones → *Restablecer*.
- **Ver datos locales:** DevTools → *Application* → *IndexedDB* → `tareas-pwa` → `tasks`.
- **Ver caché:** DevTools → *Application* → *Cache storage* → `tareas-pwa-v3`.
- **Ver datos del servidor:** archivo `data/tasks.json` o `http://localhost:3000/api/tasks`.

## Tabla de pruebas

| # | Prueba | Resultado esperado | Resultado obtenido | Estado | Evidencia |
|---|---|---|---|:-:|---|
| 1 | Registrar una tarea con conexión. | La tarea aparece en el listado. | | | |
| 2 | Registrar una tarea sin conexión. | La tarea queda guardada localmente. | | | |
| 3 | Cerrar y abrir la aplicación sin conexión. | Las tareas almacenadas siguen disponibles. | | | |
| 4 | Recuperar la conexión. | Los cambios pendientes se sincronizan, si existe servidor. | | | |
| 5 | Autorizar la geolocalización. | Se obtiene y registra la ubicación cuando está disponible. | | | |
| 6 | Denegar la geolocalización. | La aplicación sigue permitiendo registrar tareas sin ubicación. | | | |
| 7 | Activar un aviso local. | Se muestra el aviso después de contar con el permiso correspondiente. | | | |

## Pruebas adicionales recomendadas

| # | Prueba | Resultado esperado | Resultado obtenido | Estado |
|---|---|---|---|:-:|
| 8 | Editar una tarea y guardar. | Los cambios se reflejan y la tarea queda "Pendiente de sincronizar". | | |
| 9 | Sincronizar dos veces la misma tarea. | No se crean duplicados en el servidor (mismo `id`). | | |
| 10 | Eliminar una tarea sin conexión y reconectar. | Se elimina del servidor y de IndexedDB tras la confirmación. | | |
| 11 | Consultar una tarea pendiente con avisos activados. | Se muestra el aviso "Tarea pendiente: …". | | |
| 12 | Abrir la app sin conexión por primera vez tras haberla visitado online. | Carga el app shell desde la caché del Service Worker. | | |
| 13 | Instalar la PWA. | Se instala y abre en ventana independiente. | | |

## Verificación del servidor (ya ejecutada durante el desarrollo)

| Prueba | Resultado |
|---|---|
| `GET /api/health` | 200 `{ "ok": true }` |
| `POST /api/tasks/sync` con la misma tarea dos veces | Ambas confirman el id; el servidor mantiene 1 registro |
| `POST /api/tasks/sync` con tarea inválida (sin título/fecha) | Se ignora (no se confirma) |
| `POST /api/tasks/sync` con JSON roto | 400 `{ "error": "JSON inválido" }` |
| Envío de tombstone (`deleted: true`) | El servidor conserva el registro marcado como eliminado |
| Intento de salir de `/public` (`/../server.js`) | 404 |

## Auditoría PWA (opcional)

DevTools → *Lighthouse* → categoría **Progressive Web App** (o *Application* → *Manifest* para revisar instalabilidad). Anota el resultado y adjunta la captura.
