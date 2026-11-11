import { h, clear } from './dom.js';
import { Store, MemoryAdapter } from '../store.js';
import { APP_VERSION } from '../models.js';
import { createDefaultRegistry } from '../evaluation.js';
import { profileLabel, startHash } from '../onboarding.js';
import { loadUi, normalizeConfig, saveUi } from './config.js';
import { loadProfile, saveProfile } from './profile.js';
import { createTabs } from './tabs.js';
import { slideIn, installPress, fadeUp } from './motion.js';
import { closeSheet } from './sheet.js';
import { openOnboarding } from './onboarding.js';
import { homeView } from './views/home.js';
import { captureView } from './views/capture.js';
import { controlView } from './views/control.js';
import { settingsView } from './views/settings.js';

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
const ctx = { store, registry: createDefaultRegistry(), ui: { config: loadUi() }, profile: loadProfile() };
// Perfil de una versión anterior con un nivel que ya no existe (CCH, universidad…): se vuelve a preguntar.
if (ctx.profile.role === 'docente' && !store.state.catalogs.levels.some((l) => l.id === ctx.profile.levelId)) { ctx.profile = { done: false }; saveProfile(ctx.profile); }
ctx.ui.config = normalizeConfig(store.state, ctx.ui.config);
saveUi(ctx.ui.config);

// Navegación simplificada: 4 destinos. Los enlaces antiguos siguen funcionando.
const ROUTES = [
  ['inicio', 'Inicio', homeView],
  ['capturar', 'Capturar', captureView],
  ['control', 'Control Escolar', controlView],
  ['ajustes', 'Ajustes', settingsView],
];
const ALIAS = { alumno: ['capturar', 'alumno'], asignatura: ['capturar', 'asignatura'], catalogos: ['ajustes', 'catalogos'], importar: ['ajustes', 'importar'], respaldos: ['ajustes', 'respaldos'] };

document.getElementById('app-version').textContent = APP_VERSION;
const main = document.getElementById('main');
const nav = document.getElementById('nav');
const shell = document.querySelector('header.shell');
const chip = document.getElementById('profile-chip');
const tabs = createTabs(nav, ROUTES);
installPress();
let lastRoute = null;

function parseHash() {
  let [name, ...rest] = (location.hash.replace(/^#/, '') || 'inicio').split('/');
  if (ALIAS[name]) {
    const [target, sub] = ALIAS[name];
    if (target === 'capturar') { ctx.profile.mode = sub; saveProfile(ctx.profile); } else ctx.ui.settingsTab = sub;
    history.replaceState(null, '', `#${target}`);
    name = target; rest = [];
  }
  const route = ROUTES.find((r) => r[0] === name) ?? ROUTES[0];
  return { route, param: rest.join('/') };
}

const updateChip = () => { chip.textContent = profileLabel(store.state, ctx.profile); };
ctx.openOnboarding = () => openOnboarding(ctx, { onDone });

function render() {
  const { route, param } = parseHash();
  ctx.ui.config = normalizeConfig(store.state, ctx.ui.config);
  if (route[0] !== 'control') closeSheet({ silent: true, instant: true });
  tabs.setActive(route[0]);
  updateChip();
  clear(main);
  if (store.loadWarning) main.append(h('p', { class: 'banner warn', role: 'alert' }, store.loadWarning));
  if (store.notice && ctx.profile.done) { // el aviso espera a que se cierre el onboarding para que se lea
    main.append(h('p', { class: 'banner info', role: 'status' }, store.notice)); store.notice = null;
  }
  const view = route[2](ctx, param);
  main.append(view.el);
  if (lastRoute !== route[0]) {
    // Trayectoria espacial coherente con el orden de las pestañas: hacia adelante entra por la derecha.
    const dir = lastRoute === null ? 0 : Math.sign(ROUTES.findIndex((r) => r[0] === route[0]) - ROUTES.findIndex((r) => r[0] === lastRoute));
    if (dir) slideIn(view.el, dir, 22); else fadeUp(view.el, { dy: 10 });
  }
  document.title = `${route[1]} — UA · Calculadora Académica Alzate (demo)`;
}

function onDone(hash) {
  updateChip();
  const target = hash ?? startHash(store.state, ctx.profile);
  if (location.hash === target) { render(); lastRoute = parseHash().route[0]; } else location.hash = target;
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
chip.addEventListener('click', () => ctx.openOnboarding());
// Borde de scroll: la barra de vidrio gana definición solo cuando hay contenido debajo.
const onScroll = () => shell.classList.toggle('scrolled', window.scrollY > 4);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

render();
lastRoute = parseHash().route[0];
if (!ctx.profile.done) openOnboarding(ctx, { onDone });
window.__alzate = { store, ctx }; // útil para depuración en consola
