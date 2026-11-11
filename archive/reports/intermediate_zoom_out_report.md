# Goldfish Review Report — Stage 8: Intermediate Zoom Out Review

**Target:** `PLAN_MAESTRO.md` (`1..130`, full file)

## Reviewer Status

| Reviewer | Status |
| --- | --- |
| `egm-zoom-out` | completed |

## Prioritized Findings (Blockers -> Major -> Nits)

### 1. Eliminación prematura de `api.php` y `schema.sql` sin portar activos críticos ya resueltos (`extractServerPreview` y modelo relacional real) - Severity: Blocker
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** `Líneas 66-73` (`Estructura de Carpetas Propuesta`) y `Líneas 111-113` (`Fase 1`)
* **Discrepancy Description**: El plan ordena en la Fase 1 (`L113`) borrar `api.php` y `schema.sql` antes de haber portado su lógica a TypeScript (`extractServerPreview` en `api.php` `L67-134` para QuickLook de `.pages`/`.key`/`.numbers`/`.docx`/`.pptx`, PNGs binarios en `.afdesign`/`.afphoto`/`.afpub` y `%PDF-` en `.ai`; más `statuses`, `product` y `route_entry_id` de `schema.sql`).
* **Rationale & Recommendation**: Al resolver las discrepancias de tablas señaladas en Stage 6 y Stage 7, no se debe migrar la tabla multi-tenant `studios` de `schema.sql` (declararla como *Non-Goal* por YAGNI), ni sobre-diseñar colas asíncronas para `extractServerPreview`; basta con lectura por buffers acotados (12 MB máx.) en `media.ts` y conservar `api.php`/`schema.sql` como referencia hasta completar la Fase 3.

### 2. Indecisión arquitectónica y riesgo de sobre-ingeniería al atender los Blockers del Critic Report (`Alternativas`, `Riesgos` y `Base de Datos`) - Severity: Blocker
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** `Líneas 10-18` (`Diagnóstico`), `Líneas 39-41`, `Línea 60` y `Líneas 123-130` (`Tres Decisiones Rápidas`)
* **Discrepancy Description**: El documento mantiene una dualidad indefinida (`PostgreSQL (Docker) / SQLite` en `L14`, `L40`, `L60`, `L125-126`) y deja abierta la infraestructura de producción (`L127-128`). Para un estudio monopuesto con revisiones puntuales de clientes, exigir Docker con PostgreSQL es sobre-ingeniería.
* **Rationale & Recommendation**: Añadir las secciones `## Alternativas Consideradas`, `## Riesgos, Límites y Mitigaciones` y `### Objetivos / No-Objetivos` de forma concisa, y fijar por defecto **SQLite (`better-sqlite3` / LibSQL) con Drizzle ORM** (cero Docker obligatorio, 100% compatible con un único proceso Node.js en VPS), dejando PostgreSQL como alternativa futura si el volumen crece.

### 3. Vacío en el modelo de autorización de Enlaces Compartidos vs. exceso de métodos de autenticación (YAGNI) - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** `Línea 15`, `Líneas 96-104` y `Líneas 129-130`
* **Discrepancy Description**: Proponer Google OAuth y Magic Link (`L100`, `L130`) para un único usuario interno (el Director) viola YAGNI, mientras que la Sección 3 no define cómo un revisor externo sin sesión en `Better Auth` autoriza cambios.
* **Rationale & Recommendation**: Usar exclusivamente **Email + Contraseña en `Better Auth`** para el Director, y definir para clientes externos una tabla `shared_reviews` minimalista con token opaco aleatorio (`share_token`), alcance explícito (`ot_id`, lista JSON de `route_entry_ids` permitidos y flag `allow_full_ot`), fecha de expiración/revocación y un endpoint público acotado (`POST /api/share/:token/stamp`).

### 4. Sobre-ingeniería en la capa de estado y formularios del cliente + riesgo de re-estilizado innecesario con `shadcn/ui` - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** `Líneas 13-17`, `25-30`, `75-92` y `114-115`
* **Discrepancy Description**: El prototipo ya tiene el 100% de sus clases Tailwind, variables `resolve.*`, reglas `@media print` y estilos `.ink-stamp-box`. Reescribir la UI sobre componentes genéricos de `shadcn/ui` arriesga alterar la estética DaVinci Resolve, y usar `React Hook Form` en celdas de edición inline (`onBlur`/`onChange`/`onDrop`) añade complejidad innecesaria.
* **Rationale & Recommendation**: Acotar `shadcn/ui` (o primitivas Radix) a diálogos/overlays accesibles extrayendo directamente el marcado Tailwind y funciones puras del HTML actual; alojar esquemas Zod en `src/shared/schemas.ts`; usar `React Hook Form` solo en modales de creación (Nueva OT); y disparar mutaciones directas de `TanStack Query` en ediciones inline.

### 5. Inconsistencias de topología, árbol de componentes desalineado del prototipo y falta de glosario breve de dominio - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** `Líneas 10-12`, `58-92` y `112-117`
* **Discrepancy Description**: Falta un glosario breve de términos del dominio (`Sobre OT`, `Hoja de Ruta / Bitácora de Relevos`, `Línea`, `Semáforo`, `Stripboard`, `Suites`), existe contradicción entre `apps/api + apps/web` (`L12`) y `src/server + src/client` (`L62-92`), y `envelope/` no refleja las 3 pestañas reales del Sobre Abierto ni las 4 vistas del Stripboard.
* **Rationale & Recommendation**: Añadir un glosario compacto de 5–6 líneas al inicio, unificar la estructura `src/server` + `src/client` + `src/shared`, y alinear el árbol de componentes con las 3 pestañas del Sobre Abierto y las 4 vistas del Stripboard.

