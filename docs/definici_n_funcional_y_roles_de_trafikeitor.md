# TRAFIKEITOR — Definición Funcional, Roles y Modelo Operativo

Versión: 2.1 | Estado: Aprobada para Implementación | Última actualización: 2026-11-12 | Archivo Canónico: `docs/definici_n_funcional_y_roles_de_trafikeitor.md`

---

## 1. Visión y Filosofía del Producto

* **Qué es:** Trafikeitor es un sistema ligero de control de producción y tráfico de Órdenes de Trabajo (OTs) centrado en el seguimiento operativo y custodia de cada entrega.
* **Para quién es:** Está diseñado para **creadores independientes y freelances** de **Publicidad (AD), Diseño/Desarrollo Web y Desarrollo de Software** que necesitan organizar su producción diaria sin la sobrecarga administrativa de herramientas corporativas (Jira, Monday, ClickUp, Wrike, Notion).
* **Filosofía de escala:** Es un panel operativo individual que habilita acceso acotado para que un cliente (si participa en solicitudes o aprobaciones) o un colaborador puntual entre únicamente a sus cuentas o tareas asignadas sin ver el resto del estudio.
* **Stack y Despliegue (SaaS en Hostinger):** Construido sobre **Node.js + Hono + SQLite + Better Auth**, permitiendo que cada creador independiente cree su propia **Organización** con aislamiento lógico en la base de datos.

---

## 2. Arquitectura de Aislamiento, Jerarquía y Caché Local

1. **Aislamiento Lógico por Estudio (`organizationId`):**
   * Cada estudio es una isla lógica en `trafico.db` filtrada por `organizationId` y con directorio propio en almacenamiento (`/uploads/${organizationId}/`).
   * Un mismo correo electrónico puede pertenecer a múltiples estudios distintos sin cruce de datos; la membresía y las iniciales/firma corta (`shortName`, identificador breve de 2–3 letras del usuario) se validan dentro de cada organización. Cuando un usuario pertenece a más de una `organizationId`, la interfaz ofrece un **selector de estudio** para conmutar de organización activa.
2. **Jerarquía Oficial de Agrupación (`Organización -> Cliente -> Marca`):**
   * La jerarquía oficial es `Organización (organizationId) -> Cliente -> Marca`, implementada sobre la agrupación lateral del **Árbol de Bins** (panel jerárquico de navegación por cliente/marca) y la agrupación de tabla (`renderBinTree` y `setTableGroup`).
   * Si un proyecto exige aislamiento estricto por NDA, se crea una **Organización independiente** (no existen sub-espacios virtuales internos dentro de un mismo estudio).
3. **Caché Local Particionada (`localStorage`):**
   * Toda clave de `localStorage` en `src/client` debe llevar prefijo `organizationId` (y `userId` / rol cuando aplique).
   * La hidratación desde caché local es **diferida post-`bootstrap()`** (nunca síncrona antes de conocer la sesión activa), y el cliente limpia explícitamente la caché local al cerrar sesión, cambiar de organización o recibir una respuesta `401` / `403`.
4. **Resguardo de Archivos Pesados y Cuotas (`Media Pool`):**
   * Los archivos brutos (RAWs de cámara, editables nativos pesados `.af`, `.psd`, `.ai`, videos maestros) permanecen en local o en el servidor físico de trabajo.
   * Al **Media Pool** (repositorio de archivos ligeros adjuntos a la OT para previsualización y revisión) se suben vistas previas (`.png`, `.jpg`, `.pdf` y archivos ligeros permitidos por política de carga), sujetas a **cuotas de almacenamiento y tamaño por archivo por `organizationId`** para evitar saturación en disco por cargas de usuarios `client`.

---

## 3. Usuarios y Roles

### 3.1. Dueño / Creador (`owner` — 1 por Estudio)

* **Quién es:** El creador independiente (AD, WEB o DEV) titular de la Organización. Al registrarse por primera vez, el sistema crea su Organización, lo asigna como `owner` y lo habilita para operar de inmediato.
* **Acceso:** Visibilidad global (`*`) sobre todos los clientes, marcas, OTs, sub-OTs, Media Pool, catálogos (`statuses`, `clients`, `departments`) y su `Stripboard Personal`.
* **Operación:** Control total del estudio; registra pases en la Hoja de Ruta asumiendo distintos departamentos (`Cuentas`, `Creativos`, `Web`, `Dev`, `Tráfico`, `Producción`, `Administración`), define la visibilidad de los demás participantes y es el único habilitado para confirmar o modificar fechas de entrega comprometidas (`deliveryDate`) en Tráfico.
* **Restricciones:** Ninguna dentro de su estudio. Es el único rol habilitado para borrar OTs o clientes, vaciar el Stripboard, importar backups, invitar/revocar accesos y reabrir o editar una OT en estado `Archivada` (dejando nota de justificación obligatoria).

### 3.2. Cliente / Cuentas Colaborativo (`client` — Cupo ilimitado)

* **Quién es:** Un cliente directo o ejecutiva de cuentas externa que participa en el flujo operativo de su marca.
* **Acceso:** Entra con correo y contraseña tras aceptar una invitación (`?invite=TOKEN`), sin consumir los cupos internos de equipo. Al aceptar la invitación, el servidor copia atómicamente `role = 'client'` y `allowed_client_id` desde `invitations` hacia `members`. Su Árbol de Bins, Mesa de Tráfico y `Stripboard Personal` muestran únicamente las marcas y OTs de su `allowed_client_id`.
* **Operación:** Puede abrir OTs nuevas (`+ Nueva OT`) y sub-OTs con guión (`-1`, `-2`, `-3`) de su marca dejando la fecha de entrega vacía o ingresando una **fecha solicitada** inicial; gestionar pases en la Hoja de Ruta (`De -> Para`), subir briefs/referencias al Media Pool, escribir notas, generar enlaces de revisión (`/review/:token`), registrar aprobación (`APROBADO`) o solicitud de cambios (`AJUSTES`) y organizar sus bloques en su `Stripboard Personal`.
* **Restricciones:** Una vez creada la OT, `deliveryDate` queda bloqueada en solo lectura para `client` (solo `owner` la confirma o modifica en Tráfico). No ve otros clientes ni el `Stripboard Personal` del Dueño u otros usuarios. No puede modificar catálogos globales (`statuses`, `clients`, `departments`), borrar OTs ni clientes, importar backups ni reabrir OTs en estado `Archivada`.

### 3.3. Colaborador Puntual (`member` — Hasta 5 miembros adicionales)

* **Quién es:** Un freelance de apoyo eventual (fotógrafo, redactor, diseñador, desarrollador) invitado a participar en el estudio. El límite es de hasta 5 miembros adicionales (6 usuarios activos incluyendo al `owner`).
* **Acceso:** Entra vía invitación (`?invite=TOKEN`); al aceptar, el servidor copia atómicamente `role = 'member'` y `allowed_client_id` desde `invitations` hacia `members`. Su visibilidad está gobernada por su `allowed_client_id` asignado o por las OTs/sub-OTs donde participa en la Hoja de Ruta (`De: -> Para:`), salvo que el `owner` active visibilidad global (`*`). Puede participar en múltiples cuentas y departamentos dentro del estudio.
* **Operación:** Registra entregas y pases directos (`De -> Para`) en la Hoja de Ruta, sube piezas al Media Pool, registra su **Firma** de entrega y organiza sus horas en su `Stripboard Personal`.
* **Restricciones:** No puede modificar fechas de entrega comprometidas (`deliveryDate`) en Tráfico ni alterar catálogos globales (`statuses`, `clients`, `departments`). No puede borrar OTs o clientes, vaciar el Stripboard, importar backups ni reabrir OTs `Archivada`. No crea OTs ni envía enlaces de revisión salvo habilitación explícita otorgada por el `owner`. Si un `member` es desactivado, sus pasos pendientes en Hoja de Ruta permanecen visibles en Tráfico para que el `owner` los reasigne.

### 3.4. Invitado de Revisión (`share_token` — Sin cuenta ni login)

* **Quién es:** Un cliente o tercero externo que solo revisa y aprueba una entrega puntual sin registrarse.
* **Acceso:** Accede mediante enlace temporal y revocable (`/review/:token`) limitado exclusivamente a la OT o línea(s) compartida(s).
* **Operación:** Revisa las piezas en el visor del Media Pool y permite registrar aprobación (`APROBADO`) o solicitud de cambios (`AJUSTES`) con comentarios.
* **Restricciones:** Sin acceso a Mesa de Tráfico, Árbol de Bins, `Stripboard Personal` ni edición de OTs. Un `share_token` puede ser revocado en cualquier momento por `owner` o `client` y caduca al expirar su vigencia.

### 3.5. Super Admin de Plataforma (`super_admin` — Consola SaaS)

* **Quién es:** El administrador propietario de la plataforma Trafikeitor (`user.role = 'super_admin'`, separado del rol `admin` de Better Auth Organization).
* **Acceso:** Consola global de plataforma sobre el registro de organizaciones y su estado de licencia (`status`).
* **Operación:** Supervisa las organizaciones registradas en el servidor y activa o suspende licencias (`active` / `suspended`), quedando toda acción de soporte o cambio de licencia registrada en un **log de auditoría**.
* **Restricciones:** No opera ni altera el contenido creativo o de tráfico interno de los estudios. Cuando una organización pasa a `suspended`, cualquier solicitud a `/api/studio/*` responde `403 license_suspended` y el cliente bloquea la pantalla sin fallback offline.

### 3.6. Matriz RBAC Compacta

| Capacidad | `owner` | `client` | `member` | `share_token` | `super_admin` |
|---|:---:|:---:|:---:|:---:|:---:|
| Visibilidad global (`*`) | Sí | No (`allowed_client_id`) | Por defecto acotada (opcional `*`) | Solo token | Solo metadata org |
| Invitar / revocar usuarios | Sí | No | No | No | No |
| Crear OTs / Sub-OTs | Sí | Sí (solo su `allowed_client_id`) | Con habilitación explícita | No | No |
| Modificar `deliveryDate` oficial | Sí | No (solo fecha solicitada al crear) | No | No | No |
| Pases Hoja de Ruta (`De -> Para`) | Sí | Sí (su cuenta) | Sí (asignadas) | No | No |
| Subir al Media Pool | Sí | Sí (briefs/refs, con cuota) | Sí (piezas) | No | No |
| Generar `/review/:token` | Sí | Sí | Con habilitación explícita | No | No |
| Registrar `APROBADO` / `AJUSTES` | Sí | Sí | No | Sí | No |
| `Stripboard Personal` | Sí | Sí (solo `allowed_client_id`) | Sí (sin cambiar fechas oficiales) | No | No |
| Editar catálogos globales | Sí | No | No | No | No |
| Borrar OTs/clientes / Importar backup | Sí | No | No | No | No |
| Reabrir OT `Archivada` (con nota) | Sí | No | No | No | No |
| Activar/suspender licencia (`status`) | No | No | No | No | Sí |

---

## 4. Anatomía de la OT, Sub-OTs y Hoja de Ruta

### 4.1. Bifurcaciones / Sub-OTs con Guión (`OT-26-XXX-1`, `-2`, `-3`)

* **Diferencia entre `Hoja de Ruta` y Sub-OT:** Las líneas de `Hoja de Ruta` son relevos secuenciales dentro de una misma pieza; las **Sub-OTs** (`OT-YY-XXX-1`, `-2`, `-3`) son entregables o frentes paralelos con fecha y tira propia en el `Stripboard Personal`.
* **Tronco Madre (`OT-YY-XXX`):** Agrupa el proyecto o campaña general del cliente. Tanto el tronco madre como sus sub-OTs comparten el mismo `Media Pool` de la OT madre. Archivar o borrar la OT madre aplica en cascada a sus sub-OTs.
* **Sub-OTs con Guión:** Son ítems independientes con el mismo esquema de 11 columnas y su propia Hoja de Ruta (`De: -> Para:`), vinculados por prefijo de número de OT y `parent_ot_id` opcional para agruparse de forma colapsable en la Mesa de Tráfico. Heredan `Cliente`, `Marca`, `Producto` y `Referencia`, manteniendo su propia `Descripción`, `Medio`, `Responsable`, fechas y tira en el `Stripboard Personal`.
* **Creación atómica en servidor:** Se elimina la generación local por conteo de caché (`ordersCache.length + 1`). Crear una OT (`OT-YY-XXX`) o una sub-OT (`OT-YY-XXX-1`, `-2`, `-3`) ejecuta una petición directa síncrona `POST /api/studio/orders` (fuera del debounce de 250 ms) que genera el consecutivo atómicamente en SQLite por `organization_id` y devuelve el ID real antes de permitir adjuntar archivos al Media Pool o abrir el detalle del Sobre.
* **Enrutamiento `Para:` por Departamento:** Asignar `Para:` pone la OT/sub-OT disponible en la bandeja/pool de pendientes de todos los usuarios asignados a ese departamento (si hay dos `member` en `Creativos`, ambos la ven como pendiente en su bandeja hasta que uno la baja a su `Stripboard Personal` o registra su `Firma` en el paso, quedando identificado con nombre propio en `Responsable`), sin inyectar bloques automáticamente en ningún `Stripboard Personal`.

### 4.2. Estructura de Columnas (Esquema Canónico)

1. **Encabezado de la OT (9 campos alineados con `defaultOrders`):**
   `No. OT` -> `Cliente` -> `Marca` -> `Producto` -> `Medio` -> `Referencia` -> `Descripción` -> `Estado` -> `Responsable`.
2. **Línea de Hoja de Ruta (7 columnas):**
   `De (Departamento)` -> `Para (Departamento)` -> `Descripción` -> `Entrada (Fecha/Hora)` -> `Entrega (Fecha/Hora)` -> `Firma (Responsable que entrega)` -> `Notas`.
3. **Fila Unificada en Mesa de Tráfico (11 columnas exactas):**
   `No. OT` -> `Cliente` -> `Marca/Producto` -> `Medio` -> `Referencia` -> `Descripción` -> `Entrada` -> `Entrega` -> `Estado` -> `Responsable` -> `Notas`.
   * **Regla de derivación:** `Entrada`, `Entrega`, `Notas` y `Firma` se leen de la **ruta activa** (`getActiveRoute(ot)`: última línea no completada de la Hoja de Ruta, o la última línea si todas están completadas).
4. **Esquema `Stripboard Día` (`Stripboard Personal`):**
   Cada tira (bloque visual de asignación de tiempo) proyectada sobre la fila añade sus campos propios de agenda personal (`user_id`, `time_slot` / `start_time`, `duration`, `shift_status`) sin mutar los datos maestros de la OT.

### 4.3. Estados de la OT, Sincronización y Borrados

* **Estados base (`core-state.js`):**
  1. `Tráfico` (Abierta, falta información — estado inicial por defecto).
  2. `Recibido` (Información completa, en espera de turno).
  3. `Desarrollo` (Con tiempo asignado y en ejecución).
  4. `Cliente` (Presentada para revisión/aprobación; al registrar `APROBADO` en `/review/:token` pasa a `Entregado`, al registrar `AJUSTES` vuelve a `Desarrollo`).
  5. `Entregado` (Entregada o publicada, pendiente de facturar).
  6. `Facturación` (Factura presentada, pendiente de pago).
  7. `Cerrado` (Pago recibido / trabajo concluido; visible en Tráfico antes de archivar).
  8. `Cancelado` (Descartada sin terminar; permanece visible solo bajo filtro de canceladas/histórico).
  * **Nota de estado terminal:** `Archivada` opera como estado terminal de cierre contable fuera de la Mesa de Tráfico activa en modo solo lectura (reabrible únicamente por `owner` con nota de justificación).
  * **Acción de UI:** `+ Nuevo` en el selector de estado es un disparador de interfaz (`__NEW__`) para crear estados personalizados en el estudio, no un estado base del ciclo.
* **Particionado de Stripboard:** Las tiras del `Stripboard Personal` se almacenan y consultan particionadas por `(organization_id, user_id, date_str)` para que el Stripboard del `owner`, del `client` y de cada `member` sean independientes y nunca colisionen.
* **Contrato de `POST /api/studio/sync`:**
  * El cliente persiste cambios mediante guardado por lote con debounce de 250 ms.
  * Si `role !== 'owner'`, el servidor ignora modificaciones sobre catálogos compartidos (`statuses`, `clients`, `departments`).
  * Para `orders`, el servidor ejecuta *upsert* únicamente sobre las OTs autorizadas para el usuario (`client_id === allowed_client_id` para `client`; pertenencia por cliente o ruta `De: -> Para:` para `member`) y rechaza con `403` cualquier OT ajena, prohibiendo borrados masivos fuera de su alcance.
* **Borrados explícitos (`DELETE`):** Al eliminar el `DELETE` ciego en `/api/studio/sync`, las eliminaciones de OTs, clientes o tiras del Stripboard se ejecutan mediante endpoints explícitos (`DELETE /api/studio/orders/:id`, `DELETE /api/studio/clients/:id`, `DELETE /api/studio/stripboard/:id`) limpiando la cola pendiente de `scheduleSync()` para evitar re-inserciones.
* **Límite de concurrencia declarado (LWW):** La edición simultánea de una **misma OT** dentro de la ventana de debounce de 250 ms opera bajo *Last-Write-Wins (LWW)* a nivel de registro de OT (sin CRDT ni bloqueo optimista por campo).

---

## 5. Separación entre Mesa de Tráfico y `Stripboard Personal`

### 5.1. Mesa de Tráfico (Compromiso Oficial)

* Muestra todas las OTs y sub-OTs activas con sus **fechas y horas límite de entrega** oficiales (`deliveryDate`).
* Responde a: *¿Qué trabajos están activos, quién tiene el turno actual y cuándo vence cada entrega?*

### 5.2. `Stripboard Personal` (Hoja de Tiempos Personal)

* Es el tablero personal particionado por `(organization_id, user_id, date_str)` donde cada usuario (`owner`, `client` limitado a `allowed_client_id`, o `member`) proyecta y ordena sus propias tiras de horas manualmente.
* Responde a: *¿Cómo distribuyo mis horas del día o la semana para ejecutar las tareas que tengo asignadas?*
* Reordenar o ajustar bloques de tiempo en el `Stripboard Personal` nunca altera las fechas de entrega comprometidas en la Mesa de Tráfico.

---

## 6. Non-Goals (Fuera de Alcance)

* Sub-espacios virtuales internos dentro de una misma organización (se usa `Organización -> Cliente -> Marca` u organizaciones separadas por NDA).
* Resolución automática de conflictos en tiempo real (CRDT o transformación operacional) ni bloqueo optimista por campo dentro de una misma OT (aplica LWW a nivel de registro de OT).
* Inyección automática de bloques en el `Stripboard Personal` al asignar un paso `Para:`.
* Gestión de nómina, facturación contable completa o chat corporativo multi-canal.
