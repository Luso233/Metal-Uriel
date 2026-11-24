const express = require('express');
const fs = require('fs');
const mysql = require('mysql2/promise');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { GoogleGenAI } = require('@google/genai');
const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const { config, ENV_PATH, isValidApiKey, isOllamaConfigured, isProductionHardened } = require('../config/env');
const { getPool, setDatabaseReady } = require('../db/pool');
const { initializeDatabase, reloadRuntimeConfig } = require('../db/init');
const { maskSecret } = require('../utils/crypto');
const { normalizeRole, getRoleTitle, authMiddleware, authorizeRoles } = require('../middlewares/auth');
const { enviarAlertaSistema } = require('../services/mail.service');
const setupUtils = require('../../lib/setup-utils');

const router = express.Router();

async function computeSetupStatus() {
    const hasEnvFile = fs.existsSync(ENV_PATH);
    let dbConnected = false;
    let dbError = null;
    try {
        const conn = await getPool().getConnection();
        await conn.query('SELECT 1');
        conn.release();
        dbConnected = true;
        setDatabaseReady(true);
    } catch (e) {
        dbError = e.message;
        setDatabaseReady(false);
    }

    const hasCloudAi = isValidApiKey(process.env.GEMINI_API_KEY) || isValidApiKey(process.env.ANTHROPIC_API_KEY) || isValidApiKey(process.env.OPENAI_API_KEY) || isValidApiKey(process.env.DEEPSEEK_API_KEY) || isValidApiKey(process.env.GROQ_API_KEY);
    const hasOllama = isOllamaConfigured();
    const hasAnyAi = hasCloudAi || hasOllama;
    const hasWhatsApp = Boolean(config.WHATSAPP_PHONE_NUMBER_ID && config.WHATSAPP_TOKEN && !setupUtils.isPlaceholderValue(config.WHATSAPP_PHONE_NUMBER_ID) && !setupUtils.isPlaceholderValue(config.WHATSAPP_TOKEN));
    const hasSmtp = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && !setupUtils.isPlaceholderValue(process.env.SMTP_PASS));

    const reasons = [];
    if (!hasEnvFile) reasons.push('No existe el archivo .env en el servidor.');
    if (String(process.env.SETUP_COMPLETED || '').toLowerCase() === 'false') reasons.push('Instalación virgen detectada (SETUP_COMPLETED=false).');
    if (!dbConnected) reasons.push(`Sin conexión a MariaDB (${dbError || 'verifica credenciales'}).`);
    if (!hasAnyAi) reasons.push('No hay ningún motor de Inteligencia Artificial configurado.');

    const explicitVirgin = String(process.env.SETUP_COMPLETED || '').toLowerCase() === 'false';
    const explicitDone = String(process.env.SETUP_COMPLETED || '').toLowerCase() === 'true';
    const needsSetup = !hasEnvFile || explicitVirgin || (!explicitDone && (!dbConnected || !hasAnyAi));

    return {
        needsSetup, reasons, hasEnvFile, setupCompleted: explicitDone, dbConnected, dbError,
        hasAnyAi, hasCloudAi, ollamaEnabled: hasOllama, ollamaModel: process.env.OLLAMA_MODEL || 'qwen2.5:3b',
        hasWhatsApp, hasSmtp, primaryCampus: process.env.PRIMARY_CAMPUS || 'campeche',
        port: config.PORT, isDemoMode: !isProductionHardened(), hardware: setupUtils.getSystemHardwareReport(config.PORT)
    };
}

async function setupAccessGuard(req, res, next) {
    const status = await computeSetupStatus();
    req.setupStatus = status;
    if (status.needsSetup) return next();
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(403).json({ error: 'Metal-Uriel ya está configurado. Inicia sesión como Desarrollador para modificar parámetros del servidor.' });
    }
    try {
        const decoded = jwt.verify(authHeader.split(' ')[1], config.JWT_SECRET);
        if (normalizeRole(decoded.rol || decoded.role) !== 'desarrollador') {
            return res.status(403).json({ error: 'Solo el rol Desarrollador puede reconfigurar el servidor.' });
        }
        req.user = decoded;
        return next();
    } catch (_) {
        return res.status(401).json({ error: 'Token inválido o expirado para reconfiguración.' });
    }
}

router.get('/api/setup/status', async (_req, res) => {
    try { res.json(await computeSetupStatus()); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/setup/current-config', setupAccessGuard, (_req, res) => {
    const safeVal = (v, def = '') => (!v || setupUtils.isPlaceholderValue(v)) ? def : v;
    res.json({
        PORT: String(config.PORT),
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
        hasWhatsAppToken: Boolean(config.WHATSAPP_TOKEN && !setupUtils.isPlaceholderValue(config.WHATSAPP_TOKEN)),
        maskedWhatsAppToken: (config.WHATSAPP_TOKEN && !setupUtils.isPlaceholderValue(config.WHATSAPP_TOKEN)) ? maskSecret(config.WHATSAPP_TOKEN) : '',
        META_VERIFY_TOKEN: safeVal(process.env.META_VERIFY_TOKEN, ''),
        hasMetaAppSecret: Boolean(config.META_APP_SECRET && !setupUtils.isPlaceholderValue(config.META_APP_SECRET)),
        maskedMetaAppSecret: (config.META_APP_SECRET && !setupUtils.isPlaceholderValue(config.META_APP_SECRET)) ? maskSecret(config.META_APP_SECRET) : '',
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

router.get('/api/setup/generate-secrets', setupAccessGuard, (_req, res) => {
    res.json({
        JWT_SECRET: setupUtils.generateStrongHex(32),
        ENCRYPTION_MASTER_KEY: setupUtils.generateStrongHex(32),
        META_VERIFY_TOKEN: 'unid_meta_' + setupUtils.generateStrongHex(12),
        RANDOM_PASSWORD: setupUtils.generateStrongPassword(20)
    });
});

router.post('/api/setup/validate', setupAccessGuard, (req, res) => {
    const result = setupUtils.validateSetupPayload(req.body || {});
    res.status(result.valid ? 200 : 400).json(result);
});

router.post('/api/setup/test-db', setupAccessGuard, async (req, res) => {
    const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = req.body || {};
    const err = setupUtils.validateField('DB_HOST', DB_HOST, { forceRequired: true }) || setupUtils.validateField('DB_PORT', DB_PORT, { forceRequired: true }) || setupUtils.validateField('DB_USER', DB_USER, { forceRequired: true }) || setupUtils.validateField('DB_NAME', DB_NAME, { forceRequired: true });
    if (err) return res.status(400).json({ ok: false, error: err });
    const effectivePassword = (DB_PASSWORD === '__KEEP_EXISTING__' && !req.setupStatus?.needsSetup) ? (process.env.DB_PASSWORD || '') : (DB_PASSWORD || '');
    let conn = null;
    try {
        const t0 = Date.now();
        conn = await mysql.createConnection({ host: String(DB_HOST).trim(), port: Number(DB_PORT) || 3306, user: String(DB_USER).trim(), password: effectivePassword, connectTimeout: 7000 });
        const [verRows] = await conn.query('SELECT VERSION() AS version');
        const [dbs] = await conn.query('SHOW DATABASES LIKE ?', [String(DB_NAME).trim()]);
        await conn.end();
        res.json({ ok: true, latencyMs: Date.now() - t0, version: verRows[0]?.version || 'MariaDB/MySQL', databaseExists: dbs.length > 0, message: `Conexión exitosa (${verRows[0]?.version}).` });
    } catch (e) {
        if (conn) { try { await conn.end(); } catch (_) {} }
        res.status(400).json({ ok: false, error: `No se pudo conectar a MariaDB: ${e.message}` });
    }
});

router.post('/api/setup/test-ai', setupAccessGuard, async (req, res) => {
    const { provider, apiKey, ollamaUrl, ollamaModel, ollamaApiKey } = req.body || {};
    try {
        if (provider === 'ollama') {
            const urlErr = setupUtils.validateField('OLLAMA_BASE_URL', ollamaUrl, { forceRequired: true });
            if (urlErr) return res.status(400).json({ ok: false, error: urlErr });
            const cleanUrl = String(ollamaUrl).trim().replace(/\/+$/, '');
            const headers = ollamaApiKey && String(ollamaApiKey).trim() ? { Authorization: `Bearer ${String(ollamaApiKey).trim()}` } : {};
            const t0 = Date.now();
            const r = await axios.get(`${cleanUrl}/api/tags`, { headers, timeout: 6000 });
            const models = (r.data?.models || []).map(m => m.name);
            const target = String(ollamaModel || '').trim();
            return res.json({ ok: true, latencyMs: Date.now() - t0, installedModels: models, modelFound: !target || models.some(m => m === target || m.startsWith(target + ':')), message: `Ollama responde (${models.length} modelos).` });
        }
        const keyFieldMap = { google: 'GEMINI_API_KEY', anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', deepseek: 'DEEPSEEK_API_KEY', groq: 'GROQ_API_KEY' };
        const fieldName = keyFieldMap[provider];
        if (!fieldName) return res.status(400).json({ ok: false, error: 'Proveedor de IA no reconocido.' });
        const effectiveKey = (apiKey === '__KEEP_EXISTING__' && !req.setupStatus?.needsSetup) ? (process.env[fieldName] || '') : String(apiKey || '').trim();
        const keyErr = setupUtils.validateField(fieldName, effectiveKey, { forceRequired: true });
        if (keyErr) return res.status(400).json({ ok: false, error: keyErr });

        const t0 = Date.now();
        if (provider === 'google') {
            const client = new GoogleGenAI({ apiKey: effectiveKey });
            const resp = await client.models.generateContent({ model: 'gemini-3.8-flash', contents: 'Responde solo OK' });
            if (!resp.text) throw new Error('Sin texto devuelto por Gemini.');
        } else if (provider === 'openai') {
            await new OpenAI({ apiKey: effectiveKey }).models.list();
        } else if (provider === 'deepseek') {
            await new OpenAI({ apiKey: effectiveKey, baseURL: 'https://api.deepseek.com' }).models.list();
        } else if (provider === 'groq') {
            await new OpenAI({ apiKey: effectiveKey, baseURL: 'https://api.groq.com/openai/v1' }).models.list();
        } else if (provider === 'anthropic') {
            await new Anthropic({ apiKey: effectiveKey }).messages.create({ model: 'claude-3-5-haiku-20241022', max_tokens: 8, messages: [{ role: 'user', content: 'OK' }] });
        }
        return res.json({ ok: true, latencyMs: Date.now() - t0, message: `${provider} verificado (${Date.now() - t0} ms).` });
    } catch (err) {
        res.status(400).json({ ok: false, error: `Falló verificación de ${provider}: ${err.response?.data?.error?.message || err.message}` });
    }
});

router.post('/api/setup/test-whatsapp', setupAccessGuard, async (req, res) => {
    const { WHATSAPP_PHONE_NUMBER_ID: phoneIdRaw, WHATSAPP_TOKEN: tokenRaw } = req.body || {};
    const phoneId = String(phoneIdRaw || '').trim();
    const token = (tokenRaw === '__KEEP_EXISTING__' && !req.setupStatus?.needsSetup) ? config.WHATSAPP_TOKEN : String(tokenRaw || '').trim();
    const err = setupUtils.validateField('WHATSAPP_PHONE_NUMBER_ID', phoneId, { forceRequired: true }) || setupUtils.validateField('WHATSAPP_TOKEN', token, { forceRequired: true });
    if (err) return res.status(400).json({ ok: false, error: err });
    try {
        const r = await axios.get(`https://graph.facebook.com/v20.0/${phoneId}?fields=display_phone_number,verified_name,quality_rating`, { headers: { Authorization: `Bearer ${token}` }, timeout: 8000 });
        res.json({ ok: true, displayPhone: r.data?.display_phone_number || phoneId, verifiedName: r.data?.verified_name || 'WhatsApp Business', qualityRating: r.data?.quality_rating || 'GREEN', message: `Conectado a "${r.data?.verified_name || 'Meta Business'}".` });
    } catch (e) {
        res.status(400).json({ ok: false, error: `Meta Graph API rechazó las credenciales: ${e.response?.data?.error?.message || e.message}` });
    }
});

router.post('/api/setup/test-smtp', setupAccessGuard, async (req, res) => {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, testDestination } = req.body || {};
    const effectivePass = (SMTP_PASS === '__KEEP_EXISTING__' && !req.setupStatus?.needsSetup) ? (process.env.SMTP_PASS || '') : String(SMTP_PASS || '').trim();
    const err = setupUtils.validateField('SMTP_HOST', SMTP_HOST, { forceRequired: true }) || setupUtils.validateField('SMTP_PORT', SMTP_PORT, { forceRequired: true }) || setupUtils.validateField('SMTP_USER', SMTP_USER, { forceRequired: true }) || setupUtils.validateField('SMTP_PASS', effectivePass, { forceRequired: true });
    if (err) return res.status(400).json({ ok: false, error: err });
    try {
        const portNum = Number(SMTP_PORT) || 587;
        const transporter = nodemailer.createTransport({ host: String(SMTP_HOST).trim(), port: portNum, secure: portNum === 465, auth: { user: String(SMTP_USER).trim(), pass: effectivePass }, connectionTimeout: 8000 });
        await transporter.verify();
        const dest = String(testDestination || SMTP_USER).trim();
        await transporter.sendMail({ from: `"UNID Admisiones • Metal-Uriel" <${String(SMTP_USER).trim()}>`, to: dest, subject: '✅ Prueba exitosa de Alertas y Correo — Metal-Uriel', html: '<p>SMTP verificado desde el Asistente Plug & Play.</p>' });
        res.json({ ok: true, message: `SMTP verificado y correo de prueba enviado a ${dest}.` });
    } catch (e) {
        res.status(400).json({ ok: false, error: `Error SMTP: ${e.message}` });
    }
});

router.post('/api/setup/complete', setupAccessGuard, async (req, res) => {
    try {
        const isReconfigure = !req.setupStatus?.needsSetup;
        const raw = { ...(req.body || {}), IS_RECONFIGURE: isReconfigure };
        if (isReconfigure) {
            for (const k of ['DB_PASSWORD', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'GROQ_API_KEY', 'WHATSAPP_TOKEN', 'META_APP_SECRET', 'OLLAMA_API_KEY', 'JWT_SECRET', 'ENCRYPTION_MASTER_KEY', 'SMTP_PASS']) {
                if (raw[k] === '__KEEP_EXISTING__' || (!raw[k] && (k === 'JWT_SECRET' || k === 'ENCRYPTION_MASTER_KEY'))) raw[k] = process.env[k] || '';
            }
        }
        const validation = setupUtils.validateSetupPayload(raw);
        if (!validation.valid) return res.status(400).json({ ok: false, error: 'Hay errores de validación.', errors: validation.errors });

        let testConn = null;
        try {
            testConn = await mysql.createConnection({ host: String(raw.DB_HOST).trim(), port: Number(raw.DB_PORT) || 3306, user: String(raw.DB_USER).trim(), password: raw.DB_PASSWORD || '', connectTimeout: 8000 });
            await testConn.end();
        } catch (dbErr) {
            if (testConn) { try { await testConn.end(); } catch (_) {} }
            return res.status(400).json({ ok: false, error: `Error MariaDB: ${dbErr.message}`, errors: { DB_HOST: dbErr.message } });
        }

        const envContent = setupUtils.buildEnvFileContent({ ...raw, WHATSAPP_PHONE_NUMBER_ID: raw.SKIP_WHATSAPP ? '' : raw.WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TOKEN: raw.SKIP_WHATSAPP ? '' : raw.WHATSAPP_TOKEN });
        fs.writeFileSync(ENV_PATH, envContent, { encoding: 'utf8', mode: 0o600 });
        reloadRuntimeConfig();

        const primaryCampus = raw.PRIMARY_CAMPUS || 'campeche';
        const customDevUser = (!isReconfigure || (raw.DEV_EMAIL && raw.DEV_PASSWORD)) ? { correo_institucional: String(raw.DEV_EMAIL || req.user?.correo_institucional || '').trim().toLowerCase(), nombre_completo: String(raw.DEV_NAME || req.user?.displayName || 'Desarrollador Metal-Uriel').trim(), matricula: String(raw.DEV_EMAIL || '').split('@')[0], password: raw.DEV_PASSWORD || '' } : null;
        const customAdminUser = (raw.ADMIN_SEDE_EMAIL && raw.ADMIN_SEDE_PASSWORD) ? { correo_institucional: String(raw.ADMIN_SEDE_EMAIL).trim().toLowerCase(), nombre_completo: String(raw.ADMIN_SEDE_NAME || 'Jefatura de Admisiones UNID').trim(), matricula: String(raw.ADMIN_SEDE_EMAIL).split('@')[0], password: raw.ADMIN_SEDE_PASSWORD } : null;

        await initializeDatabase({ rebuildPool: true, throwOnError: true, primaryCampus, syncPrimaryCampusCreds: true, customDevUser, customAdminUser });

        let sessionToken = null;
        let sessionUser = null;
        const devEmail = customDevUser?.correo_institucional || req.user?.correo_institucional;
        if (devEmail) {
            const [uRows] = await getPool().query('SELECT * FROM usuarios WHERE correo_institucional = ? LIMIT 1', [devEmail]);
            if (uRows.length > 0) {
                const dbU = uRows[0];
                sessionUser = { id: dbU.id, correo_institucional: dbU.correo_institucional, username: dbU.correo_institucional, displayName: dbU.nombre_completo, matricula: dbU.matricula || dbU.correo_institucional.split('@')[0], rol: 'desarrollador', role: 'desarrollador', roleTitle: getRoleTitle('desarrollador'), sede_id: null, tenant: 'Global (Todas las Sedes UNID)', isInstitutional: true };
                sessionToken = jwt.sign(sessionUser, config.JWT_SECRET, { expiresIn: '7d' });
            }
        }
        res.json({ ok: true, message: 'Metal-Uriel configurado e inicializado en caliente.', token: sessionToken, user: sessionUser, status: await computeSetupStatus() });
    } catch (err) {
        res.status(500).json({ ok: false, error: `Error aplicando configuración: ${err.message}` });
    }
});

router.post('/api/system/test-alert', authMiddleware, authorizeRoles('desarrollador'), async (req, res) => {
    try {
        const result = await enviarAlertaSistema('MANUAL_TEST', 'Prueba Manual de Monitoreo Life Support', `Disparada por ${req.user.displayName} (${req.user.correo_institucional}).`, true);
        if (!result) return res.status(400).json({ error: 'Configura ALERT_ADMIN_EMAIL o ADMISSIONS_NOTIFICATION_EMAIL en .env primero.' });
        res.json({ ok: true, log: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = {
    router,
    computeSetupStatus
};
