-- ============================================================================
-- EL MARCANTE // CONTROL DE TRÁFICO & STRIPBOARD
-- Esquema MySQL / MariaDB para Hostinger (trafico.elmarcante.com)
-- Arquitectura: Profesional Independiente (Estudio) + Colaboración por Línea/Sobre
-- ============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. ESTUDIOS / PROFESIONALES INDEPENDIENTES (Multi-tenant listo para vender)
CREATE TABLE IF NOT EXISTS `studios` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `slug` VARCHAR(64) NOT NULL UNIQUE COMMENT 'Identificador URL ej: elmarcante',
  `name` VARCHAR(120) NOT NULL COMMENT 'Nombre del estudio o profesional',
  `owner_email` VARCHAR(160) NOT NULL,
  `api_key_hash` VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `studios` (`id`, `slug`, `name`, `owner_email`)
VALUES (1, 'elmarcante', 'EL MARCANTE // CONTROL DE TRÁFICO', 'contacto@elmarcante.com');

-- 2. CLIENTES Y MARCAS
CREATE TABLE IF NOT EXISTS `clients` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `studio_id` INT UNSIGNED NOT NULL DEFAULT 1,
  `name` VARCHAR(120) NOT NULL,
  `brand` VARCHAR(120) NOT NULL DEFAULT 'General',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_clients_studio` (`studio_id`),
  CONSTRAINT `fk_clients_studio` FOREIGN KEY (`studio_id`) REFERENCES `studios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. SOBRES OT (ÓRDENES DE TRABAJO)
CREATE TABLE IF NOT EXISTS `work_orders` (
  `id` VARCHAR(32) NOT NULL COMMENT 'Código de Sobre ej: OT-26-001',
  `studio_id` INT UNSIGNED NOT NULL DEFAULT 1,
  `ref` VARCHAR(64) DEFAULT '',
  `client` VARCHAR(120) NOT NULL,
  `brand` VARCHAR(120) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `media` VARCHAR(120) DEFAULT '',
  `status` VARCHAR(64) NOT NULL DEFAULT 'EN PROCESO',
  `urgent` TINYINT(1) NOT NULL DEFAULT 0,
  `master_delivery` DATE DEFAULT NULL,
  `brief` TEXT DEFAULT NULL,
  `legal` TEXT DEFAULT NULL,
  `share_token` VARCHAR(64) NOT NULL COMMENT 'Token para compartir sobre con Cliente o Colaborador en Miami',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`, `studio_id`),
  UNIQUE KEY `idx_wo_share_token` (`share_token`),
  KEY `idx_wo_studio_status` (`studio_id`, `status`),
  CONSTRAINT `fk_wo_studio` FOREIGN KEY (`studio_id`) REFERENCES `studios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. LÍNEAS DE LA HOJA DE RUTA (MOVIMIENTOS, NOTAS POR LÍNEA Y SELLOS)
CREATE TABLE IF NOT EXISTS `route_entries` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `studio_id` INT UNSIGNED NOT NULL DEFAULT 1,
  `ot_id` VARCHAR(32) NOT NULL,
  `line_number` INT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Orden de línea en la Hoja de Ruta (#1, #2...)',
  `from_actor` VARCHAR(120) NOT NULL DEFAULT 'Director',
  `to_actor` VARCHAR(120) NOT NULL DEFAULT 'Cliente',
  `task_notes` TEXT DEFAULT NULL COMMENT 'Instrucciones, notas importadas (.md/.txt) y comentarios de esta línea',
  `entry_date` VARCHAR(32) DEFAULT NULL,
  `delivery_date` VARCHAR(32) DEFAULT NULL,
  `stamp` VARCHAR(32) DEFAULT NULL COMMENT 'APROBADO | AJUSTES | ENTREGADO | URGENTE',
  `completed` TINYINT(1) NOT NULL DEFAULT 0,
  `line_share_token` VARCHAR(64) DEFAULT NULL COMMENT 'Token opcional para compartir específicamente esta línea',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_route_ot` (`studio_id`, `ot_id`, `line_number`),
  CONSTRAINT `fk_route_wo` FOREIGN KEY (`ot_id`, `studio_id`) REFERENCES `work_orders` (`id`, `studio_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. ARCHIVOS DEL MEDIA POOL (VINCULADOS AL SOBRE Y A UNA LÍNEA DE LA HOJA DE RUTA)
CREATE TABLE IF NOT EXISTS `media_files` (
  `id` VARCHAR(64) NOT NULL,
  `studio_id` INT UNSIGNED NOT NULL DEFAULT 1,
  `ot_id` VARCHAR(32) NOT NULL,
  `route_line_index` INT DEFAULT NULL COMMENT 'Índice de línea de la Hoja de Ruta (0, 1, 2...) o NULL si es general del sobre',
  `route_entry_id` INT UNSIGNED DEFAULT NULL COMMENT 'FK opcional a route_entries.id',
  `name` VARCHAR(255) NOT NULL,
  `type` VARCHAR(32) NOT NULL DEFAULT 'document',
  `ext` VARCHAR(24) NOT NULL DEFAULT '',
  `size_label` VARCHAR(32) DEFAULT '',
  `file_url` TEXT NOT NULL COMMENT 'Ruta relativa en Hostinger ej: uploads/OT-26-001/arte.afdesign',
  `preview_url` LONGTEXT DEFAULT NULL COMMENT 'Ruta o DataURL de vista previa extraída (PNG de Affinity, PDF de Pages, etc.)',
  `preview_kind` VARCHAR(32) DEFAULT NULL COMMENT 'image | pdf | html_doc | sheet_html',
  `text_content` LONGTEXT DEFAULT NULL COMMENT 'Contenido de texto para archivos de código, markdown o notas',
  `uploaded_by` VARCHAR(120) DEFAULT 'Estudio',
  `created_at_label` VARCHAR(32) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_media_ot_line` (`studio_id`, `ot_id`, `route_line_index`),
  CONSTRAINT `fk_media_wo` FOREIGN KEY (`ot_id`, `studio_id`) REFERENCES `work_orders` (`id`, `studio_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. TIRAS DEL STRIPBOARD (PROGRAMACIÓN DIARIA / SEMANAL / GANTT / MENSUAL)
CREATE TABLE IF NOT EXISTS `stripboard_strips` (
  `id` VARCHAR(64) NOT NULL,
  `studio_id` INT UNSIGNED NOT NULL DEFAULT 1,
  `ot_id` VARCHAR(32) NOT NULL,
  `work_date` DATE NOT NULL,
  `position` INT UNSIGNED NOT NULL DEFAULT 0,
  `Strip_note` VARCHAR(255) DEFAULT '',
  `completed` TINYINT(1) NOT NULL DEFAULT 0,
  `payload_json` JSON DEFAULT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`, `studio_id`),
  KEY `idx_strip_date` (`studio_id`, `work_date`, `position`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

