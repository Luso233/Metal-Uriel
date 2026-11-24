const mysql = require('mysql2/promise');
const { UNID_CAMPUSES, DEFAULT_POOL_CATEGORIES } = require('../config/campuses');
const { config, isProductionHardened, reloadEnvFromDisk } = require('../config/env');
const { encryptSecret, hashPassword } = require('../utils/crypto');
const { getPool, rebuildPool, setDatabaseReady } = require('./pool');
const { providerCooldowns } = require('../state/memory');
const { initAiClients, setActiveModelId } = require('../services/llm.service');
const { seedInitialPoolResources, materializeAllPoolPdfsOnDisk } = require('../services/pool.service');

async function initializeDatabase(options = {}) {
    let connection = null;
    try {
        const dbHost = process.env.DB_HOST || 'localhost';
        const dbPort = Number(process.env.DB_PORT) || 3306;
        const dbUser = process.env.DB_USER || 'root';
        const dbPassword = process.env.DB_PASSWORD || '';
        const dbName = (process.env.DB_NAME || 'unid_admisiones').replace(/[^a-zA-Z0-9_]/g, '') || 'unid_admisiones';
        const primaryCampus = options.primaryCampus || process.env.PRIMARY_CAMPUS || 'campeche';

        const bootConn = await mysql.createConnection({
            host: dbHost, port: dbPort, user: dbUser, password: dbPassword, connectTimeout: 8000
        });
        await bootConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        await bootConn.end();

        if (options.rebuildPool) await rebuildPool();

        connection = await getPool().getConnection();
        console.log(`✅ Conexión exitosa a MariaDB (${dbName}@${dbHost}:${dbPort}).`);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS sedes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                slug VARCHAR(50) NOT NULL UNIQUE,
                nombre VARCHAR(150) NOT NULL,
                estado VARCHAR(100) NOT NULL,
                region VARCHAR(50) DEFAULT 'Nacional',
                whatsapp_phone_number_id VARCHAR(100) NULL,
                whatsapp_token_encrypted TEXT NULL,
                meta_verify_token VARCHAR(150) DEFAULT 'unid_meta_verify_token_2026',
                email_notificaciones VARCHAR(255) NULL,
                custom_prompt TEXT NULL,
                gemini_key_encrypted TEXT NULL,
                openai_key_encrypted TEXT NULL,
                activa BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_slug (slug),
                INDEX idx_whatsapp_phone_id (whatsapp_phone_number_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        try {
            const [sedesCount] = await connection.query('SELECT COUNT(*) as count FROM sedes');
            if (sedesCount[0].count === 0) {
                for (const campus of UNID_CAMPUSES) {
                    const isPrimary = campus.id === primaryCampus;
                    const encryptedWaToken = isPrimary && config.WHATSAPP_TOKEN ? encryptSecret(config.WHATSAPP_TOKEN) : null;
                    const phoneId = isPrimary ? (config.WHATSAPP_PHONE_NUMBER_ID || null) : null;
                    const email = isPrimary ? (process.env.ADMISSIONS_NOTIFICATION_EMAIL || `admisiones.${campus.id}@unid.mx`) : null;
                    await connection.execute(`
                        INSERT INTO sedes (slug, nombre, estado, region, whatsapp_phone_number_id, whatsapp_token_encrypted, meta_verify_token, email_notificaciones, activa)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
                    `, [campus.id, campus.name, campus.estado, campus.region, phoneId, encryptedWaToken, config.VERIFY_TOKEN, email]);
                }
            } else if (options.syncPrimaryCampusCreds) {
                const encryptedWaToken = config.WHATSAPP_TOKEN ? encryptSecret(config.WHATSAPP_TOKEN) : null;
                await connection.execute(`
                    UPDATE sedes
                    SET whatsapp_phone_number_id = COALESCE(?, whatsapp_phone_number_id),
                        whatsapp_token_encrypted = COALESCE(?, whatsapp_token_encrypted),
                        meta_verify_token = ?,
                        email_notificaciones = COALESCE(?, email_notificaciones)
                    WHERE slug = ?
                `, [config.WHATSAPP_PHONE_NUMBER_ID || null, encryptedWaToken, config.VERIFY_TOKEN, process.env.ADMISSIONS_NOTIFICATION_EMAIL || null, primaryCampus]);
            }
        } catch (seedErr) {
            console.warn('⚠️ Error poblando/actualizando sedes iniciales:', seedErr.message);
        }

        await connection.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id INT AUTO_INCREMENT PRIMARY KEY,
                correo_institucional VARCHAR(255) NOT NULL UNIQUE,
                nombre_completo VARCHAR(150) NOT NULL,
                matricula VARCHAR(50) NULL,
                password VARCHAR(255) NOT NULL,
                rol ENUM('desarrollador', 'administrador', 'usuario') NOT NULL DEFAULT 'usuario',
                sede_id VARCHAR(50) NULL DEFAULT NULL,
                activo BOOLEAN DEFAULT TRUE,
                ultimo_acceso TIMESTAMP NULL DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_correo (correo_institucional),
                INDEX idx_rol (rol),
                INDEX idx_sede_usuario (sede_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        try {
            if (options.customDevUser?.correo_institucional) {
                const dev = options.customDevUser;
                const devMat = dev.matricula || dev.correo_institucional.split('@')[0];
                const [existingDev] = await connection.query('SELECT id FROM usuarios WHERE correo_institucional = ? LIMIT 1', [dev.correo_institucional]);
                if (existingDev.length > 0 && dev.password) {
                    await connection.execute(
                        'UPDATE usuarios SET nombre_completo = ?, password = ?, rol = "desarrollador", sede_id = NULL, activo = 1 WHERE id = ?',
                        [dev.nombre_completo, hashPassword(dev.password), existingDev[0].id]
                    );
                } else if (existingDev.length === 0) {
                    await connection.execute(
                        'INSERT INTO usuarios (correo_institucional, nombre_completo, matricula, password, rol, sede_id, activo) VALUES (?, ?, ?, ?, "desarrollador", NULL, 1)',
                        [dev.correo_institucional, dev.nombre_completo, devMat, hashPassword(dev.password)]
                    );
                }
                if (options.customAdminUser?.correo_institucional && options.customAdminUser.password) {
                    const adm = options.customAdminUser;
                    const admMat = adm.matricula || adm.correo_institucional.split('@')[0];
                    await connection.execute(`
                        INSERT INTO usuarios (correo_institucional, nombre_completo, matricula, password, rol, sede_id, activo)
                        VALUES (?, ?, ?, ?, 'administrador', ?, 1)
                        ON DUPLICATE KEY UPDATE nombre_completo = VALUES(nombre_completo), password = VALUES(password), sede_id = VALUES(sede_id), activo = 1
                    `, [adm.correo_institucional, adm.nombre_completo || 'Administrador de Sede UNID', admMat, hashPassword(adm.password), primaryCampus]);
                }
            } else {
                const [usersCount] = await connection.query('SELECT COUNT(*) as count FROM usuarios');
                if (usersCount[0].count === 0 && !isProductionHardened()) {
                    const initialUsers = [
                        { correo: '00774343@red.unid.mx', nombre: 'Luis Felipe Quintero (Desarrollador / Superadmin)', matricula: '00774343', pass: hashPassword('admin'), rol: 'desarrollador', sede: null },
                        { correo: 'admin.campeche@red.unid.mx', nombre: 'Dir. Admisiones Campeche (Administrador Sede)', matricula: '00881122', pass: hashPassword('admin2026'), rol: 'administrador', sede: 'campeche' },
                        { correo: '67676767@red.unid.mx', nombre: 'Lic. Asesor de Admisiones (Operativo)', matricula: '67676767', pass: hashPassword('user'), rol: 'usuario', sede: 'campeche' }
                    ];
                    for (const u of initialUsers) {
                        await connection.execute(
                            'INSERT INTO usuarios (correo_institucional, nombre_completo, matricula, password, rol, sede_id, activo) VALUES (?, ?, ?, ?, ?, ?, 1)',
                            [u.correo, u.nombre, u.matricula, u.pass, u.rol, u.sede]
                        );
                    }
                }
            }
        } catch (userSeedErr) {
            console.warn('⚠️ Error poblando usuarios RBAC iniciales:', userSeedErr.message);
        }

        await connection.query(`
            CREATE TABLE IF NOT EXISTS aspirantes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                sede_id VARCHAR(50) NULL DEFAULT 'campeche',
                nombre_completo VARCHAR(255) NOT NULL,
                fecha_nacimiento DATE NULL,
                sexo VARCHAR(30) NULL,
                estado_nacimiento VARCHAR(100) NULL,
                curp VARCHAR(18) NULL,
                telefono_celular VARCHAR(30) NOT NULL,
                correo_electronico VARCHAR(255) NULL,
                bachillerato_procedencia VARCHAR(255) NULL,
                carrera_interes VARCHAR(255) NOT NULL,
                direccion TEXT NULL,
                codigo_postal VARCHAR(10) NULL,
                campus_interes VARCHAR(100) NOT NULL,
                modalidad_estudios VARCHAR(100) NOT NULL,
                ciclo_escolar VARCHAR(60) DEFAULT '2026-3 Septiembre',
                es_foraneo BOOLEAN DEFAULT FALSE,
                aviso_privacidad_aceptado TINYINT(1) DEFAULT 1,
                estado_prospecto VARCHAR(50) DEFAULT 'nuevo',
                nivel_interes VARCHAR(20) DEFAULT 'Alto',
                resumen_ia TEXT NULL,
                archivado TINYINT(1) DEFAULT 0,
                ultimo_mensaje_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                latitud DECIMAL(10, 8) NULL DEFAULT NULL,
                longitud DECIMAL(11, 8) NULL DEFAULT NULL,
                raw_json_data JSON NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_sede_id (sede_id),
                INDEX idx_telefono (telefono_celular),
                INDEX idx_estado (estado_prospecto),
                INDEX idx_archivado (archivado)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        const migrations = [
            `CREATE TABLE IF NOT EXISTS bitacora_notificaciones_correo (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                evento_tipo VARCHAR(60) NOT NULL,
                destinatario VARCHAR(255) NOT NULL,
                asunto VARCHAR(255) NOT NULL,
                estado VARCHAR(80) NOT NULL DEFAULT 'enviado',
                transporte VARCHAR(60) NULL,
                detalle TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_correo_evento (evento_tipo),
                INDEX idx_correo_fecha (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
            `CREATE TABLE IF NOT EXISTS llm_telemetria (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                sede_id VARCHAR(50) DEFAULT 'campeche',
                telefono_celular VARCHAR(30) NULL,
                proveedor VARCHAR(60) NOT NULL,
                modelo VARCHAR(100) NOT NULL,
                latencia_ms INT NOT NULL DEFAULT 0,
                tokens_est_in INT NOT NULL DEFAULT 0,
                tokens_est_out INT NOT NULL DEFAULT 0,
                costo_est_mxn DECIMAL(10, 6) NOT NULL DEFAULT 0,
                fue_fallback TINYINT(1) NOT NULL DEFAULT 0,
                exito TINYINT(1) NOT NULL DEFAULT 1,
                error_detalle VARCHAR(255) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_llm_fecha (created_at),
                INDEX idx_llm_proveedor (proveedor),
                INDEX idx_llm_sede (sede_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
            `CREATE TABLE IF NOT EXISTS historial_conversaciones (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                sede_id VARCHAR(50) NULL DEFAULT 'campeche',
                ciclo_escolar VARCHAR(60) DEFAULT '2026-3 Septiembre',
                telefono_celular VARCHAR(30) NOT NULL,
                rol ENUM('user', 'assistant', 'system', 'human_advisor') NOT NULL,
                mensaje TEXT NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_historial_telefono (telefono_celular, timestamp),
                INDEX idx_historial_sede (sede_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
            `CREATE TABLE IF NOT EXISTS ciclos_escolares_sede (
                sede_id VARCHAR(50) PRIMARY KEY,
                ciclo_activo VARCHAR(60) NOT NULL DEFAULT '2026-3 Septiembre',
                ciclos_disponibles TEXT NULL,
                updated_by VARCHAR(150) NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
            `CREATE TABLE IF NOT EXISTS pool_categorias (
                id INT AUTO_INCREMENT PRIMARY KEY,
                slug VARCHAR(80) NOT NULL UNIQUE,
                nombre VARCHAR(120) NOT NULL,
                icono VARCHAR(20) DEFAULT '📁',
                color VARCHAR(40) DEFAULT 'amber',
                descripcion VARCHAR(255) NULL,
                orden INT DEFAULT 10,
                activa TINYINT(1) DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
            `CREATE TABLE IF NOT EXISTS pool_recursos_multimedia (
                id INT AUTO_INCREMENT PRIMARY KEY,
                codigo_recurso VARCHAR(80) NOT NULL UNIQUE,
                sede_id VARCHAR(50) DEFAULT 'campeche',
                ciclo_escolar VARCHAR(60) DEFAULT '2026-3 Septiembre',
                categoria VARCHAR(80) NOT NULL DEFAULT 'plan_estudios',
                titulo VARCHAR(200) NOT NULL,
                descripcion_ia TEXT NULL,
                scope VARCHAR(80) DEFAULT 'campus_campeche',
                scope_label VARCHAR(150) DEFAULT '🏛️ Campus Campeche (Presencial)',
                modalidad VARCHAR(120) DEFAULT 'Presencial',
                duracion VARCHAR(100) DEFAULT '3 años (9 cuatrimestres)',
                rvoe VARCHAR(100) DEFAULT 'SEP-RVOE-OFICIAL',
                tipo_archivo VARCHAR(40) NOT NULL DEFAULT 'pdf',
                file_name VARCHAR(200) NULL,
                url_recurso VARCHAR(500) NULL,
                tamano VARCHAR(40) DEFAULT '1.2 MB',
                tags TEXT NULL,
                subido_por VARCHAR(150) NULL,
                updated_by VARCHAR(150) NULL,
                activo TINYINT(1) DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
        ];

        for (const sql of migrations) {
            try { await connection.query(sql); } catch (_) {}
        }

        try {
            const [catCount] = await connection.query('SELECT COUNT(*) as count FROM pool_categorias');
            if (catCount[0].count === 0) {
                for (const cat of DEFAULT_POOL_CATEGORIES) {
                    await connection.execute(
                        'INSERT IGNORE INTO pool_categorias (slug, nombre, icono, color, descripcion, orden, activa) VALUES (?, ?, ?, ?, ?, ?, 1)',
                        [cat.slug, cat.nombre, cat.icono, cat.color, cat.descripcion, cat.orden]
                    );
                }
            }
            const [poolRows] = await connection.query('SELECT COUNT(*) as count FROM pool_recursos_multimedia');
            if (poolRows[0].count === 0) {
                await seedInitialPoolResources(connection);
            }
            await materializeAllPoolPdfsOnDisk(connection);
        } catch (poolErr) {
            console.warn('⚠️ Error poblando pool_recursos_multimedia:', poolErr.message);
        }

        setDatabaseReady(true);
        connection.release();
        return { ok: true };
    } catch (err) {
        if (connection) { try { connection.release(); } catch (_) {} }
        setDatabaseReady(false);
        console.warn('⚠️ No se pudo conectar a MariaDB:', err.message);
        if (options.throwOnError) throw err;
        return { ok: false, error: err.message };
    }
}

function reloadRuntimeConfig() {
    reloadEnvFromDisk();
    setActiveModelId(process.env.DEFAULT_AI_MODEL || 'auto-fallback');
    providerCooldowns.clear();
    initAiClients();
}

module.exports = {
    initializeDatabase,
    reloadRuntimeConfig
};
