// Capa de acceso a IndexedDB.
// Base: "tareas-pwa"  |  Almacén: "tasks" (keyPath: id)
//
// Cada tarea:
//   id          UUID generado en el cliente (evita duplicados al sincronizar)
//   title, description, dueDate (ISO), status, place
//   location    { lat, lng, accuracy, timestamp } | null
//   createdAt, updatedAt (ISO)
//   deleted     true = eliminada localmente, pendiente de confirmar en el servidor
//   syncStatus  "pending" | "synced"

const DB_NAME = 'tareas-pwa';
const DB_VERSION = 1;
const STORE = 'tasks';

let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('status', 'status');
          store.createIndex('syncStatus', 'syncStatus');
          store.createIndex('dueDate', 'dueDate');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function run(mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        let result;
        const req = fn(store);
        if (req) req.onsuccess = () => (result = req.result);
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

export const getAll = () => run('readonly', (s) => s.getAll());
export const get = (id) => run('readonly', (s) => s.get(id));
export const put = (task) => run('readwrite', (s) => s.put(task));
export const remove = (id) => run('readwrite', (s) => s.delete(id));
