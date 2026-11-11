# Comprehension Review Report (Stage 6)

**Target Document**: `docs/PLAN_REFACTORIZACION_MODULAR.md`  
**Reviewer**: Naive Reader (`egm-comprehension`)  
**Date**: 2026-11-11  

---

## What this proposes
The document outlines a refactoring plan to dismantle a 6,750-line single-file web application (`mesa_de_tr_fico_sobres_ot v1.1.html`) into a modular client-side architecture using native browser ES Modules, dedicated CSS files, and a clean semantic `index.html`. It establishes an eight-stage phased migration—spanning automated test baselines, stylesheet extraction, store and utility modularization, component separation, and view refactoring—while preserving functional parity using a temporary global `window` bridge for legacy inline DOM events. The plan enforces strict safety gates to preserve UI layout (an 11-column table), centralized catalog synchronization, and interactive schedule/Gantt trimming behavior.

## How the existing system works, per this document
The existing system is a monolithic, all-in-one HTML file containing inline CSS (Tailwind CDN, Google Fonts, print rules, and retro effects), markup for multiple views and eight modal dialogs, and over 5,200 lines of inline JavaScript. It operates as an operational agency traffic desk and production stripboard, managing work orders (OTs), routes, media pools, and scheduling across day, week, month, and Gantt timeline views. All application state, master catalogs (statuses, responsibles, departments, clients), and scheduling data are managed in-memory and persisted client-side via browser `localStorage`.

---

## Findings

### Finding 1: Undefined Storage Key Reference
* **Severity**: 🟡 Major
* **Affected Scope**: Section 6, Punto 3 (`resolve_traffic_stripboard_v2`, lines 217–218).
* **Discrepancy Description & Rationale**: The safety gate states that dropping a row must update both the `orders` array index and the day strips in `resolve_traffic_stripboard_v2`. However, `resolve_traffic_stripboard_v2` is never defined or mentioned anywhere else in the document. A reader cannot determine whether this refers to a `localStorage` key, an internal object, or a function, nor which module (`js/constants.js` or `js/store/stripboard-storage.js`) is responsible for encapsulating it.

### Finding 2: Unstated External Dependency on Previews Backend
* **Severity**: 🟡 Major
* **Affected Scope**: Section 6, Punto 5 ("backend de previsualizaciones", lines 219–220).
* **Discrepancy Description & Rationale**: Safety Gate 5 introduces an unstated external dependency: *"deben permanecer listas para la integración con el backend de previsualizaciones"*. Up to this point, the document specifies a purely client-side static web application with `localStorage` and native ES Modules. The document does not define this backend, its interface, or whether mock endpoints or API client modules are required.

### Finding 3: Unstated Execution Harness for Node.js Automated DOM Tests
* **Severity**: 🟡 Major
* **Affected Scope**: Section 5, Fase 1 ("Suite de Verificación Automatizada", lines 164–170).
* **Discrepancy Description & Rationale**: Phase 1 mandates writing an automated Node.js test script to validate catalog integrity, DOM table columns, and drag-and-drop order updates against the monolithic HTML file before proceeding. Because Node.js lacks a native DOM environment and browser event pipeline, this assumes unstated workflow prerequisites and tooling (e.g., JSDOM, Playwright, or Puppeteer) without specifying how the monolithic HTML file is to be loaded or executed by Node.js.

### Finding 4: Unspecified Reactivity and State Propagation Mechanism
* **Severity**: 🟡 Major
* **Affected Scope**: Section 2 (lines 38–39) and Section 3.A (lines 87–88, `js/store/state.js`).
* **Discrepancy Description & Rationale**: The plan places global variables (`dragState`, `currentTableSort`, etc.) into `js/store/state.js` and labels it *"Estado reactivo centralizado"*. In native browser ES Modules, exported primitive variables provide read-only live bindings and do not trigger reactive UI re-renders on mutation. The document does not define the reactivity mechanism (e.g., CustomEvent bus, observer pattern, pub/sub store, or manual render calls), leaving state propagation across views and components unspecified.

### Finding 5: Tailwind CDN Script vs. CSS Folder Placement Friction
* **Severity**: 🟢 Nit
* **Affected Scope**: Section 2 (line 30) and Section 5 (lines 173–177, `css/tailwind.config.js`).
* **Discrepancy Description & Rationale**: The architecture proposes placing `tailwind.config.js` inside the `css/` folder. When using Tailwind Play CDN, configuration is supplied as a JavaScript object before the CDN script executes, not as a stylesheet. Storing a JS configuration file inside `css/` without clarifying how `index.html` loads and evaluates it introduces unnecessary cognitive friction.

### Finding 6: Domain-Specific Metaphors Without Inline Definitions
* **Severity**: 🟢 Nit
* **Affected Scope**: Section 1 (line 17), Section 2 (lines 51, 54), Section 3 (lines 105, 112), Section 5 (lines 197, 200), Section 6 (line 218).
* **Discrepancy Description & Rationale**: The document uses domain-specific jargon and software metaphors without brief definitions:
  * *"Árbol Master Bin"*: Mentioned as a tree filter without defining what categories or bin structures it encompasses.
  * *"Recorte DaVinci en Gantt"*: Used as a metaphor for timeline clip trimming; technical interaction details (start/end drag handles, time-slot snapping) are not explicitly described.
  * *"Testigo Stripboard"* (`renderModalStripboardWitness`): Used without explaining what the "witness" element represents inside the work order envelope modal (a cross-reference schedule indicator).

