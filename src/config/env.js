const dotenv = require('dotenv');
dotenv.config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const setupUtils = require('../../lib/setup-utils');
const { PROMPT_PRESETS } = require('./campuses');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const ENV_PATH = path.join(ROOT_DIR, '.env');
const PROMPT_FILE_PATH = path.join(ROOT_DIR, 'system_prompt.txt');

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
    activeSystemPrompt = String(newPrompt || '').trim();
    try {
        fs.writeFileSync(PROMPT_FILE_PATH, activeSystemPrompt, 'utf-8');
    } catch (e) {
        console.error('Error guardando prompt en archivo:', e);
    }
}

function isProductionHardened() {
    return process.env.SETUP_COMPLETED === 'true' || process.env.NODE_ENV === 'production';
}

function isValidApiKey(key) {
    return Boolean(key && key.trim().length > 10 && !setupUtils.isPlaceholderValue(key));
}

function isOllamaConfigured() {
    const enabled = String(process.env.OLLAMA_ENABLED || '').toLowerCase() === 'true';
    const url = (process.env.OLLAMA_BASE_URL || '').trim();
    const model = (process.env.OLLAMA_MODEL || '').trim();
    return Boolean(enabled && url && model && !setupUtils.isPlaceholderValue(url));
}

function reloadEnvFromDisk() {
    if (fs.existsSync(ENV_PATH)) {
        const parsed = dotenv.parse(fs.readFileSync(ENV_PATH, 'utf8'));
        for (const [k, v] of Object.entries(parsed)) {
            process.env[k] = v;
        }
    }
}

// Objeto de configuración reactivo a process.env (soporta hot-reload tras Setup Wizard sin reiniciar proceso)
const config = {
    ROOT_DIR,
    ENV_PATH,
    get HOST() { return process.env.HOST || '0.0.0.0'; },
    get PORT() { return Number(process.env.PORT) || 3000; },
    get HEADLESS_MODE() { return String(process.env.HEADLESS_MODE || '').toLowerCase() === 'true'; },
    get CORS_ORIGINS() {
        return String(process.env.CORS_ORIGINS || '')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
    },
    get JWT_SECRET() { return process.env.JWT_SECRET || 'unid_metal_uriel_jwt_secret_key_2026'; },
    get ENCRYPTION_MASTER_KEY() { return process.env.ENCRYPTION_MASTER_KEY || process.env.JWT_SECRET || 'unid_metal_uriel_saas_encryption_key_2026'; },
    get CRYPTO_KEY() { return crypto.createHash('sha256').update(this.ENCRYPTION_MASTER_KEY).digest(); },
    get VERIFY_TOKEN() { return process.env.META_VERIFY_TOKEN || 'mi_token_secreto_123'; },
    get META_APP_SECRET() { return process.env.META_APP_SECRET || ''; },
    get WHATSAPP_TOKEN() { return process.env.WHATSAPP_TOKEN || ''; },
    get WHATSAPP_PHONE_NUMBER_ID() { return process.env.WHATSAPP_PHONE_NUMBER_ID || ''; },
    get ADMIN_USERNAME() { return process.env.ADMIN_USERNAME || 'admin'; },
    get ADMIN_PASSWORD() { return process.env.ADMIN_PASSWORD || 'unid2026'; },
    get TESTING_NOTIFICATION_EMAIL() { return process.env.ADMISSIONS_NOTIFICATION_EMAIL || 'Luisquintero2001@gmail.com'; }
};

module.exports = {
    config,
    ROOT_DIR,
    ENV_PATH,
    PROMPT_FILE_PATH,
    getActivePrompt,
    setActivePrompt,
    isProductionHardened,
    isValidApiKey,
    isOllamaConfigured,
    reloadEnvFromDisk
};
