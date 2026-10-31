// Avisos locales (Notifications API).
// Se muestran a través del Service Worker (showNotification), que es lo que
// funciona en Android; si no hay Service Worker se usa el constructor Notification.
// IMPORTANTE: solo se muestran avisos mientras la app los dispara (al registrar o
// consultar una tarea). No se usan temporizadores para avisos futuros.

export function supported() {
  return 'Notification' in window;
}

export function permission() {
  return supported() ? Notification.permission : 'unsupported'; // granted | denied | default
}

/** Debe llamarse desde un gesto del usuario (clic). */
export async function request() {
  if (!supported()) return 'unsupported';
  return Notification.requestPermission();
}

/** Muestra un aviso si hay permiso. Devuelve true si se mostró. */
export async function show(title, body, tag) {
  if (permission() !== 'granted') return false;
  const options = {
    body,
    tag,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { url: './' },
  };
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg) await reg.showNotification(title, options);
    else new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}
