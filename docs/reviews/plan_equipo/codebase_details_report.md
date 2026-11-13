# Auditoría Técnica de Código (Stage 9: Codebase Details Review)

**Documento Auditado:** [PLAN_GESTION_EQUIPO_COLABORATIVO.md](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L149-L197) (Líneas 149–197 + Secciones 1–5 contextuales)  
**Contexto de Código:** `/Users/elmarcante/Desktop/El Marcante Tráfico/src` y `index.html`  
**Auditor:** Codebase Details Goldfish (Strict Compliance Officer)

---

## 1. Verificación Exhaustiva de Preguntas Clave del Orquestador

### A. Referencia de la tabla `members` en Drizzle vs SQLite
- **Estado Actual en Código:** En [src/server/db/schema.ts#L68-L75](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/server/db/schema.ts#L68-L75), la tabla está definida con:
  ```ts
  export const members = sqliteTable('members', {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  });
  ```
  En [src/server/db/index.ts#L75-L81](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/server/db/index.ts#L75-L81), `initDatabaseAndSeed()` ejecuta la creación DDL y `safeAlter` para migraciones idempotentes.
- **Discrepancia:** La tabla `members` **no está importada ni referenciada en [src/server/index.ts](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/server/index.ts#L9-L18)** (solo se consultaba con SQL crudo `sqlite.prepare('SELECT organization_id FROM members...')`). Al añadir las columnas `status`, `role_title` y `allowed_clients`, Drizzle requiere propiedades camelCase (`roleTitle`, `allowedClients`), y `index.ts` debe registrar las migraciones idempotentes mediante `safeAlter`.

### B. ¿Cómo se retornan los miembros en `/api/studio/bootstrap` actualmente?
- En [src/server/index.ts#L257-L300](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/server/index.ts#L257-L300) y [L403](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/server/index.ts#L403):
  1. El servidor llama a `auth.api.getFullOrganization({ headers: c.req.raw.headers })`.
  2. Luego itera `fullOrg.members` y consulta **exclusivamente la tabla `users`** (`SELECT short_name, color, avatar_mode, avatar_icon, departments FROM users WHERE id = ?`).
  3. **No consulta la tabla `members` para enriquecer `status`, `role_title` ni `allowed_clients`**.
  4. La respuesta JSON entrega `members: fullOrg.members` en la raíz y dentro de `organization.members`.
  5. Better Auth filtra y descarta cualquier columna que no esté declarada en su esquema de plugin (`options.schema.member.additionalFields`).

### C. Estructura de `#user-profile-modal` y `#user-modal-view-team` en `index.html`
- `#user-profile-modal` existe en [index.html#L1626](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/index.html#L1626) con pestañas `#user-modal-tab-profile-btn` y `#user-modal-tab-team-btn`.
- `#user-modal-view-team` existe en [index.html#L1924-L2005](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/index.html#L1924-L2005) con `#user-modal-org-name`, `#user-modal-org-role-badge`, `#user-modal-org-slug`, `#user-modal-org-quota`, `#user-team-members-list` e `#user-team-invitations-container`.
- **Alerta de Maquetación:** `#user-team-members-list` posee `max-h-48 overflow-y-auto` (solo 192px), lo cual colapsará visualmente la nueva tarjeta con menús desplegables (`•••`). Los modales `#member-client-access-modal` y `#member-reassign-modal` deben insertarse en el `<body>` raíz y no anidados dentro de `#user-profile-modal`.

### D. Comportamiento de `responsiblesCache` y `getResponsibles()` en `data-bridge.js`
- En [src/client/data-bridge.js#L578-L590](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/client/data-bridge.js#L578-L590):
  ```js
  if (Array.isArray(data.members) && data.members.length > 0) {
    data.members.forEach((m) => {
      const mUser = m.user;
      if (mUser) {
        const memberShort = (mUser.shortName || mUser.name || '').trim();
        if (memberShort && !responsiblesCache.includes(memberShort)) {
          responsiblesCache.push(memberShort);
        }
      }
    });
    writeLocal(RESPONSIBLES_STORAGE_KEY, responsiblesCache);
  }
  ```
- **Fuga de Estado:** No existe ningún filtro de `status`. Todo miembro inactivo continúa agregándose a `responsiblesCache` y se persiste en `localStorage` (`RESPONSIBLES_STORAGE_KEY`). Como `getResponsibleOptionsHtml()` en [src/client/data-bridge.js#L714](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/client/data-bridge.js#L714) lee `getResponsibles()`, los miembros desactivados **seguirán apareciendo en los selectores de nuevas OTs y rutas**, violando el Pilar 2 y la Tabla de Estados.

---

## 2. Hallazgos Priorizados (Discrepancias vs Codebase)

### 🔴 Hallazgo 1 (Blocker): Pérdida Catastrófica de Datos en `/api/studio/sync` al filtrar por ABAC en Bootstrap
- **Severidad:** Blocker
- **Ámbito Afectado:** [PLAN_GESTION_EQUIPO_COLABORATIVO.md#L174-L175](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L174-L175) vs [src/server/index.ts#L417-L460](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/server/index.ts#L417-L460)
- **Descripción y Justificación:**
  El plan establece que `/api/studio/bootstrap` filtrará `clients` y `orders` entregando solo los permitidos según `allowed_clients`.
  En el backend actual, `/api/studio/sync` implementa un reemplazo destructivo global:
  ```ts
  sqlite.prepare('DELETE FROM clients WHERE organization_id = ?').run(organizationId);
  sqlite.prepare('DELETE FROM work_orders WHERE organization_id = ?').run(organizationId);
  ```
  Cuando un usuario restringido (ej. que solo ve el cliente `c-1`) edite una OT o guarde cambios en su navegador, el cliente enviará al servidor únicamente su subconjunto local en `body.orders` y `body.clients`.
  El endpoint ejecutará el `DELETE FROM work_orders` para todo el `organizationId`, **borrando de manera inmediata e irreversible todas las OTs y clientes del resto de la agencia en SQLite**.
- **Acción Requerida:** La Fase 1 y Fase 2 deben incluir explícitamente la adaptación de `/api/studio/sync` para realizar borrados/inserciones condicionales por cliente (`DELETE FROM work_orders WHERE organization_id = ? AND client IN (...)`), o rechazar sincronizaciones masivas de entidades fuera de la cartera del usuario.

---

### 🔴 Hallazgo 2 (Blocker): Configuración de Better Auth `membershipLimit` y Bloqueo de Asientos Inactivos
- **Severidad:** Blocker
- **Ámbito Afectado:** [PLAN_GESTION_EQUIPO_COLABORATIVO.md#L169-L170](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L169-L170), [L193](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L193) vs [src/server/auth.ts#L84-L90](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/server/auth.ts#L84-L90)
- **Descripción y Justificación:**
  1. En `src/server/auth.ts` la configuración actual tiene un error de nombre de propiedad: usa `memberLimit: 6`, pero en la API interna de Better Auth v1.1.18 ([node_modules/better-auth/dist/plugins/organization/types.d.mts#L54](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/node_modules/better-auth/dist/plugins/organization/types.d.mts#L54)) la propiedad se llama **`membershipLimit`**.
  2. Más crítico aún: en Better Auth ([crud-invites.mjs#L280](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/node_modules/better-auth/dist/plugins/organization/routes/crud-invites.mjs#L280)), el método `adapter.countMembers` ejecuta:
     ```ts
     adapter.count({ model: "member", where: [{ field: "organizationId", value: orgId }] })
     ```
     Esto cuenta **todas las filas de la tabla `members`**, sin discriminar por `status`.
  3. Si un miembro es desactivado (`status = 'deactivated'`), su fila física permanece en la tabla `members`. Por ende, el endpoint nativo de Better Auth `organization.inviteMember` o `acceptInvitation` **seguirá arrojando `ORGANIZATION_MEMBERSHIP_LIMIT_REACHED`** y no permitirá invitar a un 6to miembro.
- **Acción Requerida:** El plan debe corregir la propiedad a `membershipLimit` y definirla como función dinámica:
  ```ts
  membershipLimit: async (user, org) => {
    const deactivatedCount = sqlite.prepare("SELECT COUNT(*) as c FROM members WHERE organization_id = ? AND status = 'deactivated'").get(org.id)?.c || 0;
    return 6 + deactivatedCount;
  }
  ```

---

### 🟡 Hallazgo 3 (Major): Ocultación vs Preservación Histórica en `responsiblesCache`
- **Severidad:** Major
- **Ámbito Afectado:** [PLAN_GESTION_EQUIPO_COLABORATIVO.md#L174-L175](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L174-L175), [L194](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L194) vs [src/client/data-bridge.js#L578-L590](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/client/data-bridge.js#L578-L590) y [L714-L724](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/client/data-bridge.js#L714-L724)
- **Descripción y Justificación:**
  - Si en `bootstrap()` se filtra para no agregar usuarios con `status === 'deactivated'` a `responsiblesCache`, surge una regresión en la visualización de OTs existentes:
  - En [src/client/data-bridge.js#L714](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/client/data-bridge.js#L714), `getResponsibleOptionsHtml(selectedVal)` solo genera etiquetas `<option>` para los elementos presentes en `responsiblesCache`. Si `selectedVal` (el usuario histórico inactivo) no está en `responsiblesCache`, el selector HTML no genera su opción y por defecto selecciona el primer responsable de la lista, mutando y corrompiendo la firma al abrir o guardar el modal de la OT.
- **Acción Requerida:** Actualizar la Fase 2 y 3 para especificar que `getResponsibleOptionsHtml(selectedVal)` debe comprobar si `selectedVal` es un miembro inactivo o ausente del catálogo activo, e inyectar automáticamente `<option value="${selectedVal}" selected>${selectedVal} (Inactivo)</option>`.

---

### 🟡 Hallazgo 4 (Major): Better Auth Stripping y Omisión de Enriquecimiento en `/api/studio/bootstrap`
- **Severidad:** Major
- **Ámbito Afectado:** [PLAN_GESTION_EQUIPO_COLABORATIVO.md#L169-L175](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L169-L175) vs [src/server/index.ts#L280-L300](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/server/index.ts#L280-L300) y [src/server/auth.ts#L84](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/server/auth.ts#L84)
- **Descripción y Justificación:**
  Better Auth implementa `filterOutputFields` ([adapter.mjs#L140](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/node_modules/better-auth/dist/plugins/organization/adapter.mjs#L140)), que elimina cualquier campo que no esté registrado formalmente en `options.schema.member.additionalFields`.
  Además, la función de enriquecimiento en [src/server/index.ts#L280-L300](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/server/index.ts#L280-L300) actualmente solo hace:
  ```ts
  const dbUser = sqlite.prepare('SELECT short_name, color, avatar_mode, avatar_icon, departments FROM users WHERE id = ?').get(m.userId);
  ```
  No consulta las columnas de `members` (`status`, `role_title`, `allowed_clients`). Por ende, el cliente nunca recibirá estos datos operativos en el payload de bootstrap a menos que se declaren en `auth.ts` y se enriquezcan explícitamente en `index.ts`.
- **Acción Requerida:** Documentar en Fase 1 la adición de `schema.member.additionalFields` en `src/server/auth.ts` y la lectura explícita desde SQLite en el bucle de enriquecimiento de `src/server/index.ts`.

---

### 🟡 Hallazgo 5 (Major): `data-bridge.js` degrada a "Modo Offline (Local)" ante un 403
- **Severidad:** Major
- **Ámbito Afectado:** [PLAN_GESTION_EQUIPO_COLABORATIVO.md#L173](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L173), [L192](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L192) vs [src/client/data-bridge.js#L562-L570](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/client/data-bridge.js#L562-L570) y [L616-L618](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/client/data-bridge.js#L616-L618)
- **Descripción y Justificación:**
  En `data-bridge.js`, si `bootstrap()` recibe un 403 con error distinto a `no_organization`, el flujo cae en:
  ```js
  emit('sync:status', { isSaving: false, text: 'Modo Offline (Local)' });
  emit('data:ready', { source: 'local', user: null });
  return { ok: true, source: 'local', user: null };
  ```
  Esto significa que cuando el servidor responda con `403 account_deactivated`, la aplicación en el navegador **no se bloqueará ni mostrará un modal de cuenta suspendida**: cargará la caché de `localStorage` y dejará al usuario interactuar en modo offline.
- **Acción Requerida:** La Fase 2 debe incluir el manejo del evento `auth:account-deactivated` en `data-bridge.js` y `main.js`, limpiando las cachés locales y mostrando una pantalla bloqueante de suspensión de membresía con botón para cerrar sesión.

---

### 🟡 Hallazgo 6 (Major): Conflicto de Rutas: Endpoints en `/api/team/*` vs Middleware en `/api/studio/*`
- **Severidad:** Major
- **Ámbito Afectado:** [PLAN_GESTION_EQUIPO_COLABORATIVO.md#L111-L116](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L111-L116), [L170](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L170) vs [src/server/index.ts#L175](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/server/index.ts#L175)
- **Descripción y Justificación:**
  El plan define los 4 endpoints de gobernanza bajo `/api/team/member/*`.
  Sin embargo, el middleware de sesión y contexto organizacional en `src/server/index.ts` está montado exclusivamente en:
  ```ts
  app.use('/api/studio/*', async (c, next) => { ... });
  ```
  Cualquier ruta montada en `/api/team/*` no pasará por este middleware y carecerá de `c.get('user')`, `c.get('organizationId')`, o verificación de sesión Better Auth.
- **Acción Requerida:** Unificar las rutas a `/api/studio/team/member/*`, o extender el middleware en `index.ts` a `app.use('/api/team/*', ...)`.

---

### 🟡 Hallazgo 7 (Major): Purgar Sesiones en `sessions` anula la detección de 403
- **Severidad:** Major
- **Ámbito Afectado:** [PLAN_GESTION_EQUIPO_COLABORATIVO.md#L69](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L69), [L173](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L173), [L192](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L192) vs [src/server/index.ts#L176-L179](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/server/index.ts#L176-L179)
- **Descripción y Justificación:**
  El plan menciona: *"sus sesiones en la tabla sessions son purgadas inmediatamente"* y *"recibe 403 claro"*.
  En `src/server/index.ts`:
  ```ts
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ ok: false, error: 'unauthorized', message: 'No autorizado. Inicia sesión en El Marcante.' }, 401);
  }
  ```
  Si se eliminan las sesiones de la tabla `sessions`, `auth.api.getSession()` devuelve `null` de inmediato y el middleware responde **`401 unauthorized`**, impidiendo que la petición llegue a la validación de `members.status === 'deactivated'` que produce el `403`.
- **Acción Requerida:** Aclarar en el plan si el rechazo inmediato post-desactivación es `401 unauthorized` (por token revocado) o si se mantiene la sesión activa en tabla con un flag/status que permita al middleware responder `403 account_deactivated`.

---

### 🟡 Hallazgo 8 (Major): Conteo de Capacidad en UI (`#user-modal-org-quota`) no descuenta miembros inactivos
- **Severidad:** Major
- **Ámbito Afectado:** [PLAN_GESTION_EQUIPO_COLABORATIVO.md#L177](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L177), [L193](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L193) vs [src/client/modals-controller.js#L2369-L2373](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/client/modals-controller.js#L2369-L2373)
- **Descripción y Justificación:**
  En `src/client/modals-controller.js`:
  ```js
  const members = Array.isArray(org.members) ? org.members : [];
  const memberCount = members.length;
  if (orgQuotaEl) {
    orgQuotaEl.innerText = `${memberCount} / 6 miembros`;
  }
  ```
  `members.length` cuenta todos los registros de la lista sin excluir a los miembros con `status === 'deactivated'`. Por lo tanto, el indicador en pantalla continuará mostrando `6 / 6 miembros` aunque se desactive a un colaborador.
- **Acción Requerida:** En la Fase 3, incluir la actualización del cálculo en `modals-controller.js`:
  ```js
  const activeCount = members.filter(m => m.status !== 'deactivated').length;
  orgQuotaEl.innerText = `${activeCount} / 6 miembros`;
  ```

---

### 🟡 Hallazgo 9 (Major): `check-workload` Incompleto (Solo revisa `work_orders.responsible`)
- **Severidad:** Major
- **Ámbito Afectado:** [PLAN_GESTION_EQUIPO_COLABORATIVO.md#L88](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L88), [L115](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L115), [L187](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L187) vs [src/server/db/schema.ts#L125-L171](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/server/db/schema.ts#L125-L171)
- **Descripción y Justificación:**
  El plan estipula que `check-workload` solo consulta:
  `SELECT COUNT(*) FROM work_orders WHERE responsible = ? AND status NOT IN ('Aprobación Cliente', 'Cancelada')`
  Sin embargo, en el modelo operativo de Trafikeitor existen tareas activas en:
  1. `route_entries`: `sign = ? AND completed = 0` (pasos de ruta en tránsito asignados a la firma del colaborador).
  2. `stripboard_strips`: `assignee = ? AND shift_status != 'Entregado'` (tiras de producción programadas en la Hoja de Tiempos).
  Si solo se reasigna `work_orders.responsible`, los pasos de ruta pendientes y las tiras diarias del Stripboard quedarán huérfanas o asignadas a un usuario ya eliminado.
- **Acción Requerida:** Extender `check-workload` y `reassign-and-delete` en Fase 1 para incluir `route_entries` no completadas y `stripboard_strips` pendientes.

---

### 🟢 Hallazgo 10 (Nit): Riesgo de Stacking Context y Tamaño de Lista en `index.html`
- **Severidad:** Nit
- **Ámbito Afectado:** [PLAN_GESTION_EQUIPO_COLABORATIVO.md#L137-L146](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L137-L146), [L177-L178](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L177-L178) vs [index.html#L1626](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/index.html#L1626) y [L1982](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/index.html#L1982)
- **Descripción y Justificación:**
  `#user-profile-modal` tiene clase `fixed inset-0 z-50 overflow-y-auto`. Si los modales secundarios `#member-client-access-modal` y `#member-reassign-modal` se colocan como hijos de este contenedor, heredarán el scroll y su backdrop quedará atrapado en el stacking context del modal padre. Deben ubicarse al final del `<body>` como hermanos de `#user-profile-modal` con `z-[60]`. Asimismo, `#user-team-members-list` debe incrementar o eliminar su `max-h-48`.

---

### 🟢 Hallazgo 11 (Nit): Convención de Nomenclatura Drizzle vs SQLite
- **Severidad:** Nit
- **Ámbito Afectado:** [PLAN_GESTION_EQUIPO_COLABORATIVO.md#L104-L107](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L104-L107), [L169](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L169) vs [src/server/db/schema.ts#L68-L75](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/server/db/schema.ts#L68-L75)
- **Descripción y Justificación:**
  El plan menciona `role_title` y `allowed_clients`. En `schema.ts`, la convención Drizzle utilizada en todo el codebase mapea camelCase en TypeScript y snake_case en SQLite:
  ```ts
  roleTitle: text('role_title').notNull().default('Creativo'),
  allowedClients: text('allowed_clients').notNull().default('["*"]'),
  ```
  Debe reflejarse esta especificación en la Fase 1 para evitar inconsistencias de tipado.

---

## 3. Resumen de Aprobación

| Métrica | Resultado |
| :--- | :---: |
| **Bloqueantes (Blockers)** | 2 |
| **Mayores (Majors)** | 7 |
| **Menores (Nits)** | 2 |
| **Estado General** | ❌ **Requiere Ajustes antes de Ejecución** |

**Recomendación Inmediata:**  
El plan no puede ejecutarse en su estado actual sin provocar pérdida masiva de datos en SQLite vía `/api/studio/sync` cuando un usuario con cartera restringida opere en el sistema, ni permitirá el desbloqueo real de asientos en Better Auth sin ajustar la propiedad dinámica `membershipLimit`. Se debe actualizar la redacción de las Fases 1, 2 y 3 incorporando los puntos detallados en este informe.