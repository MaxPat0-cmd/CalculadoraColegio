// Control segmentado (estilo iOS) con "pastilla" de vidrio que se desliza con resortes X/ancho independientes.
import { h } from './dom.js';
import { makeSpring } from './motion.js';

export function segmented({ options, value, onChange, label }) {
  const thumb = h('span', { class: 'seg-thumb', 'aria-hidden': 'true' });
  let current = value;
  let x = 0; let w = 0; let placed = false;
  const paint = () => { thumb.style.transform = `translate3d(${x}px, 0, 0)`; thumb.style.width = `${w}px`; };
  const sx = makeSpring({ value: 0, onUpdate: (v) => { x = v; paint(); } });
  const sw = makeSpring({ value: 0, onUpdate: (v) => { w = v; paint(); } });

  const buttons = options.map((o) => h('button', { type: 'button', class: 'seg-btn', role: 'radio', dataset: { value: o.value }, onclick: () => choose(o.value) }, o.label));
  const el = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label }, thumb, buttons);

  const place = (animate) => {
    const b = buttons.find((x2) => x2.dataset.value === current);
    if (!b || !b.offsetWidth) return;
    if (!animate || !placed) { sx.set(b.offsetLeft); sw.set(b.offsetWidth); placed = true; return; }
    sx.to(b.offsetLeft, { damping: 0.82, response: 0.4 });
    sw.to(b.offsetWidth, { damping: 0.82, response: 0.4 });
  };
  const sync = () => buttons.forEach((b) => {
    const on = b.dataset.value === current;
    b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; b.classList.toggle('active', on);
  });
  function choose(v, notify = true) {
    if (v === current) return;
    current = v; sync(); place(true);
    if (notify) onChange?.(v);
  }
  el.addEventListener('keydown', (e) => {
    const i = options.findIndex((o) => o.value === current);
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = options[(i + d + options.length) % options.length];
    choose(next.value); buttons.find((b) => b.dataset.value === next.value).focus();
  });
  sync();
  requestAnimationFrame(() => place(false));
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => place(false)).observe(el);
  el.select = (v) => choose(v, false);
  return el;
}
