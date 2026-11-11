// Plantilla de acta (Excel) con las columnas que el importador reconoce y filas de ejemplo ficticias.
import { buildXlsx, XS } from '../export/xlsx.js';

export function buildActaTemplate() {
  const head = ['Matrícula', 'Alumno', 'Nivel', 'Grupo', 'Asignatura', 'Periodo', 'Calificación', 'Faltas', 'Observaciones'];
  const sample = [
    ['EJ-0001', 'Pérez Ramos Ana', 'Primaria', '4° A', 'Español', 'Periodo 1', 8.5, 1, ''],
    ['EJ-0001', 'Pérez Ramos Ana', 'Primaria', '4° A', 'Matemáticas', 'Periodo 1', 9, 0, ''],
    ['EJ-0002', 'Soto Vega Luis', 'Primaria', '4° A', 'Español', 'Periodo 1', 'SD', '', 'Dato desconocido'],
  ];
  const notes = [
    ['Cómo llenar esta plantilla'],
    ['• Una fila por alumno, asignatura y periodo. Los datos de ejemplo son ficticios: bórralos.'],
    ['• Matrícula (o cuenta) identifica al alumno y es obligatoria. Nivel: Primaria o Secundaria.'],
    ['• Grupo se escribe como «4° A». Si el grupo no existe, se puede crear al importar.'],
    ['• Calificación vacía = pendiente · SD = dato desconocido · 0 es una calificación válida.'],
    ['• También sirve un acta con una sola materia (elige Asignatura y Periodo al importar) o con una columna por materia.'],
    ['• Antes de aplicar verás qué es nuevo, qué es idéntico y qué entra en conflicto; nada se sobrescribe sin tu decisión.'],
  ];
  return buildXlsx([
    { name: 'Acta', headerRows: 1, colWidths: [14, 28, 12, 9, 22, 12, 13, 8, 30], rows: [head.map((v) => ({ v, s: XS.TH })), ...sample] },
    { name: 'Instrucciones', colWidths: [110], rows: notes.map((r, i) => (i === 0 ? [{ v: r[0], s: XS.BOLD }] : r)) },
  ]);
}
