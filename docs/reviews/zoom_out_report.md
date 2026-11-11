# Initial Zoom Out Review Report (Stage 5)

**Target Document**: `docs/PLAN_REFACTORIZACION_MODULAR.md`  
**Reviewer**: Skeptical Architect (`egm-zoom-out`)  
**Standard**: `zoom-out-standard.md`  
**Date**: 2026-11-11  

---

## Executive Summary

The Initial Zoom Out Review evaluated the proposed modularization plan for `mesa_de_tr_fico_sobres_ot v1.1.html` against high-altitude architectural simplicity, YAGNI, codebase reuse, and alignment with project goals. The review identified 2 Blockers, 3 Major issues, and 1 Nit. 

The primary structural concern is a severe architectural disconnect: the modularization plan designs an elaborate multi-file client-side persistence layer for `localStorage` (5 separate store files), directly conflicting with the core mandate in `PLAN_MAESTRO.md`, which defines SQLite (`better-sqlite3` + Drizzle ORM on Hono) as the production persistence engine. Additionally, injecting dozens of module functions back into `window` ("monkey-patching") to accommodate legacy inline HTML attributes defeats modular encapsulation.

---

## Findings

### Finding 1: Architectural Disconnect with Production Goals and Disposable Code
* **Severity**: 🔴 Blocker
* **Affected Scope**: Entire document / Sections 1, 2, and 3.A (Lines 1–88) in relation to `docs/PLAN_MAESTRO.md` (Lines 1–36).
* **Simplicity Rationale**: Violates YAGNI and Root Problem Focus.
  The plan designs a full multi-file client-side persistence layer in 5 files (`store/orders.js`, `store/clients.js`, `store/stripboard-storage.js`, `store/catalogs.js`, `store/state.js`) tightly coupled to `localStorage`. However, the Golden Rule of the project in `PLAN_MAESTRO.md` establishes that `mesa_de_tr_fico_sobres_ot v1.1.html` is frozen as a reference prototype, while production operates on TypeScript, Hono, and SQLite (`better-sqlite3` + Drizzle ORM, already implemented in `src/server/index.ts`).
  Building 5 storage modules for `localStorage` represents disposable duplicate work that will need to be rewritten immediately to consume the server's REST API. The client architecture should connect directly to backend endpoints or decouple storage behind an adapter that respects the real database contract.

---

### Finding 2: Global Window Monkey-Patching Anti-Pattern
* **Severity**: 🔴 Blocker
* **Affected Scope**: Section 4 "Estrategia de Compatibilidad para Llamadas Inline (`onclick`, etc.)" (Lines 131–149).
* **Simplicity Rationale**: Anti-pattern of global namespace pollution.
  The plan proposes exporting clean ES modules only to immediately re-inject dozens of internal functions into `window` (`window.openEnvelopeModal = openEnvelopeModal`, etc.) solely to support legacy inline attributes (`onclick="..."`, `ondrop="..."`).
  This defeats the purpose of modularization, eliminates encapsulation, and creates brittle DOM-to-global coupling. The clean, standard alternative is container-level event delegation (`addEventListener` on root table/view containers), avoiding the exposure of 40+ functions to the global scope.

---

### Finding 3: Hyper-Fragmentation and Over-Engineering in Native ES Modules
* **Severity**: 🟡 Major
* **Affected Scope**: Section 2 "Arquitectura Modular Propuesta" (Lines 23–70).
* **Simplicity Rationale**: Native ES module waterfall and maintenance overhead.
  The plan fractures the application into 24 JavaScript files and 4 CSS files across 5 subdirectories (`store/`, `components/`, `views/`, `modals/`, `utils/`) loaded via `<script type="module">` without a bundler.
  Loading 24+ unbundled native modules in the browser creates HTTP request waterfalls on every reload and complicates dependency tracking. Partitions for 7 separate modal files and 5 isolated components are premature for components under 100 lines. Consolidating into cohesive domain modules (e.g. Desk View, Stripboard Engine, Modals Controller, Core Data/API Bridge) drastically reduces accidental complexity.

---

### Finding 4: Altitude Drop into Implementation Weeds
* **Severity**: 🟡 Major
* **Affected Scope**: Section 3 "Mapeo Exhaustivo de Funciones Existentes" (Lines 74–129).
* **Simplicity Rationale**: Premature detail obscuring architecture.
  The document spends over 55 lines listing low-level helpers (`toIsoDateTime`, `escapeHtml`, `formatShortDayDateLabel`, `fontSafeId`, `badgeStyle`, `stepSelectedMediaItem`).
  Under Zoom Out Standard Rule 3, architectural plans must define subsystem boundaries, data contracts, and data flows, not inventory every minor formatting helper. This inventory adds documentation noise without providing architectural value.

---

### Finding 5: Premature Optimization and Brittle Automated Node DOM Tests
* **Severity**: 🟡 Major
* **Affected Scope**: Section 5, Phase 1 "Respaldo y Suite de Verificación Automatizada" (Lines 164–170).
* **Simplicity Rationale**: Fragile tests with negative return on investment.
  Building an automated Node.js test script to simulate visual browser drag-and-drop interactions and asserting hardcoded literal strings (like `"Andrés J."`) is premature. The Node.js runtime lacks visual coordinate and DragEvent APIs without heavy jsdom emulation, and hardcoding studio-specific default names contradicts the multi-studio requirement in `PLAN_MAESTRO.md`. Visual, manual validation during extraction is simpler and more reliable.

---

### Finding 6: CSS Folder Placement Inconsistency for Tailwind CDN Config
* **Severity**: 🟢 Nit
* **Affected Scope**: Section 2, Line 30 (`css/tailwind.config.js`).
* **Simplicity Rationale**: Platform convention mismatch.
  The application uses the runtime interactive Tailwind CDN (`https://cdn.tailwindcss.com`). Placing a JavaScript configuration file (`tailwind.config.js`) inside the `css/` folder violates standard asset conventions and risks race conditions in the browser if script evaluation order is not strictly controlled before Tailwind initialization.

