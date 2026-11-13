# Stage 6 — Comprehension Test (v2.0)

**Target:** `docs/definici_n_funcional_y_roles_de_trafikeitor.md` (v2.0, lines 1–129)

## Paraphrase: Problem, Scope & Proposed Design
Independent creators and freelancers in AD, Web, and Software need a lightweight OT traffic and delivery-custody system on Hostinger (Node.js + Hono + SQLite + Better Auth). Logical multi-tenant isolation uses `organizationId` in `trafico.db`, `/uploads/${organizationId}/`, and `organizationId`-prefixed `localStorage` keys. Work follows `Organización -> Cliente -> Marca` across 5 roles (`owner`, `client`, `member`, `share_token`, `super_admin`). OTs branch into hyphenated Sub-OTs (`OT-26-XXX-1`, `-2`, `-3`), persist via debounced batch sync (`POST /api/studio/sync`) with server-side SQL filtering for scoped users, and separate official `Mesa de Tráfico` deadlines from personal `Stripboard` time-blocking.

---

## 🔴 Blockers

1. **Unresolvable `Fila Unificada` (11-Column) Derivation & `Stripboard Día` Time-Blocking Contradiction (`§4.2` L95–101, `§5` L126–129)**
   - No rule specifies how multiple `Línea de Hoja de Ruta` rows resolve `Descripción`, `Entrada`, `Entrega`, `Notas`, or `Responsable` in `Fila Unificada`.
   - `Stripboard Día` uses the exact same 11 columns—with no duration, time-block, or sequence fields—contradicting `§5`'s personal time-blocking description.

2. **Contradictory `member` Scoping vs. `allowed_client_id`, `Hoja de Ruta` Routing, and `POST /api/studio/sync` (`§3.3`, `§4.1`, `§4.2`, `§4.3`)**
   - `§3.3` allows multi-account `member` participation and `Hoja de Ruta` (`De: -> Para:`) visibility, but `allowed_client_id` is singular and `De`/`Para` are department names (`De (Departamento)`), not user IDs.
   - `§4.1` L93 states assigning `Para:` to `Producción`/`Creativos`/`Web`/`Dev` auto-routes to a recipient's Stripboard without explaining department-to-user resolution.
   - `§4.3` L117's SQL filter by `organization_id` and `client_id` breaks for multi-client or route-scoped `member`s.

---

## 🟡 Majors

1. **Unspecified `member` Explicit Authorization & `share_token` / `Cancelado` Lifecycle (`§3.3`, `§3.4`, `§3.6`, `§4.3`)**
2. **Undefined Core Concepts (`Árbol de Bins`, `Media Pool`, `shortName`, `parent_ot_id` fallback) & Unexplained Codebase References (`§2.1–§2.4`, `§3.2`, `§4.1`, `§4.3`)**
3. **Department Naming Drift (`§3.1` `Creativo`/`Admin` vs. `§4.1` `Producción`/`Creativos`)**

---

## 🟢 Nits

1. **`+ Nuevo` Action Mixed into Base States List (`§4.3` L114)**
2. **Unexplained Domain Jargon (`tiras`, `el visor`, `Medio`, `Tronco Madre`, `bandeja`)**
