// Sincronización con el servidor (opcional).
//
// 1. Se envían las tareas con syncStatus = "pending" (incluidas las eliminadas).
// 2. El servidor responde con los ids que confirmó. SOLO esos se marcan como "synced"
//    (o se purgan, si estaban eliminadas). Si la petición falla, siguen pendientes.
// 3. Si una tarea se editó mientras la petición estaba en vuelo (updatedAt distinto),
//    se queda pendiente para el siguiente ciclo.
// 4. Se mezclan los cambios del servidor (gana el updatedAt más reciente).
//
// Como el id es un UUID creado en el cliente y el servidor hace "upsert" por id,
// reintentar el envío nunca genera duplicados.

import { API_BASE } from './config.js';
import * as db from './db.js';

export async function serverAvailable() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(`${API_BASE}/api/health`, { cache: 'no-store', signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** @returns {Promise<{ok:boolean, reason?:string, sent?:number}>} */
export async function sync() {
  if (!navigator.onLine) return { ok: false, reason: 'offline' };
  if (!(await serverAvailable())) return { ok: false, reason: 'no-server' };

  const before = await db.getAll();
  const pending = before.filter((t) => t.syncStatus === 'pending');

  let data;
  try {
    const res = await fetch(`${API_BASE}/api/tasks/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tasks: pending.map(stripLocal) }),
    });
    if (!res.ok) return { ok: false, reason: 'server-error' };
    data = await res.json();
  } catch {
    return { ok: false, reason: 'network-error' };
  }

  const confirmed = new Set(data.confirmed || []);
  const current = new Map((await db.getAll()).map((t) => [t.id, t]));

  // 2 y 3: confirmar lo enviado
  for (const sent of pending) {
    if (!confirmed.has(sent.id)) continue;
    const now = current.get(sent.id);
    if (!now || now.updatedAt !== sent.updatedAt) continue;
    if (sent.deleted) {
      await db.remove(sent.id);
      current.delete(sent.id);
    } else {
      const updated = { ...now, syncStatus: 'synced' };
      await db.put(updated);
      current.set(sent.id, updated);
    }
  }

  // 4: traer cambios del servidor
  for (const remote of data.tasks || []) {
    const local = current.get(remote.id);
    if (!local) {
      if (!remote.deleted) await db.put({ ...remote, syncStatus: 'synced' });
    } else if (local.syncStatus === 'synced' && remote.updatedAt > local.updatedAt) {
      if (remote.deleted) await db.remove(remote.id);
      else await db.put({ ...remote, syncStatus: 'synced' });
    }
  }

  return { ok: true, sent: confirmed.size };
}

function stripLocal(task) {
  const { syncStatus, ...rest } = task; // syncStatus es un dato local
  return rest;
}
