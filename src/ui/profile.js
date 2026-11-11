// Preferencias de uso del dispositivo (rol, nivel, docente, modalidad). No es una cuenta ni forma parte de los respaldos.
const KEY = 'alzate-profile-v1';

export function loadProfile() {
  try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; }
}
export function saveProfile(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* opcional */ }
}
