# Goldfish Review Report — Stage 7: Critic Review

**Target:** `PLAN_MAESTRO.md` (`1..106`, FeatureRange)

## Reviewer Status

| Reviewer | Status |
| --- | --- |
| `egm-design` | completed |
| `egm-structural` | completed |
| `egm-style` | completed |

## Prioritized Findings (Blockers -> Major -> Nits)

### 1. Ausencia de la sección obligatoria de Evaluación de Alternativas (`The Alternatives Rule`) - Severity: Blocker
* **Reviewer Lens:** `egm-design`, `egm-structural`
* **Affected Scope:** `Líneas 1-106` (Específicamente tras `## 1. Diagnóstico` en `L8-18` y `## 2. Arquitectura` en `L21-92`)
* **Discrepancy Description**: El estándar `feature-spec-standard.md` exige una evaluación formal de alternativas viables con razones técnicas concretas de rechazo. El documento presenta como única vía una reescritura total a React + shadcn/ui + Hono + Drizzle + Better Auth y la justifica por referencia externa ("el Stack de Nicolás"), sin evaluar por qué se descartaron: (a) evolucionar el backend PHP/SQL existente (`api.php` + `schema.sql`) para Hostinger compartido, (b) modularizar incrementalmente en Vite + TypeScript vanilla sin reescribir las 5,131 líneas a React, y (c) SQLite embebido frente a PostgreSQL en Docker.
* **Rationale & Recommendation**: Incorporar una sección H2 `## Alternativas Consideradas y Trade-offs` que documente las opciones evaluadas y las razones técnicas, operativas y de infraestructura por las que se eligen o descartan.

### 2. Ausencia Total de Sección de Riesgos, Límites y Mitigaciones (`Risks & Limits`) - Severity: Blocker
* **Reviewer Lens:** `egm-design`, `egm-structural`
* **Affected Scope:** `Líneas 21-105` (Secciones 2 y 3)
* **Discrepancy Description**: El documento carece de la sección obligatoria de Riesgos y Mitigaciones y omite riesgos críticos de arquitectura:
  1. **Seguridad y autorización en Enlaces Compartidos (`L96-104`)**: Usuarios anónimos con el enlace pueden estampar `[ APROBADO ]` / `[ AJUSTES ]` y abrir la OT completa. No se define expiración/revocación de tokens, rate limiting, registro de autoría sin sesión ni separación de permisos entre token de línea y token de sobre.
  2. **Extracción binaria de vistas previas y almacenamiento local (`/uploads`, `L36-37`, `L72`, `L88`)**: No se especifica cómo se portará `extractServerPreview` de `api.php` a Node.js sin bloquear el Event Loop al procesar archivos pesados (`.afdesign`, `.pages`, `.ai`), ni cuotas de disco, validación MIME o persistencia frente a contenedores efímeros.
  3. **Incompatibilidad de infraestructura en Hostinger compartido**: Node.js + Docker/PostgreSQL no corren en un plan de hosting compartido solo-PHP.
* **Rationale & Recommendation**: Añadir una sección H2 `## Riesgos, Límites y Mitigaciones` detallando el modelo de seguridad de tokens compartidos, el procesamiento seguro de archivos en `/uploads` y los requisitos de infraestructura en producción.

### 3. Omisión de `Problem Statement` y `Goals & Non-Goals` (Objetivos y No-Objetivos) - Severity: Major
* **Reviewer Lens:** `egm-design`, `egm-structural`
* **Affected Scope:** `Líneas 1-19` (`## 1. Diagnóstico`)
* **Discrepancy Description**: La Sección 1 salta directamente a una tabla comparativa de librerías sin declarar formalmente el problema de negocio ni acotar qué entra y qué queda fuera del alcance (por ejemplo, si el soporte multi-estudio `studios` de `schema.sql`, la impresión física `@media print` del Stripboard y el importador/exportador JSON entran en el alcance).
* **Rationale & Recommendation**: Estructurar la Sección 1 con subsecciones explícitas: `### 1.1. Declaración del Problema`, `### 1.2. Objetivos (Goals)` y `### 1.3. Fuera de Alcance (Non-Goals)`.

### 4. Inconsistencias en Topología de Repositorio, Diagrama Arquitectónico y Tablas del Esquema Drizzle - Severity: Major
* **Reviewer Lens:** `egm-design`, `egm-structural`, `egm-style`
* **Affected Scope:** `Línea 12`, `Línea 34`, `Línea 67` y `Líneas 58-92`
* **Discrepancy Description**:
  1. **Contradicción de estructura de proyecto**: La `Línea 12` menciona `apps/api + apps/web`, mientras que las `Líneas 58-92` definen un único paquete con `src/server/` y `src/client/`.
  2. **Incompletitud del diagrama Mermaid (`L34`)**: El nodo `API` lista `/api/orders, /api/stripboard, /api/share`, omitiendo `/api/media` (`media.ts` en `L72`), `/api/clients` y `/api/statuses`.
  3. **Inconsistencia de tablas en `schema.ts` (`L67` vs. `L112`)**: La `Línea 67` lista 6 tablas `(users, sessions, orders, routes, media, shares)`, omitiendo `clients`, `statuses`, `stripboard_strips` y las tablas requeridas por Better Auth (`accounts`, `verifications`).
* **Rationale & Recommendation**: Unificar la estructura `src/server` + `src/client` en todo el documento, sincronizar los nodos del diagrama Mermaid con todas las rutas de `src/server/routes/`, y listar las tablas exactas y completas de `schema.ts`.

### 5. Referencias Coloquiales Externas, Hipérbole y Asimetría de Subencabezados - Severity: Nit
* **Reviewer Lens:** `egm-structural`, `egm-style`
* **Affected Scope:** `Líneas 4`, `10`, `13-17`, `21`, `54-55` y `81-92`
* **Discrepancy Description**:
  1. Se usa `"el Stack de Nicolás"` (`L10`, `L21`) sin contexto autónomo.
  2. Expresiones subjetivas o redundantes: `"congelado e intacto"` (`L4`), `"(100% lograda)"` (`L13`), `"sin errores silenciosos"` (`L17`), `"archivo pequeño y blindado"` (`L55`).
  3. El subencabezado `### Estructura de Carpetas Propuesta` (`L54`) carece de numeración jerárquica (`### 2.2.`) y falta `### 2.1.` antes del diagrama Mermaid (`L23`).
  4. Faltan en el árbol de componentes (`L81-92`) los modales de gestión de Clientes, Marcas, Estados, Sellos y Backup/Restauración JSON.
* **Rationale & Recommendation**: Sustituir referencias coloquiales y adjetivos hiperbólicos por descripciones técnicas objetivas, numerar simétricamente los subencabezados H3 (`### 2.1.`, `### 2.2.`) e incluir los modales administrativos en el árbol de componentes.

