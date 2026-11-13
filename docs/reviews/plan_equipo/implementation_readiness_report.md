# Stage 9: Implementation Readiness Review
**Documento Auditado:** [PLAN_GESTION_EQUIPO_COLABORATIVO.md](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L149-L197)  
**Alcance Evaluado:** Sección 6 (*"Fases de Ejecución Detalladas"*, L149-L190) y Sección 7 (*"Criterios de Aceptación"*, L191-L197)  
**Contexto del Código:** [`src/server/`](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/server) y [`src/client/`](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/client)  
**Evaluador:** Implementation Readiness Goldfish (Pragmatic Tech Lead)

---

### Resumen Ejecutivo de Preparación para Implementación
El documento conceptualiza adecuadamente la gobernanza y el ciclo de vida del equipo. Sin embargo, desde la perspectiva de ingeniería y ejecución directa, **el plan no está listo para ser codificado de inmediato**. Presenta **2 Bloqueadores Críticos** (uno de ellos con riesgo inminente de pérdida catastrófica de datos en producción), **4 Gaps Mayores** de diseño y especificación de contratos, y **1 Observación Menor**.

Un desarrollador junior o semi-senior que intente ejecutar las Fases 1 a 4 tal como están redactadas romperá el backend o provocará la eliminación inadvertida de órdenes de trabajo de clientes ajenos.

---

### Hallazgos Priorizados

#### 1. [BLOCKER] Riesgo de Pérdida Catastrófica de Datos en `/api/studio/sync` por Filtrado ABAC
- **Alcance Afectado:** Sección 6, Fase 2 (L172-L175) y Sección 3, Pilar 3 (L74-L84).
- **Archivo en Código:** [`src/server/index.ts`](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/server/index.ts#L417-L465) y [`src/client/data-bridge.js`](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/client/data-bridge.js#L507-L536).
- **Hallazgo:**  
  La sincronización en `src/server/index.ts` ejecuta un borrado global por organización antes de reinsertar los datos:
  ```typescript
  sqlite.prepare('DELETE FROM clients WHERE organization_id = ?').run(organizationId);
  sqlite.prepare('DELETE FROM work_orders WHERE organization_id = ?').run(organizationId);
  ```
  Si en Fase 2 se implementa el filtrado ABAC en `/api/studio/bootstrap` para entregar únicamente los clientes autorizados (ej. solo el cliente `c-1` y sus OTs), el cliente web almacenará únicamente ese subconjunto en `clientsCache` y `ordersCache`.  
  En cuanto ese usuario restringido realice cualquier cambio o se dispare el debounce automático de `scheduleSync()`, el cliente enviará su subconjunto local a `POST /api/studio/sync`. El backend ejecutará `DELETE FROM work_orders WHERE organization_id = ?`, **borrando permanentemente todas las OTs y clientes del resto de la agencia**.
- **Orientación Obligatoria:**  
  Fase 2 debe incluir explícitamente la adaptación de `/api/studio/sync`:
  1. Si el usuario tiene `allowed_clients !== '["*"]'`, el backend no debe ejecutar borrado total. Debe limitar la mutación únicamente a los registros cuyos `client` coincidan con los clientes permitidos del usuario (`DELETE FROM work_orders WHERE organization_id = ? AND client IN (...)`), o migrar hacia un esquema de mutaciones transaccionales puntuales (`INSERT OR REPLACE` selectivo).

---

#### 2. [BLOCKER] Incompatibilidad de `memberLimit: 6` en Better Auth con la Desactivación de Asientos
- **Alcance Afectado:** Sección 6, Fase 1 & 2; Sección 7, Criterio 2 (*"Un miembro desactivado libera inmediatamente 1 asiento"*, L193); Sección 3, Pilar 2 (L66-L73).
- **Archivo en Código:** [`src/server/auth.ts`](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/server/auth.ts#L84-L90).
- **Hallazgo:**  
  En `src/server/auth.ts`, el plugin de organización tiene configurado `organization({ memberLimit: 6 })`.  
  Al invocar `/api/auth/organization/invite-member`, Better Auth cuenta directamente las filas de la tabla `members`: `SELECT COUNT(*) FROM members WHERE organization_id = ?`.  
  Al hacer una desactivación lógica (`members.status = 'deactivated'`), el registro sigue existiendo en `members`. Better Auth seguirá contando al usuario desactivado dentro del tope de 6 asientos, **rechazando invitaciones y haciendo imposible cumplir el Criterio de Aceptación 2**.
- **Orientación Obligatoria:**  
  El plan debe definir cómo se reconcilia el conteo de asientos:
  1. Remover `memberLimit: 6` estático de la inicialización de Better Auth en `auth.ts` y validar el límite de asientos de forma personalizada en un hook de Better Auth o middleware contando solo `WHERE status = 'active'`.

---

#### 3. [MAJOR] Endpoints `/api/team/*` Desprotegidos Fuera del Middleware de Organización
- **Alcance Afectado:** Sección 4.2 (L109-L117) y Sección 6, Fase 1 & 2 (L168-L175).
- **Archivo en Código:** [`src/server/index.ts`](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/server/index.ts#L175-L250).
- **Hallazgo:**  
  El middleware de sesión, resolución de organización y control de suscripción en `src/server/index.ts` está montado exclusivamente en:
  `app.use('/api/studio/*', async (c, next) => { ... })`  
  Los endpoints propuestos en la tabla de la Sección 4.2 comienzan con `/api/team/member/...`.  
  Si un desarrollador los implementa bajo ese path y solo actualiza el middleware de `/api/studio/*` (como indica la Fase 2), los 4 endpoints de gobernanza quedarán **completamente abiertos, sin autenticación de sesión ni verificación de rol `owner/admin`**.
- **Orientación Obligatoria:**  
  Estandarizar las rutas bajo el prefijo ya protegido:
  - `/api/studio/team/member/status`
  - `/api/studio/team/member/permissions`
  - `/api/studio/team/member/check-workload`
  - `/api/studio/team/member/reassign-and-delete`  
  O definir explícitamente en Fase 1 la creación de un middleware `app.use('/api/team/*', ...)` con verificación de sesión y permisos de administrador.

---

#### 4. [MAJOR] Ausencia de Contratos de Entrada/Salida (Payloads y DTOs) en Endpoints
- **Alcance Afectado:** Sección 4.2 (L109-L117) y Sección 6, Fase 1 (L168-L171).
- **Hallazgo:**  
  Section 6 indica *"Implementar los 4 endpoints de gobernanza en `src/server/index.ts`"*, pero ninguna parte del documento especifica la estructura JSON esperada en el `body` ni la respuesta (`response`).  
  El desarrollador debe tomar decisiones no documentadas:
  - ¿Se envía `memberId` (`members.id`), `userId` (`users.id`), o ambos?
  - ¿Qué payload exacto recibe `/api/team/member/permissions`? ¿`{ memberId: string, allowedClients: string[], roleTitle: string }`? ¿Cómo se valida que `allowedClients` sea un JSON array válido?
  - ¿Qué devuelve `/api/team/member/check-workload`? ¿`{ ok: boolean, activeOrdersCount: number, activeOrders: Array<{ id: string, title: string }> }`?
  - ¿Cómo se previene que un `owner` se auto-desactive a sí mismo?
- **Orientación Obligatoria:**  
  Documentar los contratos de TypeScript/Zod para las peticiones y respuestas de cada endpoint antes de iniciar la Fase 1.

---

#### 5. [MAJOR] Desconexión de Identificadores en Reasignación de OTs (`memberId` vs `short_name`) y Ambigüedad en Hoja de Ruta
- **Alcance Afectado:** Sección 3, Pilar 4 (L85-L96) y Sección 6, Fase 1 (L168-L171).
- **Archivo en Código:** [`src/server/db/schema.ts`](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/server/db/schema.ts#L104-L139) y [`src/client/data-bridge.js`](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/client/data-bridge.js#L371-L384).
- **Hallazgo:**  
  En SQLite, `work_orders.responsible` y `route_entries.sign` almacenan el `short_name` del usuario (ej. `'Carlos R.'` o `'Andrés J.'`), **no** el `member.id` ni el `user.id`.  
  Si el backend ejecuta `SELECT COUNT(*) FROM work_orders WHERE responsible = ?` pasando `memberId`, el resultado siempre será `0`. El backend debe hacer un `JOIN members m ON users u` para obtener el `short_name` del responsable.  
  Asimismo, en `reassign-and-delete`, el paso *"2. Registra una nota en la Hoja de Ruta: 'Relevo por transferencia de responsabilidad'"* no especifica si debe insertar una nueva fila en `route_entries` (con qué valores de `from_dept`, `to_dept`, `task`, `sign`) o actualizar las notas del paso actual.  
  Tampoco se menciona `stripboard_strips.assignee`, que también guarda el `short_name` de las tiras de producción asignadas al miembro.
- **Orientación Obligatoria:**  
  Especificar la consulta de resolución `memberId -> users.short_name` y detallar la sentencia SQL exacta de actualización en `work_orders`, `stripboard_strips` y `route_entries`.

---

#### 6. [MAJOR] Omisión de Actualización en `src/client/data-bridge.js` para Catálogo de Responsables
- **Alcance Afectado:** Sección 6, Fase 3 (L176-L180); Sección 2 (Tabla de Estados, L49-L56); Sección 7, Criterio 3.
- **Archivo en Código:** [`src/client/data-bridge.js`](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/client/data-bridge.js#L579-L590).
- **Hallazgo:**  
  En `data-bridge.js`, la función `bootstrap()` alimenta `responsiblesCache` (que a su vez llena los `<select>` de responsables en las vistas) recorriendo todos los miembros que devuelve el backend:
  ```javascript
  if (Array.isArray(data.members) && data.members.length > 0) {
    data.members.forEach((m) => {
      const memberShort = (mUser.shortName || mUser.name || '').trim();
      if (memberShort && !responsiblesCache.includes(memberShort)) {
        responsiblesCache.push(memberShort);
      }
    });
  }
  ```
  La Fase 3 solo menciona tocar `index.html` y `modals-controller.js`. Si no se actualiza `data-bridge.js` para filtrar únicamente los miembros con `m.status === 'active'`, los colaboradores desactivados continuarán apareciendo en todos los selectores de responsables de nuevas OTs, violando la regla de la Sección 2 (*"Aparece en Nuevos Selectores: No (Oculto)"*).
- **Orientación Obligatoria:**  
  Incorporar `src/client/data-bridge.js` en la lista de archivos a intervenir en Fase 3, filtrando `responsiblesCache` para excluir usuarios inactivos mientras se preservan para renderizado histórico.

---

#### 7. [NIT] Falta de Harness de Ejecución para `scripts/verify-team-governance.ts`
- **Alcance Afectado:** Sección 6, Fase 4 (L181-L188).
- **Archivo en Código:** [`package.json`](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/package.json#L6-L13).
- **Hallazgo:**  
  Actualmente no existe carpeta `scripts/` ni script `"test"` en `package.json`.  
  El plan debe definir cómo se invoca la verificación: si mediante `npx tsx scripts/verify-team-governance.ts` contra un servidor local corriendo en `http://localhost:3000`, o utilizando el cliente in-memory `app.request()` de Hono con base de datos SQLite de prueba.
- **Orientación:**  
  Añadir el comando de ejecución exacto o agregar el script al `package.json` (`"test:governance": "tsx scripts/verify-team-governance.ts"`).

---

### Dictamen de Preparación
- **Estado:** ❌ **REQUIERE AJUSTES PREVIOS (REVISED PLAN NEEDED)**
- **Próximo Paso:** Incorporar los esquemas de payload, resolver el aislamiento en `/api/studio/sync` y detallar los contratos en las Secciones 4 y 6 antes de iniciar la Fase 1 de desarrollo.