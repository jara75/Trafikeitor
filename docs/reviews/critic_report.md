# Critic Review Report (Stage 7)

**Target Document**: `docs/PLAN_REFACTORIZACION_MODULAR.md`  
**Reviewers**: Hostile Design Critic (`egm-design`), Structural Validator (`egm-structural`), Technical Copy Editor (`egm-style`)  
**Standard**: `feature-spec-standard.md`  
**Scope**: FeatureRange (lines 1..223)  
**Date**: 2026-11-11  

---

## Executive Summary

The Stage 7 Critic Review consolidated rigorous audits across System Architecture, Structural Compliance, and Technical Precision. The document **FAILS** the `feature-spec-standard.md` in its current form due to critical architectural flaws and mandatory structural omissions:

1. **Platform Failure (CORS on `file://`)**: Native ES Modules fail to load under `file:///` in all modern browsers due to strict CORS origin policies, breaking the offline double-click capability of the prototype.
2. **Circular Dependencies & Layer Inversion**: Data stores (`catalogs.js`) directly mutate DOM elements and trigger global re-renders (`refreshAllViews`), while views import stores.
3. **ESM Live Binding Mutation Crash**: Exported primitive variables cannot be reassigned by importing modules (`activeOtId = ...` throws `TypeError`).
4. **Mandatory Standard Violations**: Total omission of the Alternatives Rule, Goals & Non-Goals section, and Risks & Mitigations section.
5. **Omission of Core Functions**: 15+ vital orchestration functions (`refreshAllViews`, `initStripboard`, `resetDragState`, etc.) are missing from the function mapping.
6. **Uncalibrated Terminology**: Marketing guarantees ("cero pérdida", "cero regresiones") and product metaphors ("tipo Apple Numbers", "recorte DaVinci") obscure technical contracts.

---

## Consolidated Findings by Category

### Category 1: System Architecture & Platform Feasibility (`egm-design`)

#### Finding 1.1: Local Execution Failure (`file://`) via Native ES Modules CORS
* **Severity**: 🔴 Blocker
* **Affected Scope**: Section 2 (Line 24), Section 8 (Lines 203–207).
* **Technical Rationale**: Modern browsers strictly enforce CORS on native `<script type="module">` loaded via the `file://` protocol (`Access to script from origin 'null' blocked by CORS`). The current single-file HTML opens via double-click without a server. Moving to unbundled ES modules will immediately break local offline usage unless an automated local server or lightweight build step is specified.
* **Remediation**: Either specify a local zero-config development server (`npx serve` / native Node HTTP server) or evaluate a zero-config bundler (`esbuild` / `vite`) to generate a distributable bundle.

#### Finding 1.2: Layer Inversion & Severe Circular Dependencies
* **Severity**: 🔴 Blocker
* **Affected Scope**: Section 2 (Lines 37–42) & Section 3.A/C (Lines 78–88, 98–108).
* **Technical Rationale**: Proposed `js/store/catalogs.js` contains DOM mutation routines (`renderResponsibleSelects`, `renderStatusSelects`) and invokes `refreshAllViews()` (which calls `views/traffic-desk.js` and `views/stripboard-day.js`). In turn, views import stores. This circular dependency causes `ReferenceError: Cannot access 'X' before initialization` in native ES modules.
* **Remediation**: Decouple stores from the DOM completely. Stores must be pure data providers emitting events (`EventTarget` or `CustomEvent`), while views subscribe to store events.

#### Finding 1.3: Immutable Live Bindings in ES Modules
* **Severity**: 🟡 Major
* **Affected Scope**: Section 2 (Line 38) and Section 3.A (Line 87).
* **Technical Rationale**: In ES6, exported bindings are read-only for importers. Code attempting `activeOtId = 'OT-001'` will throw a runtime `TypeError: Assignment to constant variable`.
* **Remediation**: Encapsulate mutable state in a single state object reference (`export const state = { ... }`) or export explicit mutation functions (`setActiveOtId(id)`).

#### Finding 1.4: Critical Omission of Core Orchestration Functions
* **Severity**: 🟡 Major
* **Affected Scope**: Section 3 (Lines 74–129).
* **Technical Rationale**: Key lifecycle and synchronization functions are completely missing from the mapping:
  - `refreshAllViews()` (Line 2649 in `v1.1.html`)
  - Drag indicators: `resetDragState()`, `pauseRowDrag()`, `resumeRowDrag()`, `clearStripDropIndicators()`
  - Stripboard lifecycle: `initStripboard()`, `setStripboardViewMode()`, `selectStripboardDate()`
  - Status management: `deleteStatus()`, `renameStatus()`, `updateStatusColor()`
* **Remediation**: Expand Section 3 to account for 100% of functions and global state variables.

#### Finding 1.5: Window Bridge Race Conditions & Deferred Module Loading
* **Severity**: 🟡 Major
* **Affected Scope**: Section 4 (Lines 131–148).
* **Technical Rationale**: `<script type="module">` execution is deferred by default. The browser parses and renders HTML before modules execute. User clicks on inline handlers (`onclick="openEnvelopeModal()"`) before `main.js` evaluates will trigger `Uncaught TypeError: window.openEnvelopeModal is not a function`.
* **Remediation**: Add a hydration lock until `main.js` emits an initialized signal, and plan a progressive migration to container-level event delegation (`data-action`).

---

### Category 2: Structural & Template Compliance (`egm-structural`)

#### Finding 2.1: Total Omission of Alternatives Considered (The Alternatives Rule)
* **Severity**: 🔴 Blocker
* **Affected Scope**: Missing top-level section.
* **Structural Rationale**: The standard mandates evaluating at least 3 viable alternatives with technical rejection rationales. The plan dictates a single architecture without evaluating bundlers (Vite/esbuild), Web Components, or direct SQLite/Hono migration.
* **Remediation**: Insert a dedicated `## Alternativas Evaluadas` section with trade-off matrices.

#### Finding 2.2: Missing Goals & Non-Goals Section
* **Severity**: 🔴 Blocker
* **Affected Scope**: Pre-Section 1 metadata blockquote.
* **Structural Rationale**: The document lacks explicit project scope boundaries. Non-goals (e.g. no backend migration in this phase, no schema modifications, no visual redesign) must be strictly stated.
* **Remediation**: Add a formal `## Objetivos y Fuera de Alcance` section.

#### Finding 2.3: Missing Risks & Mitigations Section
* **Severity**: 🔴 Blocker
* **Affected Scope**: Missing top-level section.
* **Structural Rationale**: Section 6 lists checklist items, not failure modes and mitigation strategies for HTTP waterfalls, circular dependencies, or namespace collisions.
* **Remediation**: Add an explicit `## Riesgos y Mitigaciones` section.

#### Finding 2.4: Missing Data Flow Diagram
* **Severity**: 🟡 Major
* **Affected Scope**: Section 2.
* **Structural Rationale**: The standard requires visual mapping of data flows and component interactions.
* **Remediation**: Add a Mermaid sequence diagram illustrating user input $\rightarrow$ event delegation $\rightarrow$ state update $\rightarrow$ view re-render.

---

### Category 3: Style, Precision & Tone (`egm-style`)

#### Finding 3.1: Uncalibrated Guarantees and Hyperbolic Claims
* **Severity**: 🟡 Major
* **Affected Scope**: Lines 6, 76, 147, 177, 212.
* **Style Rationale**: Unverifiable claims like *"cero pérdida de estilos"*, *"cero regresiones"*, and *"elimina cualquier riesgo"* must be replaced with measurable engineering targets (e.g. *"preservar la paridad funcional y visual respecto al prototipo"*).

#### Finding 3.2: Imprecise Technical Terminology
* **Severity**: 🟡 Major
* **Affected Scope**: Lines 87 & 133.
* **Style Rationale**: Calling mutable variables *"estado reactivo centralizado"* is incorrect without an observer or proxy engine. Event handlers maintain behavioral/functional compatibility, not *"integridad visual"*.

#### Finding 3.3: Product Analogies & Colloquial Metaphors
* **Severity**: 🟢 Nit
* **Affected Scope**: Lines 16, 18, 30, 33, 45, 54, 105, 119.
* **Style Rationale**: Replace informal metaphors with dry technical descriptors:
  - *"tipo Apple Numbers"* $\rightarrow$ *"agrupación jerárquica con cabeceras colapsables"*
  - *"recorte DaVinci"* $\rightarrow$ *"recorte interactivo de tiras (trimming temporal)"*
  - *"colores resolve"* $\rightarrow$ *"paleta cromática del tema"*
  - *"sellos vintage / efectos retro"* $\rightarrow$ *"estilo gráfico de estampilla (ink-stamp)"*

