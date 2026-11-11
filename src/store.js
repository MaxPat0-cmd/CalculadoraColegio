// Persistencia local. Estrategia v1.2: un único documento JSON en localStorage del navegador (con adaptador
// intercambiable para pruebas). Un solo mapa `records` indexado por clave natural garantiza que las capturas por
// alumno y por asignatura usen los mismos registros: no hay copias que sincronizar ni duplicados posibles.
import { createDemoState } from './demoData.js';
import { createRecord, recordKey, SCHEMA_VERSION, pendingField } from './models.js';
import { validateRecord } from './validation.js';
import * as cat from './catalogs.js';
import { createBackup, serializeBackup, parseBackup, planImport, applyImport, finalizeImport } from './backup.js';

// Las claves conservan «v0.1» a propósito: así los datos guardados por versiones anteriores siguen disponibles.
export const STORAGE_KEY = 'alzate-calculadora-v0.1';
export const SNAPSHOT_KEY = 'alzate-calculadora-v0.1-antes-de-importar';

export class MemoryAdapter {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

export class Store {
  constructor(adapter = new MemoryAdapter(), { now = () => new Date(), seed = createDemoState } = {}) {
    this.adapter = adapter;
    this.now = now;
    this.seed = seed;
    this.listeners = new Set();
    this.loadWarning = null;
    this.state = null;
    this.load();
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(event) { this.listeners.forEach((fn) => fn(event)); }

  load() {
    const raw = this.adapter.getItem(STORAGE_KEY);
    if (raw == null) {
      this.state = this.seed(this.now());
      this.persist();
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      if (parsed.schemaVersion !== SCHEMA_VERSION) throw new Error(`Esquema ${parsed.schemaVersion} no soportado`);
      this.state = parsed;
    } catch (e) {
      // No se destruye nada: el contenido dañado se conserva en otra clave antes de iniciar con datos demo.
      try { this.adapter.setItem(`${STORAGE_KEY}-danado`, raw); } catch { /* sin espacio */ }
      this.loadWarning = `Los datos guardados no se pudieron leer (${e.message}). Se conservó una copia en «${STORAGE_KEY}-danado» y se cargaron datos demostrativos.`;
      this.state = this.seed(this.now());
      this.persist();
    }
  }

  persist() {
    this.adapter.setItem(STORAGE_KEY, JSON.stringify(this.state));
  }

  reload() { this.load(); this.emit({ type: 'reload' }); }

  /** Restaura los datos demostrativos (pide confirmación en la UI). */
  resetDemo() {
    this.state = this.seed(this.now());
    this.persist();
    this.emit({ type: 'reset' });
  }

  // ---- Registros ----------------------------------------------------------------------------------------

  getRecord(key) { return this.state.records[key] ?? null; }

  findRecord(ref) { return this.getRecord(recordKey(ref)); }

  /**
   * Alta o actualización de un registro. Misma operación para ambas modalidades de captura.
   * Devuelve { ok, record } o { ok:false, errors }.
   */
  upsertRecord(input) {
    const student = this.state.students.find((s) => s.id === input.studentId);
    if (!student) return { ok: false, errors: [`Alumno inexistente: ${input.studentId}`] };
    const ref = { cycle: input.cycle ?? student.cycle, studentId: input.studentId, subjectId: input.subjectId, periodId: input.periodId };
    const key = recordKey(ref);
    const prev = this.state.records[key] ?? null;
    const rec = createRecord({
      ...ref,
      teacherId: input.teacherId,
      groupId: input.groupId ?? student.groupId,
      grade: input.grade ?? prev?.grade ?? pendingField(),
      absences: input.absences ?? prev?.absences ?? pendingField(),
      notes: input.notes ?? prev?.notes ?? '',
      createdAt: prev?.createdAt,
    }, this.now());
    const errors = validateRecord(this.state, rec);
    if (errors.length) return { ok: false, errors };
    this.state.records[key] = rec;
    try {
      this.persist();
    } catch (e) {
      if (prev) this.state.records[key] = prev; else delete this.state.records[key];
      return { ok: false, errors: ['No se pudo guardar en el navegador (¿almacenamiento lleno o bloqueado?). Exporta un respaldo.'] };
    }
    this.emit({ type: 'record', key });
    return { ok: true, record: rec };
  }

  // ---- Catálogos y alumnos -------------------------------------------------------------------------------

  mutate(fn, eventType = 'catalog') {
    const backup = JSON.stringify(this.state);
    const res = fn(this.state);
    if (!res.ok) { this.state = JSON.parse(backup); return res; }
    try { this.persist(); } catch (e) {
      this.state = JSON.parse(backup);
      return { ok: false, error: 'No se pudo guardar en el navegador.' };
    }
    this.emit({ type: eventType });
    return res;
  }

  addCatalogItem(kind, item) { return this.mutate((s) => cat.addCatalogItem(s, kind, item)); }
  updateCatalogItem(kind, id, patch) { return this.mutate((s) => cat.updateCatalogItem(s, kind, id, patch)); }
  removeCatalogItem(kind, id) { return this.mutate((s) => cat.removeCatalogItem(s, kind, id)); }
  addLevel(name) { return this.mutate((s) => cat.addLevel(s, name)); }
  removeLevel(id) { return this.mutate((s) => cat.removeLevel(s, id)); }
  renameLevel(id, name) { return this.mutate((s) => cat.renameLevel(s, id, name)); }
  addStudent(st) { return this.mutate((s) => cat.addStudent(s, st)); }
  updateStudent(id, patch) { return this.mutate((s) => cat.updateStudent(s, id, patch)); }
  removeStudent(id) { return this.mutate((s) => cat.removeStudent(s, id)); }

  setScale(min, max) {
    return this.mutate((s) => {
      if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max <= min) return { ok: false, error: 'Escala inválida: el máximo debe ser mayor que el mínimo (mínimo ≥ 0).' };
      const out = Object.values(s.records).filter((r) => r.grade.status === 'valor' && (r.grade.value < min || r.grade.value > max));
      if (out.length) return { ok: false, error: `${out.length} calificación(es) capturada(s) quedarían fuera de la escala.` };
      s.scale = { ...s.scale, min, max };
      return { ok: true };
    });
  }

  addCycle(cycle) {
    return this.mutate((s) => {
      if (!/^\d{4}-\d{4}$/.test(cycle)) return { ok: false, error: 'Usa el formato AAAA-AAAA (por ejemplo 2026-2027).' };
      if (s.cycles.includes(cycle)) return { ok: false, error: 'Ese ciclo ya existe.' };
      s.cycles.push(cycle); s.cycles.sort();
      return { ok: true };
    });
  }

  // ---- Respaldos ------------------------------------------------------------------------------------------

  exportBackupText() { return serializeBackup(createBackup(this.state, this.now())); }

  planImport(text) {
    const parsed = parseBackup(text);
    if (!parsed.ok) return { ok: false, errors: parsed.errors };
    return { ok: true, backup: parsed.backup, plan: planImport(this.state, parsed.backup) };
  }

  /** Aplica un plan. Guarda antes una copia para poder deshacer. */
  applyImport(backup, plan, choices = {}) {
    const res = applyImport(this.state, plan, choices);
    if (!res.ok) return res;
    const errors = finalizeImport(res.state, backup);
    if (errors.length) return { ok: false, errors };
    const before = JSON.stringify(this.state);
    try { this.adapter.setItem(SNAPSHOT_KEY, before); } catch { /* sin espacio: continúa sin deshacer */ }
    this.state = res.state;
    try { this.persist(); } catch (e) {
      this.state = JSON.parse(before);
      return { ok: false, errors: ['No se pudo guardar el resultado de la importación.'] };
    }
    this.emit({ type: 'import' });
    return { ok: true, summary: res.summary };
  }

  hasUndoSnapshot() { return this.adapter.getItem(SNAPSHOT_KEY) != null; }

  undoImport() {
    const snap = this.adapter.getItem(SNAPSHOT_KEY);
    if (snap == null) return { ok: false, error: 'No hay importación que deshacer.' };
    this.state = JSON.parse(snap);
    this.persist();
    this.adapter.removeItem(SNAPSHOT_KEY);
    this.emit({ type: 'import' });
    return { ok: true };
  }
}
