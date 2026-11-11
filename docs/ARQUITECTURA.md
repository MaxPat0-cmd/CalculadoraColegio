# Arquitectura — Calculadora Académica Alzate v1.4

## Tecnología elegida y por qué

**JavaScript moderno (módulos ES) sin framework, sin bundler y sin dependencias en tiempo de ejecución.**

- El prototipo debe poder abrirse en cualquier equipo escolar con solo un navegador: nada que instalar ni compilar.
- La lógica de negocio (`src/*.js` fuera de `src/ui`) no toca el DOM, por lo que se prueba con `node:test` sin
  navegador y se podrá reutilizar tal cual en un backend o en un framework (React, Vue…) cuando crezca.
- Excel y PDF se generan con escritores mínimos propios (ZIP "store" + Office Open XML; PDF 1.4 con fuentes estándar).
  Evita dependencias y CDN (funciona sin internet) a cambio de un diseño visual sencillo. Si el formato oficial exige
  tipografías, imágenes o diseños complejos, se podrá sustituir `src/export/pdf.js` por una biblioteca sin tocar el resto.
- Costo de esta decisión: la interfaz se escribe con un helper `h()` propio; para una app mucho mayor convendrá un framework.

## Capas y responsabilidades

| Capa | Archivos | Responsabilidad |
|---|---|---|
| Modelos de datos | `models.js` | Forma de alumno/registro, clave natural, estados de campo |
| Catálogos académicos | `catalogs.js`, `demoData.js` | Niveles, grupos, docentes, asignaturas, periodos, alumnos |
| Captura y validaciones | `validation.js`, `capture.js` | Texto → campo tipado; integridad; lógica común de ambas modalidades |
| Motor de evaluación | `evaluation.js` | Contrato de reglas configurables; vacío en v0.1 |
| Persistencia | `store.js`, `backup.js` | localStorage, respaldos, importación segura |
| Consolidación | `consolidation.js` | Reúne y verifica registros por alumno; búsqueda |
| Exportaciones | `export/*` | PDF, XLSX, concentrado |
| Interfaz | `ui/*`, `index.html`, `styles.css` | Vistas y componentes |

Las dependencias van en un solo sentido: `ui → store/capture/consolidation/export → models/validation`.

## Decisiones clave

### 1. Un solo registro por (ciclo, alumno, asignatura, periodo)
Todos los registros viven en un mapa `state.records` indexado por la **clave natural**
`ciclo|matrícula|asignatura|periodo`. Las dos modalidades de captura leen y escriben **la misma entrada**:
no hay copias que sincronizar y los duplicados son imposibles por construcción.

### 2. Tres estados de un campo
`{status:'pendiente'|'desconocido'|'valor', value:number|null}`.
- **Pendiente**: aún no se captura (campo vacío).
- **Desconocido**: se declara que el dato no se conoce (se teclea `SD` o `?`).
- **Valor**: número, incluido el **0**, que nunca se trata como vacío.
Aplica a calificación y faltas. Un registro está *completo* solo si ambos tienen valor.

### 3. Integridad en la escritura **y** en la lectura
`validateRecord` verifica que alumno, asignatura, docente y periodo existan, que el **ciclo** del registro sea el del
alumno, que el **grupo** coincida y que la asignatura sea del **nivel** del alumno. Se ejecuta al guardar, al importar y
de nuevo al consolidar: lo que no corresponde se **excluye y se reporta como incidencia**, nunca se mezcla
(p. ej. un registro de otro ciclo).

### 4. Evaluación: capturado ≠ calculado ≠ oficial
`evaluation.js` define el contrato `{id, name, validated, compute()}` y un `RuleRegistry` asignable por nivel.
No se registra **ninguna** regla: sin regla, la consolidación muestra únicamente calificaciones capturadas por periodo.
Un resultado calculado lleva `official:false` salvo que la regla tenga `validated:true`. La interfaz y los reportes
declaran explícitamente que no hay calificación final oficial.

### 5. Almacenamiento y limitaciones
`localStorage` con un único documento JSON versionado (`schemaVersion`). El adaptador es intercambiable
(`MemoryAdapter` en pruebas). Las claves conservan «v0.1» para no perder datos de versiones anteriores. Limitaciones (también en la pantalla *Respaldos*):

- Datos por navegador/perfil/dominio; borrar datos del sitio los elimina. Sin sincronización entre equipos.
- ~5 MB de capacidad (sobra para el demo; no para un colegio completo con varios ciclos).
- Sin cifrado, usuarios, permisos ni bitácora de cambios: **no apto para datos reales**.
- Si el JSON guardado está dañado, se conserva copia en `…-danado` antes de iniciar con datos demo.
- Si un guardado falla (cuota/bloqueo), el cambio en memoria se revierte y se avisa al usuario.
- Una versión productiva requiere servidor, base de datos, autenticación, roles y cumplimiento de protección de datos.

### 6. Respaldos e importación sin sobrescrituras silenciosas
El respaldo es JSON con `format`, `schemaVersion`, suma de verificación y todo el estado académico. Importar es un
proceso en dos pasos: **plan** (cada elemento = *nuevo / idéntico / conflicto*, más errores de integridad) y **aplicación**.
Los conflictos se **conservan como están** salvo decisión explícita por elemento. Se aplica sobre una copia, se revalida
todo el resultado y, si algo falla, no se cambia nada. Antes de aplicar se guarda una copia para **deshacer**.

### 7. Seguridad y privacidad
- Los datos del demo son inventados; el repositorio no contiene datos reales.
- En Excel las cadenas se guardan como texto en línea (nunca fórmulas); todo el contenido se escapa en XML/PDF.
- La interfaz construye el DOM con `textContent`/nodos de texto (sin `innerHTML`), evitando inyección HTML.
- El servidor de desarrollo solo sirve archivos estáticos y bloquea `.git`, `tests` y `scripts`.

## Interfaz y accesibilidad
Navegación por pestañas, enlace "saltar al contenido", foco visible, etiquetas en todos los campos, estados con **texto
e icono** (no solo color), errores asociados al campo con `role="alert"`, aviso de guardado con región `aria-live`,
tema claro/oscuro automático, tablas con desplazamiento horizontal y diseño verificado en ancho de tableta (768 px).
Captura por teclado: `Enter`/`Mayús+Enter`/`↑`/`↓` para moverse entre filas; guardado al confirmar o salir del campo.

## Onboarding y perfil (v1.4)
- `src/onboarding.js` (puro, probado): roles, opciones de nivel, `ensureLevel`, modalidad y pantalla de arranque.
- Rol → **Docente** (pregunta nivel y, si hay varios, quién eres), **Control Escolar** o **Explorar**.
- *Bachillerato* se enlaza con el nivel CCH del catálogo. *Preescolar*, *Universidad* u *Otro* se crean **vacíos**: no se
  inventan grupos, alumnos ni reglas; la pantalla de Inicio muestra una lista de pasos para configurarlos.
- Primaria arranca en captura **por alumno** (titular); el resto, **por asignatura**.
- El perfil se guarda por dispositivo (`alzate-profile-v1`), no es una cuenta ni forma parte de los respaldos.

## Estilo: Liquid Glass sobre pasteles (v1.4)
Fondo de malla pastel fijo + materiales translúcidos (`backdrop-filter: blur() saturate()`) con reflejo especular
(`radial-gradient` arriba-izquierda), borde de luz (`inset` claro) y sombras en capas. Jerarquía por material: barra y
tarjetas (delgado) < hojas y onboarding (grueso). Fallbacks: `prefers-reduced-transparency`, `prefers-contrast: more` y
navegadores sin `backdrop-filter` usan superficies sólidas. Logo: texto «UA» en serif con degradado (`background-clip: text`).

## Movimiento y sensación de uso
Aplicación de los principios de *apple-design* (WWDC *Designing Fluid Interfaces*):

| Principio | Dónde |
|---|---|
| Respuesta inmediata (feedback al presionar, no al soltar) | `installPress` en `ui/motion.js`; `:active` sin transición en CSS |
| Manipulación directa 1:1 con el punto de agarre | `ui/sheet.js` (Pointer Events + `setPointerCapture`) |
| Interrumpibilidad: siempre desde el valor presentado, velocidad heredada | `Spring.to()` en `physics.js`; probado en `tests/physics.test.js` |
| Resortes (amortiguamiento + respuesta), crítico por defecto, rebote solo con impulso | `physics.js`, `sheetRelease` |
| Momentum: proyección exponencial `v/1000·d/(1−d)` y rubber-banding | `project`, `rubberband` |
| Simetría espacial (entra y sale por el mismo camino) | hoja desde abajo; siguiente/anterior alumno entran por su lado |
| Materiales y profundidad | barra de pestañas translúcida, hojas, avisos; fondo que se aleja |
| Tipografía por tamaño | tracking negativo en títulos, positivo en texto pequeño; leading inverso al tamaño |
| Accesibilidad | `prefers-reduced-motion` / `-transparency` / `-contrast`; `inert` y foco devuelto en hojas |

Solo se animan `transform` y `opacity`. En v1.4 se añadieron `stagger`, `countTo`, `slideOut` y el control segmentado (`ui/segmented.js`). La física (`src/physics.js`) no depende del DOM y está probada con un reloj
simulado; `src/ui/motion.js` la conecta al DOM y a `prefers-reduced-motion`. No hay carruseles ni drawers en la app:
la hoja del expediente es el único componente de gestos.

## Pruebas (`npm test`)
Integridad de registros y prevención de duplicados · sincronía entre modalidades · pendiente/desconocido/cero ·
validaciones · rollback ante fallo de almacenamiento · persistencia y datos dañados · consolidación y exclusión de
registros de otro ciclo · motor de reglas (sin reglas, no validada, validada) · respaldos (ida y vuelta, idempotencia,
conflictos, deshacer, alteración, integridad) · exportación (estructura de PDF/XLSX/ZIP, paginación, escapes).

## Cómo incorporar las reglas reales más adelante
1. Definir con el colegio la regla de cada nivel y validarla institucionalmente.
2. Implementarla como `{ id, name, validated, compute({student, subject, records, params}) }` en un archivo nuevo.
3. Registrarla (`registry.register(...)`, `registry.assign('secundaria', id, params)`) en `src/ui/app.js`.
4. Marcarla `validated:true` **solo** tras la aprobación; hasta entonces sus resultados salen como «NO OFICIAL».
5. Añadir pruebas con casos aprobados por Control Escolar.
