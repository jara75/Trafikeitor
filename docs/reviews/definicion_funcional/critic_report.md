# Stage 7 — Critic Review (v2.0)

**Target:** `docs/definici_n_funcional_y_roles_de_trafikeitor.md` (v2.0, lines 1–129)
**GoldfishContext:** `src/client`

---

## 1. Design Critique (`egm-design`)

### 🔴 Blockers
1. **`POST /api/studio/sync` Whole-Snapshot Concurrency & `client_id` Filtering Paradox** (`§3.2`, `§3.3`, `§3.7`, `§4.3`, `§5` vs. `data-bridge.js` L517–576):
   - Concurrent edits by `owner`, `member`s, and `client`s silently clobber each other (last-write-wins) without optimistic concurrency control or granular endpoints.
   - Shared catalogs (`statuses`, `clients`) have no `client_id` and must be rejected/ignored for non-owners.
   - Route-scoped `member`s cannot be safely filtered by `WHERE client_id = ?`.
   - `stripboardCache` is keyed only by `dateStr` (no `userId` partition), so `owner` and `client` personal Stripboards collide.
2. **Interactive `client` Role & Multi-Role RBAC Contradictions vs. `src/client`** (`§3.2`, `§3.3`, `§3.6` vs. `modals-controller.js` L2400–2402, L2547–2591):
   - `src/client` has no `client` role, no `allowed_client_id` binding, and no `member` `*` / `autorización explícita` UI.
   - Privilege inversion: `§3.3` locks delivery dates for `member`, whereas `§3.2`/`§3.6` do not restrict external `client`s from altering committed delivery dates.
   - Missing server-side binding of `role` + `allowed_client_id` on `?invite=TOKEN` acceptance.
3. **Client-Side OT ID Generation (`ordersCache.length + 1`) Collides Under Scoped Views & Concurrency** (`§3.2`, `§4.1` vs. `data-bridge.js` L997–998):
   - Filtered `ordersCache` or concurrent `createOt()` calls generate duplicate `OT-26-XXX` IDs, causing primary-key collisions or overwrites on sync.

### 🟡 Majors
4. **`localStorage` Scoping & Synchronous Pre-Bootstrap Hydration Mismatch (`§2.3`)** (`core-state.js` L9–15, L176; `data-bridge.js` L486–512; `modals-controller.js` L2669–2681; missing org-switcher UI).
5. **Sub-OT (`OT-26-XXX-1`) Lifecycle & Shared Media Pool Access Gaps (`§4.1`)** (scoped `member` access to parent Media Pool, parent archive/delete cascade, `Para:` department-to-user mapping).
6. **`Stripboard Día` 11-Column Model & `Fila Unificada` / `routes[]` Schema Drift (`§4.2`, `§5`)** (`startTime`, `duration`, `shiftStatus`, `userId` missing from §4.2.3; `stamp` and `completed` missing from §4.2.2; `getActiveRoute(ot)` derivation rule missing).
7. **`Archivada` Missing from `defaultStatuses` & Guest `share_token` Edge Cases (`§3.4`, `§4.3`)** (`core-state.js` L17, L109–118; whether `[ APROBADO ]`/`[ AJUSTES ]` auto-transitions OT `status`; `share_token` TTL/revocation).
8. **Missing Lifecycle Rules for Deactivated `member`s, Deleted `client`s, `suspended` Orgs, and `soporte autorizado` (`§3.1–§3.5`)**.

### 🟢 Nits
9. `10. + Nuevo` is a UI trigger (`data-bridge.js` L906), not a base state.
10. Unlimited `client` accounts + media uploads without storage/size quotas (`§3.2`, `§2.4`; note `SUITE_DEFS`/`CODE_EXTS` in `core-state.js` L131–154).
11. RBAC matrix (`§3.6`) omits an `Invitar / revocar usuarios` row.

---

## 2. Structural Review (`egm-structural`)

- **🔴 Blocker:** None (v1.0 unclosed fence and leaked artifact resolved).
- **🟡 Major:** `### 3.7. Non-Goals (Fuera de Alcance)` (L80–83) is misplaced under `## 3. Usuarios y Roles`; promote to `## 6. Non-Goals (Fuera de Alcance)`.
- **🟢 Nits:**
  1. §5 uses bold bullets instead of `### 5.1.` / `### 5.2.` subheadings.
  2. `10. + Nuevo` mixed into `Estados base` ordered list (§4.3 L114).
  3. Missing blank lines after `###` headings (`§3.1–§3.5`, `§3.7`, `§4.1–§4.3`).
  4. Metadata header (L3) omits `Última actualización`.

---

## 3. Style Review (`egm-style`)

- **🔴 Blocker:** None.
- **🟡 Majors:**
  1. Acronym collision: `CRDT/OT` (`§3.7` L82) collides with `OT` (*Orden de Trabajo*).
  2. `Stripboard` naming drift (5 variants across `§3–§5`).
  3. Overstated claim: `Caché Local Segura` (`§2.3` L24) -> use `Caché Local Particionada`.
  4. Uncalibrated `vistas previas ligeras ... etc.` (`§2.4` L29) and `salvo soporte autorizado` (`§3.5` L63).
  5. Inconsistent client-identifier naming (`allowed_client_id`, `client_id`, `c-xxx`, `allowed_client_id !== '*'`).
  6. Department list drift (`Creativo`/`Admin` vs `Producción`/`Creativos`) and `client` approval missing from `§3.2 Operación`.
  7. Undefined UI/domain terms (`Árbol de Bins`, `Media Pool`, `tiras`).
- **🟢 Nits:** Leftover metaphor (`cabina de mando individual`, L11); `Modelo de Negocio` label mismatch on tech stack bullet (L12); colloquial `estampa` (L56) & `tipo Arc` (L81); English `Single Source of Truth` (L95) & filler `estrictamente` (L117); `10. + Nuevo` (L114); §5 heading hierarchy.
