### Paraphrase

#### What this proposes
This document outlines a 4-step Product-Led Growth (PLG) onboarding and reverse-trial workflow for "Trafikeitor" using Better Auth's native organization plugin. New users register openly without a credit card, name their agency or studio to provision an organization with a 14-day Pro trial, and gain immediate operational access. A front-controller evaluates session state, pending invitation tokens, and trial validity on startup to route users among auth gates, organization onboarding, paywalls, and the main workspace. If the 14-day trial period expires without payment, a hard paywall blocks write operations until a payment gateway webhook confirms an active subscription.

#### How the existing system works, per this document
Per this document, Trafikeitor is a traffic management application centered on an 11-column "Mesa de Tráfico", a "Hoja de Ruta" (De -> Para), a "Stripboard", and a "Media Pool". Phase 1 has eliminated a legacy `studios` table and `studio_id` foreign keys across 8 domain tables in favor of Better Auth `organizations` equipped with PLG trial and subscription fields. The backend exposes `/api/studio/bootstrap` to return studio state and trial metrics (`subscriptionStatus`, `trialEndsAt`, `trialDaysLeft`), as well as `/api/studio/sync` to persist operational updates. The frontend initializes through `main.js` (`initializeApp()`) and renders modal workflows governed by `modals-controller.js`.

---

### Audit Findings

#### 1. Missing Checkout Initiation and Tenancy Correlation in Webhook Flow
- **Severity**: Major
- **Affected Scope**: Section 2 (Lines 48–51), Section 3 (Line 66), Section 4 Phase 3 (Lines 113–115), Section 4 Phase 4 (Lines 126–134)
- **Discrepancy Description & Rationale**:
  The document details paywall UI modals and a webhook listener (`POST /api/billing/webhook`), but omits how checkout sessions are initiated and how tenant identity is passed to the payment gateway.
  1. The document specifies that clicking `[Activar Plan]` or `Suscribirme al Plan Pro ($49/mes)` redirects the user to "Checkout / Stripe", but specifies no client-to-server endpoint (e.g., `POST /api/billing/create-checkout-session`) or client configuration for initiating this session.
  2. In Phase 4, the webhook handler executes `UPDATE organizations SET subscription_status = 'active', status = 'active' WHERE id = ? OR slug = ?`. It assumes the gateway payload contains the organization identifier without documenting how that identifier was injected into the gateway's metadata or client reference during session creation.
  3. In the Mermaid diagram (lines 50–51), the webhook node (`WH`) connects directly to the workspace (`DESK`), conflating an asynchronous server-to-server HTTP POST with client-side browser navigation.
- **Remediation Recommendation**:
  - Define the backend route responsible for generating checkout sessions (e.g., `POST /api/billing/checkout-session`), documenting how `activeOrganizationId` is attached to Stripe/Bold metadata.
  - Update the Mermaid diagram to decouple the browser redirect path (`HARD/SOFT -> Checkout -> Success URL -> DESK`) from the asynchronous webhook path (`Stripe -> Webhook -> DB`).

---

#### 2. Unspecified Trial Initialization Mechanism upon Organization Creation
- **Severity**: Major
- **Affected Scope**: Section 2 (Line 34), Section 4 Phase 1 (Line 75), Section 4 Phase 2 (Lines 92–97)
- **Discrepancy Description & Rationale**:
  Section 2 (line 34) states that `POST /api/auth/organization/create` "(Crea org, asigna role: owner, activa 14 días de prueba)". However, Phase 2 only modifies client files (`index.html`, `modals-controller.js`, `main.js`), invoking Better Auth's standard endpoint `POST /api/auth/organization/create` with `{ name, slug }`.
  Native Better Auth does not automatically compute or populate custom columns like `trial_ends_at` or `subscription_status`. The document does not define whether these values are initialized via database schema defaults (e.g., SQLite `DEFAULT (datetime('now', '+14 days'))`), a Better Auth server-side lifecycle hook (e.g., `organization.create.after`), or a custom API route wrapper. Without this, newly created organizations will have `NULL` trial values and will immediately trigger trial expiration.
- **Remediation Recommendation**:
  - Explicitly document the mechanism for setting trial defaults in Phase 1 or Phase 2 (e.g., declare database column defaults or add a task in `src/server/auth.ts` hooking into organization creation).

---

#### 3. Undefined "Client" Role Architecture and Capabilities
- **Severity**: Major
- **Affected Scope**: Section 5 (Lines 154–160), Section 4 Phase 5 (Lines 143–146)
- **Discrepancy Description & Rationale**:
  Section 5 introduces three organizational roles: `Owner`, `Member`, and `Client` ("Visualización restringida a sus OTs o revisiones compartidas").
  1. Standard Better Auth organization roles are `owner`, `admin`, and `member`. The document does not specify how the custom `client` role is configured in Better Auth's organization plugin in `src/server/auth.ts`.
  2. Phase 5 (line 145) hardcodes invitations to `POST /api/auth/organization/invite-member` with `{ email, role: 'member' }`, providing no mechanism or UI to invite a user under the `client` role.
  3. No query filters or authorization rules are defined to enforce the "Visualización restringida a sus OTs" requirement in `/api/studio/bootstrap` or `/api/studio/sync`.
- **Remediation Recommendation**:
  - State whether the `Client` role is implemented in this scope or deferred.
  - If in scope, add the Better Auth custom role configuration to Phase 1/5, add a role selector in the team invite modal, and specify the authorization filter applied to client sessions in `/api/studio/*`.

---

#### 4. Discrepancy in Front-Controller Condition Count and Evaluation Trigger
- **Severity**: Nit
- **Affected Scope**: Section 3 (Lines 59–67) and Section 4 Phase 2 (Line 99)
- **Discrepancy Description & Rationale**:
  - Line 59 states: "el sistema evalúa estrictamente las siguientes 4 condiciones en orden", but the table immediately lists **5** distinct evaluation rows (Orden 1 to 5).
  - Condition 3 in the table (line 65) indicates that the check is based on client session state (`activeOrganizationId === null`), whereas Phase 2 (line 99) states that `openOnboardingStudioModal()` is triggered when `/api/studio/bootstrap` responds with HTTP `403 error: 'no_organization'`.
- **Remediation Recommendation**:
  - Update line 59 from "4 condiciones" to "5 condiciones".
  - Harmonize lines 65 and 99 to clarify whether the front-controller branches before network requests based on session state, or reactively catches the 403 error from `/api/studio/bootstrap`.

---

#### 5. Undefined Acronym "OT"
- **Severity**: Nit
- **Affected Scope**: Section 1 (Line 18), Section 4 (Lines 112, 136, 170), Section 5 (Lines 159, 160)
- **Discrepancy Description & Rationale**:
  The acronym "OT" (and plural "OTs") is used across table columns, modal copy descriptions, permission matrices, and acceptance criteria without being defined on first mention. While standard in regional traffic/advertising agencies (Orden de Trabajo / Work Order), a fresh engineer has to deduce its meaning.
- **Remediation Recommendation**:
  - Define the acronym on line 18 upon first use: `OT (Orden de Trabajo / Work Order)`.

---

#### 6. Ambiguity Between `subscription_status` and `status` Fields
- **Severity**: Nit
- **Affected Scope**: Section 4 Phase 1 (Line 75), Section 4 Phase 4 (Lines 124, 131)
- **Discrepancy Description & Rationale**:
  Phase 1 adds both `subscription_status` (`'trialing' | 'active' | 'past_due' | 'canceled'`) and `status` (`'active' | 'suspended'`) to `organizations`. Phase 4 updates both to `'active'` upon payment. However, the document does not specify what triggers `status = 'suspended'` or how it interacts with subscription states.
- **Remediation Recommendation**:
  - Add a brief note clarifying that `status` represents administrative/account-level standing (e.g., manual ban/suspension), whereas `subscription_status` reflects billing lifecycle.

