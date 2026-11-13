# Stage 6: Comprehension Test Report (Naive Reader Audit)

**Target File:** `/Users/elmarcante/Desktop/El Marcante Tráfico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md`  
**Target Scopes:** FeatureRange (lines 1–148), DetailedRange (lines 149–197)  
**Persona:** Naive Reader / Newly Joined Engineer (Zero assumed institutional knowledge)

---

## 1. Paraphrase of FeatureRange (Lines 1–148)

### What this proposes
The document proposes an agency-focused team management and governance module called "Mi Equipo / Espacio" for an advertising traffic management application ("Trafikeitor"). It introduces an invitation and onboarding flow via Better Auth, a soft-deactivation mechanism that revokes active sessions and frees subscription license seats while preserving past audit signatures on campaigns, attribute-based client access controls (ABAC) to enforce NDA confidentiality by restricting which brands/clients a collaborator can see, and a mandatory reassignment protocol that prevents removing a team member if they still have active Work Orders (OTs) assigned.

### How the existing system works, per this document
Per the text, the current system relies on Better Auth and SQLite, featuring a Hono backend, a profile modal (`#user-profile-modal`), and a central bootstrap endpoint (`/api/studio/bootstrap`) that feeds clients, work orders, and stripboards to the workspace ("Mesa de Tráfico"). As described, the existing system handles members as generic records without soft-deactivation states, lacks client-level filtering (all users see all clients and orders), and has no safeguard preventing the deletion of collaborators who currently hold active operational responsibilities.

---

## 2. Paraphrase of DetailedRange (Lines 149–197)

### What this proposes (How it will be built)
The implementation is scheduled across four consecutive phases: first extending SQLite schema (`members` table) and exposing four administrative POST endpoints in `src/server/index.ts`; second, adding authentication middleware to reject deactivated users with HTTP 403 and filtering `/api/studio/bootstrap` based on permitted client IDs; third, building out the UI tabs and modal dialogs in `index.html` and `src/client/modals-controller.js`; and fourth, validating the entire lifecycle (invite, deactivate, reactivate, restrict client access, and reassign-on-delete) using a dedicated automated script (`scripts/verify-team-governance.ts`).

### How the existing system works, per this document
The document portrays an existing architecture with database models defined in `src/server/db/schema.ts` and `src/server/db/index.ts`, routing handled in `src/server/index.ts`, and front-end modal logic orchestrated in `src/client/modals-controller.js`. The current bootstrap handler returns full datasets without member-level client segregation, the request middleware does not inspect member activation status, and no automated lifecycle verification script currently exists for team governance.

---

## 3. Comprehension Gaps, Undefined Terms & Confusing Explanations

1. **Undefined License/Seat Mechanism:**  
   The document repeatedly emphasizes "Gestión Económica de Licencias (Seats / Asientos)" and freeing seats (e.g. "pasa de 6/6 a 5/6"), but provides zero schema definition, table reference, or configuration parameter showing where the workspace seat quota is stored, how it is retrieved, or how the backend blocks invitations/reactivations when the limit is exceeded.
2. **Naming Discrepancy for Client Permissions:**  
   Section 3 (Pilar 3, line 75) introduces the field as `allowed_clients_json`, whereas Section 4.1 (line 106) and Section 6 (line 175) define and reference it as `allowed_clients`.
3. **Session Revocation vs. 403 Middleware Logic Conflict:**  
   In Section 3 (line 69), the document specifies that when a user is deactivated, their sessions are *purged immediately* from the `sessions` table. However, lines 69 and 173 state that subsequent requests must return `403 account_deactivated` via middleware checking `membership.status`. If the session is purged from SQLite, standard authentication middleware will fail session lookup and return `401 Unauthorized` before any membership record can be resolved.
4. **Three Unaligned Role Taxonomies:**  
   The document mixes three distinct concepts of roles without explaining their hierarchy or mapping:
   - Better Auth organization roles: `owner` / `admin` (Section 4.2 table).
   - Invitation roles: `Director / Admin` vs `Colaborador` (Section 3, Pilar 1, line 64).
   - Functional job titles: `role_title` (`Director de Tráfico`, `Cuentas`, `Creativo`, etc., Section 4.1, line 105).
5. **Work Order Responsible & Signature Mechanics:**  
   Pilar 4 states: `SELECT COUNT(*) FROM work_orders WHERE responsible = ?`. It is unclear whether `responsible` stores a `user_id`, a `member_id`, or a string display name ("Carlos R."). Furthermore, the document asserts historical signatures remain intact with `(Inactivo)` even after a member is deleted (`DELETE FROM members`), without explaining whether signatures are immutable snapshot strings or relational foreign keys (which would fail or nullify on cascade delete).
6. **Domain Terminology Without Context:**  
   Terms like "Strips / Stripboard", "Mesa de Tráfico", and "Hoja de Ruta" are used as core operational concepts but are never defined or linked for a new engineer.

---

## 4. Specific Questions a New Engineer Would Have

1. *Where is the workspace seat limit configured or stored in the database, and what error code/message should the API return when an admin attempts to invite or reactivate a member beyond the seat limit?*
2. *What are the exact JSON request bodies and response payloads for the four endpoints (`/api/team/member/status`, `/api/team/member/permissions`, `/api/team/member/check-workload`, `/api/team/member/reassign-and-delete`)?*
3. *If deactivation purges the session row from the `sessions` table, how does the incoming request authenticate the user to return `403 account_deactivated` instead of `401 Unauthorized`? Should the session remain marked as revoked rather than deleted, or should the client handle 401 by reading a deactivation status?*
4. *What type of identifier is stored in `work_orders.responsible` (user UUID vs member ID vs display name)?*
5. *Where is the "Hoja de Ruta" note logged during reassignment (line 93)? Is there an existing table like `work_order_logs` or `route_sheet_entries`?*
6. *How does Better Auth's standard `role` (`owner` | `admin` | `member`) interact with `role_title`? Is `Colaborador` simply the Better Auth role `member`?*
7. *Is `#user-modal-view-team` an inner tab container inside `#user-profile-modal`, or a separate standalone modal element?*

---

## 5. Actionable Findings Prioritized by Severity

### 🔴 Blocker 1: Undefined Seat / Quota Storage and Enforcement Mechanism
- **Affected Scope:** Section 1 (lines 19–21), Section 2 (lines 43, 51), Section 3 (lines 70–72), Section 7 (Criterion 2, line 192).
- **Discrepancy & Rationale:** Seat management ("6/6 cupos", freeing seats, preventing activation when full) is treated as a core acceptance criterion and business pillar. However, there is no column added to `organizations` or workspace settings in Section 4.1, no quota checking in the endpoint table in Section 4.2, and no mention in Phase 1 or 2 of how seat limits are queried or validated. An engineer cannot implement or test Criterion 2 without knowing where the plan limit lives.

### 🔴 Blocker 2: Ambiguous Work Order Schema & Deletion / Signature Integrity
- **Affected Scope:** Section 1 (lines 15–16), Section 3 (lines 88–95), Section 4.1 (lines 101–107), Section 7 (Criterion 3, line 194).
- **Discrepancy & Rationale:** Section 3 specifies querying `work_orders WHERE responsible = ?` and executing `DELETE FROM members`. If `work_orders.responsible` or historical campaign signatures reference `members.id`, a hard `DELETE FROM members` will either trigger a foreign key constraint violation or leave broken relations. If signatures are plain strings (e.g. `"Carlos R."`), the document does not explain how the UI detects that "Carlos R." is now `(Inactivo)`. The data model for signatures and work order assignments must be explicitly stated.

### 🟡 Major 1: Session Purge vs. 403 Deactivation Response Contradiction
- **Affected Scope:** Section 3 (Pilar 2, line 69), Section 6 (Phase 2, line 173), Section 7 (Criterion 1, line 192).
- **Discrepancy & Rationale:** Deleting records from `sessions` directly conflicts with an authentication middleware returning `403 account_deactivated`. When the session token cannot be found in `sessions`, standard auth handlers terminate with `401 Unauthorized` before reaching membership evaluation. The plan must clarify whether sessions are deleted (resulting in 401) or updated with a revoked flag / kept until token inspection to emit 403.

### 🟡 Major 2: Attribute Name Inconsistency (`allowed_clients` vs `allowed_clients_json`)
- **Affected Scope:** Section 3 (line 75) vs Section 4.1 (line 106) & Section 6 (line 175).
- **Discrepancy & Rationale:** Line 75 names the column `allowed_clients_json`, while lines 106 and 175 name it `allowed_clients`. The schema and documentation must unify on a single name to prevent schema migration and endpoint mismatches.

### 🟡 Major 3: Lack of Formal API Contract (Payloads and Response Schemas)
- **Affected Scope:** Section 4.2 (lines 109–116).
- **Discrepancy & Rationale:** The four endpoints list HTTP methods and descriptions but omit required request parameters, body types, and response status codes/structures. Implementing engineers are left guessing whether to send `userId` vs `memberId`, and what structure `check-workload` returns (e.g. `{ hasActiveOrders: boolean, count: number, orders: [...] }`).

### 🟡 Major 4: Unclear Role and Permission Mapping
- **Affected Scope:** Section 3 (Pilar 1, line 64) vs Section 4.1 (line 105) vs Section 4.2 (lines 111–116).
- **Discrepancy & Rationale:** The document conflates organization authorization (`owner`/`admin`), user invitation choices (`Director/Admin` vs `Colaborador`), and functional role titles (`role_title`). The relationship between Better Auth's internal role column and `role_title` must be clearly specified.

### 🟢 Nit 1: Missing Glossary for Domain Concepts
- **Affected Scope:** Section 1 (line 6, 16), Section 3 (line 82–83, 93).
- **Discrepancy & Rationale:** Concepts such as "Mesa de Tráfico", "Stripboard / Tiras de trabajo", and "Hoja de Ruta" should be briefly defined or linked in a brief glossary for engineers unfamiliar with advertising agency workflows.

### 🟢 Nit 2: DOM Hierarchy Clarification (`#user-profile-modal` vs `#user-modal-view-team`)
- **Affected Scope:** Section 5 (line 122) vs Section 6 (Phase 3, line 177).
- **Discrepancy & Rationale:** Line 122 states the UI is a tab within `#user-profile-modal`, while line 177 refers to `#user-modal-view-team`. Explicitly noting that `#user-modal-view-team` is the tab container pane within `#user-profile-modal` will eliminate DOM ambiguity during frontend implementation.