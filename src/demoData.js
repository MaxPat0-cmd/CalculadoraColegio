// Datos 100 % FICTICIOS para el prototipo. No contienen información real de menores.
import { LEVELS } from './catalogs.js';
import { DEFAULT_SCALE } from './validation.js';
import { SCHEMA_VERSION, APP_VERSION, createRecord, valueField, unknownField, pendingField } from './models.js';

export const DEMO_CYCLE = '2026-2027';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ['Ana', 'Luis', 'Sofía', 'Mateo', 'Valeria', 'Diego', 'Camila', 'Emiliano', 'Regina', 'Santiago', 'Renata', 'Leonardo', 'Ximena', 'Daniel', 'Paula', 'Andrés', 'Julia', 'Bruno', 'Elena', 'Iker', 'Lucía', 'Axel', 'Mía', 'Tomás'];
const LAST = ['Aldama', 'Beltrán', 'Cordero', 'Dueñas', 'Espinoza', 'Fuentes', 'Galindo', 'Huerta', 'Ibarra', 'Jaramillo', 'Lozano', 'Mercado', 'Navarro', 'Olmos', 'Paredes', 'Quiroz', 'Rangel', 'Salcedo', 'Trujillo', 'Uribe', 'Valdés', 'Zamora', 'Arce', 'Barrera'];

const SUBJECTS = [
  ['pri-esp', 'Español', 'primaria'], ['pri-mat', 'Matemáticas', 'primaria'], ['pri-cie', 'Ciencias Naturales', 'primaria'],
  ['pri-his', 'Historia', 'primaria'], ['pri-ing', 'Inglés', 'primaria'], ['pri-edf', 'Educación Física', 'primaria'],
  ['sec-esp', 'Español', 'secundaria'], ['sec-mat', 'Matemáticas', 'secundaria'], ['sec-cie', 'Ciencias', 'secundaria'],
  ['sec-his', 'Historia', 'secundaria'], ['sec-ing', 'Inglés', 'secundaria'], ['sec-tec', 'Tecnología', 'secundaria'],
  ['cch-mat', 'Matemáticas', 'cch'], ['cch-tlr', 'Taller de Lectura y Redacción', 'cch'], ['cch-fis', 'Física', 'cch'],
  ['cch-his', 'Historia', 'cch'], ['cch-ing', 'Inglés', 'cch'], ['cch-inf', 'Informática', 'cch'],
];

const TEACHERS = [
  ['t-titular-pri', 'Profa. Titular Primaria (demo)', ['primaria'], ['pri-esp', 'pri-mat', 'pri-cie', 'pri-his']],
  ['t-ingles', 'Prof. Inglés (demo)', ['primaria', 'secundaria', 'cch'], ['pri-ing', 'sec-ing', 'cch-ing']],
  ['t-edfisica', 'Prof. Educación Física (demo)', ['primaria'], ['pri-edf']],
  ['t-humanidades-sec', 'Profa. Español e Historia Sec. (demo)', ['secundaria'], ['sec-esp', 'sec-his']],
  ['t-mate', 'Prof. Matemáticas (demo)', ['secundaria', 'cch'], ['sec-mat', 'cch-mat']],
  ['t-ciencias', 'Profa. Ciencias y Física (demo)', ['secundaria', 'cch'], ['sec-cie', 'cch-fis']],
  ['t-humanidades-cch', 'Prof. Humanidades CCH (demo)', ['cch'], ['cch-tlr', 'cch-his']],
  ['t-computo', 'Prof. Cómputo (demo)', ['secundaria', 'cch'], ['sec-tec', 'cch-inf']],
];

const GROUPS = [
  ['pri-4a', 'primaria', 4, 'A', 6], ['pri-5a', 'primaria', 5, 'A', 4],
  ['sec-1a', 'secundaria', 1, 'A', 4], ['sec-2b', 'secundaria', 2, 'B', 6],
  ['cch-1a', 'cch', 1, 'A', 6], ['cch-3a', 'cch', 3, 'A', 4],
];

export function createDemoState(now = new Date('2026-11-11T12:00:00Z')) {
  const rand = mulberry32(20260);
  const state = {
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    demo: true,
    institution: { name: 'Colegio Alzate' },
    cycles: ['2025-2026', DEMO_CYCLE],
    activeCycle: DEMO_CYCLE,
    scale: { ...DEFAULT_SCALE },
    catalogs: {
      levels: LEVELS.map((l) => ({ ...l })),
      groups: GROUPS.map(([id, levelId, grade, name]) => ({ id, levelId, grade, name })),
      teachers: TEACHERS.map(([id, name, levelIds, subjectIds]) => ({ id, name, levelIds, subjectIds })),
      subjects: SUBJECTS.map(([id, name, levelId]) => ({ id, name, levelId })),
      periods: [1, 2, 3].map((n) => ({ id: `p${n}`, name: `Periodo ${n}` })),
    },
    students: [],
    records: {},
  };

  let n = 0;
  for (const [gid, levelId, grade, , count] of GROUPS) {
    for (let i = 1; i <= count; i++) {
      const f = FIRST[(n * 5 + 3) % FIRST.length];
      const l1 = LAST[(n * 7 + 1) % LAST.length];
      const l2 = LAST[(n * 11 + 5) % LAST.length];
      state.students.push({
        id: `DEMO-${gid.toUpperCase()}-${String(i).padStart(2, '0')}`,
        name: `${f} ${l1} ${l2}`,
        levelId, grade, groupId: gid, cycle: DEMO_CYCLE,
      });
      n++;
    }
  }

  // Registros de ejemplo: periodos 1 y 2 casi completos, periodo 3 casi vacío (para ver pendientes).
  const subjectsByLevel = (lv) => state.catalogs.subjects.filter((s) => s.levelId === lv);
  const teacherFor = (subjectId) => state.catalogs.teachers.find((t) => t.subjectIds.includes(subjectId)).id;
  state.students.forEach((st, si) => {
    for (const subj of subjectsByLevel(st.levelId)) {
      for (const [pi, p] of state.catalogs.periods.entries()) {
        const forceZero = si === 0 && subj.id.endsWith('mat') && p.id === 'p1'; // ejemplo: cero capturado
        const forceUnknown = si === 1 && subj.id.endsWith('esp') && p.id === 'p2'; // ejemplo: dato desconocido
        const fill = pi < 2 ? 0.9 : 0.12;
        const roll = rand();
        const grade = valueField(Math.round((6 + rand() * 4) * 10) / 10);
        const absences = rand() < 0.85 ? valueField(Math.floor(rand() * 5)) : pendingField();
        const note = rand() < 0.05 ? 'Observación de ejemplo (dato ficticio).' : '';
        if (roll > fill && !forceZero && !forceUnknown) continue;
        state.records[`${st.cycle}|${st.id}|${subj.id}|${p.id}`] = createRecord({
          studentId: st.id, subjectId: subj.id, teacherId: teacherFor(subj.id), periodId: p.id,
          cycle: st.cycle, groupId: st.groupId,
          grade: forceZero ? valueField(0) : forceUnknown ? unknownField() : grade,
          absences, notes: note,
        }, now);
      }
    }
  });
  return state;
}
