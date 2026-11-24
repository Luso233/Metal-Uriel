const securityUtils = require('../../lib/security-utils');

// Estado en memoria compartido por los módulos (con Recolector TTL 24/7 para PCs de 8 GB RAM)
const conversationMemory = new Map();
const userSessionState = new Map();
const processedMessageIds = new Set();
const providerCooldowns = new Map();
const activeSchoolCyclesMemory = new Map([['campeche', '2026-3 Septiembre']]);
const emailNotificationHistory = [];
const systemAlertCooldowns = new Map();
const llmTelemetryBuffer = [];

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
    activeSchoolCyclesMemory,
    emailNotificationHistory,
    systemAlertCooldowns,
    llmTelemetryBuffer,
    isProviderInCooldown,
    setProviderCooldown,
    getProviderCooldownRemaining,
    touchUserSession,
    runMemoryCleanup,
    startMemoryGcScheduler,
    getLastMemoryCleanupStats: () => lastMemoryCleanupStats,
    getTotalConversationsStarted: () => totalConversationsStarted,
    incrementTotalConversations: () => { totalConversationsStarted++; },
    resetTotalConversationsStarted: () => { totalConversationsStarted = 0; }
};
