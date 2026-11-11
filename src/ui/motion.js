// Movimiento en el DOM: resortes sobre transform/opacity (propiedades de compositor), respuesta inmediata al
// presionar y entradas direccionales. Todo respeta prefers-reduced-motion.
import { Spring, clamp } from '../physics.js';

const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
export const reduced = () => !!mq?.matches;

export function makeSpring(opts = {}) {
  return new Spring({ reduced, ...opts });
}

/** Resorte de progreso 0→1 que aplica `apply(p)` en cada cuadro; útil para entradas y salidas. */
function progressSpring(apply, onRest) {
  return makeSpring({ value: 0, precision: 0.002, onUpdate: apply, onRest });
}

/** Entrada: sube `dy` px y aparece, con retardo opcional. Con movimiento reducido solo hay fundido breve. */
export function fadeUp(el, { delay = 0, dy = 8, response = 0.38 } = {}) {
  const rm = reduced();
  const s = progressSpring((p) => {
    el.style.opacity = String(clamp(p * 1.4, 0, 1));
    el.style.transform = rm ? '' : `translate3d(0, ${(1 - p) * dy}px, 0)`;
  }, () => { el.style.opacity = ''; el.style.transform = ''; });
  s.set(0);
  const go = () => s.to(1, { damping: 1, response: rm ? 0.2 : response, allowReduced: true });
  if (delay > 0 && !rm) setTimeout(go, delay); else go();
  return s;
}

/** Aparición escalonada de una lista de elementos (tarjetas, filas): cada uno entra un instante después del anterior. */
export function stagger(els, { step = 45, max = 10, dy = 14 } = {}) {
  [...els].slice(0, max).forEach((el, i) => fadeUp(el, { delay: i * step, dy, response: 0.46 }));
}

/** Entrada direccional (siguiente entra por la derecha, anterior por la izquierda): trayectoria simétrica. */
export function slideIn(el, dir = 1, dist = 32) {
  const rm = reduced();
  const s = progressSpring((p) => {
    el.style.opacity = String(clamp(p * 1.6, 0, 1));
    el.style.transform = rm ? '' : `translate3d(${(1 - p) * dir * dist}px, 0, 0)`;
  }, () => { el.style.opacity = ''; el.style.transform = ''; });
  s.set(0);
  s.to(1, { damping: 1, response: rm ? 0.2 : 0.36, allowReduced: true });
  return s;
}

/** Salida direccional por el lado contrario al de la entrada; llama `done` al terminar (o al instante con reduce motion). */
export function slideOut(el, dir = -1, done = () => {}, dist = 32) {
  const rm = reduced();
  const s = makeSpring({
    value: 1, precision: 0.004,
    onUpdate: (p) => { el.style.opacity = String(clamp(p * 1.4, 0, 1)); el.style.transform = rm ? '' : `translate3d(${(1 - p) * dir * dist}px, 0, 0)`; },
    onRest: (p) => { if (p === 0) done(); },
  });
  s.set(1);
  s.to(0, { damping: 1, response: rm ? 0.14 : 0.26, allowReduced: true });
  return s;
}

/** Cuenta animada hasta `to` con un resorte (micro-interacción de las cifras). Con reduce motion muestra el valor final. */
export function countTo(el, to, { from = 0, response = 0.8 } = {}) {
  el.textContent = String(Math.round(reduced() ? to : from));
  if (reduced() || from === to) { el.textContent = String(to); return null; }
  const s = makeSpring({ value: from, precision: 0.2, onUpdate: (v) => { el.textContent = String(Math.round(v)); }, onRest: () => { el.textContent = String(to); } });
  s.set(from);
  s.to(to, { damping: 1, response });
  return s;
}

/** "Pop" de confirmación: ocurre solo cuando cambia el estado (evento causal), con un rebote leve. */
export function pop(el) {
  if (reduced()) return;
  const s = makeSpring({ value: 0.82, precision: 0.0008, onUpdate: (v) => { el.style.transform = `scale(${v})`; }, onRest: () => { el.style.transform = ''; } });
  s.set(0.82);
  s.to(1, { damping: 0.62, response: 0.36 });
}

// ---- Respuesta inmediata al presionar ------------------------------------------------------------------------
const PRESS = '.btn, .tab, .subtab, summary, .choice, .chip, .seg-btn, .profile-chip';
const springs = new WeakMap();
const active = new Map(); // pointerId -> elemento presionado

function pressSpring(el) {
  let s = springs.get(el);
  if (!s) {
    s = makeSpring({ value: 1, precision: 0.0005, onUpdate: (v) => { el.style.transform = v === 1 ? '' : `scale(${v})`; } });
    springs.set(el, s);
  }
  return s;
}

/**
 * El elemento responde al POSAR el dedo (pointerdown), no al soltarlo, y vuelve con un resorte desde donde esté.
 * Si el dedo se aleja del objetivo la pulsación se cancela, como en iOS.
 */
export function installPress(root = document) {
  root.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = e.target.closest?.(PRESS);
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    active.set(e.pointerId, el);
    pressSpring(el).to(el.matches('summary') ? 0.985 : 0.96, { damping: 1, response: 0.14 });
  }, { passive: true });

  const release = (e) => {
    const el = active.get(e.pointerId);
    if (!el) return;
    active.delete(e.pointerId);
    pressSpring(el).to(1, { damping: 1, response: 0.3 });
  };
  root.addEventListener('pointerup', release, { passive: true });
  root.addEventListener('pointercancel', release, { passive: true });
  root.addEventListener('pointermove', (e) => {
    const el = active.get(e.pointerId);
    if (!el) return;
    const r = el.getBoundingClientRect(); const pad = 10; // histéresis alrededor del objetivo
    if (e.clientX < r.left - pad || e.clientX > r.right + pad || e.clientY < r.top - pad || e.clientY > r.bottom + pad) release(e);
  }, { passive: true });
}
