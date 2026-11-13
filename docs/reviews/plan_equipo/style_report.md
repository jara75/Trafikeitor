# Auditoría de Estilo Técnico (Stage 7: Style Review)

**Documento Auditado:** [PLAN_GESTION_EQUIPO_COLABORATIVO.md](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L1-L148)  
**Alcance Auditado:** Líneas 1-148 (Especificación y Gobernanza Operativa)  
**Rol:** Technical Copy Editor (dry, direct, factual, zero glaze)

---

## 1. Hallazgos Principales (Major)

### Finding 1: Discrepancia Numérica Factual en Imperativos Operativos
- **Severidad:** Major
- **Alcance Afectado:** [Sección 1, Líneas 13-20](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L13-L20)
- **Razón de Estilo / Racional Técnico:**  
  La línea 13 afirma textualmente: *"Existen dos imperativos legales y operativos innegociables:"*, pero a continuación enumera **tres (3)** elementos:
  1. *Trazabilidad Histórica*
  2. *Confidencialidad & Acuerdos de No Divulgación*
  3. *Gestión Económica de Licencias*  
  Esta discrepancia aritmética resta rigor al documento técnico.
- **Acción:** Corregir a: *"Existen tres requisitos operativos y legales:"* eliminando el adjetivo dramático *"innegociables"*.

---

### Finding 2: Inconsistencia Crítica en el Nombre de la Columna SQLite
- **Severidad:** Major
- **Alcance Afectado:** [Sección 3 (Línea 75)](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L75) vs. [Sección 4.1 (Línea 106)](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L106) y [Sección 4.2 (Línea 114)](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L114)
- **Razón de Estilo / Racional Técnico:**  
  En la Línea 75 se define el atributo como `allowed_clients_json`, mientras que en el DDL SQL de la Línea 106 y en la tabla de endpoints de la Línea 114 se especifica como `allowed_clients`. Un implementador o modelo de código sufrirá desalineación de schema si no se unifica la nomenclatura técnica.
- **Acción:** Estandarizar formalmente a `allowed_clients` en todo el documento.

---

### Finding 3: Conflación Sistemática entre Roles RBAC y Cargos Funcionales
- **Severidad:** Major
- **Alcance Afectado:** [Línea 64](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L64), [Línea 76](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L76), [Líneas 104-106](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L104-L106), [Líneas 113-116](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L113-L116), [Línea 132](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L132)
- **Razón de Estilo / Racional Técnico:**  
  El documento mezcla de forma ambigua:
  - El rol de autorización en la organización Better Auth (`members.role`: `'owner'` | `'admin'` | `'member'`).
  - El cargo profesional de agencia (`members.role_title`: `'Director de Tráfico'`, `'Creativo'`, `'Cuentas'`, etc.).
  - Términos coloquiales como *"Director"*, *"Colaborador"*, *"Director / Admin"*.  
  Por ejemplo, la Línea 132 indica que el menú es *"para Directores"*, pero la Línea 113 restringe el backend a *"Solo owner / admin"*. Un "Director de Tráfico" en una agencia no necesariamente tiene privilegios de `admin` en la base de datos de la organización.
- **Acción:** Separar explícitamente **Rol de Sistema / Autorización** (`owner` / `admin` / `member`) de **Cargo Funcional** (`role_title`). Reemplazar *"Directores"* por *"Administradores (`owner` o `admin`)"* cuando se haga referencia a permisos de mutación.

---

### Finding 4: Abuso de Delimitadores KaTeX/Math para Flechas Direccionales
- **Severidad:** Major
- **Alcance Afectado:** [Sección 4.2 (Línea 113)](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L113) y [Sección 5.1 (Líneas 133-135)](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L133-L135)
- **Razón de Estilo / Racional Técnico:**  
  Se emplean delimitadores de modo matemático LaTeX (`$\leftrightarrow$` y `$\rightarrow$`) en celdas de tabla y listas para representar transiciones de estado y flujos UI. Esto no constituye notación matemática; añade dependencias innecesarias de renderizado MathJax/KaTeX y genera visualizaciones rotas (raw string `$\rightarrow$`) en visualizadores markdown planos o tablas de GitHub.
- **Acción:** Reemplazar por caracteres Unicode directos estándar: `↔` y `→`.

---

## 2. Declaraciones No Calibradas, Supuestos Defensivos y Fluff (Auditoría DROP | CALIBRATE | RELOCATE)

### Finding 5: Glaseado de Marketing y Promesas No Verificables
- **Severidad:** Major
- **Alcance Afectado:** [Sección 1, Línea 22](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L22)
- **Texto Actual:**  
  `...garantizando gobernanza completa, seguridad y una experiencia fluida inspirada en Wrike y ClickUp.`
- **Razón de Estilo:** Adjetivos promocionales subjetivos (*"gobernanza completa"*, *"experiencia fluida"*). Un documento de ingeniería debe describir mecanismos verificables, no autopromoción.
- **Dictamen:** **`CALIBRATE`**
- **Redacción Recomendada:**  
  *"Este documento especifica la extensión del esquema y las rutas de API sobre Better Auth y SQLite para gestionar el ciclo de vida de membresías, revocación de sesiones y control de acceso basado en atributos (ABAC)."*

---

### Finding 6: Adjetivación Inflada en Funcionalidades Básicas
- **Severidad:** Nit
- **Alcance Afectado:** [Sección 3, Línea 66](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L66) y [Sección 5, Línea 142](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L142)
- **Texto Actual:**  
  `### Pilar 2: Desactivación Inteligente (Soft-Deactivation)`  
  `### 5.3 Modal de Reasignación Segura`
- **Razón de Estilo:** Un cambio de estado lógico (`status = 'deactivated'`) no es *"inteligente"*, ni un modal de reasignación requiere calificarse de *"seguro"*. Es glaseado retórico.
- **Dictamen:** **`CALIBRATE`**
- **Redacción Recomendada:**  
  `### Componente 2: Desactivación Lógica (Soft-Deactivation)`  
  `### 5.3 Modal de Reasignación de Responsabilidades (`#member-reassign-modal`)`

---

### Finding 7: Retórica Promocional ("Con un solo clic")
- **Severidad:** Nit
- **Alcance Afectado:** [Sección 3, Línea 72](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L72)
- **Texto Actual:**  
  `- **Reactivación**: El Director puede reactivarlo con un solo clic si el cupo del plan lo permite.`
- **Razón de Estilo:** Cliché de ventas de producto (*"con un solo clic"*).
- **Dictamen:** **`DROP`**
- **Redacción Recomendada:**  
  `"- **Reactivación**: Un administrador puede reactivar al miembro si la organización dispone de asientos libres en el plan."`

---

### Finding 8: Afirmación Defensiva No Concreta y Relleno
- **Severidad:** Nit
- **Alcance Afectado:** [Sección 3, Línea 83](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L83)
- **Texto Actual:**  
  `En la Mesa de Tráfico, el usuario simplemente no ve la existencia de clientes fuera de su cartera (garantía de confidencialidad).`
- **Razón de Estilo:** Contiene palabra de relleno (*"simplemente"*) y paréntesis justificativo no técnico (*"(garantía de confidencialidad)"*).
- **Dictamen:** **`CALIBRATE`**
- **Redacción Recomendada:**  
  *"En la interfaz de Mesa de Tráfico, las órdenes y clientes no autorizados se omiten tanto del estado local como de la vista rendered."*

---

### Finding 9: Buzzword Empresarial Vacío
- **Severidad:** Nit
- **Alcance Afectado:** [Sección 5, Línea 122](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L122)
- **Texto Actual:**  
  `La pestaña **"Mi Equipo / Espacio"** dentro del modal `#user-profile-modal` se expandirá con controles de nivel empresarial:`
- **Razón de Estilo:** *"controles de nivel empresarial"* es marketing glaze sin significado técnico en una especificación de UI.
- **Dictamen:** **`DROP`**
- **Redacción Recomendada:**  
  *"La pestaña 'Mi Equipo' en `#user-profile-modal` incorpora controles de estado, cartera y reasignación:"*

---

## 3. Inconsistencias de Terminología

| Concepto | Variantes Detectadas en Líneas 1-148 | Término Estándar Recomendado | Racional Técnico |
| :--- | :--- | :--- | :--- |
| **Entidad Miembro / Usuario** | `usuario`, `colaborador`, `miembro`, `responsable` | **`miembro`** (vínculo con la organización), **`usuario`** (cuenta/auth), **`responsable`** (asignado en OT) | Eliminar *"colaborador"* en contextos técnicos y de base de datos; la tabla SQLite se llama `members` y la entidad Better Auth es `Member`. |
| **Licencia / Capacidad** | `asiento`, `seat`, `cupo`, `licencia` | **`asiento`** (o `asiento de membresía`) | Unificar en español técnico formal. Evitar la redundancia bilingüe *"Consume Asiento (Seat)"*. |
| **Tenencia / Estudio** | `estudio`, `espacio`, `organización` | **`estudio`** (dominio de negocio), **`organización`** (capa de datos / Better Auth) | Clarificar en el glosario inicial que cada `estudio` corresponde a un registro `organization` en base de datos. |

---

## 4. Estilo, Gramática y Tono (Nits)

1. **Hipérbole y Metáforas en Título y Resumen:**
   - [Línea 1](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L1): `# PLAN MAESTRO: ...` $\rightarrow$ Título grandilocuente. Sugerido: `# ESPECIFICACIÓN TÉCNICA: GESTIÓN DE EQUIPO Y GOBERNANZA OPERATIVA`.
   - [Línea 15](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L15): *"La Trazabilidad Histórica es Sagrada"* $\rightarrow$ Metáfora religiosa/dramática impropia de ingeniería. Sugerido: *"Inmutabilidad de Registros y Firmas Históricas"*.

2. **Oración Incompleta (Fragmento oracional):**
   - [Línea 20](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L20): *"Poder suspender o desactivar temporalmente a colaboradores..."* carece de verbo conjugado principal. Debe reformularse como oración declarativa en voz activa: *"La suspensión o desactivación temporal de miembros libera asientos en el plan sin eliminar el historial..."*

3. **Título de Sección Desalineado:**
   - [Línea 26](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L26): `## 2. BENCHMARK COMPARATIVO: MODELO DE CICLO DE VIDA DE MIEMBROS`. La sección no contiene ninguna tabla ni análisis comparativo de benchmark; describe el diagrama de flujo y estados propios del sistema. Renombrar a: `## 2. MODELO DE CICLO DE VIDA DE MIEMBROS`.

4. **Voz Pasiva Innecesaria:**
   - [Línea 69](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L69): *"Sus sesiones en la tabla `sessions` son purgadas inmediatamente; cualquier petición subsecuente es rechazada..."* $\rightarrow$ Voz activa: *"El servidor purga las sesiones del usuario en la tabla `sessions` y rechaza peticiones subsecuentes con código `403 account_deactivated`."*

5. **Exceso de Negritas y Ruido en Tablas:**
   - [Líneas 53-55](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L53-L55): La fila de `deactivated` tiene todas sus celdas en negrita (`**Bloqueado (403)**`, `**No (Libera cupo)**`, `**Intactas con tag...**`), rompiendo la neutralidad visual del cuadro de estados. Limitar el uso de negritas únicamente a los nombres de los estados (`active`, `deactivated`, `invited`).

6. **Inconsistencia de Tipo de Componente UI:**
   - [Línea 124](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L124) vs [Línea 125](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L125): El subtítulo indica *"Fila de Miembro Rediseñada"* mientras el cuerpo dice *"Cada tarjeta de colaborador incluirá:"*. Definir si el layout es una fila de tabla/lista o un grid de tarjetas.

7. **Sobrecarga de Emojis en Especificación Funcional:**
   - [Líneas 133-135](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/docs/PLAN_GESTION_EQUIPO_COLABORATIVO.md#L133-L135): `🔒`, `⏸`, `▶`, `🗑`. Sustituir por nombres de identificadores de iconos de Lucide (ej. `icon: lock`, `icon: pause`, `icon: trash-2`) para facilitar el trabajo del desarrollador frontend.

---

## Resumen de Prioridades para Edición

1. **Inmediato (Major):** Unificar `allowed_clients` (eliminar `allowed_clients_json`), corregir la cuenta de imperativos (2 $\rightarrow$ 3), delimitar roles RBAC vs `role_title`, y sustituir la notación KaTeX `$\rightarrow$` / `$\leftrightarrow$` por flechas Unicode.
2. **Revisión de Tono (Defensive Caveats / Glaze):** Aplicar las redacciones calibradas sugeridas para eliminar adjetivos promocionales y frases hechas.