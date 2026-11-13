# INFORME DE CRÍTICA DE DISEÑO (STAGE 7: HOSTILE DESIGN CRITIQUE)

**Documento Auditado:** [/Users/elmarcante/Desktop/El Marcante Tráfico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md](file:///Users/elmarcante/Desktop/El Marcante Tráfico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L1-L148)  
**Alcance Evaluado:** Líneas 1 a 148 (Resumen Ejecutivo, Benchmark, 4 Pilares, Especificación Técnica y UI/UX).  
**Contexto del Código:** [/Users/elmarcante/Desktop/El Marcante Tráfico/src](file:///Users/elmarcante/Desktop/El Marcante Tráfico/src)  
**Veredicto General:** **RECHAZADO (REQUIERE REFACTORIZACIÓN ARQUITECTÓNICA PREVIA A IMPLEMENTACIÓN)**  
El plan adolece de 3 fallas arquitectónicas críticas que provocarían pérdida total de datos de clientes no autorizados, desbordamiento de cuotas en Better Auth y bypass total de seguridad en el backend.

---

### HALLAZGOS PRIORIZADOS

#### 1. SEVERIDAD: BLOCKER (CATASTRÓFICO / PÉRDIDA DE DATOS)
* **Affected Scope:** Subcutáneo de Sincronización y Acceso Condicionado (Pilar 3: L74-84; `src/server/index.ts` L417-568; `src/client/data-bridge.js` L501-536).
* **Finding & Technical Description:**
  El plan propone filtrar la respuesta de `/api/studio/bootstrap` para que un usuario restringido a ciertos clientes solo reciba sus clientes y OTs autorizadas. **Sin embargo, ignora por completo la arquitectura de sincronización del sistema (`/api/studio/sync`).**
  Actualmente, el cliente web (`data-bridge.js`) sincroniza el estado de la aplicación mediante un snapshot completo en memoria (`clientsCache`, `ordersCache`, `stripboardCache`) que se envía vía `POST /api/studio/sync` con un debounce de 250ms.
  En el backend, `/api/studio/sync` ejecuta:
  ```ts
  sqlite.prepare('DELETE FROM clients WHERE organization_id = ?').run(organizationId);
  sqlite.prepare('DELETE FROM work_orders WHERE organization_id = ?').run(organizationId);
  sqlite.prepare('DELETE FROM route_entries WHERE organization_id = ?').run(organizationId);
  sqlite.prepare('DELETE FROM stripboard_strips WHERE organization_id = ?').run(organizationId);
  ```
  Si un colaborador restringido inicia sesión, `/api/studio/bootstrap` le entregará únicamente sus 2 clientes permitidos y 5 OTs. Tan pronto como ese colaborador mueva una tarjeta o edite cualquier dato en el cliente, `scheduleSync()` enviará ese subconjunto al servidor: **el backend ELIMINARÁ PERMANENTEMENTE TODOS LOS DEMÁS CLIENTES, TODAS LAS DEMÁS ÓRDENES DE TRABAJO Y TODAS LAS TIRAS DEL RESTO DEL ESTUDIO EN SQLITE.**
* **Recommendation:**
  1. **Prohibir el filtrado destructivo global en `/api/studio/sync`:** El endpoint de sincronización debe dejar de hacer `DELETE FROM ... WHERE organization_id = ?` masivo. Debe migrarse inmediatamente a una sincronización granular por entidad / upsert (`INSERT ... ON CONFLICT DO UPDATE`), o `/api/studio/sync` debe rechazar cargas que no contengan la totalidad del estudio si el usuario no tiene permisos globales (`["*"]`).
  2. Implementar autorización estricta en el write-path de `/api/studio/sync`: Si un usuario restringido envía cambios, el servidor debe validar que ninguna orden o cliente fuera de su `allowed_clients` sea insertado, modificado o borrado.

---

#### 2. SEVERIDAD: BLOCKER (MODELO DE QUOTAS BETTER AUTH ROTO)
* **Affected Scope:** Pilar 2 y Quota Management (L43, L54, L70, L193; `src/server/auth.ts` L83-90; `node_modules/better-auth/dist/plugins/organization/adapter.mjs` L605-612).
* **Finding & Technical Description:**
  El documento afirma reiteradamente que marcar a un miembro como `deactivated` libera inmediatamente un asiento en el contador del plan (ej. de 6/6 a 5/6). **Esta afirmación es técnicamente falsa bajo Better Auth.**
  Al auditar el código fuente del plugin de organización de Better Auth (`adapter.mjs` L605-612):
  ```js
  countMembers: async (data) => {
    return await (await getCurrentAdapter(baseAdapter)).count({
      model: "member",
      where: [{ field: "organizationId", value: data.organizationId }]
    });
  }
  ```
  Better Auth valida los límites en `acceptInvitation` comparando `membersCount >= membershipLimit`. Better Auth cuenta **todas las filas en la tabla `members`**, sin conocer ni filtrar la columna personalizada `status`.
  Por tanto, un miembro desactivado que permanezca en la tabla `members` **seguirá consumiendo 1 asiento**. Al intentar aceptar una nueva invitación, Better Auth arrojará `ORGANIZATION_MEMBERSHIP_LIMIT_REACHED` (403).
  Además, en `src/server/auth.ts` (L85), la propiedad configurada es `memberLimit: 6`, pero el plugin oficial de Better Auth evalúa `membershipLimit`. Como el nombre es incorrecto, Better Auth actualmente recurre a su valor por defecto (100 miembros). Si se corrige a `membershipLimit: 6`, el bloqueo de asientos inactivos paralizará la admisión de nuevos miembros.
* **Recommendation:**
  1. Reemplazar la asunción de que Better Auth maneja asientos inactivos automáticamente.
  2. Implementar un hook en Better Auth (`organizationHooks.beforeAcceptInvitation` o función dinámica `membershipLimit: async (user, org) => ...`) que calcule el cupo real disponible como `limit + count(deactivated_members)`, o eliminar físicamente el registro de la tabla `members` de Better Auth al desactivar y moverlo a una tabla interna `archived_members` que preserve el histórico y la firma.

---

#### 3. SEVERIDAD: MAJOR (DESINCRONIZACIÓN DE TIPOS Y NOMBRES EN ABAC)
* **Affected Scope:** Pilar 3 (L74-84; L106; `src/server/db/schema.ts` L87-135).
* **Finding & Technical Description:**
  El plan especifica que `allowed_clients` almacena una lista JSON de IDs de clientes (ej. `["c-1", "c-2"]`).
  Sin embargo, en el esquema actual de SQLite (`schema.ts` L106-118) y en el frontend:
  - La tabla `work_orders` **no tiene clave foránea `client_id`**; almacena el campo `client` como un texto con el **nombre comercial** del cliente (ej. `"Cervecería Nacional"`).
  - La tabla `stripboard_strips` igualmente almacena `client` como texto del nombre.
  Si el backend en `/api/studio/bootstrap` intenta filtrar con `WHERE client IN (allowed_clients_ids)`, la consulta devolverá cero resultados porque está comparando un ID (`"c-1"`) con un nombre (`"Cervecería Nacional"`).
  Si el cliente cambia de nombre comercial, cualquier filtro basado en texto plano se romperá.
* **Recommendation:**
  Normalizar la relación agregando la columna `client_id` en `work_orders` y `stripboard_strips`, o asegurar que el middleware de filtrado resuelva previamente en memoria el mapeo bidireccional `client_id <-> client_name` antes de aplicar el predicado de exclusión.

---

#### 4. SEVERIDAD: MAJOR (CONTRADICCIÓN EN REVOCACIÓN DE SESIONES Y RE-AUTENTICACIÓN)
* **Affected Scope:** Pilar 2: Desactivación Inteligente (L67-70; `src/server/index.ts` L175-210).
* **Finding & Technical Description:**
  El plan establece que al desactivar a un usuario:
  1. Sus sesiones son purgadas de `sessions`.
  2. Cualquier petición subsecuente es rechazada con `403 account_deactivated`.
  **Falla lógica:** Si la sesión es eliminada físicamente de `sessions`, la llamada a `auth.api.getSession()` en el middleware de Hono devuelve `null`. Por definición, la petición devolverá `401 unauthorized`, impidiendo que el cliente distinga entre una sesión expirada normal y una cuenta desactivada por un Director.
  **Puerta trasera de Re-autenticación:** Better Auth maneja credenciales de usuario en las tablas `users` y `accounts`. Si el usuario desactivado ingresa sus credenciales en `/api/auth/sign-in/email`, Better Auth emitirá una **nueva sesión válida** porque no valida `members.status`. Al regresar a `/api/studio/bootstrap`, el middleware actual busca cualquier membresía en `members` sin verificar `status = 'active'`, reactivando el acceso de facto del usuario suspendido.
  **Fuga en Peticiones en Tránsito / Cliente Abierto:** La aplicación cliente no implementa SSE ni WebSockets. Cuando una petición mutadora falla con 401 durante el debounced sync, `data-bridge.js` (L528) entra en fallback silencioso `"Sin conexión (Local)"`, permitiendo al usuario seguir manipulando datos localmente sin enterarse de que fue desactivado.
* **Recommendation:**
  1. No purgar la sesión ciegamente sin antes marcar un estado explícito de suspensión.
  2. Actualizar el middleware `/api/studio/*` para que valide explícitamente:
     `SELECT status FROM members WHERE user_id = ? AND organization_id = ?`
     Si `status === 'deactivated'`, responder con `403 account_deactivated`.
  3. Interceptar las rutas de login / emisión de sesión de Better Auth o verificar el estado de membresía inmediatamente después de resolver la sesión.

---

#### 5. SEVERIDAD: MAJOR (CONDICIONES DE CARRERA Y HUÉRFANOS POR IDENTIFICADOR VOLÁTIL)
* **Affected Scope:** Pilar 4: Protocolo de Eliminación y Reasignación (L85-96; L115-116).
* **Finding & Technical Description:**
  1. **Dependencia de `short_name` volátil:** En `work_orders`, el responsable asignado se almacena como una cadena de texto plano (`responsible: "Carlos R."`), no como `user_id` ni `member_id`. La consulta propuesta `WHERE responsible = ?` colisionará si dos personas comparten el mismo shortName, transfiriendo involuntariamente las tareas de un tercero no involucrado.
  2. **Omisión del Stripboard de Producción:** El protocolo reasigna `work_orders`, pero omite `stripboard_strips.assignee`. Los turnos y tiras de producción quedarán con el string del usuario borrado, corrompiendo la visualización operativa diaria.
  3. **Condición de Carrera entre Directores (Successor Deletion Race):** Si el Director A reasigna las OTs del Miembro 1 al Miembro 2, mientras simultáneamente el Director B elimina al Miembro 2, el Miembro 1 se borrará y sus OTs quedarán asignadas a un Miembro 2 que acaba de ser destruido. No hay bloqueos pesimistas ni verificación transaccional de que el sucesor siga activo en el instante del commit.
  4. **The Sync Clobbering Race:** Si un Director ejecuta `/api/team/member/reassign-and-delete`, pero otro usuario en el estudio tenía la app abierta con el estado previo en su navegador, el autosave (debounce 250ms) enviará el snapshot viejo vía `/api/studio/sync`, sobreescribiendo las OTs en SQLite y restaurando el `responsible` del usuario que ya no existe.
* **Recommendation:**
  1. Incluir `stripboard_strips` en la transacción de reasignación.
  2. Ejecutar la reasignación dentro de una transacción SQLite estricta (`BEGIN IMMEDIATE`) que valide que el sucesor tenga `status = 'active'` y pertenezca a la misma organización.
  3. Resolver el problema de sincronización masiva (Hallazgo 1) para evitar que clientes desactualizados pisen la reasignación atómica del servidor.

---

#### 6. SEVERIDAD: NIT (ESPECIFICACIÓN DE API INCOMPLETA Y DRIZZLE SCHEMA DESYNC)
* **Affected Scope:** Sección 4.1 y 4.2 (L100-117).
* **Finding & Technical Description:**
  - El plan incluye sentencias `ALTER TABLE` crudas en SQLite, pero omite la definición de los campos en Drizzle ORM (`src/server/db/schema.ts`). Toda la persistencia y migraciones del backend dependen de Drizzle Kit. Si no se actualiza `schema.ts`, se generarán inconsistencias de tipado estático en TypeScript.
  - La tabla de endpoints carece de esquemas Zod de validación de entrada/salida (e.g. no se define qué ocurre si `allowed_clients` recibe `[]` vs `["*"]`).
  - No existe protección contra la auto-desactivación del último Director/Owner, lo que crearía un estudio huérfano sin administración.
* **Recommendation:**
  Declarar formalmente las columnas en `src/server/db/schema.ts`, añadir validadores Zod estrictos para los 4 endpoints y bloquear la auto-desactivación del Owner de la organización.

---
**Fin del informe de revisión crítica.**