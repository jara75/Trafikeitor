# REVISIÓN DE ARQUITECTURA ZOOM-OUT (SKEPTICAL ARCHITECT)

**Documento Auditado:** [PLAN_GESTION_EQUIPO_COLABORATIVO.md](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md)  
**Contexto Técnico:** `/src` ([index.ts](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/server/index.ts), [auth.ts](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/server/auth.ts), [schema.ts](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/server/db/schema.ts), [data-bridge.js](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/client/data-bridge.js), [modals-controller.js](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/client/modals-controller.js))  
**Auditor:** Skeptical Architect (Zoom Out Goldfish)

---

## 1. Resumen Ejecutivo & Veredicto

### **Veredicto: RECHAZADO / REQUIERE REVISIÓN URGENTE (NEEDS REVISION)**

El documento contiene **una falla arquitectónica crítica de pérdida masiva de datos**, además de **violaciones severas de YAGNI** y **duplicación de primitivas** que Better Auth y el cliente ya resuelven de forma nativa.

El plan asume que puede filtrar clientes y órdenes por usuario en `bootstrap` (Pilar 3 - ABAC) sin considerar el modelo de persistencia del sistema. Actualmente, [src/server/index.ts#L417-L567](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/server/index.ts#L417-L567) ejecuta un **sync transaccional destructivo** (`DELETE FROM work_orders`, `DELETE FROM clients`) enviando el estado completo del cliente. **Si un usuario restringido recibe un subconjunto de datos y su navegador autoguarda, destruirá irreversiblemente todas las órdenes de los demás clientes de la agencia en SQLite.**

Adicionalmente, el documento propone 4 endpoints propietarios que reinventan APIs existentes de Better Auth y la caché reactiva de `data-bridge.js`.

---

## 2. Simplificaciones de Alto Nivel & Violaciones YAGNI

### 2.1 YAGNI Extremo: ABAC y Cartera Restringida (`allowed_clients`) en Equipos de 6 Asientos
- **Problema:** En [PLAN_GESTION_EQUIPO_COLABORATIVO.md#L74-L84](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L74-L84) se plantea un sistema ABAC corporativo para segregar clientes por conflicto de intereses / NDAs.
- **Realidad de Negocio & Escala:** La aplicación opera bajo un límite PLG de **6 miembros** ([src/server/auth.ts#L85](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/server/auth.ts#L85)). En un taller/estudio boutique de 6 personas, el flujo de tráfico es compartido y visible en stripboards físicos y digitales. Diseñar micro-particionado de carteras dentro de un mismo espacio de trabajo añade una complejidad monumental con nulo retorno sobre la inversión (ROI).
- **Alternativa Nativa:** Si dos clientes de la agencia tienen un conflicto legal estricto (ej. dos bancos rivales), la arquitectura de Better Auth ya soporta nativamente **múltiples organizaciones (Workspaces)** con sesiones independientes ([src/server/auth.ts#L84](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/server/auth.ts#L84)). Crear dos organizaciones separadas ("Estudio - Cuenta A" y "Estudio - Cuenta B") proporciona aislamiento total sin escribir una sola línea de lógica ABAC defectuosa.

### 2.2 Proliferación de Endpoints Redundantes (Endpoint Sprawl)
- El plan propone en la sección 4.2:
  1. `POST /api/team/member/status`
  2. `POST /api/team/member/permissions`
  3. `POST /api/team/member/check-workload`
  4. `POST /api/team/member/reassign-and-delete`
- **Innecesario:**
  - `check-workload`: El cliente ya tiene todas las órdenes cargadas en memoria síncrona en `ordersCache` ([src/client/data-bridge.js#L455](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/client/data-bridge.js#L455)). Calcular cuántas OTs tiene activas un usuario toma `0.01ms` en el cliente con un simple `filter()`. Crear un endpoint REST y un viaje de red para un `SELECT COUNT(*)` es puro desperdicio.
  - `reassign-and-delete`: Reasigna OTs en el cliente con la reactividad existente (que ya dispara `scheduleSync()`) y llama al método estándar de Better Auth `/api/auth/organization/remove-member`. No se requiere un endpoint monolítico ad-hoc.
  - `status` y `permissions` pueden consolidarse o aprovechar la metadata de membresía de Better Auth.

### 2.3 Redescubrimiento de Funcionalidades ya Implementadas (Pilar 1)
- [PLAN_GESTION_EQUIPO_COLABORATIVO.md#L61-L65](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L61-L65) redacta la invitación, expiración a 7 días y copiado de enlace directo como un trabajo futuro a desarrollar.
- **Hecho:** Esto ya está programado y funcionando en [src/client/modals-controller.js#L2432-L2550](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/client/modals-controller.js#L2432-L2550) mediante `/api/auth/organization/invite-member` y `handleCopyTeamInviteLink()`. Rediseñarlo desde cero en Fase 1 y 2 es retrabajo innecesario.

---

## 3. Oportunidades de Reutilización de Código & Librerías

| Componente Propuesto | Alternativa Minimalista Existente | Beneficio Arquitectónico |
| :--- | :--- | :--- |
| **Pilar 1: Invitaciones y Links** | Funciones existentes en [modals-controller.js#L2477-L2550](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/client/modals-controller.js#L2477-L2550) y Better Auth Plugin. | Cero código backend nuevo; solo ajustes cosméticos de UI. |
| **`check-workload` Endpoint** | `ordersCache.filter(o => o.responsible === shortName && isActive(o.status))` en [data-bridge.js](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/client/data-bridge.js). | Cero latencia de red, cero endpoints nuevos. |
| **Eliminación de Miembros** | `/api/auth/organization/remove-member` nativo de Better Auth. | Respeta la integridad de Better Auth y sus tablas internas. |
| **Aislamiento por Confidencialidad / NDAs** | Multi-workspace nativo de Better Auth (`setActiveOrganization`). | Aislamiento físico de base de datos sin romper la sincronización cliente-servidor. |
| **Bloqueo de Inactivos** | Inyección de 4 líneas en el middleware existente [src/server/index.ts#L175-L249](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/server/index.ts#L175-L249). | Validación directa en cada petición sin dependencias complejas de purga asíncrona de tokens. |

---

## 4. Puntos Ciegos Arquitectónicos & Riesgos Críticos

### 4.1 Peligro Crítico: Corrupción y Purga de Datos en `/api/studio/sync`
- En [src/server/index.ts#L426-L470](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/server/index.ts#L426-L470), la sincronización transaccional funciona bajo la premisa de que el cliente tiene la visión completa de la organización:
  ```typescript
  sqlite.prepare('DELETE FROM clients WHERE organization_id = ?').run(organizationId);
  sqlite.prepare('DELETE FROM work_orders WHERE organization_id = ?').run(organizationId);
  ```
- Si un usuario restringido recibe solo el cliente "c-1" en `/api/studio/bootstrap` ([PLAN#L78-L83](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L78-L83)), su cliente local (`data-bridge.js`) asumirá que solo existen esas órdenes. Al dispararse `scheduleSync()` (debounce de 250ms tras cualquier cambio o arrastre en stripboard), el servidor borrará **todas las OTs de los demás clientes**.
- **Impacto:** Pérdida catastrófica e irreversible de datos operativos.

### 4.2 Desincronización del Contador de Asientos (`memberLimit`) en Better Auth
- El plan afirma en [PLAN#L43-L54](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L43-L54) que marcar `status = 'deactivated'` "libera un cupo en el plan (pasa de 6/6 a 5/6)".
- **Blind Spot:** El plugin `organization({ memberLimit: 6 })` de Better Auth ([src/server/auth.ts#L84-L89](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/server/auth.ts#L84-L89)) calcula el límite contando las filas totales en la tabla `members` (`SELECT count(*) FROM members WHERE organization_id = ?`). Better Auth **no tiene conocimiento** de la columna personalizada `status = 'deactivated'`.
- **Impacto:** Si una agencia tiene 6 miembros y desactiva a 1, Better Auth continuará arrojando error de límite alcanzado (`member_limit_reached`) e impedirá invitar a otro colaborador.

### 4.3 Falso Dilema: Las Firmas Históricas NO Están Vinculadas por Clave Foránea
- La justificación del plan en [PLAN#L13-L20](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L13-L20) afirma que borrar a un usuario destruiría sus firmas en OTs previas.
- **Realidad en Esquema:** En [src/server/db/schema.ts#L123-L138](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/server/db/schema.ts#L123-L138), el campo `route_entries.sign` y `work_orders.responsible` son cadenas de texto planas (`text('sign')`), **sin clave foránea** (`FOREIGN KEY`) hacia `users.id` o `members.id`.
- Por diseño de SQLite, un usuario puede ser eliminado de `members` y sus firmas ("Andrés J.", "Carlos R.") permanecen inmutables en el histórico. No hay riesgo de cascada en las firmas.

### 4.4 Contaminación de la Caché Local (`responsiblesCache`)
- [src/client/data-bridge.js#L579-L590](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/client/data-bridge.js#L579-L590) puebla `responsiblesCache` en `localStorage` al hacer bootstrap. Si no se filtra explícitamente a los miembros con `status === 'deactivated'`, los usuarios desactivados continuarán mostrándose en los selectores de nueva asignación en el cliente.

---

## 5. Recomendaciones Accionables (Priorizadas)

### 🔴 Blocker (Impiden la Aprobación del Plan)

1. **Eliminar Inmediatamente el Pilar 3 (ABAC / `allowed_clients`):**
   - No implementar filtrado parcial en `/api/studio/bootstrap` hasta que no exista una arquitectura de sincronización delta granular.
   - Preservar la integridad de `/api/studio/sync`.
   - Si se requiere confidencialidad estricta entre cuentas, orientar al usuario hacia la creación de un nuevo Workspace en Better Auth.

2. **Alinear la Desactivación de Miembros con el Límite de Better Auth:**
   - Para que un miembro inactivo realmente libere un asiento en `memberLimit: 6`, el registro de membresía activo debe removerse de Better Auth o migrarse a una tabla de archivo (`archived_members`). De lo contrario, Better Auth bloqueará nuevas invitaciones.

### 🟡 Major (Simplificación & Robustez)

3. **Eliminar los Endpoints `check-workload` y `reassign-and-delete`:**
   - La comprobación de carga activa debe realizarse directamente en la UI utilizando `ordersCache`.
   - La reasignación de OTs debe ocurrir como una actualización estándar de órdenes en el cliente (aprovechando `saveOrders()` y `scheduleSync()`), seguida de la invocación de `/api/auth/organization/remove-member`.

4. **Bloqueo Limpio en Middleware:**
   - En lugar de rutinas complejas de invalidación de sesiones, agregar en [src/server/index.ts#L185](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/server/index.ts#L185) una verificación directa en SQLite:
     ```typescript
     const mem = sqlite.prepare('SELECT status FROM members WHERE user_id = ? AND organization_id = ?').get(session.user.id, activeOrgId);
     if (mem && mem.status === 'deactivated') {
       return c.json({ ok: false, error: 'member_deactivated', message: 'Acceso revocado por la dirección del estudio.' }, 403);
     }
     ```

### 🟢 Nit (Detalles Menores de Limpieza)

5. **Depuración de Selectores en el Cliente:**
   - En [data-bridge.js#L580](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/client/data-bridge.js#L580), ignorar a los usuarios cuyo estado sea `deactivated` para evitar que aparezcan en los menús desplegables de responsables.
6. **Reutilizar UI de Invitaciones:**
   - Enlazar directamente los botones del rediseño visual a las funciones ya existentes `handleSendTeamInvite()` y `handleCopyTeamInviteLink()` en [modals-controller.js](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/client/modals-controller.js).

---
**Conclusión:** Reducir el alcance del plan eliminando ABAC (Pilar 3) y los endpoints redundantes permitirá entregar la gobernanza de equipo (desactivación y transferencia de OTs) de forma limpia, segura y en menos de la mitad del tiempo estimado.