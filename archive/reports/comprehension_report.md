### **What this proposes**
El documento propone migrar "El Marcante // Control de Tráfico" desde un prototipo monolítico hacia una aplicación web full-stack modular en TypeScript, manteniendo congelado el archivo HTML actual como referencia visual y funcional. La nueva arquitectura divide el sistema en un frontend con React, Vite, Tailwind, shadcn/ui, Zustand, TanStack Query y React Hook Form + Zod, conectado a un backend en Node.js con Hono, Drizzle ORM (sobre PostgreSQL o SQLite) y almacenamiento de archivos en servidor. Además, incorpora autenticación mediante Better Auth para el Director y un sistema de enlaces compartidos para que clientes o freelancers externos revisen líneas específicas de una orden, previsualicen archivos, aprueben o soliciten ajustes y consulten el sobre completo en 4 fases incrementales.

### **How the existing system works, per this document**
Según el documento, el sistema actual consiste en un único archivo monolítico ([mesa_de_tr_fico_sobres_ot v1.1.html](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/mesa_de_tr_fico_sobres_ot%20v1.1.html)) de 5,131 líneas que acopla HTML, CSS y JavaScript. La interfaz emula la estética de DaVinci Resolve e incluye carpetas de clientes ("Bins"), tarjetas de sobres físicos ("OTs"), sellos de goma, visor de medios integrado y una hoja de tiempos ("Stripboard"). Toda la gestión de estado se realiza mediante variables globales, lectura manual de inputs del DOM (`document.getElementById`) y re-renderizado con `innerHTML`, persistiendo los datos únicamente en el `localStorage` del navegador sin autenticación ni base de datos activa (aunque en la Fase 1 se mencionan incidentalmente archivos temporales `api.php` y `schema.sql` que serán descartados).

---

### Hallazgos de Comprensión (Stage 6 Comprehension Audit)

1. **Severidad**: Major
   - **Alcance Afectado**: Líneas 4, 29, 70–74, 80–91, 102–104, 115–119 ([PLAN_MAESTRO.md](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/PLAN_MAESTRO.md#L4-L119)) — Términos de dominio y acrónimos sin definir (`OT`, `Sobre`, `Línea`, `Relevos`, `Semáforos`, `Suites`).
   - **Descripción y Justificación**: Un lector nuevo en el proyecto encuentra múltiples conceptos propios del dominio sin definición ni glosario:
     - **`OT` / `Sobre OT`**: Se usa el acrónimo `OT` en todo el documento sin definir explícitamente que significa "Orden de Trabajo" ni qué entidad o ciclo de vida representa un "Sobre".
     - **`Línea` vs. `Hoja de Ruta` vs. `Bitácora de Relevos y Movimientos`**: En [líneas 70 y 89](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/PLAN_MAESTRO.md#L70-L89) se usan indistintamente "Hoja de Ruta" y "Bitácora de Relevos y Movimientos", y en [líneas 73, 102–103 y 118](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/PLAN_MAESTRO.md#L102-L103) se habla de "Ver línea" o "línea(s) sujeta(s) a presentación/revisión/aprobación", sin explicar que una "línea" es un registro individual dentro de la bitácora/hoja de ruta de un Sobre OT.
     - **`Semáforos` y `Suites`**: En [línea 83](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/PLAN_MAESTRO.md#L83) se mencionan "Semáforos" y en [línea 88](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/PLAN_MAESTRO.md#L88) "Suites" dentro del visor de medios, sin explicar qué estados calcula el semáforo ni qué tipo de archivo o recurso es una "Suite".

2. **Severidad**: Major
   - **Alcance Afectado**: Líneas 96–104 y 118–119 ([PLAN_MAESTRO.md](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/PLAN_MAESTRO.md#L96-L104)) — Mecanismo de seguridad y autorización en "Enlaces Compartidos" vague / incompleto.
   - **Descripción y Justificación**: La sección 3 explica cómo el Director inicia sesión con `Better Auth`, pero para el "Cliente o Freelancer en Miami" solo dice que se genera un "pase compartido" y que quien abre el enlace puede estampar `[ APROBADO ]` o `[ AJUSTES ]` y abrir la OT completa. No se especifica si este acceso requiere cuenta en `Better Auth`, si funciona mediante un token público/firmado por URL sin login, si el enlace permite mutar el estado de la base de datos sin autenticación, o qué límites de alcance tiene dicho pase.

3. **Severidad**: Major
   - **Alcance Afectado**: Líneas 67 vs. 112, y Línea 117 ([PLAN_MAESTRO.md](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/PLAN_MAESTRO.md#L67-L117)) — Discrepancia en nombres de tablas del esquema y formato no especificado del "JSON de respaldo".
   - **Descripción y Justificación**:
     - En [línea 67](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/PLAN_MAESTRO.md#L67) se enumeran 6 tablas para `schema.ts`: `(users, sessions, orders, routes, media, shares)`, pero en [línea 112](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/PLAN_MAESTRO.md#L112) se enumeran 8 tablas con nombres distintos: `(users, sessions, clients, orders, order_routes, order_media, stripboard, shared_reviews)`.
     - En [línea 117](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/PLAN_MAESTRO.md#L117) se asume que existe un "JSON de respaldo actual" a importar en la Fase 3, sin haber explicado antes que el prototipo exporta/almacena un JSON con una estructura determinada ni dónde se documenta dicho esquema de origen.

4. **Severidad**: Nit
   - **Alcance Afectado**: Líneas 10, 21 y 126 ([PLAN_MAESTRO.md](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/PLAN_MAESTRO.md#L10-L126)) — Referencia externa no definida ("El Stack de Nicolás" / "el video de Nicolás").
   - **Descripción y Justificación**: Se hace referencia tres veces a "Nicolás" y a su video/stack sin ningún enlace ni nota contextual. Para cualquier miembro del equipo ajeno a la conversación previa, la referencia carece de significado propio.

5. **Severidad**: Nit
   - **Alcance Afectado**: Línea 12 vs. Líneas 58–92, y Línea 14 vs. Línea 113 ([PLAN_MAESTRO.md](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/PLAN_MAESTRO.md#L12-L113)) — Contradicciones menores de contexto en estructura de carpetas y estado actual.
   - **Descripción y Justificación**:
     - En [línea 12](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/PLAN_MAESTRO.md#L12) se describe el destino como `apps/api` + `apps/web`, mientras que el árbol de directorios en [líneas 62–92](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/PLAN_MAESTRO.md#L62-L92) define `src/server/` y `src/client/`.
     - En [línea 12](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/PLAN_MAESTRO.md#L12) se afirma que hoy solo existe "1 solo archivo HTML", pero en [línea 113](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/PLAN_MAESTRO.md#L113) se ordena eliminar [api.php](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/api.php) y [schema.sql](file:///Users/elmarcante/Desktop/El%20Marcante%20Tr%C3%A1fico/schema.sql) sin haber mencionado en el diagnóstico que existía un intento previo en PHP/SQL en el repositorio.

