import test from 'node:test';
import assert from 'node:assert/strict';
import { Spring, springConstants, project, rubberband, VelocityTracker, sheetRelease } from '../src/physics.js';

/** Reloj simulado: ejecuta los cuadros pendientes a 60 fps hasta que el resorte descansa. */
function harness(opts = {}) {
  let t = 0; let queue = null; let id = 0;
  const raf = (fn) => { queue = fn; return ++id; };
  const caf = () => { queue = null; };
  const values = [];
  const rests = [];
  const spring = new Spring({ raf, caf, onUpdate: (v) => values.push(v), onRest: (v) => rests.push(v), ...opts });
  const run = (frames = 600) => { for (let i = 0; i < frames && queue; i++) { t += 1000 / 60; const f = queue; queue = null; f(t); } };
  const frame = () => { if (queue) { t += 1000 / 60; const f = queue; queue = null; f(t); } };
  return { spring, run, frame, values, rests };
}

test('el resorte crítico llega al objetivo sin rebotar y descansa', () => {
  const { spring, run, values, rests } = harness({ value: 0 });
  spring.to(100, { damping: 1, response: 0.4 });
  run();
  assert.equal(spring.value, 100);
  assert.equal(rests.length, 1);
  assert.ok(Math.max(...values) <= 100 + 1e-6, 'sin sobrepaso');
  assert.equal(spring.animating, false);
});

test('con amortiguamiento < 1 hay rebote; "response" menor llega antes', () => {
  const a = harness({ value: 0 }); a.spring.to(100, { damping: 0.6, response: 0.4 }); a.run();
  assert.ok(Math.max(...a.values) > 101, 'rebota');
  const fast = harness({ value: 0 }); fast.spring.to(100, { damping: 1, response: 0.2 }); fast.run();
  const slow = harness({ value: 0 }); slow.spring.to(100, { damping: 1, response: 0.6 }); slow.run();
  assert.ok(fast.values.length < slow.values.length);
});

test('reorientar a mitad de camino parte del valor actual y conserva la velocidad (sin saltos)', () => {
  const { spring, run, frame, values } = harness({ value: 0 });
  spring.to(100, { response: 0.4 });
  for (let i = 0; i < 8; i++) frame();
  const mid = spring.value; const v = spring.velocity;
  assert.ok(mid > 0 && mid < 100 && v > 0);
  spring.to(0, { response: 0.4 }); // se invierte: no hay velocidad hasta el objetivo nuevo
  assert.equal(spring.value, mid, 'no salta al reorientar');
  assert.equal(spring.velocity, v, 'hereda la velocidad vigente');
  frame();
  assert.ok(Math.abs(spring.value - mid) < 10, 'continuidad entre cuadros');
  run();
  assert.equal(spring.value, 0);
  assert.ok(Math.max(...values) < 100);
});

test('la velocidad del gesto se entrega al resorte (handoff sin costura)', () => {
  const { spring, frame } = harness({ value: 50 });
  spring.to(150, { damping: 1, response: 0.4, velocity: 2000 });
  frame();
  assert.ok(spring.value - 50 > 20, 'arranca rápido por la velocidad heredada');
  const slow = harness({ value: 50 }); slow.spring.to(150, { damping: 1, response: 0.4, velocity: 0 }); slow.frame();
  assert.ok(spring.value > slow.spring.value);
});

test('set() sigue al dedo 1:1 y cancela la animación', () => {
  const { spring, frame } = harness({ value: 0 });
  spring.to(100); frame();
  spring.set(37);
  assert.equal(spring.value, 37); assert.equal(spring.velocity, 0); assert.equal(spring.animating, false);
});

test('con reduce motion los resortes saltan al destino sin animar', () => {
  const { spring, rests } = harness({ value: 0, reduced: () => true });
  spring.to(100);
  assert.equal(spring.value, 100); assert.equal(spring.animating, false); assert.deepEqual(rests, [100]);
  const fade = harness({ value: 0, reduced: () => true }); fade.spring.to(1, { allowReduced: true }); assert.equal(fade.spring.animating, true);
});

test('springConstants: crítico → c² = 4k', () => {
  const { k, c } = springConstants(1, 0.4);
  assert.ok(Math.abs(c * c - 4 * k) < 1e-9);
});

test('project: proyección exponencial de Apple', () => {
  assert.ok(Math.abs(project(1000) - 499) < 1e-6);
  assert.equal(project(0), 0);
  assert.ok(project(-1000) < 0);
  assert.ok(project(1000, 0.99) < project(1000, 0.998));
});

test('rubberband: resistencia progresiva, siempre menor que el desplazamiento y acotada por la dimensión', () => {
  const d = 600;
  let prev = 0;
  for (const o of [10, 50, 200, 800, 5000]) {
    const r = rubberband(o, d);
    assert.ok(r > prev && r < o && r < d, `overshoot ${o}`);
    prev = r;
  }
});

test('VelocityTracker: velocidad reciente; 0 si el dedo se detuvo antes de soltar', () => {
  const t = new VelocityTracker();
  [0, 10, 20, 30, 40].forEach((p, i) => t.push(p, i * 10)); // 1 px/ms = 1000 px/s
  assert.ok(Math.abs(t.velocity(40) - 1000) < 1);
  assert.equal(t.velocity(400), 0);
  assert.equal(new VelocityTracker().velocity(0), 0);
});

test('sheetRelease: proyección y signo de velocidad deciden abrir o cerrar', () => {
  const H = 600;
  assert.equal(sheetRelease({ position: 20, velocity: 0, height: H }).target, 0, 'arrastre corto sin impulso regresa');
  assert.equal(sheetRelease({ position: 20, velocity: 1500, height: H }).target, H, 'flick hacia abajo cierra');
  assert.equal(sheetRelease({ position: 400, velocity: -1200, height: H }).target, 0, 'flick hacia arriba reabre aunque esté pasada la mitad');
  assert.equal(sheetRelease({ position: 350, velocity: 0, height: H }).target, H, 'más allá de la mitad sin impulso cierra');
  const flickBack = sheetRelease({ position: 200, velocity: -1200, height: H });
  assert.equal(flickBack.damping, 0.8, 'rebote solo con impulso');
  assert.equal(sheetRelease({ position: 100, velocity: 0, height: H }).damping, 1);
});
