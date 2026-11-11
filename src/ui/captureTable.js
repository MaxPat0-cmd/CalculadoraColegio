// Tabla de captura compartida por ambas modalidades. Guarda al confirmar (Enter, Tab o salir del campo).
import { h, badge, announce, toast } from './dom.js';
import { makeSpring, pop } from './motion.js';
import { saveCapture } from '../capture.js';
import { fieldToInput } from '../validation.js';
import { FIELD } from '../models.js';

export function rowBadge(row) {
  if (row.grade.status === FIELD.UNKNOWN) return badge('desconocido', 'Desconocido');
  if (row.grade.status === FIELD.PENDING) return badge('pendiente', 'Pendiente');
  if (row.absences.status !== FIELD.VALUE) return badge('parcial', 'Faltas pendientes');
  return badge('completo', 'Completo');
}

/** Barra de avance cuyo ancho se anima con un resorte desde el valor actual (no se recrea en cada guardado). */
export function progress(rows) {
  const bar = h('div', { class: 'progress-bar' });
  const track = h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'Avance de captura' }, bar);
  const label = h('span', { class: 'progress-label' });
  const wrap = h('div', { class: 'progress-wrap' }, track, label);
  const spring = makeSpring({ value: 0, precision: 0.05, onUpdate: (v) => { bar.style.transform = `scaleX(${v / 100})`; } });
  const apply = (list, animate) => {
    const done = list.filter((r) => r.complete).length;
    const pct = list.length ? Math.round((done / list.length) * 100) : 0;
    track.setAttribute('aria-valuenow', pct);
    label.textContent = `${done} de ${list.length} completos (${pct} %)`;
    if (animate) spring.to(pct, { damping: 1, response: 0.5 }); else spring.set(pct);
  };
  apply(rows, false);
  wrap.update = (list) => apply(list, true);
  return wrap;
}

/**
 * rows: filas de capture.js. firstCol: { header, render(row) }. Cada fila se guarda de forma independiente
 * sobre el mismo registro interno, sin importar desde qué modalidad se capture.
 */
export function captureTable(ctx, rows, { caption, firstCol, teacherId, onSaved }) {
  const { store } = ctx;
  const tbody = h('tbody');
  const scale = store.state.scale;

  const buildRow = (row, idx) => {
    const gIn = h('input', { class: 'in grade', type: 'text', inputMode: 'decimal', autocomplete: 'off', value: fieldToInput(row.grade), placeholder: 'Pendiente', 'aria-label': `Calificación de ${firstCol.label(row)}`, dataset: { col: 'g', row: idx } });
    const aIn = h('input', { class: 'in abs', type: 'text', inputMode: 'numeric', autocomplete: 'off', value: fieldToInput(row.absences), placeholder: '—', 'aria-label': `Faltas de ${firstCol.label(row)}`, dataset: { col: 'a', row: idx } });
    const nIn = h('input', { class: 'in notes', type: 'text', autocomplete: 'off', maxLength: 300, value: row.notes, placeholder: 'Observaciones (opcional)', 'aria-label': `Observaciones de ${firstCol.label(row)}`, dataset: { col: 'n', row: idx } });
    const status = h('td', { class: 'status' }, rowBadge(row));
    const err = h('div', { class: 'err', role: 'alert', hidden: true });
    const tr = h('tr', null, h('th', { scope: 'row' }, firstCol.render(row)), h('td', null, gIn), h('td', null, aIn), h('td', null, nIn), status);
    const errRow = h('tr', { class: 'err-row', hidden: true }, h('td', { colSpan: 5 }, err));
    let saved = { g: gIn.value, a: aIn.value, n: nIn.value };
    const markPending = () => {
      gIn.classList.toggle('is-pending', gIn.value.trim() === '');
      aIn.classList.toggle('is-pending', aIn.value.trim() === '');
    };
    markPending();

    const save = () => {
      const cur = { g: gIn.value, a: aIn.value, n: nIn.value };
      if (cur.g === saved.g && cur.a === saved.a && cur.n === saved.n && !gIn.getAttribute('aria-invalid') && !aIn.getAttribute('aria-invalid')) return true;
      const res = saveCapture(store, {
        studentId: row.student.id, subjectId: row.subject.id, periodId: row.periodId, teacherId,
        gradeText: cur.g, absencesText: cur.a, notes: cur.n,
      });
      gIn.removeAttribute('aria-invalid'); aIn.removeAttribute('aria-invalid');
      if (!res.ok) {
        const msgs = [];
        if (res.errors.grade) { gIn.setAttribute('aria-invalid', 'true'); msgs.push(`Calificación: ${res.errors.grade}`); }
        if (res.errors.absences) { aIn.setAttribute('aria-invalid', 'true'); msgs.push(`Faltas: ${res.errors.absences}`); }
        if (res.errors.general) msgs.push(res.errors.general);
        err.textContent = msgs.join(' ');
        err.hidden = false; errRow.hidden = false;
        status.replaceChildren(badge('error', 'Revisar'));
        announce(`No se guardó. ${msgs.join(' ')}`);
        return false;
      }
      err.hidden = true; errRow.hidden = true;
      saved = cur;
      markPending();
      const newRow = { ...row, grade: res.record.grade, absences: res.record.absences };
      const prevClass = status.firstChild?.className;
      const badgeEl = rowBadge(newRow);
      status.replaceChildren(badgeEl, h('span', { class: 'saved' }, ' Guardado ✓'));
      if (badgeEl.className !== prevClass) pop(badgeEl); // confirmación física solo cuando cambia el estado
      setTimeout(() => { const s = status.querySelector('.saved'); if (s) s.remove(); }, 1800);
      toast(`Guardado: ${firstCol.label(row)}`);
      onSaved?.(res.record);
      return true;
    };

    for (const input of [gIn, aIn, nIn]) {
      input.addEventListener('change', save);
      input.addEventListener('input', () => { if (input === gIn || input === aIn) input.classList.toggle('is-pending', input.value.trim() === ''); });
      input.addEventListener('keydown', (e) => {
        const move = (delta) => {
          const target = tbody.querySelector(`input[data-col="${input.dataset.col}"][data-row="${idx + delta}"]`);
          if (target) { target.focus(); target.select?.(); }
        };
        if (e.key === 'Enter') { e.preventDefault(); if (save()) move(e.shiftKey ? -1 : 1); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      });
      input.addEventListener('focus', () => input.select?.());
    }
    return [tr, errRow];
  };

  rows.forEach((r, i) => tbody.append(...buildRow(r, i)));

  return h('div', { class: 'table-wrap' },
    h('table', { class: 'capture' },
      h('caption', { class: 'sr-only' }, caption),
      h('thead', null, h('tr', null,
        h('th', { scope: 'col' }, firstCol.header),
        h('th', { scope: 'col' }, `Calificación (${scale.min}–${scale.max})`),
        h('th', { scope: 'col' }, 'Faltas'),
        h('th', { scope: 'col' }, 'Observaciones'),
        h('th', { scope: 'col' }, 'Estado'))),
      tbody),
    h('p', { class: 'kbd-help' }, h('strong', null, 'Teclado: '), 'Enter guarda y baja a la siguiente fila · Mayús+Enter sube · ↑ ↓ cambian de fila · escribe ', h('kbd', null, 'SD'), ' si el dato se desconoce · vacío = pendiente · ', h('kbd', null, '0'), ' es una calificación válida.'));
}
