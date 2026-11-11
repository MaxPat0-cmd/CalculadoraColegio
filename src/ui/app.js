import { h, clear } from './dom.js';
import { createTabs } from './tabs.js';
import { fadeUp, installPress } from './motion.js';
import { closeSheet } from './sheet.js';
import { Store, MemoryAdapter } from '../store.js';
import { APP_VERSION } from '../models.js';
import { createDefaultRegistry } from '../evaluation.js';
import { loadUi, normalizeConfig, saveUi } from './config.js';
import { captureStudentView } from './views/captureStudent.js';
import { captureSubjectView } from './views/captureSubject.js';
import { controlView } from './views/control.js';
import { catalogsView } from './views/catalogs.js';
import { backupView } from './views/backup.js';

function pickAdapter() {
  try {
    window.localStorage.setItem('alzate-probe', '1');
    window.localStorage.removeItem('alzate-probe');
    return { adapter: window.localStorage, volatile: false };
  } catch {
    return { adapter: new MemoryAdapter(), volatile: true }; // almacenamiento bloqueado (p. ej. modo privado)
  }
}
const { adapter, volatile } = pickAdapter();
const store = new Store(adapter);
if (volatile) store.loadWarning = 'El navegador bloquea el almacenamiento local: los cambios se perderán al cerrar la pestaña. Exporta un respaldo con frecuencia.';
const ctx = { store, registry: createDefaultRegistry(), ui: { config: loadUi() } };
ctx.ui.config = normalizeConfig(store.state, ctx.ui.config);
saveUi(ctx.ui.config);

const ROUTES = [
  ['alumno', 'Captura por alumno', captureStudentView],
  ['asignatura', 'Captura por asignatura', captureSubjectView],
  ['control', 'Control Escolar', controlView],
  ['catalogos', 'Catálogos', catalogsView],
  ['respaldos', 'Respaldos', backupView],
];

document.getElementById('app-version').textContent = APP_VERSION;
const main = document.getElementById('main');
const nav = document.getElementById('nav');
const tabs = createTabs(nav, ROUTES);
installPress();
let current = null;
let lastRoute = null;

function parseHash() {
  const [name, ...rest] = (location.hash.replace(/^#/, '') || 'alumno').split('/');
  const route = ROUTES.find((r) => r[0] === name) ?? ROUTES[0];
  return { route, param: rest.join('/') };
}

function render() {
  const { route, param } = parseHash();
  ctx.ui.config = normalizeConfig(store.state, ctx.ui.config);
  if (route[0] !== 'control') closeSheet({ silent: true, instant: true });
  tabs.setActive(route[0]);
  clear(main);
  if (store.loadWarning) main.append(h('p', { class: 'banner warn', role: 'alert' }, store.loadWarning));
  current = route[2](ctx, param);
  main.append(current.el);
  if (lastRoute !== route[0]) fadeUp(current.el); // la vista nueva entra con un resorte; abrir una hoja no re-anima el listado
  document.title = `${route[1]} — Calculadora Académica Alzate (demo)`;
}

window.addEventListener('hashchange', () => {
  const prev = lastRoute;
  const { route } = parseHash();
  render();
  if (prev !== route[0]) { main.focus({ preventScroll: true }); window.scrollTo(0, 0); }
  lastRoute = route[0];
});
// Cambios hechos en otra pestaña: recarga el estado y redibuja si no se está escribiendo.
window.addEventListener('storage', (e) => {
  if (e.key !== null && !e.key.startsWith('alzate-calculadora-v0.1')) return;
  if (document.activeElement?.tagName === 'INPUT') return;
  store.reload();
  render();
});
// Borde de scroll: la barra translúcida gana definición solo cuando hay contenido debajo.
const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 4);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();
render();
lastRoute = parseHash().route[0];
window.__alzate = { store, ctx }; // útil para depuración en consola
