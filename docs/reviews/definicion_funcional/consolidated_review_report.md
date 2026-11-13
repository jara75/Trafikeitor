# Consolidated Review Report — Definición Funcional y Roles de Trafikeitor (v2.0)

- **Target Document:** `/Users/elmarcante/Desktop/El Marcante Tráfico/docs/definici_n_funcional_y_roles_de_trafikeitor.md` (v2.0, Lines 1–129)
- **Codebase Context:** `/Users/elmarcante/Desktop/El Marcante Tráfico/src/client`
- **Review Stages Executed:** Stage 5 (`egm-zoom-out`), Stage 6 (`egm-comprehension`), Stage 7 (`egm-design`, `egm-structural`, `egm-style`), Stage 8 (`egm-zoom-out`)
- **Stage 9 Status:** Skipped (`DetailedRange = N/A` — target document is a high-level functional specification without a detailed implementation plan; see [implementation_readiness_report.md](file:///Users/elmarcante/Desktop/El%20Marcante%20Tráfico/docs/reviews/definicion_funcional/implementation_readiness_report.md))

---

## Executive Summary & Verdict

v2.0 resolved several prior issues from v1.0—specifically removing Arc-style Virtual Spaces (prior **B4**), removing the unclosed code fence and leaked chat artifact (prior **B5**), adding `organizationId` `localStorage` scoping requirements (prior **B2** in spec), disambiguating `super_admin` vs. org `admin`, calibrating isolation/immutability claims (prior **M5**), standardizing role subsections + RBAC matrix + Non-Goals (prior **M7**), and cleaning LaTeX arrows and `/review/:token` / `Cerrado` / `Cancelado` naming.

However, the v2.0 review found **4 Blockers**, **7 Majors**, and **6 Nits** after deduplication across Stages 5–8. Before authoring an implementation plan, the specification must resolve:
1. The `POST /api/studio/sync` snapshot-sync & `client_id` SQL-filtering paradox (which breaks route-scoped `member`s, shared `statuses`/`clients` catalogs, per-user `stripboardCache`, and concurrent writes).
2. The `client` vs. `member` RBAC privilege inversion, missing server-side invite binding, and client-side `createOt()` ID collisions (`ordersCache.length + 1`).
3. The unresolvable `Fila Unificada` (11-column) derivation rule, `Stripboard Día` vs. personal time-blocking contradiction, and `Para:` department-to-user auto-routing contradiction.

---

## 🔴 Blockers (Must Fix Before Planning Implementation)

### B1. `POST /api/studio/sync` Whole-Snapshot Concurrency & `client_id` Filtering Paradox (`§3.2`, `§3.3`, `§3.7`, `§4.3`, `§5`)
- **Sources:** Stage 5 #2, Stage 6 #2, Stage 7 Design #1, Stage 8 #2
- **Finding:** `scheduleSync()` (`data-bridge.js` L517–576) sends the full `{ clients, statuses, orders, stripboard }` payload every 250ms, while `§3.7` excludes granular persistence / CRDT conflict resolution. `§4.3` attempts to support scoped users via `WHERE organization_id = ? AND client_id = ?`, which fails in four ways:
  1. **Route-scoped `member`s (`§3.3`):** A `member` can participate across multiple clients via `Hoja de Ruta` (`De: -> Para:`), so filtering by a single `client_id` breaks multi-client or route-based writes.
  2. **Shared catalogs (`statuses`, `clients`):** `statuses` has no `client_id`; non-owner sync payloads must be rejected/ignored for shared catalogs so scoped users cannot overwrite studio catalogs.
  3. **Personal Stripboard collision (`§5`):** `stripboardCache` (`data-bridge.js:145`) is keyed by `dateStr` without `userId`, so `owner` and `client` personal Stripboards collide.
  4. **Silent overwrites:** Concurrent edits within the same `organization_id` or `client_id` silently overwrite each other (last-write-wins) without optimistic locking or record-level endpoints.
- **Action:** Specify either record-level mutation endpoints + optimistic locking + `userId`-partitioned Stripboard state, or restrict concurrent write scope and define explicit payload whitelisting per role.

### B2. Interactive `client` Role vs. `member` Privilege Inversion & Missing Invite Binding (`§1`, `§3.2`, `§3.3`, `§3.6`)
- **Sources:** Stage 5 #1, Stage 7 Design #2, Stage 8 #1
- **Finding:** `§1` frames Trafikeitor as a solo cockpit, yet `§3.2–§3.3` define an interactive `client` role (including a personal timesheet Stripboard, OT/Sub-OT creation, and route passes) alongside a `member` role with `*` toggle and `habilitación explícita`. In `src/client`, `modals-controller.js` (L2400–2402, L2547–2591) only implements `owner`/`admin`/`member` (hardcoded `role: 'member'`), with no `client` role or `allowed_client_id` controls. Furthermore, `§3.3` forbids internal `member`s from altering committed delivery dates, whereas `§3.2`/`§3.6` leave external `client`s unrestricted on `Hoja de Ruta` and OT creation—creating a privilege inversion. Server-side binding of `role` + `allowed_client_id` on `?invite=TOKEN` acceptance is also unspecified.
- **Action:** Decide whether `client` is an interactive planner or a scoped requester/reviewer, lock committed delivery dates for `client` as well as `member`, and specify server-side invite token binding as a prerequisite.

### B3. Client-Side OT ID Generation (`ordersCache.length + 1`) Collides Under Scoped Views (`§3.2`, `§4.1`)
- **Sources:** Stage 7 Design #3, Stage 8 #2
- **Finding:** `createOt()` (`data-bridge.js` L997–998) generates `` `OT-26-${String(ordersCache.length + 1).padStart(3, '0')}` ``. In a scoped `client`/`member` session with a filtered `ordersCache` (or under concurrent OT creation / after deletions), this produces duplicate IDs and primary-key collisions on sync.
- **Action:** Mandate server-side atomic sequence/ID generation per `organizationId` for `OT-YY-XXX` and Sub-OTs (`-1`, `-2`, `-3`).

### B4. Unresolvable `Fila Unificada` Derivation, `Stripboard Día` Time-Blocking & `Para:` Auto-Routing Contradictions (`§4.1`, `§4.2`, `§5`)
- **Sources:** Stage 5 Major #2, Stage 6 #1, Stage 6 #2, Stage 7 Design Major #3, Stage 8 #3
- **Finding:**
  1. `§4.2` defines an 8-field `Encabezado de la OT`, a 7-column `Línea de Hoja de Ruta`, and an 11-column `Fila Unificada`, with no rule specifying how `Descripción`, `Entrada`, `Entrega`, `Notas`, and `Responsable` derive across multiple route lines (nor including `stamp`/`completed` used by `getActiveRoute(ot)` in `data-bridge.js`).
  2. `Stripboard Día` (§4.2.3) reuses the exact 11 columns without `startTime`, `duration`, `shiftStatus`, or `userId`, contradicting `§5`'s personal time-blocking narrative.
  3. `§4.1` (L93) states setting `Para:` to `Producción`/`Creativos`/`Web`/`Dev` auto-places the sub-OT in the recipient's Stripboard, contradicting `§5`'s manual projection and leaving department-string-to-`userId` resolution undefined.
- **Action:** Specify `getActiveRoute(ot)` derivation for `Fila Unificada`, add scheduling fields (`userId`, time-block/duration, `shiftStatus`) to `Stripboard Día`, and clarify whether `Para:` filters an inbox rather than auto-mutating personal Stripboards.

---

## 🟡 Majors (Should Fix)

### M1. Sub-OTs (`OT-26-XXX-1`) vs. Existing `routes[]` & Shared Media Pool Access (`§4.1`)
- **Sources:** Stage 5 Major #1, Stage 6 Major #2, Stage 7 Design Major #2, Stage 8 Major #1
- **Finding:** `ordersCache` already decomposes work via `routes[]` inside flat OTs. Adding Sub-OTs (`parent_ot_id` optional, prefix-linked) leaves unspecified: when to use Sub-OTs vs. `routes[]`, fallback behavior if `parent_ot_id` is omitted, whether archiving/deleting the parent cascades to children, and how a `member` scoped to one Sub-OT accesses the parent's shared Media Pool.
- **Action:** Define explicit boundaries between Sub-OTs and `routes[]`, parent cascade rules, and Media Pool access inheritance.

### M2. Remaining Schema & Status Drift vs. `src/client` (`§4.2`, `§4.3`)
- **Sources:** Stage 5 Major #4, Stage 7 Design Major #4, Stage 8 Major #2
- **Finding:** `Archivada` is listed as base status #8 (`core-state.js`), but `defaultStatuses` (`core-state.js` L109–118) only defines `st-1`..`st-8` (`Tráfico` through `Cancelado`), with `Archivada` appearing only in `TERMINAL_OT_STATUSES` (L17). Also, `§4.2.1` merges `Marca/Producto` and omits `title`/`brief` vs. `defaultOrders` (`data-bridge.js` L48–104).
- **Action:** Reconcile `Archivada` in `defaultStatuses` (or document it as a terminal state) and align header field names with `defaultOrders`.

### M3. `localStorage` Pre-Bootstrap Hydration & Missing Org-Switcher UI (`§2.1`, `§2.3`)
- **Sources:** Stage 5 Nit #1, Stage 7 Design Major #1, Stage 8 Major #3
- **Finding:** `§2.3` specifies `organizationId`-prefixed `localStorage`, whereas `src/client` (`core-state.js` L9–15, L176; `data-bridge.js` L486–512; `modals-controller.js` L2669–2681) runs `initLocalCache()` synchronously before `bootstrap()` knows `organizationId`/`userId`, does not clear `localStorage` on `handleUserSignOut()`, and has no multi-organization switcher UI despite `§2.1`.
- **Action:** Specify deferred post-bootstrap hydration (or pre-hydration clearing on `401`/sign-out/org-switch) and track the org-switcher UI requirement.

### M4. Unspecified Permission Flags & Operational Lifecycle Edge Cases (`§3.1–§3.6`, `§4.3`)
- **Sources:** Stage 5 Major #3, Stage 6 Major #1, Stage 7 Design Major #4, Stage 7 Design Major #5, Stage 8 Major #3
- **Finding:** Missing concrete behavior for: `habilitación explícita` persistence/UI for `member`; `deliveryDate` lock enforcement; `share_token` TTL/revocation and whether `[ APROBADO ]`/`[ AJUSTES ]` auto-transitions OT `status` (`Cliente -> Entregado/Desarrollo`); `Cancelado` table visibility; deactivated `member` route reassignments; deleted `allowed_client_id` impact on `client` users; `suspended` org HTTP/UI behavior; and `"soporte autorizado"` audit mechanism (`§3.5`).
- **Action:** Document concrete state transitions, flags, and lifecycle rules for each case.

### M5. Terminology, Acronym & Department Naming Drift (`§2.3–§2.4`, `§3.1–§3.7`, `§4.1`, `§4.3`, `§5`)
- **Sources:** Stage 6 Major #3, Stage 7 Style #1–#6, Stage 8 Major #4
- **Finding:**
  - `CRDT/OT` (`§3.7` L82) collides with `OT` (*Orden de Trabajo*).
  - `Stripboard` appears under 5 variants (`Stripboard del estudio`, `Stripboard global`, `Stripboard del Dueño`, `Stripboard personal`, `Stripboard Día`).
  - `Caché Local Segura` (`§2.3`) overstates unencrypted `localStorage` (prefer `Caché Local Particionada`).
  - `allowed_client_id` drifts into `client_id`, `c-xxx`, and `allowed_client_id !== '*'`.
  - Department lists drift (`Creativo`/`Admin` in `§3.1` vs. `Producción`/`Creativos` in `§4.1`), and `§3.2 Operación` omits `client` approval despite `§3.6` granting it.
  - `vistas previas ligeras ... etc.` (`§2.4`) and `salvo soporte autorizado` (`§3.5`) are uncalibrated.
- **Action:** Standardize one term per concept, rename `CRDT/OT`, calibrate security/upload claims, and align `§3.2` with `§3.6`.

### M6. Undefined Core UI/Domain Concepts & Codebase References (`§2.1–§2.4`, `§3.2`, `§4.1`, `§4.3`, `§5`)
- **Sources:** Stage 5 Nit #2, Stage 6 Major #2, Stage 7 Style #7, Stage 8 Major #4
- **Finding:** `Árbol de Bins`, `Media Pool` (and whether it is per-OT or shared), `shortName`, `tiras`, and internal symbols (`renderBinTree`, `setTableGroup`, `core-state.js`) are referenced without inline definitions for readers outside the codebase.
- **Action:** Add concise inline definitions on first mention.

### M7. Misplaced `### 3.7. Non-Goals` Subsection (`§3.7` L80–83)
- **Sources:** Stage 7 Structural Major #1, Stage 8 Major #5
- **Finding:** `### 3.7. Non-Goals (Fuera de Alcance)` sits inside `## 3. Usuarios y Roles`, even though its items cover product-wide architecture, sync, and out-of-scope features.
- **Action:** Promote to a top-level `## 6. Non-Goals (Fuera de Alcance)`.

---

## 🟢 Nits (Minor Improvements)

### N1. `10. + Nuevo` Mixed into Base States List (`§4.3` L114)
- **Sources:** Stage 6 Nit #1, Stage 7 Structural Nit #2, Stage 7 Style Nit #5, Stage 7 Design Nit #1
- **Finding:** `+ Nuevo` is a UI `<option value="__NEW__">` trigger (`data-bridge.js:906`), not a base OT status. Move it to a note outside the `1.`–`9.` list.

### N2. Section 5 Heading & H3 Spacing Asymmetry (`§3.1–§3.5`, `§4.1–§4.3`, `§5`)
- **Sources:** Stage 5 Nit #2, Stage 7 Structural Nits #1 & #3, Stage 7 Style Nit #6
- **Finding:** `§5` uses bold bullets instead of `### 5.1.` / `### 5.2.` subheadings, and `###` headings in `§3.1–§3.5`, `§3.7`, and `§4.1–§4.3` lack a blank line before body content.

### N3. Missing `Última actualización` in Metadata Header (`Line 3`) & `Invitar/revocar` Row in RBAC (`§3.6`)
- **Sources:** Stage 7 Structural Nit #4, Stage 7 Design Nit #3
- **Finding:** Add `Última actualización: YYYY-MM-DD` to line 3 and add an `Invitar / revocar usuarios` row (`owner` only) to `§3.6`.

### N4. Unlimited `client` Uploads Without Storage Quotas (`§2.4`, `§3.2`)
- **Sources:** Stage 7 Design Nit #2
- **Finding:** Unlimited `client` seats with `/uploads/${organizationId}/` access require per-org storage/file-size limits (noting `SUITE_DEFS`/`CODE_EXTS` in `core-state.js` L131–154).

### N5. Leftover Framing, Buzzwords & Domain Jargon (`§1`, `§3.4`, `§3.7`, `§4.1–§4.3`, `§5`)
- **Sources:** Stage 6 Nit #2, Stage 7 Style Nits #1–#4
- **Finding:** Replace `cabina de mando individual` (L11) with `panel operativo individual`, `Modelo de Negocio` (L12) with `Stack y Despliegue`, `estampa` (L56) with `registra`, `tipo Arc` (L81) with `sub-espacios virtuales internos`, `Single Source of Truth` (L95) with `Esquema Canónico`, drop filler `estrictamente` (L117), and gloss `el visor`, `Medio`, `Tronco Madre`, and `bandeja`.

---

## Traceability Matrix

| Raw Stage Finding | Consolidated ID |
|---|---|
| Stage 5 #1 (Solo cockpit vs. multi-role portal) | B2 |
| Stage 5 #2 (`POST /api/studio/sync` vs. scoped views & Stripboards) | B1 |
| Stage 5 Major #1 (Sub-OTs vs. `routes[]`) | M1 |
| Stage 5 Major #2 (`Stripboard Día` & `Fila Unificada`) | B4 |
| Stage 5 Major #3 (Permission & lifecycle edge cases) | M4 |
| Stage 5 Major #4 (`Archivada` & `defaultOrders` schema drift) | M2 |
| Stage 5 Nit #1 (`localStorage` scoping spec-only) | M3 |
| Stage 5 Nit #2 (`Árbol de Bins` & `§5` formatting) | M6, N2 |
| Stage 6 #1 (`Fila Unificada` & `Stripboard Día` contradiction) | B4 |
| Stage 6 #2 (`member` scoping vs. `allowed_client_id` & `sync`) | B1, B4 |
| Stage 6 Major #1 (`habilitación explícita`, `share_token`, `Cancelado`) | M4 |
| Stage 6 Major #2 (Undefined concepts & code symbols) | M1, M6 |
| Stage 6 Major #3 (Department naming drift) | M5 |
| Stage 6 Nit #1 (`+ Nuevo` in base states) | N1 |
| Stage 6 Nit #2 (Unexplained domain jargon) | N5 |
| Stage 7 Design #1 (`POST /api/studio/sync` concurrency & filtering) | B1 |
| Stage 7 Design #2 (`client` vs. `member` RBAC & invite binding) | B2 |
| Stage 7 Design #3 (`createOt()` ID collision) | B3 |
| Stage 7 Design Major #1 (`localStorage` hydration & org switcher) | M3 |
| Stage 7 Design Major #2 (Sub-OT lifecycle & Media Pool access) | M1 |
| Stage 7 Design Major #3 (`Stripboard Día` & `routes[]` schema drift) | B4 |
| Stage 7 Design Major #4 (`Archivada` & `share_token` transitions) | M2, M4 |
| Stage 7 Design Major #5 (Deactivated/deleted/suspended lifecycle) | M4 |
| Stage 7 Design Nit #1 (`+ Nuevo` UI trigger) | N1 |
| Stage 7 Design Nit #2 (Unlimited `client` upload quotas) | N4 |
| Stage 7 Design Nit #3 (RBAC `Invitar/revocar` row) | N3 |
| Stage 7 Structural Major #1 (`### 3.7. Non-Goals` misplaced) | M7 |
| Stage 7 Structural Nits #1–#4 (`§5`, `+ Nuevo`, H3 spacing, metadata) | N1, N2, N3 |
| Stage 7 Style Majors #1–#7 (`CRDT/OT`, Stripboard, claims, IDs, depts, terms) | M5, M6 |
| Stage 7 Style Nits #1–#6 (Metaphor, label, jargon, buzzwords, `§5`) | N1, N2, N5 |
| Stage 8 #1 (Philosophy vs. privilege inversion) | B2 |
| Stage 8 #2 (Snapshot sync vs. concurrency & ID collision) | B1, B3 |
| Stage 8 #3 (`Fila Unificada`, `Stripboard Día`, `Para:` auto-routing) | B4 |
| Stage 8 Majors #1–#5 (Sub-OTs, drift, edge cases, terms, Non-Goals) | M1, M2, M3, M4, M5, M6, M7 |
| Stage 8 Nits (§5, spacing, metadata, `+ Nuevo`, phrasing) | N1, N2, N3, N5 |
