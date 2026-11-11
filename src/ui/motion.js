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

/** Entrada de una vista: sube 8 px y aparece. Con movimiento reducido solo hay fundido breve. */
export function fadeUp(el) {
  const rm = reduced();
  const s = progressSpring((p) => {
    el.style.opacity = String(clamp(p * 1.4, 0, 1));
    el.style.transform = rm ? '' : `translate3d(0, ${(1 - p) * 8}px, 0)`;
  }, () => { el.style.opacity = ''; el.style.transform = ''; });
  s.set(0);
  s.to(1, { damping: 1, response: rm ? 0.2 : 0.38, allowReduced: true });
  return s;
}

/** Entrada direccional (siguiente alumno entra desde la derecha, anterior desde la izquierda): trayectoria simétrica. */
export function slideIn(el, dir = 1) {
  const rm = reduced();
  const s = progressSpring((p) => {
    el.style.opacity = String(clamp(p * 1.6, 0, 1));
    el.style.transform = rm ? '' : `translate3d(${(1 - p) * dir * 32}px, 0, 0)`;
  }, () => { el.style.opacity = ''; el.style.transform = ''; });
  s.set(0);
  s.to(1, { damping: 1, response: rm ? 0.2 : 0.36, allowReduced: true });
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
const PRESS = '.btn, .tab, .subtab, summary';
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
