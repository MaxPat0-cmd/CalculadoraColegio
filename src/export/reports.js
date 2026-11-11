// Construcción de reportes (datos -> PDF / Excel). Toda salida lleva la leyenda de documento demostrativo.
import { consolidateStudent } from '../consolidation.js';
import { formatField, FIELD } from '../models.js';
import { PdfDocument, textWidth, wrapText } from './pdf.js';
import { buildXlsx } from './xlsx.js';

export const LEGEND = 'DOCUMENTO DEMOSTRATIVO — NO OFICIAL';
/** Título del encabezado según el nivel: «COLEGIO ALZATE C.C.H.», «… PRIMARIA», «… SECUNDARIA». */
export function institutionTitle(institution, levelId, levelName) {
  const suffix = levelId === 'cch' ? 'C.C.H.' : String(levelName ?? '').toUpperCase();
  return `${String(institution).toUpperCase()} ${suffix}`.trim();
}

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
    title: institutionTitle(state.institution.name, s.levelId, levelName(state, s.levelId)),
    legend: LEGEND,
    legendDetail: LEGEND_DETAIL,
    generatedAt: now.toISOString(),
    levelId: s.levelId,
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

const NAVY = [0, 0.125, 0.376];
const GRAY = [0.33, 0.33, 0.33];
const BORDER = [0.82, 0.85, 0.9];
const ZEBRA = [0.945, 0.96, 0.98];

/**
 * PDF individual. Diseño inspirado en el reporte de referencia del colegio: título centrado en azul marino,
 * encabezado de tabla azul con texto blanco, filas alternadas, calificaciones centradas, observaciones y línea
 * de firma de Orientación / Control Escolar. Añade la leyenda de documento demostrativo.
 */
export function studentReportToPdf(report) {
  const doc = new PdfDocument({ title: `Reporte individual — ${report.student.name} — DEMOSTRATIVO` });
  const M = 40; const PW = doc.width - M * 2; const CX = doc.width / 2;
  const cols = [
    { title: 'Asignatura', w: 250, align: 'left' },
    { title: 'Calificación', w: 85, align: 'center' },
    { title: 'Faltas', w: 70, align: 'center' },
    { title: 'Periodo', w: PW - 250 - 85 - 70, align: 'left' },
  ];
  const BOTTOM = 80;
  const center = (x, w, str, y, opt = {}) => doc.text(x + (w - textWidth(str, opt.size ?? 9, opt.bold)) / 2, y, str, opt);
  let y;

  const header = (first) => {
    const t = report.title;
    doc.text(CX - textWidth(t, 17, true) / 2, 792, t, { size: 17, bold: true, color: NAVY });
    const sub = 'REPORTE INDIVIDUAL DE CALIFICACIONES Y ASISTENCIA';
    doc.text(CX - textWidth(sub, 9.5, true) / 2, 772, sub, { size: 9.5, bold: true });
    doc.rect(M, 744, PW, 16, { fill: [1, 0.95, 0.78], stroke: [0.7, 0.5, 0] });
    const lg = `${report.legend} · datos ficticios`;
    doc.text(CX - textWidth(lg, 8.5, true) / 2, 749, lg, { size: 8.5, bold: true, color: [0.4, 0.25, 0] });
    y = 722;
    if (!first) return;
    const s = report.student;
    const pairs = (items, yy) => {
      let x = M;
      for (const [k, v] of items) {
        doc.text(x, yy, `${k}:`, { size: 9, bold: true });
        x += textWidth(`${k}: `, 9, true) + 3;
        doc.text(x, yy, v, { size: 9 });
        x += textWidth(v, 9) + 16;
      }
    };
    pairs([['Alumno(a)', s.name]], y);
    pairs([['Grupo', s.group], ['Nivel', s.level], ['Ciclo escolar', s.cycle], ['Matrícula', s.id]], y - 14);
    y -= 40;
  };

  const tableHeader = () => {
    doc.rect(M, y - 8, PW, 24, { fill: NAVY });
    let x = M;
    for (const c of cols) {
      if (c.align === 'center') center(x, c.w, c.title, y, { size: 9, bold: true, color: [1, 1, 1] });
      else doc.text(x + 8, y, c.title, { size: 9, bold: true, color: [1, 1, 1] });
      x += c.w;
    }
    y -= 8;
  };

  const placeholder = (str, isValue) => ({ size: 9, bold: isValue, color: isValue ? [0, 0, 0] : GRAY });

  header(true);
  tableHeader();
  let n = 0;
  for (const r of report.rows) {
    const subj = wrapText(r.subject, cols[0].w - 16, 9);
    const note = r.notes ? wrapText(`Obs.: ${r.notes}`, cols[0].w - 16, 7.5) : [];
    const h = Math.max(26, subj.length * 11 + note.length * 9.5 + 12);
    if (y - h < BOTTOM) { doc.addPage(); header(false); tableHeader(); n = 0; }
    if (n % 2 === 1) doc.rect(M, y - h, PW, h, { fill: ZEBRA });
    doc.rect(M, y - h, PW, h, { stroke: BORDER, width: 0.5 });
    let x = M;
    for (let i = 0; i < cols.length - 1; i++) { x += cols[i].w; doc.line(x, y, x, y - h, { color: BORDER }); }
    const mid = y - h / 2 - 3;
    const top = y - 14 - (subj.length > 1 || note.length ? 0 : (h - 26) / 2);
    subj.forEach((l, i) => doc.text(M + 8, top - i * 11, l, { size: 9 }));
    note.forEach((l, i) => doc.text(M + 8, top - subj.length * 11 - i * 9.5, l, { size: 7.5, color: GRAY }));
    x = M + cols[0].w;
    center(x, cols[1].w, r.grade, mid, placeholder(r.grade, r.gradeNumber !== null));
    x += cols[1].w;
    center(x, cols[2].w, r.absences, mid, placeholder(r.absences, r.absencesNumber !== null));
    x += cols[2].w;
    doc.text(x + 8, mid, r.period, { size: 8, color: GRAY });
    y -= h; n++;
  }

  const sm = report.summary;
  const paras = [
    [`Observaciones: «Pendiente» indica que el dato aún no se captura; «Desconocido», que se declaró como no disponible; 0 es una calificación válida. Registros completos: ${sm.complete} de ${sm.expected}.`, 'Observaciones:'],
    [`${report.legendDetail} Documento informativo: no constituye boleta oficial ni calificación final. Verificar contra las actas originales antes de su entrega.`, null],
  ].map(([text, bold]) => ({ lines: wrapText(text, PW, 8), bold }));
  const need = paras.reduce((a, p) => a + p.lines.length * 10 + 8, 0) + 70;
  if (y - need < BOTTOM - 20) { doc.addPage(); header(false); }
  y -= 18;
  for (const p of paras) {
    p.lines.forEach((l, i) => {
      if (i === 0 && p.bold && l.startsWith(p.bold)) {
        doc.text(M, y, p.bold, { size: 8, bold: true, color: GRAY });
        doc.text(M + textWidth(`${p.bold} `, 8, true), y, l.slice(p.bold.length).trimStart(), { size: 8, color: GRAY });
      } else doc.text(M, y, l, { size: 8, color: GRAY });
      y -= 10;
    });
    y -= 8;
  }
  y -= 36;
  doc.line(M, y, M + 190, y, { width: 0.8, color: [0, 0, 0] });
  doc.text(M, y - 12, 'Orientación / Control Escolar', { size: 9 });

  for (let p = 0; p < doc.pageCount; p++) {
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
