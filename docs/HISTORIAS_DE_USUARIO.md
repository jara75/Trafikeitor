# Historias de Usuario — Trafikeitor // Control de Tráfico

> Documento de referencia funcional para validar el comportamiento esperado por rol antes de ajustar la implementación.

---

## 1. Mapa de Roles del Sistema

| Rol | Alcance en el Estudio | Cómo accede |
| :--- | :--- | :--- |
| **Dueño / Director (`owner` / `admin`)** | Control total del estudio, clientes, OTs, equipo, permisos y suscripción. | Cuenta Better Auth (Email + Contraseña). |
| **Colaborador (`member`)** | Operación diaria dentro del estudio asignado; sin facultades de administración de equipo ni auto-asignación de áreas. | Invitación por correo (`/?invite=<id>`) o enlace directo. |
| **Cliente Revisor (Externo)** | Ve únicamente la pieza o entregable compartido en su enlace. Cero acceso a otras OTs, clientes o Stripboard. | Enlace público único (`/review/:token`), sin crear cuenta. |

---

## 2. Historia de Usuario 1: El Dueño / Director (`owner` / `admin`)

### HU-D1: Creación y Gobierno de Espacios (Multi-Workspace)
- **Como** Dueño de una agencia o estudio,  
  **quiero** poder crear y alternar entre distintos Espacios de Trabajo (ej. estudio principal y un espacio aislado para un cliente con NDA),  
  **para** garantizar confidencialidad estricta entre cuentas rivales sin fragmentar el Stripboard ni las listas internas de un mismo estudio.

### HU-D2: Invitación y Seguimiento del Equipo
- **Como** Dueño,  
  **quiero** invitar colaboradores por correo desde *Mi Perfil → Mi Equipo / Espacio*, y poder **Reenviar**, **Copiar Link** o **Cancelar** invitaciones pendientes,  
  **para** incorporar a mi equipo (hasta 6 miembros activos) sin depender de un único canal de entrega.

### HU-D3: Configuración del Perfil Operativo por Colaborador
- **Como** Dueño,  
  **quiero** definir desde *Mi Equipo* el cargo visible (`roleTitle`), los departamentos operativos asignados en este estudio (`Cuentas`, `Tráfico`, `Creativos`, `Diseño`, `Desarrollo`, etc.) y si el colaborador puede abrir nuevas OTs,  
  **para** mantener el orden operativo sin que un colaborador se cambie de área por su cuenta ni afecte los departamentos que tenga en otro estudio distinto.

### HU-D4: Pausa, Reactivación y Retiro Seguro ("Cero Huérfanas")
- **Como** Dueño,  
  **quiero** desactivar temporalmente a un colaborador (revocando de inmediato su acceso y liberando su asiento) o retirarlo definitivamente transfiriendo primero sus OTs abiertas, pasos de ruta y tiras de Stripboard a otro compañero activo,  
  **para** proteger las firmas históricas y evitar que queden trabajos sin responsable.

### HU-D5: Visibilidad en Tiempo Real del Trabajo del Equipo
- **Como** Dueño,  
  **quiero** ver automáticamente en mi Mesa de Tráfico y Stripboard cualquier OT, pase de Hoja de Ruta, archivo o turno que cree o actualice mi equipo,  
  **para** no tener que recargar el navegador ni arriesgar que mis cambios sobrescriban el trabajo simultáneo de un compañero.

---

## 3. Historia de Usuario 2: El Colaborador (`member`)

### HU-C1: Ingreso por Invitación
- **Como** Colaborador invitado,  
  **quiero** abrir el enlace recibido en mi correo desde mi propio computador, definir mi contraseña (o iniciar sesión con mi correo) y entrar directo al estudio que me invitó,  
  **para** empezar a trabajar en segundos.

### HU-C2: Perfil Personal vs. Perfil Operativo
- **Como** Colaborador,  
  **quiero** poder editar mis datos personales (nombre visible, iniciales `shortName`, color de firma y avatar), pero ver mis departamentos operativos en **solo lectura** tal como los asignó el Dueño,  
  **para** personalizar mi firma sin alterar la estructura operativa del estudio.

### HU-C3: Directorio de Equipo en Solo Lectura
- **Como** Colaborador,  
  **quiero** consultar quiénes forman parte del equipo y sus cargos,  
  **para** saber a quién asignar o pasar una OT, **sin** ver formularios para invitar nuevas personas ni botones para desactivar o retirar compañeros.

### HU-C4: Apertura Restringida de OTs (Dueño / Cuentas / Cliente opcional)
- **Como** Colaborador operativo (ej. *Creativos*, *Diseño*, *Arte Final*, *Desarrollo*),  
  **quiero** trabajar sobre las OTs asignadas al estudio (registrar pases en Hoja de Ruta, subir archivos al Media Pool, actualizar turnos en el Stripboard y generar enlaces de revisión), **sin** poder crear OTs nuevas por mi cuenta a menos que pertenezca a **Cuentas** o el Dueño me haya habilitado ese permiso,  
  **para** respetar el flujo formal de entrada de requerimientos de la agencia.

### HU-C5: Trabajo Concurrente Seguro
- **Como** Colaborador,  
  **quiero** mover turnos en el Stripboard, editar rutas o subir versiones de piezas al mismo tiempo que otros compañeros o el Dueño trabajan en el sistema,  
  **para** que nuestros cambios convivan sin borrarse unos a otros.

---

## 4. Historia de Usuario 3: El Cliente Revisor (Externo)

### HU-R1: Acceso Cero Fricción por Enlace Único
- **Como** Cliente externo,  
  **quiero** abrir el enlace `/review/:token` enviado por el estudio y ver directamente la pieza (imagen, diseño nativo previsualizado o PDF por páginas) sin registrarme ni ver el resto de OTs de la agencia,  
  **para** revisar rápido y sin barreras.

### HU-R2: Anotaciones Espaciales y Conversación por Versiones
- **Como** Cliente externo,  
  **quiero** ingresar mi nombre una sola vez, hacer clic sobre cualquier punto exacto de la pieza para dejar un pin numerado, responder hilos en tiempo real y consultar versiones anteriores (`v1`, `v2`),  
  **para** dar feedback preciso sin correos largos ni capturas sueltas.

### HU-R3: Aprobación o Solicitud de Cambios con Cierre Operativo
- **Como** Cliente externo,  
  **quiero** hacer clic en **"Aprobar Pieza"** o **"Solicitar Cambios"** cuando termine de revisar,  
  **para** que mi decisión quede firmada automáticamente en la Hoja de Ruta de la OT y el estudio reciba el estado actualizado al instante.

### HU-R4: Solicitud Opcional de Nueva OT *(Alcance Opcional Futuro)*
- **Como** Cliente recurrente (si el Dueño habilita esta opción para su cuenta/enlace),  
  **quiero** enviar un brief de solicitud que genere una nueva OT en estado inicial (`En Redacción`),  
  **para** canalizar nuevos pedidos sin salir del flujo de Trafikeitor.

