const fs = require('fs');
const path = require('path');
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
    getLastMemoryCleanupStats,
    touchUserSession
} = require('../state/memory');
const { resolveSedeId, extractPartialFieldsFromHistory } = require('../utils/curp');
const { authMiddleware, authorizeRoles, chatLimiter } = require('../middlewares/auth');
const { ALL_SUPPORTED_MODELS, getActiveModelId, setActiveModelId } = require('../services/llm.service');
const { getActiveCicloEscolar, getActivePoolItems, getBrochures, buildAttachmentObject } = require('../services/pool.service');
const { processChatMessage, guardarMensajeHistorialBD } = require('../services/admissions.service');
const { sendWhatsAppMessage } = require('../services/whatsapp.service');
const { dispararNotificacionCorreo } = require('../services/mail.service');
const { recordAuditEvent } = require('../services/audit.service');
const setupUtils = require('../../lib/setup-utils');
const {
    normalizePhoneCanonical,
    pickBestDialPhone,
    analyzeLeadCompleteness,
    formatSenderAudit
} = require('../../lib/chat-audit-utils');
const { buildWhatsAppConversationZip } = require('../../lib/zip-builder');

const router = express.Router();
const UPLOADS_ROOT = path.resolve(config.ROOT_DIR, 'public', 'uploads');

function parseAttachmentJson(raw) {
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
        documentAttachment: parseAttachmentJson(m.adjunto_json || m.documentAttachment)
    };
}

/**
 * Fusiona mensajes persistidos en MariaDB (fuente de verdad eterna) con mensajes en RAM
 * sin perder nada ni duplicar los que ya fueron escritos en BD.
 */
function mergeDbAndMemoryMessages(dbRows = [], memRows = []) {
    const combined = dbRows.map(r => ({
        id: r.id,
        rol: r.rol,
        remitente_nombre: r.remitente_nombre || null,
        modelo_ia: r.modelo_ia || null,
        whatsapp_message_id: r.whatsapp_message_id || null,
        adjunto_json: parseAttachmentJson(r.adjunto_json),
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

/**
 * Fusiona registros duplicados históricos de `aspirantes` que comparten el mismo teléfono canónico.
 * Preserva el registro más rico (prioriza 'inscrito', mayor completitud y ID más reciente).
 */
function mergeDuplicateLeads(leadRows = []) {
    if (leadRows.length === 0) return null;
    if (leadRows.length === 1) return { ...leadRows[0] };

    const ranked = [...leadRows].sort((a, b) => {
        const score = (row) => {
            let s = 0;
            if (row.estado_prospecto === 'inscrito') s += 1000;
            if (row.conversacion_destacada) s += 500;
            if (row.cerrado_manualmente) s += 200;
            const comp = analyzeLeadCompleteness(row, []);
            s += comp.completedCount * 20;
            s += Number(row.id || 0) * 0.001;
            return s;
        };
        return score(b) - score(a);
    });

    const primary = { ...ranked[0] };
    const dialCandidates = ranked.map(r => r.telefono_celular).filter(Boolean);
    primary.telefono_celular = pickBestDialPhone(dialCandidates) || primary.telefono_celular;
    primary.conversacion_destacada = ranked.some(r => Boolean(r.conversacion_destacada) || r.estado_prospecto === 'inscrito') ? 1 : 0;
    primary.archivado = ranked.every(r => Boolean(r.archivado)) ? 1 : (primary.archivado ? 1 : 0);

    // Completar campos vacíos del primario desde registros secundarios del mismo teléfono
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
    primary._mergedLeadIds = ranked.map(r => r.id);
    return primary;
}

/**
 * Busca todos los datos + historial completo sin truncar de un teléfono canónico (para /history y /export-zip).
 */
async function loadCanonicalConversationDetail(rawPhone, user) {
    const canonical = normalizePhoneCanonical(rawPhone);
    if (!canonical) return null;

    let leadRows = [];
    let dbHistoryRows = [];
    try {
        const [aRows] = await getPool().query(
            `SELECT * FROM aspirantes
             WHERE telefono_canonico = ?
                OR REPLACE(REPLACE(REPLACE(telefono_celular, '+', ''), ' ', ''), '-', '') LIKE ?
             ORDER BY id DESC`,
            [canonical, `%${canonical}%`]
        );
        leadRows = aRows || [];

        const [hRows] = await getPool().query(
            `SELECT * FROM historial_conversaciones
             WHERE telefono_canonico = ?
                OR REPLACE(REPLACE(REPLACE(telefono_celular, '+', ''), ' ', ''), '-', '') LIKE ?
             ORDER BY timestamp ASC, id ASC`,
            [canonical, `%${canonical}%`]
        );
        dbHistoryRows = hRows || [];
    } catch (_) {}

    // Verificar aislamiento multi-sede para no-desarrolladores
    const mergedLead = mergeDuplicateLeads(leadRows);
    if (user && user.rol !== 'desarrollador' && user.sede_id && mergedLead && mergedLead.sede_id && mergedLead.sede_id !== user.sede_id) {
        return { forbidden: true };
    }

    // Recolectar memoria RAM para cualquier variante de la clave canónica
    const memMessages = [];
    const dialCandidates = [rawPhone];
    if (mergedLead?.telefono_celular) dialCandidates.push(mergedLead.telefono_celular);
    for (const h of dbHistoryRows) {
        if (h.telefono_celular) dialCandidates.push(h.telefono_celular);
    }

    let session = userSessionState.get(canonical) || {};
    for (const [k, hist] of conversationMemory.entries()) {
        if (normalizePhoneCanonical(k) === canonical) {
            dialCandidates.push(k);
            memMessages.push(...hist);
        }
    }
    for (const [k, s] of userSessionState.entries()) {
        if (normalizePhoneCanonical(k) === canonical) {
            session = { ...session, ...s };
        }
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

router.post('/api/models/active', authMiddleware, authorizeRoles('desarrollador'), async (req, res) => {
    const { modelId } = req.body;
    if (!ALL_SUPPORTED_MODELS.find(m => m.id === modelId)) {
        return res.status(400).json({ error: 'Modelo no reconocido.' });
    }
    const prevModel = getActiveModelId();
    setActiveModelId(modelId);
    await recordAuditEvent({
        req,
        categoria: 'IA_MODELO',
        accion: 'MODEL_CHANGE',
        severidad: 'warning',
        objetivoTipo: 'modelo_ia',
        objetivoId: modelId,
        resumen: `Modelo de IA global actualizado: ${prevModel} → ${modelId}`,
        detalle: { prevModel, nextModel: modelId }
    });
    res.json({ success: true, activeModel: getActiveModelId() });
});

router.get('/api/prompt', authMiddleware, authorizeRoles('desarrollador', 'administrador'), (_req, res) => {
    res.json({ prompt: getActivePrompt(), presets: PROMPT_PRESETS });
});

router.post('/api/prompt', authMiddleware, authorizeRoles('desarrollador', 'administrador'), async (req, res) => {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        return res.status(400).json({ error: 'El prompt no puede estar vacío.' });
    }
    setActivePrompt(prompt);
    await recordAuditEvent({
        req,
        categoria: 'IA_MODELO',
        accion: 'PROMPT_UPDATE',
        severidad: 'warning',
        objetivoTipo: 'system_prompt',
        resumen: `Personalidad / System Prompt actualizado (${prompt.trim().length} caracteres)`,
        detalle: { length: prompt.trim().length, preview: prompt.trim().slice(0, 140) }
    });
    res.json({ success: true, message: 'Personalidad y prompt actualizados con éxito.', prompt: getActivePrompt() });
});

router.post('/api/prompt/reset', authMiddleware, authorizeRoles('desarrollador', 'administrador'), async (req, res) => {
    setActivePrompt(PROMPT_PRESETS[0].prompt);
    await recordAuditEvent({
        req,
        categoria: 'IA_MODELO',
        accion: 'PROMPT_RESET',
        severidad: 'warning',
        objetivoTipo: 'system_prompt',
        resumen: 'System Prompt restaurado a la versión oficial UNID por defecto'
    });
    res.json({ success: true, message: 'Prompt restaurado al original.', prompt: getActivePrompt() });
});

router.post('/api/session/reset', authMiddleware, (req, res) => {
    const { phone } = req.body;
    if (phone) {
        const canonical = normalizePhoneCanonical(phone);
        conversationMemory.delete(phone);
        userSessionState.delete(phone);
        if (canonical) {
            conversationMemory.delete(canonical);
            userSessionState.delete(canonical);
        }
    } else if (req.user.rol === 'desarrollador') {
        conversationMemory.clear();
        userSessionState.clear();
    } else {
        return res.status(403).json({ error: 'Solo el Desarrollador puede limpiar todas las sesiones globales.' });
    }
    res.json({ success: true, message: 'Memoria temporal RAM reiniciada (el historial auditado en MariaDB permanece intacto).' });
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
        apiVersion: '3.1.0',
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

// =========================================================================
// BÓVEDA ETERNA DE CONVERSACIONES (DEDUPLICADA POR TELÉFONO CANÓNICO)
// =========================================================================
router.get('/api/conversations', authMiddleware, async (req, res) => {
    try {
        let targetSede = req.query.campus || null;
        if (req.user.rol !== 'desarrollador' && req.user.sede_id) targetSede = req.user.sede_id;
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
            const [rows] = await getPool().query(aspQuery, aspParams);
            dbAspirantes = rows || [];

            // Sin LIMIT 1000 global: preserva TODAS las conversaciones auditadas en MariaDB
            let histQuery = 'SELECT * FROM historial_conversaciones';
            const histParams = [];
            if (filterSede) {
                histQuery += ' WHERE sede_id = ?';
                histParams.push(filterSede);
            }
            histQuery += ' ORDER BY timestamp ASC, id ASC';
            const [hRows] = await getPool().query(histQuery, histParams);
            dbHistoryRows = hRows || [];
        } catch (_) {}

        // 1. Agrupar aspirantes por teléfono canónico (evita chats duplicados apilados)
        const leadsByCanon = new Map();
        for (const asp of dbAspirantes) {
            const canon = normalizePhoneCanonical(asp.telefono_canonico || asp.telefono_celular || `asp_${asp.id}`);
            if (!canon) continue;
            if (!leadsByCanon.has(canon)) leadsByCanon.set(canon, []);
            leadsByCanon.get(canon).push(asp);
        }

        // 2. Agrupar historial eterno de BD por teléfono canónico
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

        // 3. Agrupar memoria RAM por teléfono canónico
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

        // 4. Unión canónica de todos los contactos (BD aspirantes + BD historial + RAM)
        const allCanonKeys = new Set([
            ...leadsByCanon.keys(),
            ...dbHistByCanon.keys(),
            ...memByCanon.keys()
        ]);

        const activeCicloDefault = await getActiveCicloEscolar(filterSede || 'campeche');
        const conversations = [];

        for (const canon of allCanonKeys) {
            const mergedLead = mergeDuplicateLeads(leadsByCanon.get(canon) || []);
            if (mergedLead?.telefono_celular) registerDial(canon, mergedLead.telefono_celular);

            const session = sessionByCanon.get(canon) || {};
            const dbMsgs = dbHistByCanon.get(canon) || [];
            const memMsgs = memByCanon.get(canon) || [];
            const fullRawTimeline = mergeDbAndMemoryMessages(dbMsgs, memMsgs);
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

            // En la lista enviamos los últimos 80 mensajes + totalMessages; /history entrega el 100% sin límite
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
                lastMessageTime: lastEntry
                    ? lastEntry.timestamp
                    : (effectiveLead.ultimo_mensaje_at || effectiveLead.created_at || new Date().toISOString())
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

// Historial completo 100% sin truncar para una conversación específica
router.get('/api/conversations/:phone/history', authMiddleware, async (req, res) => {
    try {
        const detail = await loadCanonicalConversationDetail(req.params.phone, req.user);
        if (!detail) return res.status(400).json({ error: 'Teléfono inválido.' });
        if (detail.forbidden) return res.status(403).json({ error: 'Sin permisos para ver conversaciones de otra sede.' });
        res.json({ success: true, ...detail });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Finalizar Proceso a Mano (cierre manual / inscripción directa con auditoría)
router.post('/api/conversations/:phone/finalize', authMiddleware, async (req, res) => {
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

        const [existingRows] = await getPool().query(
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

            const newNombre = req.body.nombre_completo?.trim() || primary.nombre_completo;
            const newCarrera = req.body.carrera_interes?.trim() || primary.carrera_interes;
            const newCorreo = req.body.correo_electronico?.trim() || primary.correo_electronico;
            const newModalidad = req.body.modalidad_estudios?.trim() || primary.modalidad_estudios;
            const newCampus = req.body.campus_interes?.trim() || primary.campus_interes;

            await getPool().execute(
                `UPDATE aspirantes SET
                    nombre_completo = ?,
                    carrera_interes = ?,
                    correo_electronico = ?,
                    modalidad_estudios = ?,
                    campus_interes = ?,
                    estado_prospecto = ?,
                    cerrado_manualmente = 1,
                    cerrado_por = ?,
                    notas_asesor = ?,
                    archivado = ?,
                    conversacion_destacada = CASE WHEN ? = 1 THEN 1 ELSE conversacion_destacada END,
                    fecha_inscripcion = CASE WHEN ? = 1 THEN COALESCE(fecha_inscripcion, CURRENT_TIMESTAMP) ELSE fecha_inscripcion END,
                    ultimo_mensaje_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [
                    newNombre, newCarrera, newCorreo, newModalidad, newCampus,
                    estado, actor, notasAsesor || primary.notas_asesor || null,
                    archivar ? 1 : (primary.archivado ? 1 : 0),
                    isEnrolled ? 1 : 0, isEnrolled ? 1 : 0,
                    primary.id
                ]
            );
            const [updated] = await getPool().query('SELECT * FROM aspirantes WHERE id = ?', [primary.id]);
            leadRecord = updated[0];
        } else {
            const dialPhone = pickBestDialPhone([rawPhone]);
            const cicloActivo = await getActiveCicloEscolar(targetSede);
            const [ins] = await getPool().execute(
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
                    estado,
                    archivar ? 1 : 0,
                    isEnrolled ? 1 : 0,
                    isEnrolled ? new Date() : null,
                    actor,
                    notasAsesor || null,
                    `Proceso finalizado manualmente por ${actor} como "${estado}".`
                ]
            );
            const [created] = await getPool().query('SELECT * FROM aspirantes WHERE id = ?', [ins.insertId]);
            leadRecord = created[0];
        }

        // Pausar IA automáticamente al finalizar manualmente para que el bot no vuelva a pedir datos
        const curSess = userSessionState.get(canonical) || { isRegistered: true, isPaused: true, lastActivityAt: Date.now() };
        curSess.isRegistered = true;
        curSess.isPaused = true;
        curSess.leadData = leadRecord;
        curSess.lastActivityAt = Date.now();
        userSessionState.set(canonical, curSess);

        const auditText = `✅ Proceso finalizado manualmente en etapa "${estado.toUpperCase()}" por ${actor}.${isEnrolled ? ' 🏆 Conversación marcada como Caso de Éxito (Estudio).' : ''}${notasAsesor ? ` Notas: ${notasAsesor}` : ''}`;
        if (!conversationMemory.has(canonical)) conversationMemory.set(canonical, []);
        conversationMemory.get(canonical).push({
            role: 'system',
            senderName: actor,
            content: auditText,
            timestamp: new Date()
        });
        await guardarMensajeHistorialBD(leadRecord.telefono_celular || rawPhone, 'system', auditText, leadRecord.sede_id || targetSede, {
            senderName: actor
        });

        if (isEnrolled) {
            dispararNotificacionCorreo('CIERRE_INSCRITO', { lead: leadRecord, asesor: actor }).catch(() => {});
        }

        await recordAuditEvent({
            req,
            categoria: 'ASPIRANTES',
            accion: 'LEAD_FINALIZE_MANUAL',
            severidad: isEnrolled ? 'warning' : 'info',
            sedeId: leadRecord?.sede_id || targetSede,
            objetivoTipo: 'aspirante',
            objetivoId: canonical,
            resumen: `Proceso finalizado manualmente (${estado.toUpperCase()}) para ${leadRecord?.nombre_completo || canonical}`,
            detalle: { estado, archivar, notasLength: notasAsesor.length }
        });

        res.json({
            success: true,
            message: isEnrolled
                ? '🏆 Proceso finalizado como INSCRITO y resguardado permanentemente como Caso de Estudio.'
                : `Proceso finalizado manualmente en etapa "${estado}".`,
            aspirante: leadRecord
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Destacar conversación como Caso de Estudio o Archivar/Desarchivar por estatus
router.patch('/api/conversations/:phone/highlight', authMiddleware, async (req, res) => {
    try {
        const canonical = normalizePhoneCanonical(req.params.phone);
        if (!canonical) return res.status(400).json({ error: 'Teléfono inválido.' });
        const { conversacion_destacada, archivado } = req.body;
        const actor = req.user.displayName || req.user.email || 'Asesor UNID';

        const [rows] = await getPool().query(
            `SELECT id, sede_id, telefono_celular, conversacion_destacada, archivado
             FROM aspirantes
             WHERE telefono_canonico = ?
                OR REPLACE(REPLACE(REPLACE(telefono_celular, '+', ''), ' ', ''), '-', '') LIKE ?
             ORDER BY id DESC`,
            [canonical, `%${canonical}%`]
        );
        if (!rows || rows.length === 0) {
            return res.status(404).json({ error: 'Aún no existe una ficha registrada para este número.' });
        }
        const primary = rows[0];
        if (req.user.rol !== 'desarrollador' && req.user.sede_id && primary.sede_id && primary.sede_id !== req.user.sede_id) {
            return res.status(403).json({ error: 'Sin permisos sobre otra sede.' });
        }

        const nextHighlight = conversacion_destacada !== undefined ? (conversacion_destacada ? 1 : 0) : primary.conversacion_destacada;
        const nextArchived = archivado !== undefined ? (archivado ? 1 : 0) : primary.archivado;

        await getPool().execute(
            'UPDATE aspirantes SET conversacion_destacada = ?, archivado = ? WHERE id = ?',
            [nextHighlight, nextArchived, primary.id]
        );

        const actions = [];
        if (conversacion_destacada !== undefined) actions.push(nextHighlight ? '🏆 Destacada como Caso de Estudio' : 'Removida de Casos de Estudio');
        if (archivado !== undefined) actions.push(nextArchived ? '🗄️ Archivada' : '📂 Restaurada a bandeja activa');
        if (actions.length > 0) {
            await guardarMensajeHistorialBD(primary.telefono_celular || req.params.phone, 'system', `📌 ${actions.join(' • ')} por ${actor}.`, primary.sede_id || 'campeche', {
                senderName: actor
            });
        }

        res.json({
            success: true,
            conversacion_destacada: Boolean(nextHighlight),
            archivado: Boolean(nextArchived)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Exportar conversación completa en .ZIP estilo WhatsApp (.txt + .json + .md + adjuntos locales)
router.get('/api/conversations/:phone/export-zip', authMiddleware, async (req, res) => {
    try {
        const detail = await loadCanonicalConversationDetail(req.params.phone, req.user);
        if (!detail) return res.status(400).json({ error: 'Teléfono inválido.' });
        if (detail.forbidden) return res.status(403).json({ error: 'Sin permisos para exportar conversaciones de otra sede.' });

        // Recolectar archivos locales seguros referenciados en adjuntos (sin path traversal)
        const attachmentFiles = [];
        const seenPaths = new Set();
        for (const msg of detail.messages) {
            const att = msg.documentAttachment;
            if (!att) continue;
            const relUrl = att.localUrl || att.url || '';
            const match = String(relUrl).match(/\/uploads\/(.+)$/);
            if (!match) continue;
            const candidatePath = path.resolve(UPLOADS_ROOT, match[1]);
            if (!candidatePath.startsWith(UPLOADS_ROOT + path.sep)) continue;
            if (seenPaths.has(candidatePath)) continue;
            try {
                if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
                    const stat = fs.statSync(candidatePath);
                    // Limitar adjuntos individuales a 15 MB para evitar picos de RAM
                    if (stat.size <= 15 * 1024 * 1024) {
                        seenPaths.add(candidatePath);
                        attachmentFiles.push({
                            fileName: att.fileName || path.basename(candidatePath),
                            buffer: fs.readFileSync(candidatePath)
                        });
                    }
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

        await recordAuditEvent({
            req,
            categoria: 'ASPIRANTES',
            accion: 'CHAT_ZIP_EXPORT',
            severidad: 'info',
            sedeId: detail.aspirante?.sede_id || req.user?.sede_id || null,
            objetivoTipo: 'conversacion',
            objetivoId: detail.canonicalPhone,
            resumen: `Exportación .ZIP de conversación auditada: ${detail.name} (${detail.messages.length} mensajes)`,
            detalle: { fileName, totalMessages: detail.messages.length, attachmentsCount: attachmentFiles.length }
        });

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Length', String(zipBuffer.length));
        res.setHeader('X-Metal-Uriel-Export-Messages', String(detail.messages.length));
        res.send(zipBuffer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/api/conversations/send-message', authMiddleware, async (req, res) => {
    try {
        const { phone, message, pauseAi, senderName } = req.body;
        if (!phone || !message) return res.status(400).json({ error: 'Teléfono y mensaje requeridos.' });
        const canonical = normalizePhoneCanonical(phone) || phone;
        const dialPhone = pickBestDialPhone([phone]);
        const advisorName = senderName || req.user?.displayName || req.user?.email || 'Asesor Admisiones UNID';

        if (!conversationMemory.has(canonical)) conversationMemory.set(canonical, []);
        const msgObj = {
            role: 'human_advisor',
            senderName: advisorName,
            content: message.trim(),
            timestamp: new Date()
        };
        conversationMemory.get(canonical).push(msgObj);
        const targetSede = (req.user.rol !== 'desarrollador' && req.user.sede_id) ? req.user.sede_id : 'campeche';
        await guardarMensajeHistorialBD(dialPhone, 'human_advisor', message.trim(), targetSede, {
            senderName: advisorName
        });

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

router.post('/api/conversations/toggle-ai', authMiddleware, async (req, res) => {
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
        const auditText = isPaused
            ? `⏸️ Control Humano activado por ${actor} (Robot IA en pausa).`
            : `🤖 Robot IA reactivado por ${actor}.`;
        await guardarMensajeHistorialBD(phone, 'system', auditText, targetSede, { senderName: actor });

        res.json({ success: true, isPaused: userSessionState.get(canonical).isPaused, canonicalPhone: canonical });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/api/conversations/send-brochure', authMiddleware, async (req, res) => {
    try {
        const { phone, brochureId } = req.body;
        if (!phone || !brochureId) return res.status(400).json({ error: 'Teléfono y brochureId requeridos.' });
        const canonical = normalizePhoneCanonical(phone) || phone;
        const dialPhone = pickBestDialPhone([phone]);
        const actor = req.user?.displayName || req.user?.email || 'Asesor UNID';

        const poolItems = await getActivePoolItems();
        const foundItem = poolItems.find(b => b.id === brochureId || b.codigo_recurso === brochureId) || getBrochures().find(b => b.id === brochureId);
        if (!foundItem) return res.status(404).json({ error: 'Recurso no encontrado en el Pool.' });

        const attachment = buildAttachmentObject(foundItem);
        const textReply = `Te comparto con mucho gusto el recurso oficial de *${foundItem.titulo || foundItem.carrera}* (${foundItem.modalidad || 'UNID'}).`;
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

module.exports = router;
