// Pestañas con un indicador que se desliza con resortes (X y ancho independientes, interrumpibles).
import { h } from './dom.js';
import { makeSpring } from './motion.js';

export function createTabs(nav, routes) {
  const indicator = h('span', { class: 'tab-indicator', 'aria-hidden': 'true' });
  let x = 0; let w = 0;
  const paint = () => { indicator.style.transform = `translate3d(${x}px, 0, 0)`; indicator.style.width = `${w}px`; };
  const sx = makeSpring({ value: 0, onUpdate: (v) => { x = v; paint(); } });
  const sw = makeSpring({ value: 0, onUpdate: (v) => { w = v; paint(); } });
  const links = new Map(routes.map(([id, label]) => [id, h('a', { href: `#${id}`, class: 'tab' }, label)]));
  nav.replaceChildren(indicator, ...links.values());
  let current = null; let placed = false;

  const target = () => { const a = links.get(current); return a ? { left: a.offsetLeft, width: a.offsetWidth } : null; };
  const place = (animate) => {
    const t = target(); if (!t) return;
    if (!animate || !placed) { sx.set(t.left); sw.set(t.width); placed = true; return; }
    sx.to(t.left, { damping: 0.86, response: 0.42 });
    sw.to(t.width, { damping: 0.86, response: 0.42 });
  };
  window.addEventListener('resize', () => place(false));
  if (document.fonts?.ready) document.fonts.ready.then(() => place(false));

  return {
    setActive(id) {
      current = id;
      for (const [k, a] of links) { a.classList.toggle('active', k === id); if (k === id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }
      place(true);
    },
  };
}
