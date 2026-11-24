// =========================================================================
// :UNID Centro de Mando • Metal-Uriel v3.0 (Arquitectura Modular + Vite)
// Entrypoint delgado: delega toda la lógica a src/ (config, db, middlewares, services, routes)
// =========================================================================
const { config, isOllamaConfigured } = require('./src/config/env');
const { app } = require('./src/app');
const { initializeDatabase } = require('./src/db/init');
const { enviarAlertaSistema } = require('./src/services/mail.service');
const { getActiveModelId } = require('./src/services/llm.service');
const { computeSetupStatus } = require('./src/routes/setup.routes');
const {
    setProviderCooldown,
    isProviderInCooldown,
    getProviderCooldownRemaining,
    runMemoryCleanup,
    startMemoryGcScheduler
} = require('./src/state/memory');
const {
    authMiddleware,
    authorizeRoles,
    normalizeRole,
    verifyMetaWebhookSignature
} = require('./src/middlewares/auth');
const {
    encryptSecret,
    decryptSecret,
    hashPassword,
    verifyPassword
} = require('./src/utils/crypto');
const {
    generarCurp,
    extractJsonFromLlmReply,
    resolveSedeId
} = require('./src/utils/curp');
const setupUtils = require('./lib/setup-utils');

process.on('uncaughtException', (err) => {
    console.error('🔥 Error no capturado (uncaughtException):', err);
    enviarAlertaSistema('UNCAUGHT_EXCEPTION', 'Excepción no capturada en Metal-Uriel', err?.stack || err?.message || String(err)).catch(() => {});
});

process.on('unhandledRejection', (reason) => {
    console.error('🔥 Promesa no manejada (unhandledRejection):', reason);
});

if (process.env.NODE_ENV !== 'test') {
    initializeDatabase();
    startMemoryGcScheduler();
}

function startServer(port = config.PORT, host = config.HOST) {
    const server = app.listen(port, host, async () => {
        const hw = setupUtils.getSystemHardwareReport(port);
        const setupInfo = await computeSetupStatus().catch(() => ({ needsSetup: false }));
        const hmacActive = Boolean(config.META_APP_SECRET && !setupUtils.isPlaceholderValue(config.META_APP_SECRET));
        console.log(`====================================================`);
        console.log(`🐺 :UNID Centro de Mando • Metal-Uriel v3.0 (${config.HEADLESS_MODE ? 'HEADLESS API' : 'Modular + Vite'})`);
        console.log(`💻 Hardware: ${hw.cpuCores} núcleos | RAM: ${hw.freeMemGB}/${hw.totalMemGB} GB libre`);
        console.log(`🧩 Modo Servidor: ${config.HEADLESS_MODE ? 'HEADLESS (Sin UI Web — ideal para APK Capacitor / API)' : 'FULL (API + Panel Web Vite Offline)'}`);
        console.log(`🛡️ Modo de Inferencia: ${getActiveModelId()} ${isOllamaConfigured() ? '(+ Ollama Local último recurso)' : ''}`);
        console.log(`🔐 Seguridad: Helmet CSP + CORS Capacitor + Rate Limit + RBAC 100% + HMAC ${hmacActive ? 'ACTIVO ✅' : 'SANDBOX'}`);
        console.log(`🌐 Acceso Local: http://localhost:${port}`);
        hw.lanUrls.forEach(u => console.log(`📱 Acceso Red Local / APK Android (Wi-Fi/Ethernet): ${u}`));
        if (hw.virtualUrls && hw.virtualUrls.length > 0) {
            console.log(`⚠️ Adaptadores virtuales omitidos (NO usar desde celular): ${hw.virtualUrls.join(', ')}`);
        }
        console.log(`🔥 Si el celular no conecta, ejecuta en PowerShell Admin:`);
        console.log(`   ${hw.firewallCommand}`);
        console.log(`🔗 Webhook de WhatsApp: http://localhost:${port}/webhook`);
        if (setupInfo.needsSetup) {
            console.log(`🧩 PRIMER USO DETECTADO: ${config.HEADLESS_MODE ? 'Conecta la APK Android o abre con HEADLESS_MODE=false para completar el Setup Wizard.' : `Abre http://localhost:${port} en tu navegador para el Setup Wizard.`}`);
        }
        console.log(`====================================================`);
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.warn(`\n⚠️ [AVISO] El puerto ${port} ya está en uso por otra instancia activa de Metal-Uriel.`);
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
    runMemoryCleanup
};
