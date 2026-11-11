// Utilidades mínimas de DOM (sin framework).
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

export function toast(msg, kind = 'ok') {
  announce(msg);
  const box = document.getElementById('toasts');
  const t = h('div', { class: `toast ${kind}` }, kind === 'ok' ? '✓ ' : '⚠ ', msg);
  box.replaceChildren(t); // un solo aviso a la vez: no tapa la tabla de captura
  setTimeout(() => t.classList.add('out'), 2600);
  setTimeout(() => t.remove(), 3200);
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
