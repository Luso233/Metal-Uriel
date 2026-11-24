const dotenv = require('dotenv');
dotenv.config();
const express = require('express');
const mysql = require('mysql2/promise');
const { GoogleGenAI } = require('@google/genai');
const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const setupUtils = require('./lib/setup-utils');
const securityUtils = require('./lib/security-utils');
const {
    normalizePhoneCanonical,
    pickBestDialPhone,
    analyzeLeadCompleteness,
    formatSenderAudit
} = require('./lib/chat-audit-utils');
const { buildWhatsAppConversationZip } = require('./lib/zip-builder');
const mobilePairUtils = require('./lib/mobile-pair-utils');

const TESTING_NOTIFICATION_EMAIL = (process.env.ADMISSIONS_NOTIFICATION_EMAIL || 'Luisquintero2001@gmail.com').trim();
const UPLOADS_ROOT = path.resolve(__dirname, 'public', 'uploads');

// ==========================================
// Módulo Criptográfico AES-256-GCM para Secretos Multi-Tenant (SaaS)
// ==========================================
let ENCRYPTION_MASTER_KEY = process.env.ENCRYPTION_MASTER_KEY || process.env.JWT_SECRET || 'unid_metal_uriel_saas_encryption_key_2026';
let CRYPTO_KEY = crypto.createHash('sha256').update(ENCRYPTION_MASTER_KEY).digest();

function encryptSecret(plainText) {
    if (!plainText || typeof plainText !== 'string' || !plainText.trim()) return null;
    try {
        const iv = crypto.randomBytes(12); // 96-bit IV para AES-GCM
        const cipher = crypto.createCipheriv('aes-256-gcm', CRYPTO_KEY, iv);
        let encrypted = cipher.update(plainText, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag().toString('hex');
        return `${iv.toString('hex')}:${authTag}:${encrypted}`;
    } catch (e) {
        console.error('❌ Error cifrando secreto:', e);
        return null;
    }
}

function decryptSecret(encryptedPayload) {
    if (!encryptedPayload || typeof encryptedPayload !== 'string' || !encryptedPayload.includes(':')) return null;
    try {
        const parts = encryptedPayload.split(':');
        if (parts.length !== 3) return null;
        const [ivHex, authTagHex, encryptedHex] = parts;
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-gcm', CRYPTO_KEY, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        console.warn('⚠️ Error descifrando secreto (posible cambio de clave o texto corrupto):', e.message);
        return null;
    }
}

function maskSecret(plainText) {
    if (!plainText || typeof plainText !== 'string') return '';
    if (plainText.length <= 8) return '••••••••';
    return plainText.substring(0, 4) + '••••••••' + plainText.substring(plainText.length - 4);
}

// ==========================================
// Criptografía de Contraseñas para RBAC (scrypt + salt)
// ==========================================
function hashPassword(plainPassword) {
    if (!plainPassword) return '';
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = crypto.scryptSync(String(plainPassword), salt, 64).toString('hex');
    return `scrypt:${salt}:${derivedKey}`;
}

function verifyPassword(plainPassword, storedHash) {
    if (!plainPassword || !storedHash) return false;
    if (storedHash.startsWith('scrypt:')) {
        try {
            const parts = storedHash.split(':');
            if (parts.length !== 3) return false;
            const [, salt, keyHex] = parts;
            const derivedKey = crypto.scryptSync(String(plainPassword), salt, 64);
            const keyBuffer = Buffer.from(keyHex, 'hex');
            if (derivedKey.length !== keyBuffer.length) return false;
            return crypto.timingSafeEqual(derivedKey, keyBuffer);
        } catch (e) {
            return false;
        }
    }
    // Soporte legacy texto plano si se insertó manualmente en SQL
    return String(plainPassword) === String(storedHash);
}

process.on('uncaughtException', (err) => {
    console.error('🔥 Error no capturado (uncaughtException):', err);
    if (typeof enviarAlertaSistema === 'function') {
        enviarAlertaSistema('UNCAUGHT_EXCEPTION', 'Excepción no capturada en Metal-Uriel', err?.stack || err?.message || String(err)).catch(() => {});
    }
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 Promesa no manejada (unhandledRejection):', reason);
});

const app = express();
app.set('trust proxy', 1); // Necesario detrás de Cloudflare Tunnel / proxy inverso para rate limiting real
app.use(helmet({
    contentSecurityPolicy: false, // Se mantiene desactivado en main por CDN Babel/Tailwind/Chart.js; en v3 Vite se endurece
    crossOriginEmbedderPolicy: false
}));
// CORS inteligente para App Android Capacitor APK, red local LAN y orígenes autorizados
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
        const extraAllowed = String(process.env.CORS_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
        const isAllowed =
            extraAllowed.includes('*') ||
            extraAllowed.includes(origin) ||
            /^(capacitor|ionic):\/\/localhost$/i.test(origin) ||
            /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin) ||
            /^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/i.test(origin);
        if (isAllowed) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Vary', 'Origin');
            res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,X-Hub-Signature-256');
        }
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});
app.use(express.json({
    limit: '25mb',
    verify: (req, _res, buf) => {
        req.rawBody = buf;
    }
}));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads', 'recursos');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
app.use(express.static(path.join(__dirname, 'public')));

// Limitadores de tasa (Anti fuerza bruta y DoS)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 25,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Demasiados intentos de inicio de sesión. Espera 15 minutos.' }
});
const chatLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Límite de mensajes por minuto alcanzado. Intenta de nuevo en unos segundos.' }
});
const webhookLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false
});

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT) || 3000;
let VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'mi_token_secreto_123';
let META_APP_SECRET = process.env.META_APP_SECRET || '';
let WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || '';
let WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';

// Middleware de verificación criptográfica HMAC-SHA256 para Webhooks de Meta WhatsApp
function verifyMetaWebhookSignature(req, res, next) {
    const activeSecret = (META_APP_SECRET && !setupUtils.isPlaceholderValue(META_APP_SECRET)) ? META_APP_SECRET : '';
    const check = securityUtils.verifyMetaSignature(req.rawBody, req.headers['x-hub-signature-256'], activeSecret);
    if (!check.valid) {
        console.warn(`🛡️ [META HMAC BLOQUEADO] ${check.reason} (IP: ${req.ip})`);
        return res.status(401).json({ error: 'Firma X-Hub-Signature-256 inválida.' });
    }
    return next();
}

// ==========================================
// Catálogo de Sedes Oficiales UNID (Nacional)
// ==========================================
const UNID_CAMPUSES = [
    { id: 'campeche', name: 'Campus San Francisco de Campeche', estado: 'Campeche', region: 'Sureste' },
    { id: 'cancun', name: 'Campus Cancún', estado: 'Quintana Roo', region: 'Sureste' },
    { id: 'chetumal', name: 'Campus Chetumal', estado: 'Quintana Roo', region: 'Sureste' },
    { id: 'playa_del_carmen', name: 'Campus Playa del Carmen', estado: 'Quintana Roo', region: 'Sureste' },
    { id: 'cozumel', name: 'Campus Cozumel', estado: 'Quintana Roo', region: 'Sureste' },
    { id: 'merida', name: 'Campus Mérida', estado: 'Yucatán', region: 'Sureste' },
    { id: 'villahermosa', name: 'Campus Villahermosa', estado: 'Tabasco', region: 'Sureste' },
    { id: 'tijuana', name: 'Campus Tijuana', estado: 'Baja California', region: 'Noroeste' },
    { id: 'ensenada', name: 'Campus Ensenada', estado: 'Baja California', region: 'Noroeste' },
    { id: 'guadalajara', name: 'Campus Guadalajara', estado: 'Jalisco', region: 'Occidente' },
    { id: 'zapopan', name: 'Campus Zapopan', estado: 'Jalisco', region: 'Occidente' },
    { id: 'aguascalientes', name: 'Campus Aguascalientes', estado: 'Aguascalientes', region: 'Bajío' },
    { id: 'zacatecas', name: 'Campus Zacatecas', estado: 'Zacatecas', region: 'Norte' },
    { id: 'slp', name: 'Campus San Luis Potosí', estado: 'San Luis Potosí', region: 'Bajío' },
    { id: 'toluca', name: 'Campus Toluca', estado: 'Estado de México', region: 'Centro' },
    { id: 'tlalnepantla', name: 'Campus Tlalnepantla', estado: 'Estado de México', region: 'Centro' },
    { id: 'tejupilco', name: 'Campus Tejupilco', estado: 'Estado de México', region: 'Centro' },
    { id: 'morelia', name: 'Campus Morelia', estado: 'Michoacán', region: 'Occidente' },
    { id: 'uruapan', name: 'Campus Uruapan', estado: 'Michoacán', region: 'Occidente' },
    { id: 'pachuca', name: 'Campus Pachuca', estado: 'Hidalgo', region: 'Centro' },
    { id: 'tampico', name: 'Campus Tampico', estado: 'Tamaulipas', region: 'Noreste' },
    { id: 'durango', name: 'Campus Durango', estado: 'Durango', region: 'Norte' },
    { id: 'online_nacional', name: 'UNID Online (Nacional 100% Virtual)', estado: 'Nacional', region: 'Virtual' }
];

// Configuración de Autenticación JWT (hot-reloadable tras Setup Wizard)
let JWT_SECRET = process.env.JWT_SECRET || 'unid_metal_uriel_jwt_secret_key_2026';
let ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'unid2026';

function isProductionHardened() {
    return process.env.SETUP_COMPLETED === 'true' || process.env.NODE_ENV === 'production';
}

// ==========================================
// 1. Configuración del Pool de MariaDB (mysql2/promise) + Bootstrap Plug & Play
// ==========================================
function createMariaPool() {
    return mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'unid_admisiones',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });
}

let dbPool = createMariaPool();
let isDatabaseReady = false;

async function initializeDatabase(options = {}) {
    const dbHost = process.env.DB_HOST || 'localhost';
    const dbPort = Number(process.env.DB_PORT) || 3306;
    const dbUser = process.env.DB_USER || 'root';
    const dbPassword = process.env.DB_PASSWORD || '';
    const dbName = (process.env.DB_NAME || 'unid_admisiones').replace(/[^a-zA-Z0-9_]/g, '') || 'unid_admisiones';
    const primaryCampus = options.primaryCampus || process.env.PRIMARY_CAMPUS || 'campeche';

    // Paso 0: Crear base de datos automáticamente si aún no existe (Plug & Play sobre MariaDB virgen)
    let bootstrapConn = null;
    try {
        bootstrapConn = await mysql.createConnection({
            host: dbHost,
            port: dbPort,
            user: dbUser,
            password: dbPassword,
            connectTimeout: 8000
        });
        await bootstrapConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        await bootstrapConn.end();
        bootstrapConn = null;
    } catch (bootErr) {
        if (bootstrapConn) { try { await bootstrapConn.end(); } catch (_) {} }
        isDatabaseReady = false;
        console.warn('⚠️ No se pudo conectar/crear la base de datos en MariaDB:', bootErr.message);
        if (options.throwOnError) throw bootErr;
        return { ok: false, error: bootErr.message };
    }

    // Reconstruir pool si se solicitó (por ejemplo, tras Setup Wizard)
    if (options.rebuildPool) {
        try { await dbPool.end(); } catch (_) {}
        dbPool = createMariaPool();
    }

    let connection = null;
    try {
        connection = await dbPool.getConnection();
        console.log(`✅ Conexión exitosa al pool de MariaDB (${dbHost}:${dbPort}/${dbName})`);

        // 1. Crear tabla sedes si no existe
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

        // 2. Poblar sedes base si la tabla está vacía (o actualizar credenciales de sede principal tras wizard)
        try {
            const [sedesCount] = await connection.query('SELECT COUNT(*) as count FROM sedes');
            if (sedesCount[0].count === 0) {
                console.log('🏛️ Inicializando catálogo base de Sedes UNID en MariaDB...');
                for (const campus of UNID_CAMPUSES) {
                    const isPrimary = campus.id === primaryCampus;
                    const encryptedWaToken = isPrimary && WHATSAPP_TOKEN ? encryptSecret(WHATSAPP_TOKEN) : null;
                    const phoneId = isPrimary ? (WHATSAPP_PHONE_NUMBER_ID || null) : null;
                    const email = isPrimary ? (process.env.ADMISSIONS_NOTIFICATION_EMAIL || `admisiones.${campus.id}@unid.mx`) : null;

                    await connection.execute(`
                        INSERT INTO sedes (slug, nombre, estado, region, whatsapp_phone_number_id, whatsapp_token_encrypted, meta_verify_token, email_notificaciones, activa)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
                    `, [campus.id, campus.name, campus.estado, campus.region, phoneId, encryptedWaToken, VERIFY_TOKEN, email]);
                }
            } else if (options.syncPrimaryCampusCreds) {
                const encryptedWaToken = WHATSAPP_TOKEN ? encryptSecret(WHATSAPP_TOKEN) : null;
                await connection.execute(`
                    UPDATE sedes
                    SET whatsapp_phone_number_id = COALESCE(?, whatsapp_phone_number_id),
                        whatsapp_token_encrypted = COALESCE(?, whatsapp_token_encrypted),
                        meta_verify_token = ?,
                        email_notificaciones = COALESCE(?, email_notificaciones)
                    WHERE slug = ?
                `, [
                    WHATSAPP_PHONE_NUMBER_ID || null,
                    encryptedWaToken,
                    VERIFY_TOKEN,
                    process.env.ADMISSIONS_NOTIFICATION_EMAIL || null,
                    primaryCampus
                ]);
            }
        } catch (seedErr) {
            console.warn('⚠️ Error poblando/actualizando sedes iniciales:', seedErr.message);
        }

        // 3. Crear tabla de usuarios RBAC si no existe
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
            if (options.customDevUser && options.customDevUser.correo_institucional) {
                const dev = options.customDevUser;
                const devMat = dev.matricula || dev.correo_institucional.split('@')[0];
                const [existingDev] = await connection.query('SELECT id FROM usuarios WHERE correo_institucional = ? LIMIT 1', [dev.correo_institucional]);
                if (existingDev.length > 0) {
                    if (dev.password) {
                        await connection.execute(
                            'UPDATE usuarios SET nombre_completo = ?, password = ?, rol = "desarrollador", sede_id = NULL, activo = 1 WHERE id = ?',
                            [dev.nombre_completo, hashPassword(dev.password), existingDev[0].id]
                        );
                    }
                } else {
                    await connection.execute(
                        'INSERT INTO usuarios (correo_institucional, nombre_completo, matricula, password, rol, sede_id, activo) VALUES (?, ?, ?, ?, "desarrollador", NULL, 1)',
                        [dev.correo_institucional, dev.nombre_completo, devMat, hashPassword(dev.password)]
                    );
                }
                if (options.customAdminUser && options.customAdminUser.correo_institucional && options.customAdminUser.password) {
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
                    console.log('🔐 Inicializando cuentas RBAC base de desarrollo (Desarrollador, Administrador, Usuario)...');
                    const initialUsers = [
                        {
                            correo: '00774343@red.unid.mx',
                            nombre: 'Luis Felipe Quintero (Desarrollador / Superadmin)',
                            matricula: '00774343',
                            pass: hashPassword('admin'),
                            rol: 'desarrollador',
                            sede: null
                        },
                        {
                            correo: 'admin.campeche@red.unid.mx',
                            nombre: 'Dir. Admisiones Campeche (Administrador Sede)',
                            matricula: '00881122',
                            pass: hashPassword('admin2026'),
                            rol: 'administrador',
                            sede: 'campeche'
                        },
                        {
                            correo: '67676767@red.unid.mx',
                            nombre: 'Lic. Asesor de Admisiones (Operativo)',
                            matricula: '67676767',
                            pass: hashPassword('user'),
                            rol: 'usuario',
                            sede: 'campeche'
                        }
                    ];
                    for (const u of initialUsers) {
                        await connection.execute(`
                            INSERT INTO usuarios (correo_institucional, nombre_completo, matricula, password, rol, sede_id, activo)
                            VALUES (?, ?, ?, ?, ?, ?, 1)
                        `, [u.correo, u.nombre, u.matricula, u.pass, u.rol, u.sede]);
                    }
                }
            }
        } catch (userSeedErr) {
            console.warn('⚠️ Error poblando usuarios RBAC iniciales:', userSeedErr.message);
        }

        // 4. Crear tabla aspirantes y bitacora_notificaciones_correo si no existen (100% Plug & Play sin importar schema.sql a mano!)
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
                INDEX idx_carrera (carrera_interes),
                INDEX idx_campus (campus_interes),
                INDEX idx_ciclo (ciclo_escolar),
                INDEX idx_estado (estado_prospecto),
                INDEX idx_archivado (archivado)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS bitacora_notificaciones_correo (
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
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // 4.5. Migraciones incrementales de las 9 tablas (incluye Telemetría LLM)
        const migrations = [
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
            `ALTER TABLE aspirantes ADD COLUMN IF NOT EXISTS curp VARCHAR(18) NULL`,
            `ALTER TABLE aspirantes ADD COLUMN IF NOT EXISTS aviso_privacidad_aceptado TINYINT(1) DEFAULT 1`,
            `ALTER TABLE aspirantes ADD COLUMN IF NOT EXISTS sede_id VARCHAR(50) NULL DEFAULT 'campeche'`,
            `ALTER TABLE aspirantes MODIFY COLUMN sede_id VARCHAR(50) NULL DEFAULT 'campeche'`,
            `ALTER TABLE aspirantes ADD COLUMN IF NOT EXISTS ciclo_escolar VARCHAR(60) DEFAULT '2026-3 Septiembre'`,
            `ALTER TABLE aspirantes ADD COLUMN IF NOT EXISTS estado_prospecto VARCHAR(50) DEFAULT 'nuevo'`,
            `ALTER TABLE aspirantes ADD COLUMN IF NOT EXISTS nivel_interes VARCHAR(20) DEFAULT 'Alto'`,
            `ALTER TABLE aspirantes ADD COLUMN IF NOT EXISTS resumen_ia TEXT`,
            `ALTER TABLE aspirantes ADD COLUMN IF NOT EXISTS archivado TINYINT(1) DEFAULT 0`,
            `ALTER TABLE aspirantes ADD COLUMN IF NOT EXISTS ultimo_mensaje_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
            `ALTER TABLE aspirantes ADD COLUMN IF NOT EXISTS telefono_canonico VARCHAR(20) NULL`,
            `ALTER TABLE aspirantes ADD COLUMN IF NOT EXISTS conversacion_destacada TINYINT(1) DEFAULT 0`,
            `ALTER TABLE aspirantes ADD COLUMN IF NOT EXISTS fecha_inscripcion TIMESTAMP NULL`,
            `ALTER TABLE aspirantes ADD COLUMN IF NOT EXISTS cerrado_manualmente TINYINT(1) DEFAULT 0`,
            `ALTER TABLE aspirantes ADD COLUMN IF NOT EXISTS cerrado_por VARCHAR(150) NULL`,
            `ALTER TABLE aspirantes ADD COLUMN IF NOT EXISTS notas_asesor TEXT NULL`,
            `CREATE INDEX IF NOT EXISTS idx_aspirantes_tel_canon ON aspirantes (telefono_canonico)`,
            `CREATE TABLE IF NOT EXISTS historial_conversaciones (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                sede_id VARCHAR(50) NULL DEFAULT 'campeche',
                ciclo_escolar VARCHAR(60) DEFAULT '2026-3 Septiembre',
                telefono_celular VARCHAR(30) NOT NULL,
                telefono_canonico VARCHAR(20) NULL,
                rol ENUM('user', 'assistant', 'system', 'human_advisor') NOT NULL,
                remitente_nombre VARCHAR(150) NULL,
                modelo_ia VARCHAR(80) NULL,
                whatsapp_message_id VARCHAR(120) NULL,
                adjunto_json TEXT NULL,
                mensaje TEXT NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_historial_telefono (telefono_celular, timestamp),
                INDEX idx_historial_canon (telefono_canonico, timestamp),
                INDEX idx_historial_sede (sede_id),
                INDEX idx_historial_ciclo (ciclo_escolar)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
            `ALTER TABLE historial_conversaciones ADD COLUMN IF NOT EXISTS ciclo_escolar VARCHAR(60) DEFAULT '2026-3 Septiembre'`,
            `ALTER TABLE historial_conversaciones ADD COLUMN IF NOT EXISTS telefono_canonico VARCHAR(20) NULL`,
            `ALTER TABLE historial_conversaciones ADD COLUMN IF NOT EXISTS remitente_nombre VARCHAR(150) NULL`,
            `ALTER TABLE historial_conversaciones ADD COLUMN IF NOT EXISTS modelo_ia VARCHAR(80) NULL`,
            `ALTER TABLE historial_conversaciones ADD COLUMN IF NOT EXISTS whatsapp_message_id VARCHAR(120) NULL`,
            `ALTER TABLE historial_conversaciones ADD COLUMN IF NOT EXISTS adjunto_json TEXT NULL`,
            `CREATE INDEX IF NOT EXISTS idx_historial_canon ON historial_conversaciones (telefono_canonico, timestamp)`,
            `UPDATE aspirantes SET telefono_canonico = RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(telefono_celular, '+', ''), ' ', ''), '-', ''), '(', ''), 10) WHERE telefono_canonico IS NULL AND telefono_celular IS NOT NULL AND LENGTH(telefono_celular) >= 10`,
            `UPDATE aspirantes SET conversacion_destacada = 1 WHERE estado_prospecto = 'inscrito' AND (conversacion_destacada IS NULL OR conversacion_destacada = 0)`,
            `UPDATE historial_conversaciones SET telefono_canonico = RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(telefono_celular, '+', ''), ' ', ''), '-', ''), '(', ''), 10) WHERE telefono_canonico IS NULL AND telefono_celular IS NOT NULL AND LENGTH(telefono_celular) >= 10`,
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
                tags TEXT NULL,
                scope VARCHAR(80) DEFAULT 'campus_campeche',
                scope_label VARCHAR(150) DEFAULT '🏛️ Campus Campeche (Presencial)',
                tipo_archivo VARCHAR(40) NOT NULL DEFAULT 'pdf',
                url_recurso VARCHAR(500) NULL,
                file_name VARCHAR(200) NULL,
                modalidad VARCHAR(120) DEFAULT 'Presencial & Online',
                duracion VARCHAR(100) DEFAULT '3 años (9 cuatrimestres)',
                rvoe VARCHAR(100) DEFAULT 'SEP-RVOE-OFICIAL',
                tamano VARCHAR(40) DEFAULT '1.2 MB',
                subido_por VARCHAR(150) NULL,
                activo TINYINT(1) DEFAULT 1,
                updated_by VARCHAR(150) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_pool_sede_cat (sede_id, categoria)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
            `ALTER TABLE pool_recursos_multimedia MODIFY COLUMN categoria VARCHAR(80) NOT NULL DEFAULT 'plan_estudios'`,
            `ALTER TABLE pool_recursos_multimedia MODIFY COLUMN tipo_archivo VARCHAR(40) NOT NULL DEFAULT 'pdf'`,
            `ALTER TABLE pool_recursos_multimedia ADD COLUMN IF NOT EXISTS scope VARCHAR(80) DEFAULT 'campus_campeche'`,
            `ALTER TABLE pool_recursos_multimedia ADD COLUMN IF NOT EXISTS scope_label VARCHAR(150) DEFAULT '🏛️ Campus Campeche (Presencial)'`,
            `ALTER TABLE pool_recursos_multimedia ADD COLUMN IF NOT EXISTS subido_por VARCHAR(150) NULL`
        ];

        for (const sql of migrations) {
            try {
                await connection.query(sql);
            } catch (_) {
                try {
                    const cleanSql = sql.replace('IF NOT EXISTS ', '');
                    await connection.query(cleanSql);
                } catch (_) {}
            }
        }

        // 5. Inicializar Ciclo Escolar Activo por defecto si no existe
        try {
            const [cicloRows] = await connection.query('SELECT COUNT(*) as count FROM ciclos_escolares_sede');
            if (cicloRows[0].count === 0) {
                const defaultCiclos = JSON.stringify(['2026-1 Enero', '2026-2 Mayo', '2026-3 Septiembre', '2027-1 Enero']);
                await connection.execute(
                    `INSERT INTO ciclos_escolares_sede (sede_id, ciclo_activo, ciclos_disponibles, updated_by) VALUES ('campeche', '2026-3 Septiembre', ?, 'Sistema')`,
                    [defaultCiclos]
                );
            }
        } catch (_) {}

        // 5.5. Inicializar Categorías base del Pool Multimedia si la tabla está vacía
        try {
            const [catRows] = await connection.query('SELECT COUNT(*) as count FROM pool_categorias');
            if (catRows[0].count === 0) {
                const baseCategories = [
                    { slug: 'plan_estudios', nombre: 'Planes de Estudio', icono: '📚', color: 'amber', descripcion: 'Mallas curriculares y planes de estudio por licenciatura e ingeniería', orden: 1 },
                    { slug: 'oferta_educativa', nombre: 'Oferta Educativa', icono: '🎓', color: 'purple', descripcion: 'Catálogos generales de carreras, modalidades e información académica', orden: 2 },
                    { slug: 'horarios', nombre: 'Horarios de Clase', icono: '🕒', color: 'emerald', descripcion: 'Horarios de clases por periodo escolar y modalidad', orden: 3 },
                    { slug: 'instalaciones', nombre: 'Fotos e Instalaciones', icono: '🏛️', color: 'sky', descripcion: 'Fotografías del campus, cabinas de radio/TV, laboratorios y salas', orden: 4 },
                    { slug: 'becas_costos', nombre: 'Becas y Costos', icono: '💰', color: 'rose', descripcion: 'Convocatorias de becas, colegiaturas, descuentos y financiamiento', orden: 5 }
                ];
                for (const c of baseCategories) {
                    await connection.execute(
                        `INSERT IGNORE INTO pool_categorias (slug, nombre, icono, color, descripcion, orden, activa) VALUES (?, ?, ?, ?, ?, ?, 1)`,
                        [c.slug, c.nombre, c.icono, c.color, c.descripcion, c.orden]
                    );
                }
            }
        } catch (catErr) {
            console.warn('⚠️ Error poblando pool_categorias:', catErr.message);
        }

        // 6. Sembrar Pool Multimedia de Admisiones desde brochures.json + recursos iniciales de horarios/instalaciones/oferta
        try {
            const [poolRows] = await connection.query('SELECT COUNT(*) as count FROM pool_recursos_multimedia');
            if (poolRows[0].count === 0) {
                console.log('📦 Inicializando Pool Multimedia de Admisiones en MariaDB...');
                await seedInitialPoolResources(connection);
            }
            // Reparar enlaces placeholder inexistentes (digitalmedia.talisis.com) para que apunten al generador/archivo real local
            await connection.query(`
                UPDATE pool_recursos_multimedia
                SET url_recurso = CONCAT('/api/brochures/', codigo_recurso, '/download')
                WHERE url_recurso LIKE '%digitalmedia.talisis.com%'
            `);
            await materializeAllPoolPdfsOnDisk(connection);
        } catch (poolErr) {
            console.warn('⚠️ Error poblando pool_recursos_multimedia:', poolErr.message);
        }

        isDatabaseReady = true;
        connection.release();
        return { ok: true };
    } catch (err) {
        if (connection) { try { connection.release(); } catch (_) {} }
        isDatabaseReady = false;
        console.warn('⚠️ No se pudo conectar a MariaDB (asegúrate de que el servicio esté corriendo):', err.message);
        if (options.throwOnError) throw err;
        return { ok: false, error: err.message };
    }
}

// Ejecutar auto-inicialización al arranque sin tumbar Express si MariaDB aún no está configurado
if (process.env.NODE_ENV !== 'test') {
    initializeDatabase();
}

// ==========================================
// 1.5. Algoritmo Oficial de Generación de CURP (RENAPO)
// ==========================================
function generarCurp(datos) {
    if (!datos) return null;
    const { nombre_completo, fecha_nacimiento, sexo, estado_nacimiento } = datos;
    if (!nombre_completo || !fecha_nacimiento) return null;

    const normalize = (str) => {
        if (!str) return '';
        return String(str)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .trim();
    };

    const ESTADOS = {
        'AGUASCALIENTES': 'AS', 'BAJA CALIFORNIA SUR': 'BS', 'BAJA CALIFORNIA': 'BC',
        'CAMPECHE': 'CC', 'COAHUILA': 'CL', 'COLIMA': 'CM', 'CHIAPAS': 'CS',
        'CHIHUAHUA': 'CH', 'CIUDAD DE MEXICO': 'DF', 'CDMX': 'DF', 'DISTRITO FEDERAL': 'DF',
        'DURANGO': 'DG', 'GUANAJUATO': 'GT', 'GUERRERO': 'GR', 'HIDALGO': 'HG',
        'JALISCO': 'JC', 'ESTADO DE MEXICO': 'MC', 'MEXICO': 'MC', 'EDOMEX': 'MC',
        'MICHOACAN': 'MN', 'MORELOS': 'MS', 'NAYARIT': 'NT', 'NUEVO LEON': 'NL',
        'OAXACA': 'OC', 'PUEBLA': 'PL', 'QUERETARO': 'QT', 'QUINTANA ROO': 'QR',
        'SAN LUIS POTOSI': 'SP', 'SINALOA': 'SL', 'SONORA': 'SR', 'TABASCO': 'TC',
        'TAMAULIPAS': 'TS', 'TLAXCALA': 'TL', 'VERACRUZ': 'VZ', 'YUCATAN': 'YN',
        'ZACATECAS': 'ZS', 'EXTRANJERO': 'NE', 'FORANEO': 'NE'
    };

    const PALABRAS_INCONVENIENTES = [
        'BACA', 'BACO', 'BUEI', 'BUEY', 'CACA', 'CACO', 'CAGA', 'CAGO', 'CAKA', 'CAKO',
        'COGE', 'COGI', 'COJA', 'COJE', 'COJI', 'COJO', 'COLA', 'CULO', 'FALO', 'FETO',
        'GETA', 'GUEI', 'GUEY', 'JETA', 'JOTO', 'KACA', 'KACO', 'KAGA', 'KAGO', 'KAKA',
        'KAKO', 'KOGE', 'KOGI', 'KOJA', 'KOJE', 'KOJI', 'KOJO', 'KOLA', 'KULO', 'LILO',
        'LOCA', 'LOCO', 'LOKA', 'LOKO', 'MAME', 'MAMO', 'MEAR', 'MEAS', 'MEON', 'MIAR',
        'MION', 'MOCO', 'MOKO', 'MULA', 'MULO', 'NADA', 'PEDA', 'PEDO', 'PENE', 'PIPI',
        'PITO', 'POPO', 'PUTA', 'PUTO', 'QULO', 'RATA', 'ROBA', 'ROBE', 'ROBO', 'RUIN',
        'SENO', 'TETA', 'VACA', 'VACO', 'VAGA', 'VAGO', 'VUEI', 'VUEY', 'WUEI', 'WUEY'
    ];

    const PREPOSICIONES = ['DE', 'DEL', 'DE LA', 'DE LOS', 'DE LAS', 'LA', 'LAS', 'LOS', 'Y', 'MC', 'MAC', 'VON', 'VAN'];

    let cleanName = normalize(nombre_completo);
    PREPOSICIONES.forEach(prep => {
        const regex = new RegExp('(^|\\s)' + prep + '(\\s|$)', 'gi');
        cleanName = cleanName.replace(regex, ' ').replace(/\s+/g, ' ').trim();
    });

    const parts = cleanName.split(' ').filter(p => p.length > 0);
    if (parts.length === 0) return null;

    let nombres = '', paterno = '', materno = '';
    if (parts.length === 1) {
        paterno = parts[0];
        nombres = parts[0];
    } else if (parts.length === 2) {
        nombres = parts[0];
        paterno = parts[1];
    } else if (parts.length === 3) {
        nombres = parts[0];
        paterno = parts[1];
        materno = parts[2];
    } else {
        nombres = parts.slice(0, parts.length - 2).join(' ');
        paterno = parts[parts.length - 2];
        materno = parts[parts.length - 1];
    }

    const nombreParts = nombres.split(' ');
    let primerNombre = nombreParts[0];
    if (nombreParts.length > 1 && (primerNombre === 'JOSE' || primerNombre === 'MARIA' || primerNombre === 'MA' || primerNombre === 'J')) {
        primerNombre = nombreParts[1];
    }

    const getFirstLetter = (str) => {
        if (!str || str.length === 0) return 'X';
        const char = str.charAt(0);
        return char === 'Ñ' ? 'X' : char;
    };

    const getFirstInternalVowel = (str) => {
        if (!str || str.length < 2) return 'X';
        for (let i = 1; i < str.length; i++) {
            if ('AEIOU'.includes(str.charAt(i))) return str.charAt(i);
        }
        return 'X';
    };

    const getFirstInternalConsonant = (str) => {
        if (!str || str.length < 2) return 'X';
        for (let i = 1; i < str.length; i++) {
            const char = str.charAt(i);
            if (!'AEIOU'.includes(char) && /[A-ZÑ]/.test(char)) {
                return char === 'Ñ' ? 'X' : char;
            }
        }
        return 'X';
    };

    // 1-4: Iniciales
    let l1 = getFirstLetter(paterno);
    let l2 = getFirstInternalVowel(paterno);
    let l3 = getFirstLetter(materno);
    let l4 = getFirstLetter(primerNombre);

    let iniciales = `${l1}${l2}${l3}${l4}`;
    if (PALABRAS_INCONVENIENTES.includes(iniciales)) {
        iniciales = `${l1}X${l3}${l4}`;
    }

    // 5-10: Fecha de nacimiento (YYMMDD)
    let fechaRaw = String(fecha_nacimiento).trim();
    let year = '00', month = '01', day = '01';
    let fullYear = 2000;

    const isoMatch = fechaRaw.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    const ddmmyyyyMatch = fechaRaw.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);

    if (isoMatch) {
        fullYear = parseInt(isoMatch[1], 10);
        year = isoMatch[1].slice(-2);
        month = isoMatch[2].padStart(2, '0');
        day = isoMatch[3].padStart(2, '0');
    } else if (ddmmyyyyMatch) {
        fullYear = parseInt(ddmmyyyyMatch[3], 10);
        year = ddmmyyyyMatch[3].slice(-2);
        month = ddmmyyyyMatch[2].padStart(2, '0');
        day = ddmmyyyyMatch[1].padStart(2, '0');
    }

    const fechaCurp = `${year}${month}${day}`;

    // 11: Sexo (H/M/X)
    let sexoChar = 'H';
    const sNorm = normalize(sexo);
    if (sNorm.includes('FEM') || sNorm.includes('MUJER') || sNorm === 'M' || sNorm === 'F') {
        sexoChar = 'M';
    } else if (sNorm.includes('MAS') || sNorm.includes('HOMBRE') || sNorm === 'H') {
        sexoChar = 'H';
    } else {
        sexoChar = 'X';
    }

    // 12-13: Estado
    let estadoCode = 'CC';
    const eNorm = normalize(estado_nacimiento);
    for (const [key, code] of Object.entries(ESTADOS)) {
        if (eNorm.includes(key) || key.includes(eNorm)) {
            estadoCode = code;
            break;
        }
    }

    // 14-16: Consonantes internas
    const c1 = getFirstInternalConsonant(paterno);
    const c2 = getFirstInternalConsonant(materno);
    const c3 = getFirstInternalConsonant(primerNombre);

    // 17: Carácter del siglo (0-9 para < 2000, A-Z para >= 2000)
    const sigloChar = fullYear >= 2000 ? 'A' : '0';

    const curp17 = `${iniciales}${fechaCurp}${sexoChar}${estadoCode}${c1}${c2}${c3}${sigloChar}`;

    // 18: Dígito verificador oficial RENAPO
    const diccionario = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';
    let suma = 0;
    for (let i = 0; i < 17; i++) {
        const char = curp17.charAt(i);
        const valor = diccionario.indexOf(char);
        suma += (valor >= 0 ? valor : 0) * (18 - i);
    }
    const digitoVerificador = (10 - (suma % 10)) % 10;

    return `${curp17}${digitoVerificador}`;
}

// ==========================================
// 2. Catálogo Oficial Dinámico de Folletos y Planes de Estudio UNID
// ==========================================
const BROCHURES_FILE_PATH = path.join(__dirname, 'brochures.json');
let UNID_BROCHURES = [];

function loadBrochuresFromDisk() {
    try {
        if (fs.existsSync(BROCHURES_FILE_PATH)) {
            const raw = fs.readFileSync(BROCHURES_FILE_PATH, 'utf-8');
            UNID_BROCHURES = JSON.parse(raw);
            console.log(`📚 [FOLLETOS] ${UNID_BROCHURES.length} planes de estudio cargados desde brochures.json`);
        }
    } catch (e) {
        console.warn('⚠️ Error leyendo brochures.json:', e.message);
    }
}

function saveBrochuresToDisk() {
    try {
        fs.writeFileSync(BROCHURES_FILE_PATH, JSON.stringify(UNID_BROCHURES, null, 2), 'utf-8');
    } catch (e) {
        console.error('Error guardando brochures.json:', e);
    }
}

loadBrochuresFromDisk();

// Memoria en caché del Ciclo Escolar Activo por sede
const activeSchoolCyclesMemory = new Map([['campeche', '2026-3 Septiembre']]);

async function getActiveCicloEscolar(sedeId = 'campeche') {
    const cleanSede = sedeId || 'campeche';
    try {
        const [rows] = await dbPool.query('SELECT ciclo_activo FROM ciclos_escolares_sede WHERE sede_id = ? LIMIT 1', [cleanSede]);
        if (rows.length > 0 && rows[0].ciclo_activo) {
            activeSchoolCyclesMemory.set(cleanSede, rows[0].ciclo_activo);
            return rows[0].ciclo_activo;
        }
    } catch (_) {}
    return activeSchoolCyclesMemory.get(cleanSede) || '2026-3 Septiembre';
}

// Sembrar recursos iniciales del Pool Multimedia en MariaDB (Planes de Estudio, Oferta Educativa, Horarios e Instalaciones)
async function seedInitialPoolResources(connection) {
    // 1. Migrar todos los folletos de UNID_BROCHURES al Pool Multimedia
    for (const b of UNID_BROCHURES) {
        const cat = b.id === 'becas' ? 'becas_costos' : 'plan_estudios';
        const tagsStr = Array.isArray(b.tags) ? b.tags.join(', ') : String(b.tags || b.id);
        const descIa = b.id === 'becas'
            ? `Guía oficial de becas académicas (hasta 50%), descuentos de inscripción (90%) y financiamiento educativo UNID.`
            : `Plan de estudios oficial de ${b.carrera}. Modalidad: ${b.modalidad}. Duración: ${b.duracion}. Reconocimiento SEP: ${b.rvoe}. Incluye mapa curricular por cuatrimestre y Estadía Empresarial.`;

        await connection.execute(`
            INSERT IGNORE INTO pool_recursos_multimedia (
                codigo_recurso, sede_id, ciclo_escolar, categoria, titulo, descripcion_ia,
                tags, tipo_archivo, url_recurso, file_name, modalidad, duracion, rvoe, tamano, activo, updated_by
            ) VALUES (?, 'campeche', '2026-3 Septiembre', ?, ?, ?, ?, 'pdf', ?, ?, ?, ?, ?, ?, 1, 'Sistema UNID')
        `, [
            b.id,
            cat,
            b.carrera,
            descIa,
            tagsStr,
            b.pdfUrl || `/api/brochures/${b.id}/download`,
            b.fileName || `Plan_${b.id}.pdf`,
            b.modalidad || 'Presencial & Online',
            b.duracion || '3 años (9 cuatrimestres)',
            b.rvoe || 'SEP-RVOE-OFICIAL',
            b.size || '1.3 MB'
        ]);
    }

    // 2. Recursos adicionales de Oferta Educativa, Horarios de Clase e Instalaciones del Campus
    const extraResources = [
        {
            codigo_recurso: 'oferta_educativa_campeche_2026',
            categoria: 'oferta_educativa',
            titulo: 'Catálogo General de Oferta Educativa UNID Campeche 2026',
            descripcion_ia: 'Resumen completo de las 14 licenciaturas e ingenierías en Campus Campeche (Presencial, Ejecutiva Sabatina y UNID Online Nacional), duración de 3 años (9 cuatrimestres) y Modelo Dual.',
            tags: 'oferta educativa, carreras, licenciaturas, ingenierias, catalogo, todas las carreras, que carreras tienen',
            tipo_archivo: 'pdf',
            url_recurso: '/api/brochures/software/download',
            file_name: 'Oferta_Educativa_UNID_Campeche_2026.pdf',
            modalidad: 'Presencial, Ejecutiva y Online',
            duracion: '3 años (9 cuatrimestres)',
            rvoe: 'Validez Oficial SEP',
            tamano: '2.0 MB'
        },
        {
            codigo_recurso: 'horarios_clases_presencial_2026',
            categoria: 'horarios',
            titulo: 'Horarios de Clases 1er Cuatrimestre (Escolarizado Matutino y Ejecutivo)',
            descripcion_ia: 'Horarios oficiales del ciclo activo: Modalidad Presencial Escolarizada de lunes a viernes (07:00 a 14:00 hrs) y Modalidad Ejecutiva Sabatina (08:00 a 16:00 hrs + plataforma digital). Actualizado por Coordinación Académica.',
            tags: 'horarios, horario de clases, turnos, matutino, vespertino, sabatino, a que hora, dias de clase',
            tipo_archivo: 'pdf',
            url_recurso: '/api/brochures/administracion_empresarial/download',
            file_name: 'Horarios_Clases_UNID_2026_3.pdf',
            modalidad: 'Presencial & Ejecutiva',
            duracion: 'Ciclo 2026-3 Septiembre',
            rvoe: 'Coordinación Académica UNID',
            tamano: '950 KB'
        },
        {
            codigo_recurso: 'instalaciones_cabina_comunicacion_mac',
            categoria: 'instalaciones',
            titulo: 'Instalaciones: Cabina de Radio/TV, Laboratorio Mac y Sala de Juicios Orales',
            descripcion_ia: 'Galería y ficha técnica de instalaciones del Campus Campeche: Estudio de Televisión y Cabina de Radio para Ciencias de la Comunicación, Centro de Cómputo y Diseño Digital, Sala de Juicios Orales para Derecho y áreas deportivas.',
            tags: 'instalaciones, fotos, campus, laboratorios, cabina de radio, television, sala de juicios orales, salones, cafeteria',
            tipo_archivo: 'imagen',
            url_recurso: 'https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&w=1000&q=80',
            file_name: 'Instalaciones_Campus_UNID_Campeche.jpg',
            modalidad: 'Campus San Francisco de Campeche',
            duracion: 'Recorrido Visual',
            rvoe: 'Infraestructura UNID',
            tamano: '1.1 MB'
        }
    ];

    for (const r of extraResources) {
        await connection.execute(`
            INSERT IGNORE INTO pool_recursos_multimedia (
                codigo_recurso, sede_id, ciclo_escolar, categoria, titulo, descripcion_ia,
                tags, tipo_archivo, url_recurso, file_name, modalidad, duracion, rvoe, tamano, activo, updated_by
            ) VALUES (?, 'campeche', '2026-3 Septiembre', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'Coordinación UNID')
        `, [
            r.codigo_recurso, r.categoria, r.titulo, r.descripcion_ia, r.tags,
            r.tipo_archivo, r.url_recurso, r.file_name, r.modalidad, r.duracion, r.rvoe, r.tamano
        ]);
    }
}

// Generador de PDF binario oficial UNID con tabla xref de offsets exactos (100% compatible con WhatsApp, Chrome y Adobe)
function generateOfficialPdfBuffer(resource = {}) {
    const cleanPdfText = (str) => String(str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[()\\]/g, '')
        .replace(/[^\x20-\x7E]/g, ' ')
        .trim();

    const title = cleanPdfText(resource.titulo || resource.carrera || resource.title || 'Plan de Estudios Oficial UNID');
    const mod = cleanPdfText(resource.modalidad || 'Presencial Campus Campeche & Online');
    const dur = cleanPdfText(resource.duracion || '3 anos - 9 cuatrimestres');
    const rvoe = cleanPdfText(resource.rvoe || 'SEP-RVOE-OFICIAL');
    const ciclo = cleanPdfText(resource.ciclo_escolar || 'Ciclo Escolar 2026-3 Septiembre');
    const rawDesc = cleanPdfText(
        resource.descripcion_ia ||
        `Formacion profesional con validez oficial SEP, modelo educativo orientado a la practica e inmersion laboral mediante Estadia Empresarial en organizaciones lideres.`
    );

    // Dividir la descripción en líneas de máximo 74 caracteres para el stream PDF
    const wrapLine = (text, maxLen = 74) => {
        const words = text.split(/\s+/);
        const lines = [];
        let current = '';
        for (const w of words) {
            if ((current + ' ' + w).trim().length > maxLen) {
                if (current) lines.push(current);
                current = w;
            } else {
                current = (current ? current + ' ' : '') + w;
            }
        }
        if (current) lines.push(current);
        return lines.slice(0, 4);
    };

    const descLines = wrapLine(rawDesc, 72);
    const titleLines = wrapLine(title, 56);

    const streamOps = [
        'q',
        '0.04 0.10 0.18 rg',
        '0 700 612 92 re f',
        '1.0 0.78 0.17 rg',
        '0 694 612 6 re f',
        'BT',
        '/F1 18 Tf',
        '1 1 1 rg',
        '45 752 Td',
        '(:UNID TALISIS - CAMPUS SAN FRANCISCO DE CAMPECHE) Tj',
        '0 -24 Td',
        '/F1 12 Tf',
        '1.0 0.78 0.17 rg',
        `(DOCUMENTO OFICIAL DE ADMISIONES • ${ciclo.toUpperCase()}) Tj`,
        'ET',
        'BT',
        '0.07 0.12 0.20 rg',
        '/F1 15 Tf',
        '45 650 Td'
    ];

    titleLines.forEach((tLine, idx) => {
        if (idx > 0) streamOps.push('0 -20 Td');
        streamOps.push(`(${tLine}) Tj`);
    });

    streamOps.push(
        '0 -28 Td',
        '/F1 11 Tf',
        '0.15 0.25 0.38 rg',
        `(Modalidad: ${mod}) Tj`,
        '0 -18 Td',
        `(Duracion del Programa: ${dur}) Tj`,
        '0 -18 Td',
        `(Reconocimiento Oficial: ${rvoe}) Tj`,
        '0 -32 Td',
        '/F1 13 Tf',
        '0.04 0.10 0.18 rg',
        '(RESUMEN EJECUTIVO Y PERFIL DEL PROGRAMA) Tj',
        '0 -20 Td',
        '/F2 10.5 Tf',
        '0.20 0.25 0.33 rg'
    );

    descLines.forEach((dLine) => {
        streamOps.push(`(${dLine}) Tj`);
        streamOps.push('0 -16 Td');
    });

    streamOps.push(
        '0 -16 Td',
        '/F1 13 Tf',
        '0.04 0.10 0.18 rg',
        '(ESTRUCTURA CURRICULAR CUATRIMESTRAL UNID) Tj',
        '0 -22 Td',
        '/F2 10.5 Tf',
        '0.15 0.20 0.28 rg',
        '(• 1er a 3er Cuatrimestre: Tronco Comun Universitario, Competencias Digitales yValores.) Tj',
        '0 -18 Td',
        '(• 4to a 5to Cuatrimestre: Bloques de Especialidad Profesional y Laboratorios Practicos.) Tj',
        '0 -18 Td',
        '(• 6to Cuatrimestre: Estadia Empresarial de 480 horas en Empresas e Instituciones Lideres.) Tj',
        '0 -18 Td',
        '(• 7mo a 9no Cuatrimestre: Alta Direccion, Proyecto Integrador y Titulacion Automatica.) Tj',
        '0 -32 Td',
        '/F1 13 Tf',
        '0.04 0.10 0.18 rg',
        '(REQUISITOS DE ADMISION E INSCRIPCION) Tj',
        '0 -22 Td',
        '/F2 10.5 Tf',
        '0.15 0.20 0.28 rg',
        '(1. Acta de Nacimiento original y copia certificada.) Tj',
        '0 -18 Td',
        '(2. Certificado Total de Bachillerato o Constancia de Estudios con calificaciones.) Tj',
        '0 -18 Td',
        '(3. Clave Unica de Registro de Poblacion - CURP actualizada.) Tj',
        '0 -18 Td',
        '(4. Comprobante de domicilio reciente y 4 fotografias tamano infantil B/N.) Tj',
        '0 -34 Td',
        '/F1 11 Tf',
        '0.04 0.36 0.29 rg',
        '(Atencion Oficial WhatsApp UNID Campeche: Metal-Uriel • Admisiones 2026) Tj',
        'ET',
        'Q'
    );

    const streamContent = streamOps.join('\n');
    const streamByteLen = Buffer.byteLength(streamContent, 'utf8');

    const objects = [
        `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`,
        `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`,
        `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n`,
        `4 0 obj\n<< /Length ${streamByteLen} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
        `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`,
        `6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`
    ];

    let pdfBody = '%PDF-1.4\n';
    const offsets = [];
    for (const objStr of objects) {
        offsets.push(Buffer.byteLength(pdfBody, 'utf8'));
        pdfBody += objStr;
    }

    const xrefStart = Buffer.byteLength(pdfBody, 'utf8');
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) {
        xref += `${String(off).padStart(10, '0')} 00000 n \n`;
    }
    xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

    return Buffer.from(pdfBody + xref, 'utf8');
}

// Materializar físicamente en /public/uploads/recursos/ todos los PDFs del catálogo para que existan en disco
async function materializeAllPoolPdfsOnDisk(connection = null) {
    try {
        for (const b of UNID_BROCHURES) {
            const safeFile = b.fileName || `Plan_${b.id}.pdf`;
            const diskPath = path.join(UPLOADS_DIR, safeFile);
            if (!fs.existsSync(diskPath)) {
                fs.writeFileSync(diskPath, generateOfficialPdfBuffer(b));
            }
        }
        const queryTarget = connection || dbPool;
        const [rows] = await queryTarget.query('SELECT * FROM pool_recursos_multimedia WHERE tipo_archivo = "pdf"');
        for (const r of rows) {
            const safeFile = r.file_name || `Recurso_${r.codigo_recurso}.pdf`;
            const diskPath = path.join(UPLOADS_DIR, safeFile);
            if (!fs.existsSync(diskPath)) {
                fs.writeFileSync(diskPath, generateOfficialPdfBuffer(r));
            }
        }
    } catch (err) {
        console.warn('⚠️ Advertencia materializando PDFs en disco:', err.message);
    }
}

// Función para sembrar prospectos profesionales de demostración (bajo demanda del Desarrollador)
async function seedDemoLeads(connection) {
    const cicloActivo = await getActiveCicloEscolar('campeche');
    const demoLeads = [
        {
            nombre_completo: 'Carlos Alpuche Canul',
            fecha_nacimiento: '2004-05-15',
            sexo: 'Masculino',
            estado_nacimiento: 'Campeche',
            telefono_celular: '9811234567',
            correo_electronico: 'carlos.alpuche@gmail.com',
            bachillerato_procedencia: 'COBACAM Plantel 01 Campeche',
            carrera_interes: 'Licenciatura en Derecho',
            direccion: 'Calle 12 #45 Col. Centro',
            codigo_postal: '24000',
            campus_interes: 'San Francisco de Campeche',
            modalidad_estudios: 'Presencial',
            es_foraneo: 0,
            estado_prospecto: 'inscrito',
            nivel_interes: 'Alto',
            resumen_ia: 'Aspirante local muy entusiasta con promedio destacado en COBACAM; ya agendó entrega de documentos presencial.'
        },
        {
            nombre_completo: 'Valeria Méndez Cruz',
            fecha_nacimiento: '2003-11-20',
            sexo: 'Femenino',
            estado_nacimiento: 'Tabasco',
            telefono_celular: '9931238899',
            correo_electronico: 'valeria.mendez@outlook.com',
            bachillerato_procedencia: 'CBTIS 32 Villahermosa',
            carrera_interes: 'Licenciatura en Diseño Gráfico Digital',
            direccion: 'Calle Juárez 302, Col. Centro',
            codigo_postal: '86000',
            campus_interes: 'San Francisco de Campeche (Virtual)',
            modalidad_estudios: 'Licenciaturas Online',
            es_foraneo: 1,
            estado_prospecto: 'en_proceso',
            nivel_interes: 'Alto',
            resumen_ia: 'Aspirante foránea de Villahermosa; aceptó con entusiasmo la modalidad 100% online por motivos laborales.'
        },
        {
            nombre_completo: 'Roberto Emiliano Gómez Pech',
            fecha_nacimiento: '2004-02-10',
            sexo: 'Masculino',
            estado_nacimiento: 'Yucatán',
            telefono_celular: '9992345678',
            correo_electronico: 'roberto.gomez@gmail.com',
            bachillerato_procedencia: 'Preparatoria Estatal #8 Mérida',
            carrera_interes: 'Ingeniería en Sistemas y Tecnologías de Información',
            direccion: 'Calle 60 #102 Col. Alcalá Martín',
            codigo_postal: '97050',
            campus_interes: 'San Francisco de Campeche (Virtual)',
            modalidad_estudios: 'Licenciaturas Online',
            es_foraneo: 1,
            estado_prospecto: 'contactado',
            nivel_interes: 'Alto',
            resumen_ia: 'Trabaja como técnico de soporte; solicitó plan de estudios de Ingeniería en Software y beca por promedio.'
        },
        {
            nombre_completo: 'Mariana Isabel Castillo Ramos',
            fecha_nacimiento: '2004-08-30',
            sexo: 'Femenino',
            estado_nacimiento: 'Campeche',
            telefono_celular: '9818812233',
            correo_electronico: 'mariana.castillo@hotmail.com',
            bachillerato_procedencia: 'Colegio Cumbres Campeche',
            carrera_interes: 'Licenciatura en Administración y Gestión Empresarial',
            direccion: 'Av. Resurgimiento 204',
            codigo_postal: '24030',
            campus_interes: 'San Francisco de Campeche',
            modalidad_estudios: 'Presencial',
            es_foraneo: 0,
            estado_prospecto: 'nuevo',
            nivel_interes: 'Medio',
            resumen_ia: 'Interesada en turno matutino; está comparando costos con otra universidad local.'
        },
        {
            nombre_completo: 'Alejandro Morales Fuentes',
            fecha_nacimiento: '2003-04-12',
            sexo: 'Masculino',
            estado_nacimiento: 'Veracruz',
            telefono_celular: '2291445566',
            correo_electronico: 'alejandro.morales@gmail.com',
            bachillerato_procedencia: 'COBAEV Plantel 62 Veracruz',
            carrera_interes: 'Licenciatura en Psicología Organizacional',
            direccion: 'Calle Zaragoza 450',
            codigo_postal: '91700',
            campus_interes: 'San Francisco de Campeche (Virtual)',
            modalidad_estudios: 'Licenciaturas Online',
            es_foraneo: 1,
            estado_prospecto: 'nuevo',
            nivel_interes: 'Alto',
            resumen_ia: 'Aspirante foráneo interesado en el área de Recursos Humanos; solicitó plan cuatrimestral flexible.'
        }
    ];

    for (const lead of demoLeads) {
        lead.curp = generarCurp(lead);
        await connection.execute(`
            INSERT INTO aspirantes (
                sede_id, ciclo_escolar, curp, nombre_completo, fecha_nacimiento, sexo, estado_nacimiento,
                telefono_celular, correo_electronico, bachillerato_procedencia,
                carrera_interes, direccion, codigo_postal, campus_interes,
                modalidad_estudios, es_foraneo, latitud, longitud, raw_json_data, 
                estado_prospecto, nivel_interes, resumen_ia
            ) VALUES ('campeche', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            cicloActivo, lead.curp, lead.nombre_completo, lead.fecha_nacimiento, lead.sexo, lead.estado_nacimiento,
            lead.telefono_celular, lead.correo_electronico, lead.bachillerato_procedencia,
            lead.carrera_interes, lead.direccion, lead.codigo_postal, lead.campus_interes,
            lead.modalidad_estudios, lead.es_foraneo, null, null, JSON.stringify(lead),
            lead.estado_prospecto, lead.nivel_interes, lead.resumen_ia
        ]);
    }
}

// ==========================================
// 3. Inicialización Multi-Proveedor y Circuit Breaker (Cooldown)
// ==========================================

// Validación de API Keys configuradas (no vacías y no placeholders)
function isValidApiKey(key) {
    return Boolean(key && key.trim().length > 8 && !setupUtils.isPlaceholderValue(key));
}

function isOllamaConfigured() {
    return (
        String(process.env.OLLAMA_ENABLED || '').toLowerCase() === 'true' &&
        Boolean(process.env.OLLAMA_BASE_URL && process.env.OLLAMA_BASE_URL.trim().startsWith('http')) &&
        Boolean(process.env.OLLAMA_MODEL && process.env.OLLAMA_MODEL.trim().length >= 2)
    );
}

// Clientes de IA (hot-reloadables tras Setup Wizard)
let geminiClient = null;
let anthropicClient = null;
let openaiClient = null;
let deepseekClient = null;
let groqClient = null;

function initAiClients() {
    geminiClient = null;
    anthropicClient = null;
    openaiClient = null;
    deepseekClient = null;
    groqClient = null;

    if (isValidApiKey(process.env.GEMINI_API_KEY)) {
        geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY.trim() });
        console.log('✨ [AI PROVIDER] Google Gemini activado.');
    }
    if (isValidApiKey(process.env.ANTHROPIC_API_KEY)) {
        anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY.trim() });
        console.log('🔮 [AI PROVIDER] Anthropic Claude activado.');
    }
    if (isValidApiKey(process.env.OPENAI_API_KEY)) {
        openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY.trim() });
        console.log('🤖 [AI PROVIDER] OpenAI activado.');
    }
    if (isValidApiKey(process.env.DEEPSEEK_API_KEY)) {
        deepseekClient = new OpenAI({
            apiKey: process.env.DEEPSEEK_API_KEY.trim(),
            baseURL: 'https://api.deepseek.com'
        });
        console.log('🐳 [AI PROVIDER] DeepSeek activado.');
    }
    if (isValidApiKey(process.env.GROQ_API_KEY)) {
        groqClient = new OpenAI({
            apiKey: process.env.GROQ_API_KEY.trim(),
            baseURL: 'https://api.groq.com/openai/v1'
        });
        console.log('⚡ [AI PROVIDER] Groq Llama activado.');
    }
    if (isOllamaConfigured()) {
        console.log(`🦙 [AI PROVIDER] Ollama Local habilitado como último recurso (${process.env.OLLAMA_BASE_URL} | modelo: ${process.env.OLLAMA_MODEL}).`);
    }
}

initAiClients();

function reloadRuntimeConfig() {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        const parsed = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
        for (const [k, v] of Object.entries(parsed)) {
            process.env[k] = v;
        }
    }
    ENCRYPTION_MASTER_KEY = process.env.ENCRYPTION_MASTER_KEY || process.env.JWT_SECRET || 'unid_metal_uriel_saas_encryption_key_2026';
    CRYPTO_KEY = crypto.createHash('sha256').update(ENCRYPTION_MASTER_KEY).digest();
    JWT_SECRET = process.env.JWT_SECRET || 'unid_metal_uriel_jwt_secret_key_2026';
    VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'mi_token_secreto_123';
    META_APP_SECRET = process.env.META_APP_SECRET || '';
    WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || '';
    WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
    ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
    ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'unid2026';
    globalActiveModelId = process.env.DEFAULT_AI_MODEL || 'auto-fallback';
    providerCooldowns.clear();
    initAiClients();
    // Actualizar nombre dinámico del modelo Ollama en catálogo
    const ollamaEntry = ALL_SUPPORTED_MODELS.find(m => m.provider === 'ollama');
    if (ollamaEntry) {
        const oModel = (process.env.OLLAMA_MODEL || 'qwen2.5:3b').trim();
        ollamaEntry.name = `Ollama Local (${oModel})`;
        ollamaEntry.isConfigured = isOllamaConfigured();
    }
}

// Catálogo Completo de Modelos Soportados
const ALL_SUPPORTED_MODELS = [
    {
        id: 'auto-fallback',
        name: '🛡️ Cascada Inteligente (Alta Disponibilidad)',
        provider: 'auto',
        providerName: 'Auto-Fallback',
        icon: '🛡️',
        badge: 'Recomendado',
        description: 'Enruta automáticamente al mejor modelo disponible. Si uno agota su cuota (429/403), salta en milisegundos al siguiente sin interrupciones.',
        isConfigured: true
    },
    // Google Gemini (Versiones Comerciales Oficiales Google GenAI SDK)
    {
        id: 'gemini-3.8-flash',
        name: 'Google Gemini 3.8 Flash',
        provider: 'google',
        providerName: 'Google Gemini',
        icon: '⚡',
        badge: 'Estándar Oficial',
        description: 'Motor cognitivo principal de última generación, baja latencia y alta comprensión contextual.',
        isConfigured: isValidApiKey(process.env.GEMINI_API_KEY)
    },
    {
        id: 'gemini-3.5-flash-lite',
        name: 'Google Gemini 3.5 Flash Lite',
        provider: 'google',
        providerName: 'Google Gemini',
        icon: '✨',
        badge: 'Ultra Rápido',
        description: 'Ultra rápido y de alta capacidad de cuota para atención masiva en WhatsApp.',
        isConfigured: isValidApiKey(process.env.GEMINI_API_KEY)
    },
    {
        id: 'gemini-4-argon',
        name: 'Google Gemini 4 Argon',
        provider: 'google',
        providerName: 'Google Gemini',
        icon: '🧠',
        badge: 'Avanzado',
        description: 'Máxima capacidad de razonamiento lógico institucional de frontera.',
        isConfigured: isValidApiKey(process.env.GEMINI_API_KEY)
    },
    // Anthropic Claude
    {
        id: 'claude-3-5-haiku-20241022',
        name: 'Anthropic Claude 3.5 Haiku',
        provider: 'anthropic',
        providerName: 'Anthropic Claude',
        icon: '🔮',
        badge: 'Económico',
        description: 'Modelo veloz de Anthropic con excelente fluidez en español.',
        isConfigured: isValidApiKey(process.env.ANTHROPIC_API_KEY)
    },
    {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Anthropic Claude 3.5 Sonnet',
        provider: 'anthropic',
        providerName: 'Anthropic Claude',
        icon: '💎',
        badge: 'Premium',
        description: 'Líder en razonamiento y generación estructurada de JSON.',
        isConfigured: isValidApiKey(process.env.ANTHROPIC_API_KEY)
    },
    // OpenAI
    {
        id: 'gpt-4o-mini',
        name: 'OpenAI GPT-4o-mini',
        provider: 'openai',
        providerName: 'OpenAI',
        icon: '🤖',
        badge: 'OpenAI',
        description: 'Modelo eficiente y estructurado de OpenAI.',
        isConfigured: isValidApiKey(process.env.OPENAI_API_KEY)
    },
    {
        id: 'gpt-4o',
        name: 'OpenAI GPT-4o',
        provider: 'openai',
        providerName: 'OpenAI',
        icon: '🎯',
        badge: 'Flagship',
        description: 'Modelo insignia de OpenAI para admisiones.',
        isConfigured: isValidApiKey(process.env.OPENAI_API_KEY)
    },
    // DeepSeek
    {
        id: 'deepseek-chat',
        name: 'DeepSeek V3 (Chat)',
        provider: 'deepseek',
        providerName: 'DeepSeek',
        icon: '🐳',
        badge: 'Ultra Low Cost',
        description: 'Modelo de costo ultra bajo con gran capacidad analítica.',
        isConfigured: isValidApiKey(process.env.DEEPSEEK_API_KEY)
    },
    // Groq
    {
        id: 'llama-3.3-70b-versatile',
        name: 'Groq Llama 3.3 70B',
        provider: 'groq',
        providerName: 'Groq Cloud',
        icon: '⚡',
        badge: 'Ultra Rápido',
        description: 'Inferencia a velocidad ultra rápida en chips LPU.',
        isConfigured: isValidApiKey(process.env.GROQ_API_KEY)
    },
    // Ollama Local (Último Recurso Opcional)
    {
        id: 'ollama-local',
        name: `Ollama Local (${(process.env.OLLAMA_MODEL || 'qwen2.5:3b').trim()})`,
        provider: 'ollama',
        providerName: 'Ollama Local',
        icon: '🦙',
        badge: 'Contingencia Local',
        description: 'Último eslabón local opcional sin consumo de tokens (requiere servicio Ollama activo y RAM libre suficiente).',
        isConfigured: isOllamaConfigured()
    }
];

let globalActiveModelId = process.env.DEFAULT_AI_MODEL || 'auto-fallback';

// ==========================================
// 4. Mecanismo de Cooldown / Circuit Breaker
// ==========================================
const providerCooldowns = new Map(); // providerKey -> timestamp expiración en ms

function isProviderInCooldown(providerKey) {
    const expiresAt = providerCooldowns.get(providerKey);
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
        providerCooldowns.delete(providerKey);
        console.log(`🟢 [CIRCUIT BREAKER] Cooldown expirado para el proveedor: ${providerKey}. Reactivando.`);
        return false;
    }
    return true;
}

function setProviderCooldown(providerKey, durationMinutes = 10, reason = 'Cuota/RateLimit') {
    const expiresAt = Date.now() + (durationMinutes * 60 * 1000);
    providerCooldowns.set(providerKey, expiresAt);
    console.warn(`⏳ [CIRCUIT BREAKER] Proveedor '${providerKey}' puesto en cooldown por ${durationMinutes} minutos. Motivo: ${reason}`);
}

function getProviderCooldownRemaining(providerKey) {
    const expiresAt = providerCooldowns.get(providerKey);
    if (!expiresAt || Date.now() > expiresAt) return 0;
    return Math.ceil((expiresAt - Date.now()) / 1000); // en segundos
}

// Memoria conversacional y métricas de sesiones (con recolector TTL 24/7 para PCs de 8 GB RAM)
const conversationMemory = new Map();
const userSessionState = new Map(); // senderPhone -> { isRegistered, leadData, insertId, registeredAt, isPaused, lastActivityAt }
const processedMessageIds = new Set();
let totalConversationsStarted = 0;
let lastMemoryCleanupStats = {
    lastRunAt: null,
    evictedConversations: 0,
    evictedSessions: 0,
    evictedMessageIds: 0
};

function touchUserSession(phone) {
    if (!phone) return;
    const existing = userSessionState.get(phone) || { isRegistered: false, isPaused: false };
    existing.lastActivityAt = Date.now();
    userSessionState.set(phone, existing);
}

function runMemoryCleanup(opts = {}) {
    const stats = securityUtils.cleanupMemoryMaps(conversationMemory, userSessionState, processedMessageIds, opts);
    lastMemoryCleanupStats = {
        ...stats,
        lastRunAt: new Date().toISOString()
    };
    if (stats.evictedConversations > 0 || stats.evictedSessions > 0) {
        console.log(`🧹 [RAM GC 24/7] Limpiadas ${stats.evictedConversations} conversaciones y ${stats.evictedSessions} sesiones inactivas (>24h). Activas: ${stats.remainingConversations}`);
    }
    return stats;
}

if (process.env.NODE_ENV !== 'test') {
    const gcTimer = setInterval(() => runMemoryCleanup(), 30 * 60 * 1000);
    if (typeof gcTimer.unref === 'function') gcTimer.unref();
}

// Buffer en memoria y persistencia de Telemetría LLM (MariaDB + Langfuse opcional)
const llmTelemetryBuffer = [];
function recordLlmTelemetry(entry) {
    const tokensIn = entry.tokensIn || 0;
    const tokensOut = entry.tokensOut || 0;
    const costoMxn = securityUtils.estimateCostMxn(entry.provider, entry.model, tokensIn, tokensOut);
    const record = {
        sede_id: entry.sedeId || 'campeche',
        telefono_celular: entry.phone || null,
        proveedor: String(entry.provider || 'unknown').slice(0, 60),
        modelo: String(entry.model || 'unknown').slice(0, 100),
        latencia_ms: Math.max(0, Math.round(entry.latencyMs || 0)),
        tokens_est_in: tokensIn,
        tokens_est_out: tokensOut,
        costo_est_mxn: costoMxn,
        fue_fallback: entry.isFallback ? 1 : 0,
        exito: entry.success ? 1 : 0,
        error_detalle: entry.errorDetail ? String(entry.errorDetail).slice(0, 250) : null,
        created_at: new Date().toISOString()
    };

    llmTelemetryBuffer.unshift(record);
    if (llmTelemetryBuffer.length > 200) llmTelemetryBuffer.pop();

    if (isDatabaseReady && process.env.NODE_ENV !== 'test') {
        dbPool.execute(
            `INSERT INTO llm_telemetria (sede_id, telefono_celular, proveedor, modelo, latencia_ms, tokens_est_in, tokens_est_out, costo_est_mxn, fue_fallback, exito, error_detalle)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                record.sede_id, record.telefono_celular, record.proveedor, record.modelo,
                record.latencia_ms, record.tokens_est_in, record.tokens_est_out,
                record.costo_est_mxn, record.fue_fallback, record.exito, record.error_detalle
            ]
        ).catch(() => {});
    }

    // Hook opcional de observabilidad Langfuse (fire-and-forget si está configurado en .env)
    const lfHost = (process.env.LANGFUSE_HOST || '').trim().replace(/\/+$/, '');
    const lfPub = (process.env.LANGFUSE_PUBLIC_KEY || '').trim();
    const lfSec = (process.env.LANGFUSE_SECRET_KEY || '').trim();
    if (lfHost && lfPub && lfSec && process.env.NODE_ENV !== 'test') {
        const authBasic = Buffer.from(`${lfPub}:${lfSec}`).toString('base64');
        const traceId = crypto.randomUUID ? crypto.randomUUID() : `trace_${Date.now()}`;
        axios.post(`${lfHost}/api/public/ingestion`, {
            batch: [{
                id: `${traceId}_gen`,
                type: 'generation-create',
                timestamp: record.created_at,
                body: {
                    id: traceId,
                    name: 'metal-uriel-chat',
                    model: record.modelo,
                    metadata: {
                        provider: record.proveedor,
                        sede_id: record.sede_id,
                        fue_fallback: Boolean(record.fue_fallback),
                        latency_ms: record.latencia_ms,
                        costo_est_mxn: record.costo_est_mxn
                    },
                    usage: { input: record.tokens_est_in, output: record.tokens_est_out, unit: 'TOKENS' },
                    level: record.exito ? 'DEFAULT' : 'ERROR',
                    statusMessage: record.error_detalle || 'OK'
                }
            }]
        }, {
            headers: { Authorization: `Basic ${authBasic}`, 'Content-Type': 'application/json' },
            timeout: 3000
        }).catch(() => {});
    }
}

// ==========================================
// 5. Gestión Dinámica y Presets del System Prompt
// ==========================================
const PROMPT_FILE_PATH = path.join(__dirname, 'system_prompt.txt');

const PROMPT_PRESETS = [
    {
        id: 'metal_uriel',
        name: '🐺 Metal-Uriel Oficial (Conciso, Ágil y Asistente UNID • LFPDPPP)',
        description: 'Respuestas breves (1-2 oraciones), despliegue de Aviso de Privacidad LFPDPPP, recolección de 11 datos oficiales, envío de PDFs y cálculo automático de CURP.',
        prompt: `Eres Metal-Uriel, asesor oficial de admisiones de la Universidad Interamericana para el Desarrollo (UNID) Campus San Francisco de Campeche.

🎯 TU OBJETIVO PRINCIPAL:
1. Orientar de forma clara, directa y amable a los aspirantes sobre la oferta educativa, planes de estudio y modalidades de la UNID.
2. Recopilar progresivamente los 11 datos necesarios para generar su ficha oficial de admisión.
3. Tus respuestas deben ser BREVES, directas y concisas (1 a 2 oraciones por mensaje). Evita párrafos largos, explicaciones redundantes o repetir costos y promociones a menos que el aspirante los pida explícitamente.

🔒 CUMPLIMIENTO NORMATIVO Y AVISO DE PRIVACIDAD (LFPDPPP):
- En tu PRIMER mensaje de bienvenida a un nuevo prospecto, informa brevemente que sus datos personales están protegidos conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP) y comparte el Aviso de Privacidad oficial: https://www.unid.edu.mx/aviso-de-privacidad/ indicando que al continuar la conversación otorga su consentimiento para fines de admisión.

🚫 REGLA ESTRICTA SOBRE LA CURP:
- NUNCA le pidas la CURP al aspirante en la conversación. El sistema calcula la CURP de forma automática y transparente a partir de su nombre, fecha de nacimiento, sexo y estado.

📋 DATOS A RECOPILAR PROGRESIVAMENTE (11 CAMPOS OFICIALES):
1. Nombre completo
2. Fecha de nacimiento (AAAA-MM-DD o comprensible)
3. Sexo (Masculino / Femenino / Otro)
4. Estado de nacimiento
5. Teléfono celular
6. Correo electrónico
7. Bachillerato o preparatoria de procedencia
8. Carrera de interés
9. Dirección completa y Código Postal (CP)
10. Campus de interés (Campeche u otro)
11. Modalidad (Presencial o Licenciaturas Online)

📄 SOLICITUD DE PLAN DE ESTUDIOS / FOLLETOS PDF:
- Si el aspirante pide el plan de estudios, mapa curricular, materias o folleto en PDF, respóndele amablemente en 1 oración e incluye EXACTAMENTE la etiqueta [ENVIAR_PDF_PLAN_ESTUDIOS]. El sistema le enviará el PDF oficial de inmediato por WhatsApp.

📍 MODALIDADES Y CAMPUS:
- Campus local: San Francisco de Campeche (Presencial y Ejecutiva).
- Si el aspirante es foráneo (vive fuera de Campeche), ofrécele la modalidad "Licenciaturas Online" (100% virtual con validez SEP).

🧠 REGLA DE CONTINUIDAD:
- Si el aspirante ya proporcionó sus datos, no se los vuelvas a pedir. Continúa respondiendo a sus preguntas puntuales.

⚙️ REGISTRO FINAL EN BASE DE DATOS:
- Cuando tengas los datos básicos completos y el aspirante confirme su interés, dale una breve bienvenida (1 oración) y AL FINAL de tu respuesta incluye el bloque JSON estructurado:
\`\`\`json
{
  "completado": true,
  "aviso_privacidad_aceptado": true,
  "nombre_completo": "string",
  "fecha_nacimiento": "YYYY-MM-DD",
  "sexo": "string",
  "estado_nacimiento": "string",
  "telefono_celular": "string",
  "correo_electronico": "string",
  "bachillerato_procedencia": "string",
  "carrera_interes": "string",
  "direccion": "string",
  "codigo_postal": "string",
  "campus_interes": "string",
  "modalidad_estudios": "string",
  "es_foraneo": boolean,
  "nivel_interes": "Alto",
  "resumen_ia": "Breve resumen del perfil del aspirante."
}
\`\`\``
    },
    {
        id: 'formal_ejecutivo',
        name: '🎓 Asesor Ejecutivo (Formal & Directo)',
        description: 'Tono formal, institucional, respuestas breves y directas sin pedir CURP.',
        prompt: `Eres un Asesor Ejecutivo de Admisiones de la Universidad Interamericana para el Desarrollo (UNID), Campus San Francisco de Campeche. Tu comunicación es formal, ejecutiva, directa y concisa (1-2 oraciones por mensaje).

🎯 OBJETIVO:
Recopilar los datos básicos de admisión de forma estructurada:
1. Nombre completo
2. Fecha de nacimiento (AAAA-MM-DD)
3. Sexo (Masculino / Femenino / Otro)
4. Estado de nacimiento
5. Teléfono celular
6. Correo electrónico
7. Bachillerato de procedencia
8. Carrera de interés
9. Dirección completa y Código Postal (CP)
10. Campus de interés
11. Modalidad (Presencial o Licenciaturas Online)

🚫 REGLA ESTRICTA: NUNCA pidas la CURP (el sistema la calcula automáticamente).

📄 PLANES DE ESTUDIO:
- Si el aspirante pide el plan de estudios o materias, incluye [ENVIAR_PDF_PLAN_ESTUDIOS] para el envío automático del PDF.

⚙️ REGLA DE CIERRE:
- Al completar los datos, responde con una breve confirmación y el bloque JSON con completado: true.`
    }
];

let activeSystemPrompt = PROMPT_PRESETS[0].prompt;

try {
    if (fs.existsSync(PROMPT_FILE_PATH)) {
        activeSystemPrompt = fs.readFileSync(PROMPT_FILE_PATH, 'utf-8').trim();
    } else {
        fs.writeFileSync(PROMPT_FILE_PATH, activeSystemPrompt, 'utf-8');
    }
} catch (e) {
    console.warn('⚠️ No se pudo leer system_prompt.txt, usando default:', e.message);
}

function getActivePrompt() {
    return activeSystemPrompt;
}

function setActivePrompt(newPrompt) {
    activeSystemPrompt = newPrompt.trim();
    try {
        fs.writeFileSync(PROMPT_FILE_PATH, activeSystemPrompt, 'utf-8');
    } catch (e) {
        console.error('Error guardando prompt en archivo:', e);
    }
}

// ==========================================
// 6. Motor Inteligente del Pool Multimedia (Planes, Oferta, Horarios, Instalaciones)
// ==========================================
function normalizeForMatch(str) {
    return String(str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

async function getActivePoolItems(sedeId = null) {
    try {
        let query = 'SELECT * FROM pool_recursos_multimedia WHERE activo = 1';
        const params = [];
        if (sedeId && sedeId !== 'all' && sedeId !== 'todas') {
            query += ' AND (sede_id = ? OR sede_id = "global" OR sede_id IS NULL)';
            params.push(sedeId);
        }
        query += ' ORDER BY id ASC';
        const [rows] = await dbPool.query(query, params);
        if (rows && rows.length > 0) {
            return rows.map(r => {
                let parsedTags = [];
                try {
                    parsedTags = typeof r.tags === 'string' ? JSON.parse(r.tags) : (Array.isArray(r.tags) ? r.tags : []);
                } catch (_) {
                    parsedTags = String(r.tags || '').split(',').map(t => t.trim()).filter(Boolean);
                }
                return {
                    id: r.codigo_recurso || String(r.id),
                    dbId: r.id,
                    codigo_recurso: r.codigo_recurso || String(r.id),
                    sede_id: r.sede_id || 'campeche',
                    ciclo_escolar: r.ciclo_escolar || '2026-3 Septiembre',
                    categoria: r.categoria || 'plan_estudios',
                    titulo: r.titulo,
                    carrera: r.titulo,
                    descripcion_ia: r.descripcion_ia || '',
                    scope: r.scope || 'campus_campeche',
                    scopeLabel: r.scope_label || '🏛️ Campus Campeche',
                    modalidad: r.modalidad || 'Presencial',
                    duracion: r.duracion || '3 años (9 cuatrimestres)',
                    rvoe: r.rvoe || 'SEP-RVOE-OFICIAL',
                    tipo_archivo: r.tipo_archivo || 'pdf',
                    fileName: r.file_name || `${r.codigo_recurso}.pdf`,
                    pdfUrl: r.url_recurso || `/api/brochures/${r.codigo_recurso}/download`,
                    url_recurso: r.url_recurso || `/api/brochures/${r.codigo_recurso}/download`,
                    size: r.tamano || '1.2 MB',
                    tags: parsedTags
                };
            });
        }
    } catch (_) {}

    // Fallback a UNID_BROCHURES en memoria si la BD no está lista
    return UNID_BROCHURES.map(b => ({
        ...b,
        codigo_recurso: b.id,
        categoria: b.id === 'becas' ? 'becas_costos' : 'plan_estudios',
        titulo: b.carrera,
        descripcion_ia: `${b.carrera} (${b.modalidad}). Duración: ${b.duracion}. RVOE: ${b.rvoe}.`,
        tipo_archivo: 'pdf',
        url_recurso: b.pdfUrl
    }));
}

function detectBrochureRequest(userMessage, senderPhone = null, llmReply = '', poolItems = null) {
    const catalog = Array.isArray(poolItems) && poolItems.length > 0 ? poolItems : UNID_BROCHURES.map(b => ({
        ...b,
        codigo_recurso: b.id,
        categoria: b.id === 'becas' ? 'becas_costos' : 'plan_estudios',
        titulo: b.carrera,
        tipo_archivo: 'pdf',
        url_recurso: b.pdfUrl
    }));

    // 1. Etiqueta explícita emitida por la IA: [ADJUNTAR_RECURSO: codigo] o [ENVIAR_PDF: codigo]
    const explicitResourceMatch = (llmReply || '').match(/\[(?:ADJUNTAR_RECURSO|ENVIAR_PDF(?:_PLAN_ESTUDIOS)?)\s*:\s*([a-zA-Z0-9_\-]+)\]/i);
    if (explicitResourceMatch) {
        const targetCode = normalizeForMatch(explicitResourceMatch[1]);
        const exactFound = catalog.find(item =>
            normalizeForMatch(item.codigo_recurso || item.id) === targetCode ||
            normalizeForMatch(item.titulo || item.carrera).includes(targetCode)
        );
        if (exactFound) return exactFound;
    }

    const userNorm = normalizeForMatch(userMessage);
    const replyNorm = normalizeForMatch(llmReply);
    const hasGenericAiTag = /\[(?:ENVIAR_PDF|ADJUNTAR_RECURSO)/i.test(llmReply || '');

    // Detectar si el bot ofreció enviar un archivo en el mensaje inmediato anterior y el usuario acaba de confirmar ("sí", "por favor", "mándamelo")
    let userConfirmedPreviousOffer = false;
    let lastAssistantMessageNorm = '';
    if (senderPhone) {
        const history = conversationMemory.get(senderPhone) || [];
        // history ya incluye el mensaje actual del usuario y la respuesta actual del asistente al final si fue llamado tras callMetalUrielLLM
        const assistantMsgs = history.filter(h => h.role === 'assistant');
        if (assistantMsgs.length >= 2) {
            lastAssistantMessageNorm = normalizeForMatch(assistantMsgs[assistantMsgs.length - 2].content || '');
        } else if (assistantMsgs.length === 1) {
            lastAssistantMessageNorm = normalizeForMatch(assistantMsgs[0].content || '');
        }
        const botOfferedFile = /(?:te gustaria que te envie|quieres que te envie|te comparto el pdf|enviarte el plan|mandarte el pdf|enviarte la imagen|te envio el archivo|te mando el plan)/i.test(lastAssistantMessageNorm);
        const userSaidYes = /\b(?:si|sii+|claro|por favor|porfa|mandamelo|enviamelo|pasamelo|adelante|va|ok|dale|me gustaria|si quiero)\b/i.test(userNorm);
        if (botOfferedFile && userSaidYes) {
            userConfirmedPreviousOffer = true;
        }
    }

    // Si la IA está haciendo apenas la pregunta de confirmación ("¿Te gustaría que te envíe...?"), NO adjuntar todavía a menos que haya puesto el tag explícito
    const isAiJustAskingConfirmation = /\?\s*$/.test((llmReply || '').trim()) &&
        /(?:te gustaria que te envie|quieres que te envie|te gustaria recibir el pdf|quieres que te mande)/i.test(replyNorm) &&
        !hasGenericAiTag;

    if (isAiJustAskingConfirmation && !userConfirmedPreviousOffer) {
        return null;
    }

    const isUserAskingForDocDirectly = /\b(?:plan de estudios?|temario|malla curricular|folleto|pdf|brochure|horarios?|instalaciones|fotos?|oferta educativa|guia de becas)\b/i.test(userNorm) &&
                                       /\b(?:mand\w*|envi\w*|pas\w*|descarg\w*|compart\w*|adjunt\w*)\b/i.test(userNorm);

    if (!hasGenericAiTag && !userConfirmedPreviousOffer && !isUserAskingForDocDirectly) {
        return null;
    }

    // Función auxiliar para buscar coincidencia normalizada (sin acentos) en un texto dado
    const findMatchInText = (normText) => {
        if (!normText) return null;
        for (const item of catalog) {
            const tags = Array.isArray(item.tags) ? item.tags : [];
            const matchTag = tags.some(t => {
                const cleanTag = normalizeForMatch(t);
                return cleanTag.length >= 3 && normText.includes(cleanTag);
            });
            if (matchTag) return item;
        }
        return null;
    };

    // Prioridad 1: Mensaje actual del usuario
    const matchFromUser = findMatchInText(userNorm);
    if (matchFromUser) return matchFromUser;

    // Prioridad 2: Mensaje previo donde el bot ofreció el recurso o respuesta actual de la IA
    if (lastAssistantMessageNorm) {
        const matchFromOffer = findMatchInText(lastAssistantMessageNorm);
        if (matchFromOffer) return matchFromOffer;
    }
    const matchFromReply = findMatchInText(replyNorm);
    if (matchFromReply) return matchFromReply;

    // Prioridad 3: Sesión o historial en orden cronológico INVERSO (del más reciente al más antiguo)
    if (senderPhone) {
        const session = userSessionState.get(senderPhone);
        if (session && session.leadData && session.leadData.carrera_interes) {
            const matchFromSession = findMatchInText(normalizeForMatch(session.leadData.carrera_interes));
            if (matchFromSession) return matchFromSession;
        }

        const history = conversationMemory.get(senderPhone) || [];
        for (let i = history.length - 1; i >= 0; i--) {
            const hNorm = normalizeForMatch(history[i].content || '');
            const matchFromHist = findMatchInText(hNorm);
            if (matchFromHist) return matchFromHist;
        }
    }

    // Prioridad 4: Categorías específicas (horarios, instalaciones, oferta educativa, becas)
    if (/\bhorario/i.test(userNorm)) {
        return catalog.find(i => i.categoria === 'horarios') || null;
    }
    if (/\binstalacion|\bfoto|\bcampus|\blaboratorio/i.test(userNorm)) {
        return catalog.find(i => i.categoria === 'instalaciones') || null;
    }
    if (/\boferta educativa|\bcarreras disponibles|\btodas las carreras/i.test(userNorm)) {
        return catalog.find(i => i.categoria === 'oferta_educativa') || null;
    }
    if (/\bbecas?\b|\bcostos?\b|\bfinanciamiento\b|\bprecios?\b/i.test(userNorm)) {
        return catalog.find(i => i.categoria === 'becas_costos' || i.id === 'becas') || null;
    }

    // CRÍTICO: CERO FALLBACK CIEGO A UNID_BROCHURES[0] (Ingeniería en Sistemas).
    // Si no hubo coincidencia exacta con lo que pidió el alumno, no adjuntar un archivo equivocado.
    return null;
}

// ==========================================
// 7. Adaptadores Normalizados para cada Proveedor de IA
// ==========================================

// Adaptador 1: Google Gemini
async function llamarAPI_Gemini(modelId, prompt, history) {
    if (!geminiClient || !isValidApiKey(process.env.GEMINI_API_KEY)) {
        throw new Error('Google Gemini no tiene API Key configurada.');
    }

    const legacyMap = {
        'gemini-2.5-flash': 'gemini-3.8-flash',
        'gemini-2.5-flash-lite': 'gemini-3.5-flash-lite',
        'gemini-2.5-pro': 'gemini-4-argon',
        'gemini-3.5-flash': 'gemini-3.8-flash',
        'gemini-3.6-flash': 'gemini-3.8-flash',
        'gemini-3.1-pro-preview': 'gemini-4-argon'
    };
    const normalizedId = legacyMap[modelId] || modelId;
    const primaryModel = (normalizedId && normalizedId.startsWith('gemini')) ? normalizedId : 'gemini-3.8-flash';
    const candidateModels = Array.from(new Set([primaryModel, 'gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-4-argon']));

    const geminiContents = history.map(h => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content }]
    }));

    let lastErr = null;
    for (const targetModel of candidateModels) {
        try {
            const response = await geminiClient.models.generateContent({
                model: targetModel,
                contents: geminiContents,
                config: {
                    systemInstruction: prompt,
                    temperature: 0.7
                }
            });

            const replyText = response.text ? response.text.trim() : '';
            if (replyText) {
                return { reply: replyText, modelUsed: targetModel, provider: 'Google Gemini' };
            }
        } catch (err) {
            lastErr = err;
            console.warn(`⚠️ [GEMINI SUB-FALLBACK] Modelo ${targetModel} no disponible (${err.message?.slice(0, 80)}), probando siguiente variante Gemini...`);
        }
    }

    throw lastErr || new Error('Respuesta vacía de Google Gemini.');
}

// Adaptador 2: Anthropic Claude
async function llamarAPI_Claude(modelId, prompt, history) {
    if (!anthropicClient || !isValidApiKey(process.env.ANTHROPIC_API_KEY)) {
        throw new Error('Anthropic Claude no tiene API Key configurada.');
    }

    const targetModel = modelId && modelId.startsWith('claude') ? modelId : 'claude-3-5-haiku-20241022';
    const claudeMessages = history.map(h => ({
        role: h.role === 'assistant' ? 'assistant' : 'user',
        content: h.content
    }));

    const response = await anthropicClient.messages.create({
        model: targetModel,
        max_tokens: 1000,
        system: prompt,
        messages: claudeMessages,
        temperature: 0.7
    });

    const replyText = response.content?.[0]?.type === 'text' ? response.content[0].text.trim() : '';
    if (!replyText) throw new Error('Respuesta vacía de Anthropic Claude.');
    return { reply: replyText, modelUsed: targetModel, provider: 'Anthropic Claude' };
}

// Adaptador 3: OpenAI
async function llamarAPI_OpenAI(modelId, prompt, history) {
    if (!openaiClient || !isValidApiKey(process.env.OPENAI_API_KEY)) {
        throw new Error('OpenAI no tiene API Key configurada.');
    }

    const targetModel = modelId && modelId.startsWith('gpt') ? modelId : 'gpt-4o-mini';
    const openAiMessages = [
        { role: 'system', content: prompt },
        ...history.map(h => ({ role: h.role, content: h.content }))
    ];

    const response = await openaiClient.chat.completions.create({
        model: targetModel,
        messages: openAiMessages,
        temperature: 0.7,
        max_tokens: 800
    });

    const replyText = response.choices[0]?.message?.content?.trim() || '';
    if (!replyText) throw new Error('Respuesta vacía de OpenAI.');
    return { reply: replyText, modelUsed: targetModel, provider: 'OpenAI' };
}

// Adaptador 4: DeepSeek
async function llamarAPI_DeepSeek(modelId, prompt, history) {
    if (!deepseekClient || !isValidApiKey(process.env.DEEPSEEK_API_KEY)) {
        throw new Error('DeepSeek no tiene API Key configurada.');
    }

    const targetModel = 'deepseek-chat';
    const messages = [
        { role: 'system', content: prompt },
        ...history.map(h => ({ role: h.role, content: h.content }))
    ];

    const response = await deepseekClient.chat.completions.create({
        model: targetModel,
        messages: messages,
        temperature: 0.7,
        max_tokens: 800
    });

    const replyText = response.choices[0]?.message?.content?.trim() || '';
    if (!replyText) throw new Error('Respuesta vacía de DeepSeek.');
    return { reply: replyText, modelUsed: targetModel, provider: 'DeepSeek' };
}

// Adaptador 5: Groq
async function llamarAPI_Groq(modelId, prompt, history) {
    if (!groqClient || !isValidApiKey(process.env.GROQ_API_KEY)) {
        throw new Error('Groq no tiene API Key configurada.');
    }

    const targetModel = 'llama-3.3-70b-versatile';
    const messages = [
        { role: 'system', content: prompt },
        ...history.map(h => ({ role: h.role, content: h.content }))
    ];

    const response = await groqClient.chat.completions.create({
        model: targetModel,
        messages: messages,
        temperature: 0.7,
        max_tokens: 800
    });

    const replyText = response.choices[0]?.message?.content?.trim() || '';
    if (!replyText) throw new Error('Respuesta vacía de Groq.');
    return { reply: replyText, modelUsed: targetModel, provider: 'Groq Cloud' };
}

// Adaptador 6: Ollama Local (Último Recurso Opcional con Timeout Estricto)
async function llamarAPI_Ollama(modelId, prompt, history) {
    if (!isOllamaConfigured()) {
        throw new Error('Ollama Local está deshabilitado o sin configurar.');
    }

    const baseUrl = String(process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
    const targetModel = (modelId && modelId !== 'ollama-local') ? modelId : String(process.env.OLLAMA_MODEL || 'qwen2.5:3b').trim();
    const timeoutMs = Math.min(60000, Math.max(5000, Number(process.env.OLLAMA_TIMEOUT_MS) || 15000));

    const headers = { 'Content-Type': 'application/json' };
    if (process.env.OLLAMA_API_KEY && process.env.OLLAMA_API_KEY.trim()) {
        headers['Authorization'] = `Bearer ${process.env.OLLAMA_API_KEY.trim()}`;
    }

    const messages = [
        { role: 'system', content: prompt },
        ...history.slice(-10).map(h => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content }))
    ];

    const response = await axios.post(
        `${baseUrl}/api/chat`,
        {
            model: targetModel,
            messages,
            stream: false,
            options: {
                temperature: 0.7,
                num_predict: 500
            }
        },
        { headers, timeout: timeoutMs }
    );

    const replyText = response.data?.message?.content?.trim() || '';
    if (!replyText) throw new Error('Respuesta vacía de Ollama Local.');
    return { reply: replyText, modelUsed: targetModel, provider: 'Ollama Local' };
}

// ==========================================
// 8. Motor de Inferencia en Cascada con Fallback Inteligente y Cooldown
// ==========================================

// Jerarquía de Fallback Predeterminada (Nube primero -> Ollama Local opcional como último eslabón)
const FALLBACK_PROVIDER_PIPELINE = [
    { provider: 'google', fn: llamarAPI_Gemini, defaultModel: 'gemini-3.8-flash', check: () => isValidApiKey(process.env.GEMINI_API_KEY) },
    { provider: 'anthropic', fn: llamarAPI_Claude, defaultModel: 'claude-3-5-haiku-20241022', check: () => isValidApiKey(process.env.ANTHROPIC_API_KEY) },
    { provider: 'openai', fn: llamarAPI_OpenAI, defaultModel: 'gpt-4o-mini', check: () => isValidApiKey(process.env.OPENAI_API_KEY) },
    { provider: 'deepseek', fn: llamarAPI_DeepSeek, defaultModel: 'deepseek-chat', check: () => isValidApiKey(process.env.DEEPSEEK_API_KEY) },
    { provider: 'groq', fn: llamarAPI_Groq, defaultModel: 'llama-3.3-70b-versatile', check: () => isValidApiKey(process.env.GROQ_API_KEY) },
    { provider: 'ollama', fn: llamarAPI_Ollama, defaultModel: 'ollama-local', check: () => isOllamaConfigured() }
];

async function callMetalUrielLLM(senderPhone, userMessage, requestedModelId = null, sedeId = 'campeche') {
    const canonicalKey = normalizePhoneCanonical(senderPhone) || senderPhone;
    if (!conversationMemory.has(canonicalKey)) {
        conversationMemory.set(canonicalKey, []);
        totalConversationsStarted++;
    }

    const history = conversationMemory.get(canonicalKey);
    history.push({ role: 'user', content: userMessage, timestamp: new Date() });
    touchUserSession(canonicalKey);

    if (history.length > 24) {
        history.splice(0, history.length - 24);
    }

    let currentPrompt = getActivePrompt();

    // Cargar Ciclo Escolar Activo y Pool de Recursos Multimedia desde MariaDB
    const cicloActivo = await getActiveCicloEscolar(sedeId);
    const poolItems = await getActivePoolItems(sedeId);

    const poolCatalogSummary = poolItems.map(item =>
        `• [Código: ${item.codigo_recurso}] (${item.categoria.toUpperCase()} | ${item.tipo_archivo.toUpperCase()}) "${item.titulo}" — Modalidad: ${item.modalidad || 'Presencial'}. Info: ${item.descripcion_ia || ''}`
    ).join('\n');

    currentPrompt = `${currentPrompt}

[📚 POOL OFICIAL DE RECURSOS MULTIMEDIA, PLANES, HORARIOS E INSTALACIONES (CICLO ACTIVO: ${cicloActivo})]
Tienes acceso a los siguientes documentos oficiales (PDFs) e imágenes de la sede:
${poolCatalogSummary}

REGLA DE ORO PARA ENVÍO DE ARCHIVOS DEL POOL (CONFIRMACIÓN PREVIA):
1. Cuando el aspirante pregunte por información de una carrera, plan de estudios, oferta educativa, horarios de clase o fotos de las instalaciones, respóndele primero de forma clara y cálida usando la información del Pool y **pregúntale primero**: "¿Te gustaría que te envíe por aquí el PDF/imagen oficial de [Nombre del Recurso]?" (NO incluyas la etiqueta de adjunto cuando apenas estás haciendo la pregunta).
2. ÚNICAMENTE cuando el aspirante confirme que sí desea el archivo (ej. "sí", "claro", "por favor", "mándamelo", "pásamelo") o si te exige el envío directo del archivo tras habérselo mencionado, incluye al final de tu respuesta la etiqueta exacta:
[ADJUNTAR_RECURSO: codigo_del_recurso]
(Por ejemplo, para Ciencias de la Comunicación usa [ADJUNTAR_RECURSO: comunicacion], para Horarios usa [ADJUNTAR_RECURSO: horarios_escolarizado_campeche], para Instalaciones usa [ADJUNTAR_RECURSO: instalaciones_campus_campeche]).
3. NUNCA adjuntes el plan de estudios de Ingeniería en Sistemas si el alumno preguntó por otra carrera como Ciencias de la Comunicación, Derecho o Psicología.`;

    // Inyección contextual según el estado del usuario en sesión
    const session = userSessionState.get(senderPhone);
    if (session && session.isRegistered && session.leadData) {
        currentPrompt = `${currentPrompt}

[📌 ESTADO DEL ASPIRANTE EN SISTEMA: PRE-REGISTRO COMPLETADO EXITOSAMENTE]
- Aspirante: ${session.leadData.nombre_completo || 'Registrado'}
- Carrera: ${session.leadData.carrera_interes || 'Elegida'}
- Modalidad: ${session.leadData.modalidad_estudios || 'Presencial'}
- Campus: ${session.leadData.campus_interes || 'San Francisco de Campeche'}
- Ciclo Escolar: ${cicloActivo}

INSTRUCCIONES CLAVE DE ATENCIÓN:
1. NUNCA vuelvas a solicitarle los 11 datos ni a reiniciar el cuestionario de inscripción.
2. Responde con calidez humana, entusiasmo y precisión a sus dudas (planes de estudio, materias, horarios, instalaciones, costos, pasarela de pago Mitec, fechas de inicio o inducción).
3. Sigue la REGLA DE ORO PARA ENVÍO DE ARCHIVOS DEL POOL usando [ADJUNTAR_RECURSO: codigo_del_recurso] cuando el aspirante confirme que desea recibir el documento o imagen.`;
    }

    const modelToUse = requestedModelId || globalActiveModelId;

    // Determinar lista de intentos según el modelo seleccionado o modo auto-fallback
    let providersToTry = [];

    if (modelToUse && modelToUse !== 'auto-fallback') {
        // El usuario seleccionó un modelo específico: intentarlo primero, pero conservar los demás de respaldo
        const selectedMeta = ALL_SUPPORTED_MODELS.find(m => m.id === modelToUse);
        const primaryPipelineEntry = selectedMeta 
            ? FALLBACK_PROVIDER_PIPELINE.find(p => p.provider === selectedMeta.provider)
            : null;

        if (primaryPipelineEntry && primaryPipelineEntry.check()) {
            providersToTry.push({
                ...primaryPipelineEntry,
                specificModel: modelToUse
            });
        }

        // Agregar los restantes como respaldo
        FALLBACK_PROVIDER_PIPELINE.forEach(p => {
            if (p.check() && (!primaryPipelineEntry || p.provider !== primaryPipelineEntry.provider)) {
                providersToTry.push(p);
            }
        });
    } else {
        // Modo Auto-Fallback: Seguir la jerarquía ordenada completa
        providersToTry = FALLBACK_PROVIDER_PIPELINE.filter(p => p.check());
    }

    if (providersToTry.length === 0) {
        console.error('❌ [CRÍTICO] No hay ningún proveedor de IA con API Key configurada en el servidor.');
        return {
            reply: '¡Bip-bop! 🤖 Mis procesadores de lenguaje están en mantenimiento temporal. Por favor configura tu API Key en el servidor.',
            modelUsed: 'none',
            provider: 'none'
        };
    }

    // Ejecución de la Cascada con Intercepción Inteligente y Cooldown
    let lastError = null;

    for (let i = 0; i < providersToTry.length; i++) {
        const currentTarget = providersToTry[i];
        const providerKey = currentTarget.provider;

        // Verificar si el proveedor está en Cooldown (Circuit Breaker)
        if (isProviderInCooldown(providerKey)) {
            const remainingSec = getProviderCooldownRemaining(providerKey);
            console.log(`⏩ [CIRCUIT BREAKER] Saltando proveedor '${providerKey}' (en cooldown, restan ${remainingSec}s)...`);
            continue;
        }

        const modelParam = currentTarget.specificModel || currentTarget.defaultModel;

        // Inyección de Salvaguarda de Continuidad Contextual en caso de Fallback a mitad de conversación
        let promptToUse = currentPrompt;
        if (i > 0) {
            promptToUse = `${currentPrompt}\n\n[🛡️ PROTOCOLO DE CONTINUIDAD CONVERSACIONAL (RECUPERACIÓN POR FALLBACK)]: Esta conversación ha sido transferida de forma transparente a este procesador de IA. Contiene ${history.length} mensajes previos en el historial. NUNCA reinicies el diálogo ni vuelvas a pedir datos que el aspirante ya haya proporcionado (ej. nombre, carrera, fecha, estado o CP). Continúa respondiendo de manera fluida y empática exactamente desde el último mensaje recibido.]`;
            console.log(`🔄 [CONTEXT PRESERVATION] Inyectando salvaguarda de continuidad para ${providerKey.toUpperCase()} (${history.length} mensajes en memoria)...`);
        }

        const tStart = Date.now();
        const estTokensIn = securityUtils.estimateTokens(promptToUse) + securityUtils.estimateTokens(history);

        try {
            console.log(`📡 [AI INFERENCE] Intentando con ${providerKey.toUpperCase()} (${modelParam})...`);
            const result = await currentTarget.fn(modelParam, promptToUse, history);
            const latencyMs = Date.now() - tStart;
            const estTokensOut = securityUtils.estimateTokens(result.reply);

            recordLlmTelemetry({
                sedeId,
                phone: senderPhone,
                provider: result.provider || providerKey,
                model: result.modelUsed || modelParam,
                latencyMs,
                tokensIn: estTokensIn,
                tokensOut: estTokensOut,
                isFallback: i > 0,
                success: true
            });

            // Éxito: guardar en historial y retornar
            history.push({
                role: 'assistant',
                content: result.reply,
                senderName: 'Metal-Uriel IA',
                modelUsed: result.modelUsed || modelParam,
                timestamp: new Date()
            });
            touchUserSession(canonicalKey);
            result.isFallbackSwitch = (i > 0);
            result.latencyMs = latencyMs;
            if (i > 0) {
                result.switchedFrom = providersToTry[0].provider;
            }
            return result;

        } catch (error) {
            lastError = error;
            const latencyMs = Date.now() - tStart;
            const status = error.status || error.response?.status || error.statusCode;
            const errorMsg = error.message || '';

            recordLlmTelemetry({
                sedeId,
                phone: senderPhone,
                provider: providerKey,
                model: modelParam,
                latencyMs,
                tokensIn: estTokensIn,
                tokensOut: 0,
                isFallback: i > 0,
                success: false,
                errorDetail: `${status || ''} ${errorMsg}`.trim()
            });

            // Detectar Rate Limits (429), API Key Expirada (401) o Cuota Agotada (403, 402, 503)
            const isQuotaOrRateLimit = status === 429 || status === 403 || status === 402 || status === 401 ||
                                       /quota|rate limit|too many requests|credits|credit balance|overloaded|expired|invalid api key/i.test(errorMsg);

            if (isQuotaOrRateLimit) {
                console.warn(`🚨 [ALERTA DE CUOTA] ${providerKey.toUpperCase()} retornó error de cuota (${status || errorMsg}). Activando Cooldown de 10 min y pasando al siguiente en cascada sin perder contexto...`);
                setProviderCooldown(providerKey, 10, errorMsg);
            } else {
                console.warn(`⚠️ [FALLBACK] Error con ${providerKey.toUpperCase()} (${errorMsg}). Intentando con siguiente proveedor en la lista manteniendo el contexto íntegro...`);
            }
        }
    }

    // Si todos los proveedores de la jerarquía fallaron
    console.error('🔥 [ERROR TOTAL] Todos los proveedores de IA en la cascada fallaron:', lastError?.message);
    if (typeof enviarAlertaSistema === 'function') {
        enviarAlertaSistema(
            'AI_TOTAL_FAILURE',
            'Todos los proveedores de IA en la cascada fallaron',
            `Último error registrado: ${lastError?.message || 'Sin detalle'}\nProspecto afectado: ${senderPhone}\nSede: ${sedeId}`
        ).catch(() => {});
    }
    return {
        reply: '¡Bip-bop! 🤖 En este momento mis circuitos están experimentando una alta demanda de aspirantes. Un asesor humano del equipo de Admisiones UNID te atenderá a la brevedad.',
        modelUsed: 'fallback-offline',
        provider: 'Fallback Final',
        isFallbackSwitch: false
    };
}

// ==========================================
// 9. Inserción y Actualización de Aspirante en MariaDB
// ==========================================
function resolveSedeId(campusStr) {
    if (!campusStr) return 'campeche';
    const c = String(campusStr).toLowerCase();
    for (const u of UNID_CAMPUSES) {
        if (c.includes(u.id) || c.includes(u.name.toLowerCase().replace('campus ', ''))) {
            return u.id;
        }
    }
    if (c.includes('campeche')) return 'campeche';
    if (c.includes('cancun') || c.includes('cancún')) return 'cancun';
    if (c.includes('merida') || c.includes('mérida')) return 'merida';
    if (c.includes('villahermosa')) return 'villahermosa';
    if (c.includes('online') || c.includes('virtual')) return 'online_nacional';
    return 'campeche';
}

async function registrarLeadInicialEnBD(senderPhone, primerMensaje, sedeId = 'campeche') {
    const canonical = normalizePhoneCanonical(senderPhone);
    const dialPhone = pickBestDialPhone([senderPhone]);
    try {
        const [existing] = await dbPool.query(
            `SELECT id, nombre_completo, estado_prospecto, telefono_celular
             FROM aspirantes
             WHERE telefono_canonico = ?
                OR REPLACE(REPLACE(REPLACE(telefono_celular, '+', ''), ' ', ''), '-', '') LIKE ?
             ORDER BY id DESC LIMIT 1`,
            [canonical, `%${canonical}%`]
        );

        if (existing.length > 0) {
            const bestPhone = pickBestDialPhone([existing[0].telefono_celular, dialPhone]);
            await dbPool.execute(
                'UPDATE aspirantes SET ultimo_mensaje_at = CURRENT_TIMESTAMP, telefono_canonico = ?, telefono_celular = ? WHERE id = ?',
                [canonical, bestPhone, existing[0].id]
            );
            return { isNew: false, insertId: existing[0].id, existingLead: existing[0], canonicalPhone: canonical };
        }

        const cicloActivo = await getActiveCicloEscolar(sedeId || 'campeche');
        const nombreTemp = `Prospecto WhatsApp (${dialPhone})`;
        const [result] = await dbPool.execute(`
            INSERT INTO aspirantes (
                sede_id, ciclo_escolar, nombre_completo, telefono_celular, telefono_canonico, carrera_interes,
                campus_interes, modalidad_estudios, estado_prospecto, nivel_interes, resumen_ia
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'nuevo', 'Medio', ?)
        `, [
            sedeId || 'campeche',
            cicloActivo,
            nombreTemp,
            dialPhone,
            canonical,
            'Por definir (En conversación)',
            'San Francisco de Campeche',
            'Presencial',
            `Primer contacto vía WhatsApp (${cicloActivo}): "${String(primerMensaje || '').substring(0, 120)}"`
        ]);

        console.log(`🆕 [LEAD INICIAL CREADO] Nuevo contacto ${dialPhone} registrado con ID #${result.insertId} (${cicloActivo})`);
        return { isNew: true, insertId: result.insertId, ciclo_escolar: cicloActivo, canonicalPhone: canonical };
    } catch (err) {
        console.warn('⚠️ Error registrando lead inicial en BD:', err.message);
        return { isNew: true, insertId: null, canonicalPhone: canonical };
    }
}

async function guardarAspiranteEnBD(datos, senderPhone = null) {
    if (!datos.curp && datos.nombre_completo && datos.fecha_nacimiento) {
        datos.curp = generarCurp(datos);
    }

    const phoneToUse = pickBestDialPhone([senderPhone, datos.telefono_celular]);
    const canonical = normalizePhoneCanonical(phoneToUse || datos.telefono_celular || senderPhone);
    const sedeId = datos.sede_id || resolveSedeId(datos.campus_interes);
    const cicloActivo = datos.ciclo_escolar || await getActiveCicloEscolar(sedeId);

    try {
        if (canonical && canonical.length >= 8) {
            const [existing] = await dbPool.query(
                `SELECT id, telefono_celular FROM aspirantes
                 WHERE telefono_canonico = ?
                    OR REPLACE(REPLACE(REPLACE(telefono_celular, '+', ''), ' ', ''), '-', '') LIKE ?
                 ORDER BY id DESC LIMIT 1`,
                [canonical, `%${canonical}%`]
            );

            if (existing.length > 0) {
                const targetId = existing[0].id;
                const bestPhone = pickBestDialPhone([existing[0].telefono_celular, phoneToUse]);
                await dbPool.execute(`
                    UPDATE aspirantes SET
                        sede_id = ?, ciclo_escolar = ?, curp = ?, nombre_completo = ?, fecha_nacimiento = ?, sexo = ?,
                        estado_nacimiento = ?, telefono_celular = ?, telefono_canonico = ?, correo_electronico = ?,
                        bachillerato_procedencia = ?, carrera_interes = ?, direccion = ?,
                        codigo_postal = ?, campus_interes = ?, modalidad_estudios = ?,
                        es_foraneo = ?, raw_json_data = ?, nivel_interes = ?, resumen_ia = ?,
                        ultimo_mensaje_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [
                    sedeId,
                    cicloActivo,
                    datos.curp || null,
                    datos.nombre_completo || 'Aspirante UNID',
                    datos.fecha_nacimiento || null,
                    datos.sexo || null,
                    datos.estado_nacimiento || null,
                    bestPhone,
                    canonical,
                    datos.correo_electronico || null,
                    datos.bachillerato_procedencia || null,
                    datos.carrera_interes || 'Por definir',
                    datos.direccion || null,
                    datos.codigo_postal || null,
                    datos.campus_interes || 'San Francisco de Campeche',
                    datos.modalidad_estudios || 'Presencial',
                    datos.es_foraneo ? 1 : 0,
                    JSON.stringify(datos),
                    datos.nivel_interes || 'Alto',
                    datos.resumen_ia || `Ficha completada para ${datos.carrera_interes} en modalidad ${datos.modalidad_estudios} (${cicloActivo}).`,
                    targetId
                ]);
                console.log(`🎉 Expediente de aspirante actualizado en MariaDB con ID: #${targetId} (CURP: ${datos.curp || 'N/A'})`);
                return targetId;
            }
        }

        const query = `
            INSERT INTO aspirantes (
                sede_id, ciclo_escolar, curp, nombre_completo, fecha_nacimiento, sexo, estado_nacimiento,
                telefono_celular, telefono_canonico, correo_electronico, bachillerato_procedencia,
                carrera_interes, direccion, codigo_postal, campus_interes,
                modalidad_estudios, es_foraneo, latitud, longitud, raw_json_data, 
                estado_prospecto, nivel_interes, resumen_ia
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
            sedeId,
            cicloActivo,
            datos.curp || null,
            datos.nombre_completo || 'Aspirante UNID',
            datos.fecha_nacimiento || null,
            datos.sexo || null,
            datos.estado_nacimiento || null,
            phoneToUse || null,
            canonical || null,
            datos.correo_electronico || null,
            datos.bachillerato_procedencia || null,
            datos.carrera_interes || 'Por definir',
            datos.direccion || null,
            datos.codigo_postal || null,
            datos.campus_interes || 'San Francisco de Campeche',
            datos.modalidad_estudios || 'Presencial',
            datos.es_foraneo ? 1 : 0,
            datos.latitud || null,
            datos.longitud || null,
            JSON.stringify(datos),
            datos.estado_prospecto || 'nuevo',
            datos.nivel_interes || 'Alto',
            datos.resumen_ia || `Aspirante registrado para ${datos.carrera_interes} en modalidad ${datos.modalidad_estudios} (${cicloActivo}).`
        ];

        const [result] = await dbPool.execute(query, values);
        console.log(`🎉 Aspirante insertado en MariaDB con ID: ${result.insertId} (CURP: ${datos.curp || 'N/A'})`);
        return result.insertId;
    } catch (dbError) {
        console.error('❌ Error al guardar aspirante en MariaDB:', dbError);
        throw dbError;
    }
}

// ==========================================
// 10. Sistema de Notificaciones por Correo Electrónico (Nodemailer - 3 Eventos + Alertas Life Support)
// ==========================================
const emailNotificationHistory = []; // Bitácora en memoria para auditoría en el Centro de Mando
const systemAlertCooldowns = new Map(); // alertKey -> timestamp último envío (evita spam de alertas)

async function getMailTransporter() {
    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (smtpHost && smtpUser && smtpPass && !setupUtils.isPlaceholderValue(smtpPass)) {
        return {
            transporter: nodemailer.createTransport({
                host: smtpHost,
                port: Number(process.env.SMTP_PORT) || 587,
                secure: Number(process.env.SMTP_PORT) === 465,
                auth: { user: smtpUser, pass: smtpPass }
            }),
            from: `"UNID Admisiones • Metal-Uriel" <${smtpUser}>`,
            mode: 'smtp_live'
        };
    }

    // Fallback automático a Ethereal Email de Nodemailer si no hay credenciales SMTP en .env
    try {
        const testAccount = await nodemailer.createTestAccount();
        return {
            transporter: nodemailer.createTransport({
                host: 'smtp.ethereal.email',
                port: 587,
                secure: false,
                auth: { user: testAccount.user, pass: testAccount.pass }
            }),
            from: `"UNID Admisiones • Metal-Uriel" <${testAccount.user}>`,
            mode: 'ethereal_test'
        };
    } catch (e) {
        return { transporter: null, from: 'noreply@unid.mx', mode: 'console_only' };
    }
}

async function dispararNotificacionCorreo(eventoTipo, payload = {}) {
    const isSystemAlert = eventoTipo === 'ALERTA_SISTEMA';
    const destinatario = (
        payload.to ||
        (isSystemAlert
            ? (process.env.ALERT_ADMIN_EMAIL || process.env.ADMISSIONS_NOTIFICATION_EMAIL)
            : (process.env.ADMISSIONS_NOTIFICATION_EMAIL || process.env.ALERT_ADMIN_EMAIL)) ||
        'admisiones.campeche@unid.mx'
    ).trim();
    let subject = '';
    let htmlContent = '';

    const fechaHora = new Date().toLocaleString('es-MX', { timeZone: 'America/Merida' });

    if (eventoTipo === 'NUEVO_CONTACTO') {
        // Evento A (Nuevo Contacto)
        subject = 'Nuevo prospecto en WhatsApp';
        const phone = payload.telefono_celular || payload.phone || 'Desconocido';
        const msg = payload.mensaje_inicial || 'Inició conversación';
        const sede = payload.sede_id || 'campeche';

        htmlContent = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; background: #0B192C; padding: 24px; color: #f8fafc;">
            <div style="max-width: 600px; margin: 0 auto; background: #1E293B; border-radius: 16px; overflow: hidden; border: 1px solid #334155; border-top: 6px solid #38bdf8;">
                <div style="padding: 20px 24px; background: #0F172A; border-bottom: 1px solid #334155;">
                    <h2 style="margin: 0; font-size: 18px; color: #38bdf8;">💬 Evento A: Nuevo prospecto en WhatsApp</h2>
                    <p style="margin: 4px 0 0 0; font-size: 12px; color: #94a3b8;">Captado por Webhook Metal-Uriel • ${fechaHora}</p>
                </div>
                <div style="padding: 24px;">
                    <p style="font-size: 14px; color: #e2e8f0; margin-top: 0;">Se ha detectado un nuevo número iniciando conversación con el asistente de admisiones:</p>
                    <div style="background: #0F172A; border-radius: 12px; padding: 16px; border: 1px solid #334155; margin: 16px 0;">
                        <p style="margin: 6px 0; font-size: 14px; color: #f8fafc;">📱 <strong>Teléfono WhatsApp:</strong> <span style="color: #38bdf8;">${phone}</span></p>
                        <p style="margin: 6px 0; font-size: 14px; color: #f8fafc;">🏛️ <strong>Sede Asignada:</strong> <span style="color: #FFC72C; text-transform: uppercase;">${sede}</span></p>
                        <p style="margin: 6px 0; font-size: 14px; color: #f8fafc;">🆔 <strong>ID Lead Inicial en BD:</strong> #${payload.insertId || 'En proceso'}</p>
                        <p style="margin: 10px 0 0 0; padding-top: 10px; border-top: 1px solid #1E293B; font-size: 13px; color: #cbd5e1;">💬 <strong>Primer Mensaje:</strong> <em>"${msg}"</em></p>
                    </div>
                    <p style="font-size: 12px; color: #94a3b8;">Metal-Uriel ya se encuentra atendiendo al prospecto en tiempo real para recopilar sus 11 datos oficiales.</p>
                </div>
            </div>
        </div>`;
    } else if (eventoTipo === 'DATOS_COMPLETOS') {
        // Evento B (Datos Completos)
        const d = payload.datos || payload;
        const nombre = d.nombre_completo || 'Aspirante UNID';
        subject = `Ficha de aspirante completada - ${nombre}`;
        const jsonPretty = JSON.stringify(d, null, 2);

        htmlContent = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; background: #0B192C; padding: 24px; color: #f8fafc;">
            <div style="max-width: 640px; margin: 0 auto; background: #1E293B; border-radius: 16px; overflow: hidden; border: 1px solid #334155; border-top: 6px solid #FFC72C;">
                <div style="padding: 20px 24px; background: #0F172A; border-bottom: 1px solid #334155;">
                    <h2 style="margin: 0; font-size: 19px; color: #FFC72C;">📋 Evento B: Ficha de aspirante completada - ${nombre}</h2>
                    <p style="margin: 4px 0 0 0; font-size: 12px; color: #94a3b8;">11 Datos Oficiales Recopilados por IA • Ficha ID #${payload.insertId || 'N/A'}</p>
                </div>
                <div style="padding: 24px;">
                    <div style="background: #0F172A; border-radius: 12px; padding: 16px; margin-bottom: 18px; border: 1px solid #334155;">
                        <h3 style="margin: 0 0 8px 0; font-size: 17px; color: #ffffff;">${nombre}</h3>
                        <p style="margin: 4px 0; font-size: 14px; color: #FFC72C; font-weight: bold;">🎓 ${d.carrera_interes || 'Sin especificar'}</p>
                        <p style="margin: 4px 0; font-size: 13px; color: #38bdf8; font-family: monospace;">🆔 CURP Calculada (RENAPO): <strong>${d.curp || 'Calculada en sistema'}</strong></p>
                        <p style="margin: 4px 0; font-size: 13px; color: #cbd5e1;">📍 Campus: <strong>${d.campus_interes || 'Campeche'}</strong> • Modalidad: <strong>${d.modalidad_estudios || 'Presencial'}</strong></p>
                    </div>

                    <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #cbd5e1; margin-bottom: 20px;">
                        <tr style="border-bottom: 1px solid #334155;"><td style="padding: 7px 0; color: #94a3b8;">1. Nombre Completo:</td><td style="padding: 7px 0; font-weight: bold; text-align: right;">${d.nombre_completo || '-'}</td></tr>
                        <tr style="border-bottom: 1px solid #334155;"><td style="padding: 7px 0; color: #94a3b8;">2. Fecha de Nacimiento:</td><td style="padding: 7px 0; text-align: right;">${d.fecha_nacimiento || '-'}</td></tr>
                        <tr style="border-bottom: 1px solid #334155;"><td style="padding: 7px 0; color: #94a3b8;">3. Sexo:</td><td style="padding: 7px 0; text-align: right;">${d.sexo || '-'}</td></tr>
                        <tr style="border-bottom: 1px solid #334155;"><td style="padding: 7px 0; color: #94a3b8;">4. Estado de Nacimiento:</td><td style="padding: 7px 0; text-align: right;">${d.estado_nacimiento || '-'}</td></tr>
                        <tr style="border-bottom: 1px solid #334155;"><td style="padding: 7px 0; color: #94a3b8;">5. Teléfono Celular:</td><td style="padding: 7px 0; font-weight: bold; text-align: right; color: #4ade80;">${d.telefono_celular || '-'}</td></tr>
                        <tr style="border-bottom: 1px solid #334155;"><td style="padding: 7px 0; color: #94a3b8;">6. Correo Electrónico:</td><td style="padding: 7px 0; text-align: right; color: #38bdf8;">${d.correo_electronico || '-'}</td></tr>
                        <tr style="border-bottom: 1px solid #334155;"><td style="padding: 7px 0; color: #94a3b8;">7. Bachillerato:</td><td style="padding: 7px 0; text-align: right;">${d.bachillerato_procedencia || '-'}</td></tr>
                        <tr style="border-bottom: 1px solid #334155;"><td style="padding: 7px 0; color: #94a3b8;">8. Carrera de Interés:</td><td style="padding: 7px 0; text-align: right; color: #FFC72C; font-weight: bold;">${d.carrera_interes || '-'}</td></tr>
                        <tr style="border-bottom: 1px solid #334155;"><td style="padding: 7px 0; color: #94a3b8;">9. Dirección y CP:</td><td style="padding: 7px 0; text-align: right;">${d.direccion || '-'} (CP: ${d.codigo_postal || '-'})</td></tr>
                        <tr style="border-bottom: 1px solid #334155;"><td style="padding: 7px 0; color: #94a3b8;">10. Campus de Interés:</td><td style="padding: 7px 0; text-align: right;">${d.campus_interes || '-'}</td></tr>
                        <tr><td style="padding: 7px 0; color: #94a3b8;">11. Modalidad de Estudios:</td><td style="padding: 7px 0; text-align: right;">${d.modalidad_estudios || '-'}</td></tr>
                    </table>

                    <div style="margin-top: 16px;">
                        <p style="font-size: 12px; font-weight: bold; color: #FFC72C; margin-bottom: 6px;">📦 Bloque JSON Estructurado Emitido por IA:</p>
                        <pre style="background: #090D16; color: #38bdf8; padding: 14px; border-radius: 10px; border: 1px solid #334155; font-size: 11px; overflow-x: auto; font-family: Consolas, monospace;">${jsonPretty}</pre>
                    </div>
                </div>
            </div>
        </div>`;
    } else if (eventoTipo === 'CIERRE_INSCRITO') {
        // Evento C (Cierre/Inscrito)
        const lead = payload.lead || payload;
        const nombre = lead.nombre_completo || 'Alumno UNID';
        subject = `¡Nuevo Alumno Inscrito! - ${nombre}`;

        htmlContent = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; background: #0B192C; padding: 24px; color: #f8fafc;">
            <div style="max-width: 600px; margin: 0 auto; background: #1E293B; border-radius: 16px; overflow: hidden; border: 1px solid #059669; border-top: 6px solid #10B981;">
                <div style="padding: 20px 24px; background: #064E3B; border-bottom: 1px solid #059669;">
                    <h2 style="margin: 0; font-size: 20px; color: #A7F3D0;">🎉 Evento C: ¡Nuevo Alumno Inscrito! - ${nombre}</h2>
                    <p style="margin: 4px 0 0 0; font-size: 12px; color: #6EE7B7;">Cierre confirmado en Tablero Kanban • ${fechaHora}</p>
                </div>
                <div style="padding: 24px;">
                    <p style="font-size: 14px; color: #e2e8f0; margin-top: 0;">Un asesor ha movido exitosamente la tarjeta del prospecto a la columna <strong>Inscritos 🎉</strong> en el Centro de Mando:</p>
                    <div style="background: #0F172A; border-radius: 12px; padding: 16px; border: 1px solid #334155; margin: 16px 0;">
                        <h3 style="margin: 0 0 8px 0; font-size: 18px; color: #ffffff;">${nombre}</h3>
                        <p style="margin: 5px 0; font-size: 14px; color: #10B981; font-weight: bold;">🎓 Carrera: ${lead.carrera_interes || 'Confirmada'}</p>
                        <p style="margin: 5px 0; font-size: 13px; color: #38bdf8; font-family: monospace;">🆔 CURP: ${lead.curp || 'N/A'}</p>
                        <p style="margin: 5px 0; font-size: 13px; color: #cbd5e1;">📱 Teléfono: ${lead.telefono_celular || 'N/A'} • ✉️ Correo: ${lead.correo_electronico || 'N/A'}</p>
                        <p style="margin: 5px 0; font-size: 13px; color: #cbd5e1;">🏛️ Campus: ${lead.campus_interes || 'Campeche'} (${lead.modalidad_estudios || 'Presencial'})</p>
                        <p style="margin: 8px 0 0 0; font-size: 12px; color: #94a3b8;">👤 Procesado por: ${payload.asesor || 'Asesor de Admisiones'}</p>
                    </div>
                </div>
            </div>
        </div>`;
    } else if (eventoTipo === 'ALERTA_SISTEMA') {
        const titulo = payload.titulo || 'Incidente Crítico en Servidor Metal-Uriel';
        const detalle = String(payload.detalle || 'Sin detalle técnico.').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const hw = setupUtils.getSystemHardwareReport(PORT);
        subject = `🚨 [ALERTA SERVIDOR METAL-URIEL] ${titulo}`;
        htmlContent = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; background: #0B192C; padding: 24px; color: #f8fafc;">
            <div style="max-width: 620px; margin: 0 auto; background: #1E293B; border-radius: 16px; overflow: hidden; border: 1px solid #7f1d1d; border-top: 6px solid #ef4444;">
                <div style="padding: 20px 24px; background: #450a0a; border-bottom: 1px solid #7f1d1d;">
                    <h2 style="margin: 0; font-size: 18px; color: #fecaca;">🚨 Alerta Crítica de Life Support — Metal-Uriel</h2>
                    <p style="margin: 4px 0 0 0; font-size: 12px; color: #fca5a5;">Host: ${hw.hostname} • ${fechaHora}</p>
                </div>
                <div style="padding: 24px;">
                    <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #fbbf24;">${titulo}</h3>
                    <pre style="background: #0F172A; border-radius: 10px; padding: 14px; border: 1px solid #334155; font-size: 12px; color: #f8fafc; white-space: pre-wrap; word-break: break-word;">${detalle}</pre>
                    <p style="margin: 14px 0 0 0; font-size: 12px; color: #94a3b8;">
                        💻 RAM Libre: ${hw.freeMemGB} GB / ${hw.totalMemGB} GB • URLs LAN: ${hw.lanUrls.join(', ') || 'localhost'}
                    </p>
                </div>
            </div>
        </div>`;
    }

    const nowIso = new Date().toISOString();
    const logItem = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        evento: eventoTipo,
        eventoTipo: eventoTipo,
        destinatario,
        to: destinatario,
        asunto: subject,
        subject: subject,
        fecha: nowIso,
        timestamp: nowIso,
        estado: 'enviando',
        status: 'ENVIANDO',
        transport: 'SMTP/Ethereal',
        previewUrl: null
    };
    emailNotificationHistory.unshift(logItem);
    if (emailNotificationHistory.length > 50) emailNotificationHistory.pop();

    try {
        const { transporter, from, mode } = await getMailTransporter();
        if (!transporter) {
            logItem.estado = 'simulado_consola';
            logItem.status = 'ENVIADO';
            logItem.transport = 'Consola';
            console.log(`📧 [EMAIL TRIGGER - ${eventoTipo}] Para: ${destinatario} | Asunto: "${subject}" (Modo consola)`);
            return logItem;
        }

        const info = await transporter.sendMail({
            from,
            to: destinatario,
            subject,
            html: htmlContent
        });

        const previewUrl = mode === 'ethereal_test' ? nodemailer.getTestMessageUrl(info) : null;
        logItem.estado = mode === 'smtp_live' ? 'enviado_smtp' : 'enviado_ethereal';
        logItem.status = 'ENVIADO';
        logItem.transport = mode === 'smtp_live' ? 'SMTP Live' : 'Ethereal Test';
        logItem.previewUrl = previewUrl || null;

        // Registrar también en tabla SQL bitacora_notificaciones_correo si MariaDB está en línea
        if (isDatabaseReady) {
            dbPool.execute(
                'INSERT INTO bitacora_notificaciones_correo (evento_tipo, destinatario, asunto, estado, transporte, detalle) VALUES (?, ?, ?, ?, ?, ?)',
                [eventoTipo, destinatario, subject, logItem.estado, logItem.transport, previewUrl || null]
            ).catch(() => {});
        }

        console.log(`📧 [EMAIL ENVIADO - ${eventoTipo}] Destinatario: ${destinatario} | Asunto: "${subject}"`);
        if (previewUrl) {
            console.log(`🔗 [VISTA PREVIA DEL CORREO]: ${previewUrl}`);
        }
        return logItem;
    } catch (err) {
        logItem.estado = 'error: ' + err.message;
        logItem.status = 'ERROR';
        if (isDatabaseReady) {
            dbPool.execute(
                'INSERT INTO bitacora_notificaciones_correo (evento_tipo, destinatario, asunto, estado, transporte, detalle) VALUES (?, ?, ?, ?, ?, ?)',
                [eventoTipo, destinatario, subject, 'ERROR', 'SMTP', err.message]
            ).catch(() => {});
        }
        console.error(`⚠️ Error enviando correo (${eventoTipo}) a ${destinatario}:`, err.message);
        return logItem;
    }
}

async function enviarAlertaSistema(alertKey, titulo, detalle, force = false) {
    const adminEmail = (process.env.ALERT_ADMIN_EMAIL || process.env.ADMISSIONS_NOTIFICATION_EMAIL || '').trim();
    if (!adminEmail || setupUtils.isPlaceholderValue(adminEmail)) return null;
    const now = Date.now();
    const lastSent = systemAlertCooldowns.get(alertKey) || 0;
    const COOLDOWN_MS = 15 * 60 * 1000; // 15 min anti-spam por tipo de incidente
    if (!force && (now - lastSent) < COOLDOWN_MS) {
        return null;
    }
    systemAlertCooldowns.set(alertKey, now);
    return dispararNotificacionCorreo('ALERTA_SISTEMA', { to: adminEmail, titulo, detalle });
}

async function notificarEquipoAdmisiones(datos, insertId) {
    return dispararNotificacionCorreo('DATOS_COMPLETOS', { datos, insertId });
}

// ==========================================
// 10.5. Extractor Progresivo de los 11 Campos en Tiempo Real
// ==========================================
function extractPartialFieldsFromHistory(history) {
    if (!history || !Array.isArray(history) || history.length === 0) return {};
    const fields = {};

    // CRÍTICO: Filtrar ÚNICAMENTE los mensajes del usuario humano (nunca del bot)
    const userMessages = history
        .filter(h => h.role === 'user' || h.sender === 'user')
        .map(h => h.content || h.text || '')
        .filter(t => t.trim().length > 0);

    if (userMessages.length === 0) return {};

    const userText = userMessages.join('\n');

    // 1. Teléfono celular (10 dígitos o formato +52...)
    const phoneMatch = userText.match(/(?:\+?52\s?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}|\b981\d{7}\b|\b\d{10}\b/);
    if (phoneMatch) fields.telefono_celular = phoneMatch[0].replace(/[^\d+]/g, '');

    // 2. Correo electrónico
    const emailMatch = userText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) fields.correo_electronico = emailMatch[0].trim();

    // 3. Fecha de nacimiento (YYYY-MM-DD o DD/MM/YYYY)
    const dateMatch = userText.match(/\b(19\d\d|200\d)[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b|\b(0?[1-9]|[12]\d|3[01])[-/](0?[1-9]|1[0-2])[-/](19\d\d|200\d)\b/);
    if (dateMatch) fields.fecha_nacimiento = dateMatch[0].trim();

    // 4. Nombre completo (Buscar heurísticas limpias en los mensajes del usuario)
    const blacklistWords = ['preparatoria', 'bachillerato', 'carrera', 'campus', 'modalidad', 'interes', 'interés', 'procedencia', 'telefono', 'correo', 'nacimiento', 'estudios', 'de la', 'en la', 'unid', 'hola', 'buenas', 'informes'];
    
    for (const msg of userMessages) {
        const nameRegexMatch = msg.match(/(?:me llamo|mi nombre es|soy)\s+([A-ZÁÉÍÓÚÑa-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]+){1,4})/i);
        if (nameRegexMatch) {
            const candidate = nameRegexMatch[1].trim();
            const candLower = candidate.toLowerCase();
            const hasBlacklist = blacklistWords.some(bw => candLower.includes(bw));
            if (!hasBlacklist && candidate.split(/\s+/).length >= 2) {
                fields.nombre_completo = candidate;
                break;
            }
        }
    }

    // Heurística de respaldo para nombres en los mensajes del usuario
    if (!fields.nombre_completo) {
        for (const msg of userMessages) {
            const lines = msg.split(/[\r\n,]+/);
            for (const line of lines) {
                const trimmed = line.trim();
                const words = trimmed.split(/\s+/);
                if (words.length >= 2 && words.length <= 4 && words.every(w => /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/.test(w))) {
                    const candLower = trimmed.toLowerCase();
                    const hasBlacklist = blacklistWords.some(bw => candLower.includes(bw));
                    if (!hasBlacklist) {
                        fields.nombre_completo = trimmed;
                        break;
                    }
                }
            }
            if (fields.nombre_completo) break;
        }
    }

    // 5. Sexo
    if (/\b(hombre|masculino|varon|varón|chico)\b/i.test(userText) && !/\bmujer\b/i.test(userText)) fields.sexo = 'Masculino';
    else if (/\b(mujer|femenino|dama|chica)\b/i.test(userText)) fields.sexo = 'Femenino';

    // 6. Estado de nacimiento / procedencia
    const estadoMatch = userText.match(/\b(campeche|tabasco|yucat[aá]n|quintana roo|veracruz|chiapas|cdmx|ciudad de m[eé]xico|jalisco|puebla|m[eé]xico|guerrero|oaxaca|nuevo le[oó]n|monterrey|guadalajara|m[eé]rida|villahermosa)\b/i);
    if (estadoMatch) fields.estado_nacimiento = estadoMatch[1].charAt(0).toUpperCase() + estadoMatch[1].slice(1).toLowerCase();

    // 7. Bachillerato
    const prepMatch = userText.match(/(?:coba(?:cam)?|cbtis|cetis|conalep|prepa\s*\d*|colegio\s*[\w]+|bachilleres|cumbres|cetmar|xail|instituto\s*[\w]+)[^,.\n]*/i);
    if (prepMatch) {
        let cleanPrep = prepMatch[0].replace(/[\*\_]+/g, '').trim();
        if (!/^(?:preparatoria|bachillerato)\s*(?:de)?\s*procedencia$/i.test(cleanPrep)) {
            fields.bachillerato_procedencia = cleanPrep;
        }
    } else {
        for (const uMsg of userMessages) {
            const match = uMsg.match(/(?:la\s+preparatoria\s+era\s+|era\s+|vengo\s+de\s+|salí\s+del?\s+)(.+)/i);
            if (match) {
                fields.bachillerato_procedencia = match[1].replace(/[\*\_]+/g, '').trim();
                break;
            }
        }
    }

    // 8. Carrera de interés
    const carreraMatch = userText.match(/(?:ingenier[ií]a en software|software y sistemas|ingenier[ií]a en sistemas|sistemas computacionales|ingenier[ií]a|software|sistemas|derecho|administraci[oó]n|dise[ñn]o gr[aá]fico|psicolog[ií]a|mercadotecnia|arquitectura|comunicaci[oó]n|contabilidad|educaci[oó]n f[ií]sica|criminolog[ií]a|pedagog[ií]a|negocios internacionales)[^,.\n]*/i);
    if (carreraMatch) {
        let c = carreraMatch[0].trim();
        if (/software|sistemas/i.test(c)) fields.carrera_interes = 'Ingeniería en Software y Sistemas Computacionales';
        else fields.carrera_interes = c;
    }

    // 9. Dirección y CP
    const cpMatch = userText.match(/\b(?:CP\s*|c\.p\.\s*)?(\d{5})\b/i);
    if (cpMatch) fields.codigo_postal = cpMatch[1];
    const dirMatch = userText.match(/(?:calle|colonia|col\.|av\.|avenida|fracc\.|fraccionamiento|mza|lote|manzana)[^.\n]*/i);
    if (dirMatch) fields.direccion = dirMatch[0].trim() + (fields.codigo_postal ? ` CP ${fields.codigo_postal}` : '');

    // 10. Campus de interés
    if (/campeche/i.test(userText)) fields.campus_interes = 'Campus San Francisco de Campeche';
    else if (/cancun|cancún/i.test(userText)) fields.campus_interes = 'Campus Cancún';
    else if (/merida|mérida/i.test(userText)) fields.campus_interes = 'Campus Mérida';
    else if (/online|virtual|en l[ií]nea/i.test(userText)) fields.campus_interes = 'UNID Online Nacional';
    else fields.campus_interes = 'Campus San Francisco de Campeche';

    // 11. Modalidad
    if (/online|en l[ií]nea|virtual|a distancia/i.test(userText)) fields.modalidad_estudios = 'Licenciaturas Online (100% Virtual)';
    else if (/ejecutiva|sabad|fin de semana|trabaj/i.test(userText)) fields.modalidad_estudios = 'Modalidad Ejecutiva (Sábados)';
    else if (/presencial|escolarizad|matutino/i.test(userText)) fields.modalidad_estudios = 'Presencial';

    // 12. Cálculo automático de CURP oficial (RENAPO)
    if (fields.nombre_completo && fields.fecha_nacimiento) {
        fields.curp = generarCurp(fields);
    }

    return fields;
}

// ==========================================
// 10.6. Extractor Seguro de JSON y Limpiador de Chat
// ==========================================
function extractJsonFromLlmReply(rawText) {
    if (!rawText || typeof rawText !== 'string') return { cleanReply: rawText, jsonData: null };

    let cleanReply = rawText;
    let jsonData = null;

    // 1. Bloque de código markdown ```json ... ``` o ``` ... ```
    const codeBlockMatch = rawText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
    if (codeBlockMatch) {
        try {
            const parsed = JSON.parse(codeBlockMatch[1]);
            if (parsed && typeof parsed === 'object') {
                jsonData = parsed;
                cleanReply = rawText.replace(codeBlockMatch[0], '').trim();
            }
        } catch (e) {}
    }

    // 2. Objeto JSON embebido si no vino en bloque de código
    if (!jsonData) {
        const rawJsonMatch = rawText.match(/(\{[\s\r\n]*"(?:completado|nombre_completo)"[\s\S]*\})/i);
        if (rawJsonMatch) {
            try {
                const parsed = JSON.parse(rawJsonMatch[1]);
                if (parsed && typeof parsed === 'object') {
                    jsonData = parsed;
                    cleanReply = rawText.replace(rawJsonMatch[1], '').trim();
                }
            } catch (e) {}
        }
    }

    // 3. Limpiar tags técnicos del sistema ([ENVIAR_PDF...], [ADJUNTAR_RECURSO...], ```json, etc.) para que el usuario NUNCA vea códigos
    cleanReply = cleanReply
        .replace(/\[ADJUNTAR_RECURSO\s*:\s*[^\]]+\]/gi, '')
        .replace(/\[ENVIAR_PDF[^\]]*\]/gi, '')
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

    return { cleanReply, jsonData };
}

// ==========================================
// 11. Procesamiento Central de Mensajes (Webhook + Web Simulator)
// ==========================================
async function guardarMensajeHistorialBD(senderPhone, rol, mensaje, sedeId = 'campeche', meta = {}) {
    const canonical = normalizePhoneCanonical(senderPhone);
    const dialPhone = pickBestDialPhone([senderPhone]);
    const adjuntoStr = meta.documentAttachment ? JSON.stringify(meta.documentAttachment) : null;
    try {
        const cicloActivo = await getActiveCicloEscolar(sedeId || 'campeche');
        await dbPool.execute(
            `INSERT INTO historial_conversaciones
                (sede_id, ciclo_escolar, telefono_celular, telefono_canonico, rol, remitente_nombre, modelo_ia, whatsapp_message_id, adjunto_json, mensaje)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                sedeId || 'campeche',
                cicloActivo,
                dialPhone,
                canonical,
                rol,
                meta.senderName ? String(meta.senderName).slice(0, 150) : null,
                meta.modelUsed ? String(meta.modelUsed).slice(0, 80) : null,
                meta.whatsappMessageId ? String(meta.whatsappMessageId).slice(0, 120) : null,
                adjuntoStr,
                String(mensaje || '')
            ]
        );
        if (canonical) {
            dbPool.execute(
                'UPDATE aspirantes SET ultimo_mensaje_at = CURRENT_TIMESTAMP WHERE telefono_canonico = ?',
                [canonical]
            ).catch(() => {});
        }
    } catch (_) {
        try {
            const cicloActivo = await getActiveCicloEscolar(sedeId || 'campeche');
            await dbPool.execute(
                'INSERT INTO historial_conversaciones (sede_id, ciclo_escolar, telefono_celular, rol, mensaje) VALUES (?, ?, ?, ?, ?)',
                [sedeId || 'campeche', cicloActivo, dialPhone, rol, String(mensaje || '')]
            );
        } catch (_) {}
    }
}

async function hydrateConversationFromDb(senderPhone) {
    const canonical = normalizePhoneCanonical(senderPhone);
    if (!canonical || conversationMemory.has(canonical)) return;
    try {
        const [rows] = await dbPool.query(
            `SELECT rol, mensaje, remitente_nombre, modelo_ia, adjunto_json, timestamp
             FROM historial_conversaciones
             WHERE telefono_canonico = ?
                OR REPLACE(REPLACE(REPLACE(telefono_celular, '+', ''), ' ', ''), '-', '') LIKE ?
             ORDER BY timestamp DESC LIMIT 20`,
            [canonical, `%${canonical}%`]
        );
        if (rows && rows.length > 0) {
            const ordered = rows.reverse().map(r => {
                let att = null;
                if (r.adjunto_json) { try { att = JSON.parse(r.adjunto_json); } catch (_) {} }
                return {
                    role: r.rol,
                    content: r.mensaje,
                    senderName: r.remitente_nombre || null,
                    modelUsed: r.modelo_ia || null,
                    documentAttachment: att,
                    timestamp: r.timestamp
                };
            });
            conversationMemory.set(canonical, ordered);
        }
    } catch (_) {}
}

function buildAttachmentObject(resourceItem) {
    if (!resourceItem) return null;
    const isImage = resourceItem.tipo_archivo === 'imagen';
    const resourceId = resourceItem.codigo_recurso || resourceItem.id;
    let rawUrl = resourceItem.url_recurso || resourceItem.pdfUrl || `/api/brochures/${resourceId}/download`;
    // Evitar URLs placeholder rotas de digitalmedia.talisis.com
    if (String(rawUrl).includes('digitalmedia.talisis.com')) {
        rawUrl = `/api/brochures/${resourceId}/download`;
    }
    const categoryTitles = {
        plan_estudios: 'Plan de Estudios',
        oferta_educativa: 'Oferta Educativa',
        horarios: 'Horario Oficial',
        instalaciones: 'Instalaciones UNID',
        becas_costos: 'Guía de Becas y Costos'
    };
    const prefix = categoryTitles[resourceItem.categoria] || 'Recurso Oficial';
    return {
        id: resourceId,
        codigo_recurso: resourceId,
        categoria: resourceItem.categoria || 'plan_estudios',
        tipo_archivo: resourceItem.tipo_archivo || 'pdf',
        title: `${prefix}: ${resourceItem.titulo || resourceItem.carrera}`,
        titulo: resourceItem.titulo || resourceItem.carrera,
        descripcion_ia: resourceItem.descripcion_ia || '',
        duracion: resourceItem.duracion || '3 años (9 cuatrimestres)',
        fileName: resourceItem.fileName || resourceItem.file_name || `${resourceId}.${isImage ? 'png' : 'pdf'}`,
        size: resourceItem.size || resourceItem.tamano || '1.2 MB',
        rvoe: resourceItem.rvoe || 'Oficial UNID',
        modalidad: resourceItem.modalidad || 'Presencial',
        pdfUrl: rawUrl,
        url_recurso: rawUrl,
        downloadUrl: rawUrl.startsWith('/uploads/') || rawUrl.startsWith('http') ? rawUrl : `/api/brochures/${resourceId}/download`
    };
}

async function processChatMessage(senderPhone, messageText, requestedModelId = null, sedeId = 'campeche', meta = {}) {
    const canonical = normalizePhoneCanonical(senderPhone) || senderPhone;
    const dialPhone = pickBestDialPhone([senderPhone]);
    const isFirstContactInMemory = !conversationMemory.has(canonical) && !conversationMemory.has(senderPhone);

    if (isFirstContactInMemory) {
        await hydrateConversationFromDb(canonical);
        const regResult = await registrarLeadInicialEnBD(dialPhone, messageText, sedeId);
        if (regResult.isNew) {
            dispararNotificacionCorreo('NUEVO_CONTACTO', {
                telefono_celular: dialPhone,
                mensaje_inicial: messageText,
                sede_id: sedeId,
                insertId: regResult.insertId
            }).catch(console.error);
        }
    }

    await guardarMensajeHistorialBD(dialPhone, 'user', messageText, sedeId, {
        senderName: meta.senderName || 'Aspirante',
        whatsappMessageId: meta.whatsappMessageId || null
    });

    const { reply: llmReply, modelUsed } = await callMetalUrielLLM(canonical, messageText, requestedModelId, sedeId);
    
    // Separar y limpiar cualquier JSON y tags técnicos
    const { cleanReply, jsonData } = extractJsonFromLlmReply(llmReply);
    const poolItems = await getActivePoolItems(sedeId);
    const brochureDetected = detectBrochureRequest(messageText, dialPhone, llmReply, poolItems);
    const formattedAttachment = buildAttachmentObject(brochureDetected);

    // Actualizar el último mensaje de assistant en conversationMemory con cleanReply y el documentAttachment si aplica
    const currentHistory = conversationMemory.get(canonical) || [];
    if (currentHistory.length > 0 && currentHistory[currentHistory.length - 1].role === 'assistant') {
        currentHistory[currentHistory.length - 1].content = cleanReply || llmReply;
        currentHistory[currentHistory.length - 1].modelUsed = modelUsed;
        currentHistory[currentHistory.length - 1].timestamp = new Date();
        if (formattedAttachment) {
            currentHistory[currentHistory.length - 1].documentAttachment = formattedAttachment;
        }
    }

    const partialFields = extractPartialFieldsFromHistory(currentHistory);

    // Si el LLM generó el JSON de registro completo o completó la ficha (Evento B)
    if (jsonData && (jsonData.completado || (jsonData.nombre_completo && jsonData.carrera_interes))) {
        const guardrail = securityUtils.validateStructuredLeadJson(jsonData);
        const validatedJson = guardrail.data || jsonData;
        if (guardrail.warnings && guardrail.warnings.length > 0) {
            console.warn(`🛡️ [JSON GUARDRAIL] Normalizaciones aplicadas:`, guardrail.warnings.join('; '));
        }

        let insertId = null;
        try {
            validatedJson.completado = true;
            if (!validatedJson.telefono_celular) validatedJson.telefono_celular = dialPhone;
            if (!validatedJson.curp && validatedJson.nombre_completo && validatedJson.fecha_nacimiento) {
                validatedJson.curp = generarCurp(validatedJson);
            }
            insertId = await guardarAspiranteEnBD(validatedJson, dialPhone);
            console.log(`🎉 [REGISTRO EXITOSO] Aspirante ${validatedJson.nombre_completo} guardado en MariaDB con ID #${insertId}`);
            // Trigger Evento B: "Ficha de aspirante completada - [Nombre del Aspirante]"
            notificarEquipoAdmisiones(validatedJson, insertId).catch(console.error);
        } catch (dbErr) {
            console.error('⚠️ Error guardando en MariaDB:', dbErr.message);
        }

        // Actualizar el estado de sesión del usuario para memoria persistente (NUNCA BORRAR HISTORIAL)
        userSessionState.set(canonical, {
            isRegistered: true,
            leadData: validatedJson,
            insertId,
            registeredAt: new Date(),
            lastActivityAt: Date.now()
        });

        const finalReply = cleanReply && cleanReply.length > 20 ? cleanReply : (
            `¡Muchas gracias *${validatedJson.nombre_completo || 'estimado aspirante'}*! 🎉\n\n` +
            `He registrado exitosamente tu ficha para la carrera de *${validatedJson.carrera_interes || 'tu carrera de interés'}* en la modalidad *${validatedJson.modalidad_estudios || 'Presencial'}* (Campus: ${validatedJson.campus_interes || 'Campeche'}).\n\n` +
            `Tu expediente ha sido enviado a la Coordinación de Admisiones para validar tu beca del 50% y el 90% de descuento en tu inscripción. Un asesor se comunicará contigo al ${validatedJson.telefono_celular || dialPhone} para concluir tu pre-registro.\n\n` +
            `¡Bienvenido a la familia UNID! 🔴🐾`
        );

        await guardarMensajeHistorialBD(dialPhone, 'assistant', finalReply, sedeId, {
            senderName: 'Metal-Uriel IA',
            modelUsed,
            documentAttachment: formattedAttachment
        });

        return {
            reply: finalReply,
            completed: true,
            leadCompleted: true,
            leadData: validatedJson,
            partialFields: validatedJson,
            insertId,
            modelUsed,
            documentAttachment: formattedAttachment
        };
    }

    const replyToSend = cleanReply || llmReply;
    await guardarMensajeHistorialBD(dialPhone, 'assistant', replyToSend, sedeId, {
        senderName: 'Metal-Uriel IA',
        modelUsed,
        documentAttachment: formattedAttachment
    });

    return {
        reply: replyToSend,
        completed: false,
        leadCompleted: false,
        leadData: null,
        partialFields: partialFields,
        modelUsed,
        documentAttachment: formattedAttachment
    };
}

// ==========================================
// 12. Enviar mensaje de vuelta a WhatsApp Cloud API (Soporta Texto, Subida Binaria Directa de PDF e Imágenes a Meta /media)
// ==========================================
async function resolveAttachmentBinary(documentAttachment) {
    const isImage = documentAttachment.tipo_archivo === 'imagen';
    const safeFileName = documentAttachment.fileName || `Recurso_UNID.${isImage ? 'jpg' : 'pdf'}`;
    const rawUrl = documentAttachment.url_recurso || documentAttachment.pdfUrl || '';

    const inferMimeType = (fname, defaultMime) => {
        const ext = path.extname(String(fname || '')).toLowerCase();
        if (ext === '.png') return 'image/png';
        if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
        if (ext === '.webp') return 'image/webp';
        if (ext === '.pdf') return 'application/pdf';
        return defaultMime;
    };

    // 1. Si apunta a un archivo local subido en /uploads/...
    if (rawUrl.startsWith('/uploads/')) {
        const localPath = path.join(__dirname, 'public', rawUrl);
        if (fs.existsSync(localPath)) {
            return {
                buffer: fs.readFileSync(localPath),
                mimeType: inferMimeType(localPath, isImage ? 'image/jpeg' : 'application/pdf'),
                fileName: safeFileName
            };
        }
    }

    // 2. Si es una URL externa real (y NO el dominio inexistente digitalmedia.talisis.com), intentar descargar binario
    if ((rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) && !rawUrl.includes('digitalmedia.talisis.com')) {
        try {
            const resp = await axios.get(rawUrl, { responseType: 'arraybuffer', timeout: 8000 });
            const contentType = resp.headers?.['content-type'] || inferMimeType(safeFileName, isImage ? 'image/jpeg' : 'application/pdf');
            return {
                buffer: Buffer.from(resp.data),
                mimeType: contentType.split(';')[0].trim(),
                fileName: safeFileName
            };
        } catch (err) {
            console.warn(`⚠️ No se pudo descargar recurso externo (${rawUrl}), generando PDF oficial local:`, err.message);
        }
    }

    // 3. Verificar si ya existe el archivo físico en /public/uploads/recursos/ o generarlo en este instante
    const fallbackDiskPath = path.join(UPLOADS_DIR, safeFileName);
    if (fs.existsSync(fallbackDiskPath) && !isImage) {
        return {
            buffer: fs.readFileSync(fallbackDiskPath),
            mimeType: 'application/pdf',
            fileName: safeFileName
        };
    }

    const generatedPdf = generateOfficialPdfBuffer(documentAttachment);
    try {
        fs.writeFileSync(fallbackDiskPath, generatedPdf);
    } catch (_) {}

    return {
        buffer: generatedPdf,
        mimeType: 'application/pdf',
        fileName: safeFileName.endsWith('.pdf') ? safeFileName : `${safeFileName}.pdf`
    };
}

async function uploadMediaToWhatsAppCloud(buffer, mimeType, fileName) {
    const mediaUrl = `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID}/media`;
    const formData = new FormData();
    formData.append('messaging_product', 'whatsapp');
    formData.append('type', mimeType);
    formData.append('file', new Blob([buffer], { type: mimeType }), fileName);

    const response = await fetch(mediaUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${WHATSAPP_TOKEN}`
        },
        body: formData
    });

    const data = await response.json();
    if (!response.ok || !data.id) {
        throw new Error(data.error?.message || `Error subiendo media a Meta (${response.status})`);
    }
    return data.id;
}

async function sendWhatsAppMessage(to, messageText, documentAttachment = null) {
    if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
        console.log(`[SIMULACIÓN WHATSAPP] Enviando a ${to}: ${messageText}`);
        return;
    }

    const url = `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

    try {
        // 1. Enviar mensaje de texto al usuario
        if (messageText && messageText.trim()) {
            await axios.post(
                url,
                {
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: to,
                    type: 'text',
                    text: { body: messageText.trim() }
                },
                {
                    headers: {
                        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            console.log(`💬 [WHATSAPP ENVIADO] Texto enviado con éxito a ${to}`);
        }

        // 2. Enviar documento PDF o Imagen adjunta subiendo el archivo binario directo a Meta Cloud API (/media)
        if (documentAttachment) {
            const { buffer, mimeType, fileName } = await resolveAttachmentBinary(documentAttachment);
            console.log(`📤 [META MEDIA UPLOAD] Subiendo "${fileName}" (${Math.round(buffer.length / 1024)} KB, ${mimeType}) a Meta Cloud API...`);
            const mediaId = await uploadMediaToWhatsAppCloud(buffer, mimeType, fileName);
            console.log(`✅ [META MEDIA ID] Archivo registrado en Meta con ID: ${mediaId}`);

            if (documentAttachment.tipo_archivo === 'imagen' && mimeType.startsWith('image/')) {
                await axios.post(
                    url,
                    {
                        messaging_product: 'whatsapp',
                        recipient_type: 'individual',
                        to: to,
                        type: 'image',
                        image: {
                            id: mediaId,
                            caption: `🏛️ ${documentAttachment.title} (${documentAttachment.modalidad || 'UNID'})`
                        }
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );
                console.log(`✅ [IMAGEN ENVIADA] ${fileName} entregada exitosamente a WhatsApp ${to} (media_id: ${mediaId})`);
            } else {
                await axios.post(
                    url,
                    {
                        messaging_product: 'whatsapp',
                        recipient_type: 'individual',
                        to: to,
                        type: 'document',
                        document: {
                            id: mediaId,
                            filename: fileName,
                            caption: `📄 ${documentAttachment.title} (Validez Oficial SEP: ${documentAttachment.rvoe || 'Oficial UNID'})`
                        }
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );
                console.log(`✅ [DOCUMENTO ENVIADO] ${fileName} entregado exitosamente a WhatsApp ${to} (media_id: ${mediaId})`);
            }
        }
    } catch (error) {
        console.error('❌ Error enviando mensaje/documento a WhatsApp API:', error.response?.data || error.message);
    }
}

// ==========================================
// 13. Middleware de Autenticación y Autorización RBAC (JWT)
// ==========================================
function normalizeRole(rawRole) {
    const r = String(rawRole || '').toLowerCase();
    if (r === 'desarrollador' || r === 'superadmin' || r === 'dev') return 'desarrollador';
    if (r === 'administrador' || r === 'admin') return 'administrador';
    return 'usuario';
}

function getRoleTitle(rol) {
    if (rol === 'desarrollador') return 'Desarrollador (Superadmin Global)';
    if (rol === 'administrador') return 'Administrador de Sede';
    return 'Usuario (Asesor de Admisiones)';
}

function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Acceso no autorizado. Se requiere token JWT.' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        decoded.rol = normalizeRole(decoded.rol || decoded.role);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Token inválido o expirado.' });
    }
}

function optionalAuthMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
            const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
            decoded.rol = normalizeRole(decoded.rol || decoded.role);
            req.user = decoded;
        } catch (_) {}
    }
    next();
}

function authorizeRoles(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'No autenticado.' });
        }
        const userRol = normalizeRole(req.user.rol || req.user.role);
        if (!allowedRoles.includes(userRol)) {
            return res.status(403).json({
                error: `Permiso denegado. Tu rol actual (${userRol}) no tiene autorización para esta acción.`
            });
        }
        next();
    };
}

// ==========================================
// 14. Endpoints API: Pool Multimedia, Oferta, Horarios, Instalaciones & Ciclos Escolares
// ==========================================

// Helper para guardar archivo subido en base64 a /public/uploads/recursos/
function saveUploadedBase64File(fileData, originalFileName, prefixCode = 'recurso') {
    if (!fileData || typeof fileData !== 'string' || !fileData.startsWith('data:')) {
        return null;
    }
    const matches = fileData.match(/^data:([A-Za-z0-9-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) return null;

    const mimeType = matches[1].toLowerCase();
    const buffer = Buffer.from(matches[2], 'base64');

    let ext = '.pdf';
    if (mimeType.includes('png')) ext = '.png';
    else if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = '.jpg';
    else if (mimeType.includes('webp')) ext = '.webp';
    else if (originalFileName && path.extname(originalFileName)) {
        ext = path.extname(originalFileName).toLowerCase();
    }

    const safeBase = (originalFileName ? path.basename(originalFileName, path.extname(originalFileName)) : prefixCode)
        .replace(/[^a-zA-Z0-9_\-]/g, '_')
        .substring(0, 50);
    const finalFileName = `${Date.now()}_${safeBase}${ext}`;
    const fullDiskPath = path.join(UPLOADS_DIR, finalFileName);
    fs.writeFileSync(fullDiskPath, buffer);

    const sizeKB = Math.round(buffer.length / 1024);
    const sizeFormatted = sizeKB >= 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`;
    const tipoArchivo = ['.png', '.jpg', '.jpeg', '.webp'].includes(ext) ? 'imagen' : 'pdf';

    return {
        url_recurso: `/uploads/recursos/${finalFileName}`,
        file_name: originalFileName || finalFileName,
        tamano: sizeFormatted,
        tipo_archivo: tipoArchivo
    };
}

// 0. Ciclos Escolares por Sede (GET & POST) - Protegido con JWT para los 3 roles
app.get('/api/ciclos', authMiddleware, async (req, res) => {
    try {
        let sedeId = req.query.sede_id || req.query.campus || 'campeche';
        if (req.user && req.user.rol !== 'desarrollador' && req.user.sede_id) {
            sedeId = req.user.sede_id;
        }
        if (sedeId === 'all' || sedeId === 'todas') sedeId = 'campeche';

        const [rows] = await dbPool.query(
            'SELECT * FROM ciclos_escolares_sede WHERE sede_id = ? LIMIT 1',
            [sedeId]
        );
        let activeCiclo = '2026-3 Septiembre';
        let list = ['2026-1 Enero', '2026-2 Mayo', '2026-3 Septiembre', '2027-1 Enero'];

        if (rows.length > 0) {
            activeCiclo = rows[0].ciclo_activo || activeCiclo;
            try {
                const parsed = JSON.parse(rows[0].ciclos_disponibles || '[]');
                if (Array.isArray(parsed) && parsed.length > 0) list = parsed;
            } catch (_) {}
        }
        if (!list.includes(activeCiclo)) list.push(activeCiclo);

        const formattedCiclos = list.map((c, idx) => ({
            id: idx + 1,
            sede_id: sedeId,
            ciclo_escolar: c,
            es_activo: c === activeCiclo ? 1 : 0
        }));

        res.json({
            success: true,
            sede_id: sedeId,
            activeCiclo,
            ciclos: formattedCiclos
        });
    } catch (err) {
        res.json({
            success: true,
            sede_id: 'campeche',
            activeCiclo: '2026-3 Septiembre',
            ciclos: [
                { id: 1, sede_id: 'campeche', ciclo_escolar: '2026-2 Mayo', es_activo: 0 },
                { id: 2, sede_id: 'campeche', ciclo_escolar: '2026-3 Septiembre', es_activo: 1 },
                { id: 3, sede_id: 'campeche', ciclo_escolar: '2027-1 Enero', es_activo: 0 }
            ]
        });
    }
});

app.post('/api/ciclos', authMiddleware, async (req, res) => {
    try {
        let sedeId = req.body.sede_id || 'campeche';
        if (req.user && req.user.rol !== 'desarrollador' && req.user.sede_id) {
            sedeId = req.user.sede_id;
        }
        if (sedeId === 'all' || sedeId === 'todas') sedeId = 'campeche';

        const { ciclo_escolar } = req.body;
        if (!ciclo_escolar || !String(ciclo_escolar).trim()) {
            return res.status(400).json({ success: false, error: 'El nombre del ciclo escolar es obligatorio.' });
        }
        const cleanCiclo = String(ciclo_escolar).trim();

        const [rows] = await dbPool.query('SELECT * FROM ciclos_escolares_sede WHERE sede_id = ? LIMIT 1', [sedeId]);
        let list = ['2026-1 Enero', '2026-2 Mayo', '2026-3 Septiembre', '2027-1 Enero'];
        if (rows.length > 0 && rows[0].ciclos_disponibles) {
            try {
                const parsed = JSON.parse(rows[0].ciclos_disponibles);
                if (Array.isArray(parsed) && parsed.length > 0) list = parsed;
            } catch (_) {}
        }
        if (!list.includes(cleanCiclo)) list.push(cleanCiclo);

        await dbPool.execute(`
            INSERT INTO ciclos_escolares_sede (sede_id, ciclo_activo, ciclos_disponibles, updated_by)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE ciclo_activo = VALUES(ciclo_activo), ciclos_disponibles = VALUES(ciclos_disponibles), updated_by = VALUES(updated_by)
        `, [sedeId, cleanCiclo, JSON.stringify(list), req.user?.correo_institucional || 'Admin']);

        activeSchoolCyclesMemory.set(sedeId, cleanCiclo);
        console.log(`📅 [CICLO ESCOLAR ACTIVO] Sede '${sedeId}' actualizada a ciclo: ${cleanCiclo}`);

        const formattedCiclos = list.map((c, idx) => ({
            id: idx + 1,
            sede_id: sedeId,
            ciclo_escolar: c,
            es_activo: c === cleanCiclo ? 1 : 0
        }));

        res.json({
            success: true,
            message: `Ciclo escolar activo actualizado a ${cleanCiclo}`,
            activeCiclo: cleanCiclo,
            ciclos: formattedCiclos
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// 0.5. CRUD Completo de Categorías del Pool Multimedia (/api/pool/categories)
// ==========================================
const DEFAULT_POOL_CATEGORIES = [
    { id: 1, slug: 'plan_estudios', nombre: 'Planes de Estudio', icono: '📚', color: 'amber', descripcion: 'Mallas curriculares y planes de estudio por licenciatura e ingeniería', orden: 1 },
    { id: 2, slug: 'oferta_educativa', nombre: 'Oferta Educativa', icono: '🎓', color: 'purple', descripcion: 'Catálogos generales de carreras, modalidades e información académica', orden: 2 },
    { id: 3, slug: 'horarios', nombre: 'Horarios de Clase', icono: '🕒', color: 'emerald', descripcion: 'Horarios de clases por periodo escolar y modalidad', orden: 3 },
    { id: 4, slug: 'instalaciones', nombre: 'Fotos e Instalaciones', icono: '🏛️', color: 'sky', descripcion: 'Fotografías del campus, cabinas de radio/TV, laboratorios y salas', orden: 4 },
    { id: 5, slug: 'becas_costos', nombre: 'Becas y Costos', icono: '💰', color: 'rose', descripcion: 'Convocatorias de becas, colegiaturas, descuentos y financiamiento', orden: 5 }
];

app.get('/api/pool/categories', authMiddleware, async (req, res) => {
    try {
        const [rows] = await dbPool.query('SELECT * FROM pool_categorias WHERE activa = 1 ORDER BY orden ASC, id ASC');
        if (rows && rows.length > 0) {
            return res.json({ success: true, categories: rows });
        }
        return res.json({ success: true, categories: DEFAULT_POOL_CATEGORIES });
    } catch (err) {
        return res.json({ success: true, categories: DEFAULT_POOL_CATEGORIES });
    }
});

app.post('/api/pool/categories', authMiddleware, async (req, res) => {
    try {
        const { nombre, icono, color, descripcion, slug: customSlug } = req.body;
        if (!nombre || !String(nombre).trim()) {
            return res.status(400).json({ success: false, error: 'El nombre de la categoría es obligatorio.' });
        }
        const cleanNombre = String(nombre).trim();
        let slug = (customSlug || cleanNombre)
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .substring(0, 60);
        if (!slug) slug = `cat_${Date.now()}`;

        const [existing] = await dbPool.query('SELECT id FROM pool_categorias WHERE slug = ? LIMIT 1', [slug]);
        if (existing.length > 0) {
            slug = `${slug}_${Date.now().toString().slice(-3)}`;
        }

        const cleanIcono = (icono || '📁').trim();
        const cleanColor = (color || 'amber').trim();
        const cleanDesc = (descripcion || '').trim();

        const [result] = await dbPool.execute(
            `INSERT INTO pool_categorias (slug, nombre, icono, color, descripcion, orden, activa) VALUES (?, ?, ?, ?, ?, 10, 1)`,
            [slug, cleanNombre, cleanIcono, cleanColor, cleanDesc]
        );

        const newCat = {
            id: result.insertId,
            slug,
            nombre: cleanNombre,
            icono: cleanIcono,
            color: cleanColor,
            descripcion: cleanDesc,
            activa: 1
        };
        console.log(`🏷️ [POOL CATEGORÍA CREADA] ${cleanIcono} ${cleanNombre} (${slug})`);
        return res.status(201).json({ success: true, category: newCat });
    } catch (err) {
        console.error('Error creando categoría del Pool:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/pool/categories/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, icono, color, descripcion } = req.body;
        if (!nombre || !String(nombre).trim()) {
            return res.status(400).json({ success: false, error: 'El nombre de la categoría es obligatorio.' });
        }

        const [rows] = await dbPool.query('SELECT * FROM pool_categorias WHERE id = ? OR slug = ? LIMIT 1', [id, id]);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Categoría no encontrada.' });
        }
        const current = rows[0];
        const cleanNombre = String(nombre).trim();
        const cleanIcono = (icono || current.icono || '📁').trim();
        const cleanColor = (color || current.color || 'amber').trim();
        const cleanDesc = descripcion !== undefined ? String(descripcion).trim() : (current.descripcion || '');

        await dbPool.execute(
            `UPDATE pool_categorias SET nombre = ?, icono = ?, color = ?, descripcion = ? WHERE id = ?`,
            [cleanNombre, cleanIcono, cleanColor, cleanDesc, current.id]
        );

        console.log(`✏️ [POOL CATEGORÍA ACTUALIZADA] ${cleanIcono} ${cleanNombre} (${current.slug})`);
        return res.json({
            success: true,
            category: { ...current, nombre: cleanNombre, icono: cleanIcono, color: cleanColor, descripcion: cleanDesc }
        });
    } catch (err) {
        console.error('Error actualizando categoría del Pool:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/pool/categories/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await dbPool.query('SELECT * FROM pool_categorias WHERE id = ? OR slug = ? LIMIT 1', [id, id]);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Categoría no encontrada.' });
        }
        const targetCat = rows[0];

        // Reasignar recursos de esta categoría a 'oferta_educativa' (o la primera disponible) para no perder recursos
        const [otherCats] = await dbPool.query('SELECT slug FROM pool_categorias WHERE id != ? ORDER BY orden ASC, id ASC LIMIT 1', [targetCat.id]);
        const fallbackSlug = otherCats.length > 0 ? otherCats[0].slug : 'plan_estudios';

        await dbPool.execute('UPDATE pool_recursos_multimedia SET categoria = ? WHERE categoria = ?', [fallbackSlug, targetCat.slug]);
        await dbPool.execute('DELETE FROM pool_categorias WHERE id = ?', [targetCat.id]);

        console.log(`🗑️ [POOL CATEGORÍA ELIMINADA] ${targetCat.nombre} (${targetCat.slug}) -> recursos movidos a '${fallbackSlug}'`);
        return res.json({
            success: true,
            message: `Categoría "${targetCat.nombre}" eliminada. Sus recursos fueron reubicados en "${fallbackSlug}".`,
            fallbackSlug
        });
    } catch (err) {
        console.error('Error eliminando categoría del Pool:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// 1. Obtener catálogo completo del Pool Multimedia (y compatible con /api/brochures)
app.get('/api/pool', authMiddleware, async (req, res) => {
    try {
        let sedeId = req.query.sede_id || req.query.campus || null;
        if (req.user && req.user.rol !== 'desarrollador' && req.user.sede_id) {
            sedeId = req.user.sede_id;
        }
        const items = await getActivePoolItems(sedeId);
        res.json({ success: true, count: items.length, items, brochures: items });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/brochures', authMiddleware, async (req, res) => {
    try {
        let sedeId = req.query.sede_id || req.query.campus || null;
        if (req.user && req.user.rol !== 'desarrollador' && req.user.sede_id) {
            sedeId = req.user.sede_id;
        }
        const items = await getActivePoolItems(sedeId);
        res.json({ success: true, count: items.length, brochures: items, items });
    } catch (err) {
        res.json({ success: true, count: UNID_BROCHURES.length, brochures: UNID_BROCHURES });
    }
});

// 2. Crear nuevo recurso en el Pool Multimedia (Planes, Oferta, Horarios, Instalaciones, Becas y Categorías Personalizadas) - Abierto a los 3 roles
async function handleCreatePoolResource(req, res) {
    try {
        const {
            titulo, carrera, categoria, descripcion_ia, scope, modalidad,
            duracion, rvoe, fileName, file_name, pdfUrl, url_recurso, size, tags,
            ciclo_escolar, tipo_archivo, fileData, file_data_base64
        } = req.body;

        const finalTitle = (titulo || carrera || '').trim();
        if (!finalTitle) {
            return res.status(400).json({ success: false, error: 'El título o nombre de la carrera/recurso es obligatorio.' });
        }

        let sedeId = req.body.sede_id || 'campeche';
        if (req.user && req.user.rol !== 'desarrollador' && req.user.sede_id) {
            sedeId = req.user.sede_id;
        }

        let codigoRecurso = (req.body.codigo_recurso || req.body.id || finalTitle.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')).substring(0, 50);
        if (!codigoRecurso) codigoRecurso = `recurso_${Date.now()}`;

        const [dupCheck] = await dbPool.query('SELECT id FROM pool_recursos_multimedia WHERE codigo_recurso = ? LIMIT 1', [codigoRecurso]);
        if (dupCheck.length > 0) {
            codigoRecurso = `${codigoRecurso}_${Date.now().toString().slice(-4)}`;
        }

        const finalCategoria = categoria || 'plan_estudios';
        const finalModalidad = (modalidad || 'Presencial').trim();
        const finalCiclo = ciclo_escolar || await getActiveCicloEscolar(sedeId);

        let scopeLabel = '🏛️ Campus Campeche (Presencial)';
        if (scope === 'unid_nacional') scopeLabel = '🌐 UNID Online (Nacional)';
        else if (scope === 'ejecutiva_campeche') scopeLabel = '👔 Campus Campeche (Ejecutiva / Dual)';
        else if (scope === 'todas') scopeLabel = '🎓 Recurso Institucional UNID';

        // Procesar subida híbrida (Archivo directo en Base64 desde la computadora o URL externa)
        const incomingBase64 = fileData || file_data_base64 || '';
        const incomingFileName = fileName || file_name || '';
        let uploadedMeta = null;
        if (incomingBase64 && String(incomingBase64).startsWith('data:')) {
            uploadedMeta = saveUploadedBase64File(incomingBase64, incomingFileName, codigoRecurso);
        }

        const finalTipoArchivo = uploadedMeta ? uploadedMeta.tipo_archivo : (tipo_archivo || 'pdf');
        const finalFileName = uploadedMeta ? uploadedMeta.file_name : (incomingFileName ? incomingFileName.trim() : `${codigoRecurso}.${finalTipoArchivo === 'imagen' ? 'png' : 'pdf'}`);
        const finalUrl = uploadedMeta ? uploadedMeta.url_recurso : ((url_recurso || pdfUrl || '').trim() || `/api/brochures/${codigoRecurso}/download`);
        const finalSize = uploadedMeta ? uploadedMeta.tamano : (size ? size.trim() : '1.2 MB');
        const parsedTags = Array.isArray(tags)
            ? tags
            : (tags ? String(tags).split(',').map(t => t.trim().toLowerCase()).filter(Boolean) : [codigoRecurso, finalTitle.toLowerCase()]);

        const finalDescripcionIa = (descripcion_ia || '').trim() ||
            `${finalTitle} (${finalCategoria}) en modalidad ${finalModalidad}. Duración: ${duracion || '3 años (9 cuatrimestres)'}. RVOE: ${rvoe || 'SEP-RVOE-OFICIAL'}.`;

        await dbPool.execute(`
            INSERT INTO pool_recursos_multimedia (
                codigo_recurso, sede_id, ciclo_escolar, categoria, titulo, descripcion_ia,
                scope, scope_label, modalidad, duracion, rvoe, tipo_archivo,
                file_name, url_recurso, tamano, tags, subido_por, updated_by, activo
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `, [
            codigoRecurso,
            sedeId,
            finalCiclo,
            finalCategoria,
            finalTitle,
            finalDescripcionIa,
            scope || 'campus_campeche',
            scopeLabel,
            finalModalidad,
            duracion ? duracion.trim() : '3 años (9 cuatrimestres)',
            rvoe ? rvoe.trim() : 'SEP-RVOE-OFICIAL',
            finalTipoArchivo,
            finalFileName,
            finalUrl,
            finalSize,
            JSON.stringify(parsedTags),
            req.user?.correo_institucional || 'admin@red.unid.mx',
            req.user?.correo_institucional || 'admin@red.unid.mx'
        ]);

        const newBrochureCompat = {
            id: codigoRecurso,
            codigo_recurso: codigoRecurso,
            sede_id: sedeId,
            ciclo_escolar: finalCiclo,
            categoria: finalCategoria,
            titulo: finalTitle,
            carrera: finalTitle,
            descripcion_ia: finalDescripcionIa,
            scope: scope || 'campus_campeche',
            scopeLabel,
            modalidad: finalModalidad,
            duracion: duracion ? duracion.trim() : '3 años (9 cuatrimestres)',
            rvoe: rvoe ? rvoe.trim() : 'SEP-RVOE-OFICIAL',
            tipo_archivo: finalTipoArchivo,
            fileName: finalFileName,
            pdfUrl: finalUrl,
            url_recurso: finalUrl,
            size: finalSize,
            tags: parsedTags
        };

        // Si es un PDF autogenerado (sin archivo subido), generar su PDF físico en /public/uploads/recursos/
        if (!uploadedMeta && finalTipoArchivo === 'pdf') {
            try {
                fs.writeFileSync(path.join(UPLOADS_DIR, finalFileName), generateOfficialPdfBuffer(newBrochureCompat));
            } catch (_) {}
        }

        // Mantener sincronizado brochures.json
        const existingIdx = UNID_BROCHURES.findIndex(b => b.id === codigoRecurso);
        if (existingIdx >= 0) {
            UNID_BROCHURES[existingIdx] = newBrochureCompat;
        } else {
            UNID_BROCHURES.push(newBrochureCompat);
        }
        saveBrochuresToDisk();

        console.log(`➕ [POOL MULTIMEDIA CREADO] [${finalCategoria.toUpperCase()}] ${finalTitle} (${codigoRecurso})`);
        return res.status(201).json({ success: true, item: newBrochureCompat, brochure: newBrochureCompat });
    } catch (err) {
        console.error('Error creando recurso en Pool Multimedia:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}

app.post('/api/pool', authMiddleware, handleCreatePoolResource);
app.post('/api/brochures', authMiddleware, handleCreatePoolResource);

// 3. Modificar / Actualizar recurso existente en el Pool Multimedia - Abierto a los 3 roles
async function handleUpdatePoolResource(req, res) {
    try {
        const { id } = req.params;
        const {
            titulo, carrera, categoria, descripcion_ia, scope, modalidad,
            duracion, rvoe, fileName, file_name, pdfUrl, url_recurso, size, tags,
            ciclo_escolar, tipo_archivo, fileData, file_data_base64
        } = req.body;

        const [rows] = await dbPool.query(
            'SELECT * FROM pool_recursos_multimedia WHERE codigo_recurso = ? OR id = ? LIMIT 1',
            [id, id]
        );

        const current = rows[0] || UNID_BROCHURES.find(b => b.id === id);
        if (!current) {
            return res.status(404).json({ success: false, error: 'Recurso no encontrado en el Pool.' });
        }

        const codigoRecurso = current.codigo_recurso || current.id || id;
        const incomingBase64 = fileData || file_data_base64 || '';
        const incomingFileName = fileName || file_name || '';
        let uploadedMeta = null;
        if (incomingBase64 && String(incomingBase64).startsWith('data:')) {
            uploadedMeta = saveUploadedBase64File(incomingBase64, incomingFileName, codigoRecurso);
        }

        const finalTitle = (titulo || carrera || current.titulo || current.carrera || '').trim();
        const finalCategoria = categoria || current.categoria || 'plan_estudios';
        const finalModalidad = modalidad ? modalidad.trim() : (current.modalidad || 'Presencial');
        const finalCiclo = ciclo_escolar || current.ciclo_escolar || '2026-3 Septiembre';
        const finalScope = scope || current.scope || 'campus_campeche';

        let scopeLabel = current.scope_label || current.scopeLabel || '🏛️ Campus Campeche (Presencial)';
        if (finalScope === 'unid_nacional') scopeLabel = '🌐 UNID Online (Nacional)';
        else if (finalScope === 'ejecutiva_campeche') scopeLabel = '👔 Campus Campeche (Ejecutiva / Dual)';
        else if (finalScope === 'campus_campeche') scopeLabel = '🏛️ Campus Campeche (Presencial)';
        else if (finalScope === 'todas') scopeLabel = '🎓 Recurso Institucional UNID';

        const finalTipoArchivo = uploadedMeta ? uploadedMeta.tipo_archivo : (tipo_archivo || current.tipo_archivo || 'pdf');
        const finalFileName = uploadedMeta ? uploadedMeta.file_name : (incomingFileName ? incomingFileName.trim() : (current.file_name || current.fileName || `${codigoRecurso}.pdf`));
        const finalUrl = uploadedMeta ? uploadedMeta.url_recurso : ((url_recurso !== undefined && url_recurso !== '' ? url_recurso : (pdfUrl !== undefined && pdfUrl !== '' ? pdfUrl : (current.url_recurso || current.pdfUrl || `/api/brochures/${codigoRecurso}/download`)))).trim();
        const finalSize = uploadedMeta ? uploadedMeta.tamano : (size ? size.trim() : (current.tamano || current.size || '1.2 MB'));
        const finalDuracion = duracion ? duracion.trim() : (current.duracion || '3 años (9 cuatrimestres)');
        const finalRvoe = rvoe ? rvoe.trim() : (current.rvoe || 'SEP-RVOE-OFICIAL');
        const finalDescripcionIa = descripcion_ia !== undefined ? descripcion_ia.trim() : (current.descripcion_ia || '');

        let parsedTags = [];
        if (Array.isArray(tags)) parsedTags = tags;
        else if (tags !== undefined) parsedTags = String(tags).split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
        else {
            try {
                parsedTags = typeof current.tags === 'string' ? JSON.parse(current.tags) : (current.tags || []);
            } catch (_) {
                parsedTags = [];
            }
        }

        if (rows.length > 0) {
            await dbPool.execute(`
                UPDATE pool_recursos_multimedia SET
                    ciclo_escolar = ?, categoria = ?, titulo = ?, descripcion_ia = ?,
                    scope = ?, scope_label = ?, modalidad = ?, duracion = ?, rvoe = ?,
                    tipo_archivo = ?, file_name = ?, url_recurso = ?, tamano = ?, tags = ?, updated_by = ?
                WHERE id = ?
            `, [
                finalCiclo, finalCategoria, finalTitle, finalDescripcionIa,
                finalScope, scopeLabel, finalModalidad, finalDuracion, finalRvoe,
                finalTipoArchivo, finalFileName, finalUrl, finalSize, JSON.stringify(parsedTags),
                req.user?.correo_institucional || 'admin@red.unid.mx',
                rows[0].id
            ]);
        }

        const updatedObj = {
            id: codigoRecurso,
            codigo_recurso: codigoRecurso,
            ciclo_escolar: finalCiclo,
            categoria: finalCategoria,
            titulo: finalTitle,
            carrera: finalTitle,
            descripcion_ia: finalDescripcionIa,
            scope: finalScope,
            scopeLabel,
            modalidad: finalModalidad,
            duracion: finalDuracion,
            rvoe: finalRvoe,
            tipo_archivo: finalTipoArchivo,
            fileName: finalFileName,
            pdfUrl: finalUrl,
            url_recurso: finalUrl,
            size: finalSize,
            tags: parsedTags
        };

        // Si es un PDF autogenerado (no subido manualmente), regenerar su archivo físico en /public/uploads/recursos/ con los nuevos datos
        if (!uploadedMeta && finalTipoArchivo === 'pdf' && !finalUrl.startsWith('/uploads/')) {
            try {
                fs.writeFileSync(path.join(UPLOADS_DIR, finalFileName), generateOfficialPdfBuffer(updatedObj));
            } catch (_) {}
        }

        const bIndex = UNID_BROCHURES.findIndex(b => b.id === codigoRecurso);
        if (bIndex !== -1) {
            UNID_BROCHURES[bIndex] = { ...UNID_BROCHURES[bIndex], ...updatedObj };
            saveBrochuresToDisk();
        }

        console.log(`✏️ [POOL MULTIMEDIA ACTUALIZADO] ${finalTitle} (${codigoRecurso})`);
        return res.json({ success: true, item: updatedObj, brochure: updatedObj });
    } catch (err) {
        console.error('Error actualizando recurso en Pool:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}

app.put('/api/pool/:id', authMiddleware, handleUpdatePoolResource);
app.put('/api/brochures/:id', authMiddleware, handleUpdatePoolResource);

// 4. Eliminar recurso del Pool Multimedia - Abierto a los 3 roles
async function handleDeletePoolResource(req, res) {
    try {
        const { id } = req.params;
        await dbPool.execute('DELETE FROM pool_recursos_multimedia WHERE codigo_recurso = ? OR id = ?', [id, id]);
        const index = UNID_BROCHURES.findIndex(b => b.id === id);
        if (index !== -1) {
            UNID_BROCHURES.splice(index, 1);
            saveBrochuresToDisk();
        }
        console.log(`🗑️ [POOL MULTIMEDIA ELIMINADO] Recurso (${id})`);
        return res.json({ success: true, message: 'Recurso eliminado exitosamente del Pool.' });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
}

app.delete('/api/pool/:id', authMiddleware, handleDeletePoolResource);
app.delete('/api/brochures/:id', authMiddleware, handleDeletePoolResource);

// 5. Descarga o redirección de Recurso Oficial UNID (PDF o Imagen subida)
app.get('/api/brochures/:id/download', async (req, res) => {
    const reqId = req.params.id;
    let resource = null;
    try {
        const [rows] = await dbPool.query(
            'SELECT * FROM pool_recursos_multimedia WHERE codigo_recurso = ? OR id = ? LIMIT 1',
            [reqId, reqId]
        );
        if (rows.length > 0) {
            resource = {
                id: rows[0].codigo_recurso,
                carrera: rows[0].titulo,
                modalidad: rows[0].modalidad,
                duracion: rows[0].duracion,
                rvoe: rows[0].rvoe,
                fileName: rows[0].file_name,
                pdfUrl: rows[0].url_recurso,
                descripcion_ia: rows[0].descripcion_ia
            };
        }
    } catch (_) {}

    if (!resource) {
        resource = UNID_BROCHURES.find(b => b.id === reqId) || UNID_BROCHURES[0];
    }

    // Si apunta a un archivo local subido en /uploads/recursos/...
    if (resource && resource.pdfUrl && resource.pdfUrl.startsWith('/uploads/')) {
        const localFile = path.join(__dirname, 'public', resource.pdfUrl);
        if (fs.existsSync(localFile)) {
            return res.sendFile(localFile);
        }
    }

    // Si tiene una URL externa real (excluyendo el dominio placeholder inexistente digitalmedia.talisis.com), redirigir
    if (
        resource &&
        resource.pdfUrl &&
        (resource.pdfUrl.startsWith('http://') || resource.pdfUrl.startsWith('https://')) &&
        !resource.pdfUrl.includes('digitalmedia.talisis.com')
    ) {
        return res.redirect(resource.pdfUrl);
    }

    // Verificar si existe el PDF físico en /public/uploads/recursos/ o generarlo ahora mismo con formato oficial UNID
    const safeFileName = resource?.fileName || `Plan_${reqId}_UNID_2026.pdf`;
    const diskPdfPath = path.join(UPLOADS_DIR, safeFileName);
    const pdfBuffer = generateOfficialPdfBuffer(resource);
    try {
        fs.writeFileSync(diskPdfPath, pdfBuffer);
    } catch (_) {}

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${safeFileName}"`);
    res.status(200).send(pdfBuffer);
});

// Sembrar datos de demostración (Poblar DB - Exclusivo Desarrollador)
app.post('/api/aspirantes/seed', authMiddleware, authorizeRoles('desarrollador'), async (req, res) => {
    try {
        const connection = await dbPool.getConnection();
        await connection.query('DELETE FROM aspirantes');
        await connection.query('DELETE FROM historial_conversaciones');
        await seedDemoLeads(connection);
        connection.release();
        conversationMemory.clear();
        userSessionState.clear();
        processedMessageIds.clear();
        console.log('🌱 [DB SEED] Base de datos poblada con 5 prospectos demo.');
        res.json({ success: true, message: 'Datos demo de alta fidelidad cargados con éxito (5 prospectos).' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 14. Autenticación Jerárquica (RBAC) & Manejo de Sesiones
// ==========================================

async function handleUserAuth(identifier, password, customName = null) {
    const cleanId = (identifier || '').trim().toLowerCase();
    const cleanPass = (password || '').trim();

    if (!cleanId) {
        return { success: false, error: 'Por favor ingresa tu correo institucional o matrícula.' };
    }

    // 1. Consultar primero en la tabla `usuarios` de MariaDB
    try {
        const [rows] = await dbPool.query(
            'SELECT * FROM usuarios WHERE LOWER(correo_institucional) = ? OR LOWER(matricula) = ? LIMIT 1',
            [cleanId, cleanId]
        );

        if (rows.length > 0) {
            const dbUser = rows[0];
            if (!dbUser.activo) {
                return { success: false, error: 'Esta cuenta de usuario se encuentra desactivada por el Superadmin.' };
            }

            const isValid = verifyPassword(cleanPass, dbUser.password);
            if (!isValid) {
                return { success: false, error: 'Contraseña incorrecta para la cuenta institucional.' };
            }

            await dbPool.execute('UPDATE usuarios SET ultimo_acceso = CURRENT_TIMESTAMP WHERE id = ?', [dbUser.id]);

            const rolNorm = normalizeRole(dbUser.rol);
            const sedeSlug = rolNorm === 'desarrollador' ? null : (dbUser.sede_id || 'campeche');
            const campusMeta = UNID_CAMPUSES.find(c => c.id === sedeSlug);

            const userObj = {
                id: dbUser.id,
                correo_institucional: dbUser.correo_institucional,
                username: dbUser.correo_institucional,
                displayName: customName || dbUser.nombre_completo,
                matricula: dbUser.matricula || dbUser.correo_institucional.split('@')[0],
                rol: rolNorm,
                role: rolNorm, // retrocompatibilidad frontend
                roleTitle: getRoleTitle(rolNorm),
                sede_id: sedeSlug,
                tenant: sedeSlug ? (campusMeta ? campusMeta.name : `Sede ${sedeSlug}`) : 'Global (Todas las Sedes UNID)',
                isInstitutional: true
            };

            const token = jwt.sign(userObj, JWT_SECRET, { expiresIn: '7d' });
            console.log(`🔐 [AUTH RBAC] Acceso concedido a ${userObj.correo_institucional} | Rol: ${userObj.rol} | Sede: ${userObj.sede_id || 'GLOBAL'}`);
            return { success: true, token, user: userObj };
        }
    } catch (dbErr) {
        console.warn('⚠️ MariaDB no disponible durante login, aplicando fallback RBAC en memoria:', dbErr.message);
    }

    // 2. Fallback en memoria SOLO permitido en modo desarrollo local (DESACTIVADO en producción tras Setup Wizard)
    if (isProductionHardened()) {
        return {
            success: false,
            error: 'Credenciales institucionales inválidas. Verifica tu correo/matrícula y contraseña.'
        };
    }

    // Rol 1: Desarrollador (Superadmin - solo modo demo desarrollo)
    const isDevId = cleanId === '00774343@red.unid.mx' || cleanId === '00774343' || cleanId === 'dev' || cleanId === 'superadmin' || cleanId === ADMIN_USERNAME.toLowerCase();
    const isDevPass = cleanPass === 'admin' || cleanPass === 'unid2026' || cleanPass === ADMIN_PASSWORD;

    if (isDevId && isDevPass) {
        const userObj = {
            id: 1,
            correo_institucional: '00774343@red.unid.mx',
            username: '00774343@red.unid.mx',
            displayName: customName || 'Luis Felipe Quintero (Desarrollador / Superadmin)',
            matricula: '00774343',
            rol: 'desarrollador',
            role: 'desarrollador',
            roleTitle: getRoleTitle('desarrollador'),
            sede_id: null,
            tenant: 'Global (Todas las Sedes UNID)',
            isInstitutional: true
        };
        const token = jwt.sign(userObj, JWT_SECRET, { expiresIn: '7d' });
        return { success: true, token, user: userObj };
    }

    // Rol 2: Administrador de Sede
    const isAdminSedeId = cleanId === 'admin.campeche@red.unid.mx' || cleanId === '00881122' || cleanId === 'administrador';
    const isAdminSedePass = cleanPass === 'admin2026' || cleanPass === 'admin' || cleanPass === 'unid2026';

    if (isAdminSedeId && isAdminSedePass) {
        const userObj = {
            id: 2,
            correo_institucional: 'admin.campeche@red.unid.mx',
            username: 'admin.campeche@red.unid.mx',
            displayName: customName || 'Dir. Admisiones Campeche (Administrador)',
            matricula: '00881122',
            rol: 'administrador',
            role: 'administrador',
            roleTitle: getRoleTitle('administrador'),
            sede_id: 'campeche',
            tenant: 'Campus San Francisco de Campeche',
            isInstitutional: true
        };
        const token = jwt.sign(userObj, JWT_SECRET, { expiresIn: '7d' });
        return { success: true, token, user: userObj };
    }

    // Rol 3: Usuario (Asesor de Admisiones)
    const isUserId = cleanId === '67676767@red.unid.mx' || cleanId === '67676767' || cleanId === 'user' || cleanId.includes('asesor');
    const isUserPass = cleanPass === 'user' || cleanPass === 'unid2026';

    if (isUserId && isUserPass) {
        const userObj = {
            id: 3,
            correo_institucional: '67676767@red.unid.mx',
            username: '67676767@red.unid.mx',
            displayName: customName || 'Lic. Asesor de Admisiones (Usuario)',
            matricula: '67676767',
            rol: 'usuario',
            role: 'usuario',
            roleTitle: getRoleTitle('usuario'),
            sede_id: 'campeche',
            tenant: 'Campus San Francisco de Campeche',
            isInstitutional: true
        };
        const token = jwt.sign(userObj, JWT_SECRET, { expiresIn: '7d' });
        return { success: true, token, user: userObj };
    }

    return {
        success: false,
        error: 'Credenciales inválidas. Cuentas de prueba: Desarrollador (00774343@red.unid.mx / admin), Administrador (admin.campeche@red.unid.mx / admin2026), Usuario (67676767@red.unid.mx / user).'
    };
}

// Login Local
app.post('/api/auth/login', authLimiter, async (req, res) => {
    const { username, email, correo_institucional, password } = req.body;
    const authResult = await handleUserAuth(correo_institucional || username || email, password);
    if (authResult.success) {
        return res.json(authResult);
    }
    return res.status(401).json(authResult);
});

// Login con Office 365
app.post('/api/auth/o365', authLimiter, async (req, res) => {
    const { email, correo_institucional, password, name } = req.body;
    const authResult = await handleUserAuth(correo_institucional || email, password, name);
    if (authResult.success) {
        return res.json(authResult);
    }
    return res.status(401).json(authResult);
});

// Login con Microsoft Entra ID
app.post('/api/auth/microsoft', authLimiter, async (req, res) => {
    const { email, password, displayName } = req.body;
    const authResult = await handleUserAuth(email, password, displayName);
    if (authResult.success) {
        return res.json(authResult);
    }
    return res.status(401).json(authResult);
});

// ==========================================
// 14.5. Endpoints CRUD de Usuarios y Roles (Exclusivo Desarrollador / Superadmin)
// ==========================================
app.get('/api/users', authMiddleware, authorizeRoles('desarrollador'), async (req, res) => {
    try {
        const [rows] = await dbPool.query(
            'SELECT id, correo_institucional, nombre_completo, matricula, rol, sede_id, activo, ultimo_acceso, created_at FROM usuarios ORDER BY id ASC'
        );
        res.json({ success: true, users: rows });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Error al consultar usuarios: ' + err.message });
    }
});

app.post('/api/users', authMiddleware, authorizeRoles('desarrollador'), async (req, res) => {
    try {
        const { correo_institucional, nombre_completo, matricula, password, rol, sede_id, activo } = req.body;
        if (!correo_institucional || !password || !nombre_completo) {
            return res.status(400).json({ success: false, error: 'Correo institucional, nombre completo y contraseña son obligatorios.' });
        }

        const cleanCorreo = String(correo_institucional).trim().toLowerCase();
        const rolNorm = normalizeRole(rol);
        const finalSede = rolNorm === 'desarrollador' ? null : (sede_id || 'campeche');
        const hashedPass = hashPassword(password);
        const mat = matricula ? String(matricula).trim() : cleanCorreo.split('@')[0];

        const [result] = await dbPool.execute(`
            INSERT INTO usuarios (correo_institucional, nombre_completo, matricula, password, rol, sede_id, activo)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [cleanCorreo, nombre_completo.trim(), mat, hashedPass, rolNorm, finalSede, activo !== undefined ? (activo ? 1 : 0) : 1]);

        console.log(`👤 [CRUD USUARIOS] Cuenta creada por Superadmin: ${cleanCorreo} (${rolNorm} - Sede: ${finalSede || 'GLOBAL'})`);
        res.status(201).json({
            success: true,
            message: 'Usuario creado exitosamente.',
            userId: result.insertId
        });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, error: 'Ese correo institucional ya está registrado.' });
        }
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/users/:id', authMiddleware, authorizeRoles('desarrollador'), async (req, res) => {
    try {
        const { id } = req.params;
        const { correo_institucional, nombre_completo, matricula, password, rol, sede_id, activo } = req.body;

        const [existing] = await dbPool.query('SELECT * FROM usuarios WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, error: 'Usuario no encontrado.' });
        }

        const current = existing[0];
        const cleanCorreo = correo_institucional ? String(correo_institucional).trim().toLowerCase() : current.correo_institucional;
        const rolNorm = rol ? normalizeRole(rol) : current.rol;
        const finalSede = rolNorm === 'desarrollador' ? null : (sede_id !== undefined ? (sede_id || 'campeche') : current.sede_id);
        const finalPass = (password && String(password).trim().length > 0) ? hashPassword(password) : current.password;
        const finalNombre = nombre_completo ? nombre_completo.trim() : current.nombre_completo;
        const finalMat = matricula !== undefined ? String(matricula).trim() : current.matricula;
        const finalActivo = activo !== undefined ? (activo ? 1 : 0) : current.activo;

        await dbPool.execute(`
            UPDATE usuarios SET
                correo_institucional = ?, nombre_completo = ?, matricula = ?,
                password = ?, rol = ?, sede_id = ?, activo = ?
            WHERE id = ?
        `, [cleanCorreo, finalNombre, finalMat, finalPass, rolNorm, finalSede, finalActivo, id]);

        console.log(`✏️ [CRUD USUARIOS] Usuario #${id} (${cleanCorreo}) actualizado a Rol: ${rolNorm} | Sede: ${finalSede || 'GLOBAL'}`);
        res.json({ success: true, message: 'Usuario actualizado correctamente.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/users/:id', authMiddleware, authorizeRoles('desarrollador'), async (req, res) => {
    try {
        const { id } = req.params;
        if (req.user && Number(req.user.id) === Number(id)) {
            return res.status(400).json({ success: false, error: 'No puedes eliminar tu propia cuenta activa de Desarrollador.' });
        }
        await dbPool.execute('DELETE FROM usuarios WHERE id = ?', [id]);
        console.log(`🗑️ [CRUD USUARIOS] Usuario #${id} eliminado por Superadmin.`);
        res.json({ success: true, message: 'Usuario eliminado correctamente.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// 14.6. Endpoints de Configuración SMTP en Vivo, Auditoría y Prueba de Correos
// ==========================================
app.get('/api/settings/smtp', authMiddleware, authorizeRoles('desarrollador', 'administrador'), (req, res) => {
    const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
    const smtpPort = process.env.SMTP_PORT || '587';
    const smtpUser = process.env.SMTP_USER || TESTING_NOTIFICATION_EMAIL;
    const smtpPass = process.env.SMTP_PASS || '';
    const isLiveConfigured = Boolean(smtpHost && smtpUser && smtpPass && !smtpPass.includes('tu_app_password') && smtpPass.trim().length >= 8);

    res.json({
        success: true,
        smtp: {
            host: smtpHost,
            port: smtpPort,
            user: smtpUser,
            hasPass: isLiveConfigured,
            maskedPass: isLiveConfigured ? `${smtpPass.substring(0, 2)}••••••••••••${smtpPass.slice(-2)}` : '',
            targetEmail: TESTING_NOTIFICATION_EMAIL,
            mode: isLiveConfigured ? 'smtp_live' : 'ethereal_test'
        }
    });
});

app.post('/api/settings/smtp', authMiddleware, authorizeRoles('desarrollador', 'administrador'), async (req, res) => {
    try {
        const { host, port, user, pass } = req.body;
        const cleanHost = (host || 'smtp.gmail.com').trim();
        const cleanPort = String(port || '587').trim();
        const cleanUser = (user || TESTING_NOTIFICATION_EMAIL).trim();
        // Gmail App Passwords suelen copiarse con espacios (ej. "abcd efgh ijkl mnop"); quitar espacios internos
        const cleanPass = pass ? String(pass).replace(/\s+/g, '').trim() : (process.env.SMTP_PASS || '');

        if (!cleanUser || !cleanPass) {
            return res.status(400).json({ success: false, error: 'El correo remitente y la Contraseña de Aplicación (16 letras) son obligatorios.' });
        }

        // Actualizar variables de entorno en caliente (Hot-Reload)
        process.env.SMTP_HOST = cleanHost;
        process.env.SMTP_PORT = cleanPort;
        process.env.SMTP_USER = cleanUser;
        process.env.SMTP_PASS = cleanPass;
        process.env.ADMISSIONS_NOTIFICATION_EMAIL = TESTING_NOTIFICATION_EMAIL;

        // Persistir en archivo .env para que sobreviva reinicios
        const envPath = path.join(__dirname, '.env');
        let envContent = '';
        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf-8');
        }
        const upsertEnvVar = (key, val) => {
            const regex = new RegExp(`^${key}=.*$`, 'm');
            if (regex.test(envContent)) {
                envContent = envContent.replace(regex, `${key}=${val}`);
            } else {
                envContent += `${envContent.endsWith('\n') || envContent === '' ? '' : '\n'}${key}=${val}\n`;
            }
        };
        upsertEnvVar('SMTP_HOST', cleanHost);
        upsertEnvVar('SMTP_PORT', cleanPort);
        upsertEnvVar('SMTP_USER', cleanUser);
        upsertEnvVar('SMTP_PASS', cleanPass);
        upsertEnvVar('ADMISSIONS_NOTIFICATION_EMAIL', TESTING_NOTIFICATION_EMAIL);
        fs.writeFileSync(envPath, envContent, 'utf-8');

        console.log(`✉️ [SMTP HOT-RELOAD] Credenciales SMTP actualizadas para ${cleanUser} (${cleanHost}:${cleanPort}).`);
        res.json({
            success: true,
            message: `Configuración SMTP en vivo guardada para ${cleanUser}. Ya puedes disparar pruebas reales a tu bandeja de Gmail.`,
            mode: 'smtp_live'
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Error guardando configuración SMTP: ' + err.message });
    }
});

app.get('/api/notifications/history', authMiddleware, authorizeRoles('desarrollador', 'administrador'), (req, res) => {
    const smtpPass = process.env.SMTP_PASS || '';
    const isLive = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && smtpPass && !smtpPass.includes('tu_app_password') && smtpPass.trim().length >= 8);
    res.json({
        success: true,
        targetEmail: TESTING_NOTIFICATION_EMAIL,
        smtpMode: isLive ? 'smtp_live' : 'ethereal_test',
        history: emailNotificationHistory
    });
});

app.post('/api/notifications/test', authMiddleware, authorizeRoles('desarrollador', 'administrador'), async (req, res) => {
    try {
        const evento = req.body.evento || req.body.eventoTipo;
        let resultLog = null;
        if (evento === 'NUEVO_CONTACTO') {
            resultLog = await dispararNotificacionCorreo('NUEVO_CONTACTO', {
                telefono_celular: '+529811589900',
                mensaje_inicial: 'Hola, buenas tardes. Me gustaría pedir informes sobre las licenciaturas en UNID Campeche.',
                sede_id: 'campeche',
                insertId: 901
            });
        } else if (evento === 'DATOS_COMPLETOS') {
            const sampleJson = {
                completado: true,
                nombre_completo: 'Luis Fernando Quintero Morales',
                fecha_nacimiento: '2001-09-15',
                sexo: 'Masculino',
                estado_nacimiento: 'Campeche',
                telefono_celular: '9811589900',
                correo_electronico: 'Luisquintero2001@gmail.com',
                bachillerato_procedencia: 'COBACAM Plantel 01',
                carrera_interes: 'Ingeniería en Software y Sistemas Computacionales',
                direccion: 'Av. Central #104, Col. San Román',
                codigo_postal: '24040',
                campus_interes: 'San Francisco de Campeche',
                modalidad_estudios: 'Presencial',
                es_foraneo: false,
                nivel_interes: 'Alto',
                resumen_ia: 'Aspirante con perfil tecnológico completo; listo para inscripción.'
            };
            sampleJson.curp = generarCurp(sampleJson);
            resultLog = await dispararNotificacionCorreo('DATOS_COMPLETOS', { datos: sampleJson, insertId: 902 });
        } else {
            resultLog = await dispararNotificacionCorreo('CIERRE_INSCRITO', {
                lead: {
                    id: 903,
                    nombre_completo: 'Carlos Alpuche Canul',
                    curp: 'AUCC040515HCCLRN08',
                    carrera_interes: 'Licenciatura en Derecho',
                    telefono_celular: '9811234567',
                    correo_electronico: 'carlos.alpuche@gmail.com',
                    campus_interes: 'San Francisco de Campeche',
                    modalidad_estudios: 'Presencial'
                },
                asesor: req.user?.displayName || 'Asesor de Admisiones UNID'
            });
        }
        res.json({ success: true, log: resultLog, result: resultLog, targetEmail: TESTING_NOTIFICATION_EMAIL });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Vaciar completamente la base de datos de aspirantes, historial de chats y memoria caché (Para testing)
async function handleClearAllDatabaseAndCache(req, res) {
    try {
        const connection = await dbPool.getConnection();
        await connection.query('DELETE FROM aspirantes');
        await connection.query('DELETE FROM historial_conversaciones');
        try {
            await connection.query('ALTER TABLE aspirantes AUTO_INCREMENT = 1');
            await connection.query('ALTER TABLE historial_conversaciones AUTO_INCREMENT = 1');
        } catch (_) {}
        connection.release();

        conversationMemory.clear();
        userSessionState.clear();
        processedMessageIds.clear();
        totalConversationsStarted = 0;

        console.log('🗑️ [DB + CACHE RESET] Base de datos (aspirantes + historial_conversaciones) y memoria caché vaciadas al 100%.');
        res.json({
            success: true,
            message: 'Base de datos (aspirantes e historial) y memoria caché vaciadas al 100% para testing.'
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

app.delete('/api/aspirantes/all', authMiddleware, authorizeRoles('desarrollador'), handleClearAllDatabaseAndCache);
app.post('/api/database/clear-all', authMiddleware, authorizeRoles('desarrollador'), handleClearAllDatabaseAndCache);

// Verificar token JWT
app.get('/api/auth/me', authMiddleware, (req, res) => {
    res.json({ success: true, user: req.user });
});

// Vinculación Móvil por Código QR (WhatsApp Web Inverso: PC -> Celular)
app.post('/api/auth/mobile-pair/create', authMiddleware, async (req, res) => {
    try {
        const hw = setupUtils.getSystemHardwareReport(PORT);
        const reqOrigin = (req.headers.origin && /^https?:\/\//i.test(req.headers.origin) && !/localhost|127\.0\.0\.1|192\.168\.56\./i.test(req.headers.origin))
            ? req.headers.origin
            : null;
        const availableUrls = Array.from(new Set([...(hw.lanUrls || []), ...(reqOrigin ? [reqOrigin] : [])])).filter(Boolean);
        const requestedUrl = mobilePairUtils.sanitizeServerUrl(req.body?.serverUrl);
        const targetServerUrl = requestedUrl || hw.primaryLanUrl || availableUrls[0] || `http://localhost:${PORT}`;

        const session = await mobilePairUtils.createPairingSession({
            user: req.user,
            serverUrl: targetServerUrl
        });
        res.json({
            success: true,
            ...session,
            availableUrls,
            virtualUrls: hw.virtualUrls || [],
            firewallCommand: hw.firewallCommand
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

app.get('/api/auth/mobile-pair/status/:code', authMiddleware, (req, res) => {
    const status = mobilePairUtils.getPairingStatus(req.params.code, req.user?.id);
    res.json({ success: true, ...status });
});

app.post('/api/auth/mobile-pair/claim', authLimiter, (req, res) => {
    const { code, pin, deviceLabel } = req.body || {};
    const claimed = mobilePairUtils.claimPairingSession({ code, pin, deviceLabel });
    if (!claimed.ok) {
        return res.status(401).json({ success: false, error: claimed.error });
    }
    const token = jwt.sign(claimed.user, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ success: true, token, user: claimed.user, serverUrl: claimed.serverUrl });
});

// Chat interactivo desde el simulador web (Protegido con JWT + Rate Limit)
app.post('/api/chat', authMiddleware, chatLimiter, async (req, res) => {
    try {
        const { phone, message, model } = req.body;
        if (!message) {
            return res.status(400).json({ error: 'El mensaje no puede estar vacío.' });
        }
        const senderPhone = phone || '+529811234567';
        const result = await processChatMessage(senderPhone, message, model);
        res.json(result);
    } catch (error) {
        console.error('Error en /api/chat:', error);
        res.status(500).json({ error: error.message });
    }
});

// Catálogo de modelos con filtrado estricto por API Key configurada
app.get('/api/models', authMiddleware, (req, res) => {
    // Filtrar solo los modelos que TIENEN API Key válida configurada (o el Auto-Fallback)
    const configuredModels = ALL_SUPPORTED_MODELS.map(m => {
        let isReady = false;
        let inCooldown = false;
        let cooldownSec = 0;

        if (m.id === 'auto-fallback') {
            isReady = true;
        } else if (m.provider === 'google') {
            isReady = isValidApiKey(process.env.GEMINI_API_KEY);
            inCooldown = isProviderInCooldown('google');
            cooldownSec = getProviderCooldownRemaining('google');
        } else if (m.provider === 'anthropic') {
            isReady = isValidApiKey(process.env.ANTHROPIC_API_KEY);
            inCooldown = isProviderInCooldown('anthropic');
            cooldownSec = getProviderCooldownRemaining('anthropic');
        } else if (m.provider === 'openai') {
            isReady = isValidApiKey(process.env.OPENAI_API_KEY);
            inCooldown = isProviderInCooldown('openai');
            cooldownSec = getProviderCooldownRemaining('openai');
        } else if (m.provider === 'deepseek') {
            isReady = isValidApiKey(process.env.DEEPSEEK_API_KEY);
            inCooldown = isProviderInCooldown('deepseek');
            cooldownSec = getProviderCooldownRemaining('deepseek');
        } else if (m.provider === 'groq') {
            isReady = isValidApiKey(process.env.GROQ_API_KEY);
            inCooldown = isProviderInCooldown('groq');
            cooldownSec = getProviderCooldownRemaining('groq');
        } else if (m.provider === 'ollama') {
            isReady = isOllamaConfigured();
            inCooldown = isProviderInCooldown('ollama');
            cooldownSec = getProviderCooldownRemaining('ollama');
        }

        return {
            ...m,
            isConfigured: isReady,
            inCooldown,
            cooldownSec
        };
    }).filter(m => m.isConfigured); // Ocultar los que no tienen API Key

    res.json({
        activeModel: globalActiveModelId,
        models: configuredModels,
        allProvidersStatus: {
            google: { configured: isValidApiKey(process.env.GEMINI_API_KEY), inCooldown: isProviderInCooldown('google'), cooldownSec: getProviderCooldownRemaining('google') },
            anthropic: { configured: isValidApiKey(process.env.ANTHROPIC_API_KEY), inCooldown: isProviderInCooldown('anthropic'), cooldownSec: getProviderCooldownRemaining('anthropic') },
            openai: { configured: isValidApiKey(process.env.OPENAI_API_KEY), inCooldown: isProviderInCooldown('openai'), cooldownSec: getProviderCooldownRemaining('openai') },
            deepseek: { configured: isValidApiKey(process.env.DEEPSEEK_API_KEY), inCooldown: isProviderInCooldown('deepseek'), cooldownSec: getProviderCooldownRemaining('deepseek') },
            groq: { configured: isValidApiKey(process.env.GROQ_API_KEY), inCooldown: isProviderInCooldown('groq'), cooldownSec: getProviderCooldownRemaining('groq') },
            ollama: { configured: isOllamaConfigured(), model: process.env.OLLAMA_MODEL || '', inCooldown: isProviderInCooldown('ollama'), cooldownSec: getProviderCooldownRemaining('ollama') }
        }
    });
});

// Cambiar modelo activo global (Exclusivo Desarrollador)
app.post('/api/models/active', authMiddleware, authorizeRoles('desarrollador'), (req, res) => {
    const { modelId } = req.body;
    const found = ALL_SUPPORTED_MODELS.find(m => m.id === modelId);
    if (!found) {
        return res.status(400).json({ error: 'Modelo no reconocido.' });
    }
    globalActiveModelId = modelId;
    console.log(`🤖 Modelo de IA activo actualizado globalmente a: ${modelId}`);
    res.json({ success: true, activeModel: globalActiveModelId });
});

// Obtener prompt actual (Desarrollador y Administrador)
app.get('/api/prompt', authMiddleware, authorizeRoles('desarrollador', 'administrador'), (req, res) => {
    res.json({
        prompt: getActivePrompt(),
        presets: PROMPT_PRESETS
    });
});

// Guardar nuevo System Prompt (Desarrollador y Administrador)
app.post('/api/prompt', authMiddleware, authorizeRoles('desarrollador', 'administrador'), (req, res) => {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        return res.status(400).json({ error: 'El prompt no puede estar vacío.' });
    }
    setActivePrompt(prompt);
    console.log('🔄 System Prompt actualizado dinámicamente desde el frontend.');
    res.json({ success: true, message: 'Personalidad y prompt actualizados con éxito.', prompt: getActivePrompt() });
});

// Restaurar prompt original (Desarrollador y Administrador)
app.post('/api/prompt/reset', authMiddleware, authorizeRoles('desarrollador', 'administrador'), (req, res) => {
    setActivePrompt(PROMPT_PRESETS[0].prompt);
    console.log('🔄 System Prompt restaurado a Metal-Uriel Oficial.');
    res.json({ success: true, message: 'Prompt restaurado al original.', prompt: getActivePrompt() });
});

// ==========================================
// 15. Endpoints API: Gestión de Sedes / Tenants (SaaS Multi-Tenant)
// ==========================================

// Listar catálogo de sedes UNID
app.get('/api/campuses', (req, res) => {
    res.json({ success: true, count: UNID_CAMPUSES.length, campuses: UNID_CAMPUSES });
});

// Listar todas las sedes con estado de configuración (Tokens enmascarados)
app.get('/api/tenants', authMiddleware, authorizeRoles('desarrollador', 'administrador'), async (req, res) => {
    try {
        let sedes = [];
        try {
            const [rows] = await dbPool.query('SELECT * FROM sedes ORDER BY nombre ASC');
            sedes = rows;
        } catch (dbErr) {
            console.warn('⚠️ MariaDB offline para listar sedes, usando fallback en memoria:', dbErr.message);
        }

        // Si la base de datos no tiene sedes o falló, devolver el catálogo base UNID
        if (sedes.length === 0) {
            sedes = UNID_CAMPUSES.map(c => ({
                id: c.id,
                slug: c.id,
                nombre: c.name,
                estado: c.estado,
                region: c.region,
                whatsapp_phone_number_id: c.id === 'campeche' ? WHATSAPP_PHONE_NUMBER_ID : null,
                hasWhatsAppToken: Boolean(c.id === 'campeche' && WHATSAPP_TOKEN),
                maskedWhatsAppToken: c.id === 'campeche' && WHATSAPP_TOKEN ? maskSecret(WHATSAPP_TOKEN) : '',
                email_notificaciones: c.id === 'campeche' ? (process.env.ADMISSIONS_NOTIFICATION_EMAIL || 'admisiones.campeche@unid.mx') : '',
                custom_prompt: '',
                hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
                hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
                activa: 1
            }));
        } else {
            sedes = sedes.map(s => {
                const plainWaToken = decryptSecret(s.whatsapp_token_encrypted);
                return {
                    id: s.id,
                    slug: s.slug,
                    nombre: s.nombre,
                    estado: s.estado,
                    region: s.region,
                    whatsapp_phone_number_id: s.whatsapp_phone_number_id,
                    hasWhatsAppToken: Boolean(plainWaToken || (s.slug === 'campeche' && WHATSAPP_TOKEN)),
                    maskedWhatsAppToken: maskSecret(plainWaToken || (s.slug === 'campeche' ? WHATSAPP_TOKEN : '')),
                    meta_verify_token: s.meta_verify_token || VERIFY_TOKEN,
                    email_notificaciones: s.email_notificaciones || (s.slug === 'campeche' ? process.env.ADMISSIONS_NOTIFICATION_EMAIL : ''),
                    custom_prompt: s.custom_prompt || '',
                    hasGeminiKey: Boolean(s.gemini_key_encrypted || process.env.GEMINI_API_KEY),
                    hasOpenAiKey: Boolean(s.openai_key_encrypted || process.env.OPENAI_API_KEY),
                    activa: Boolean(s.activa)
                };
            });
        }

        // Aislamiento de sede: un Administrador de Sede solo ve su campus asignado
        if (req.user.rol !== 'desarrollador' && req.user.sede_id) {
            sedes = sedes.filter(s => s.slug === req.user.sede_id);
        }

        res.json({ success: true, count: sedes.length, tenants: sedes });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Obtener detalle de una sede específica
app.get('/api/tenants/:slug', authMiddleware, authorizeRoles('desarrollador', 'administrador'), async (req, res) => {
    try {
        const { slug } = req.params;
        if (req.user.rol !== 'desarrollador' && req.user.sede_id && slug !== req.user.sede_id) {
            return res.status(403).json({ success: false, error: 'Solo puedes consultar la configuración de tu propia sede asignada.' });
        }
        const [rows] = await dbPool.query('SELECT * FROM sedes WHERE slug = ? OR id = ?', [slug, slug]);
        
        if (rows.length === 0) {
            const foundBase = UNID_CAMPUSES.find(c => c.id === slug);
            if (!foundBase) {
                return res.status(404).json({ success: false, error: 'Sede no encontrada.' });
            }
            return res.json({
                success: true,
                tenant: {
                    slug: foundBase.id,
                    nombre: foundBase.name,
                    estado: foundBase.estado,
                    region: foundBase.region,
                    whatsapp_phone_number_id: foundBase.id === 'campeche' ? WHATSAPP_PHONE_NUMBER_ID : '',
                    hasWhatsAppToken: Boolean(foundBase.id === 'campeche' && WHATSAPP_TOKEN),
                    maskedWhatsAppToken: foundBase.id === 'campeche' && WHATSAPP_TOKEN ? maskSecret(WHATSAPP_TOKEN) : '',
                    meta_verify_token: VERIFY_TOKEN,
                    email_notificaciones: foundBase.id === 'campeche' ? process.env.ADMISSIONS_NOTIFICATION_EMAIL : '',
                    custom_prompt: '',
                    activa: true
                }
            });
        }

        const s = rows[0];
        const plainWa = decryptSecret(s.whatsapp_token_encrypted);
        res.json({
            success: true,
            tenant: {
                id: s.id,
                slug: s.slug,
                nombre: s.nombre,
                estado: s.estado,
                region: s.region,
                whatsapp_phone_number_id: s.whatsapp_phone_number_id || '',
                hasWhatsAppToken: Boolean(plainWa),
                maskedWhatsAppToken: maskSecret(plainWa || ''),
                meta_verify_token: s.meta_verify_token || VERIFY_TOKEN,
                email_notificaciones: s.email_notificaciones || '',
                custom_prompt: s.custom_prompt || '',
                hasGeminiKey: Boolean(s.gemini_key_encrypted),
                hasOpenAiKey: Boolean(s.openai_key_encrypted),
                activa: Boolean(s.activa)
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Guardar o actualizar configuración de sede (Cifrado en reposo — soporta POST y PUT)
async function handleSaveTenantConfig(req, res) {
    try {
        const { slug } = req.params;
        if (req.user.rol !== 'desarrollador' && req.user.sede_id && slug !== req.user.sede_id) {
            return res.status(403).json({ success: false, error: 'Solo puedes modificar la configuración de tu propia sede asignada.' });
        }
        const {
            whatsapp_phone_number_id,
            whatsapp_token,
            meta_verify_token,
            email_notificaciones,
            custom_prompt,
            gemini_key,
            openai_key,
            activa
        } = req.body;

        const [existing] = await dbPool.query('SELECT * FROM sedes WHERE slug = ?', [slug]);
        
        let encryptedWaToken = null;
        if (whatsapp_token && !whatsapp_token.includes('••••')) {
            encryptedWaToken = encryptSecret(whatsapp_token);
        } else if (existing.length > 0) {
            encryptedWaToken = existing[0].whatsapp_token_encrypted;
        }

        let encryptedGeminiKey = null;
        if (gemini_key && !gemini_key.includes('••••')) {
            encryptedGeminiKey = encryptSecret(gemini_key);
        } else if (existing.length > 0) {
            encryptedGeminiKey = existing[0].gemini_key_encrypted;
        }

        let encryptedOpenAiKey = null;
        if (openai_key && !openai_key.includes('••••')) {
            encryptedOpenAiKey = encryptSecret(openai_key);
        } else if (existing.length > 0) {
            encryptedOpenAiKey = existing[0].openai_key_encrypted;
        }

        if (existing.length > 0) {
            await dbPool.execute(`
                UPDATE sedes SET
                    whatsapp_phone_number_id = ?,
                    whatsapp_token_encrypted = ?,
                    meta_verify_token = ?,
                    email_notificaciones = ?,
                    custom_prompt = ?,
                    gemini_key_encrypted = ?,
                    openai_key_encrypted = ?,
                    activa = ?
                WHERE slug = ?
            `, [
                whatsapp_phone_number_id || null,
                encryptedWaToken,
                meta_verify_token || VERIFY_TOKEN,
                email_notificaciones || null,
                custom_prompt || null,
                encryptedGeminiKey,
                encryptedOpenAiKey,
                activa !== undefined ? (activa ? 1 : 0) : 1,
                slug
            ]);
            console.log(`🔐 [TENANT SAVED] Configuración cifrada y guardada para sede '${slug}'.`);
        } else {
            const foundBase = UNID_CAMPUSES.find(c => c.id === slug) || { name: slug, estado: 'México', region: 'Nacional' };
            await dbPool.execute(`
                INSERT INTO sedes (slug, nombre, estado, region, whatsapp_phone_number_id, whatsapp_token_encrypted, meta_verify_token, email_notificaciones, custom_prompt, gemini_key_encrypted, openai_key_encrypted, activa)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                slug,
                foundBase.name,
                foundBase.estado,
                foundBase.region,
                whatsapp_phone_number_id || null,
                encryptedWaToken,
                meta_verify_token || VERIFY_TOKEN,
                email_notificaciones || null,
                custom_prompt || null,
                encryptedGeminiKey,
                encryptedOpenAiKey,
                activa !== undefined ? (activa ? 1 : 0) : 1
            ]);
            console.log(`🏛️ [TENANT CREATED] Sede '${slug}' registrada y cifrada con éxito.`);
        }

        res.json({ success: true, message: `Configuración para ${slug} guardada y cifrada exitosamente.` });
    } catch (err) {
        console.error('Error guardando sede:', err);
        res.status(500).json({ success: false, error: err.message });
    }
}
app.post('/api/tenants/:slug', authMiddleware, authorizeRoles('desarrollador', 'administrador'), handleSaveTenantConfig);
app.put('/api/tenants/:slug', authMiddleware, authorizeRoles('desarrollador', 'administrador'), handleSaveTenantConfig);

// Prueba de Conectividad con Meta WhatsApp para una Sede (soporta /test-whatsapp y /test-connection)
async function handleTestTenantWhatsApp(req, res) {
    try {
        const { slug } = req.params;
        if (req.user.rol !== 'desarrollador' && req.user.sede_id && slug !== req.user.sede_id) {
            return res.status(403).json({ success: false, error: 'Solo puedes probar la conexión de tu propia sede asignada.' });
        }
        const { testPhone } = req.body || {};

        const [rows] = await dbPool.query('SELECT * FROM sedes WHERE slug = ?', [slug]);
        let tokenToTest = WHATSAPP_TOKEN;
        let phoneIdToTest = WHATSAPP_PHONE_NUMBER_ID;

        if (rows.length > 0) {
            const sede = rows[0];
            if (sede.whatsapp_token_encrypted) {
                tokenToTest = decryptSecret(sede.whatsapp_token_encrypted);
            }
            if (sede.whatsapp_phone_number_id) {
                phoneIdToTest = sede.whatsapp_phone_number_id;
            }
        }

        if (!tokenToTest || !phoneIdToTest) {
            return res.status(400).json({
                success: false,
                error: 'La sede no cuenta con WhatsApp Token o Phone Number ID configurado.'
            });
        }

        // Probar llamada a Meta Graph API
        const metaRes = await axios.get(`https://graph.facebook.com/v20.0/${phoneIdToTest}`, {
            headers: { 'Authorization': `Bearer ${tokenToTest}` }
        });

        const phoneInfo = metaRes.data;

        // Si se proporcionó un teléfono de prueba, enviar un mensaje de confirmación
        if (testPhone) {
            await axios.post(`https://graph.facebook.com/v20.0/${phoneIdToTest}/messages`, {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: testPhone,
                type: 'text',
                text: { body: `🐺 ¡Hola! Mensaje de prueba exitoso desde el Centro de Mando SaaS de Metal-Uriel para la sede de ${slug.toUpperCase()}. Conexión verificada con Meta Cloud API.` }
            }, {
                headers: {
                    'Authorization': `Bearer ${tokenToTest}`,
                    'Content-Type': 'application/json'
                }
            });
        }

        res.json({
            success: true,
            message: `✅ Conexión exitosa con Meta WhatsApp Business API para Phone ID ${phoneIdToTest}.`,
            phoneInfo: {
                id: phoneInfo.id,
                display_phone_number: phoneInfo.display_phone_number || phoneInfo.verified_name || 'Configurado',
                quality_rating: phoneInfo.quality_rating || 'GREEN'
            }
        });
    } catch (err) {
        const metaError = err.response?.data?.error?.message || err.message;
        res.status(400).json({
            success: false,
            error: `Error conectando con Meta: ${metaError}`
        });
    }
}
app.post('/api/tenants/:slug/test-whatsapp', authMiddleware, authorizeRoles('desarrollador', 'administrador'), handleTestTenantWhatsApp);
app.post('/api/tenants/:slug/test-connection', authMiddleware, authorizeRoles('desarrollador', 'administrador'), handleTestTenantWhatsApp);

// Obtener lista de aspirantes con estados y filtros (con aislamiento de sede para roles no-superadmin)
app.get('/api/aspirantes', authMiddleware, async (req, res) => {
    try {
        let { campus } = req.query;
        // Si el usuario es administrador o usuario (asesor), forzar su sede_id asignada
        if (req.user && req.user.rol !== 'desarrollador' && req.user.sede_id) {
            campus = req.user.sede_id;
        }

        let query = 'SELECT * FROM aspirantes';
        const params = [];

        if (campus && campus !== 'all' && campus !== 'todas') {
            query += ' WHERE (sede_id = ? OR campus_interes LIKE ?)';
            params.push(campus, `%${campus.replace(/_/g, ' ')}%`);
        }

        query += ' ORDER BY COALESCE(ultimo_mensaje_at, updated_at, created_at) DESC LIMIT 200';
        const [rows] = await dbPool.query(query, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.json({ success: false, error: err.message, data: [] });
    }
});

// Actualizar estado del prospecto para el Kanban + Trigger Evento C (Cierre/Inscrito) + Auditoría Caso de Éxito
app.patch('/api/aspirantes/:id/status', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const estado = req.body.estado || req.body.estado_prospecto;
        const validStates = ['nuevo', 'contactado', 'en_proceso', 'inscrito', 'no_interesado'];
        if (!validStates.includes(estado)) {
            return res.status(400).json({ error: 'Estado de prospecto no válido.' });
        }

        // Consultar estado previo para disparar Evento C únicamente al pasar a "inscrito" y verificar sede
        const [prevRows] = await dbPool.query('SELECT * FROM aspirantes WHERE id = ?', [id]);
        const prevLead = prevRows[0] || null;
        if (prevLead && req.user.rol !== 'desarrollador' && req.user.sede_id && prevLead.sede_id && prevLead.sede_id !== req.user.sede_id) {
            return res.status(403).json({ error: 'No tienes permiso para modificar prospectos de otra sede.' });
        }

        await dbPool.execute(
            `UPDATE aspirantes
             SET estado_prospecto = ?,
                 conversacion_destacada = CASE WHEN ? = 'inscrito' THEN 1 ELSE conversacion_destacada END,
                 fecha_inscripcion = CASE WHEN ? = 'inscrito' AND fecha_inscripcion IS NULL THEN CURRENT_TIMESTAMP ELSE fecha_inscripcion END
             WHERE id = ?`,
            [estado, estado, estado, id]
        );
        console.log(`📌 Prospecto #${id} actualizado al estado: ${estado}`);

        if (prevLead?.telefono_celular) {
            const label = estado === 'inscrito' ? '🏆 INSCRITO (Caso de Éxito preservado para estudio)' : estado.toUpperCase();
            guardarMensajeHistorialBD(
                prevLead.telefono_celular,
                'system',
                `Estado de postulación actualizado a ${label} por ${req.user?.displayName || 'Asesor UNID'}.`,
                prevLead.sede_id || 'campeche',
                { senderName: req.user?.displayName || 'Sistema UNID' }
            ).catch(() => {});
        }

        // Trigger Evento C (Cierre/Inscrito)
        let emailTriggered = false;
        if (estado === 'inscrito' && (!prevLead || prevLead.estado_prospecto !== 'inscrito')) {
            emailTriggered = true;
            const leadObj = prevLead || { id, nombre_completo: `Prospecto #${id}` };
            dispararNotificacionCorreo('CIERRE_INSCRITO', {
                lead: leadObj,
                asesor: req.user?.displayName || 'Asesor de Admisiones UNID'
            }).catch(console.error);
        }

        res.json({ success: true, id: Number(id), estado, emailTriggered });
    } catch (err) {
        res.status(500).json({ error: 'Error actualizando estado: ' + err.message });
    }
});

// Archivar o Desarchivar un prospecto
app.patch('/api/aspirantes/:id/archive', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { archivado } = req.body;
        if (req.user.rol !== 'desarrollador' && req.user.sede_id) {
            const [rows] = await dbPool.query('SELECT sede_id FROM aspirantes WHERE id = ?', [id]);
            if (rows[0]?.sede_id && rows[0].sede_id !== req.user.sede_id) {
                return res.status(403).json({ error: 'No tienes permiso para archivar prospectos de otra sede.' });
            }
        }
        const archVal = (archivado === true || archivado === 1 || archivado === '1') ? 1 : 0;
        await dbPool.execute('UPDATE aspirantes SET archivado = ? WHERE id = ?', [archVal, id]);
        console.log(`🗄️ Prospecto #${id} ${archVal ? 'archivado' : 'desarchivado'}.`);
        res.json({ success: true, id: Number(id), archivado: Boolean(archVal) });
    } catch (err) {
        res.status(500).json({ error: 'Error archivando prospecto: ' + err.message });
    }
});

// Eliminar definitivamente un prospecto (Desarrollador y Administrador de Sede)
app.delete('/api/aspirantes/:id', authMiddleware, authorizeRoles('desarrollador', 'administrador'), async (req, res) => {
    try {
        const { id } = req.params;
        if (req.user.rol !== 'desarrollador' && req.user.sede_id) {
            const [rows] = await dbPool.query('SELECT sede_id FROM aspirantes WHERE id = ?', [id]);
            if (rows[0]?.sede_id && rows[0].sede_id !== req.user.sede_id) {
                return res.status(403).json({ error: 'No tienes permiso para eliminar prospectos de otra sede.' });
            }
        }
        await dbPool.execute('DELETE FROM aspirantes WHERE id = ?', [id]);
        console.log(`🗑️ Prospecto #${id} eliminado.`);
        res.json({ success: true, id: Number(id) });
    } catch (err) {
        res.status(500).json({ error: 'Error eliminando prospecto: ' + err.message });
    }
});

// Analytics y métricas para el Dashboard blindado con catálogo oficial UNID + Telemetría LLM
app.get('/api/analytics', authMiddleware, async (req, res) => {
    try {
        let rows = [];
        let targetSede = req.query.campus || null;
        if (req.user.rol !== 'desarrollador' && req.user.sede_id) {
            targetSede = req.user.sede_id;
        }
        try {
            let sql = 'SELECT * FROM aspirantes';
            const params = [];
            if (targetSede && targetSede !== 'all' && targetSede !== 'todas') {
                sql += ' WHERE (sede_id = ? OR campus_interes LIKE ?)';
                params.push(targetSede, `%${targetSede.replace(/_/g, ' ')}%`);
            }
            const [dbRows] = await dbPool.query(sql, params);
            rows = dbRows;
        } catch (e) {
            console.warn('MariaDB offline para analytics:', e.message);
        }

        const totalLeads = rows.length;
        const activos = rows.filter(r => !r.archivado).length;
        const archivados = rows.filter(r => Boolean(r.archivado)).length;
        const locales = rows.filter(r => !r.es_foraneo).length;
        const foraneos = rows.filter(r => Boolean(r.es_foraneo)).length;

        // Catálogo oficial de carreras (Anti-Alucinaciones)
        const officialDegrees = UNID_BROCHURES.filter(b => b.scope !== 'todas').map(b => b.carrera);

        // Conteo validado por carrera oficial
        const careerMap = {};
        officialDegrees.forEach(deg => {
            careerMap[deg] = 0;
        });

        rows.forEach(r => {
            const raw = (r.carrera_interes || '').trim();
            if (!raw) return;

            // Encontrar coincidencia exacta o difusa con catálogo oficial
            const match = officialDegrees.find(deg => 
                deg.toLowerCase() === raw.toLowerCase() ||
                raw.toLowerCase().includes(deg.toLowerCase().substring(0, 15)) ||
                deg.toLowerCase().includes(raw.toLowerCase().substring(0, 15))
            );

            if (match) {
                careerMap[match] = (careerMap[match] || 0) + 1;
            } else {
                careerMap['Otros Programas UNID'] = (careerMap['Otros Programas UNID'] || 0) + 1;
            }
        });

        const byCareer = Object.entries(careerMap)
            .map(([career, count]) => ({ career, count }))
            .filter(c => c.count > 0 || officialDegrees.includes(c.career))
            .sort((a, b) => b.count - a.count);

        // Conteo por estado Kanban (solo prospectos activos para el embudo operativo)
        const activeRows = rows.filter(r => !r.archivado);
        const byStatus = {
            nuevo: activeRows.filter(r => (r.estado_prospecto || 'nuevo') === 'nuevo').length,
            contactado: activeRows.filter(r => r.estado_prospecto === 'contactado').length,
            en_proceso: activeRows.filter(r => r.estado_prospecto === 'en_proceso').length,
            inscrito: activeRows.filter(r => r.estado_prospecto === 'inscrito').length,
            no_interesado: activeRows.filter(r => r.estado_prospecto === 'no_interesado').length
        };

        // Conteo por Lead Scoring (Nivel de Interés)
        const byInterest = {
            alto: rows.filter(r => (r.nivel_interes || 'Alto') === 'Alto').length,
            medio: rows.filter(r => r.nivel_interes === 'Medio').length,
            bajo: rows.filter(r => r.nivel_interes === 'Bajo').length
        };

        // Conteo por modalidad
        const modalityMap = {};
        rows.forEach(r => {
            const m = r.modalidad_estudios || 'No especificada';
            modalityMap[m] = (modalityMap[m] || 0) + 1;
        });
        const byModality = Object.entries(modalityMap).map(([modality, count]) => ({ modality, count }));

        // Efectividad del bot
        const totalConversations = totalConversationsStarted || (totalLeads + conversationMemory.size) || 1;
        const conversionRate = totalConversations > 0 ? ((totalLeads / totalConversations) * 100).toFixed(1) : '100.0';

        // Telemetría de Inferencia LLM (MariaDB o buffer en memoria)
        let llmTelemetry = {
            totalCalls: llmTelemetryBuffer.length,
            avgLatencyMs: 0,
            fallbackCount: 0,
            estimatedCostMxn: 0,
            byProvider: []
        };
        try {
            const [summaryRows] = await dbPool.query(`
                SELECT
                    COUNT(*) AS totalCalls,
                    ROUND(AVG(latencia_ms)) AS avgLatencyMs,
                    SUM(CASE WHEN fue_fallback = 1 THEN 1 ELSE 0 END) AS fallbackCount,
                    ROUND(SUM(costo_est_mxn), 4) AS estimatedCostMxn
                FROM llm_telemetria
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            `);
            const [providerRows] = await dbPool.query(`
                SELECT
                    proveedor AS provider,
                    modelo AS model,
                    COUNT(*) AS calls,
                    ROUND(AVG(latencia_ms)) AS avgLatencyMs,
                    ROUND(SUM(costo_est_mxn), 4) AS costMxn
                FROM llm_telemetria
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                GROUP BY proveedor, modelo
                ORDER BY calls DESC
                LIMIT 10
            `);
            if (summaryRows[0] && Number(summaryRows[0].totalCalls) > 0) {
                llmTelemetry = {
                    totalCalls: Number(summaryRows[0].totalCalls || 0),
                    avgLatencyMs: Number(summaryRows[0].avgLatencyMs || 0),
                    fallbackCount: Number(summaryRows[0].fallbackCount || 0),
                    estimatedCostMxn: Number(summaryRows[0].estimatedCostMxn || 0),
                    byProvider: providerRows
                };
            } else if (llmTelemetryBuffer.length > 0) {
                const total = llmTelemetryBuffer.length;
                llmTelemetry.avgLatencyMs = Math.round(llmTelemetryBuffer.reduce((a, b) => a + b.latencia_ms, 0) / total);
                llmTelemetry.fallbackCount = llmTelemetryBuffer.filter(x => x.fue_fallback).length;
                llmTelemetry.estimatedCostMxn = Number(llmTelemetryBuffer.reduce((a, b) => a + b.costo_est_mxn, 0).toFixed(4));
            }
        } catch (_) {}

        res.json({
            success: true,
            totalLeads,
            activos,
            archivados,
            locales,
            foraneos,
            byCareer,
            byStatus,
            byInterest,
            byModality,
            totalConversations,
            conversionRate: Number(conversionRate),
            llmTelemetry
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Monitor de Salud Semáforo Completo Multi-Proveedor (Protegido con JWT)
app.get('/api/health/full', authMiddleware, async (req, res) => {
    let dbStatus = false;
    let dbLatencyMs = null;
    let dbCount = 0;
    const t0 = Date.now();
    try {
        const connection = await dbPool.getConnection();
        const [c] = await connection.query('SELECT COUNT(*) as count FROM aspirantes');
        connection.release();
        dbLatencyMs = Date.now() - t0;
        dbStatus = true;
        dbCount = c[0]?.count || 0;
    } catch (e) {
        dbLatencyMs = Date.now() - t0;
    }

    const hasMeta = Boolean(WHATSAPP_TOKEN && WHATSAPP_PHONE_NUMBER_ID && !setupUtils.isPlaceholderValue(WHATSAPP_TOKEN));
    const hasGemini = isValidApiKey(process.env.GEMINI_API_KEY);
    const hasClaude = isValidApiKey(process.env.ANTHROPIC_API_KEY);
    const hasOpenAi = isValidApiKey(process.env.OPENAI_API_KEY);
    const hasDeepSeek = isValidApiKey(process.env.DEEPSEEK_API_KEY);
    const hasGroq = isValidApiKey(process.env.GROQ_API_KEY);
    const hasOllama = isOllamaConfigured();
    const hasSmtp = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && !setupUtils.isPlaceholderValue(process.env.SMTP_PASS));

    const atLeastOneAI = hasGemini || hasClaude || hasOpenAi || hasDeepSeek || hasGroq || hasOllama;

    res.json({
        timestamp: new Date().toISOString(),
        overall: (dbStatus && atLeastOneAI) ? 'healthy' : 'warning',
        hardware: setupUtils.getSystemHardwareReport(PORT),
        circuitBreaker: {
            cooldownsActive: providerCooldowns.size > 0,
            activeCooldownProviders: Array.from(providerCooldowns.entries()).map(([k, v]) => ({
                provider: k,
                remainingSec: Math.max(0, Math.ceil((v - Date.now()) / 1000))
            }))
        },
        services: {
            mariadb: {
                status: dbStatus ? 'online' : 'offline',
                latencyMs: dbLatencyMs,
                totalRecords: dbCount,
                host: process.env.DB_HOST || 'localhost',
                database: process.env.DB_NAME || 'unid_admisiones'
            },
            aiEngines: {
                activeModel: globalActiveModelId,
                gemini: {
                    status: hasGemini ? (isProviderInCooldown('google') ? 'cooldown' : 'online') : 'not_configured',
                    cooldownSec: getProviderCooldownRemaining('google')
                },
                claude: {
                    status: hasClaude ? (isProviderInCooldown('anthropic') ? 'cooldown' : 'online') : 'not_configured',
                    cooldownSec: getProviderCooldownRemaining('anthropic')
                },
                openai: {
                    status: hasOpenAi ? (isProviderInCooldown('openai') ? 'cooldown' : 'online') : 'not_configured',
                    cooldownSec: getProviderCooldownRemaining('openai')
                },
                deepseek: {
                    status: hasDeepSeek ? (isProviderInCooldown('deepseek') ? 'cooldown' : 'online') : 'not_configured',
                    cooldownSec: getProviderCooldownRemaining('deepseek')
                },
                groq: {
                    status: hasGroq ? (isProviderInCooldown('groq') ? 'cooldown' : 'online') : 'not_configured',
                    cooldownSec: getProviderCooldownRemaining('groq')
                },
                ollama: {
                    status: hasOllama ? (isProviderInCooldown('ollama') ? 'cooldown' : 'online') : 'disabled',
                    model: process.env.OLLAMA_MODEL || '',
                    cooldownSec: getProviderCooldownRemaining('ollama')
                }
            },
            metaWhatsApp: {
                status: hasMeta ? 'configured' : 'sandbox_local',
                tokenPresent: Boolean(WHATSAPP_TOKEN && !setupUtils.isPlaceholderValue(WHATSAPP_TOKEN)),
                phoneNumberIdPresent: Boolean(WHATSAPP_PHONE_NUMBER_ID && !setupUtils.isPlaceholderValue(WHATSAPP_PHONE_NUMBER_ID)),
                verifyTokenPresent: Boolean(VERIFY_TOKEN),
                webhookSignatureEnabled: Boolean(META_APP_SECRET && !setupUtils.isPlaceholderValue(META_APP_SECRET))
            },
            memoryGc: {
                activeConversations: conversationMemory.size,
                activeSessions: userSessionState.size,
                dedupIdsCached: processedMessageIds.size,
                lastCleanupAt: lastMemoryCleanupStats.lastRunAt
            },
            notifications: {
                status: hasSmtp ? 'configured' : 'simulated_console',
                smtpHost: process.env.SMTP_HOST || 'No configurado',
                destination: process.env.ADMISSIONS_NOTIFICATION_EMAIL || 'Consola local',
                alertAdminEmail: process.env.ALERT_ADMIN_EMAIL || process.env.ADMISSIONS_NOTIFICATION_EMAIL || 'No configurado'
            }
        }
    });
});

// Diagnóstico simple de Salud (Público mínimo para Docker/PM2/Cloudflare healthchecks; sin exponer stack/errores internos)
app.get('/api/health', async (req, res) => {
    let dbStatus = false;
    try {
        const connection = await dbPool.getConnection();
        connection.release();
        dbStatus = true;
    } catch (_) {}

    res.json({
        status: 'online',
        botName: 'Metal-Uriel',
        dbConnected: dbStatus,
        webhookSignatureEnabled: Boolean(META_APP_SECRET && !setupUtils.isPlaceholderValue(META_APP_SECRET))
    });
});

// Exportar aspirantes en formato CSV con Lead Scoring y Resumen (Desarrollador y Administrador de Sede)
app.get('/api/aspirantes/export', authMiddleware, authorizeRoles('desarrollador', 'administrador'), async (req, res) => {
    try {
        let rows = [];
        try {
            let sql = 'SELECT * FROM aspirantes';
            const params = [];
            if (req.user.rol !== 'desarrollador' && req.user.sede_id) {
                sql += ' WHERE (sede_id = ? OR campus_interes LIKE ?)';
                params.push(req.user.sede_id, `%${req.user.sede_id.replace(/_/g, ' ')}%`);
            }
            sql += ' ORDER BY created_at DESC';
            const [dbRows] = await dbPool.query(sql, params);
            rows = dbRows;
        } catch (dbErr) {
            console.warn('⚠️ No se pudo consultar MariaDB para exportar CSV:', dbErr.message);
        }
        
        const headers = [
            'ID', 'Fecha de Registro', 'CURP (Generada por IA)', 'Estado de Seguimiento', 'Lead Scoring (Interes)', 'Resumen IA',
            'Nombre Completo', 'Fecha de Nacimiento', 'Sexo', 
            'Estado de Nacimiento', 'Telefono Celular', 'Correo Electronico', 
            'Bachillerato de Procedencia', 'Carrera de Interes', 'Direccion', 
            'Codigo Postal', 'Campus de Interes', 'Modalidad de Estudios', 'Es Foraneo'
        ];

        const escapeCsv = (val) => {
            if (val === null || val === undefined) return '""';
            const str = String(val).replace(/"/g, '""');
            return `"${str}"`;
        };

        const csvRows = [headers.map(escapeCsv).join(',')];

        for (const r of rows) {
            const rowValues = [
                r.id,
                r.created_at ? new Date(r.created_at).toLocaleString('es-MX') : '',
                r.curp || '',
                r.estado_prospecto || 'nuevo',
                r.nivel_interes || 'Alto',
                r.resumen_ia || '',
                r.nombre_completo,
                r.fecha_nacimiento ? String(r.fecha_nacimiento).split('T')[0] : '',
                r.sexo,
                r.estado_nacimiento,
                r.telefono_celular,
                r.correo_electronico,
                r.bachillerato_procedencia,
                r.carrera_interes,
                r.direccion,
                r.codigo_postal,
                r.campus_interes,
                r.modalidad_estudios,
                r.es_foraneo ? 'SI (Online)' : 'NO (Campeche)'
            ];
            csvRows.push(rowValues.map(escapeCsv).join(','));
        }

        const csvString = '\uFEFF' + csvRows.join('\r\n');
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=aspirantes_unid_${new Date().toISOString().slice(0,10)}.csv`);
        res.status(200).send(csvString);
    } catch (err) {
        res.status(500).send('Error exportando datos: ' + err.message);
    }
});

// Reiniciar sesión (Protegido con JWT)
app.post('/api/session/reset', authMiddleware, (req, res) => {
    const { phone } = req.body;
    if (phone) {
        conversationMemory.delete(phone);
        userSessionState.delete(phone);
    } else if (req.user.rol === 'desarrollador') {
        conversationMemory.clear();
        userSessionState.clear();
    } else {
        return res.status(403).json({ error: 'Solo el Desarrollador puede limpiar todas las sesiones globales.' });
    }
    res.json({ success: true, message: 'Sesión reiniciada con éxito.' });
});

// ==========================================
// 15. Endpoints Webhook de Meta WhatsApp
// ==========================================

// Endpoint GET: Verificación del Webhook de Meta
app.get('/webhook', webhookLimiter, (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log(`🔍 Intento de verificación de Webhook: mode=${mode}, token=${token}`);

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('✅ Webhook verificado exitosamente con Meta.');
            return res.status(200).send(challenge);
        } else {
            console.warn(`❌ Token de verificación inválido. Esperado: "${VERIFY_TOKEN}", Recibido: "${token}"`);
            return res.sendStatus(403);
        }
    }

    return res.sendStatus(400);
});

// Endpoint POST: Recepción de Mensajes de WhatsApp (Protegido con Rate Limit + HMAC X-Hub-Signature-256)
app.post('/webhook', webhookLimiter, verifyMetaWebhookSignature, async (req, res) => {
    // 1. Responder de inmediato con 200 OK a Meta
    res.status(200).send('EVENT_RECEIVED');

    try {
        const body = req.body;

        if (body.object === 'whatsapp_business_account' && Array.isArray(body.entry)) {
            for (const entry of body.entry) {
                const changes = entry.changes;
                if (!Array.isArray(changes)) continue;

                for (const change of changes) {
                    const value = change.value;
                    if (!value) continue;

                    // Si es solo una actualización de entrega o lectura (statuses), ignorar
                    if (value.statuses && (!value.messages || value.messages.length === 0)) {
                        continue;
                    }

                    if (Array.isArray(value.messages)) {
                        for (const messageObj of value.messages) {
                            if (!messageObj) continue;

                            const messageId = messageObj.id;
                            if (messageId) {
                                if (processedMessageIds.has(messageId)) {
                                    console.log(`⏩ [DEDUPLICACIÓN] Mensaje ${messageId} ya procesado. Omitiendo.`);
                                    continue;
                                }
                                processedMessageIds.add(messageId);
                                if (processedMessageIds.size > 2000) {
                                    const first = processedMessageIds.values().next().value;
                                    processedMessageIds.delete(first);
                                }
                            }

                            let messageText = '';
                            if (messageObj.type === 'text' && messageObj.text?.body) {
                                messageText = messageObj.text.body.trim();
                            } else if (messageObj.type === 'button' && messageObj.button?.text) {
                                messageText = messageObj.button.text.trim();
                            } else if (messageObj.type === 'interactive') {
                                messageText = messageObj.interactive?.button_reply?.title || messageObj.interactive?.list_reply?.title || '';
                            }

                            if (!messageText) {
                                console.log(`ℹ️ [WEBHOOK] Evento de tipo '${messageObj.type}' recibido sin texto para responder.`);
                                continue;
                            }

                            const senderPhone = messageObj.from;
                            const canonical = normalizePhoneCanonical(senderPhone) || senderPhone;
                            console.log(`📩 [WHATSAPP MENSAJE] De [${senderPhone}]: "${messageText}"`);

                            // Verificar si la IA está pausada por un asesor humano (Human Handover)
                            const session = userSessionState.get(canonical) || userSessionState.get(senderPhone);
                            if (session && session.isPaused) {
                                console.log(`⏸️ [CONTROL HUMANO] Mensaje recibido de [${senderPhone}]: "${messageText}". Metal-Uriel está en pausa.`);
                                if (!conversationMemory.has(canonical)) {
                                    conversationMemory.set(canonical, []);
                                }
                                conversationMemory.get(canonical).push({
                                    role: 'user',
                                    content: messageText,
                                    whatsappMessageId: messageId || null,
                                    timestamp: new Date()
                                });
                                touchUserSession(canonical);
                                // Resguardar PERMANENTEMENTE en MariaDB incluso durante Control Humano
                                await guardarMensajeHistorialBD(senderPhone, 'user', messageText, session.leadData?.sede_id || 'campeche', {
                                    senderName: session.leadData?.nombre_completo || 'Aspirante',
                                    whatsappMessageId: messageId || null
                                });
                                continue;
                            }

                            const result = await processChatMessage(senderPhone, messageText, null, 'campeche', {
                                whatsappMessageId: messageId || null
                            });
                            await sendWhatsAppMessage(senderPhone, result.reply, result.documentAttachment);
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error('❌ Error procesando el webhook de WhatsApp:', error);
    }
});

// ==========================================
// 15.5. Endpoints de Bandeja Eterna Auditada (Live Inbox, Perfil WhatsApp, Cierre Manual & Export ZIP)
// ==========================================

function parseAttachmentJsonSafe(raw) {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch (_) { return null; }
}

function formatFullDateTimeEsMx(ts) {
    const d = ts ? new Date(ts) : new Date();
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('es-MX', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatAuditedMessage(m, idx, aspiranteNombre) {
    const rol = m.rol || m.role || 'assistant';
    const remitenteNombre = m.remitente_nombre || m.senderName || null;
    const modeloIa = m.modelo_ia || m.modelUsed || null;
    const audit = formatSenderAudit(rol, remitenteNombre, modeloIa, aspiranteNombre);
    const ts = m.timestamp ? new Date(m.timestamp) : new Date();
    const validTs = isNaN(ts.getTime()) ? new Date() : ts;
    return {
        id: m.id || `mem_${idx + 1}`,
        seq: idx + 1,
        sender: audit.sender,
        roleCode: audit.roleCode,
        roleLabel: audit.roleLabel,
        senderName: audit.displayAuthor,
        displayAuthor: audit.displayAuthor,
        modelUsed: modeloIa,
        whatsappMessageId: m.whatsapp_message_id || m.whatsappMessageId || null,
        text: String(m.mensaje ?? m.content ?? m.text ?? ''),
        time: validTs.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        fullDateTime: formatFullDateTimeEsMx(validTs),
        timestamp: validTs.toISOString(),
        documentAttachment: parseAttachmentJsonSafe(m.adjunto_json || m.documentAttachment)
    };
}

function mergeDbAndMemoryMessages(dbRows = [], memRows = []) {
    const combined = dbRows.map(r => ({
        id: r.id,
        rol: r.rol,
        remitente_nombre: r.remitente_nombre || null,
        modelo_ia: r.modelo_ia || null,
        whatsapp_message_id: r.whatsapp_message_id || null,
        adjunto_json: parseAttachmentJsonSafe(r.adjunto_json),
        mensaje: r.mensaje || '',
        timestamp: r.timestamp ? new Date(r.timestamp) : new Date()
    }));

    for (const mem of memRows) {
        const memRole = mem.role || mem.rol || 'assistant';
        const memText = String(mem.content ?? mem.mensaje ?? '').trim();
        const memTs = mem.timestamp ? new Date(mem.timestamp).getTime() : Date.now();
        if (!memText) continue;
        const alreadyInDb = combined.some(dbMsg => {
            const dbTs = dbMsg.timestamp ? new Date(dbMsg.timestamp).getTime() : 0;
            return dbMsg.rol === memRole
                && String(dbMsg.mensaje || '').trim() === memText
                && Math.abs(dbTs - memTs) <= 10000;
        });
        if (!alreadyInDb) {
            combined.push({
                id: null,
                rol: memRole,
                remitente_nombre: mem.senderName || null,
                modelo_ia: mem.modelUsed || null,
                whatsapp_message_id: mem.whatsappMessageId || null,
                adjunto_json: mem.documentAttachment || null,
                mensaje: memText,
                timestamp: new Date(memTs)
            });
        }
    }
    combined.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return combined;
}

function mergeDuplicateLeads(leadRows = []) {
    if (leadRows.length === 0) return null;
    if (leadRows.length === 1) return { ...leadRows[0] };
    const ranked = [...leadRows].sort((a, b) => {
        const score = (row) => {
            let s = 0;
            if (row.estado_prospecto === 'inscrito') s += 1000;
            if (row.conversacion_destacada) s += 500;
            if (row.cerrado_manualmente) s += 200;
            s += analyzeLeadCompleteness(row, []).completedCount * 20;
            s += Number(row.id || 0) * 0.001;
            return s;
        };
        return score(b) - score(a);
    });
    const primary = { ...ranked[0] };
    primary.telefono_celular = pickBestDialPhone(ranked.map(r => r.telefono_celular).filter(Boolean)) || primary.telefono_celular;
    primary.conversacion_destacada = ranked.some(r => Boolean(r.conversacion_destacada) || r.estado_prospecto === 'inscrito') ? 1 : 0;
    primary.archivado = ranked.every(r => Boolean(r.archivado)) ? 1 : (primary.archivado ? 1 : 0);
    const fillFields = [
        'nombre_completo', 'curp', 'fecha_nacimiento', 'sexo', 'estado_nacimiento',
        'correo_electronico', 'bachillerato_procedencia', 'carrera_interes',
        'direccion', 'codigo_postal', 'campus_interes', 'modalidad_estudios',
        'resumen_ia', 'notas_asesor', 'fecha_inscripcion'
    ];
    for (const sec of ranked.slice(1)) {
        for (const f of fillFields) {
            const cur = primary[f];
            const isPlaceholder = !cur || /^(prospecto whatsapp|por definir|sin especificar)/i.test(String(cur).trim());
            if (isPlaceholder && sec[f] && !/^(prospecto whatsapp|por definir|sin especificar)/i.test(String(sec[f]).trim())) {
                primary[f] = sec[f];
            }
        }
    }
    return primary;
}

async function loadCanonicalConversationDetail(rawPhone, user) {
    const canonical = normalizePhoneCanonical(rawPhone);
    if (!canonical) return null;
    let leadRows = [];
    let dbHistoryRows = [];
    try {
        const [aRows] = await dbPool.query(
            `SELECT * FROM aspirantes
             WHERE telefono_canonico = ?
                OR REPLACE(REPLACE(REPLACE(telefono_celular, '+', ''), ' ', ''), '-', '') LIKE ?
             ORDER BY id DESC`,
            [canonical, `%${canonical}%`]
        );
        leadRows = aRows || [];
        const [hRows] = await dbPool.query(
            `SELECT * FROM historial_conversaciones
             WHERE telefono_canonico = ?
                OR REPLACE(REPLACE(REPLACE(telefono_celular, '+', ''), ' ', ''), '-', '') LIKE ?
             ORDER BY timestamp ASC, id ASC`,
            [canonical, `%${canonical}%`]
        );
        dbHistoryRows = hRows || [];
    } catch (_) {}

    const mergedLead = mergeDuplicateLeads(leadRows);
    if (user && user.rol !== 'desarrollador' && user.sede_id && mergedLead && mergedLead.sede_id && mergedLead.sede_id !== user.sede_id) {
        return { forbidden: true };
    }

    const memMessages = [];
    const dialCandidates = [rawPhone];
    if (mergedLead?.telefono_celular) dialCandidates.push(mergedLead.telefono_celular);
    for (const h of dbHistoryRows) if (h.telefono_celular) dialCandidates.push(h.telefono_celular);

    let session = userSessionState.get(canonical) || {};
    for (const [k, hist] of conversationMemory.entries()) {
        if (normalizePhoneCanonical(k) === canonical) {
            dialCandidates.push(k);
            memMessages.push(...hist);
        }
    }
    for (const [k, s] of userSessionState.entries()) {
        if (normalizePhoneCanonical(k) === canonical) session = { ...session, ...s };
    }

    const dialPhone = pickBestDialPhone(dialCandidates) || rawPhone;
    const rawTimeline = mergeDbAndMemoryMessages(dbHistoryRows, memMessages);
    const partial = extractPartialFieldsFromHistory(rawTimeline.map(m => ({ role: m.rol, content: m.mensaje })));

    const effectiveLead = mergedLead || {
        ...(session.leadData || {}),
        ...partial,
        telefono_celular: dialPhone,
        telefono_canonico: canonical,
        estado_prospecto: 'nuevo',
        sede_id: resolveSedeId(session.leadData?.campus_interes || partial.campus_interes)
    };
    const aspiranteNombre = (effectiveLead.nombre_completo && !/^prospecto whatsapp/i.test(effectiveLead.nombre_completo))
        ? effectiveLead.nombre_completo
        : (effectiveLead.nombre_completo || `Aspirante (${dialPhone})`);

    const auditedMessages = rawTimeline.map((m, idx) => formatAuditedMessage(m, idx, aspiranteNombre));
    const completeness = analyzeLeadCompleteness(effectiveLead, auditedMessages);
    const isGoldenCase = Boolean(effectiveLead.estado_prospecto === 'inscrito' || effectiveLead.conversacion_destacada);

    return {
        canonicalPhone: canonical,
        phone: dialPhone,
        aspirante: effectiveLead,
        name: aspiranteNombre,
        isPaused: Boolean(session.isPaused),
        isGoldenCase,
        archivado: Boolean(effectiveLead.archivado),
        completeness,
        totalMessages: auditedMessages.length,
        messages: auditedMessages
    };
}

// Obtener lista completa y deduplicada de conversaciones auditadas (sin LIMIT 1000)
app.get('/api/conversations', authMiddleware, async (req, res) => {
    try {
        let targetSede = req.query.campus || null;
        if (req.user && req.user.rol !== 'desarrollador' && req.user.sede_id) {
            targetSede = req.user.sede_id;
        }
        const filterSede = (targetSede && targetSede !== 'all' && targetSede !== 'todas') ? targetSede : null;

        let dbAspirantes = [];
        let dbHistoryRows = [];
        try {
            let aspQuery = 'SELECT * FROM aspirantes';
            const aspParams = [];
            if (filterSede) {
                aspQuery += ' WHERE (sede_id = ? OR campus_interes LIKE ?)';
                aspParams.push(filterSede, `%${filterSede.replace(/_/g, ' ')}%`);
            }
            aspQuery += ' ORDER BY COALESCE(ultimo_mensaje_at, created_at) DESC, id DESC';
            const [rows] = await dbPool.query(aspQuery, aspParams);
            dbAspirantes = rows || [];

            let histQuery = 'SELECT * FROM historial_conversaciones';
            const histParams = [];
            if (filterSede) {
                histQuery += ' WHERE sede_id = ?';
                histParams.push(filterSede);
            }
            histQuery += ' ORDER BY timestamp ASC, id ASC';
            const [hRows] = await dbPool.query(histQuery, histParams);
            dbHistoryRows = hRows || [];
        } catch (e) {
            console.warn('Advertencia consultando aspirantes para conversaciones:', e.message);
        }

        const leadsByCanon = new Map();
        for (const asp of dbAspirantes) {
            const canon = normalizePhoneCanonical(asp.telefono_canonico || asp.telefono_celular || `asp_${asp.id}`);
            if (!canon) continue;
            if (!leadsByCanon.has(canon)) leadsByCanon.set(canon, []);
            leadsByCanon.get(canon).push(asp);
        }

        const dbHistByCanon = new Map();
        const dialPoolByCanon = new Map();
        const registerDial = (canon, raw) => {
            if (!canon || !raw) return;
            if (!dialPoolByCanon.has(canon)) dialPoolByCanon.set(canon, []);
            dialPoolByCanon.get(canon).push(raw);
        };
        for (const h of dbHistoryRows) {
            const canon = normalizePhoneCanonical(h.telefono_canonico || h.telefono_celular);
            if (!canon) continue;
            registerDial(canon, h.telefono_celular);
            if (!dbHistByCanon.has(canon)) dbHistByCanon.set(canon, []);
            dbHistByCanon.get(canon).push(h);
        }

        const memByCanon = new Map();
        const sessionByCanon = new Map();
        for (const [k, hist] of conversationMemory.entries()) {
            const canon = normalizePhoneCanonical(k);
            if (!canon) continue;
            registerDial(canon, k);
            if (!memByCanon.has(canon)) memByCanon.set(canon, []);
            memByCanon.get(canon).push(...hist);
        }
        for (const [k, sess] of userSessionState.entries()) {
            const canon = normalizePhoneCanonical(k);
            if (!canon) continue;
            registerDial(canon, k);
            sessionByCanon.set(canon, { ...(sessionByCanon.get(canon) || {}), ...sess });
        }

        const allCanonKeys = new Set([...leadsByCanon.keys(), ...dbHistByCanon.keys(), ...memByCanon.keys()]);
        const activeCicloDefault = await getActiveCicloEscolar(filterSede || 'campeche');
        const conversations = [];

        for (const canon of allCanonKeys) {
            const mergedLead = mergeDuplicateLeads(leadsByCanon.get(canon) || []);
            if (mergedLead?.telefono_celular) registerDial(canon, mergedLead.telefono_celular);

            const session = sessionByCanon.get(canon) || {};
            const fullRawTimeline = mergeDbAndMemoryMessages(dbHistByCanon.get(canon) || [], memByCanon.get(canon) || []);
            const partial = extractPartialFieldsFromHistory(fullRawTimeline.map(m => ({ role: m.rol, content: m.mensaje })));

            const convSede = mergedLead?.sede_id || resolveSedeId(mergedLead?.campus_interes || session.leadData?.campus_interes || partial.campus_interes);
            if (filterSede && convSede !== filterSede) continue;

            const dialPhone = pickBestDialPhone(dialPoolByCanon.get(canon) || [canon]) || canon;
            const effectiveLead = mergedLead || {
                ...(session.leadData || {}),
                ...partial,
                telefono_celular: dialPhone,
                telefono_canonico: canon,
                sede_id: convSede,
                ciclo_escolar: session.leadData?.ciclo_escolar || activeCicloDefault,
                estado_prospecto: 'nuevo',
                nivel_interes: 'Alto'
            };

            const rawName = effectiveLead.nombre_completo || partial.nombre_completo || '';
            const cleanName = (rawName && !/^prospecto whatsapp/i.test(rawName))
                ? rawName
                : (rawName || `Aspirante (${dialPhone})`);

            const allAudited = fullRawTimeline.map((m, idx) => formatAuditedMessage(m, idx, cleanName));
            const completeness = analyzeLeadCompleteness(effectiveLead, allAudited);
            const isGoldenCase = Boolean(effectiveLead.estado_prospecto === 'inscrito' || effectiveLead.conversacion_destacada);
            const previewWindow = allAudited.length > 80 ? allAudited.slice(-80) : allAudited;
            const lastEntry = allAudited.length > 0 ? allAudited[allAudited.length - 1] : null;
            const firstEntry = allAudited.length > 0 ? allAudited[0] : null;

            conversations.push({
                canonicalPhone: canon,
                phone: dialPhone,
                cleanPhone: canon,
                sede_id: convSede,
                ciclo_escolar: effectiveLead.ciclo_escolar || activeCicloDefault,
                name: cleanName,
                carrera: effectiveLead.carrera_interes || partial.carrera_interes || 'Por definir',
                campus: effectiveLead.campus_interes || partial.campus_interes || 'San Francisco de Campeche',
                modalidad: effectiveLead.modalidad_estudios || partial.modalidad_estudios || 'Presencial',
                isPaused: Boolean(session.isPaused),
                estado_prospecto: effectiveLead.estado_prospecto || 'nuevo',
                nivel_interes: effectiveLead.nivel_interes || 'Alto',
                archivado: Boolean(effectiveLead.archivado),
                isGoldenCase,
                conversacion_destacada: isGoldenCase,
                cerrado_manualmente: Boolean(effectiveLead.cerrado_manualmente),
                cerrado_por: effectiveLead.cerrado_por || null,
                fecha_inscripcion: effectiveLead.fecha_inscripcion || null,
                notas_asesor: effectiveLead.notas_asesor || null,
                leadData: effectiveLead,
                isRegistered: Boolean(mergedLead || session.isRegistered),
                completeness,
                totalMessages: allAudited.length,
                hasMoreHistory: allAudited.length > previewWindow.length,
                firstMessageAt: firstEntry ? firstEntry.timestamp : (effectiveLead.created_at || null),
                messages: previewWindow,
                lastMessage: lastEntry ? lastEntry.text : (effectiveLead.resumen_ia || 'Ficha registrada en MariaDB'),
                lastMessageRole: lastEntry ? lastEntry.roleLabel : 'Sistema',
                lastMessageTime: lastEntry ? lastEntry.timestamp : (effectiveLead.ultimo_mensaje_at || effectiveLead.created_at || new Date().toISOString())
            });
        }

        conversations.sort((a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime());
        const summary = {
            total: conversations.length,
            active: conversations.filter(c => !c.archivado).length,
            incomplete: conversations.filter(c => !c.archivado && c.completeness?.isIncomplete).length,
            needsAttention: conversations.filter(c => !c.archivado && c.completeness?.needsHumanAttention).length,
            goldenCases: conversations.filter(c => c.isGoldenCase).length,
            archived: conversations.filter(c => c.archivado).length
        };

        res.json({ success: true, count: conversations.length, summary, conversations });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Historial completo 100% sin truncar
app.get('/api/conversations/:phone/history', authMiddleware, async (req, res) => {
    try {
        const detail = await loadCanonicalConversationDetail(req.params.phone, req.user);
        if (!detail) return res.status(400).json({ error: 'Teléfono inválido.' });
        if (detail.forbidden) return res.status(403).json({ error: 'Sin permisos para ver conversaciones de otra sede.' });
        res.json({ success: true, ...detail });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Finalizar Proceso a Mano
app.post('/api/conversations/:phone/finalize', authMiddleware, async (req, res) => {
    try {
        const rawPhone = req.params.phone;
        const canonical = normalizePhoneCanonical(rawPhone);
        if (!canonical) return res.status(400).json({ error: 'Teléfono inválido.' });

        const allowedStates = ['nuevo', 'contactado', 'en_proceso', 'inscrito', 'no_interesado'];
        const estado = allowedStates.includes(req.body.estado_prospecto) ? req.body.estado_prospecto : 'inscrito';
        const notasAsesor = String(req.body.notas_asesor || '').trim().slice(0, 1500);
        const archivar = Boolean(req.body.archivar);
        const actor = req.user.displayName || req.user.email || 'Asesor Admisiones UNID';
        const targetSede = (req.user.rol !== 'desarrollador' && req.user.sede_id) ? req.user.sede_id : (req.body.sede_id || 'campeche');

        const [existingRows] = await dbPool.query(
            `SELECT * FROM aspirantes
             WHERE telefono_canonico = ?
                OR REPLACE(REPLACE(REPLACE(telefono_celular, '+', ''), ' ', ''), '-', '') LIKE ?
             ORDER BY id DESC`,
            [canonical, `%${canonical}%`]
        );

        let leadRecord = null;
        const isEnrolled = estado === 'inscrito';

        if (existingRows && existingRows.length > 0) {
            const primary = mergeDuplicateLeads(existingRows);
            if (req.user.rol !== 'desarrollador' && req.user.sede_id && primary.sede_id && primary.sede_id !== req.user.sede_id) {
                return res.status(403).json({ error: 'No puedes finalizar un aspirante de otra sede.' });
            }
            await dbPool.execute(
                `UPDATE aspirantes SET
                    nombre_completo = ?, carrera_interes = ?, correo_electronico = ?,
                    modalidad_estudios = ?, campus_interes = ?, estado_prospecto = ?,
                    cerrado_manualmente = 1, cerrado_por = ?, notas_asesor = ?, archivado = ?,
                    conversacion_destacada = CASE WHEN ? = 1 THEN 1 ELSE conversacion_destacada END,
                    fecha_inscripcion = CASE WHEN ? = 1 THEN COALESCE(fecha_inscripcion, CURRENT_TIMESTAMP) ELSE fecha_inscripcion END,
                    ultimo_mensaje_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [
                    req.body.nombre_completo?.trim() || primary.nombre_completo,
                    req.body.carrera_interes?.trim() || primary.carrera_interes,
                    req.body.correo_electronico?.trim() || primary.correo_electronico,
                    req.body.modalidad_estudios?.trim() || primary.modalidad_estudios,
                    req.body.campus_interes?.trim() || primary.campus_interes,
                    estado, actor, notasAsesor || primary.notas_asesor || null,
                    archivar ? 1 : (primary.archivado ? 1 : 0),
                    isEnrolled ? 1 : 0, isEnrolled ? 1 : 0,
                    primary.id
                ]
            );
            const [updated] = await dbPool.query('SELECT * FROM aspirantes WHERE id = ?', [primary.id]);
            leadRecord = updated[0];
        } else {
            const dialPhone = pickBestDialPhone([rawPhone]);
            const cicloActivo = await getActiveCicloEscolar(targetSede);
            const [ins] = await dbPool.execute(
                `INSERT INTO aspirantes (
                    sede_id, ciclo_escolar, nombre_completo, telefono_celular, telefono_canonico,
                    correo_electronico, carrera_interes, campus_interes, modalidad_estudios,
                    estado_prospecto, nivel_interes, archivado, conversacion_destacada,
                    fecha_inscripcion, cerrado_manualmente, cerrado_por, notas_asesor, resumen_ia
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Alto', ?, ?, ?, 1, ?, ?, ?)`,
                [
                    targetSede, cicloActivo,
                    req.body.nombre_completo?.trim() || `Aspirante (${dialPhone})`,
                    dialPhone, canonical,
                    req.body.correo_electronico?.trim() || null,
                    req.body.carrera_interes?.trim() || 'Por definir',
                    req.body.campus_interes?.trim() || 'San Francisco de Campeche',
                    req.body.modalidad_estudios?.trim() || 'Presencial',
                    estado, archivar ? 1 : 0, isEnrolled ? 1 : 0, isEnrolled ? new Date() : null,
                    actor, notasAsesor || null,
                    `Proceso finalizado manualmente por ${actor} como "${estado}".`
                ]
            );
            const [created] = await dbPool.query('SELECT * FROM aspirantes WHERE id = ?', [ins.insertId]);
            leadRecord = created[0];
        }

        const curSess = userSessionState.get(canonical) || { isRegistered: true, isPaused: true, lastActivityAt: Date.now() };
        curSess.isRegistered = true;
        curSess.isPaused = true;
        curSess.leadData = leadRecord;
        curSess.lastActivityAt = Date.now();
        userSessionState.set(canonical, curSess);

        const auditText = `✅ Proceso finalizado manualmente en etapa "${estado.toUpperCase()}" por ${actor}.${isEnrolled ? ' 🏆 Conversación marcada como Caso de Éxito (Estudio).' : ''}${notasAsesor ? ` Notas: ${notasAsesor}` : ''}`;
        if (!conversationMemory.has(canonical)) conversationMemory.set(canonical, []);
        conversationMemory.get(canonical).push({ role: 'system', senderName: actor, content: auditText, timestamp: new Date() });
        await guardarMensajeHistorialBD(leadRecord.telefono_celular || rawPhone, 'system', auditText, leadRecord.sede_id || targetSede, { senderName: actor });

        if (isEnrolled) {
            dispararNotificacionCorreo('CIERRE_INSCRITO', { lead: leadRecord, asesor: actor }).catch(() => {});
        }
        res.json({
            success: true,
            message: isEnrolled ? '🏆 Proceso finalizado como INSCRITO y resguardado como Caso de Estudio.' : `Proceso finalizado manualmente en etapa "${estado}".`,
            aspirante: leadRecord
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Destacar como Caso de Estudio o Archivar
app.patch('/api/conversations/:phone/highlight', authMiddleware, async (req, res) => {
    try {
        const canonical = normalizePhoneCanonical(req.params.phone);
        if (!canonical) return res.status(400).json({ error: 'Teléfono inválido.' });
        const { conversacion_destacada, archivado } = req.body;
        const actor = req.user.displayName || req.user.email || 'Asesor UNID';

        const [rows] = await dbPool.query(
            `SELECT id, sede_id, telefono_celular, conversacion_destacada, archivado
             FROM aspirantes
             WHERE telefono_canonico = ?
                OR REPLACE(REPLACE(REPLACE(telefono_celular, '+', ''), ' ', ''), '-', '') LIKE ?
             ORDER BY id DESC`,
            [canonical, `%${canonical}%`]
        );
        if (!rows || rows.length === 0) return res.status(404).json({ error: 'Aún no existe una ficha registrada para este número.' });
        const primary = rows[0];
        if (req.user.rol !== 'desarrollador' && req.user.sede_id && primary.sede_id && primary.sede_id !== req.user.sede_id) {
            return res.status(403).json({ error: 'Sin permisos sobre otra sede.' });
        }

        const nextHighlight = conversacion_destacada !== undefined ? (conversacion_destacada ? 1 : 0) : primary.conversacion_destacada;
        const nextArchived = archivado !== undefined ? (archivado ? 1 : 0) : primary.archivado;
        await dbPool.execute('UPDATE aspirantes SET conversacion_destacada = ?, archivado = ? WHERE id = ?', [nextHighlight, nextArchived, primary.id]);

        const actions = [];
        if (conversacion_destacada !== undefined) actions.push(nextHighlight ? '🏆 Destacada como Caso de Estudio' : 'Removida de Casos de Estudio');
        if (archivado !== undefined) actions.push(nextArchived ? '🗄️ Archivada' : '📂 Restaurada a bandeja activa');
        if (actions.length > 0) {
            await guardarMensajeHistorialBD(primary.telefono_celular || req.params.phone, 'system', `📌 ${actions.join(' • ')} por ${actor}.`, primary.sede_id || 'campeche', { senderName: actor });
        }
        res.json({ success: true, conversacion_destacada: Boolean(nextHighlight), archivado: Boolean(nextArchived) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Exportar conversación completa en .ZIP estilo WhatsApp
app.get('/api/conversations/:phone/export-zip', authMiddleware, async (req, res) => {
    try {
        const detail = await loadCanonicalConversationDetail(req.params.phone, req.user);
        if (!detail) return res.status(400).json({ error: 'Teléfono inválido.' });
        if (detail.forbidden) return res.status(403).json({ error: 'Sin permisos para exportar conversaciones de otra sede.' });

        const attachmentFiles = [];
        const seenPaths = new Set();
        for (const msg of detail.messages) {
            const att = msg.documentAttachment;
            if (!att) continue;
            const relUrl = att.localUrl || att.url || att.url_recurso || '';
            const match = String(relUrl).match(/\/uploads\/(.+)$/);
            if (!match) continue;
            const candidatePath = path.resolve(UPLOADS_ROOT, match[1]);
            if (!candidatePath.startsWith(UPLOADS_ROOT + path.sep) || seenPaths.has(candidatePath)) continue;
            try {
                if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile() && fs.statSync(candidatePath).size <= 15 * 1024 * 1024) {
                    seenPaths.add(candidatePath);
                    attachmentFiles.push({ fileName: att.fileName || path.basename(candidatePath), buffer: fs.readFileSync(candidatePath) });
                }
            } catch (_) {}
        }

        const { zipBuffer, fileName } = buildWhatsAppConversationZip({
            aspirante: detail.aspirante,
            canonicalPhone: detail.canonicalPhone,
            dialPhone: detail.phone,
            messages: detail.messages,
            completeness: detail.completeness,
            attachmentFiles
        });
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Length', String(zipBuffer.length));
        res.send(zipBuffer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Enviar mensaje manual desde el Asesor de Admisiones a WhatsApp (Protegido con JWT)
app.post('/api/conversations/send-message', authMiddleware, async (req, res) => {
    try {
        const { phone, message, pauseAi, senderName } = req.body;
        if (!phone || !message) {
            return res.status(400).json({ error: 'Teléfono y mensaje requeridos.' });
        }
        const canonical = normalizePhoneCanonical(phone) || phone;
        const dialPhone = pickBestDialPhone([phone]);
        const advisorName = senderName || req.user?.displayName || req.user?.email || 'Asesor Admisiones UNID';

        if (!conversationMemory.has(canonical)) conversationMemory.set(canonical, []);
        const msgObj = { role: 'human_advisor', senderName: advisorName, content: message.trim(), timestamp: new Date() };
        conversationMemory.get(canonical).push(msgObj);
        const targetSede = (req.user.rol !== 'desarrollador' && req.user.sede_id) ? req.user.sede_id : 'campeche';
        await guardarMensajeHistorialBD(dialPhone, 'human_advisor', message.trim(), targetSede, { senderName: advisorName });

        if (!userSessionState.has(canonical)) {
            userSessionState.set(canonical, { isRegistered: false, isPaused: false, lastActivityAt: Date.now() });
        } else {
            touchUserSession(canonical);
        }
        if (pauseAi !== undefined) userSessionState.get(canonical).isPaused = Boolean(pauseAi);

        await sendWhatsAppMessage(dialPhone, message.trim());
        res.json({ success: true, message: msgObj, isPaused: userSessionState.get(canonical).isPaused, canonicalPhone: canonical });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Alternar pausa de la IA para un aspirante específico (Human Handover - Protegido con JWT)
app.post('/api/conversations/toggle-ai', authMiddleware, async (req, res) => {
    try {
        const { phone, isPaused } = req.body;
        if (!phone) return res.status(400).json({ error: 'Teléfono requerido.' });
        const canonical = normalizePhoneCanonical(phone) || phone;
        const actor = req.user?.displayName || req.user?.email || 'Asesor UNID';

        if (!userSessionState.has(canonical)) {
            userSessionState.set(canonical, { isRegistered: false, isPaused: false, lastActivityAt: Date.now() });
        }
        userSessionState.get(canonical).isPaused = Boolean(isPaused);
        touchUserSession(canonical);

        const targetSede = (req.user.rol !== 'desarrollador' && req.user.sede_id) ? req.user.sede_id : 'campeche';
        const auditText = isPaused ? `⏸️ Control Humano activado por ${actor} (Robot IA en pausa).` : `🤖 Robot IA reactivado por ${actor}.`;
        await guardarMensajeHistorialBD(phone, 'system', auditText, targetSede, { senderName: actor });

        console.log(`🤖 [HUMAN HANDOVER] IA para [${phone}] ahora está: ${isPaused ? '⏸️ PAUSADA (Control Asesor Humano)' : '▶️ ACTIVA (Metal-Uriel)'}`);
        res.json({ success: true, isPaused: userSessionState.get(canonical).isPaused, canonicalPhone: canonical });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Enviar recurso del Pool Multimedia (PDF o Imagen) directamente desde la interfaz al chat (Protegido con JWT)
app.post('/api/conversations/send-brochure', authMiddleware, async (req, res) => {
    try {
        const { phone, brochureId } = req.body;
        if (!phone || !brochureId) return res.status(400).json({ error: 'Teléfono y brochureId requeridos.' });
        const canonical = normalizePhoneCanonical(phone) || phone;
        const dialPhone = pickBestDialPhone([phone]);
        const actor = req.user?.displayName || req.user?.email || 'Asesor UNID';

        const poolItems = await getActivePoolItems();
        const foundItem = poolItems.find(b => b.id === brochureId || b.codigo_recurso === brochureId) ||
                          UNID_BROCHURES.find(b => b.id === brochureId);
        if (!foundItem) return res.status(404).json({ error: 'Recurso no encontrado en el Pool.' });

        const attachment = buildAttachmentObject(foundItem);
        const textReply = `Te comparto con mucho gusto el recurso oficial de *${foundItem.titulo || foundItem.carrera}* (${foundItem.modalidad || 'UNID'}). ${foundItem.descripcion_ia || `Referencia Oficial: ${foundItem.rvoe || 'SEP'}`}`;

        if (!conversationMemory.has(canonical)) conversationMemory.set(canonical, []);
        conversationMemory.get(canonical).push({
            role: 'human_advisor',
            senderName: actor,
            content: textReply,
            documentAttachment: attachment,
            timestamp: new Date()
        });

        await guardarMensajeHistorialBD(dialPhone, 'human_advisor', textReply, foundItem.sede_id || 'campeche', {
            senderName: actor,
            documentAttachment: attachment
        });
        await sendWhatsAppMessage(dialPhone, textReply, attachment);
        res.json({ success: true, brochure: attachment, canonicalPhone: canonical });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 15.5. Plug & Play: Asistente de Primera Configuración (First-Run Setup & Live Validators)
// ==========================================
async function computeSetupStatus() {
    const envPath = path.join(__dirname, '.env');
    const hasEnvFile = fs.existsSync(envPath);

    let dbConnected = false;
    let dbError = null;
    try {
        const conn = await dbPool.getConnection();
        await conn.query('SELECT 1');
        conn.release();
        dbConnected = true;
        isDatabaseReady = true;
    } catch (e) {
        dbError = e.message;
        isDatabaseReady = false;
    }

    const hasCloudAi =
        isValidApiKey(process.env.GEMINI_API_KEY) ||
        isValidApiKey(process.env.ANTHROPIC_API_KEY) ||
        isValidApiKey(process.env.OPENAI_API_KEY) ||
        isValidApiKey(process.env.DEEPSEEK_API_KEY) ||
        isValidApiKey(process.env.GROQ_API_KEY);
    const hasOllama = isOllamaConfigured();
    const hasAnyAi = hasCloudAi || hasOllama;
    const hasWhatsApp = Boolean(
        WHATSAPP_PHONE_NUMBER_ID &&
        WHATSAPP_TOKEN &&
        !setupUtils.isPlaceholderValue(WHATSAPP_PHONE_NUMBER_ID) &&
        !setupUtils.isPlaceholderValue(WHATSAPP_TOKEN)
    );
    const hasSmtp = Boolean(
        process.env.SMTP_HOST &&
        process.env.SMTP_USER &&
        process.env.SMTP_PASS &&
        !setupUtils.isPlaceholderValue(process.env.SMTP_PASS)
    );

    const reasons = [];
    if (!hasEnvFile) reasons.push('No existe el archivo .env en el servidor.');
    if (String(process.env.SETUP_COMPLETED || '').toLowerCase() === 'false') {
        reasons.push('Instalación virgen detectada (SETUP_COMPLETED=false).');
    }
    if (!dbConnected) reasons.push(`Sin conexión a MariaDB (${dbError || 'verifica credenciales'}).`);
    if (!hasAnyAi) reasons.push('No hay ningún motor de Inteligencia Artificial configurado.');

    const explicitVirgin = String(process.env.SETUP_COMPLETED || '').toLowerCase() === 'false';
    const explicitDone = String(process.env.SETUP_COMPLETED || '').toLowerCase() === 'true';
    const needsSetup = !hasEnvFile || explicitVirgin || (!explicitDone && (!dbConnected || !hasAnyAi));

    return {
        needsSetup,
        reasons,
        hasEnvFile,
        setupCompleted: explicitDone,
        dbConnected,
        dbError,
        hasAnyAi,
        hasCloudAi,
        ollamaEnabled: hasOllama,
        ollamaModel: process.env.OLLAMA_MODEL || 'qwen2.5:3b',
        hasWhatsApp,
        hasSmtp,
        primaryCampus: process.env.PRIMARY_CAMPUS || 'campeche',
        port: PORT,
        isDemoMode: !isProductionHardened(),
        hardware: setupUtils.getSystemHardwareReport(PORT)
    };
}

async function setupAccessGuard(req, res, next) {
    const status = await computeSetupStatus();
    req.setupStatus = status;
    if (status.needsSetup) {
        return next();
    }
    // Ya configurado: solo un Desarrollador autenticado puede usar /api/setup/*
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(403).json({ error: 'Metal-Uriel ya está configurado. Inicia sesión como Desarrollador para modificar parámetros del servidor.' });
    }
    try {
        const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
        if (normalizeRole(decoded.rol || decoded.role) !== 'desarrollador') {
            return res.status(403).json({ error: 'Solo el rol Desarrollador puede reconfigurar el servidor.' });
        }
        req.user = decoded;
        return next();
    } catch (err) {
        return res.status(401).json({ error: 'Token inválido o expirado para reconfiguración.' });
    }
}

// Estado público del asistente (NUNCA expone secretos)
app.get('/api/setup/status', async (req, res) => {
    try {
        const status = await computeSetupStatus();
        res.json(status);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obtener configuración actual (sin secretos en texto plano) para reconfigurar desde Desarrollador
app.get('/api/setup/current-config', setupAccessGuard, (req, res) => {
    const safeVal = (v, def = '') => (!v || setupUtils.isPlaceholderValue(v)) ? def : v;
    res.json({
        PORT: String(PORT),
        PRIMARY_CAMPUS: safeVal(process.env.PRIMARY_CAMPUS, 'campeche'),
        DB_HOST: safeVal(process.env.DB_HOST, 'localhost'),
        DB_PORT: safeVal(process.env.DB_PORT, '3306'),
        DB_USER: safeVal(process.env.DB_USER, 'root'),
        hasDbPassword: Boolean(process.env.DB_PASSWORD && !setupUtils.isPlaceholderValue(process.env.DB_PASSWORD)),
        DB_NAME: safeVal(process.env.DB_NAME, 'unid_admisiones'),
        hasGeminiKey: isValidApiKey(process.env.GEMINI_API_KEY),
        maskedGeminiKey: isValidApiKey(process.env.GEMINI_API_KEY) ? maskSecret(process.env.GEMINI_API_KEY) : '',
        hasAnthropicKey: isValidApiKey(process.env.ANTHROPIC_API_KEY),
        hasOpenAiKey: isValidApiKey(process.env.OPENAI_API_KEY),
        hasDeepSeekKey: isValidApiKey(process.env.DEEPSEEK_API_KEY),
        hasGroqKey: isValidApiKey(process.env.GROQ_API_KEY),
        OLLAMA_ENABLED: isOllamaConfigured(),
        OLLAMA_BASE_URL: safeVal(process.env.OLLAMA_BASE_URL, 'http://127.0.0.1:11434'),
        OLLAMA_MODEL: safeVal(process.env.OLLAMA_MODEL, 'qwen2.5:3b'),
        OLLAMA_TIMEOUT_MS: safeVal(process.env.OLLAMA_TIMEOUT_MS, '15000'),
        WHATSAPP_PHONE_NUMBER_ID: safeVal(process.env.WHATSAPP_PHONE_NUMBER_ID, ''),
        hasWhatsAppToken: Boolean(WHATSAPP_TOKEN && !setupUtils.isPlaceholderValue(WHATSAPP_TOKEN)),
        maskedWhatsAppToken: (WHATSAPP_TOKEN && !setupUtils.isPlaceholderValue(WHATSAPP_TOKEN)) ? maskSecret(WHATSAPP_TOKEN) : '',
        META_VERIFY_TOKEN: safeVal(process.env.META_VERIFY_TOKEN, ''),
        hasMetaAppSecret: Boolean(META_APP_SECRET && !setupUtils.isPlaceholderValue(META_APP_SECRET)),
        maskedMetaAppSecret: (META_APP_SECRET && !setupUtils.isPlaceholderValue(META_APP_SECRET)) ? maskSecret(META_APP_SECRET) : '',
        hasJwtSecret: Boolean(process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32 && !setupUtils.isPlaceholderValue(process.env.JWT_SECRET)),
        hasEncryptionKey: Boolean(process.env.ENCRYPTION_MASTER_KEY && process.env.ENCRYPTION_MASTER_KEY.length >= 32 && !setupUtils.isPlaceholderValue(process.env.ENCRYPTION_MASTER_KEY)),
        ADMISSIONS_NOTIFICATION_EMAIL: safeVal(process.env.ADMISSIONS_NOTIFICATION_EMAIL, ''),
        ALERT_ADMIN_EMAIL: safeVal(process.env.ALERT_ADMIN_EMAIL, ''),
        SMTP_HOST: safeVal(process.env.SMTP_HOST, 'smtp.gmail.com'),
        SMTP_PORT: safeVal(process.env.SMTP_PORT, '587'),
        SMTP_USER: safeVal(process.env.SMTP_USER, ''),
        hasSmtpPass: Boolean(process.env.SMTP_PASS && !setupUtils.isPlaceholderValue(process.env.SMTP_PASS))
    });
});

// Generador seguro CSPRNG para el wizard
app.get('/api/setup/generate-secrets', setupAccessGuard, (req, res) => {
    res.json({
        JWT_SECRET: setupUtils.generateStrongHex(32),
        ENCRYPTION_MASTER_KEY: setupUtils.generateStrongHex(32),
        META_VERIFY_TOKEN: 'unid_meta_' + setupUtils.generateStrongHex(12),
        RANDOM_PASSWORD: setupUtils.generateStrongPassword(20)
    });
});

// Validación estricta server-side
app.post('/api/setup/validate', setupAccessGuard, (req, res) => {
    const result = setupUtils.validateSetupPayload(req.body || {});
    res.status(result.valid ? 200 : 400).json(result);
});

// Test en vivo de MariaDB (sin requerir que la BD exista previamente)
app.post('/api/setup/test-db', setupAccessGuard, async (req, res) => {
    const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = req.body || {};
    const hostErr = setupUtils.validateField('DB_HOST', DB_HOST, { forceRequired: true });
    const portErr = setupUtils.validateField('DB_PORT', DB_PORT, { forceRequired: true });
    const userErr = setupUtils.validateField('DB_USER', DB_USER, { forceRequired: true });
    const nameErr = setupUtils.validateField('DB_NAME', DB_NAME, { forceRequired: true });
    if (hostErr || portErr || userErr || nameErr) {
        return res.status(400).json({ ok: false, error: hostErr || portErr || userErr || nameErr });
    }

    const effectivePassword = (DB_PASSWORD === '__KEEP_EXISTING__' && !req.setupStatus?.needsSetup)
        ? (process.env.DB_PASSWORD || '')
        : (DB_PASSWORD || '');

    let conn = null;
    try {
        const t0 = Date.now();
        conn = await mysql.createConnection({
            host: String(DB_HOST).trim(),
            port: Number(DB_PORT) || 3306,
            user: String(DB_USER).trim(),
            password: effectivePassword,
            connectTimeout: 7000
        });
        const [verRows] = await conn.query('SELECT VERSION() AS version');
        const [dbs] = await conn.query('SHOW DATABASES LIKE ?', [String(DB_NAME).trim()]);
        await conn.end();
        res.json({
            ok: true,
            latencyMs: Date.now() - t0,
            version: verRows[0]?.version || 'MariaDB/MySQL',
            databaseExists: dbs.length > 0,
            message: dbs.length > 0
                ? `Conexión exitosa (${verRows[0]?.version}). La base "${DB_NAME}" ya existe y está lista.`
                : `Conexión exitosa (${verRows[0]?.version}). La base "${DB_NAME}" se creará automáticamente al finalizar.`
        });
    } catch (err) {
        if (conn) { try { await conn.end(); } catch (_) {} }
        res.status(400).json({ ok: false, error: `No se pudo conectar a MariaDB: ${err.message}` });
    }
});

// Test en vivo de Proveedor IA (Gemini, OpenAI, Anthropic, DeepSeek, Groq u Ollama)
app.post('/api/setup/test-ai', setupAccessGuard, async (req, res) => {
    const { provider, apiKey, ollamaUrl, ollamaModel, ollamaApiKey } = req.body || {};

    try {
        if (provider === 'ollama') {
            const urlErr = setupUtils.validateField('OLLAMA_BASE_URL', ollamaUrl, { forceRequired: true });
            if (urlErr) return res.status(400).json({ ok: false, error: urlErr });
            const cleanUrl = String(ollamaUrl).trim().replace(/\/+$/, '');
            const headers = {};
            if (ollamaApiKey && String(ollamaApiKey).trim()) {
                headers['Authorization'] = `Bearer ${String(ollamaApiKey).trim()}`;
            }
            const t0 = Date.now();
            const r = await axios.get(`${cleanUrl}/api/tags`, { headers, timeout: 6000 });
            const models = (r.data?.models || []).map(m => m.name);
            const target = String(ollamaModel || '').trim();
            const modelFound = !target || models.some(m => m === target || m.startsWith(target + ':'));
            return res.json({
                ok: true,
                latencyMs: Date.now() - t0,
                installedModels: models,
                modelFound,
                message: models.length === 0
                    ? `Ollama responde en ${cleanUrl}, pero no tiene modelos descargados aún (ejecuta: ollama pull ${target || 'qwen2.5:3b'}).`
                    : modelFound
                        ? `Ollama activo (${models.length} modelos). "${target || models[0]}" listo en ${Date.now() - t0}ms.`
                        : `Ollama activo, pero "${target}" no está descargado. Disponibles: ${models.slice(0, 5).join(', ')}`
            });
        }

        const keyFieldMap = {
            google: 'GEMINI_API_KEY',
            anthropic: 'ANTHROPIC_API_KEY',
            openai: 'OPENAI_API_KEY',
            deepseek: 'DEEPSEEK_API_KEY',
            groq: 'GROQ_API_KEY'
        };
        const fieldName = keyFieldMap[provider];
        if (!fieldName) return res.status(400).json({ ok: false, error: 'Proveedor de IA no reconocido.' });

        const effectiveKey = (apiKey === '__KEEP_EXISTING__' && !req.setupStatus?.needsSetup)
            ? (process.env[fieldName] || '')
            : String(apiKey || '').trim();

        const keyErr = setupUtils.validateField(fieldName, effectiveKey, { forceRequired: true });
        if (keyErr) return res.status(400).json({ ok: false, error: keyErr });

        const t0 = Date.now();
        if (provider === 'google') {
            const client = new GoogleGenAI({ apiKey: effectiveKey });
            const resp = await client.models.generateContent({
                model: 'gemini-3.8-flash',
                contents: 'Responde solo OK'
            });
            if (!resp.text) throw new Error('Sin texto devuelto por Gemini.');
            return res.json({ ok: true, latencyMs: Date.now() - t0, message: `Google Gemini 3.8 Flash verificado (${Date.now() - t0} ms).` });
        } else if (provider === 'openai') {
            const client = new OpenAI({ apiKey: effectiveKey });
            await client.models.list();
            return res.json({ ok: true, latencyMs: Date.now() - t0, message: `OpenAI API Key verificada (${Date.now() - t0} ms).` });
        } else if (provider === 'deepseek') {
            const client = new OpenAI({ apiKey: effectiveKey, baseURL: 'https://api.deepseek.com' });
            await client.models.list();
            return res.json({ ok: true, latencyMs: Date.now() - t0, message: `DeepSeek API Key verificada (${Date.now() - t0} ms).` });
        } else if (provider === 'groq') {
            const client = new OpenAI({ apiKey: effectiveKey, baseURL: 'https://api.groq.com/openai/v1' });
            await client.models.list();
            return res.json({ ok: true, latencyMs: Date.now() - t0, message: `Groq Cloud API Key verificada (${Date.now() - t0} ms).` });
        } else if (provider === 'anthropic') {
            const client = new Anthropic({ apiKey: effectiveKey });
            await client.messages.create({
                model: 'claude-3-5-haiku-20241022',
                max_tokens: 8,
                messages: [{ role: 'user', content: 'OK' }]
            });
            return res.json({ ok: true, latencyMs: Date.now() - t0, message: `Anthropic Claude API Key verificada (${Date.now() - t0} ms).` });
        }
    } catch (err) {
        const msg = err.response?.data?.error?.message || err.message || 'Error desconocido';
        res.status(400).json({ ok: false, error: `Falló verificación de ${provider}: ${msg}` });
    }
});

// Test en vivo de Meta WhatsApp Cloud API
app.post('/api/setup/test-whatsapp', setupAccessGuard, async (req, res) => {
    const { WHATSAPP_PHONE_NUMBER_ID: phoneIdRaw, WHATSAPP_TOKEN: tokenRaw } = req.body || {};
    const phoneId = String(phoneIdRaw || '').trim();
    const token = (tokenRaw === '__KEEP_EXISTING__' && !req.setupStatus?.needsSetup)
        ? WHATSAPP_TOKEN
        : String(tokenRaw || '').trim();

    const phoneErr = setupUtils.validateField('WHATSAPP_PHONE_NUMBER_ID', phoneId, { forceRequired: true });
    if (phoneErr) return res.status(400).json({ ok: false, error: phoneErr });
    const tokenErr = setupUtils.validateField('WHATSAPP_TOKEN', token, { forceRequired: true });
    if (tokenErr) return res.status(400).json({ ok: false, error: tokenErr });

    try {
        const r = await axios.get(
            `https://graph.facebook.com/v20.0/${phoneId}?fields=display_phone_number,verified_name,quality_rating`,
            { headers: { Authorization: `Bearer ${token}` }, timeout: 8000 }
        );
        res.json({
            ok: true,
            displayPhone: r.data?.display_phone_number || phoneId,
            verifiedName: r.data?.verified_name || 'WhatsApp Business',
            qualityRating: r.data?.quality_rating || 'GREEN',
            message: `Conectado a "${r.data?.verified_name || 'Meta Business'}" (${r.data?.display_phone_number || phoneId}).`
        });
    } catch (err) {
        const metaMsg = err.response?.data?.error?.message || err.message;
        res.status(400).json({ ok: false, error: `Meta Graph API rechazó las credenciales: ${metaMsg}` });
    }
});

// Test en vivo de SMTP y correo de alerta Life Support
app.post('/api/setup/test-smtp', setupAccessGuard, async (req, res) => {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, testDestination } = req.body || {};
    const effectivePass = (SMTP_PASS === '__KEEP_EXISTING__' && !req.setupStatus?.needsSetup)
        ? (process.env.SMTP_PASS || '')
        : String(SMTP_PASS || '').trim();

    const hErr = setupUtils.validateField('SMTP_HOST', SMTP_HOST, { forceRequired: true });
    const pErr = setupUtils.validateField('SMTP_PORT', SMTP_PORT, { forceRequired: true });
    const uErr = setupUtils.validateField('SMTP_USER', SMTP_USER, { forceRequired: true });
    const pwErr = setupUtils.validateField('SMTP_PASS', effectivePass, { forceRequired: true });
    if (hErr || pErr || uErr || pwErr) {
        return res.status(400).json({ ok: false, error: hErr || pErr || uErr || pwErr });
    }

    try {
        const portNum = Number(SMTP_PORT) || 587;
        const transporter = nodemailer.createTransport({
            host: String(SMTP_HOST).trim(),
            port: portNum,
            secure: portNum === 465,
            auth: { user: String(SMTP_USER).trim(), pass: effectivePass },
            connectionTimeout: 8000
        });
        await transporter.verify();

        const dest = String(testDestination || SMTP_USER).trim();
        await transporter.sendMail({
            from: `"UNID Admisiones • Metal-Uriel" <${String(SMTP_USER).trim()}>`,
            to: dest,
            subject: '✅ Prueba exitosa de Alertas y Correo — Metal-Uriel',
            html: `<div style="font-family:Segoe UI,Arial,sans-serif;padding:20px;background:#0B192C;color:#f8fafc;border-radius:12px;">
                <h2 style="color:#FFC72C;margin-top:0;">🐺 Metal-Uriel conectado correctamente</h2>
                <p>El servidor SMTP <strong>${SMTP_HOST}:${portNum}</strong> fue verificado desde el Asistente de Instalación Plug & Play.</p>
                <p style="font-size:12px;color:#94a3b8;">Recibirás aquí las notificaciones de admisiones y alertas críticas de Life Support.</p>
            </div>`
        });

        res.json({ ok: true, message: `SMTP verificado y correo de prueba enviado a ${dest}.` });
    } catch (err) {
        res.status(400).json({ ok: false, error: `Error SMTP: ${err.message}` });
    }
});

// Guardar configuración final, crear .env, inicializar MariaDB y crear cuentas RBAC cifradas
app.post('/api/setup/complete', setupAccessGuard, async (req, res) => {
    try {
        const isReconfigure = !req.setupStatus?.needsSetup;
        const raw = { ...(req.body || {}), IS_RECONFIGURE: isReconfigure };

        // En reconfiguración, permitir conservar secretos existentes con el marcador __KEEP_EXISTING__
        if (isReconfigure) {
            const preserveKeys = [
                'DB_PASSWORD', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY',
                'DEEPSEEK_API_KEY', 'GROQ_API_KEY', 'WHATSAPP_TOKEN', 'META_APP_SECRET',
                'OLLAMA_API_KEY', 'JWT_SECRET', 'ENCRYPTION_MASTER_KEY', 'SMTP_PASS'
            ];
            for (const k of preserveKeys) {
                if (raw[k] === '__KEEP_EXISTING__' || (!raw[k] && (k === 'JWT_SECRET' || k === 'ENCRYPTION_MASTER_KEY'))) {
                    raw[k] = process.env[k] || '';
                }
            }
        }

        // Validación estricta server-side
        const validation = setupUtils.validateSetupPayload(raw);
        if (!validation.valid) {
            return res.status(400).json({
                ok: false,
                error: 'Hay errores de validación en los campos del formulario. Revisa los formatos requeridos.',
                errors: validation.errors
            });
        }

        // Probar conexión a MariaDB ANTES de escribir .env
        let testConn = null;
        try {
            testConn = await mysql.createConnection({
                host: String(raw.DB_HOST).trim(),
                port: Number(raw.DB_PORT) || 3306,
                user: String(raw.DB_USER).trim(),
                password: raw.DB_PASSWORD || '',
                connectTimeout: 8000
            });
            await testConn.end();
        } catch (dbErr) {
            if (testConn) { try { await testConn.end(); } catch (_) {} }
            return res.status(400).json({
                ok: false,
                error: `No se pudo conectar a MariaDB antes de guardar: ${dbErr.message}`,
                errors: { DB_HOST: `Error de conexión MariaDB: ${dbErr.message}` }
            });
        }

        // Escribir archivo .env seguro en disco
        const envContent = setupUtils.buildEnvFileContent({
            ...raw,
            WHATSAPP_PHONE_NUMBER_ID: raw.SKIP_WHATSAPP ? '' : raw.WHATSAPP_PHONE_NUMBER_ID,
            WHATSAPP_TOKEN: raw.SKIP_WHATSAPP ? '' : raw.WHATSAPP_TOKEN
        });
        const envPath = path.join(__dirname, '.env');
        fs.writeFileSync(envPath, envContent, { encoding: 'utf8', mode: 0o600 });

        // Recargar configuración en caliente sin reiniciar el proceso
        reloadRuntimeConfig();

        // Inicializar MariaDB (crear BD + 8 tablas + cuentas RBAC con scrypt + cifrar WhatsApp en sedes)
        const primaryCampus = raw.PRIMARY_CAMPUS || 'campeche';
        const customDevUser = (!isReconfigure || (raw.DEV_EMAIL && raw.DEV_PASSWORD)) ? {
            correo_institucional: String(raw.DEV_EMAIL || req.user?.correo_institucional || '').trim().toLowerCase(),
            nombre_completo: String(raw.DEV_NAME || req.user?.displayName || 'Desarrollador Metal-Uriel').trim(),
            matricula: String(raw.DEV_EMAIL || '').split('@')[0],
            password: raw.DEV_PASSWORD || ''
        } : null;

        const customAdminUser = (raw.ADMIN_SEDE_EMAIL && raw.ADMIN_SEDE_PASSWORD) ? {
            correo_institucional: String(raw.ADMIN_SEDE_EMAIL).trim().toLowerCase(),
            nombre_completo: String(raw.ADMIN_SEDE_NAME || 'Jefatura de Admisiones UNID').trim(),
            matricula: String(raw.ADMIN_SEDE_EMAIL).split('@')[0],
            password: raw.ADMIN_SEDE_PASSWORD
        } : null;

        await initializeDatabase({
            rebuildPool: true,
            throwOnError: true,
            primaryCampus,
            syncPrimaryCampusCreds: true,
            customDevUser,
            customAdminUser
        });

        // Emitir JWT listo para iniciar sesión automáticamente como el Desarrollador recién configurado
        let sessionToken = null;
        let sessionUser = null;
        const devEmail = customDevUser?.correo_institucional || req.user?.correo_institucional;
        if (devEmail) {
            const [uRows] = await dbPool.query('SELECT * FROM usuarios WHERE correo_institucional = ? LIMIT 1', [devEmail]);
            if (uRows.length > 0) {
                const dbU = uRows[0];
                sessionUser = {
                    id: dbU.id,
                    correo_institucional: dbU.correo_institucional,
                    username: dbU.correo_institucional,
                    displayName: dbU.nombre_completo,
                    matricula: dbU.matricula || dbU.correo_institucional.split('@')[0],
                    rol: 'desarrollador',
                    role: 'desarrollador',
                    roleTitle: getRoleTitle('desarrollador'),
                    sede_id: null,
                    tenant: 'Global (Todas las Sedes UNID)',
                    isInstitutional: true
                };
                sessionToken = jwt.sign(sessionUser, JWT_SECRET, { expiresIn: '7d' });
            }
        }

        const newStatus = await computeSetupStatus();
        console.log(`🎉 [PLUG & PLAY SETUP] Configuración completada y guardada en .env | Sede principal: ${primaryCampus}`);
        res.json({
            ok: true,
            message: 'Metal-Uriel configurado e inicializado correctamente en caliente.',
            token: sessionToken,
            user: sessionUser,
            status: newStatus
        });
    } catch (err) {
        console.error('❌ Error en /api/setup/complete:', err);
        res.status(500).json({ ok: false, error: `Error aplicando configuración: ${err.message}` });
    }
});

// Disparar alerta de prueba Life Support (solo Desarrollador)
app.post('/api/system/test-alert', authMiddleware, authorizeRoles('desarrollador'), async (req, res) => {
    try {
        const result = await enviarAlertaSistema(
            'MANUAL_TEST',
            'Prueba Manual de Monitoreo Life Support',
            `Disparada por ${req.user.displayName} (${req.user.correo_institucional}). El canal de alertas críticas responde correctamente.`,
            true
        );
        if (!result) {
            return res.status(400).json({ error: 'Configura ALERT_ADMIN_EMAIL o ADMISSIONS_NOTIFICATION_EMAIL en .env primero.' });
        }
        res.json({ ok: true, log: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 16. Inicialización del Servidor (0.0.0.0 para Red Local + Plug & Play)
// ==========================================
function startServer(port = PORT, host = HOST) {
    const server = app.listen(port, host, async () => {
        const hw = setupUtils.getSystemHardwareReport(port);
        const setupInfo = await computeSetupStatus().catch(() => ({ needsSetup: false }));
        const hmacActive = Boolean(META_APP_SECRET && !setupUtils.isPlaceholderValue(META_APP_SECRET));
        console.log(`====================================================`);
        console.log(`🐺 :UNID Centro de Mando • Metal-Uriel v2.1 (Blindado + Plug & Play)`);
        console.log(`💻 Hardware: ${hw.cpuCores} núcleos | RAM: ${hw.freeMemGB}/${hw.totalMemGB} GB libre`);
        console.log(`🛡️ Modo de Inferencia: ${globalActiveModelId} ${isOllamaConfigured() ? '(+ Ollama Local último recurso)' : ''}`);
        console.log(`🔐 Seguridad: Helmet + Rate Limiting + RBAC 100% + HMAC Webhook ${hmacActive ? 'ACTIVO ✅' : 'SANDBOX (agrega META_APP_SECRET en producción)'}`);
        console.log(`🌐 Acceso Local: http://localhost:${port}`);
        if (hw.lanUrls.length > 0) {
            hw.lanUrls.forEach(u => console.log(`📱 Acceso Red Local / APK Android (Wi-Fi/Ethernet): ${u}`));
        }
        if (hw.virtualUrls && hw.virtualUrls.length > 0) {
            console.log(`⚠️ Adaptadores virtuales omitidos (NO usar desde celular): ${hw.virtualUrls.join(', ')}`);
        }
        console.log(`🔥 Si el celular no conecta, permite el puerto 3000 en PowerShell Admin:`);
        console.log(`   ${hw.firewallCommand}`);
        console.log(`🚦 Health Monitor: http://localhost:${port}/api/health/full`);
        console.log(`🔗 Webhook de WhatsApp: http://localhost:${port}/webhook`);
        if (setupInfo.needsSetup) {
            console.log(`🧩 PRIMER USO DETECTADO: Abre http://localhost:${port} en tu navegador para completar el Asistente de Instalación.`);
        }
        console.log(`====================================================`);
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.warn(`\n⚠️ [AVISO] El puerto ${port} ya está en uso por otra instancia activa de Metal-Uriel.`);
            console.warn(`👉 La aplicación ya está corriendo en http://localhost:${port} (no necesitas abrir otra terminal, o cierra la anterior antes de ejecutar npm run dev).\n`);
            process.exit(0);
        } else {
            console.error('🔥 Error en el servidor HTTP:', err);
        }
    });

    return server;
}

if (require.main === module) {
    startServer();
}

module.exports = {
    app,
    startServer,
    generarCurp,
    extractJsonFromLlmReply,
    resolveSedeId,
    authMiddleware,
    authorizeRoles,
    normalizeRole,
    encryptSecret,
    decryptSecret,
    hashPassword,
    verifyPassword,
    setProviderCooldown,
    isProviderInCooldown,
    getProviderCooldownRemaining,
    verifyMetaWebhookSignature,
    runMemoryCleanup,
    closePool: () => dbPool.end()
};
