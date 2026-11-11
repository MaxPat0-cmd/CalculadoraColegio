// Onboarding: ¿eres docente? ¿de qué nivel? Tarjeta de vidrio sobre la app desenfocada, con pasos que entran y
// salen por lados opuestos con resortes. Se puede omitir y volver a abrir desde el perfil.
import { h } from './dom.js';
import { makeSpring, slideIn, slideOut, pop, reduced } from './motion.js';
import { clamp } from '../physics.js';
import { ROLES, LEVEL_CHOICES, ensureLevel, levelForChoice, teachersFor, defaultMode, startHash, configPatchForProfile, profileLabel } from '../onboarding.js';
import { saveProfile } from './profile.js';
import { normalizeConfig, saveUi } from './config.js';
import { toast } from './dom.js';

let open = false;

export function openOnboarding(ctx, { onDone }) {
  if (open) return;
  open = true;
  const { store } = ctx;
  const a = { role: ctx.profile.role ?? null, choiceId: ctx.profile.choiceId ?? null, teacherId: ctx.profile.teacherId ?? null };
  const stage = h('div', { class: 'onb-stage' });
  const dots = h('div', { class: 'onb-dots', 'aria-hidden': 'true' });
  const skip = h('button', { class: 'link-btn', type: 'button' }, 'Omitir por ahora');
  const card = h('section', { class: 'onb-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'onb-title', tabindex: '-1' },
    h('div', { class: 'onb-logo ua', 'aria-hidden': 'true' }, 'UA'), stage, h('div', { class: 'onb-foot' }, dots, skip));
  const root = h('div', { class: 'onb-root' }, card);
  document.body.append(root);

  const bg = ['header.shell', '.demo-strip', '#main'].map((s) => document.querySelector(s)).filter(Boolean);
  bg.forEach((el) => { el.inert = true; });

  // Entrada/salida de toda la tarjeta con un solo resorte de progreso (interrumpible).
  const rm = reduced();
  const appear = makeSpring({
    value: 0, precision: 0.002,
    onUpdate: (p) => { root.style.opacity = String(clamp(p * 1.3, 0, 1)); card.style.transform = rm ? '' : `translate3d(0, ${(1 - p) * 22}px, 0) scale(${0.965 + 0.035 * p})`; },
    onRest: (p) => { if (p === 0) destroy(); },
  });
  appear.set(0);
  requestAnimationFrame(() => appear.to(1, { damping: 0.86, response: 0.5, allowReduced: true }));

  let leaving = false;
  const close = (afterHash) => {
    if (leaving) return;
    leaving = true;
    pendingHash = afterHash;
    appear.to(0, { damping: 1, response: 0.3, allowReduced: true });
  };
  let pendingHash = null;
  function destroy() {
    document.removeEventListener('keydown', onKey, true);
    root.remove();
    bg.forEach((el) => { el.inert = false; });
    open = false;
    onDone?.(pendingHash);
  }

  const levelStepNeeded = () => a.role === 'docente';
  const stepList = () => {
    const list = ['role'];
    if (levelStepNeeded()) list.push('level');
    if (a.role === 'docente' && a.choiceId) {
      const lid = levelForChoice(store.state, LEVEL_CHOICES.find((c) => c.id === a.choiceId));
      if (lid && teachersFor(store.state, lid).length > 1) list.push('teacher');
    }
    return list;
  };

  let idx = 0; let current = null;

  const finish = (extra = {}) => {
    const profile = { done: true, role: a.role ?? 'explorar', ...extra };
    if (profile.role === 'docente') {
      const lv = ensureLevel(store, a.choiceId);
      if (!lv.ok) { toast(lv.error, 'error'); return false; }
      profile.choiceId = a.choiceId; profile.levelId = lv.levelId; profile.teacherId = a.teacherId ?? null;
      profile.mode = defaultMode(lv.levelId);
    } else { profile.mode = ctx.profile.mode; }
    ctx.profile = profile; saveProfile(profile);
    ctx.ui.config = normalizeConfig(store.state, { ...ctx.ui.config, ...configPatchForProfile(store.state, profile) }); saveUi(ctx.ui.config);
    toast(`Todo listo · ${profileLabel(store.state, profile)}`);
    close(startHash(store.state, profile));
    return true;
  };

  const renderDots = () => {
    const n = stepList().length;
    dots.replaceChildren(...Array.from({ length: n }, (_, i) => h('span', { class: `dot${i === idx ? ' on' : ''}` })));
    const on = dots.querySelector('.on'); if (on) pop(on);
  };

  const build = (name) => {
    const head = (title, sub) => [h('h2', { id: 'onb-title', class: 'onb-title' }, title), h('p', { class: 'lede' }, sub)];
    const back = h('button', { class: 'btn small ghost', type: 'button', onclick: () => go(idx - 1, -1) }, '← Atrás');
    if (name === 'role') {
      return h('div', { class: 'onb-step' }, ...head('Bienvenido a UA', 'Cuéntanos cómo vas a usar la app y la dejamos lista para ti.'),
        h('div', { class: 'choices' }, ROLES.map((r) => h('button', { class: `choice${a.role === r.id ? ' selected' : ''}`, type: 'button', onclick: (e) => {
          a.role = r.id; pop(e.currentTarget);
          setTimeout(() => { if (r.id === 'docente') go(1, 1); else finish(); }, 160);
        } }, h('strong', null, r.title), h('span', { class: 'muted' }, r.desc)))));
    }
    if (name === 'level') {
      return h('div', { class: 'onb-step' }, ...head('¿De qué nivel das clases?', 'Elegimos tus catálogos y la forma de captura que mejor te acomoda.'),
        h('div', { class: 'choices', role: 'group', 'aria-label': 'Nivel educativo' }, LEVEL_CHOICES.map((c) => h('button', { class: `choice${a.choiceId === c.id ? ' selected' : ''}`, type: 'button', onclick: (e) => {
          a.choiceId = c.id; a.teacherId = null; pop(e.currentTarget);
          setTimeout(() => { if (stepList().length > idx + 1) go(idx + 1, 1); else finish(); }, 160);
        } }, h('strong', null, c.label), h('span', { class: 'muted' }, c.desc)))),
        h('div', { class: 'onb-actions' }, back));
    }
    // teacher
    const lid = levelForChoice(store.state, LEVEL_CHOICES.find((c) => c.id === a.choiceId));
    return h('div', { class: 'onb-step' }, ...head('¿Quién eres?', 'Así prellenamos tus materias. Puedes cambiarlo cuando quieras.'),
      h('div', { class: 'choices' }, [...teachersFor(store.state, lid).map((t) => h('button', { class: `choice${a.teacherId === t.id ? ' selected' : ''}`, type: 'button', onclick: (e) => {
        a.teacherId = t.id; pop(e.currentTarget); setTimeout(() => finish(), 160);
      } }, h('strong', null, t.name), h('span', { class: 'muted' }, `${t.subjectIds.length} asignatura(s)`))),
      h('button', { class: 'choice', type: 'button', onclick: () => finish() }, h('strong', null, 'Elegir después'), h('span', { class: 'muted' }, 'Usaré el primer docente del catálogo.'))]),
      h('div', { class: 'onb-actions' }, back));
  };

  function go(i, dir) {
    const list = stepList();
    idx = clamp(i, 0, list.length - 1);
    const el = build(list[idx]);
    const old = current;
    current = el;
    stage.append(el);
    if (old) { old.classList.add('leaving'); old.setAttribute('aria-hidden', 'true'); old.inert = true; slideOut(old, -dir, () => old.remove()); }
    slideIn(el, dir, 36);
    renderDots();
    // El foco va al diálogo (no a la primera opción, que parecería preseleccionada); Tab entra a las opciones.
    requestAnimationFrame(() => card.focus({ preventScroll: true }));
  }

  skip.addEventListener('click', () => {
    ctx.profile = { ...ctx.profile, done: true, role: ctx.profile.role ?? 'explorar', skipped: true };
    saveProfile(ctx.profile);
    close('#inicio');
  });

  function onKey(e) {
    if (e.key !== 'Tab') return;
    const f = [...card.querySelectorAll('button:not([disabled]), input, a[href]')].filter((n) => n.offsetParent !== null && !n.closest('.leaving'));
    if (!f.length) return;
    const first = f[0]; const last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === card)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  document.addEventListener('keydown', onKey, true);
  go(0, 1);
}
