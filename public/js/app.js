import * as db from './db.js';
import * as geo from './geo.js';
import * as notify from './notify.js';
import { sync } from './sync.js';

const $ = (sel) => document.querySelector(sel);

const STATUS_LABEL = { pendiente: 'Pendiente', en_progreso: 'En progreso', completada: 'Completada' };

const form = $('#taskForm');
let tasks = [];
let editingId = null;
let currentLocation = null;
let serverState = 'unknown'; // "ok" | "none" | "unknown"
let syncing = false;

// ---------- Utilidades ----------
function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (value !== undefined && value !== null && value !== false) node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined) continue;
    node.append(child.nodeType ? child : document.createTextNode(child));
  }
  return node;
}

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

function toLocalInput(iso) {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

const isOpen = (t) => t.status !== 'completada';
const isLate = (t) => isOpen(t) && new Date(t.dueDate) < new Date();
const fmtCoords = (loc) => `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`;

function showBanner(text) {
  const banner = $('#banner');
  banner.textContent = text;
  banner.hidden = !text;
}

// ---------- Estado de conexión ----------
function renderConnection() {
  const badge = $('#conn');
  if (!navigator.onLine) {
    badge.textContent = 'Sin conexión';
    badge.className = 'badge badge-off';
  } else if (serverState === 'ok') {
    badge.textContent = 'En línea · servidor conectado';
    badge.className = 'badge badge-on';
  } else if (serverState === 'none') {
    badge.textContent = 'En línea · sin servidor';
    badge.className = 'badge badge-muted';
  } else {
    badge.textContent = 'En línea';
    badge.className = 'badge badge-on';
  }

  const pending = tasks.filter((t) => t.syncStatus === 'pending').length;
  const pill = $('#pendingSync');
  pill.hidden = pending === 0;
  pill.textContent = `${pending} pendiente${pending === 1 ? '' : 's'} de sincronizar`;
}

async function trySync() {
  if (syncing) return;
  syncing = true;
  try {
    const result = await sync();
    if (result.ok) serverState = 'ok';
    else if (result.reason === 'no-server' || result.reason === 'server-error' || result.reason === 'network-error') serverState = 'none';
    await load();
  } finally {
    syncing = false;
    renderConnection();
  }
}

// ---------- Datos ----------
async function load() {
  tasks = await db.getAll();
  render();
  renderConnection();
}

// ---------- Interfaz de listado ----------
function render() {
  const filter = $('#filter').value;
  const visible = tasks
    .filter((t) => !t.deleted)
    .filter((t) => (filter === 'pendientes' ? isOpen(t) : filter === 'completada' ? !isOpen(t) : true))
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  const list = $('#list');
  list.replaceChildren(...visible.map(renderTask));
  $('#empty').hidden = visible.length > 0;
}

function renderTask(t) {
  const late = isLate(t);
  const meta = [
    el('span', {}, `Vence: ${fmtDate(t.dueDate)}`),
    el('span', { class: `badge ${late ? 'badge-late' : t.status === 'completada' ? 'badge-on' : 'badge-muted'}` }, late ? 'Vencida' : STATUS_LABEL[t.status]),
    el('span', { class: `badge ${t.syncStatus === 'pending' ? 'badge-warn' : 'badge-on'}` }, t.syncStatus === 'pending' ? 'Pendiente de sincronizar' : 'Sincronizada'),
  ];

  const where = [];
  if (t.place) where.push(`📍 ${t.place}`);
  const placeLine = where.length || t.location
    ? el('p', { class: 'task-meta' },
        where.join(' '),
        t.location
          ? el('a', { href: geo.mapUrl(t.location), target: '_blank', rel: 'noopener' }, `Coordenadas: ${fmtCoords(t.location)}`)
          : null)
    : null;

  return el('li', { class: `task${t.status === 'completada' ? ' done' : ''}${late ? ' late' : ''}` },
    el('h3', { class: 'task-title' }, t.title),
    el('div', { class: 'task-meta' }, ...meta),
    t.description ? el('p', { class: 'task-desc' }, t.description) : null,
    placeLine,
    el('div', { class: 'task-actions' },
      el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => openDetail(t) }, 'Consultar'),
      el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => startEdit(t) }, 'Editar'),
      t.status !== 'completada'
        ? el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => setStatus(t, 'completada') }, 'Completar')
        : el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => setStatus(t, 'pendiente') }, 'Reabrir'),
      el('button', { class: 'btn btn-danger', type: 'button', onclick: () => removeTask(t) }, 'Eliminar')
    )
  );
}

// ---------- Consulta de una tarea (+ aviso local si está pendiente) ----------
async function openDetail(t) {
  $('#detailTitle').textContent = t.title;
  const rows = [
    ['Descripción', t.description || '—'],
    ['Fecha límite', fmtDate(t.dueDate)],
    ['Estado', isLate(t) ? `${STATUS_LABEL[t.status]} (vencida)` : STATUS_LABEL[t.status]],
    ['Lugar', t.place || '—'],
    ['Coordenadas', t.location ? fmtCoords(t.location) : 'Sin ubicación'],
    ['Sincronización', t.syncStatus === 'pending' ? 'Pendiente' : 'Sincronizada'],
  ];
  $('#detailBody').replaceChildren(...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]));
  $('#detail').showModal();

  if (isOpen(t)) {
    await notify.show(`Tarea pendiente: ${t.title}`, `Vence ${fmtDate(t.dueDate)}`, `task-${t.id}`);
  }
}

// ---------- Alta / edición ----------
function resetForm() {
  form.reset();
  editingId = null;
  currentLocation = null;
  $('#formTitle').textContent = 'Nueva tarea';
  $('#btnSave').textContent = 'Guardar tarea';
  $('#btnCancel').hidden = true;
  renderGeo();
}

function startEdit(t) {
  editingId = t.id;
  $('#title').value = t.title;
  $('#description').value = t.description || '';
  $('#dueDate').value = toLocalInput(t.dueDate);
  $('#status').value = t.status;
  $('#place').value = t.place || '';
  currentLocation = t.location || null;
  $('#formTitle').textContent = 'Editar tarea';
  $('#btnSave').textContent = 'Guardar cambios';
  $('#btnCancel').hidden = false;
  renderGeo();
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('#title').focus();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const title = $('#title').value.trim();
  if (!title) return;

  const now = new Date().toISOString();
  const existing = editingId ? await db.get(editingId) : null;

  const task = {
    id: existing ? existing.id : uuid(),
    title,
    description: $('#description').value.trim(),
    dueDate: new Date($('#dueDate').value).toISOString(),
    status: $('#status').value,
    place: $('#place').value.trim(),
    location: currentLocation,
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
    deleted: false,
    syncStatus: 'pending',
  };

  await db.put(task);
  resetForm();
  await load();

  const shown = await notify.show(
    existing ? 'Tarea actualizada' : 'Tarea registrada',
    `${task.title} · vence ${fmtDate(task.dueDate)}`,
    `task-${task.id}`
  );
  if (!shown && notify.permission() === 'default') {
    showBanner('Tarea guardada. Pulsa "Activar avisos" si quieres recibir avisos al registrar tareas.');
  } else {
    showBanner('');
  }

  trySync();
});

$('#btnCancel').addEventListener('click', resetForm);

async function setStatus(t, status) {
  await db.put({ ...t, status, updatedAt: new Date().toISOString(), syncStatus: 'pending' });
  await load();
  trySync();
}

async function removeTask(t) {
  if (!confirm(`¿Eliminar la tarea "${t.title}"?`)) return;
  // Borrado lógico: la tarea puede existir ya en el servidor, así que se marca como
  // eliminada y se purga localmente cuando el servidor lo confirma.
  await db.put({ ...t, deleted: true, updatedAt: new Date().toISOString(), syncStatus: 'pending' });
  if (editingId === t.id) resetForm();
  await load();
  trySync();
}

$('#filter').addEventListener('change', render);

// ---------- Geolocalización ----------
function renderGeo() {
  const info = $('#geoInfo');
  if (currentLocation) {
    info.textContent = `Ubicación registrada: ${fmtCoords(currentLocation)} (±${Math.round(currentLocation.accuracy || 0)} m)`;
  } else {
    info.textContent = 'Sin ubicación registrada.';
  }
  $('#btnGeoClear').hidden = !currentLocation;
}

$('#btnGeo').addEventListener('click', async () => {
  const button = $('#btnGeo');
  const info = $('#geoInfo');
  button.disabled = true;
  info.textContent = 'Solicitando ubicación…';
  try {
    currentLocation = await geo.getPosition();
    renderGeo();
  } catch (err) {
    currentLocation = null;
    renderGeo();
    const messages = {
      0: 'Tu dispositivo no soporta geolocalización. Puedes guardar la tarea sin ubicación.',
      1: 'Permiso de ubicación denegado. Puedes guardar la tarea sin ubicación.',
      2: 'No se pudo determinar la ubicación. Puedes guardar la tarea sin ubicación.',
      3: 'Se agotó el tiempo para obtener la ubicación. Puedes intentarlo de nuevo o guardar sin ubicación.',
    };
    info.textContent = messages[err.code] || messages[2];
  } finally {
    button.disabled = false;
  }
});

$('#btnGeoClear').addEventListener('click', () => {
  currentLocation = null;
  renderGeo();
});

// ---------- Avisos ----------
function renderNotifButton() {
  const button = $('#btnNotif');
  const perm = notify.permission();
  if (perm === 'granted') {
    button.textContent = 'Avisos activados';
    button.disabled = true;
  } else if (perm === 'denied') {
    button.textContent = 'Avisos bloqueados';
    button.disabled = true;
    button.title = 'Habilita las notificaciones en la configuración del navegador.';
  } else if (perm === 'unsupported') {
    button.hidden = true;
  } else {
    button.textContent = 'Activar avisos';
    button.disabled = false;
  }
}

$('#btnNotif').addEventListener('click', async () => {
  await notify.request();
  renderNotifButton();
  if (notify.permission() === 'granted') {
    await notify.show('Avisos activados', 'Recibirás avisos al registrar o consultar tareas.', 'avisos-on');
    showBanner('');
  }
});

// Al abrir la app: resumen de tareas próximas a vencer (solo mientras la app está abierta).
async function checkDueSoon() {
  const limit = Date.now() + 24 * 60 * 60 * 1000;
  const due = tasks.filter((t) => !t.deleted && isOpen(t) && new Date(t.dueDate).getTime() <= limit);
  if (!due.length) return;
  const text = `Tienes ${due.length} tarea${due.length === 1 ? '' : 's'} pendiente${due.length === 1 ? '' : 's'} vencida${due.length === 1 ? '' : 's'} o por vencer en 24 h.`;
  showBanner(text);

  let alreadyShown = false;
  try { alreadyShown = sessionStorage.getItem('dueSoonShown') === '1'; } catch { /* sin storage */ }
  if (!alreadyShown) {
    const ok = await notify.show('Tareas por vencer', text, 'due-soon');
    if (ok) {
      try { sessionStorage.setItem('dueSoonShown', '1'); } catch { /* sin storage */ }
    }
  }
}

// ---------- Instalación de la PWA ----------
let installEvent = null;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installEvent = event;
  $('#btnInstall').hidden = false;
});
$('#btnInstall').addEventListener('click', async () => {
  if (!installEvent) return;
  installEvent.prompt();
  await installEvent.userChoice;
  installEvent = null;
  $('#btnInstall').hidden = true;
});

// ---------- Service Worker ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.error('SW no registrado', err));
  });
}

// ---------- Arranque ----------
window.addEventListener('online', () => { renderConnection(); trySync(); });
window.addEventListener('offline', () => { serverState = 'unknown'; renderConnection(); });

(async function init() {
  renderNotifButton();
  renderGeo();
  await load();
  await checkDueSoon();
  trySync();
})();
