# Goldfish Review Report — Stage 9: Implementation Readiness Test

**Target:** `PLAN_MAESTRO.md` (`107..130`, DetailedRange)

## Reviewer Status

| Reviewer | Status |
| --- | --- |
| `egm-implementation-readiness` | completed |
| `egm-codebase-details` | completed |
| `egm-style` | completed |

## Prioritized Findings (Blockers -> Major -> Nits)

### 1. Violación de la Regla de Cero Decisiones (`Zero-Decision Rule`) y Afirmación Inexacta sobre Dialectos en Drizzle ORM - Severity: Blocker
* **Reviewer Lens:** `egm-implementation-readiness`, `egm-codebase-details`, `egm-style`
* **Affected Scope:** `Líneas 122-130` (`## 5. Tres Decisiones Rápidas para Arrancar la Fase 1`) y referencias cruzadas en `L12-15`, `L40`, `L99-100`
* **Discrepancy Description**:
  1. El estándar `implementation-readiness-standard.md` exige dejar **cero decisiones arquitectónicas o de diseño al implementador**. La Sección 5 deja abiertas 3 decisiones críticas: motor de base de datos (`PostgreSQL` vs. `SQLite`), entorno de hosting/almacenamiento (`Hostinger VPS` vs. `Railway/Render`) y proveedores de `Better Auth` (`Email + Contraseña` vs. `Google OAuth`).
  2. La `Línea 126` afirma que se puede usar PostgreSQL o SQLite *"con exactamente el mismo código de Drizzle ORM"*, lo cual es técnicamente falso: Drizzle utiliza constructores y tipos específicos por dialecto (`pgTable` de `drizzle-orm/pg-core` frente a `sqliteTable` de `drizzle-orm/sqlite-core`), cambiando `src/server/db/schema.ts`, `src/server/db/index.ts` y `drizzle.config.ts`.
* **Rationale & Recommendation**: Cerrar las decisiones antes de ejecutar la Fase 1, eliminar la sección de preguntas abiertas y documentar el dialecto exacto de Drizzle, las variables de entorno `.env` y el proveedor de autenticación elegido.

### 2. Esquema de Base de Datos Incompleto e Inconsistente respecto al Prototipo, `schema.sql` y `Better Auth` - Severity: Blocker
* **Reviewer Lens:** `egm-implementation-readiness`, `egm-codebase-details`, `egm-style`
* **Affected Scope:** `Líneas 111-112` (y `L67`)
* **Discrepancy Description**: La lista de tablas de la Fase 1 (`users, sessions, clients, orders, order_routes, order_media, stripboard, shared_reviews`) no define columnas, claves ni relaciones, y omite elementos esenciales del código actual:
  1. **Tabla `statuses` omitida**: En el prototipo (`L1325-1558`) y `api.php` (`L173`), los estados son entidades editables `{ id, name, color }` con renombrado en cascada (`renameStatus`) y reasignación a `"En Tránsito"` al eliminar (`deleteStatus`).
  2. **Tablas obligatorias de Better Auth omitidas (`accounts`, `verifications`)**: `Better Auth` requiere `accounts` (donde guarda el hash de contraseña para `emailAndPassword`) y `verifications`.
  3. **Separación `brand` vs. `product` y `legalText`**: En el prototipo (`L778-788`, `L3196-3197`), cada OT tiene tanto `brand` como `product` además de `legalText`, y cada cliente tiene un arreglo `brands: string[]`.
  4. **Estructura de tiras del `stripboard`**: El Stripboard soporta 3 tipos de tiras por fecha (`dateStr`): tiras de OT (`type: 'ot'`, `otId`), bandas de corte/descanso (`type: 'break'`, `title`, `L2004-2038`) y tareas libres sin OT (`type: 'ot'`, `otId: null`, `L2413-2432`). Por tanto, `ot_id` debe ser nullable.
* **Rationale & Recommendation**: Especificar en la Fase 1 las tablas exactas y sus columnas en `src/server/db/schema.ts`: `users`, `sessions`, `accounts`, `verifications`, `clients`, `statuses`, `orders` (con `brand`, `product`, `legal_text`), `order_routes`, `order_media` (con `route_entry_id`, `preview_url`, `preview_kind`, `text_content`), `stripboard_strips` (con `ot_id` nullable y `type: 'ot' | 'break'`) y `shared_reviews`.

### 3. Pérdida del Extractor de Vistas Previas en Servidor (`extractServerPreview`) al eliminar `api.php` - Severity: Blocker
* **Reviewer Lens:** `egm-implementation-readiness`, `egm-codebase-details`, `egm-style`
* **Affected Scope:** `Línea 113` y `Líneas 116-117` (en relación con `api.php` `L67-134`)
* **Discrepancy Description**: Eliminar `api.php` en la Fase 1 sin portar `extractServerPreview` elimina la extracción en servidor de vistas previas para Apple iWork (`.pages`, `.numbers`, `.key`), Office (`.docx`, `.pptx`), Affinity Suite (`.afdesign`, `.afphoto`, `.afpub` escaneando firmas PNG en los primeros 12 MB) y Adobe Illustrator (`.ai` con cabecera `%PDF-`), dejando sin vista previa real a los formatos propietarios en `InlineMediaViewer.tsx`.
* **Rationale & Recommendation**: Especificar en la Fase 3 la creación de `src/server/services/preview-extractor.ts` (portando `extractServerPreview` de `api.php`) integrado en `src/server/routes/media.ts`, y mantener `api.php` como referencia hasta completar dicha migración.

### 4. Ausencia de Especificación de Vistas del Stripboard, Pestañas, Modales Secundarios y Sub-visores en Fase 2 - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness`, `egm-codebase-details`
* **Affected Scope:** `Líneas 114-115` (y `L80-91`)
* **Discrepancy Description**: La Fase 2 resume la migración de 5,131 líneas en una sola viñeta sin enumerar los módulos funcionales que deben preservarse:
  1. **4 Vistas del Stripboard + Impresión Física**: Vista Día (`+ Separador`, `+ Tarea Libre`, `Cargar Pendientes`, `Vaciar plan`), Vista Semana Lun–Sáb (saltando domingos), Vista Timeline/Gantt Diario por 6 pistas departamentales (`classifyDepartmentTrack`, turnos ±30 min) y Vista Mes (cruce con `routes[].deliveryDate`), más el Pool de Pendientes (`Todas | Sin Agendar | En Plan`), píldoras testigo (`getOtScheduledDays`) y hoja `@media print`.
  2. **Conmutadores Grid/Lista y 3 Pestañas del Sobre**: Conmutador `Sobres (Grid)` vs `Lista (Tabla DaVinci)` en Mesa de OTs, conmutador `Grid` vs `List` en Media Pool, y las 3 pestañas del Sobre (`Hoja de Ruta (Pases)`, `Media Pool`, `Brief & Legales`).
  3. **6 Modales secundarios**: Sala de Proyección (`#media-preview-modal` con atajos `Escape`, `ArrowLeft`, `ArrowRight`), Gestor de Estados (`#status-manager-modal`), Modal de Sellos (`#stamp-modal`), Modal Nueva OT (`#new-ot-modal` con autogeneración `OT-26-XXX`), Modal Cliente (`#client-modal`) y Modal Marca (`#brand-modal`).
  4. **Sub-modos de `InlineMediaViewer.tsx`**: Markdown (`Renderizado`/`Raw`), Código (29 extensiones con numeración de líneas y `Vista Web` en iframe sandbox), espécimen tipográfico interactivo (`@font-face` dinámico, slider `12px–72px`, 4 pangramas y caja `contenteditable`), YouTube/Vimeo y fichas técnicas de las 18 extensiones `SUITE_DEFS`.
* **Rationale & Recommendation**: Desglosar en la Fase 2 todos los componentes `.tsx`, vistas, modales y sub-visores requeridos, así como la interfaz de `useTrafficStore.ts`.

### 5. Falta de Frontera Exacta de Archivos (`Create`/`Modify`/`Delete`), Contratos de Endpoints y Plan de Pruebas (`Test Plan`) por Fase - Severity: Blocker
* **Reviewer Lens:** `egm-implementation-readiness`, `egm-codebase-details`
* **Affected Scope:** `Líneas 107-120` y `L57-92`
* **Discrepancy Description**:
  1. **Target Scope & File Boundary**: No se listan las rutas exactas de archivos a crear/modificar/eliminar en cada fase (incluyendo `tsconfig.json`, `vite.config.ts`, `drizzle.config.ts`, `src/shared/schemas.ts`, `src/client/main.tsx`, `src/client/App.tsx`, etc.).
  2. **Contratos de API**: No se especifican los métodos HTTP, rutas, payloads Zod ni respuestas para `orders.ts`, `stripboard.ts`, `media.ts`, `share.ts`, ni el exportador/importador del respaldo JSON v2.3 (`clients`, `orders`, `statuses`, `stripboard`).
  3. **Ausencia total de `Test Plan`**: Ninguna fase incluye criterios de verificación ni casos de prueba (camino feliz y casos borde).
* **Rationale & Recommendation**: Añadir en cada una de las 4 fases: (a) lista explícita de archivos `[Create]`/`[Delete]`, (b) contratos de endpoints y esquemas Zod, y (c) casos de prueba verificables por fase.

### 6. Especificación de Controles UI en `RouteSheetTable.tsx` para Selección y Compartición de Líneas y Tono Editorial - Severity: Nit
* **Reviewer Lens:** `egm-codebase-details`, `egm-style`
* **Affected Scope:** `Líneas 109`, `116-119`, `126`
* **Discrepancy Description**:
  1. En el prototipo HTML actual, la tabla de relevos no tiene aún el control visual para seleccionar 1 o N líneas y generar el enlace compartido ni para filtrar piezas por línea; debe especificarse cómo se integrará en la Fase 4 sin romper las 7 columnas de `RouteSheetTable.tsx`.
  2. Redacción hiperbólica o coloquial en `L109` (*"Para no avanzar a ciegas..."*) y `L117` (*"para no perder ni un solo dato"*).
* **Rationale & Recommendation**: Detallar en la Fase 4 el diseño no intrusivo del disparador de compartición de líneas y sustituir las frases coloquiales por especificaciones técnicas precisas.

