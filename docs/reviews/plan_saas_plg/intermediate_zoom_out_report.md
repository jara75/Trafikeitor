# Dictamen de Arquitectura Zoom-Out Intermedio (Etapa 8)

**Documento Auditado:** [`docs/PLAN_SAAS_PLG_ONBOARDING.md`](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_SAAS_PLG_ONBOARDING.md) (Líneas 1 a 176)  
**Fecha:** 2026-11-12  
**Estándar Aplicado:** `zoom-out-standard`  
**Evaluador:** Skeptical Architect (Zoom-Out Goldfish)  
**Enfoque:** Simplicidad arquitectónica, YAGNI, prevención de callejones sin salida (dead-ends), reutilización del código existente y desacoplamiento limpio entre Better Auth y Trafikeitor.

---

## 1. Resumen Ejecutivo de Alto Nivel

El plan propone una dirección PLG acertada (Reverse Trial de 14 días sin tarjeta de crédito y autoservicio rápido). Sin embargo, desde una perspectiva de arquitectura minimalista y pragmática, el documento adolece de **sobre-ingeniería especulativa (YAGNI)**, **planificación de trabajo ya implementado**, y **acoplamientos indebidos** entre el motor de autenticación y la lógica de dominio.

Para que el hito de Onboarding sea verdaderamente ágil y robusto, se deben ejecutar tres simplificaciones arquitectónicas inmediatas:
1. **Eliminar la Fase 5 del alcance activo:** El flujo de invitación por enlace y aceptación con Better Auth ya está 100% construido y operativo en el código base.
2. **Redimensionar la Fase 4 (Desacoplar Paywall Rígido y Webhook Especulativo):** No existe pasarela de pago contratada ni configurada (sin Stripe/Bold, sin secrets, sin checkout). Construir un webhook huérfano y un Hard Paywall con `402 Payment Required` crea un callejón sin salida (dead-end) que bloquea al usuario sin posibilidad de pago. La fase de facturación debe postergarse a un hito comercial dedicado, sustituyendo el Hard Paywall inicial por un aviso de expiración no bloqueante con exportación de datos garantizada.
3. **Frontera Nítida entre Better Auth y Trafikeitor:** Better Auth debe limitarse a la gestión de identidad, sesiones y membresías del equipo interno (máx. 6). No se deben forzar clientes externos dentro de organizaciones Better Auth (ya cuentan con tokens públicos de revisión), y el ciclo de vida del trial debe inicializarse de forma transparente mediante hooks nativos (`databaseHooks.organization.create.before`), garantizando que la base de datos persista fechas reales y no trials infinitos.

---

## 2. Registro Consolidado de Hallazgos y Simplificaciones

### Hallazgos Críticos (Blockers)

#### H8-B01: Reinventar la Rueda en Fase 5 (Trabajo 100% Implementado en el Repositorio)
- **Severidad:** **Blocker**
- **Ámbito Afectado:** `Fase 5: Invitación de Miembros y Clientes` (L140–152) y Criterio de Verificación 2 (L171–173).
- **Racional de Simplicidad:**
  La Fase 5 se plantea como trabajo pendiente (`- [ ] [Modify]`), proponiendo implementar `handleSendTeamInvite`, la copia de enlaces `?invite=${invitationId}` y la aceptación automática con `accept-invitation` y `set-active`.
  
  **Esta funcionalidad ya se encuentra 100% implementada y en funcionamiento en el repositorio:**
  - En [`src/client/modals-controller.js`](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/client/modals-controller.js#L2473-L2535): ya existen `handleSendTeamInvite`, `handleCopyTeamInviteLink` y `handleCancelTeamInvite`, consumiendo las APIs nativas de Better Auth.
  - En [`src/client/main.js`](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/client/main.js#L421-L463, #L584-L607, #L666-L692): ya se procesa `?invite=TOKEN` tanto en el formulario de acceso (`showAuthGate`) como en el arranque (`initializeApp`), llamando a `accept-invitation` y `set-active`.
  - En [`index.html`](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/index.html#L1934-L1981): el panel de Equipo ya cuenta con el formulario y la tabla de invitaciones pendientes.
- **Acción de Simplificación:**
  Marcar la Fase 5 como `[x] (Completada y Verificada)` idéntica a la Fase 1. Eliminarla del backlog de tareas de codificación para evitar reescrituras redundantes y riesgo de regresiones en código ya probado.

---

#### H8-B02: YAGNI Extremo y Callejón sin Salida en Fase 4 (Hard Paywall y Webhook Huérfano)
- **Severidad:** **Blocker**
- **Ámbito Afectado:** Paso 4 del Diagrama (L44–52), Condición 4 del Front-Controller (L66), Fase 4 (L119–138) y Criterio de Verificación 3 (L174–176).
- **Racional de Simplicidad:**
  La Fase 4 propone construir:
  1. Un endpoint receptor `POST /api/billing/webhook` que ejecuta una sentencia SQL cruda (`UPDATE organizations SET subscription_status = 'active'`).
  2. Un middleware que rechaza llamadas con `402 Payment Required`.
  3. Un modal bloqueante que impide usar la aplicación al expirar los 14 días.
  
  **Por qué esto es una violación flagrante de YAGNI y un error de diseño:**
  - En el repositorio **no existe pasarela de pagos contratada ni configurada** (no hay dependencias de Stripe/Bold en `package.json`, ni variables de entorno como `STRIPE_SECRET_KEY`, ni endpoint de generación de checkout).
  - Diseñar un webhook sin pasarela es diseñar a ciegas: cada pasarela (Stripe, Bold, LemonSqueezy, MercadoPago) tiene payloads, headers y mecanismos de firma criptográfica radicalmente diferentes. Implementar un webhook no autenticado es introducir una vulnerabilidad de seguridad grave donde cualquiera podría hacer `POST` y auto-activarse.
  - Si no existe un checkout real donde el usuario pueda pagar con tarjeta, activar un "Hard Paywall" que bloquea la interfaz genera un **callejón sin salida (dead-end)**: el usuario queda con su estudio bloqueado, sin posibilidad de pagar y sin poder consultar ni exportar su trabajo.
  - Al ser un modelo *Reverse Trial* de 14 días que apenas va a lanzarse, **ningún usuario real alcanzará la expiración en el primer día de despliegue**.
- **Acción de Simplificación:**
  - **Desacoplar la pasarela de pagos del hito de Onboarding PLG:** Retirar `POST /api/billing/webhook` de este documento. La integración con pasarelas de pago y webhooks debe ser un hito posterior e independiente (*Billing & Monetization Milestone*), una vez contratado el proveedor.
  - **Redimensionar la expiración para el MVP:** Si `trialDaysLeft <= 0` y no está activa, mostrar un estado de "Prueba Finalizada" informativo (soft expiration) con banner superior y modal de contacto/activación manual, permitiendo siempre el acceso de solo lectura y la exportación de respaldos (`exportBackupData()`). Nunca secuestrar los datos de la agencia.

---

#### H8-B03: Fuga de Responsabilidades y Trial Infinito en DB
- **Severidad:** **Blocker**
- **Ámbito Afectado:** Sección 1 (L11–16), Paso 2 del Diagrama (L34), Fase 1 y 2 (L75, 95–97).
- **Racional de Simplicidad:**
  La línea 34 afirma que la API nativa de Better Auth `POST /api/auth/organization/create` *"activa 14 días de prueba"*.
  Esto es arquitectónicamente falso. El plugin `organization` nativo de Better Auth desconoce por completo las columnas comerciales `trial_ends_at` y `subscription_status`; solo inserta los campos de su propio esquema (`id`, `name`, `slug`, `logo`, `metadata`). Al ejecutarse, SQLite deja `trial_ends_at = NULL`.
  En consecuencia, en `src/server/index.ts` (L240–242), cada vez que el cliente invoca `/api/studio/bootstrap`, el backend calcula 14 días a partir del momento actual (`nowSec + 14d`), otorgando una **prueba gratuita infinita que jamás vence**.
- **Acción de Simplificación:**
  Mantener la separación limpia de capas: Better Auth gestiona la creación de la organización, pero el ciclo de vida de negocio se inicializa explícitamente mediante el hook de base de datos nativo en `src/server/auth.ts`:
  ```typescript
  databaseHooks: {
    organization: {
      create: {
        before: async (org) => ({
          data: {
            ...org,
            subscriptionStatus: 'trialing',
            trialEndsAt: new Date(Date.now() + 14 * 86400 * 1000),
            status: 'active',
          },
        }),
      },
    },
  }
  ```
  Esto garantiza que el cliente siga usando la llamada Better Auth nativa pura (`auth.api.createOrganization`) sin alterar el cliente ni crear endpoints propietarios.

---

### Hallazgos Mayores (Majors)

#### H8-M01: Confusión de Dominios y Colisión de Cupos por Rol `Client`
- **Severidad:** **Major**
- **Ámbito Afectado:** Sección 5 (L154–162) y Paso 3 del Diagrama (L41).
- **Racional de Simplicidad:**
  El documento postula un rol `Client (Cliente)` ("Visualización restringida a sus OTs... Ilimitados / Gratis") dentro de la organización Better Auth.
  1. En `src/server/auth.ts` (L63), Better Auth tiene configurado `memberLimit: 6`. Invitar clientes externos como miembros de la organización Better Auth consume los cupos del equipo creativo de la agencia.
  2. En el servidor, cualquier miembro con sesión válida en la organización tiene acceso a `/api/studio/bootstrap` y `/api/studio/sync`. Un cliente externo añadido como miembro de la organización tendría visibilidad sobre cotizaciones, stripboard y OTs confidenciales de otros clientes.
  3. Trafikeitor ya implementó una solución desacoplada, elegante y sin contraseñas para clientes externos mediante **enlaces públicos de revisión con token firmado** (`shared_reviews` en `/api/public/review/:token`).
- **Acción de Simplificación:**
  Eliminar el rol `Client` de la matriz de organizaciones Better Auth. Las organizaciones solo manejan colaboradores internos de la agencia (`owner`, `member`, máx. 6). El acceso para clientes finales se mantiene 100% sobre el subsistema existente de tokens de revisión compartida, sin obligar al cliente a registrarse ni consumir asientos de la agencia.

---

#### H8-M02: Paradoja Causal en el Front-Controller
- **Severidad:** **Major**
- **Ámbito Afectado:** Sección 3 (L57–68) y Diagrama Mermaid (L24–53).
- **Racional de Simplicidad:**
  La Sección 3 establece que el Front-Controller evalúa secuencialmente 5 condiciones al arrancar (`initializeApp()`). La Condición 4 evalúa `trialDaysLeft <= 0` para mostrar el Paywall antes de la Condición 5 (`GET /api/studio/bootstrap`).
  Sin embargo, en la arquitectura de Trafikeitor, **el valor `trialDaysLeft` es calculado por el servidor y retornado exclusivamente dentro del JSON de respuesta de `GET /api/studio/bootstrap`**. El cliente no posee esa métrica antes de llamar a `bootstrap()`. Evaluar la condición 4 antes de la 5 es una imposibilidad causal.
- **Acción de Simplificación:**
  Reorganizar el ciclo de vida del Front-Controller en dos compuertas secuenciales:
  1. **Compuerta Preflight (Sesión y Espacio):**
     - Sin sesión -> Desplegar `AuthGate`.
     - Con sesión + `?invite=TOKEN` -> Consumir `accept-invitation` + `set-active` -> Proceder a Bootstrap.
     - Con sesión pero sin organización (`activeOrganizationId === null`) -> Desplegar Modal Onboarding *"Bautiza tu Estudio"*.
  2. **Compuerta Post-Bootstrap (Estado de Suscripción):**
     - Recibe payload de `/api/studio/bootstrap`.
     - Si `subscriptionStatus !== 'active' && trialDaysLeft <= 0` -> Mostrar estado de expiración / renovación.
     - Si está vigente (`trialDaysLeft > 0` o `subscriptionStatus === 'active'`) -> Renderizar Mesa de Tráfico e hidratar pill de días restantes en la cabecera.

---

#### H8-M03: Violación de Capas y Supresión Silenciosa en `data-bridge.js`
- **Severidad:** **Major**
- **Ámbito Afectado:** Fase 2 (L98–100) y Fase 4 (L135–137).
- **Racional de Simplicidad:**
  El plan asigna a `main.js` la responsabilidad de atrapar el código HTTP `403 error: 'no_organization'` proveniente del servidor.
  Sin embargo, `main.js` **nunca ejecuta peticiones HTTP directas a `/api/studio/*`**; todas las llamadas están delegadas a `src/client/data-bridge.js`. Actualmente, `data-bridge.js` contiene un bloque de degradación que atrapa cualquier respuesta distinta de 200 y 401 y la degrada silenciosamente a *Modo Offline Local* emitiendo `data:ready`. Por lo tanto, `main.js` jamás recibe el 403 y el modal de onboarding nunca se abre.
  Asimismo, en la Fase 2, si un usuario crea un estudio nuevo, el servidor devuelve `orders: []`. La línea 554 de `data-bridge.js` solo actualiza la memoria local si `data.orders.length > 0`. Al ser 0, `ordersCache` retiene las órdenes demo locales ("Cervecería Nacional", etc.) y 250ms después el autoguardado `scheduleSync()` las sube a la base de datos de producción de la organización recién creada.
- **Acción de Simplificación:**
  Incorporar explícitamente `[Modify] src/client/data-bridge.js` en el plan para:
  1. Detectar `res.status === 403` con `{ error: 'no_organization' }` y emitir el evento desacoplado `emit('auth:no-organization', { user })`.
  2. Limpiar adecuadamente las cachés locales (`ordersCache = []`) cuando una organización nueva retorne colecciones vacías.

---

### Hallazgos Menores (Nits)

1. **H8-N01: Fricción Innecesaria en Formulario de Onboarding** (L89–91):
   La Fase 2 exige un input de "slug generado en vivo". Un director de arte o responsable de tráfico no debe lidiar con conceptos web como slugs URL. El formulario debe tener **estrictamente un solo campo: "Nombre de tu Estudio"**, derivando el slug automáticamente en segundo plano.
2. **H8-N02: Pérdida de Altitud con Micro-Estilos Cosméticos** (L108–113):
   Especificar micro-detalles de CSS como *"tono ámbar/naranja pulsante"* o *"estética DaVinci Resolve Dark"* en una especificación arquitectónica distrae de la máquina de estados, el contrato de APIs y las fronteras de seguridad.

---

## 3. Matriz de Síntesis Arquitectónica y Rediseño de Fases

| Fase Original | Diagnóstico Zoom-Out | Directriz de Rediseño Aprobada |
| :--- | :--- | :--- |
| **Fase 1: Tenancy** | `trial_ends_at` en `DEFAULT NULL` causa trial perpetuo. | Añadir hook `organization.create.before` en `src/server/auth.ts` para persistir `trialEndsAt = Date.now() + 14d`. Mantener como `[x] Verificada`. |
| **Fase 2: Onboarding** | Pide slug manual y asume que `main.js` recibe el 403 directo. | 1 solo input (`Nombre`). Actualizar `src/client/data-bridge.js` para emitir `auth:no-organization` y resetear cachés vacías. |
| **Fase 3: Header Badge** | Mezcla diseño cosmético con lógica funcional. | Limitar a hidratar el badge con `trialDaysLeft` y click al modal de estado de prueba/suscripción. |
| **Fase 4: Paywall / Webhook**| **YAGNI & Dead-End:** Webhook sin pasarela y Hard Paywall que bloquea al usuario sin salida. | **Desacoplar facturación.** Postergar webhook a hito comercial dedicado. Implementar expiración con lectura y exportación aseguradas. |
| **Fase 5: Invitaciones** | **Redundante:** Planea implementar código que ya funciona al 100%. | **Marcar como `[x] (Completada y Verificada)`.** Eliminar del alcance de codificación. |
| **Matriz de Roles** | Plantea rol `Client` en Better Auth (máx 6 cupos). | Limitar Better Auth a roles internos (`owner`, `member`). Clientes operan vía `shared_reviews` con tokens públicos. |

