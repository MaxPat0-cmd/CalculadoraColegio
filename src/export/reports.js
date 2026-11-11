// Construcción de reportes (datos -> PDF / Excel). Toda salida lleva la leyenda de documento demostrativo.
import { consolidateStudent } from '../consolidation.js';
import { formatField, FIELD } from '../models.js';
import { PdfDocument, textWidth, wrapText } from './pdf.js';
import { buildXlsx } from './xlsx.js';

export const LEGEND = 'DOCUMENTO DEMOSTRATIVO — NO OFICIAL';
export const LEGEND_DETAIL = 'Datos ficticios. Las reglas de evaluación aún no están validadas: no se muestran promedios ni calificaciones finales.';

const levelName = (state, id) => state.catalogs.levels.find((l) => l.id === id)?.name ?? id;
const groupName = (state, id) => {
  const g = state.catalogs.groups.find((x) => x.id === id);
  return g ? `${g.grade}.° ${g.name}` : id;
};

export function buildStudentReport(state, studentId, { now = new Date(), registry } = {}) {
  const c = consolidateStudent(state, studentId, { registry });
  const s = c.student;
  return {
    institution: state.institution.name,
    legend: LEGEND,
    legendDetail: LEGEND_DETAIL,
    generatedAt: now.toISOString(),
    student: { id: s.id, name: s.name, level: levelName(state, s.levelId), grade: s.grade, group: groupName(state, s.groupId), cycle: c.cycle },
    rows: c.rows.map((r) => ({
      subject: r.subject.name,
      period: r.period.name,
      teacher: r.teacher?.name ?? '',
      grade: formatField(r.grade),
      gradeNumber: r.grade.status === FIELD.VALUE ? r.grade.value : null,
      absences: formatField(r.absences),
      absencesNumber: r.absences.status === FIELD.VALUE ? r.absences.value : null,
      state: r.state,
      notes: r.notes,
    })),
    summary: c.summary,
    issues: c.issues.map((i) => i.message),
  };
}

export function studentReportToPdf(report) {
  const doc = new PdfDocument({ title: `Reporte individual — ${report.student.name} — DEMOSTRATIVO` });
  const M = 40; const PW = doc.width - M * 2;
  const cols = [
    { key: 'subject', title: 'Asignatura', w: 140 },
    { key: 'period', title: 'Periodo', w: 62 },
    { key: 'grade', title: 'Calificación', w: 70, right: true },
    { key: 'absences', title: 'Faltas', w: 44, right: true },
    { key: 'notes', title: 'Observaciones', w: PW - 140 - 62 - 70 - 44 },
  ];
  const BOTTOM = 70;
  let y;

  const header = () => {
    doc.text(M, 800, report.institution, { size: 18, bold: true });
    doc.text(M, 782, 'Reporte individual de calificaciones registradas', { size: 11 });
    doc.rect(M, 730, PW, 40, { fill: [1, 0.95, 0.78], stroke: [0.7, 0.5, 0] });
    doc.text(M + 8, 756, report.legend, { size: 10, bold: true, color: [0.4, 0.25, 0] });
    wrapText(report.legendDetail, PW - 16, 7.5).forEach((l, i) => doc.text(M + 8, 744 - i * 9.5, l, { size: 7.5, color: [0.4, 0.25, 0] }));
    y = 712;
  };
  const tableHeader = () => {
    doc.rect(M, y - 5, PW, 17, { fill: [0.9, 0.92, 0.96] });
    let x = M;
    for (const c of cols) {
      doc.text(c.right ? x + c.w - 4 - textWidth(c.title, 9, true) : x + 4, y, c.title, { size: 9, bold: true });
      x += c.w;
    }
    y -= 18;
  };

  header();
  const s = report.student;
  const info = [
    ['Alumno', s.name], ['Matrícula', s.id], ['Nivel', s.level], ['Grado y grupo', s.group], ['Ciclo escolar', s.cycle],
    ['Generado', report.generatedAt.slice(0, 10)],
  ];
  info.forEach(([k, v], i) => {
    const x = M + (i % 2) * (PW / 2); const yy = y - Math.floor(i / 2) * 15;
    doc.text(x, yy, `${k}:`, { size: 9, bold: true });
    doc.text(x + 78, yy, v, { size: 9 });
  });
  y -= 15 * 3 + 12;
  tableHeader();

  for (const r of report.rows) {
    const notes = wrapText(r.notes, cols[4].w - 8, 8);
    const subj = wrapText(r.subject, cols[0].w - 8, 9);
    const lines = Math.max(notes.length, subj.length);
    const h = lines * 11 + 5;
    if (y - h < BOTTOM) { doc.addPage(); header(); tableHeader(); }
    let x = M;
    const pending = r.state !== 'capturado';
    subj.forEach((l, i) => doc.text(x + 4, y - i * 11, l, { size: 9 }));
    x += cols[0].w;
    doc.text(x + 4, y, r.period, { size: 9 });
    x += cols[1].w;
    doc.text(x + cols[2].w - 4 - textWidth(r.grade, 9, !pending), y, r.grade, { size: 9, bold: !pending, color: pending ? [0.55, 0.3, 0] : [0, 0, 0] });
    x += cols[2].w;
    doc.text(x + cols[3].w - 4 - textWidth(r.absences, 9), y, r.absences, { size: 9, color: r.absencesNumber === null ? [0.55, 0.3, 0] : [0, 0, 0] });
    x += cols[3].w;
    notes.forEach((l, i) => doc.text(x + 4, y - i * 11, l, { size: 8 }));
    doc.line(M, y - h + 8, M + PW, y - h + 8, { width: 0.3, color: [0.82, 0.82, 0.82] });
    y -= h;
  }

  const sm = report.summary;
  if (y - 60 < BOTTOM) { doc.addPage(); header(); }
  y -= 8;
  doc.text(M, y, `Registros completos: ${sm.complete} de ${sm.expected}. Calificaciones pendientes: ${sm.pendingGrades}. Desconocidas: ${sm.unknownGrades}. Sin faltas registradas: ${sm.missingAbsences}.`, { size: 8.5 });
  y -= 12;
  doc.text(M, y, 'Este documento no incluye promedios ni resultados finales porque no existe una regla de evaluación validada.', { size: 8.5, color: [0.4, 0.4, 0.4] });

  for (let p = 0; p < doc.pageCount; p++) {
    doc.line(M, 50, M + PW, 50, { page: p });
    doc.text(M, 38, `${report.legend} · ${report.institution}`, { size: 7.5, color: [0.4, 0.25, 0], page: p });
    const label = `Página ${p + 1} de ${doc.pageCount}`;
    doc.text(M + PW - textWidth(label, 7.5), 38, label, { size: 7.5, page: p });
  }
  return doc.finish();
}

const XLSX_HEADERS = ['Matrícula', 'Alumno', 'Nivel', 'Grado', 'Grupo', 'Ciclo escolar', 'Asignatura', 'Docente', 'Periodo', 'Calificación', 'Estado de captura', 'Faltas', 'Observaciones'];

function reportToRows(rep) {
  const s = rep.student;
  return rep.rows.map((r) => [s.id, s.name, s.level, s.grade, s.group, s.cycle, r.subject, r.teacher, r.period, r.gradeNumber ?? r.grade, r.state, r.absencesNumber ?? r.absences, r.notes]);
}

const NOTICE_ROWS = [
  ['Aviso'], [LEGEND], [LEGEND_DETAIL],
  ['«Pendiente»: aún no se captura. «Desconocido»: se indicó que el dato no se conoce. 0 es un valor numérico válido.'],
];

const WIDTHS = [18, 30, 12, 8, 10, 14, 28, 34, 12, 14, 18, 10, 40];

export function studentReportToXlsx(report) {
  return buildXlsx([
    { name: 'Expediente', headerRows: 1, colWidths: WIDTHS, rows: [XLSX_HEADERS, ...reportToRows(report)] },
    { name: 'Aviso', rows: [...NOTICE_ROWS, [], ['Institución', report.institution], ['Generado', report.generatedAt]] },
  ]);
}

/** Concentrado de Control Escolar: una fila por alumno × asignatura × periodo. */
export function concentradoToXlsx(state, studentIds, { now = new Date() } = {}) {
  const rows = [];
  const incidencias = [];
  for (const id of studentIds) {
    const rep = buildStudentReport(state, id, { now });
    rows.push(...reportToRows(rep));
    rep.issues.forEach((m) => incidencias.push([rep.student.id, rep.student.name, m]));
  }
  return buildXlsx([
    { name: 'Concentrado', headerRows: 1, colWidths: WIDTHS, rows: [XLSX_HEADERS, ...rows] },
    { name: 'Incidencias', headerRows: 1, colWidths: [18, 30, 90], rows: [['Matrícula', 'Alumno', 'Incidencia'], ...incidencias] },
    { name: 'Aviso', rows: [...NOTICE_ROWS, [], ['Institución', state.institution.name], ['Generado', now.toISOString()]] },
  ]);
}

export function safeFileName(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'archivo';
}
