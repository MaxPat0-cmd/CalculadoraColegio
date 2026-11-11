// Física del movimiento (sin DOM, probada con node:test). Basado en los principios de apple-design:
// resortes definidos por amortiguamiento + respuesta, velocidad heredada del gesto, proyección de momentum,
// rubber-banding y reanimación desde el valor actual (interrumpible).

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
export { clamp };

/**
 * Convierte (razón de amortiguamiento, respuesta en segundos) en constantes de resorte con masa 1.
 * damping 1 = crítico (sin rebote); < 1 rebota. response = qué tan rápido alcanza el objetivo (no es una duración).
 */
export function springConstants(damping = 1, response = 0.4) {
  const w = (2 * Math.PI) / Math.max(response, 0.01);
  return { k: w * w, c: 2 * damping * w };
}

/** Un paso de integración (Euler semi-implícito con sub-pasos de 1/240 s para estabilidad). */
export function stepSpring(state, target, { k, c }, dt) {
  const n = Math.max(1, Math.ceil(dt * 240));
  const h = dt / n;
  let { x, v } = state;
  for (let i = 0; i < n; i++) {
    v += (k * (target - x) - c * v) * h;
    x += v * h;
  }
  return { x, v };
}

/**
 * Un valor animado por resorte. `to()` siempre parte del valor presentado ACTUAL y conserva la velocidad actual
 * (o la que se le entregue), por lo que se puede reorientar a mitad de camino sin saltos ni "paredes de ladrillo".
 */
export class Spring {
  constructor({ value = 0, onUpdate = () => {}, onRest = () => {}, precision = 0.01, raf, caf, reduced } = {}) {
    this.x = value; this.v = 0; this.target = value;
    this.consts = springConstants(1, 0.4);
    this.onUpdate = onUpdate; this.onRest = onRest; this.precision = precision; this.reduced = reduced;
    this._raf = raf ?? ((fn) => globalThis.requestAnimationFrame(fn));
    this._caf = caf ?? ((id) => globalThis.cancelAnimationFrame(id));
    this._id = null; this._last = null;
  }

  get value() { return this.x; }
  get velocity() { return this.v; }
  get animating() { return this._id !== null; }

  /** Fija el valor de inmediato (arrastre 1:1) y cancela cualquier animación en curso. */
  set(value) {
    this.stop(); this.x = value; this.target = value; this.v = 0;
    this.onUpdate(this.x);
  }

  stop() {
    if (this._id !== null) { this._caf(this._id); this._id = null; }
    this._last = null;
  }

  /** Anima hacia `target`. `velocity` (unidades/s) es la velocidad inicial, p. ej. la del dedo al soltar. */
  to(target, { damping = 1, response = 0.4, velocity, allowReduced = false } = {}) {
    if (this.reduced?.() && !allowReduced) { this.set(target); this.onRest(target); return; }
    if (velocity !== undefined) this.v = velocity;
    this.target = target;
    this.consts = springConstants(damping, response);
    if (this._id === null) { this._last = null; this._id = this._raf((t) => this._tick(t)); }
  }

  _tick(ts) {
    const dt = this._last === null ? 1 / 60 : clamp((ts - this._last) / 1000, 0, 1 / 30) || 1 / 60;
    this._last = ts;
    const s = stepSpring({ x: this.x, v: this.v }, this.target, this.consts, dt);
    this.x = s.x; this.v = s.v;
    if (Math.abs(this.x - this.target) <= this.precision && Math.abs(this.v) <= this.precision * 10) {
      this.x = this.target; this.v = 0; this._id = null; this._last = null;
      this.onUpdate(this.x);
      this.onRest(this.x);
      return;
    }
    this.onUpdate(this.x);
    this._id = this._raf((t) => this._tick(t));
  }
}

/** Dónde terminaría un gesto si siguiera desacelerando (forma exponencial de Apple). velocity en px/s. */
export function project(velocity, decelerationRate = 0.998) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Resistencia progresiva al pasar un límite: cuanto más lejos, menos sigue al dedo. */
export function rubberband(overshoot, dimension, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/** Velocidad del puntero a partir de las últimas muestras (ventana corta); 0 si el dedo se detuvo antes de soltar. */
export class VelocityTracker {
  constructor(windowMs = 100, staleMs = 80) { this.windowMs = windowMs; this.staleMs = staleMs; this.samples = []; }
  push(pos, t) {
    this.samples.push({ pos, t });
    while (this.samples.length > 2 && t - this.samples[0].t > this.windowMs) this.samples.shift();
  }
  velocity(now) {
    const n = this.samples.length;
    if (n < 2) return 0;
    const a = this.samples[0]; const b = this.samples[n - 1];
    if (now !== undefined && now - b.t > this.staleMs) return 0;
    const dt = (b.t - a.t) / 1000;
    return dt > 0 ? (b.pos - a.pos) / dt : 0;
  }
}

/**
 * Qué hacer al soltar una hoja (sheet) arrastrada hacia abajo. Se proyecta el momentum y se elige el punto de
 * reposo más cercano a donde iría el gesto (0 = abierta, height = cerrada). El rebote solo existe cuando el
 * gesto traía impulso (flick); un cierre o una apertura sin impulso es crítica y sin rebote.
 */
export function sheetRelease({ position, velocity, height }) {
  const projected = position + project(velocity);
  const target = projected > height / 2 ? height : 0;
  const momentum = Math.abs(velocity) > 300;
  return { target, projected, damping: target === 0 && momentum ? 0.8 : 1, response: target === 0 ? 0.3 : 0.35 };
}
