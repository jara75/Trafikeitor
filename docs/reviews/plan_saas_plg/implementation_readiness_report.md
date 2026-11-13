# Informe de Preparación para la Implementación y Detalles del Código (Etapa 9)

**Documento Auditado:** [`docs/PLAN_SAAS_PLG_ONBOARDING.md`](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_SAAS_PLG_ONBOARDING.md) (Líneas 71 a 176: Fases de Implementación, Matriz de Roles y Criterios de Aceptación)  
**Fecha:** 2026-11-12  
**Estándar Aplicado:** `implementation-readiness-standard`  
**Panel Revisor:**
- **Pragmatic Tech Lead** (`egm-implementation-readiness`): Análisis de viabilidad técnica, ejecutabilidad paso a paso sin ambigüedades y verificación de criterios de aceptación.
- **Codebase Details Auditor** (`egm-codebase-details`): Comparación exhaustiva contra el código fuente en `src/server/`, `src/client/` e `index.html`, reutilización de librerías y prevención de regresiones.
- **Technical Copy Editor** (`egm-style`): Claridad procedimental en modo imperativo, consistencia de nombres técnicos y eliminación de jerga no calibrada.

---

## 1. Veredicto de Preparación

> [!CAUTION]
> **ESTADO: NO LISTO PARA IMPLEMENTACIÓN DIRECTA (REQUIERE SUBSANACIÓN DE 3 BLOCKERS)**
> El plan describe adecuadamente el flujo funcional general, pero delega decisiones de diseño críticas al implementador y contiene 3 omisiones severas de arquitectura en el código cliente y de base de datos que provocarían la falla total del flujo de onboarding y del control de suscripciones.

---

## 2. Registro de Hallazgos Críticos (Blockers)

### H9-B01: Supresión Silenciosa de Errores por Omisión de `src/client/data-bridge.js`
- **Severidad:** **Blocker**
- **Ámbito Afectado:** Fase 2 (L98–100) y Fase 4 (L135–137); contrastado con [`src/client/data-bridge.js`](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/client/data-bridge.js#L505-L581) y [`src/client/main.js`](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/client/main.js).
- **Descripción del Problema:**
  El plan asigna a `src/client/main.js` (`initializeApp()`) la tarea de:
  > *"si el usuario está autenticado pero el backend responde `403 error: 'no_organization'`, disparar automáticamente `openOnboardingStudioModal()`"*
  
  Sin embargo, en el código real, `main.js` **nunca ejecuta llamadas directas a `/api/studio/bootstrap` ni a `/api/studio/sync`**. Esas llamadas están completamente encapsuladas en `src/client/data-bridge.js`.
  En la implementación actual de `data-bridge.js` (L569–573):
  ```javascript
  // Si la respuesta no fue ok, operamos con la caché local
  emit('sync:status', { isSaving: false, text: 'Modo Offline (Local)' });
  emit('data:ready', { source: 'local', user: null });
  return { ok: true, source: 'local', user: null };
  ```
  Cualquier respuesta HTTP distinta de `200` y `401` (incluyendo **403 Forbidden** y **402 Payment Required**) es capturada y degradada a modo offline silencioso. `main.js` jamás recibe el error `403` ni el evento de falta de organización, dejando la pantalla en blanco o congelada en modo local.
  Asimismo, en la Fase 4, `scheduleSync()` (L482–495) ignora las respuestas con `res.status === 402` y solo muestra `'Sin conexión (Local)'`, sin notificar el vencimiento de la prueba.
- **Acción Concreta de Remediación:**
  Añadir obligatoriamente `[Modify] src/client/data-bridge.js` a las Fases 2 y 4:
  1. En `bootstrap()`: capturar explícitamente `res.status === 403` con `{ error: 'no_organization' }`, mantener la sesión y despachar `emit('auth:no-organization', { user })`.
  2. En `scheduleSync()` y `bootstrap()`: capturar `res.status === 402` (`trial_expired`) y despachar `emit('billing:trial-expired', data)`.
  3. En `main.js`: escuchar `on('auth:no-organization', ...)` para abrir el modal de onboarding, y `on('billing:trial-expired', ...)` para abrir el paywall bloqueante.

---

### H9-B02: Fuga y Contaminación de Datos Locales en Organizaciones Nuevas
- **Severidad:** **Blocker**
- **Ámbito Afectado:** [`src/client/data-bridge.js`](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/client/data-bridge.js#L546-L562) vs Fase 2 (L94–97).
- **Descripción del Problema:**
  En `data-bridge.js`:
  ```javascript
  if (Array.isArray(data.orders) && data.orders.length > 0) {
    ordersCache = data.orders;
    writeLocal(STORAGE_KEY, ordersCache);
  }
  ```
  Cuando un usuario nuevo crea su estudio en la Fase 2, el backend retorna `orders: []` y `clients: []`. Debido a la cláusula `&& data.orders.length > 0`, la caché local `ordersCache` **no se vacía**, reteniendo las OTs de prueba de demostración iniciales (`defaultOrders`, ej. "Cervecería Nacional", "Banco Continental").
  Peor aún: 250ms después, el temporizador de guardado automático `scheduleSync()` se dispara y sube las OTs demo a la base de datos de producción de la nueva organización del cliente, ensuciando su espacio de trabajo recién creado.
- **Acción Concreta de Remediación:**
  Documentar en la Fase 2 la corrección de sincronización de caché en `data-bridge.js`:
  Si el servidor responde exitosamente (`Array.isArray(data.orders)`), `ordersCache` y `clientsCache` deben actualizarse con el array recibido incluso si su longitud es 0 (`ordersCache = data.orders`), reseteando el almacenamiento local de la organización anterior.

---

### H9-B03: Persistencia Nula de `trial_ends_at` en Base de Datos y Discrepancia de Unidades de Tiempo
- **Severidad:** **Blocker**
- **Ámbito Afectado:** Fase 1 (L75, 78), Fase 2 (L94–97) y Fase 4 (L123–125); contrastado con [`schema.ts`](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/server/db/schema.ts#L12), [`src/server/db/index.ts`](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/server/db/index.ts#L24) y [`src/server/index.ts`](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/server/index.ts#L236-L244).
- **Descripción del Problema:**
  En la base de datos, `trial_ends_at` se definió con `DEFAULT NULL`. Al invocar `POST /api/auth/organization/create`, Better Auth crea el registro con `trial_ends_at = NULL`.
  En `src/server/index.ts` (L240–242):
  ```typescript
  const nowSec = Math.floor(Date.now() / 1000);
  const trialEndsAt = orgRow?.trial_ends_at || (nowSec + 14 * 86400);
  ```
  Dado que `trialEndsAt` **nunca se guarda en SQLite**:
  1. Cada invocación a `/api/studio/bootstrap` recalcula 14 días a partir de la hora de la petición, impidiendo que el trial expire jamás (prueba infinita).
  2. En la Fase 4, la validación del middleware `trial_ends_at < NOW` evalúa contra `NULL`, por lo que el Hard Paywall nunca se activa.
  Además, `schema.ts` declara `integer('trial_ends_at', { mode: 'timestamp' })` (modo objeto `Date` / milisegundos en Drizzle), mientras que `index.ts` maneja segundos Unix.
- **Acción Concreta de Remediación:**
  1. Registrar en `src/server/auth.ts` el hook nativo de Better Auth:
     ```typescript
     databaseHooks: {
       organization: {
         create: {
           before: async (org) => {
             const trialEndsAt = new Date(Date.now() + 14 * 86400 * 1000);
             return {
               data: {
                 ...org,
                 subscriptionStatus: 'trialing',
                 trialEndsAt,
                 status: 'active'
               }
             };
           }
         }
       }
     }
     ```
  2. Estandarizar todas las validaciones de expiración en base a timestamps consistentes.

---

## 3. Registro de Hallazgos Mayores (Majors)

### H9-M01: La Fase 5 ya está 100% Implementada y Funcional en el Código
- **Severidad:** **Major**
- **Ámbito Afectado:** Fase 5 (L140–151: Invitación de Miembros y Enlace `?invite=TOKEN`).
- **Descripción del Problema:**
  El plan lista la Fase 5 como trabajo pendiente (`- [ ]`), pero al auditar el repositorio:
  1. `handleSendTeamInvite(event)` ya está implementado en [`src/client/modals-controller.js`](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/client/modals-controller.js#L2473-L2535), llamando a `/api/auth/organization/invite-member` y copiando `?invite=${invitationId}` con `handleCopyTeamInviteLink`.
  2. La captura del parámetro `?invite=TOKEN`, el aviso de invitación en el modal y la aceptación automática con `accept-invitation` y `set-active` ya están implementados y verificados en [`src/client/main.js`](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/client/main.js#L421-L463, #L584-L607, #L666-L692).
  3. El formulario de invitación en el panel de Equipo ya existe en [`index.html`](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/index.html#L1934-L1981).
- **Acción Concreta de Remediación:**
  Marcar la Fase 5 como `[x] (Completada y Verificada)` idéntico a la Fase 1, evitando reescrituras innecesarias que introduzcan regresiones.

---

### H9-M02: Indefinición de Contrato y Brecha de Seguridad en Webhook de Pagos
- **Severidad:** **Major**
- **Ámbito Afectado:** Fase 4 (L126–134) | [`src/server/index.ts`](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/server/index.ts).
- **Descripción del Problema:**
  El plan menciona vagamente `POST /api/billing/webhook` con `(checkout.completed o payload de pasarela como Stripe/Bold)`.
  1. No define el contrato de datos exacto (si los datos vienen en `body.data.object.client_reference_id`, `body.organizationId`, etc.).
  2. No exige validación de firma ni token secreto (`process.env.BILLING_WEBHOOK_SECRET`). Al ser un endpoint público fuera del contexto de sesión, cualquier atacante podría hacer `POST` y activar suscripciones arbitrarias sin pagar.
  3. En la Fase 3, el botón *"Suscribirme al Plan Pro ($49/mes)"* no tiene acción técnica asociada.
- **Acción Concreta de Remediación:**
  1. Especificar el payload mínimo estándar: `{ event: 'checkout.completed', organizationId: string }`.
  2. Exigir validación de encabezado secreto: `c.req.header('x-webhook-secret') === process.env.BILLING_WEBHOOK_SECRET`.
  3. Definir la acción del botón de checkout como redirección a URL externa con parámetro: `window.location.href = CHECKOUT_URL + '?client_reference_id=' + org.id`.

---

### H9-M03: Omisión de Identificadores DOM y Centralización de Modales
- **Severidad:** **Major**
- **Ámbito Afectado:** Fase 2 (L85–97) y Fase 3 (L106–116).
- **Descripción del Problema:**
  - En `#onboarding-studio-modal` faltan los IDs exactos del formulario (`#onboarding-studio-form`), inputs (`#onboarding-studio-name`, `#onboarding-studio-slug`), error feedback (`#onboarding-studio-error`), y botón submit (`#onboarding-studio-submit-btn`).
  - No se especifica el algoritmo de slug en vivo: `name.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')`.
  - El plan asigna la manipulación del modal de suscripción a `main.js`, violando la arquitectura donde todos los modales se coordinan en `modals-controller.js`.
  - No se contempla el comportamiento de la tecla `Escape` en `main.js`: cuando el modal es bloqueante (Onboarding forzoso o Hard Paywall), presionar `Escape` no debe permitir cerrar la ventana.
- **Acción Concreta de Remediación:**
  1. Detallar los selectores e IDs del DOM en la Fase 2 y 3.
  2. Implementar `openSubscriptionPaywallModal(isBlocking = false)` y `closeSubscriptionPaywallModal()` dentro de `src/client/modals-controller.js`.
  3. Actualizar el listener global de `Escape` en `main.js` para ignorar modales con atributo `data-blocking="true"`.

---

### H9-M04: Ausencia de Comandos Automatizados de Verificación
- **Severidad:** **Major**
- **Ámbito Afectado:** Sección 6: Verificación y Criterios de Aceptación (L164–176).
- **Descripción del Problema:**
  Los criterios de aceptación son exclusivamente narrativos ("Usuario anónimo entra a / -> Se registra en 10 segundos..."). No existe ningún comando ejecutable de consola, test unitario o script programático que permita validar el cumplimiento objetivo de las fases.
- **Acción Concreta de Remediación:**
  Incorporar una batería de comandos ejecutables con `npx tsx` que prueben de forma automatizada:
  - Registro de usuario y retorno 403 `no_organization` en `bootstrap`.
  - Creación de organización con persistencia efectiva de `trial_ends_at`.
  - Simulación de vencimiento de trial en base de datos y respuesta `402 trial_expired` en `sync`.
  - Activación por webhook con secreto y confirmación de reactivación.

---

### Hallazgos Menores (Nits)

1. **H9-N01: Verbos No Imperativos y Tono Subjetivo** (L83, L94–97, L126–134):
   Cambiar formas verbales pasivas ("Llama", "Fija", "Recibe") por comandos imperativos técnicos ("Llamar", "Asignar", "Validar"). Eliminar expresiones como "Guiar suavemente" y "Blindar".
2. **H9-N02: Llamada Redundante a `set-active`** (L96):
   Better Auth asigna automáticamente la organización recién creada como activa a menos que se configure explícitamente `keepCurrentActiveOrganization: true`. La llamada explícita a `set-active` es un resguardo válido pero debe documentarse como condicional.
3. **H9-N03: Emojis Decorativos en la Especificación Técnica** (L108–110):
   Reemplazar emojis en el documento técnico por clases de estado CSS o tokens de diseño (`badge--trial-healthy`, `badge--trial-warning`, `badge--active`).

---

## 4. Matriz de Remediación para la Sección 71–176

| ID Hallazgo | Componente | Severidad | Acción Concreta de Refactor |
| :--- | :--- | :--- | :--- |
| **H9-B01** | `src/client/data-bridge.js` | **Blocker** | Incluir `[Modify] src/client/data-bridge.js` en Fases 2 y 4 para propagar eventos `auth:no-organization` y `billing:trial-expired`. |
| **H9-B02** | `src/client/data-bridge.js` | **Blocker** | Resetear `ordersCache = []` y `clientsCache = []` si el servidor retorna arrays vacíos para un estudio nuevo. |
| **H9-B03** | `src/server/auth.ts` / Hook | **Blocker** | Implementar hook `organization.create.before` para persistir `trial_ends_at = NOW + 14d` y `subscription_status = 'trialing'` en milisegundos. |
| **H9-M01** | Fase 5 | **Major** | Marcar Fase 5 como `[x] (Completada y Verificada)`. |
| **H9-M02** | Facturación / Webhook | **Major** | Formalizar payload de webhook, encabezado secreto `x-webhook-secret` y redirección del botón de suscripción. |
| **H9-M03** | Modales y DOM | **Major** | Especificar IDs DOM en `index.html`, centralizar en `modals-controller.js` y blindar tecla `Escape` ante modales bloqueantes. |
| **H9-M04** | Verificación | **Major** | Incorporar script automatizado con comandos ejecutables `npx tsx` en la Sección 6. |
| **H9-N01..03**| Estilo e Idiomática | **Nit** | Normalizar a verbos imperativos, documentar `set-active` como resguardo y reemplazar emojis por clases CSS. |

