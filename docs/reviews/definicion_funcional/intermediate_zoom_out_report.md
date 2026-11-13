# Stage 8 — Intermediate Zoom-Out Review Report (v2.0)

**Target:** `docs/definici_n_funcional_y_roles_de_trafikeitor.md` (v2.0, lines 1–129)
**Reviewer:** `egm-zoom-out` (`615adbeb-9826-4dd3-911a-cf547e5c6e4b`)

---

## 🔴 Blocker (Must resolve before writing an implementation plan)

1. **Core Product Philosophy vs. Multi-Role Complexity & Privilege Inversion** (`§1`, `§3.2`, `§3.3`, `§3.6`)
   - `§1` frames Trafikeitor as a lightweight solo cockpit, yet `§3.2–§3.3` introduce an interactive `client` role with a personal Stripboard, OT/sub-OT creation, and route passes, plus `member` `*` toggle and explicit-enablement flags.
   - Privilege inversion: external `client` users can create OTs and route passes (affecting delivery commitments), while internal `member` collaborators cannot modify delivery dates or create OTs. Server-side invite binding (`?invite=TOKEN` -> role / `allowed_client_id`) is unspecified.

2. **Whole-Snapshot Sync (`POST /api/studio/sync`) Contradicts Multi-User Scoping & Concurrency** (`§3.3`, `§3.7`, `§4.3`)
   - `§4.3`'s `client_id` SQL filter breaks `member` route-based scoping across multiple clients (`De: -> Para:` in `routes[]`).
   - Shared catalogs (`statuses`, `clients`) and `stripboardCache` (keyed only by `dateStr` without `userId`) risk overwrites/deletions under concurrent 250ms debounced syncs.
   - Client-side `createOt()` (`ordersCache.length + 1`) collides on OT IDs under scoped views and concurrent edits.

3. **Unresolvable Data Model & UI Contradictions (`Fila Unificada`, `Stripboard Día`, `Para:` Auto-Routing)** (`§4.1`, `§4.2`, `§5`)
   - No derivation rule specifies how `Fila Unificada` (11 cols) resolves `Entrada`, `Entrega`, `Notas`, `Descripción`, or `Responsable` from multiple `Hoja de Ruta` rows.
   - `Stripboard Día` forces the exact 11-column OT table, contradicting `§5`'s manual personal time-blocking sheet.
   - `§4.1` (L93) auto-places sub-OTs into a recipient's Stripboard via `Para:` department strings without defining department-to-`userId` mapping and contradicting `§5`'s manual projection.

---

## 🟡 Major (Design, schema, and clarity gaps to close before planning)

1. **Sub-OTs (`OT-26-XXX-1`) vs. Existing `routes[]` & Shared Media Pool** (`§4.1`)
2. **Schema Drift Against `src/client` (`core-state.js`, `defaultOrders`, `routes[]`)** (`§4.2`, `§4.3`)
3. **Unspecified Permission Flags, Lifecycle Rules, and Edge Cases** (`§2.3`, `§3.3–§3.5`, `§4.3`)
4. **Terminology, Domain Drift, and Undefined Concepts** (`§2.2–§2.4`, `§3.1–§3.7`, `§4.1`, `§4.3`, `§5`)
5. **Structural Misplacement (`### 3.7. Non-Goals` under `## 3. Usuarios y Roles`)** (`§3.7`)

---

## 🟢 Nit (Editorial & formatting polish)

- `§5` bold bullets vs. `###` subheadings; missing blank lines after `###` headings (`§3.1–§3.5`, `§3.7`, `§4.1–§4.3`); metadata header missing `Última actualización`; `10. + Nuevo` mixed into base states list; minor uncalibrated phrasing (`vistas previas ligeras ... etc.`).
