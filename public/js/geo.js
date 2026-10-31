// Geolocalización. El permiso se solicita únicamente al llamar a getPosition(),
// que la interfaz ejecuta como respuesta a un clic del usuario.

export function supported() {
  return 'geolocation' in navigator;
}

export async function permissionState() {
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state; // "granted" | "denied" | "prompt"
  } catch {
    return 'unknown';
  }
}

/** Resuelve { lat, lng, accuracy, timestamp } o rechaza con { code, message }.
 *  code: 0 no soportado, 1 permiso denegado, 2 posición no disponible, 3 tiempo agotado */
export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!supported()) return reject({ code: 0, message: 'Geolocalización no soportada' });
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        }),
      (err) => reject({ code: err.code, message: err.message }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}

export function mapUrl(loc) {
  return `https://www.openstreetmap.org/?mlat=${loc.lat}&mlon=${loc.lng}#map=17/${loc.lat}/${loc.lng}`;
}
