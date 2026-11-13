# Plan de Implementación v2.0.0: Sistema de Revisión Colaborativa y Notas Ancladas ("Compartir para Revisar") en Trafikeitor

> **Estado:** v2.0.0 — Alineado a la arquitectura real de 3 capas de Trafikeitor (**Hono + Drizzle ORM + SQLite + Better Auth + Vanilla JS ES Modules + Tailwind + Vite**).

---

## 1. Visión y Arquitectura

Dotar a cada **Orden de Trabajo (OT)** y a sus piezas en el **Media Pool (`media_files`)** de un flujo de revisión visual y aprobación externa estilo *Adobe Share for Review* / *Frame.io*, 100% propietario sobre SQLite y Vanilla JS.

### Principios de Diseño y UX (Estética DaVinci Resolve / El Marcante)
* **Cero fricción de acceso:** El cliente recibe un enlace único (`/review/:token`) servido por una página HTML ligera y autocontenida (`review.html` + `src/client/review-viewer.js`), reutilizando los tokens oscuros y acentos (`#0BA2AC` / `amber` / `resolve-*`) de `styles.css`.
* **Anclaje espacial relativo:** Los pines se guardan en coordenadas normalizadas (`0.0000` a `1.0000`) con contra-escalado dinámico (`transform: translate(-50%, -50%) scale(${1 / zoom})`).
* **Soporte Universal de Piezas:**
  * **Imágenes (`image`):** `<img>` directo con zoom/paneo Vanilla JS (`wheel`, `pointerdown`, `pointermove`).
  * **Suites nativas (`.afdesign`, `.psd`, `.ai`, `.key`, etc.):** Reutilización automática de `preview_url` (`.preview.png` extraído por el servidor en `/api/studio/upload`) como capa base para anclar pines sin requerir el software nativo.
  * **Documentos PDF (`pdf`):** Renderizado por página (`pageNumber`) en `<canvas>` base mediante `pdfjs-dist` bajo la misma capa overlay de pines.
* **Inmutabilidad por versiones:** Al subir una nueva versión (`v2`, `v3`) vinculada al mismo `version_group_id` en `media_files`, los pines de `v1` permanecen congelados y `v2` inicia con lienzo limpio.
* **Cierre Operativo Automático ("Cierre Mágico"):** Al aprobar o solicitar cambios desde `/review/:token`, el backend asienta automáticamente el movimiento en `route_entries` con sello retro (`APROBADO` o `AJUSTES`) y actualiza `work_orders.status`.

---

## 2. Modelo de Datos (Drizzle ORM + SQLite en `src/server/db/schema.ts`)

No se crea una tabla paralela `ot_deliverables`; se extiende `media_files` y `shared_reviews`, y se añaden únicamente `review_threads` y `review_messages`:

1. **Extensión de `media_files`:**
   - `version_group_id TEXT` (agrupa `v1`, `v2`, `v3` de una misma pieza).
   - `version_number INTEGER NOT NULL DEFAULT 1`.
   - `review_status TEXT NOT NULL DEFAULT 'draft'` (`'draft' | 'in_review' | 'changes_requested' | 'approved'`).
2. **Extensión de `shared_reviews`:**
   - `media_file_id TEXT` (nullable: permite compartir una pieza/versión específica o mantener compatibilidad con enlaces de OT completa).
3. **Nueva tabla `review_threads`:**
   - `id TEXT PRIMARY KEY` (UUID)
   - `organization_id TEXT`
   - `media_file_id TEXT NOT NULL REFERENCES media_files(id) ON DELETE CASCADE`
   - `pin_number INTEGER NOT NULL` (secuencial por `media_file_id`)
   - `x_percent REAL NOT NULL` (`0.0000` a `1.0000`)
   - `y_percent REAL NOT NULL` (`0.0000` a `1.0000`)
   - `page_number INTEGER NOT NULL DEFAULT 1`
   - `is_resolved INTEGER NOT NULL DEFAULT 0`
   - `resolved_by_name TEXT`
   - `created_at TEXT NOT NULL`
4. **Nueva tabla `review_messages`:**
   - `id TEXT PRIMARY KEY` (UUID)
   - `organization_id TEXT`
   - `media_file_id TEXT NOT NULL REFERENCES media_files(id) ON DELETE CASCADE`
   - `thread_id TEXT REFERENCES review_threads(id) ON DELETE CASCADE` (`NULL` = comentario general)
   - `author_user_id TEXT` (`NULL` si es invitado externo)
   - `author_name TEXT NOT NULL`
   - `author_role TEXT NOT NULL` (`'agency' | 'client'`)
   - `content TEXT NOT NULL`
   - `created_at TEXT NOT NULL`

### Protección Crítica en `POST /api/studio/sync`
`POST /api/studio/sync` **no** debe ejecutar `DELETE FROM work_orders` ni `DELETE FROM media_files` globales por organización, ya que activaría `ON DELETE CASCADE` sobre `shared_reviews` y `review_threads` y borraría metadatos de versionado. Se reemplaza por **upsert incremental** (`INSERT ... ON CONFLICT(id) DO UPDATE SET ...`), eliminando únicamente las filas cuyo `id` haya sido explícitamente retirado del payload y preservando `version_group_id`, `version_number` y `review_status`.

---

## 3. Arquitectura Backend (Hono + Better Auth + SSE)

### 3.1. Rutas Privadas (`/api/studio/reviews/*`, protegidas con sesión Better Auth)
- `POST /api/studio/reviews/share`: Crea o reutiliza un enlace `shared_reviews` para una pieza (`mediaFileId`) o versión, marca `media_files.review_status = 'in_review'` y devuelve `{ token, url }`.
- `POST /api/studio/reviews/version`: Sube una nueva versión (`v2`, `v3`) vinculada al `version_group_id` de una pieza existente, incrementa `version_number` y actualiza `shared_reviews.media_file_id` al nuevo archivo (manteniendo la versión anterior accesible en el selector de versiones).
- `GET /api/studio/reviews/ot/:otId`: Lista enlaces activos, versiones y conteo de pines por pieza de la OT.
- `PATCH /api/studio/reviews/share/:token/revoke`: Revoca un enlace público.

### 3.2. Rutas Públicas (`/api/public/review/:token/*`, sin login requerido)
- `GET /api/public/review/:token`: Retorna OT, pieza activa (usando `preview_url` si es suite nativa), lista de versiones del `version_group_id`, hilos (`review_threads`) y mensajes (`review_messages`).
- `POST /api/public/review/:token/threads`: Crea un pin (`xPercent`, `yPercent`, `pageNumber`) y su primer mensaje. Detecta sesión Better Auth (`authorRole: 'agency'`) o invitado (`authorRole: 'client'`, exigiendo `authorName`). Emite evento SSE `NEW_THREAD`.
- `POST /api/public/review/:token/messages`: Añade respuesta a un hilo (`threadId`) o comentario general. Emite evento SSE `NEW_MESSAGE`.
- `PATCH /api/public/review/:token/threads/:threadId/resolve`: Marca/desmarca un pin como resuelto. Emite evento SSE `PIN_RESOLVED`.
- `POST /api/public/review/:token/decision`: Registra decisión (`'approved' | 'changes_requested'`):
  - Actualiza `media_files.review_status`.
  - Inserta automáticamente una fila en `route_entries` de la OT con sello `APROBADO` o `AJUSTES`, firma `authorName` y notas de resumen.
  - Actualiza `work_orders.status` a `'Aprobado'` (terminal) o al estado operativo de ajustes (`'Diseño'` / `'Desarrollo'` según disciplina).
  - Emite evento SSE `STATUS_CHANGED`.
- `GET /api/public/review/:token/stream`: Canal SSE (`text/event-stream`) por `token` / `version_group_id` con heartbeat y limpieza al desconectar.

---

## 4. Arquitectura Frontend (Multi-Entrada Vite + Vanilla JS)

### 4.1. Configuración Multi-Entrada (`vite.config.ts` y `src/server/index.ts`)
- `vite.config.ts`:
  - `build.rollupOptions.input`: `{ main: 'index.html', review: 'review.html' }`.
  - Middleware en dev server para reescribir `/review/:token` hacia `/review.html`.
- `src/server/index.ts`:
  - `app.get('/review/:token', ...)` sirve `./dist/review.html` (si existe en producción) o `./review.html`.

### 4.2. Visor Público (`review.html` + `src/client/review-viewer.js`)
- **Header:** Identificador de OT, selector de versiones (`v1`, `v2`), controles de zoom (`-`, `100%`, `+`, `Ajustar`), paginador PDF (cuando `fileType === 'pdf'`), toggle de pines resueltos y botones **"Solicitar Cambios"** / **"Aprobar Pieza"** (`#0BA2AC`).
- **Área Central (70%):** Contenedor con zoom/paneo Vanilla JS (`wheel` + `pointerdown`/`pointermove`), capa base (`<img>`, `preview_url` o `<canvas>` de `pdfjs-dist`) y capa overlay con pines numerados y contra-escalados (`scale(1 / zoom)`).
- **Panel Lateral (30%):** Lista de hilos sincronizada (clic en pin resalta y hace scroll al hilo; clic en hilo centra el pin y cambia de página si es PDF) + chat general + captura única de nombre de invitado en `localStorage` (`trafikeitor_guest_name`).

### 4.3. Integración en Sobre OT (`src/client/modals-controller.js`)
- En cada pieza del Media Pool: botón **"Compartir para Revisar"** (copia `/review/:token` y muestra badge de estado `En Revisión` / `Ajustes` / `Aprobado`) y botón **"Subir nueva versión (v2)"** cuando la pieza ya pertenece a un `version_group_id`.

---

## 5. Fases de Ejecución

### Fase 1: Esquema SQLite, Migración Segura y Protección de `sync`
- [x] Actualizar `src/server/db/schema.ts` y `src/server/db/index.ts` con las columnas de versionado en `media_files`, `media_file_id` en `shared_reviews`, y las nuevas tablas `review_threads` y `review_messages`.
- [x] Refactorizar `POST /api/studio/sync` en `src/server/index.ts` a upsert no destructivo para `work_orders` y `media_files` (preservando IDs, `version_group_id`, `version_number`, `review_status` y cascadas).

### Fase 2: API Privada/Pública, SSE y Cierre Automático
- [x] Implementar endpoints privados `/api/studio/reviews/*` (compartir, subir nueva versión, listar, revocar).
- [x] Implementar endpoints públicos `/api/public/review/:token/*` (consulta, pines, mensajes, resolver, decisión con inserción en `route_entries` + actualización de `work_orders.status`, y stream SSE).

### Fase 3: Multi-Entrada Vite/Hono, Visor Público (`review.html`) y Botones en Sobre OT
- [x] Instalar `pdfjs-dist` y configurar multi-entrada en `vite.config.ts` + ruta `GET /review/:token` en `src/server/index.ts`.
- [x] Crear `review.html` y `src/client/review-viewer.js` (zoom/pan Vanilla JS, capa base imagen/`preview_url`/`pdfjs-dist`, pines normalizados, hilos + SSE + modal nombre invitado + aprobación/cambios).
- [x] Integrar botones **"Compartir para Revisar"** y **"Nueva versión (v2)"** en `src/client/modals-controller.js` y `src/client/data-bridge.js`.

### Fase 4: Validación E2E Automatizada
- [x] Crear y ejecutar `scripts/verify-collaborative-review.ts` sobre BD aislada (`/tmp/trafico_test_review.db`) validando:
  1. Subida física de pieza v1 y generación de enlace `/review/:token`.
  2. Persistencia de metadatos tras `POST /api/studio/sync` (cero pérdida de `shared_reviews` / `review_threads`).
  3. Creación de pines normalizados y respuestas híbridas (invitado externo vs usuario Better Auth) + resolución de pin.
  4. Subida de versión v2 preservando congelados los pines de v1.
  5. Cierre automático ("Aprobar Pieza" y "Solicitar Cambios") verificando el asiento en `route_entries` y el cambio en `work_orders.status`.
- [x] Ejecutar `npx tsc --noEmit && npm run build` con salida `0`.
