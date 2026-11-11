// "Capturar": una sola pantalla con las dos modalidades (por alumno / por asignatura) sobre los mismos registros.
import { h, clear, put } from '../dom.js';
import { segmented } from '../segmented.js';
import { slideIn } from '../motion.js';
import { saveProfile } from '../profile.js';
import { captureStudentView } from './captureStudent.js';
import { captureSubjectView } from './captureSubject.js';

const HINTS = {
  alumno: 'Todas las asignaturas de un alumno en una sola pantalla. Ideal para profesores titulares de primaria.',
  asignatura: 'Una materia para todo el grupo. Ideal para secundaria, bachillerato y docentes especialistas.',
};

export function captureView(ctx) {
  const root = h('div', { class: 'view' });
  const host = h('div', { class: 'view' });
  const hint = h('p', { class: 'lede' });
  let mode = ctx.profile.mode === 'asignatura' ? 'asignatura' : 'alumno';
  let child = null;

  const mount = (dir) => {
    hint.textContent = HINTS[mode];
    child = (mode === 'alumno' ? captureStudentView : captureSubjectView)(ctx);
    clear(host).append(child.el);
    if (dir) slideIn(child.el, dir, 28);
  };
  const seg = segmented({
    label: 'Modalidad de captura', value: mode,
    options: [{ value: 'alumno', label: 'Por alumno' }, { value: 'asignatura', label: 'Por asignatura' }],
    onChange: (v) => { const dir = v === 'asignatura' ? 1 : -1; mode = v; ctx.profile.mode = v; saveProfile(ctx.profile); mount(dir); },
  });
  put(root,
    h('section', { class: 'page-head' }, h('div', null, h('h2', null, 'Capturar calificaciones'), hint), seg),
    host);
  mount(0);
  return { el: root, refresh: () => child?.refresh?.() };
}
