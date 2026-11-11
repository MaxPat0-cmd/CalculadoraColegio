// Hoja inferior (sheet) con arrastre 1:1, momentum proyectado, rubber-banding e interrupción a mitad de camino.
//  - El dedo conserva el punto donde agarró la hoja (sin saltar al centro).
//  - Al soltar se hereda la velocidad del gesto y se proyecta dónde terminaría (sheetRelease).
//  - Se puede volver a tomar mientras se abre o se cierra: el resorte parte del valor presentado actual.
//  - Entra y sale por el mismo camino (abajo). El fondo se atenúa y se "aleja" en función del progreso real.
//  - Con prefers-reduced-motion solo hay fundido y no se arrastra.
import { h } from './dom.js';
import { makeSpring, reduced } from './motion.js';
import { VelocityTracker, rubberband, sheetRelease, clamp } from '../physics.js';

let current = null;
let uid = 0;

export const sheetKey = () => current?.key ?? null;

const BACKGROUND = ['header.topbar', '#nav', '#main'];

export function openSheet({ key, title, render, onDismiss, returnFocus }) {
  if (current) closeSheet({ silent: true, instant: true });
  const rm = reduced();
  const titleId = `sheet-title-${++uid}`;
  const closeBtn = h('button', { class: 'btn small sheet-close', type: 'button', 'aria-label': 'Cerrar' }, 'Cerrar');
  const head = h('div', { class: 'sheet-head' }, h('span', { class: 'sheet-grabber', 'aria-hidden': 'true' }), h('div', { class: 'sheet-title', id: titleId }, title), closeBtn);
  const body = h('div', { class: 'sheet-body' });
  const panel = h('section', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabindex: '-1' }, head, body);
  const scrim = h('div', { class: 'sheet-scrim' });
  const root = h('div', { class: 'sheet-root' }, scrim, panel);
  render(body);
  document.body.append(root);
  document.documentElement.classList.add('sheet-open');

  const bg = BACKGROUND.map((s) => document.querySelector(s)).filter(Boolean);
  bg.forEach((el) => { el.inert = true; });
  const main = document.getElementById('main');
  if (main) main.style.transformOrigin = '50% 0';

  let H = panel.offsetHeight;
  let drag = null; let silent = false; let done = false;

  // Un solo valor (posición Y en px) gobierna panel, velo y fondo: todo permanece sincronizado.
  const apply = (y) => {
    const p = clamp(1 - y / H, 0, 1);
    panel.style.transform = `translate3d(0, ${y}px, 0)`;
    scrim.style.opacity = String(p);
    if (main) main.style.transform = p ? `scale(${1 - 0.018 * p})` : '';
  };
  // Variante sin movimiento: solo opacidad.
  const applyFade = (o) => { panel.style.opacity = String(o); scrim.style.opacity = String(o); };

  const finish = () => {
    if (done) return;
    done = true;
    document.removeEventListener('keydown', onKey, true);
    root.remove();
    document.documentElement.classList.remove('sheet-open');
    bg.forEach((el) => { el.inert = false; });
    if (main) { main.style.transform = ''; main.style.transformOrigin = ''; }
    const wasSilent = silent;
    current = null;
    if (!wasSilent) {
      onDismiss?.(); // normalmente cambia la ruta y la vista se redibuja…
      // …así que el foco se devuelve al disparador después de ese redibujado.
      requestAnimationFrame(() => requestAnimationFrame(() => { try { (returnFocus?.() ?? null)?.focus?.({ preventScroll: true }); } catch { /* sin foco */ } }));
    }
  };

  let closing = false;
  // Dos "motores" con la misma interfaz: deslizamiento con resorte (normal) o fundido (movimiento reducido).
  let spring; let animateOpen; let animateClose;
  if (rm) {
    spring = makeSpring({ value: 0, precision: 0.002, onUpdate: applyFade, onRest: (v) => { if (closing && v === 0) finish(); } });
    panel.style.transform = 'none';
    spring.set(0);
    animateOpen = () => { closing = false; spring.to(1, { damping: 1, response: 0.2, allowReduced: true }); };
    animateClose = () => { closing = true; spring.to(0, { damping: 1, response: 0.18, allowReduced: true }); };
  } else {
    spring = makeSpring({ value: H, precision: 0.2, onUpdate: apply, onRest: (v) => { if (closing && Math.abs(v - H) < 1) finish(); } });
    spring.set(H); // fuera de pantalla, abajo
    animateOpen = () => { closing = false; spring.to(0, { damping: 1, response: 0.42 }); };
    animateClose = () => { closing = true; spring.to(H, { damping: 1, response: 0.36 }); }; // conserva la velocidad vigente
  }
  const requestClose = (opts = {}) => { silent = !!opts.silent; animateClose(); };

  panel.focus({ preventScroll: true });
  requestAnimationFrame(animateOpen); // un cuadro después, para que el estado inicial ya esté pintado

  // ---- Gesto de arrastre (solo desde la cabecera, para no pelear con el scroll del contenido) ----
  if (!rm) {
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') || (e.pointerType === 'mouse' && e.button !== 0)) return;
      H = panel.offsetHeight;
      spring.stop(); // interrumpe: la posición presentada ya está en spring.value
      closing = false; silent = false;
      drag = { id: e.pointerId, startY: e.clientY, startPos: spring.value, tracker: new VelocityTracker() };
      drag.tracker.push(e.clientY, e.timeStamp);
      try { head.setPointerCapture(e.pointerId); } catch { /* puntero sintético: sin captura */ }
      panel.classList.add('dragging');
    });
    head.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const raw = drag.startPos + (e.clientY - drag.startY); // 1:1 respetando dónde se agarró
      spring.set(raw < 0 ? -rubberband(-raw, H) : raw); // resistencia progresiva al pasar el borde superior
      drag.tracker.push(e.clientY, e.timeStamp);
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const v = drag.tracker.velocity(e.timeStamp);
      drag = null; panel.classList.remove('dragging');
      const r = sheetRelease({ position: spring.value, velocity: v, height: H });
      closing = r.target === H;
      spring.to(r.target, { damping: r.damping, response: r.response, velocity: v });
    };
    head.addEventListener('pointerup', end);
    head.addEventListener('pointercancel', end);
  }

  closeBtn.addEventListener('click', () => requestClose());
  scrim.addEventListener('click', () => requestClose());

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); requestClose(); return; }
    if (e.key !== 'Tab') return;
    const f = [...panel.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')].filter((n) => n.offsetParent !== null);
    if (!f.length) { e.preventDefault(); return; }
    const first = f[0]; const last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  document.addEventListener('keydown', onKey, true);

  current = {
    key, body, render,
    requestClose,
    destroy: (s) => { silent = !!s; finish(); },
  };
  return current;
}

/** Sustituye el contenido conservando el scroll (p. ej. tras un cambio hecho en otra pestaña). */
export function updateSheet(render) {
  if (!current) return;
  const top = current.body.scrollTop;
  current.body.replaceChildren();
  render(current.body);
  current.body.scrollTop = top;
}

export function closeSheet({ silent = true, instant = false } = {}) {
  if (!current) return;
  if (instant) current.destroy(silent);
  else current.requestClose({ silent });
}
