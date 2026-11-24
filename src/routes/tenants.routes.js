const express = require('express');
const fs = require('fs');
const axios = require('axios');
const { config, ENV_PATH } = require('../config/env');
const { UNID_CAMPUSES } = require('../config/campuses');
const { getPool } = require('../db/pool');
const { emailNotificationHistory } = require('../state/memory');
const { encryptSecret, decryptSecret, maskSecret } = require('../utils/crypto');
const { generarCurp } = require('../utils/curp');
const { authMiddleware, authorizeRoles } = require('../middlewares/auth');
const { dispararNotificacionCorreo } = require('../services/mail.service');
const { recordAuditEvent } = require('../services/audit.service');

const router = express.Router();

router.get('/api/settings/smtp', authMiddleware, authorizeRoles('desarrollador', 'administrador'), (_req, res) => {
    const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
    const smtpPort = process.env.SMTP_PORT || '587';
    const smtpUser = process.env.SMTP_USER || config.TESTING_NOTIFICATION_EMAIL;
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
            targetEmail: config.TESTING_NOTIFICATION_EMAIL,
            mode: isLiveConfigured ? 'smtp_live' : 'ethereal_test'
        }
    });
});

router.post('/api/settings/smtp', authMiddleware, authorizeRoles('desarrollador', 'administrador'), async (req, res) => {
    try {
        const { host, port, user, pass } = req.body;
        const cleanHost = (host || 'smtp.gmail.com').trim();
        const cleanPort = String(port || '587').trim();
        const cleanUser = (user || config.TESTING_NOTIFICATION_EMAIL).trim();
        const cleanPass = pass ? String(pass).replace(/\s+/g, '').trim() : (process.env.SMTP_PASS || '');
        if (!cleanUser || !cleanPass) {
            return res.status(400).json({ success: false, error: 'El correo remitente y la Contraseña de Aplicación son obligatorios.' });
        }

        process.env.SMTP_HOST = cleanHost;
        process.env.SMTP_PORT = cleanPort;
        process.env.SMTP_USER = cleanUser;
        process.env.SMTP_PASS = cleanPass;
        process.env.ADMISSIONS_NOTIFICATION_EMAIL = config.TESTING_NOTIFICATION_EMAIL;

        let envContent = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf-8') : '';
        const upsertEnvVar = (key, val) => {
            const regex = new RegExp(`^${key}=.*$`, 'm');
            if (regex.test(envContent)) envContent = envContent.replace(regex, `${key}=${val}`);
            else envContent += `${envContent.endsWith('\n') || envContent === '' ? '' : '\n'}${key}=${val}\n`;
        };
        upsertEnvVar('SMTP_HOST', cleanHost);
        upsertEnvVar('SMTP_PORT', cleanPort);
        upsertEnvVar('SMTP_USER', cleanUser);
        upsertEnvVar('SMTP_PASS', cleanPass);
        upsertEnvVar('ADMISSIONS_NOTIFICATION_EMAIL', config.TESTING_NOTIFICATION_EMAIL);
        fs.writeFileSync(ENV_PATH, envContent, 'utf-8');

        await recordAuditEvent({
            req,
            categoria: 'API_KEYS',
            accion: 'SMTP_UPDATE',
            severidad: 'critical',
            objetivoTipo: 'smtp_config',
            objetivoId: cleanUser,
            resumen: `Credenciales SMTP actualizadas (${cleanHost}:${cleanPort} • ${cleanUser})`,
            detalle: { host: cleanHost, port: cleanPort, user: cleanUser, passwordRotated: Boolean(pass && String(pass).trim()) }
        });

        res.json({ success: true, message: `Configuración SMTP guardada para ${cleanUser}.`, mode: 'smtp_live' });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Error guardando configuración SMTP: ' + err.message });
    }
});

router.get('/api/notifications/history', authMiddleware, authorizeRoles('desarrollador', 'administrador'), (_req, res) => {
    const smtpPass = process.env.SMTP_PASS || '';
    const isLive = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && smtpPass && !smtpPass.includes('tu_app_password') && smtpPass.trim().length >= 8);
    res.json({ success: true, targetEmail: config.TESTING_NOTIFICATION_EMAIL, smtpMode: isLive ? 'smtp_live' : 'ethereal_test', history: emailNotificationHistory });
});

router.post('/api/notifications/test', authMiddleware, authorizeRoles('desarrollador', 'administrador'), async (req, res) => {
    try {
        const evento = req.body.evento || req.body.eventoTipo;
        let resultLog = null;
        if (evento === 'NUEVO_CONTACTO') {
            resultLog = await dispararNotificacionCorreo('NUEVO_CONTACTO', { telefono_celular: '+529811589900', mensaje_inicial: 'Prueba de contacto UNID', sede_id: 'campeche', insertId: 901 });
        } else if (evento === 'DATOS_COMPLETOS') {
            const sampleJson = { completado: true, nombre_completo: 'Luis Fernando Quintero Morales', fecha_nacimiento: '2001-09-15', sexo: 'Masculino', estado_nacimiento: 'Campeche', telefono_celular: '9811589900', correo_electronico: config.TESTING_NOTIFICATION_EMAIL, bachillerato_procedencia: 'COBACAM Plantel 01', carrera_interes: 'Ingeniería en Software y Sistemas Computacionales', direccion: 'Av. Central #104', codigo_postal: '24040', campus_interes: 'San Francisco de Campeche', modalidad_estudios: 'Presencial', es_foraneo: false, nivel_interes: 'Alto' };
            sampleJson.curp = generarCurp(sampleJson);
            resultLog = await dispararNotificacionCorreo('DATOS_COMPLETOS', { datos: sampleJson, insertId: 902 });
        } else {
            resultLog = await dispararNotificacionCorreo('CIERRE_INSCRITO', {
                lead: { id: 903, nombre_completo: 'Carlos Alpuche Canul', curp: 'AUCC040515HCCLRN08', carrera_interes: 'Licenciatura en Derecho', telefono_celular: '9811234567', correo_electronico: 'carlos.alpuche@gmail.com', campus_interes: 'San Francisco de Campeche', modalidad_estudios: 'Presencial' },
                asesor: req.user?.displayName || 'Asesor de Admisiones UNID'
            });
        }
        res.json({ success: true, log: resultLog, result: resultLog, targetEmail: config.TESTING_NOTIFICATION_EMAIL });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/api/tenants', authMiddleware, authorizeRoles('desarrollador', 'administrador'), async (req, res) => {
    try {
        let sedes = [];
        try {
            const [rows] = await getPool().query('SELECT * FROM sedes ORDER BY nombre ASC');
            sedes = rows;
        } catch (_) {}

        if (sedes.length === 0) {
            sedes = UNID_CAMPUSES.map(c => ({
                id: c.id, slug: c.id, nombre: c.name, estado: c.estado, region: c.region,
                whatsapp_phone_number_id: c.id === 'campeche' ? config.WHATSAPP_PHONE_NUMBER_ID : null,
                hasWhatsAppToken: Boolean(c.id === 'campeche' && config.WHATSAPP_TOKEN),
                maskedWhatsAppToken: c.id === 'campeche' && config.WHATSAPP_TOKEN ? maskSecret(config.WHATSAPP_TOKEN) : '',
                email_notificaciones: c.id === 'campeche' ? (process.env.ADMISSIONS_NOTIFICATION_EMAIL || 'admisiones.campeche@unid.mx') : '',
                custom_prompt: '', hasGeminiKey: Boolean(process.env.GEMINI_API_KEY), hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY), activa: 1
            }));
        } else {
            sedes = sedes.map(s => {
                const plainWa = decryptSecret(s.whatsapp_token_encrypted);
                return {
                    id: s.id, slug: s.slug, nombre: s.nombre, estado: s.estado, region: s.region,
                    whatsapp_phone_number_id: s.whatsapp_phone_number_id,
                    hasWhatsAppToken: Boolean(plainWa || (s.slug === 'campeche' && config.WHATSAPP_TOKEN)),
                    maskedWhatsAppToken: maskSecret(plainWa || (s.slug === 'campeche' ? config.WHATSAPP_TOKEN : '')),
                    meta_verify_token: s.meta_verify_token || config.VERIFY_TOKEN,
                    email_notificaciones: s.email_notificaciones || (s.slug === 'campeche' ? process.env.ADMISSIONS_NOTIFICATION_EMAIL : ''),
                    custom_prompt: s.custom_prompt || '',
                    hasGeminiKey: Boolean(s.gemini_key_encrypted || process.env.GEMINI_API_KEY),
                    hasOpenAiKey: Boolean(s.openai_key_encrypted || process.env.OPENAI_API_KEY),
                    activa: Boolean(s.activa)
                };
            });
        }

        if (req.user.rol !== 'desarrollador' && req.user.sede_id) {
            sedes = sedes.filter(s => s.slug === req.user.sede_id);
        }
        res.json({ success: true, count: sedes.length, tenants: sedes });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/api/tenants/:slug', authMiddleware, authorizeRoles('desarrollador', 'administrador'), async (req, res) => {
    try {
        const { slug } = req.params;
        if (req.user.rol !== 'desarrollador' && req.user.sede_id && slug !== req.user.sede_id) {
            return res.status(403).json({ success: false, error: 'Solo puedes consultar la configuración de tu propia sede asignada.' });
        }
        const [rows] = await getPool().query('SELECT * FROM sedes WHERE slug = ? OR id = ?', [slug, slug]);
        if (rows.length === 0) {
            const foundBase = UNID_CAMPUSES.find(c => c.id === slug);
            if (!foundBase) return res.status(404).json({ success: false, error: 'Sede no encontrada.' });
            return res.json({
                success: true,
                tenant: {
                    slug: foundBase.id, nombre: foundBase.name, estado: foundBase.estado, region: foundBase.region,
                    whatsapp_phone_number_id: foundBase.id === 'campeche' ? config.WHATSAPP_PHONE_NUMBER_ID : '',
                    hasWhatsAppToken: Boolean(foundBase.id === 'campeche' && config.WHATSAPP_TOKEN),
                    maskedWhatsAppToken: foundBase.id === 'campeche' && config.WHATSAPP_TOKEN ? maskSecret(config.WHATSAPP_TOKEN) : '',
                    meta_verify_token: config.VERIFY_TOKEN,
                    email_notificaciones: foundBase.id === 'campeche' ? process.env.ADMISSIONS_NOTIFICATION_EMAIL : '',
                    custom_prompt: '', activa: true
                }
            });
        }
        const s = rows[0];
        const plainWa = decryptSecret(s.whatsapp_token_encrypted);
        res.json({
            success: true,
            tenant: {
                id: s.id, slug: s.slug, nombre: s.nombre, estado: s.estado, region: s.region,
                whatsapp_phone_number_id: s.whatsapp_phone_number_id || '',
                hasWhatsAppToken: Boolean(plainWa), maskedWhatsAppToken: maskSecret(plainWa || ''),
                meta_verify_token: s.meta_verify_token || config.VERIFY_TOKEN,
                email_notificaciones: s.email_notificaciones || '', custom_prompt: s.custom_prompt || '',
                hasGeminiKey: Boolean(s.gemini_key_encrypted), hasOpenAiKey: Boolean(s.openai_key_encrypted), activa: Boolean(s.activa)
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

async function handleSaveTenantConfig(req, res) {
    try {
        const { slug } = req.params;
        if (req.user.rol !== 'desarrollador' && req.user.sede_id && slug !== req.user.sede_id) {
            return res.status(403).json({ success: false, error: 'Solo puedes modificar la configuración de tu propia sede asignada.' });
        }
        const { whatsapp_phone_number_id, whatsapp_token, meta_verify_token, email_notificaciones, custom_prompt, gemini_key, openai_key, activa } = req.body;
        const [existing] = await getPool().query('SELECT * FROM sedes WHERE slug = ?', [slug]);
        const encryptedWaToken = (whatsapp_token && !whatsapp_token.includes('••••')) ? encryptSecret(whatsapp_token) : (existing[0]?.whatsapp_token_encrypted || null);
        const encryptedGeminiKey = (gemini_key && !gemini_key.includes('••••')) ? encryptSecret(gemini_key) : (existing[0]?.gemini_key_encrypted || null);
        const encryptedOpenAiKey = (openai_key && !openai_key.includes('••••')) ? encryptSecret(openai_key) : (existing[0]?.openai_key_encrypted || null);

        if (existing.length > 0) {
            await getPool().execute(`
                UPDATE sedes SET whatsapp_phone_number_id = ?, whatsapp_token_encrypted = ?, meta_verify_token = ?, email_notificaciones = ?, custom_prompt = ?, gemini_key_encrypted = ?, openai_key_encrypted = ?, activa = ? WHERE slug = ?
            `, [whatsapp_phone_number_id || null, encryptedWaToken, meta_verify_token || config.VERIFY_TOKEN, email_notificaciones || null, custom_prompt || null, encryptedGeminiKey, encryptedOpenAiKey, activa !== undefined ? (activa ? 1 : 0) : 1, slug]);
        } else {
            const foundBase = UNID_CAMPUSES.find(c => c.id === slug) || { name: slug, estado: 'México', region: 'Nacional' };
            await getPool().execute(`
                INSERT INTO sedes (slug, nombre, estado, region, whatsapp_phone_number_id, whatsapp_token_encrypted, meta_verify_token, email_notificaciones, custom_prompt, gemini_key_encrypted, openai_key_encrypted, activa)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [slug, foundBase.name, foundBase.estado, foundBase.region, whatsapp_phone_number_id || null, encryptedWaToken, meta_verify_token || config.VERIFY_TOKEN, email_notificaciones || null, custom_prompt || null, encryptedGeminiKey, encryptedOpenAiKey, activa !== undefined ? (activa ? 1 : 0) : 1]);
        }
        const rotatedSecrets = [];
        if (whatsapp_token && !whatsapp_token.includes('••••')) rotatedSecrets.push('WHATSAPP_TOKEN');
        if (gemini_key && !gemini_key.includes('••••')) rotatedSecrets.push('GEMINI_API_KEY');
        if (openai_key && !openai_key.includes('••••')) rotatedSecrets.push('OPENAI_API_KEY');

        await recordAuditEvent({
            req,
            categoria: rotatedSecrets.length > 0 ? 'API_KEYS' : 'SEDES',
            accion: 'TENANT_KEYS_UPDATE',
            severidad: rotatedSecrets.length > 0 ? 'critical' : 'warning',
            sedeId: slug,
            objetivoTipo: 'sede',
            objetivoId: slug,
            resumen: `Configuración multi-sede guardada para "${slug}"${rotatedSecrets.length ? ` (llaves rotadas: ${rotatedSecrets.join(', ')})` : ''}`,
            detalle: { slug, phoneIdUpdated: Boolean(whatsapp_phone_number_id), rotatedSecrets, activa: activa !== undefined ? Boolean(activa) : true }
        });

        res.json({ success: true, message: `Configuración para ${slug} guardada y cifrada exitosamente.` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

router.post('/api/tenants/:slug', authMiddleware, authorizeRoles('desarrollador', 'administrador'), handleSaveTenantConfig);
router.put('/api/tenants/:slug', authMiddleware, authorizeRoles('desarrollador', 'administrador'), handleSaveTenantConfig);

async function handleTestTenantWhatsApp(req, res) {
    try {
        const { slug } = req.params;
        if (req.user.rol !== 'desarrollador' && req.user.sede_id && slug !== req.user.sede_id) {
            return res.status(403).json({ success: false, error: 'Solo puedes probar la conexión de tu propia sede asignada.' });
        }
        const { testPhone } = req.body || {};
        const [rows] = await getPool().query('SELECT * FROM sedes WHERE slug = ?', [slug]);
        let tokenToTest = config.WHATSAPP_TOKEN;
        let phoneIdToTest = config.WHATSAPP_PHONE_NUMBER_ID;
        if (rows.length > 0) {
            if (rows[0].whatsapp_token_encrypted) tokenToTest = decryptSecret(rows[0].whatsapp_token_encrypted);
            if (rows[0].whatsapp_phone_number_id) phoneIdToTest = rows[0].whatsapp_phone_number_id;
        }
        if (!tokenToTest || !phoneIdToTest) {
            return res.status(400).json({ success: false, error: 'La sede no cuenta con WhatsApp Token o Phone Number ID configurado.' });
        }
        const metaRes = await axios.get(`https://graph.facebook.com/v20.0/${phoneIdToTest}`, { headers: { Authorization: `Bearer ${tokenToTest}` } });
        if (testPhone) {
            await axios.post(`https://graph.facebook.com/v20.0/${phoneIdToTest}/messages`, {
                messaging_product: 'whatsapp', recipient_type: 'individual', to: testPhone, type: 'text',
                text: { body: `🐺 ¡Hola! Mensaje de prueba exitoso desde Metal-Uriel para sede ${slug.toUpperCase()}.` }
            }, { headers: { Authorization: `Bearer ${tokenToTest}`, 'Content-Type': 'application/json' } });
        }
        res.json({
            success: true,
            message: `✅ Conexión exitosa con Meta WhatsApp Business API para Phone ID ${phoneIdToTest}.`,
            phoneInfo: { id: metaRes.data.id, display_phone_number: metaRes.data.display_phone_number || metaRes.data.verified_name || 'Configurado', quality_rating: metaRes.data.quality_rating || 'GREEN' }
        });
    } catch (err) {
        res.status(400).json({ success: false, error: `Error conectando con Meta: ${err.response?.data?.error?.message || err.message}` });
    }
}

router.post('/api/tenants/:slug/test-whatsapp', authMiddleware, authorizeRoles('desarrollador', 'administrador'), handleTestTenantWhatsApp);
router.post('/api/tenants/:slug/test-connection', authMiddleware, authorizeRoles('desarrollador', 'administrador'), handleTestTenantWhatsApp);

module.exports = router;
