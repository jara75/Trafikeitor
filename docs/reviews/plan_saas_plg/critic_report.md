# Informe de Crítica Arquitectónica, Estructural y de Estilo (Etapa 7)

**Documento Auditado:** [`docs/PLAN_SAAS_PLG_ONBOARDING.md`](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_SAAS_PLG_ONBOARDING.md) (Líneas 1 a 70: Visión, Flujo en 4 Pasos y Guardia de Puerta)  
**Fecha:** 2026-11-12  
**Estándar Aplicado:** `feature-spec-standard`  
**Panel Revisor:**
- **Hostile Design Critic** (`egm-design`): Análisis de arquitectura, consistencia de estado, seguridad de tenancy y viabilidad económica.
- **Structural Layout Validator** (`egm-structural`): Jerarquía de encabezados, renderizado de diagramas Mermaid, simetría y apego al formato de especificación.
- **Technical Copy Editor** (`egm-style`): Precisión técnica, eliminación de jerga/hipérboles de marketing y neutralidad objetiva.

---

## 1. Resumen Ejecutivo de la Etapa 7

La sección arquitectónica inicial (L1–70) define con claridad el objetivo PLG (Time-to-Value < 60s, sin fricción de tarjeta ni llamadas de ventas, apalancado en Better Auth nativo). Sin embargo, la auditoría profunda contra el código fuente en `src/` detectó **3 Hallazgos Críticos (Blockers)** y **4 Hallazgos Mayores (Majors)** que harían fallar la implementación en producción si no se corrigen en el documento:

1. **Período de prueba perpetuo por falta de persistencia:** El plugin `organization` nativo de Better Auth no conoce las columnas de negocio `trial_ends_at` ni `subscription_status`. Dado que no se persisten en DB al crear la organización, `/api/studio/bootstrap` recalcula 14 días a partir del momento actual en cada llamada, impidiendo que el trial expire jamás.
2. **Evasión del Paywall por colisión semántica:** La condición del Guardia de Puerta evalúa `status !== 'active'`, pero en `schema.ts`, `status` es el estado administrativo de la agencia (`'active' | 'suspended'`, default `'active'`), mientras que la suscripción PLG reside en `subscription_status`. Al evaluar `status !== 'active'`, la condición evalúa siempre a `false`, permitiendo a usuarios con prueba vencida evadir el paywall indefinidamente.
3. **Paradoja Causal en el Front-Controller:** El Guardia de Puerta exige evaluar `trialDaysLeft <= 0` antes de invocar `bootstrap()`, pero `trialDaysLeft` es calculado y retornado exclusivamente dentro del payload de `bootstrap()`. El cliente no posee esa métrica antes de llamar a la API.
4. **Ruptura de Renderizado en Mermaid:** El nodo `EXP` en la línea 46 contiene caracteres sin escapar (`trial_ends_at < NOW`), lo cual rompe el parser de Mermaid en GitHub y visores Markdown.

---

## 2. Registro Consolidado de Hallazgos

### Hallazgos Críticos (Blockers)

#### H7-B01: Vulnerabilidad de Período de Prueba Infinito (Falta de Persistencia de `trial_ends_at`)
- **Dimensión:** Arquitectura y Tenancy (`egm-design`)
- **Líneas Afectadas:** L33–35, L46–47; contrastado con [`schema.ts`](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/server/db/schema.ts#L12) y [`src/server/index.ts`](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/server/index.ts#L236-L244).
- **Descripción del Problema:**
  La línea 34 afirma que `POST /api/auth/organization/create` *"activa 14 días de prueba"*. Sin embargo, el plugin nativo `organization` de Better Auth desconoce las columnas comerciales personalizadas (`trial_ends_at`, `subscription_status`); Better Auth solo inserta `id`, `name`, `slug`, `logo`, `metadata`.
  En `src/server/index.ts` (L240–241), `/api/studio/bootstrap` contiene el fallback en memoria:
  ```ts
  const trialEndsAt = orgRow?.trial_ends_at || (nowSec + 14 * 86400);
  ```
  Dado que `trial_ends_at` **nunca se persiste en la base de datos al crear la organización**, cada llamada a `bootstrap` recalcula 14 días a partir del momento actual (`nowSec + 14 días`). Por ende, la condición de la línea 46 (`trial_ends_at < NOW`) y la de la línea 66 (`trialDaysLeft <= 0`) **jamás se cumplirán**, otorgando a cualquier usuario un período de prueba gratuito perpetuo.
- **Remediación Requerida:**
  1. Configurar un hook de ciclo de vida nativo de Better Auth (`databaseHooks: { organization: { create: { before: ... } } }`) o un disparador que persista explícitamente `trial_ends_at = Math.floor(Date.now() / 1000) + 14 * 86400` y `subscription_status = 'trialing'` al insertar la organización.
  2. En `src/server/db/schema.ts`, definir un valor por defecto explícito o timestamp para `trial_ends_at`.

---

#### H7-B02: Evasión Crítica del Paywall por Colisión de Nombres (`status` vs `subscription_status`)
- **Dimensión:** Arquitectura y Seguridad Comercial (`egm-design`)
- **Líneas Afectadas:** L66 (Tabla Front-Controller, Orden 4); contrastado con [`schema.ts`](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/server/db/schema.ts#L10-L11).
- **Descripción del Problema:**
  En la matriz del Guardia de Puerta (L66), la condición para desplegar el Paywall bloqueante está formulada como:
  `trialDaysLeft <= 0 y status !== 'active'`
  En el esquema de la base de datos (`schema.ts` L10-11), `status` corresponde al estado administrativo del estudio (`'active' | 'suspended'`, con default `'active'`), mientras que el estado de facturación PLG es `subscriptionStatus` (`'trialing' | 'active' | 'past_due' | 'canceled'`).
  Dado que todas las cuentas normales nacen y permanecen con `status = 'active'`, la cláusula `status !== 'active'` evalúa **siempre a `false`**. Cuando expiren los 14 días (`trialDaysLeft <= 0`), la condición 4 no se disparará y el usuario caerá directamente en la Condición 5 ("Todo Válido"), saltándose el paywall por completo.
- **Remediación Requerida:**
  Actualizar la condición de la línea 66 a:
  `trialDaysLeft <= 0 && subscriptionStatus !== 'active'` (o considerar suspensión administrativa explícita: `status === 'suspended' || (trialDaysLeft <= 0 && subscriptionStatus !== 'active')`).

---

#### H7-B03: Paradoja Causal en el Front-Controller y Falta de Contrato de Inspección Preflight
- **Dimensión:** Arquitectura y Ciclo de Vida Frontend (`egm-design`)
- **Líneas Afectadas:** L57–68 (Sección 3: La Regla de Oro del Guardia de Puerta).
- **Descripción del Problema:**
  La sección exige evaluar secuencialmente las condiciones 1 a 5 cada vez que carga Trafikeitor (`initializeApp()`).
  - Condición 4 evalúa `trialDaysLeft <= 0` para mostrar el Paywall bloqueante.
  - Condición 5 llama a `GET /api/studio/bootstrap` para abrir la mesa de tráfico.
  Sin embargo, en la arquitectura del sistema, la métrica `trialDaysLeft` **solo se calcula en el servidor y solo es devuelta dentro del payload de `GET /api/studio/bootstrap`**. El cliente no posee `trialDaysLeft` antes de ejecutar `bootstrap`. No es físicamente posible evaluar la condición 4 antes de la condición 5.
  Adicionalmente, la tabla lista únicamente endpoints de mutación/acción en su columna derecha (`/sign-up/email`, `accept-invitation`, `organization/create`, Checkout Stripe), pero omite el contrato de consulta/inspección con el que el Front-Controller diagnostica el estado antes de decidir qué pantalla mostrar.
- **Remediación Requerida:**
  Rediseñar el ciclo de vida del Front-Controller en dos compuertas claras:
  1. **Compuerta de Sesión y Espacio (Preflight):**
     - Si `!session` -> Mostrar `AuthGate`.
     - Si `session` + `?invite=` -> Ejecutar `accept-invitation` + `set-active`.
     - Si `session` + `!activeOrganizationId` -> Mostrar Modal Onboarding ("Bautiza tu Estudio").
  2. **Compuerta Operativa y de Suscripción (Post-Bootstrap):**
     - Si `session` + `activeOrganizationId` -> Invocar `GET /api/studio/bootstrap`.
     - Si la respuesta indica `subscriptionStatus !== 'active' && trialDaysLeft <= 0` -> Mostrar Paywall Bloqueante.
     - Si `subscriptionStatus === 'active' || trialDaysLeft > 0` -> Renderizar Mesa de Tráfico.

---

#### H7-B04: Error de Sintaxis en Diagrama Mermaid (Colisión de `<` y Brackets Anidados)
- **Dimensión:** Estructura y Renderizado (`egm-structural`)
- **Líneas Afectadas:** L45–46 (`## 2. El Flujo Universal SaaS en 4 Pasos`).
- **Descripción del Problema:**
  En el nodo `EXP` (L46), la etiqueta `¿Trial Expirado?<br/>trial_ends_at < NOW` contiene un carácter `<` sin escapar. En parsers estándar de Mermaid (incluyendo GitHub y Markdown Previewers), el `<` es interpretado como apertura de etiqueta HTML no válida, rompiendo por completo el renderizado del diagrama. Adicionalmente, en L45 los corchetes interiores `[Activar Plan]` colisionan con los delimitadores de nodos de Mermaid.
- **Remediación Requerida:**
  Escapar el carácter menor a entidad HTML (`&lt;`) o redactar en texto plano:
  `EXP{"¿Trial Expirado?<br/>trial_ends_at &lt; NOW"}` o `EXP{"¿Trial Expirado?<br/>(Fecha límite superada)"}`. Cambiar corchetes internos a comillas simples: `'Activar Plan'`.

---

### Hallazgos Mayores (Majors)

#### H7-M01: Ruptura de Flujo para Invitados en el Diagrama Mermaid
- **Dimensión:** Arquitectura y Flujo de Usuario (`egm-design`)
- **Líneas Afectadas:** L26–36 (Mermaid Diagram: Paso 1 y Paso 2).
- **Descripción del Problema:**
  El diagrama modela:
  `Paso 1: API1 (sign-up/email) --> C1 {"¿Tiene Organización?"} -- "No" --> ONB ("¿Cómo se llama tu Estudio?")`
  Cuando un colaborador nuevo es invitado vía enlace `?invite=TOKEN` y completa el registro abierto con correo y clave, su cuenta no tiene aún organización asignada (`C1 = No`). El diagrama lo envía inmediatamente a la pantalla de onboarding para crear un nuevo estudio como `owner`, secuestrando el flujo de invitación y fragmentando el equipo. El paso de aceptación de invitación (`POST /api/auth/organization/accept-invitation`) está ausente entre P1 y P2.
- **Remediación Requerida:**
  Incorporar en el diagrama la bifurcación explícita tras `API1`:
  `C1 -- "Viene con ?invite" --> ACCEPT["Aceptar Invitación y Fijar Activa"] --> DESK`  
  `C1 -- "Sin invite y sin org" --> ONB["Onboarding: Bautiza tu Estudio"]`

---

#### H7-M02: Riesgo de Agotamiento de Cupos y Exposición de Datos por Rol `Client`
- **Dimensión:** Arquitectura, Seguridad y Modelo Comercial (`egm-design`)
- **Líneas Afectadas:** L41, L15; contrastado con [`auth.ts`](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/server/auth.ts#L61-L68) y [`index.ts`](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/src/server/index.ts#L310-L380).
- **Descripción del Problema:**
  La línea 41 establece: `DESK --> INV["Invitar Equipo / Clientes POST /api/auth/organization/invite-member"]`.
  Esto genera dos fallas severas:
  1. En `src/server/auth.ts` (L63), el plugin Better Auth tiene configurado `memberLimit: 6`. Invitar clientes externos como miembros de la organización Better Auth consume los 6 asientos diseñados para el equipo de trabajo de la agencia.
  2. Cualquier miembro en la organización Better Auth recibe acceso de sesión autorizado a `/api/studio/bootstrap` y `/api/studio/sync`. Un cliente externo añadido como miembro obtendría visibilidad total sobre todas las OTs internas, cotizaciones, hojas de ruta y stripboards de otros clientes de la agencia, pudiendo incluso sobrescribir la base de datos vía `/api/studio/sync`.
- **Remediación Requerida:**
  Especificar taxativamente en la arquitectura que `organization/invite-member` está reservado exclusivamente para colaboradores internos de la agencia (máx. 6). El acceso para clientes externos se realiza exclusivamente a través del mecanismo existente de tokens de revisión compartida (`shared_reviews` / `/api/public/review/:token`).

---

#### H7-M03: Omisión de la API Obligatoria `setActiveOrganization`
- **Dimensión:** Integración Better Auth (`egm-design`)
- **Líneas Afectadas:** L11–16 (Sección 1) y L63–65 (Sección 3).
- **Descripción del Problema:**
  En Better Auth, invocar `createOrganization` o `acceptInvitation` agrega el registro en `members`, pero **no siempre actualiza de forma automática la cookie de sesión del cliente con el `activeOrganizationId`**. Si el cliente no invoca `POST /api/auth/organization/set-active`, las llamadas subsecuentes a `/api/studio/*` carecerán de `activeOrganizationId` y el middleware de Hono devolverá `403 error: 'no_organization'`, atrapando al usuario en un bucle infinito de onboarding.
- **Remediación Requerida:**
  Incluir `POST /api/auth/organization/set-active` como operación obligatoria dentro de la lista de APIs nativas de Better Auth en la Sección 1 y en las transiciones de las Condiciones 2 y 3 de la Sección 3.

---

#### H7-M04: Discrepancia Numérica y Asimetría Estructural
- **Dimensión:** Estructura y Estilo (`egm-structural`, `egm-style`)
- **Líneas Afectadas:** L59 vs L61–67.
- **Descripción del Problema:**
  El texto introductorio indica: *"el sistema evalúa estrictamente las siguientes 4 condiciones en orden:"*, pero la tabla que le sigue inmediatamente enumera 5 filas (Orden 1 al 5).
- **Remediación Requerida:**
  Corregir la frase introductoria a *"las siguientes 5 condiciones en orden:"*.

---

### Hallazgos Menores (Nits)

1. **H7-N01: Falta de Bloque de Metadatos del Documento (`feature-spec-standard`)** (L1):
   El documento carece de bloque inicial YAML con campos obligatorios: `Version`, `Status`, `Author`, `Last Updated`, `Target Milestone`.
2. **H7-N02: Hipérboles y Metáforas en Encabezados Técnicos** (L22, L57):
   - *"El Flujo Universal SaaS"* -> Reemplazar por *"Flujo de Onboarding y Activación PLG"*.
   - *"La Regla de Oro del Guardia de Puerta"* -> Reemplazar por *"Matriz de Control de Acceso y Redirección (Front-Controller)"*.
   - *"Cero Fricción Inicial"* -> Reemplazar por *"Autoservicio Directo (Time-to-Value < 60s)"*.
   - *"Bautiza tu Estudio"* -> En especificación técnica, indicar *"Creación de Organización / Estudio"*.
3. **H7-N03: Puntuación de Dos Puntos dentro de Tokens en Negrita** (L9, L11, L17):
   Mover los dos puntos fuera del cierre de negrita (ej. `**Autoservicio Directo:**` en lugar de `**Autoservicio Directo:**`).

---

## 3. Matriz de Remediación para la Sección 1–70

| ID Hallazgo | Componente | Severidad | Acción Concreta de Refactor |
| :--- | :--- | :--- | :--- |
| **H7-B01** | `auth.ts` / Hook | **Blocker** | Documentar hook o trigger obligatorio que inserte `trial_ends_at = NOW + 14d` y `subscription_status = 'trialing'` al crear la org. |
| **H7-B02** | Front-Controller | **Blocker** | Corregir condición de paywall: cambiar `status !== 'active'` por `subscriptionStatus !== 'active' && trialDaysLeft <= 0`. |
| **H7-B03** | Front-Controller | **Blocker** | Dividir ciclo de vida en: Preflight (Sesión, Invite, Org) y Post-Bootstrap (Paywall si expiró). |
| **H7-B04** | Mermaid L46 | **Blocker** | Escapar `<` a `&lt;` y quitar brackets anidados en etiquetas de nodos. |
| **H7-M01** | Mermaid L26–36 | **Major** | Añadir bifurcación para usuarios que llegan con `?invite=TOKEN` directo a aceptar invitación. |
| **H7-M02** | Principios L41 | **Major** | Eliminar mención de invitar "Clientes" a la organización; clientes usan `shared_reviews`. |
| **H7-M03** | Principios L11 | **Major** | Agregar `POST /api/auth/organization/set-active` a la lista de APIs canónicas. |
| **H7-M04** | Sección 3 L59 | **Major** | Cambiar "4 condiciones" por "5 condiciones". |
| **H7-N01..03**| Formato | **Nit** | Agregar metadatos YAML, limpiar metáforas y corregir puntuación de negritas. |

