# Parte 1 · Diseño de la funcionalidad

> Tema visual: negro con acentos turquesa (`#3de0cb`), tomado del logo L.i.s.a.H.W.

## 1. Datos de cada tarea

| Campo | Tipo | Descripción | Local | Servidor |
|---|---|---|:-:|:-:|
| `id` | UUID (texto) | Identificador único creado en el cliente; evita duplicados | ✔ | ✔ |
| `title` | texto (≤120) | Título de la tarea (obligatorio) | ✔ | ✔ |
| `description` | texto (≤1000) | Descripción de la actividad | ✔ | ✔ |
| `dueDate` | fecha ISO 8601 | Fecha y hora límite (obligatoria) | ✔ | ✔ |
| `status` | `pendiente` · `en_progreso` · `completada` | Estado | ✔ | ✔ |
| `place` | texto | Nombre del lugar (opcional) | ✔ | ✔ |
| `location` | `{lat, lng, accuracy, timestamp}` o `null` | Coordenadas del dispositivo (opcional) | ✔ | ✔ |
| `createdAt` | fecha ISO | Creación | ✔ | ✔ |
| `updatedAt` | fecha ISO | Última modificación; decide conflictos | ✔ | ✔ |
| `deleted` | booleano | Borrado lógico hasta que el servidor lo confirma | ✔ | ✔ (tombstone) |
| `syncStatus` | `pending` · `synced` | Estado de sincronización | ✔ | ✘ (dato local) |

## 2. Pantallas

### Pantalla única: formulario + listado

```
┌──────────────────────────────────────────────────────┐
│ Mis tareas   [En línea · servidor] [2 pendientes de  │
│              sincronizar] [Activar avisos] [Instalar]│
├──────────────────────────────────────────────────────┤
│ ⚠ Tienes 1 tarea vencida o por vencer en 24 h.       │
├──────────────────────────────────────────────────────┤
│ NUEVA TAREA / EDITAR TAREA                           │
│ Título *        [______________________________]     │
│ Descripción     [______________________________]     │
│ Fecha límite *  [__/__/____ __:__]  Estado [▼]       │
│ Lugar           [______________________________]     │
│ ┌ Ubicación ───────────────────────────────────┐     │
│ │ [Usar mi ubicación] [Quitar ubicación]       │     │
│ │ Ubicación registrada: 19.28, -99.65 (±12 m)  │     │
│ └──────────────────────────────────────────────┘     │
│ [Guardar tarea] [Cancelar edición]                   │
├──────────────────────────────────────────────────────┤
│ LISTADO DE TAREAS                 Mostrar [Todas ▼]  │
│ ┌──────────────────────────────────────────────┐     │
│ │ Entregar reporte                             │     │
│ │ Vence: 1 nov 2026 10:00 [Pendiente][Sincron.]│     │
│ │ 📍 Biblioteca  Coordenadas: 19.28, -99.65    │     │
│ │ [Consultar] [Editar] [Completar] [Eliminar]  │     │
│ └──────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────┘
```

> Sustituye este boceto por las capturas reales de la app en el documento final.

## 3. Esquema de almacenamiento: local vs. servidor

```
        DISPOSITIVO (siempre disponible)                       SERVIDOR (cuando hay conexión)
┌────────────────────────────────────────────┐          ┌──────────────────────────────────┐
│ Cache API (Service Worker)                 │          │ Archivos estáticos de /public     │
│  · index.html, CSS, JS, iconos, manifest   │ ◄──────  │ (se descargan una vez y se        │
│                                            │  1ª carga│  actualizan en segundo plano)     │
├────────────────────────────────────────────┤          ├──────────────────────────────────┤
│ IndexedDB "tareas-pwa" / almacén "tasks"   │          │ data/tasks.json                   │
│  · TODAS las tareas con syncStatus         │ ───────► │  · Tareas confirmadas             │
│    pending | synced                        │ POST     │  · Tombstones de eliminadas       │
│  · Ubicación y avisos se generan aquí      │ /api/    │  · Resuelve duplicados por id     │
│                                            │ tasks/   │    y conflictos por updatedAt     │
│                                            │ sync     │                                   │
│                                            │ ◄─────── │ Responde: ids confirmados +       │
│                                            │ respuesta│ lista completa de tareas          │
└────────────────────────────────────────────┘          └──────────────────────────────────┘
```

**Flujo de sincronización**

1. El usuario crea/edita/elimina → se guarda en IndexedDB con `syncStatus = "pending"` (sin importar si hay conexión).
2. Al abrir la app, al recuperar conexión o tras cada cambio, se comprueba `navigator.onLine` y `GET /api/health`.
3. Si hay servidor: se envían las tareas `pending` a `POST /api/tasks/sync`.
4. El servidor hace *upsert* por `id` y responde con los ids confirmados.
5. Solo las tareas confirmadas pasan a `synced` (las eliminadas se borran de IndexedDB). Si algo falla, siguen `pending` y se reintenta.
6. Se incorporan los cambios del servidor cuando su `updatedAt` es más reciente.

**Qué NO se guarda en el servidor:** `syncStatus`, el permiso de notificaciones/ubicación ni la caché de recursos.
