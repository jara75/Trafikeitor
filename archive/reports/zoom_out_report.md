# Goldfish Review Report — Stage 5: Initial Zoom Out Review

**Target:** `PLAN_MAESTRO.md` (`1..130`, full file)

## Reviewer Status

| Reviewer | Status |
| --- | --- |
| `egm-zoom-out` | completed |

## Prioritized Findings (Blockers -> Major -> Nits)

### 1. Eliminación de `api.php` y `schema.sql` sin migrar lógica crítica ya implementada (Extractor de Previews de Suites y Modelo de Datos) - Severity: Blocker
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** `Líneas 66-73` y `Líneas 111-113` (`Estructura de Carpetas Propuesta` y `Fase 1`)
* **Discrepancy Description**: En la línea 113 se ordena eliminar `api.php` y `schema.sql` argumentando que no aplican al nuevo stack. Sin embargo, ambos archivos contienen lógica crítica ya implementada que el plan no migra explícitamente:
  1. **Extracción nativa en servidor de vistas previas (`extractServerPreview` en `api.php` líneas 67-134)**: Extrae `QuickLook/Preview.pdf` o `Thumbnail.jpg` desde paquetes ZIP de Apple iWork (`.pages`, `.numbers`, `.key`) y Office (`.docx`, `.pptx`), extrae el PNG embebido en binarios de Affinity (`.afdesign`, `.afphoto`, `.afpub`) y detecta cabeceras `%PDF-` en archivos Adobe Illustrator (`.ai`). El nuevo `src/server/routes/media.ts` no menciona esta extracción.
  2. **Pérdida de entidades y campos del dominio en el esquema propuesto (`L67` y `L112`)**: Omite la configuración de estados personalizables con color (`statuses` en `mesa_de_tr_fico_sobres_ot v1.1.html` líneas 1286-1425 y `api.php` línea 173), la vinculación de archivos a una línea específica de la Hoja de Ruta (`route_line_index` / `route_entry_id` en `schema.sql` líneas 84-85) y el campo `product` separado de `brand` (`mesa_de_tr_fico_sobres_ot v1.1.html` líneas 784-788).
* **Rationale & Recommendation**: Conservar la referencia de `api.php` y `schema.sql` hasta portar explícitamente a `src/server/db/schema.ts` y `src/server/routes/media.ts`: (a) el esquema relacional completo incluyendo `statuses`, `product` y la relación `order_media -> order_routes`, y (b) el extractor de vistas previas de formatos propietarios (`.af*`, `.pages`, `.key`, `.ai`).

### 2. Riesgo de "Big Bang Rewrite" sobre 5,131 líneas de UI funcional e infraestructura sobredimensionada - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** `Líneas 10-18`, `39-41`, `60`, `114-115` y `125-128`
* **Discrepancy Description**:
  1. **Infraestructura vs. Entorno Real (`trafico.elmarcante.com` en Hostinger)**: El plan introduce `docker-compose.yml` con PostgreSQL (`L40`, `L60`) mientras deja indeciso en `L125-128` si se usará Docker o SQLite. Para una herramienta de estudio monopuesto, exigir Docker + PostgreSQL añade fricción operativa innecesaria frente a SQLite (`better-sqlite3` / LibSQL) con Drizzle ORM.
  2. **Subestimación de la Fase 2 (Migración de UI)**: Condensa en un solo ítem portar 5,131 líneas que incluyen 4 vistas del Stripboard (Día, Semana Lun–Sáb, Timeline Gantt por departamento y Calendario Mensual), hoja de impresión física `@media print`, sandbox interactivo de tipografías (`@font-face` dinámico), visor Markdown/código y gestión de clientes/marcas/estados.
* **Rationale & Recommendation**: Fijar SQLite + Drizzle ORM como base por defecto sin contenedores y reutilizar directamente las clases Tailwind, estilos CSS (`@media print`, `.ink-stamp-box`) y funciones puras (`getMediaMeta`, `formatMarkdown`, cálculos de Stripboard) del prototipo en lugar de reemplazarlos por primitivas genéricas de `shadcn/ui`.

### 3. Sobre-ingeniería de estado y formularios en el Frontend (`TanStack Query` + `Zustand` + `React Hook Form` + `Zod`) - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** `Líneas 16-17`, `25-30` y `77-80`
* **Discrepancy Description**: El plan introduce 4 librerías de gestión de estado/formularios en cliente cuando el 90% de las interacciones del prototipo (cabecera de OT, celdas de la Hoja de Ruta, sellos de goma, Brief, Legales y drag & drop del Stripboard) son ediciones inline inmediatas (`onChange` / `onBlur` / `onDrop`), y el único formulario tradicional con envío es el modal de "Nueva OT".
* **Rationale & Recommendation**: Colocar esquemas Zod en `src/shared/schemas.ts` compartidos entre Hono y cliente; usar mutaciones directas de `TanStack Query` para ediciones inline; limitar `React Hook Form` al modal de creación de OT; y usar URL Search Params o un store mínimo para filtros de UI.

### 4. Violación de YAGNI en Login y Vacío Arquitectónico en Seguridad de Enlaces Compartidos - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** `Líneas 15`, `96-104` y `129-130`
* **Discrepancy Description**: Proponer Google OAuth y Magic Link para un único usuario administrador (el Director) viola YAGNI. En contraste, para Clientes y Freelancers externos que acceden mediante enlace compartido sin cuenta (`L101-103`), no se define cómo el token de `share.ts` autoriza mutar el sello (`[ APROBADO ]` / `[ AJUSTES ]`) y dejar comentarios únicamente en las líneas compartidas sin exponer el resto de las OTs.
* **Rationale & Recommendation**: Implementar exclusivamente Email + Contraseña en `Better Auth` para el Director, y definir en la Sección 3 el modelo de seguridad basado en tokens criptográficos acotados a `ot_id` y `route_entry_ids` con permisos explícitos para lectura y estampado de revisión.

### 5. Desalineación del Árbol de Componentes respecto a la Disposición Real del Prototipo - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** `Líneas 81-92` (`Estructura de Carpetas Propuesta`)
* **Discrepancy Description**: El árbol de `envelope/` describe `BriefLegalPanel.tsx` como "Columna izquierda (Brief, Textos Legales, Dropzone)", pero en `mesa_de_tr_fico_sobres_ot v1.1.html` (`L753-1005`) el Sobre Abierto se divide en 3 pestañas (`Hoja de Ruta + Previsualización Directa`, `Media Pool`, `Brief & Legales`). Además, `stripboard/` no desglosa sus 4 vistas (`DayView`, `WeekView`, `GanttView`, `MonthView`) ni el `PendingPoolPanel`.
* **Rationale & Recommendation**: Alinear los nombres y descripciones del árbol de componentes con las 3 pestañas reales del Sobre Abierto y las 4 vistas del Stripboard.

