// "Ajustes": catálogos y respaldos bajo una sola entrada de navegación.
import { h, clear, put } from '../dom.js';
import { segmented } from '../segmented.js';
import { slideIn } from '../motion.js';
import { catalogsView } from './catalogs.js';
import { backupView } from './backup.js';
import { importActasView } from './importActas.js';

export function settingsView(ctx) {
  const root = h('div', { class: 'view' });
  const host = h('div', { class: 'view' });
  const VIEWS = { catalogos: catalogsView, importar: importActasView, respaldos: backupView };
  const ORDER = ['catalogos', 'importar', 'respaldos'];
  let tab = VIEWS[ctx.ui.settingsTab] ? ctx.ui.settingsTab : 'catalogos';
  let child = null;
  const mount = (dir) => {
    child = VIEWS[tab](ctx);
    clear(host).append(child.el);
    if (dir) slideIn(child.el, dir, 28);
  };
  const seg = segmented({
    label: 'Sección de ajustes', value: tab,
    options: [{ value: 'catalogos', label: 'Catálogos' }, { value: 'importar', label: 'Importar actas' }, { value: 'respaldos', label: 'Respaldos' }],
    onChange: (v) => { const dir = Math.sign(ORDER.indexOf(v) - ORDER.indexOf(tab)); tab = v; ctx.ui.settingsTab = v; mount(dir); },
  });
  put(root,
    h('section', { class: 'page-head' },
      h('div', null, h('h2', null, 'Ajustes'), h('p', { class: 'lede' }, 'Catálogos, importación de actas desde Excel, respaldos y almacenamiento.')), seg),
    host);
  mount(0);
  return { el: root, refresh: () => child?.refresh?.() };
}
