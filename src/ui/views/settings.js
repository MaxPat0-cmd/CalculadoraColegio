// "Ajustes": catálogos y respaldos bajo una sola entrada de navegación.
import { h, clear, put } from '../dom.js';
import { segmented } from '../segmented.js';
import { slideIn } from '../motion.js';
import { catalogsView } from './catalogs.js';
import { backupView } from './backup.js';

export function settingsView(ctx) {
  const root = h('div', { class: 'view' });
  const host = h('div', { class: 'view' });
  let tab = ctx.ui.settingsTab === 'respaldos' ? 'respaldos' : 'catalogos';
  let child = null;
  const mount = (dir) => {
    child = (tab === 'catalogos' ? catalogsView : backupView)(ctx);
    clear(host).append(child.el);
    if (dir) slideIn(child.el, dir, 28);
  };
  const seg = segmented({
    label: 'Sección de ajustes', value: tab,
    options: [{ value: 'catalogos', label: 'Catálogos' }, { value: 'respaldos', label: 'Respaldos' }],
    onChange: (v) => { const dir = v === 'respaldos' ? 1 : -1; tab = v; ctx.ui.settingsTab = v; mount(dir); },
  });
  put(root,
    h('section', { class: 'page-head' },
      h('div', null, h('h2', null, 'Ajustes'), h('p', { class: 'lede' }, 'Alumnos, docentes, asignaturas y niveles; respaldos y almacenamiento.')), seg),
    host);
  mount(0);
  return { el: root, refresh: () => child?.refresh?.() };
}
