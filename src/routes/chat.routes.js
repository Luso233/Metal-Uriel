const express = require('express');
const { UNID_CAMPUSES, PROMPT_PRESETS } = require('../config/campuses');
const { config, isValidApiKey, isOllamaConfigured, getActivePrompt, setActivePrompt } = require('../config/env');
const { getPool } = require('../db/pool');
const {
    conversationMemory,
    userSessionState,
    processedMessageIds,
    providerCooldowns,
    isProviderInCooldown,
    getProviderCooldownRemaining,
    getLastMemoryCleanupStats
} = require('../state/memory');
const { resolveSedeId, extractPartialFieldsFromHistory } = require('../utils/curp');
const { authMiddleware, authorizeRoles, chatLimiter } = require('../middlewares/auth');
const { ALL_SUPPORTED_MODELS, getActiveModelId, setActiveModelId } = require('../services/llm.service');
const { getActiveCicloEscolar, getActivePoolItems, getBrochures, buildAttachmentObject } = require('../services/pool.service');
const { processChatMessage, guardarMensajeHistorialBD } = require('../services/admissions.service');
const { sendWhatsAppMessage } = require('../services/whatsapp.service');
const setupUtils = require('../../lib/setup-utils');

const router = express.Router();

router.get('/api/campuses', (_req, res) => {
    res.json({ success: true, count: UNID_CAMPUSES.length, campuses: UNID_CAMPUSES });
});

router.post('/api/chat', authMiddleware, chatLimiter, async (req, res) => {
    try {
        const { phone, message, model } = req.body;
        if (!message) return res.status(400).json({ error: 'El mensaje no puede estar vacío.' });
        const senderPhone = phone || '+529811234567';
        const sedeId = (req.user.rol !== 'desarrollador' && req.user.sede_id) ? req.user.sede_id : 'campeche';
        const result = await processChatMessage(senderPhone, message, model, sedeId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/api/models', authMiddleware, (_req, res) => {
    const providerChecks = {
        google: () => isValidApiKey(process.env.GEMINI_API_KEY),
        anthropic: () => isValidApiKey(process.env.ANTHROPIC_API_KEY),
        openai: () => isValidApiKey(process.env.OPENAI_API_KEY),
        deepseek: () => isValidApiKey(process.env.DEEPSEEK_API_KEY),
        groq: () => isValidApiKey(process.env.GROQ_API_KEY),
        ollama: () => isOllamaConfigured()
    };

    const configuredModels = ALL_SUPPORTED_MODELS.map(m => {
        const isReady = m.id === 'auto-fallback' ? true : Boolean(providerChecks[m.provider]?.());
        return {
            ...m,
            isConfigured: isReady,
            inCooldown: m.provider !== 'auto' && isProviderInCooldown(m.provider),
            cooldownSec: m.provider !== 'auto' ? getProviderCooldownRemaining(m.provider) : 0
        };
    }).filter(m => m.isConfigured);

    res.json({
        activeModel: getActiveModelId(),
        models: configuredModels,
        allProvidersStatus: {
            google: { configured: providerChecks.google(), inCooldown: isProviderInCooldown('google'), cooldownSec: getProviderCooldownRemaining('google') },
            anthropic: { configured: providerChecks.anthropic(), inCooldown: isProviderInCooldown('anthropic'), cooldownSec: getProviderCooldownRemaining('anthropic') },
            openai: { configured: providerChecks.openai(), inCooldown: isProviderInCooldown('openai'), cooldownSec: getProviderCooldownRemaining('openai') },
            deepseek: { configured: providerChecks.deepseek(), inCooldown: isProviderInCooldown('deepseek'), cooldownSec: getProviderCooldownRemaining('deepseek') },
            groq: { configured: providerChecks.groq(), inCooldown: isProviderInCooldown('groq'), cooldownSec: getProviderCooldownRemaining('groq') },
            ollama: { configured: providerChecks.ollama(), model: process.env.OLLAMA_MODEL || '', inCooldown: isProviderInCooldown('ollama'), cooldownSec: getProviderCooldownRemaining('ollama') }
        }
    });
});

router.post('/api/models/active', authMiddleware, authorizeRoles('desarrollador'), (req, res) => {
    const { modelId } = req.body;
    if (!ALL_SUPPORTED_MODELS.find(m => m.id === modelId)) {
        return res.status(400).json({ error: 'Modelo no reconocido.' });
    }
    setActiveModelId(modelId);
    res.json({ success: true, activeModel: getActiveModelId() });
});

router.get('/api/prompt', authMiddleware, authorizeRoles('desarrollador', 'administrador'), (_req, res) => {
    res.json({ prompt: getActivePrompt(), presets: PROMPT_PRESETS });
});

router.post('/api/prompt', authMiddleware, authorizeRoles('desarrollador', 'administrador'), (req, res) => {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        return res.status(400).json({ error: 'El prompt no puede estar vacío.' });
    }
    setActivePrompt(prompt);
    res.json({ success: true, message: 'Personalidad y prompt actualizados con éxito.', prompt: getActivePrompt() });
});

router.post('/api/prompt/reset', authMiddleware, authorizeRoles('desarrollador', 'administrador'), (_req, res) => {
    setActivePrompt(PROMPT_PRESETS[0].prompt);
    res.json({ success: true, message: 'Prompt restaurado al original.', prompt: getActivePrompt() });
});

router.post('/api/session/reset', authMiddleware, (req, res) => {
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

router.get('/api/health', async (_req, res) => {
    let dbStatus = false;
    try {
        const conn = await getPool().getConnection();
        conn.release();
        dbStatus = true;
    } catch (_) {}
    res.json({
        status: 'online',
        botName: 'Metal-Uriel',
        apiVersion: '3.0.0',
        mode: config.HEADLESS_MODE ? 'headless' : 'full',
        dbConnected: dbStatus,
        webhookSignatureEnabled: Boolean(config.META_APP_SECRET && !setupUtils.isPlaceholderValue(config.META_APP_SECRET))
    });
});

router.get('/api/health/full', authMiddleware, async (_req, res) => {
    let dbStatus = false;
    let dbLatencyMs = null;
    let dbCount = 0;
    const t0 = Date.now();
    try {
        const connection = await getPool().getConnection();
        const [c] = await connection.query('SELECT COUNT(*) as count FROM aspirantes');
        connection.release();
        dbLatencyMs = Date.now() - t0;
        dbStatus = true;
        dbCount = c[0]?.count || 0;
    } catch (_) {
        dbLatencyMs = Date.now() - t0;
    }

    const hasMeta = Boolean(config.WHATSAPP_TOKEN && config.WHATSAPP_PHONE_NUMBER_ID && !setupUtils.isPlaceholderValue(config.WHATSAPP_TOKEN));
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
        hardware: setupUtils.getSystemHardwareReport(config.PORT),
        circuitBreaker: {
            cooldownsActive: providerCooldowns.size > 0,
            activeCooldownProviders: Array.from(providerCooldowns.entries()).map(([k, v]) => ({
                provider: k,
                remainingSec: Math.max(0, Math.ceil((v - Date.now()) / 1000))
            }))
        },
        services: {
            mariadb: { status: dbStatus ? 'online' : 'offline', latencyMs: dbLatencyMs, totalRecords: dbCount, host: process.env.DB_HOST || 'localhost', database: process.env.DB_NAME || 'unid_admisiones' },
            aiEngines: {
                activeModel: getActiveModelId(),
                gemini: { status: hasGemini ? (isProviderInCooldown('google') ? 'cooldown' : 'online') : 'not_configured', cooldownSec: getProviderCooldownRemaining('google') },
                claude: { status: hasClaude ? (isProviderInCooldown('anthropic') ? 'cooldown' : 'online') : 'not_configured', cooldownSec: getProviderCooldownRemaining('anthropic') },
                openai: { status: hasOpenAi ? (isProviderInCooldown('openai') ? 'cooldown' : 'online') : 'not_configured', cooldownSec: getProviderCooldownRemaining('openai') },
                deepseek: { status: hasDeepSeek ? (isProviderInCooldown('deepseek') ? 'cooldown' : 'online') : 'not_configured', cooldownSec: getProviderCooldownRemaining('deepseek') },
                groq: { status: hasGroq ? (isProviderInCooldown('groq') ? 'cooldown' : 'online') : 'not_configured', cooldownSec: getProviderCooldownRemaining('groq') },
                ollama: { status: hasOllama ? (isProviderInCooldown('ollama') ? 'cooldown' : 'online') : 'disabled', model: process.env.OLLAMA_MODEL || '', cooldownSec: getProviderCooldownRemaining('ollama') }
            },
            metaWhatsApp: {
                status: hasMeta ? 'configured' : 'sandbox_local',
                tokenPresent: Boolean(config.WHATSAPP_TOKEN && !setupUtils.isPlaceholderValue(config.WHATSAPP_TOKEN)),
                phoneNumberIdPresent: Boolean(config.WHATSAPP_PHONE_NUMBER_ID && !setupUtils.isPlaceholderValue(config.WHATSAPP_PHONE_NUMBER_ID)),
                verifyTokenPresent: Boolean(config.VERIFY_TOKEN),
                webhookSignatureEnabled: Boolean(config.META_APP_SECRET && !setupUtils.isPlaceholderValue(config.META_APP_SECRET))
            },
            memoryGc: {
                activeConversations: conversationMemory.size,
                activeSessions: userSessionState.size,
                dedupIdsCached: processedMessageIds.size,
                lastCleanupAt: getLastMemoryCleanupStats().lastRunAt
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

router.get('/api/conversations', authMiddleware, async (req, res) => {
    try {
        let targetSede = req.query.campus || null;
        if (req.user.rol !== 'desarrollador' && req.user.sede_id) targetSede = req.user.sede_id;
        let dbAspirantes = [];
        let dbHistoryRows = [];
        try {
            let aspQuery = 'SELECT * FROM aspirantes';
            const aspParams = [];
            if (targetSede && targetSede !== 'all' && targetSede !== 'todas') {
                aspQuery += ' WHERE (sede_id = ? OR campus_interes LIKE ?)';
                aspParams.push(targetSede, `%${targetSede.replace(/_/g, ' ')}%`);
            }
            aspQuery += ' ORDER BY created_at DESC';
            const [rows] = await getPool().query(aspQuery, aspParams);
            dbAspirantes = rows;
            const [hRows] = await getPool().query('SELECT * FROM historial_conversaciones ORDER BY timestamp ASC LIMIT 1000');
            dbHistoryRows = hRows;
        } catch (_) {}

        const dbHistoryByPhone = new Map();
        for (const h of dbHistoryRows) {
            const cPhone = String(h.telefono_celular || '').replace(/[\s\-\+]/g, '');
            if (!cPhone) continue;
            if (!dbHistoryByPhone.has(cPhone)) dbHistoryByPhone.set(cPhone, []);
            dbHistoryByPhone.get(cPhone).push({ role: h.rol, content: h.mensaje, timestamp: h.timestamp });
        }

        const convMap = new Map();
        for (const asp of dbAspirantes) {
            const phone = asp.telefono_celular || `asp_${asp.id}`;
            const cleanPhone = String(phone).replace(/[\s\-\+]/g, '');
            const memHistory = conversationMemory.get(phone) || conversationMemory.get(cleanPhone) || [];
            const history = memHistory.length > 0 ? memHistory : (dbHistoryByPhone.get(cleanPhone) || []);
            const session = userSessionState.get(phone) || userSessionState.get(cleanPhone) || {};
            const lastEntry = history.length > 0 ? history[history.length - 1] : null;
            convMap.set(cleanPhone, {
                phone: asp.telefono_celular || phone,
                cleanPhone,
                sede_id: asp.sede_id || resolveSedeId(asp.campus_interes),
                ciclo_escolar: asp.ciclo_escolar || '2026-3 Septiembre',
                name: asp.nombre_completo || 'Aspirante Registrado',
                carrera: asp.carrera_interes || 'Sin carrera especificada',
                campus: asp.campus_interes || 'Campus Campeche',
                modalidad: asp.modalidad_estudios || 'Presencial',
                isPaused: Boolean(session.isPaused),
                estado_prospecto: asp.estado_prospecto || 'nuevo',
                nivel_interes: asp.nivel_interes || 'Alto',
                leadData: asp,
                isRegistered: true,
                messages: history.map((m, idx) => ({
                    id: idx + 1,
                    sender: m.role === 'user' ? 'user' : (m.role === 'human_advisor' ? 'advisor' : 'bot'),
                    senderName: m.role === 'human_advisor' ? (m.senderName || 'Asesor Admisiones') : (m.role === 'user' ? (asp.nombre_completo || 'Aspirante') : 'Metal-Uriel'),
                    text: m.content,
                    time: m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
                    timestamp: m.timestamp || new Date(),
                    documentAttachment: m.documentAttachment || null
                })),
                lastMessage: lastEntry ? lastEntry.content : (asp.resumen_ia || 'Ficha registrada en MariaDB'),
                lastMessageTime: lastEntry ? (lastEntry.timestamp || new Date()) : (asp.ultimo_mensaje_at || asp.created_at || new Date())
            });
        }

        const activeCicloDefault = await getActiveCicloEscolar(targetSede || 'campeche');
        for (const [phoneKey, history] of conversationMemory.entries()) {
            const cleanKey = String(phoneKey).replace(/[\s\-\+]/g, '');
            const session = userSessionState.get(phoneKey) || {};
            const partial = extractPartialFieldsFromHistory(history);
            const convSede = resolveSedeId(session.leadData?.campus_interes || partial.campus_interes);
            if (targetSede && targetSede !== 'all' && targetSede !== 'todas' && convSede !== targetSede) continue;
            if (!convMap.has(cleanKey)) {
                const lastEntry = history.length > 0 ? history[history.length - 1] : null;
                convMap.set(cleanKey, {
                    phone: phoneKey,
                    cleanPhone: cleanKey,
                    sede_id: convSede,
                    ciclo_escolar: session.leadData?.ciclo_escolar || activeCicloDefault,
                    name: session.leadData?.nombre_completo || partial.nombre_completo || `Aspirante (${phoneKey})`,
                    carrera: session.leadData?.carrera_interes || partial.carrera_interes || 'Por definir',
                    campus: session.leadData?.campus_interes || partial.campus_interes || 'Campus Campeche',
                    modalidad: session.leadData?.modalidad_estudios || partial.modalidad_estudios || 'Presencial',
                    isPaused: Boolean(session.isPaused),
                    estado_prospecto: 'nuevo',
                    nivel_interes: 'Alto',
                    leadData: session.leadData || partial,
                    isRegistered: Boolean(session.isRegistered),
                    messages: history.map((m, idx) => ({
                        id: idx + 1,
                        sender: m.role === 'user' ? 'user' : (m.role === 'human_advisor' ? 'advisor' : 'bot'),
                        senderName: m.role === 'human_advisor' ? (m.senderName || 'Asesor Admisiones') : (m.role === 'user' ? (session.leadData?.nombre_completo || 'Aspirante') : 'Metal-Uriel'),
                        text: m.content,
                        time: m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
                        timestamp: m.timestamp || new Date(),
                        documentAttachment: m.documentAttachment || null
                    })),
                    lastMessage: lastEntry ? lastEntry.content : 'Iniciando conversación...',
                    lastMessageTime: lastEntry ? (lastEntry.timestamp || new Date()) : new Date()
                });
            }
        }

        const conversations = Array.from(convMap.values()).sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));
        res.json({ success: true, count: conversations.length, conversations });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/api/conversations/send-message', authMiddleware, async (req, res) => {
    try {
        const { phone, message, pauseAi, senderName } = req.body;
        if (!phone || !message) return res.status(400).json({ error: 'Teléfono y mensaje requeridos.' });
        if (!conversationMemory.has(phone)) conversationMemory.set(phone, []);
        const msgObj = { role: 'human_advisor', senderName: senderName || req.user?.displayName || 'Lic. Admisiones UNID', content: message.trim(), timestamp: new Date() };
        conversationMemory.get(phone).push(msgObj);
        const targetSede = (req.user.rol !== 'desarrollador' && req.user.sede_id) ? req.user.sede_id : 'campeche';
        await guardarMensajeHistorialBD(phone, 'human_advisor', message.trim(), targetSede);

        if (!userSessionState.has(phone)) userSessionState.set(phone, { isRegistered: false, isPaused: false, lastActivityAt: Date.now() });
        else userSessionState.get(phone).lastActivityAt = Date.now();
        if (pauseAi !== undefined) userSessionState.get(phone).isPaused = Boolean(pauseAi);

        await sendWhatsAppMessage(phone, message.trim());
        res.json({ success: true, message: msgObj, isPaused: userSessionState.get(phone).isPaused });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/api/conversations/toggle-ai', authMiddleware, (req, res) => {
    try {
        const { phone, isPaused } = req.body;
        if (!phone) return res.status(400).json({ error: 'Teléfono requerido.' });
        if (!userSessionState.has(phone)) userSessionState.set(phone, { isRegistered: false, isPaused: false, lastActivityAt: Date.now() });
        userSessionState.get(phone).isPaused = Boolean(isPaused);
        userSessionState.get(phone).lastActivityAt = Date.now();
        res.json({ success: true, isPaused: userSessionState.get(phone).isPaused });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/api/conversations/send-brochure', authMiddleware, async (req, res) => {
    try {
        const { phone, brochureId } = req.body;
        if (!phone || !brochureId) return res.status(400).json({ error: 'Teléfono y brochureId requeridos.' });
        const poolItems = await getActivePoolItems();
        const foundItem = poolItems.find(b => b.id === brochureId || b.codigo_recurso === brochureId) || getBrochures().find(b => b.id === brochureId);
        if (!foundItem) return res.status(404).json({ error: 'Recurso no encontrado en el Pool.' });

        const attachment = buildAttachmentObject(foundItem);
        const textReply = `Te comparto con mucho gusto el recurso oficial de *${foundItem.titulo || foundItem.carrera}* (${foundItem.modalidad || 'UNID'}).`;
        if (!conversationMemory.has(phone)) conversationMemory.set(phone, []);
        conversationMemory.get(phone).push({ role: 'assistant', content: textReply, documentAttachment: attachment, timestamp: new Date() });
        await guardarMensajeHistorialBD(phone, 'assistant', textReply, foundItem.sede_id || 'campeche');
        await sendWhatsAppMessage(phone, textReply, attachment);
        res.json({ success: true, brochure: attachment });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
