const securityUtils = require('../../lib/security-utils');

// Estado en memoria compartido por los módulos (con Recolector TTL 24/7 para PCs de 8 GB RAM)
const conversationMemory = new Map();
const userSessionState = new Map();
const processedMessageIds = new Set();
const providerCooldowns = new Map();
const modelCooldowns = new Map();
const metaMediaIdCache = new Map();
const whatsappMessageStatuses = new Map();
const phoneProcessingQueues = new Map();
const activeSchoolCyclesMemory = new Map([['campeche', '2026-3 Septiembre']]);
const emailNotificationHistory = [];
const systemAlertCooldowns = new Map();
const llmTelemetryBuffer = [];

function withTimeout(promise, timeoutMs, label = 'operación') {
    let timer = null;
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            timer = setTimeout(() => {
                const err = new Error(`Timeout excedido (${timeoutMs}ms) en ${label}`);
                err.code = 'ETIMEDOUT';
                err.status = 504;
                reject(err);
            }, timeoutMs);
        })
    ]).finally(() => {
        if (timer) clearTimeout(timer);
    });
}

function enqueuePhoneTask(canonicalKey, taskFn) {
    const key = canonicalKey || 'global';
    const prev = phoneProcessingQueues.get(key) || Promise.resolve();
    const next = prev.then(() => taskFn(), () => taskFn()).finally(() => {
        if (phoneProcessingQueues.get(key) === next) {
            phoneProcessingQueues.delete(key);
        }
    });
    phoneProcessingQueues.set(key, next);
    return next;
}

function isModelInCooldown(modelId) {
    const expiresAt = modelCooldowns.get(modelId);
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
        modelCooldowns.delete(modelId);
        return false;
    }
    return true;
}

function setModelCooldown(modelId, durationMinutes = 3, reason = 'Congestión/503') {
    const expiresAt = Date.now() + (durationMinutes * 60 * 1000);
    modelCooldowns.set(modelId, expiresAt);
    console.warn(`⏳ [MODEL COOLDOWN] Modelo '${modelId}' en pausa por ${durationMinutes} min (${reason}).`);
}

let totalConversationsStarted = 0;
let lastMemoryCleanupStats = {
    lastRunAt: null,
    evictedConversations: 0,
    evictedSessions: 0,
    evictedMessageIds: 0
};

function isProviderInCooldown(providerKey) {
    const expiresAt = providerCooldowns.get(providerKey);
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
        providerCooldowns.delete(providerKey);
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
    return Math.ceil((expiresAt - Date.now()) / 1000);
}

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

function startMemoryGcScheduler() {
    if (process.env.NODE_ENV === 'test') return null;
    const timer = setInterval(() => runMemoryCleanup(), 30 * 60 * 1000);
    if (typeof timer.unref === 'function') timer.unref();
    return timer;
}

module.exports = {
    conversationMemory,
    userSessionState,
    processedMessageIds,
    providerCooldowns,
    modelCooldowns,
    metaMediaIdCache,
    whatsappMessageStatuses,
    activeSchoolCyclesMemory,
    emailNotificationHistory,
    systemAlertCooldowns,
    llmTelemetryBuffer,
    isProviderInCooldown,
    setProviderCooldown,
    getProviderCooldownRemaining,
    isModelInCooldown,
    setModelCooldown,
    withTimeout,
    enqueuePhoneTask,
    touchUserSession,
    runMemoryCleanup,
    startMemoryGcScheduler,
    getLastMemoryCleanupStats: () => lastMemoryCleanupStats,
    getTotalConversationsStarted: () => totalConversationsStarted,
    incrementTotalConversations: () => { totalConversationsStarted++; },
    resetTotalConversationsStarted: () => { totalConversationsStarted = 0; }
};
