# Calculadora Académica Alzate — v1.3 (demostrativo)

Aplicación web para el **Colegio Alzate** (primaria, secundaria y CCH) que demuestra el flujo completo:
**captura de calificaciones → almacenamiento → consolidación por alumno → reportes**.

> ⚠️ **Versión 1.3 = demostrativa.** Usa exclusivamente **datos ficticios**, no contiene reglas de evaluación
> institucionales y todos los documentos generados llevan la leyenda *«DOCUMENTO DEMOSTRATIVO — NO OFICIAL»*.
> **No capturar datos reales de menores.**

Este proyecto es **independiente**: no comparte código, historial ni repositorio con la calculadora universitaria
usada solo como referencia conceptual.

## Novedades de la versión 1.3 — interfaz fluida (apple-design)
- **Resortes en lugar de curvas ease**: pestañas con indicador deslizante, avisos, barra de avance, entradas de vista y
  confirmación «pop» al completar una fila. Todo parte del valor actual y es interrumpible.
- **Expediente como hoja arrastrable** (Control Escolar): seguimiento 1:1 del dedo, momentum proyectado al soltar,
  rubber-banding en el borde, se puede volver a tomar a mitad de camino; el fondo se atenúa y se aleja según el progreso real.
- **Respuesta inmediata**: botones y pestañas reaccionan al posar el dedo, no al soltarlo; se cancela si el dedo se aleja.
- **Materiales translúcidos** (barra de pestañas, hojas, avisos) y **tipografía** con tracking y leading según el tamaño.
- **Accesibilidad**: `prefers-reduced-motion` (solo fundidos), `prefers-reduced-transparency` y `prefers-contrast: more`.
- Detalles en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md#movimiento-y-sensación-de-uso).

## Novedades de la versión 1.2
- Reporte individual en **PDF y Excel** con el formato del reporte de referencia: título por nivel
  («COLEGIO ALZATE C.C.H.»), encabezado azul, filas alternadas, columnas centradas, observaciones y línea de firma
  de Orientación / Control Escolar, más la leyenda de documento demostrativo.
- La versión aparece en el encabezado de la aplicación. Si tras publicar no ves los cambios, recarga sin caché
  (`Ctrl + F5`, o `Cmd + Shift + R` en Mac).
- Los datos guardados por versiones anteriores se conservan (las claves de almacenamiento no cambian).

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
| Exportación PDF y Excel individual con el formato del reporte de referencia, y Excel concentrado | ✅ Implementada (formato **demostrativo**, no oficial) |
| Almacenamiento local + respaldos JSON con vista previa de conflictos y deshacer | ✅ Implementada |
| Motor de evaluación configurable | 🟡 **Solo el contrato y la infraestructura**; sin ninguna regla definida |
| Reglas de evaluación de primaria / secundaria / CCH (ponderaciones, promedios, aprobación, exenciones) | ⏳ **Pendiente de validación institucional** |
| Escala de captura 0–10 | 🟡 Valor **demostrativo** configurable; solo limita lo que se puede teclear |
| Formato oficial de boleta / reporte | ⏳ Pendiente (el PDF/Excel siguen un reporte de referencia, no un formato oficial) |
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
