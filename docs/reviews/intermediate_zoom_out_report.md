# Intermediate Zoom Out Review Report (Stage 8)

**Target Document**: `docs/PLAN_REFACTORIZACION_MODULAR.md`  
**Reviewer**: Skeptical Architect (`egm-zoom-out`)  
**Standard**: `zoom-out-standard.md`  
**Date**: 2026-11-11  

---

## Executive Architectural Verdict: REJECTED (Restructuring Required)

The Intermediate Zoom Out Review evaluated the cumulative findings from Stage 5 (Initial Zoom Out), Stage 6 (Comprehension), and Stage 7 (Critic / Structural / Style), cross-referencing `docs/PLAN_MAESTRO.md` and the existing backend codebase in `src/server/index.ts`. 

The high-level architecture proposed in `docs/PLAN_REFACTORIZACION_MODULAR.md` **is not viable in its current form** and must be fundamentally restructured before detailed implementation planning can proceed. The proposal introduces three critical macro-level dead-ends:

1. **Massive Disposable Work (YAGNI & Scope Inversion)**: Designing 5 multi-file stores coupled strictly to `localStorage` when the repository already possesses a functioning TypeScript + Hono + SQLite production backend (`src/server/index.ts`). This client-side storage layer will have to be completely discarded and rewritten to connect to the backend REST endpoints.
2. **Platform Inviability (CORS on `file://`)**: Justifying unbundled native ES Modules to "preserve project portability" is technically invalid. Modern browsers apply strict CORS origin checks that block `<script type="module">` on the `file:///` protocol. Since a local web server is strictly required in all cases, attempting to avoid standard tools (like Vite or the existing server) eliminates double-click convenience while introducing runtime waterfalls.
3. **Hyper-Fragmentation & Execution Deadlocks**: Fracturing 5,200 lines across 28 files without a bundler creates circular dependencies between stores and DOM views, immutable live binding assignment errors (`TypeError`), and global namespace pollution via `window` monkey-patching that defeats modularity.

---

## Architectural Findings

### Finding 1: Total Architectural Disconnect & Disposable Code (`localStorage` vs SQLite Backend)
* **Severity**: 🔴 Blocker
* **Affected Scope**: Section 2 (Lines 37–42) and Section 3.A (Lines 78–88).
* **Simplicity Rationale**: The project already has an active production backend in `src/server/index.ts` with SQLite WAL (`trafico.db`), Drizzle ORM, authentication (Better Auth), and active endpoints for `/api/work-orders`, `/api/clients`, `/api/statuses`, and `/api/stripboard`. Building 5 files of client-side `localStorage` logic directly violates the Golden Rule in `PLAN_MAESTRO.md` and creates 100% disposable code. The data tier should consist of a single decoupled Data Bridge / API Client supporting both local mock fallback and direct connection to the existing Hono API.

### Finding 2: Platform Inviability: CORS Block on `file://` with Native ES Modules
* **Severity**: 🔴 Blocker
* **Affected Scope**: Section 2 (Lines 23–25) and Section 8 (Lines 203–207).
* **Simplicity Rationale**: Modern browser security policies strictly block `<script type="module">` from `file:///` origins (`blocked by CORS policy`). The application cannot be opened by double-clicking `index.html`. Because a local HTTP server is unavoidable, standard modern tooling (such as Vite on port 5173, as already anticipated in the backend's CORS configuration) solves module loading, type safety, and bundling in a single stroke without architectural acrobatics.

### Finding 3: Layer Inversion & Circular Dependencies in ES Modules
* **Severity**: 🔴 Blocker
* **Affected Scope**: Section 2 (Lines 37–42) and Section 3.A/C (Lines 78–88, 98–108).
* **Simplicity Rationale**: Data store modules (`js/store/catalogs.js`) directly mutate DOM nodes (`renderResponsibleSelects`) and trigger global view repaints (`refreshAllViews`), while views import stores. This circular dependency causes immediate `ReferenceError: Cannot access 'X' before initialization` exceptions. Additionally, reassigning exported primitives triggers `TypeError: Assignment to constant variable` due to immutable ESM live bindings.

### Finding 4: Premature Hyper-Fragmentation into 28 Files
* **Severity**: 🟡 Major
* **Affected Scope**: Section 2 "Estructura de Archivos" (Lines 26–70).
* **Simplicity Rationale**: Dividing 5,200 lines into 24 JS files and 4 CSS files without a bundler adds immense maintenance overhead. Splitting 7 modal files (many under 40 lines) and 5 individual row components is unnecessary over-engineering. The system must be consolidated into 4–5 cohesive domain modules:
  1. `Core / State & Event Bus`
  2. `Data Bridge (API / Local Mock)`
  3. `Traffic Desk View`
  4. `Stripboard Engine View`
  5. `Modals & Media Viewer Controller`

### Finding 5: Global Window Monkey-Patching Defeats Encapsulation
* **Severity**: 🟡 Major
* **Affected Scope**: Section 4 "Estrategia de Compatibilidad para Llamadas Inline" (Lines 131–149).
* **Simplicity Rationale**: Re-exporting 40+ module functions into `window` solely to preserve legacy `onclick` attributes breaks modular encapsulation and introduces race conditions with deferred `<script type="module">` execution. The standard solution is container-level event delegation (`data-action`) on root DOM nodes.

### Finding 6: Missing Orchestration and Reactive Data Flow
* **Severity**: 🟡 Major
* **Affected Scope**: Section 3 (Lines 74–129) and Section 5 (Lines 151–207).
* **Simplicity Rationale**: The plan inventories low-level utilities but omits the data flow architecture, lifecycle coordination (`refreshAllViews`), drag-and-drop state machines, and reactive view update mechanisms.

---

## Mandatory Restructuring Directives

Before proceeding to implementation:
1. **Align with the TypeScript/Hono Workspace**: Integrate client modularization with the existing project workflow in `package.json` (using Vite or Hono's static server).
2. **Replace 5 `localStorage` Stores with a Single Data Bridge**: Create an interface that connects directly to the `src/server/index.ts` endpoints with a local mock fallback.
3. **Consolidate to ~5 Domain Modules**: Eliminate hyper-fragmentation into 28 unbundled files.
4. **Eliminate the Global `window` Bridge**: Implement container-level event delegation (`data-action`).
5. **Establish Strict Unidirectional Data Flow**: Data/Event updates $\rightarrow$ Views re-render $\rightarrow$ User interactions trigger actions. Zero DOM mutations inside the data layer.

