// Servidor sin dependencias: sirve la PWA (carpeta /public) y expone una API mínima
// para sincronizar tareas. Los datos se guardan en data/tasks.json.
//
//   GET  /api/health       -> { ok: true }
//   GET  /api/tasks        -> lista completa (incluye tareas eliminadas como "tombstones")
//   POST /api/tasks/sync   -> { tasks: [...] }  =>  { confirmed: [ids], tasks: [...] }
//
// La sincronización es idempotente: el id de cada tarea lo genera el cliente (UUID),
// por lo que reenviar la misma tarea nunca crea duplicados.

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'tasks.json');
const PORT = process.env.PORT || 3000;
const MAX_BODY = 1024 * 1024; // 1 MB

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// ---------- Persistencia (archivo JSON con escritura serializada) ----------
let queue = Promise.resolve();
function withLock(fn) {
  const run = queue.then(fn);
  queue = run.catch(() => {});
  return run;
}

async function readDB() {
  try {
    return JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
  } catch {
    return {};
  }
}

async function writeDB(db) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(db, null, 2));
  await fs.rename(tmp, DATA_FILE);
}

// ---------- Validación ----------
const STATUSES = ['pendiente', 'en_progreso', 'completada'];
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

function sanitizeTask(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = str(raw.id, 100);
  const title = str(raw.title, 200).trim();
  const updatedAt = str(raw.updatedAt, 40);
  if (!id || !updatedAt || Number.isNaN(Date.parse(updatedAt))) return null;
  if (!title && !raw.deleted) return null;

  let location = null;
  if (raw.location && Number.isFinite(raw.location.lat) && Number.isFinite(raw.location.lng)) {
    location = {
      lat: raw.location.lat,
      lng: raw.location.lng,
      accuracy: Number.isFinite(raw.location.accuracy) ? raw.location.accuracy : null,
      timestamp: Number.isFinite(raw.location.timestamp) ? raw.location.timestamp : null,
    };
  }

  return {
    id,
    title,
    description: str(raw.description, 2000),
    dueDate: str(raw.dueDate, 40),
    status: STATUSES.includes(raw.status) ? raw.status : 'pendiente',
    place: str(raw.place, 200),
    location,
    createdAt: str(raw.createdAt, 40) || updatedAt,
    updatedAt,
    deleted: raw.deleted === true,
  };
}

// ---------- Utilidades HTTP ----------
function send(res, status, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    ...headers,
  });
  res.end(isObj ? JSON.stringify(body) : body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Payload demasiado grande'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// ---------- API ----------
async function handleApi(req, res, pathname) {
  if (req.method === 'OPTIONS') return send(res, 204, '');

  if (pathname === '/api/health' && req.method === 'GET') {
    return send(res, 200, { ok: true, time: new Date().toISOString() }, { 'Cache-Control': 'no-store' });
  }

  if (pathname === '/api/tasks' && req.method === 'GET') {
    const db = await readDB();
    return send(res, 200, { tasks: Object.values(db) }, { 'Cache-Control': 'no-store' });
  }

  if (pathname === '/api/tasks/sync' && req.method === 'POST') {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (err) {
      return send(res, err.status || 400, { error: err.status === 413 ? 'Payload demasiado grande' : 'JSON inválido' });
    }
    if (!body || !Array.isArray(body.tasks)) return send(res, 400, { error: 'Se esperaba { tasks: [] }' });

    const result = await withLock(async () => {
      const db = await readDB();
      const confirmed = [];
      for (const raw of body.tasks) {
        const t = sanitizeTask(raw);
        if (!t) continue;
        const current = db[t.id];
        // Gana la versión más reciente (last-write-wins). Reenviar la misma tarea es inofensivo.
        if (!current || current.updatedAt <= t.updatedAt) db[t.id] = t;
        confirmed.push(t.id);
      }
      await writeDB(db);
      return { confirmed, tasks: Object.values(db) };
    });
    return send(res, 200, result, { 'Cache-Control': 'no-store' });
  }

  return send(res, 404, { error: 'Ruta no encontrada' });
}

// ---------- Archivos estáticos ----------
async function handleStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Método no permitido');

  let rel = decodeURIComponent(pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Prohibido');

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    // El Service Worker nunca debe quedar en caché HTTP para que las actualizaciones se detecten.
    const cache = path.basename(filePath) === 'sw.js' ? 'no-cache' : 'public, max-age=0, must-revalidate';
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    send(res, 404, 'No encontrado');
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname);
    return await handleStatic(req, res, pathname);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) send(res, 500, { error: 'Error interno' });
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log(`PWA de tareas en http://localhost:${PORT}`);
});
