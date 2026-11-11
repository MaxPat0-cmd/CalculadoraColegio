// Utilidades mínimas de DOM (sin framework).
import { makeSpring } from './motion.js';
import { clamp } from '../physics.js';

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (k in el && k !== 'list' && k !== 'form') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Como append(), pero ignora null/false y aplana arreglos (append nativo escribiría "null"). */
export function put(parent, ...children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    parent.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return parent;
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

export function announce(msg) {
  const live = document.getElementById('live');
  if (live) { live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 20); }
}

// Un único aviso a la vez: si llega otro mientras está visible, se actualiza el texto y el resorte sigue continuo
// (sin cortes ni apilados que tapen la tabla de captura).
const T = { el: null, spring: null, timer: null };

export function toast(msg, kind = 'ok') {
  announce(msg);
  const box = document.getElementById('toasts');
  if (!T.el) {
    T.el = h('div', { class: 'toast' });
    T.spring = makeSpring({
      value: 0, precision: 0.002,
      onUpdate: (p) => {
        T.el.style.opacity = String(clamp(p * 1.5, 0, 1));
        T.el.style.transform = `translate3d(0, ${(1 - p) * 22}px, 0) scale(${0.95 + 0.05 * p})`;
      },
      onRest: (p) => { if (p === 0 && T.el) { T.el.remove(); T.el = null; } },
    });
    T.spring.set(0);
    box.append(T.el);
  }
  T.el.className = `toast ${kind}`;
  T.el.replaceChildren(kind === 'ok' ? '✓ ' : '⚠ ', msg);
  T.spring.to(1, { damping: 0.86, response: 0.38, allowReduced: true });
  clearTimeout(T.timer);
  T.timer = setTimeout(() => T.spring.to(0, { damping: 1, response: 0.3, allowReduced: true }), 2400);
}

export function download(filename, data, type) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function select(options, value, props = {}) {
  const s = h('select', props, options.map((o) => h('option', { value: o.value, selected: o.value === value }, o.label)));
  s.value = value ?? '';
  return s;
}

export function field(label, control, hint) {
  const id = control.id || `f-${Math.random().toString(36).slice(2, 8)}`;
  control.id = id;
  return h('div', { class: 'field' }, h('label', { for: id }, label), control, hint ? h('small', { class: 'hint' }, hint) : null);
}

export function badge(kind, text) {
  const icon = { pendiente: '○', desconocido: '?', completo: '✓', parcial: '◐', error: '!' }[kind] ?? '';
  return h('span', { class: `badge b-${kind}` }, h('span', { 'aria-hidden': 'true' }, icon), ' ', text);
}
