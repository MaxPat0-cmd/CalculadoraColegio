import { h, clear, download, toast, select, put } from '../dom.js';
import { STORAGE_KEY } from '../../store.js';
import { planPreview } from '../planPreview.js';

export function backupView(ctx) {
  const root = h('div', { class: 'view' });
  let pending = null; // { backup, plan, choices }

  const render = () => {
    clear(root);
    const { store } = ctx;

    const exportBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => {
      download(`respaldo_alzate_${store.state.activeCycle}_DEMO.backup.json`, store.exportBackupText(), 'application/json');
      toast('Respaldo exportado');
    } }, 'Exportar respaldo (JSON)');

    const file = h('input', { type: 'file', accept: 'application/json,.json', id: 'imp-file', onchange: async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const res = store.planImport(await f.text());
      if (!res.ok) { pending = { errors: res.errors }; render(); return; }
      pending = { backup: res.backup, plan: res.plan, choices: {}, migratedNote: res.migratedNote };
      render();
    } });

    const preview = () => {
      if (!pending) return null;
      if (pending.errors) return h('div', { class: 'banner err', role: 'alert' }, h('strong', null, 'No se puede importar: '), h('ul', null, pending.errors.map((m) => h('li', null, m))));
      const { plan, backup, migratedNote } = pending;
      return h('div', null,
        migratedNote ? h('p', { class: 'banner info' }, `Este respaldo es de una versión anterior. Se omitieron niveles que esta calculadora ya no atiende: ${migratedNote}.`) : null,
        planPreview({
          plan, choices: pending.choices, sourceLabel: 'respaldo',
          info: `Respaldo exportado el ${backup.exportedAt.slice(0, 19).replace('T', ' ')} · versión ${backup.appVersion}${backup.demo ? ' · datos demostrativos' : ''}`,
          onChange: render, onCancel: () => { pending = null; render(); },
          onApply: () => {
            const res = store.applyImport(backup, plan, pending.choices);
            if (!res.ok) { pending = { errors: res.errors }; render(); return; }
            const s = res.summary;
            pending = null;
            toast(`Importado: ${s.added} agregados, ${s.replaced} reemplazados, ${s.kept} conservados`);
            render();
          },
        }));
    };

    put(root, 
      h('section', { class: 'intro' },
        h('p', null, 'Los datos viven solo en este navegador. Exporta respaldos periódicos; al importar, el sistema conserva las relaciones entre alumnos, asignaturas y evaluaciones.')),
      h('section', { class: 'card' }, h('h3', null, 'Exportar'), h('p', null, 'Descarga un archivo JSON con alumnos, catálogos y registros, con suma de verificación.'), exportBtn),
      h('section', { class: 'card' }, h('h3', null, 'Importar'),
        h('p', null, 'Elige un respaldo. Antes de aplicar cualquier cambio verás qué es nuevo, qué es idéntico y qué entra en conflicto.'),
        h('label', { class: 'btn file', for: 'imp-file' }, 'Elegir archivo de respaldo…'), file),
      preview(),
      store.hasUndoSnapshot() ? h('section', { class: 'card' }, h('h3', null, 'Deshacer'),
        h('p', null, 'Se guardó una copia automática justo antes de la última importación.'),
        h('button', { class: 'btn', type: 'button', onclick: () => { const r = store.undoImport(); toast(r.ok ? 'Importación deshecha' : r.error, r.ok ? 'ok' : 'error'); render(); } }, 'Deshacer última importación')) : null,
      h('section', { class: 'card' }, h('h3', null, 'Almacenamiento (limitaciones de v1.5)'),
        h('ul', null,
          h('li', null, `Se guarda en localStorage del navegador (clave «${STORAGE_KEY}»), por navegador, perfil y dominio; limpiar datos del sitio lo borra.`),
          h('li', null, 'Capacidad aproximada de 5 MB; sin cifrado, sin usuarios ni permisos, sin historial de cambios.'),
          h('li', null, 'No hay sincronización entre equipos: el intercambio se hace con respaldos JSON.'),
          h('li', null, 'No es apto para datos reales de menores. Una versión productiva requerirá servidor, autenticación y cumplimiento de protección de datos.')),
        h('button', { class: 'btn danger', type: 'button', onclick: () => {
          if (confirm('Esto reemplazará TODOS los datos actuales por los datos demostrativos originales. ¿Continuar?')) { store.resetDemo(); toast('Datos demostrativos restaurados'); render(); }
        } }, 'Restaurar datos demostrativos')));
  };
  render();
  return { el: root, refresh: render };
}
