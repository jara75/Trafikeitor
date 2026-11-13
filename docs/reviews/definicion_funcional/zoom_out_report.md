# Stage 5 — Initial Zoom Out Review (v2.0)

**Target:** `docs/definici_n_funcional_y_roles_de_trafikeitor.md` (v2.0, lines 1–129)
**GoldfishContext:** `src/client`

## Prior Report Status Summary
- **Resolved:** **B4** (Arc-style Virtual Spaces removed; `Organización -> Cliente -> Marca` adopted), **B5** (leaked chat artifact & unclosed fence removed), **B2 in spec** (`localStorage` `organizationId` prefixing & logout cleanup specified in §2.3, though still unimplemented in `src/client`), **M5** (overstated isolation/immutability claims calibrated), **M7** (uniform role subsections, RBAC matrix, and Non-Goals added), **M8** (metaphors and LaTeX arrows removed), **N2/N5** (quota phrasing fixed, metadata header added). Also `/review/:token`, `Cerrado`/`Cancelado` naming (**M4**), and `super_admin` disambiguation (**B1**) were fixed.
- **Still Present:** **B1** (core solo-cockpit vs. multi-role portal split), **B3** (snapshot sync `POST /api/studio/sync` vs. scoped/multi-user writes), **M1** (Sub-OTs vs. `routes[]`), **M2** (`Stripboard Día` 11-column vs. time-blocking & `Fila Unificada` derivation), **M3** (lifecycle/permission edge cases), **M4** (partial schema/status drift).

---

## 🔴 Blockers

1. **Core Architectural Split & YAGNI Role Bloat: Solo Cockpit vs. Multi-Role Client Portal** (`§1`, `§3.2`, `§3.3`, `§3.6`, `§5`)
   - `§1` defines Trafikeitor as a lightweight individual cockpit, yet `§3.2–§3.3` specify an interactive `client` role (`allowed_client_id`, OT/Sub-OT creation, route handoffs, review-link generation, personal Stripboard) plus a `member` role with `*` toggle, `habilitación explícita`, and delivery-date locking. `src/client` only implements `owner`/`member` (`modals-controller.js:2401`) and unauthenticated `/review/:token` (`vite.config.ts:10`, `review.html`). Giving an external `client` a personal timesheet Stripboard is speculative bloat when `share_token` already covers review/approval.

2. **Whole-Studio Snapshot Sync (`POST /api/studio/sync`) Contradicts Scoped Views & Personal Stripboards** (`§3.2`, `§3.3`, `§4.3`, `§5`)
   - `scheduleSync` (`data-bridge.js` L517–576) pushes `{ clients, statuses, orders, stripboard }` every 250ms. `§4.3`'s proposed `organization_id` + `client_id` SQL filter fails for: (a) `member` scoped by `routes[]` across multiple clients; (b) `stripboardCache` (`data-bridge.js:145`), which is studio-wide rather than `userId`-partitioned; and (c) concurrent edits on the same `client_id`.

---

## 🟡 Majors

1. **Competing Work-Breakdown Hierarchy: Sub-OTs (`OT-26-XXX-1`) vs. `Hoja de Ruta` (`routes[]`)** (`§3.2`, `§4.1`)
2. **11-Column `Stripboard Día` Contradicts Time-Blocking & Missing `Fila Unificada` Derivation** (`§4.1`, `§4.2`, `§5`)
3. **Unspecified Permission & Lifecycle Edge Cases (`habilitación explícita`, delivery-date lock, `share_token` TTL/revocation)** (`§3.2–§3.4`, `§3.6`)
4. **Remaining Schema & Status Drift vs. `src/client` (`Archivada` missing from `defaultStatuses` in `core-state.js`; 8 OT header fields vs. `defaultOrders`)** (`§4.2.1`, `§4.3`)

---

## 🟢 Nits

1. **Client `localStorage` Scoping Is Spec-Only (`§2.3` vs. `core-state.js` / `data-bridge.js`)**
2. **Undefined UI Term `Árbol de Bins` & `§5` Formatting Asymmetry (`§3.2`, `§3.4`, `§5`)**
