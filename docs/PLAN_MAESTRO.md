# Plan Maestro: Trafikeitor // Control de Tráfico • El Marcante

> **Regla de Oro**: El archivo actual `mesa_de_tr_fico_sobres_ot v1.1.html` (5,131 líneas) queda congelado como prototipo maestro de referencia visual y funcional. La aplicación de producción se construye sobre una arquitectura modular en TypeScript con SQLite local/embebido (cero Docker), Hono, Drizzle ORM y Better Auth.

---

## 0. Glosario de Dominio

* **OT / Sobre OT (Orden de Trabajo)**: Contenedor único de un trabajo o entregable (ej. `OT-26-001`). Agrupa encabezado técnico, hoja de ruta, piezas en el Media Pool y brief/especificaciones.
* **Referencia (`ref`)**: Identificador o apodo humano y visual que distingue una pieza o motivo de otra dentro de una misma campaña o proyecto (ej. en publicidad: `"Elefante"` vs. `"Gallina"`; en web: `"Checkout Bold"`; en software: `"Motor Cálculo"`).
* **Hoja de Ruta (Bitácora de Relevos y Movimientos)**: Tabla secuencial de pases entre áreas (`DE` -> `PARA` -> `TAREA` -> `ENTRADA` -> `ENTREGA` -> `SELLO`).
* **Línea**: Cada fila individual registrada dentro de la Hoja de Ruta de una OT.
* **Stripboard (Hoja de Tiempos)**: Planificador operativo inspirado en rodajes de cine con 4 vistas (Día, Semana Lun-Sáb, Timeline Gantt por pista departamental y Mes).
* **Suites (`SUITE_DEFS`)**: Archivos nativos de diseño u oficina (`.afdesign`, `.afphoto`, `.afpub`, `.ai`, `.psd`, `.indd`, `.pages`, `.key`, `.numbers`, `.docx`, `.pptx`, `.xlsx`) cuyas vistas previas se extraen en el servidor.

---

## 1. Diagnóstico, Problema y Alcance

### 1.1. Declaración del Problema
El prototipo `v1.1.html` resuelve al 100% la experiencia de usuario y el flujo de trabajo para Publicidad, Desarrollo Web y Desarrollo de Software, pero almacena el estado en `localStorage` y acopla 5,131 líneas en un solo archivo. Se requiere persistencia real en base de datos, subida física de archivos al servidor, acceso protegido para el Director (y futuros compradores de licencias del software) y enlaces de revisión por línea/sobre para clientes sin exigirles crear una cuenta.

### 1.2. Objetivos (Goals)
1. **Persistencia en SQLite (`better-sqlite3` en modo WAL) + Drizzle ORM**: Base de datos en un único archivo `trafico.db` sin requerir Docker ni servidores externos complejos.
2. **Soporte Multi-Disciplina (`advertising`, `web`, `software`)**: Pistas y departamentos adaptables a campañas publicitarias, desarrollo web y desarrollo de software.
3. **Arquitectura Lista para Comercializar (`studios`)**: Aislamiento por `studio_id` para uso propio (`El Marcante`) y venta futura de licencias a otros estudios o profesionales.
4. **Autenticación Dual**: `Better Auth` (Email + Contraseña) para Directores de estudio, y pases públicos por token (`shared_reviews`) para clientes/colaboradores externos.
5. **Conservación del Extractor de Vistas Previas**: Portar `extractServerPreview` de `api.php` a Node.js (`preview-extractor.ts`).

### 1.3. Fuera de Alcance (Non-Goals)
* No se utilizará Docker ni contenedores PostgreSQL.
* No se reescribirá la estética DaVinci Resolve con componentes genéricos que alteren el diseño aprobado en `v1.1.html`.

---

## 2. Estructura Exacta de la Carpeta del Proyecto

```text
El Marcante Tráfico/
├── mesa_de_tr_fico_sobres_ot v1.1.html   <-- Prototipo de referencia
├── PLAN_MAESTRO.md                       <-- Este documento
├── package.json
├── tsconfig.json
├── drizzle.config.ts
├── trafico.db                            <-- Base de datos SQLite (se crea sola al arrancar)
├── uploads/                              <-- Carpeta donde se guardan los archivos subidos
└── src/
    ├── shared/
    │   └── schemas.ts                    <-- Validaciones Zod y tipos compartidos
    └── server/
        ├── index.ts                      <-- Servidor principal Hono + API REST
        ├── auth.ts                       <-- Better Auth (Email + Contraseña)
        └── db/
            ├── index.ts                  <-- Conexión SQLite WAL + Semilla inicial
            └── schema.ts                 <-- 12 Tablas Drizzle ORM
```
