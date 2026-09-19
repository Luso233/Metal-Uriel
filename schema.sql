-- ==========================================================
-- Esquema de Base de Datos para MariaDB / MySQL
-- Proyecto: Metal-Uriel (Admisiones UNID Multi-Campus)
-- ==========================================================

CREATE DATABASE IF NOT EXISTS `unid_admisiones` 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE `unid_admisiones`;

-- Tabla principal de registro de aspirantes / prospectos
CREATE TABLE IF NOT EXISTS `aspirantes` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
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
    INDEX `idx_telefono` (`telefono_celular`),
    INDEX `idx_carrera` (`carrera_interes`),
    INDEX `idx_campus` (`campus_interes`),
    INDEX `idx_estado` (`estado_prospecto`),
    INDEX `idx_archivado` (`archivado`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla complementaria para almacenar el historial de conversación (opcional para persistencia de contexto)
CREATE TABLE IF NOT EXISTS `historial_conversaciones` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
    `telefono_celular` VARCHAR(30) NOT NULL,
    `rol` ENUM('user', 'assistant', 'system') NOT NULL,
    `mensaje` TEXT NOT NULL,
    `timestamp` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_historial_telefono` (`telefono_celular`, `timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
