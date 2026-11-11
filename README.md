# Calculadora Académica Alzate — v0.1 (prototipo demostrativo)

Aplicación web para el **Colegio Alzate** (primaria, secundaria y CCH) que demuestra el flujo completo:
**captura de calificaciones → almacenamiento → consolidación por alumno → reportes**.

> ⚠️ **Versión 0.1 = prototipo.** Usa exclusivamente **datos ficticios**, no contiene reglas de evaluación
> institucionales y todos los documentos generados llevan la leyenda *«DOCUMENTO DEMOSTRATIVO — NO OFICIAL»*.
> **No capturar datos reales de menores.**

Este proyecto es **independiente**: no comparte código, historial ni repositorio con la calculadora universitaria
usada solo como referencia conceptual.

## Cómo ejecutarlo

Requisitos: Node.js ≥ 20 (solo para el servidor local y las pruebas). **No hay dependencias que instalar.**

```bash
npm start          # sirve la app en http://localhost:8080  (PORT=3000 npm start para otro puerto)
npm test           # ejecuta las pruebas automáticas (node:test)
```

Abre `http://localhost:8080` en el navegador. (Los módulos ES requieren HTTP; no funciona con `file://`.
Alternativa: `python3 -m http.server 8080`.)

## Recorrido sugerido de la demostración

1. **Captura por alumno** (`#alumno`): elige nivel *Primaria*, grupo 4.° A, periodo y docente titular. Captura
   calificación y faltas de cada asignatura de un alumno; `Enter` guarda y baja de fila.
2. **Captura por asignatura** (`#asignatura`): elige *Secundaria 2.° B*, docente de Matemáticas, y captura a todo el grupo.
   Los datos capturados en una modalidad aparecen de inmediato en la otra (mismos registros internos).
3. **Control Escolar** (`#control`): busca por matrícula o nombre, filtra *solo incompletos*, abre un expediente,
   genera el **PDF individual** o el **Excel**, y exporta el **concentrado** del filtro actual.
4. **Respaldos** (`#respaldos`): exporta un JSON, modifica algo, impórtalo y observa la vista previa de conflictos.
5. **Catálogos** (`#catalogos`): edita docentes, asignaturas, grupos, periodos, alumnos, escala y ciclos.

## Estado de las funciones

| Función | Estado |
|---|---|
| Configuración académica (nivel, grupo, docente, asignatura, periodo) con catálogos editables | ✅ Implementada (catálogos **demostrativos**) |
| Captura por alumno y por asignatura sincronizadas, sin duplicados | ✅ Implementada |
| Expediente individual (id/matrícula, nivel, grado, grupo, ciclo, registros) | ✅ Implementada |
| Distinción *pendiente* / *desconocido* / *0* | ✅ Implementada |
| Panel de Control Escolar: búsqueda, incompletos, consolidación verificada, incidencias | ✅ Implementada |
| Exportación PDF individual y Excel (individual y concentrado) | ✅ Implementada (formato **demostrativo**) |
| Almacenamiento local + respaldos JSON con vista previa de conflictos y deshacer | ✅ Implementada |
| Motor de evaluación configurable | 🟡 **Solo el contrato y la infraestructura**; sin ninguna regla definida |
| Reglas de evaluación de primaria / secundaria / CCH (ponderaciones, promedios, aprobación, exenciones) | ⏳ **Pendiente de validación institucional** |
| Escala de captura 0–10 | 🟡 Valor **demostrativo** configurable; solo limita lo que se puede teclear |
| Formato oficial de boleta / reporte | ⏳ Pendiente (el PDF actual es una referencia mínima, no el formato oficial) |
| Usuarios, permisos por docente, bitácora, servidor y base de datos | ⏳ Fuera del alcance de v0.1 |
| Calificaciones finales, promedios o resultados oficiales | 🚫 **No se muestran** mientras no exista una regla validada |

## Estructura

```
index.html · styles.css          Interfaz (sin build, sin frameworks)
src/models.js                    Modelos, claves de registro, estados de campo
src/catalogs.js                  Catálogos y alumnos (altas/cambios/bajas con integridad)
src/demoData.js                  Datos 100 % ficticios
src/validation.js                Interpretación de lo capturado + integridad de registros
src/capture.js                   Lógica común de ambas modalidades de captura
src/evaluation.js                Motor de reglas configurable (vacío por diseño)
src/store.js                     Persistencia (localStorage con adaptador intercambiable)
src/backup.js                    Respaldos: exportar, planificar importación, aplicar
src/consolidation.js             Consolidación y búsqueda para Control Escolar
src/export/                      zip.js · xlsx.js · pdf.js · reports.js (sin dependencias)
src/ui/                          Componentes y vistas
tests/                           Pruebas automáticas
docs/ARQUITECTURA.md             Decisiones de diseño y limitaciones
```

Detalles técnicos y decisiones en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).
