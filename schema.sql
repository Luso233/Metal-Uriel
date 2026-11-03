-- ==========================================================
-- Esquema de Base de Datos para MariaDB / MySQL
-- Proyecto: Metal-Uriel (Admisiones UNID SaaS Multi-Tenant)
-- ==========================================================

CREATE DATABASE IF NOT EXISTS `unid_admisiones` 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE `unid_admisiones`;

-- Tabla de Sedes / Inquilinos (Tenants) para arquitectura SaaS Multi-Tenant
CREATE TABLE IF NOT EXISTS `sedes` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `slug` VARCHAR(50) NOT NULL UNIQUE,
    `nombre` VARCHAR(150) NOT NULL,
    `estado` VARCHAR(100) NOT NULL,
    `region` VARCHAR(50) DEFAULT 'Nacional',
    `whatsapp_phone_number_id` VARCHAR(100) NULL,
    `whatsapp_token_encrypted` TEXT NULL,
    `meta_verify_token` VARCHAR(150) DEFAULT 'unid_meta_verify_token_2026',
    `email_notificaciones` VARCHAR(255) NULL,
    `custom_prompt` TEXT NULL,
    `gemini_key_encrypted` TEXT NULL,
    `openai_key_encrypted` TEXT NULL,
    `activa` BOOLEAN DEFAULT TRUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_slug` (`slug`),
    INDEX `idx_whatsapp_phone_id` (`whatsapp_phone_number_id`),
    INDEX `idx_activa` (`activa`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla principal de registro de aspirantes / prospectos (Segmentada por Sede)
CREATE TABLE IF NOT EXISTS `aspirantes` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `sede_id` INT NULL,
    `nombre_completo` VARCHAR(255) NOT NULL,
    `fecha_nacimiento` DATE NULL,
    `sexo` VARCHAR(30) NULL,
    `estado_nacimiento` VARCHAR(100) NULL,
    `telefono_celular` VARCHAR(30) NOT NULL,
    `correo_electronico` VARCHAR(255) NULL,
    `bachillerato_procedencia` VARCHAR(255) NULL,
    `carrera_interes` VARCHAR(255) NOT NULL,
    `direccion` TEXT NULL,
    `codigo_postal` VARCHAR(10) NULL,
    `campus_interes` VARCHAR(100) NOT NULL,
    `modalidad_estudios` VARCHAR(100) NOT NULL,
    `es_foraneo` BOOLEAN DEFAULT FALSE,
    `estado_prospecto` VARCHAR(50) DEFAULT 'nuevo',
    `nivel_interes` VARCHAR(20) DEFAULT 'Alto',
    `resumen_ia` TEXT NULL,
    `archivado` BOOLEAN DEFAULT FALSE,
    `ultimo_mensaje_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `latitud` DECIMAL(10, 8) NULL DEFAULT NULL,
    `longitud` DECIMAL(11, 8) NULL DEFAULT NULL,
    `raw_json_data` JSON NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_sede_id` (`sede_id`),
    INDEX `idx_telefono` (`telefono_celular`),
    INDEX `idx_carrera` (`carrera_interes`),
    INDEX `idx_campus` (`campus_interes`),
    INDEX `idx_estado` (`estado_prospecto`),
    INDEX `idx_archivado` (`archivado`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla complementaria para almacenar el historial de conversación
CREATE TABLE IF NOT EXISTS `historial_conversaciones` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
    `sede_id` VARCHAR(50) NULL,
    `telefono_celular` VARCHAR(30) NOT NULL,
    `rol` ENUM('user', 'assistant', 'system', 'human_advisor') NOT NULL,
    `mensaje` TEXT NOT NULL,
    `timestamp` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_historial_telefono` (`telefono_celular`, `timestamp`),
    INDEX `idx_historial_sede` (`sede_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de Usuarios y Control de Acceso Basado en Roles (RBAC)
CREATE TABLE IF NOT EXISTS `usuarios` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `correo_institucional` VARCHAR(255) NOT NULL UNIQUE,
    `nombre_completo` VARCHAR(150) NOT NULL,
    `matricula` VARCHAR(50) NULL,
    `password` VARCHAR(255) NOT NULL,
    `rol` ENUM('desarrollador', 'administrador', 'usuario') NOT NULL DEFAULT 'usuario',
    `sede_id` VARCHAR(50) NULL DEFAULT NULL COMMENT 'NULL = Global (Desarrollador), o slug de sede ej. campeche',
    `activo` BOOLEAN DEFAULT TRUE,
    `ultimo_acceso` TIMESTAMP NULL DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_correo` (`correo_institucional`),
    INDEX `idx_rol` (`rol`),
    INDEX `idx_sede_usuario` (`sede_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

