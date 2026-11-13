# Dictamen de Arquitectura y Auditoría Zoom-Out: PLAN_SAAS_PLG_ONBOARDING.md

**Evaluador:** Skeptical Architect (Zoom Out Goldfish)  
**Documento Auditado:** `PLAN_SAAS_PLG_ONBOARDING.md`  
**Criterio:** Zoom-Out Standard (Simplicidad, YAGNI, Reutilización de Código, Enfoque en Problema Raíz)

---

### Hallazgo 1
* **Severidad:** Blocker
* **Alcance Afectado:** `## 4. Fases de Implementación -> Fase 5: Invitación de Miembros y Clientes` (Líneas 140-152) y `## 6. Verificación` (Líneas 171-173).
* **Racional de Simplicidad (Reinventar la Rueda / Falta de Reutilización):**
  La Fase 5 plantea como trabajo pendiente (`- [ ] [Modify]`) la creación de la lógica para invitar colaboradores (`handleSendTeamInvite`), copiar enlaces de invitación (`?invite=...`) y procesar la aceptación de invitaciones en el arranque (`main.js`). 
  
  Al auditar el código fuente existente, **esta funcionalidad ya se encuentra 100% implementada y operativa**:
  - En `src/client/modals-controller.js` (L2473-2535): ya existen `handleSendTeamInvite` (llama a `POST /api/auth/organization/invite-member`) y `handleCopyTeamInviteLink`.
  - En `src/client/main.js` (L585-607 y L667-692): ya existe la detección del parámetro `?invite=TOKEN` tanto en el formulario de login/registro (`showAuthGate`) como en `initializeApp()`, llamando a `POST /api/auth/organization/accept-invitation` y activando la organización con `POST /api/auth/organization/set-active`.
  
  Planear reimplementar lo que ya existe es un síntoma grave de falta de auditoría del código base e introduce riesgo de regresión en código probado. La Fase 5 debe marcarse como ya completada o eliminarse del alcance activo.

---

### Hallazgo 2
* **Severidad:** Blocker
* **Alcance Afectado:** `## 4. Fases de Implementación -> Fase 4: Hard Paywall (Vencimiento de Trial) y Webhook de Activación` (Líneas 119-138) y Diagrama Mermaid Paso 4 (Líneas 44-52).
* **Racional de Simplicidad (YAGNI Extremo & Riesgo de Seguridad):**
  La Fase 4 propone construir un endpoint webhook de pasarela (`POST /api/billing/webhook`) que ejecuta una consulta SQL cruda (`UPDATE organizations SET subscription_status = 'active'`) para activar suscripciones. Sin embargo:
  1. En el repositorio **no existe pasarela de pago configurada** (no hay dependencias de Stripe/Bold en `package.json`, ni claves secretas en `.env`, ni endpoints de creación de checkout `/api/billing/checkout`).
  2. Implementar un webhook huérfano sin verificación criptográfica de firma (signature verification) ni pasarela real es una optimización prematura especulativa y un vector de vulnerabilidad severo.
  
  Para la etapa actual de onboarding PLG con 14 días de prueba inversa, implementar el receptor de pagos antes de tener definido el proveedor y el checkout es poner la carreta delante de los bueyes.

---

### Hallazgo 3
* **Severidad:** Major
* **Alcance Afectado:** `## 4. Fases de Implementación -> Fase 4` (Líneas 122-126, 135-137) y `## 3. Regla de Oro` Condición 4 (Línea 66).
* **Racional de Simplicidad (Callejón sin Salida Arquitectónico):**
  El plan propone un "Hard Paywall" que rechaza las sincronizaciones con `402 Payment Required` y bloquea la interfaz con un modal que no se puede cerrar cuando expira la prueba. Si no hay un checkout real donde el usuario pueda ingresar su tarjeta para desbloquearse, el sistema crea un callejón sin salida (dead-end): el usuario queda atrapado sin poder operar y sin poder pagar.
  
  Incluso con la prueba vencida, un SaaS PLG maduro debe permitir al usuario consultar sus órdenes en modo lectura y exportar respaldos (`exportBackupData()`). Bloquear la UI completamente sin autoservicio de cobro es una mala práctica arquitectónica.

---

### Hallazgo 4
* **Severidad:** Major
* **Alcance Afectado:** `## 4. Fases de Implementación -> Fase 2: Pantalla de Onboarding` (Líneas 98-100) y `## 3. La Regla de Oro` Condición 3 (Línea 65).
* **Racional de Simplicidad (Falla de Diseño en Capa de Datos):**
  La Fase 2 establece que `main.js` en `initializeApp()` capture la respuesta `403 error: 'no_organization'` para abrir `#onboarding-studio-modal`. Sin embargo, `main.js` no invoca `/api/studio/bootstrap` directamente; delega en `bootstrap()` en `src/client/data-bridge.js`.
  
  Actualmente, `data-bridge.js` (L569-577) atrapa cualquier respuesta no exitosa distinta de 401 y activa silenciosamente el fallback offline local, emitiendo `data:ready`. Por lo tanto, `main.js` **nunca recibirá el error 403**. El plan omitió la modificación necesaria en `data-bridge.js`: este debe detectar el 403 y emitir un evento formal desacoplado (por ejemplo `org:required`, análogo al existente `auth:required`).

---

### Hallazgo 5
* **Severidad:** Major
* **Alcance Afectado:** `## 5. Matriz de Roles y Alcances Operativos` (Líneas 154-162).
* **Racional de Simplicidad (YAGNI & Duplicación Funcional):**
  El documento postula un rol `Client (Cliente)` ("Visualización restringida a sus OTs... Ilimitados / Gratis"). 
  
  Esto viola la simplicidad por partida doble:
  1. En `src/server/auth.ts`, Better Auth tiene activado el plugin de organizaciones con roles nativos estándar (`owner`, `member`) y un límite físico de 6 miembros (`memberLimit: 6`).
  2. Trafikeitor ya resolvió el acceso de clientes externos de forma elegante y sin cuentas de usuario mediante **enlaces públicos con token** (`/api/public/review/:token` en `src/server/index.ts` L61-111).
  
  Intentar forzar a los clientes dentro del tenancy de Better Auth genera fricción innecesaria (obligar a clientes a crear contraseñas) y colisiona con el límite de miembros del plan.

---

### Hallazgo 6
* **Severidad:** Nit
* **Alcance Afectado:** `## 4. Fases de Implementación -> Fase 2` (Líneas 90-91).
* **Racional de Simplicidad (Fricción Innecesaria en Formulario):**
  El plan pide diseñar un input para el "slug generado en vivo". Un usuario que solo busca organizar su tráfico de agencia no necesita entender ni validar qué es un slug URL. El slug debe derivarse automáticamente en background (`slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')`) en el payload de creación hacia Better Auth, manteniendo el onboarding estrictamente en 1 solo campo (`Nombre del Estudio`).

---

### Hallazgo 7
* **Severidad:** Nit
* **Alcance Afectado:** `## 4. Fases de Implementación -> Fase 2 y Fase 3` (Líneas 87-91, 108-113).
* **Racional de Simplicidad (Pérdida de Altitud / Maleza):**
  El documento cae en detalles de implementación cosmética (especificando textos literales y microestilos como "tono ámbar/naranja pulsante" o "tono cian/azul permanente") en lugar de concentrarse en la arquitectura de eventos del cliente, la gestión de estados y las transiciones del ciclo de vida del inquilino.

