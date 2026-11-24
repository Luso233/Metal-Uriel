const crypto = require('crypto');
const os = require('os');

// ==========================================
// Reglas Estrictas de Validación por Tipo de Credencial
// ==========================================
const PLACEHOLDER_REGEX = /(tu_api_key|tu_token|tu_password|tu_phone_number|tu_app_password|placeholder|changeme|example|xxxxxx|reemplaza|pon_tu_)/i;

const CREDENTIAL_RULES = {
    PORT: {
        label: 'Puerto HTTP',
        required: true,
        minLen: 2,
        maxLen: 5,
        pattern: /^\d{2,5}$/,
        hint: 'Número de puerto TCP (por defecto 3000, rango 1024–65535).',
        custom: (v) => {
            const n = Number(v);
            if (!Number.isInteger(n) || n < 1 || n > 65535) return 'Debe ser un puerto TCP válido entre 1 y 65535.';
            return null;
        }
    },
    DB_HOST: {
        label: 'Host MariaDB',
        required: true,
        minLen: 1,
        maxLen: 253,
        pattern: /^[a-zA-Z0-9._-]+$/,
        hint: 'Normalmente localhost o 127.0.0.1 si MariaDB corre en este mismo servidor.'
    },
    DB_PORT: {
        label: 'Puerto MariaDB',
        required: true,
        minLen: 2,
        maxLen: 5,
        pattern: /^\d{2,5}$/,
        hint: 'Solo números (estándar MariaDB/MySQL: 3306).',
        custom: (v) => {
            const n = Number(v);
            if (!Number.isInteger(n) || n < 1 || n > 65535) return 'Puerto de base de datos inválido (1–65535).';
            return null;
        }
    },
    DB_USER: {
        label: 'Usuario MariaDB',
        required: true,
        minLen: 1,
        maxLen: 64,
        pattern: /^[a-zA-Z0-9_.-]+$/,
        hint: 'Usuario de MariaDB con permisos para crear la base de datos (ej. root o metal_uriel).'
    },
    DB_PASSWORD: {
        label: 'Contraseña MariaDB',
        required: false,
        minLen: 0,
        maxLen: 128,
        noNewlines: true,
        hint: 'Contraseña del usuario MariaDB (recomendado ≥ 8 caracteres en producción).'
    },
    DB_NAME: {
        label: 'Nombre de Base de Datos',
        required: true,
        minLen: 2,
        maxLen: 64,
        pattern: /^[a-zA-Z][a-zA-Z0-9_]*$/,
        hint: 'Solo letras, números y guion bajo, iniciando con letra (default: unid_admisiones).'
    },
    GEMINI_API_KEY: {
        label: 'Google Gemini API Key',
        required: false,
        minLen: 35,
        maxLen: 55,
        pattern: /^AIza[0-9A-Za-z_-]{31,51}$/,
        hint: 'Inicia con "AIza", longitud típica de 39 caracteres (solo letras, números, _ y -, sin espacios).'
    },
    ANTHROPIC_API_KEY: {
        label: 'Anthropic Claude API Key',
        required: false,
        minLen: 40,
        maxLen: 180,
        pattern: /^sk-ant-[0-9A-Za-z_-]{33,173}$/,
        hint: 'Inicia con "sk-ant-", longitud de 40 a 180 caracteres (sin espacios).'
    },
    OPENAI_API_KEY: {
        label: 'OpenAI API Key',
        required: false,
        minLen: 32,
        maxLen: 220,
        pattern: /^sk-[0-9A-Za-z_-]{29,217}$/,
        hint: 'Inicia con "sk-" o "sk-proj-", longitud de 32 a 220 caracteres (sin espacios).'
    },
    DEEPSEEK_API_KEY: {
        label: 'DeepSeek API Key',
        required: false,
        minLen: 24,
        maxLen: 120,
        pattern: /^sk-[0-9A-Za-z_-]{21,117}$/,
        hint: 'Inicia con "sk-", longitud de 24 a 120 caracteres (sin espacios).'
    },
    GROQ_API_KEY: {
        label: 'Groq Cloud API Key',
        required: false,
        minLen: 40,
        maxLen: 120,
        pattern: /^gsk_[0-9A-Za-z_-]{36,116}$/,
        hint: 'Inicia con "gsk_", longitud de 40 a 120 caracteres (sin espacios).'
    },
    OLLAMA_BASE_URL: {
        label: 'URL de Ollama Local',
        required: false,
        minLen: 10,
        maxLen: 250,
        pattern: /^https?:\/\/[a-zA-Z0-9._-]+(:\d{1,5})?(\/[^\s]*)?$/,
        hint: 'URL HTTP/HTTPS local o LAN (por defecto: http://127.0.0.1:11434).'
    },
    OLLAMA_MODEL: {
        label: 'Modelo Ollama Local',
        required: false,
        minLen: 2,
        maxLen: 80,
        pattern: /^[a-zA-Z0-9._:/-]+$/,
        hint: 'Nombre exacto del modelo en Ollama (ej. qwen2.5:3b, llama3.2:3b o phi3:mini).'
    },
    OLLAMA_API_KEY: {
        label: 'Token Ollama (Opcional)',
        required: false,
        minLen: 8,
        maxLen: 200,
        pattern: /^[^\s]{8,200}$/,
        hint: 'Déjalo vacío en localhost. Solo llénalo si protegiste Ollama con un proxy Bearer.'
    },
    OLLAMA_TIMEOUT_MS: {
        label: 'Timeout Ollama (ms)',
        required: false,
        minLen: 4,
        maxLen: 5,
        pattern: /^\d{4,5}$/,
        hint: 'Milisegundos máximos de espera (5000–60000 ms; recomendado 15000 ms para WhatsApp).',
        custom: (v) => {
            const n = Number(v);
            if (!Number.isInteger(n) || n < 5000 || n > 60000) return 'Debe estar entre 5000 y 60000 ms.';
            return null;
        }
    },
    WHATSAPP_PHONE_NUMBER_ID: {
        label: 'WhatsApp Phone Number ID',
        required: false,
        minLen: 10,
        maxLen: 20,
        pattern: /^\d{10,20}$/,
        hint: 'EXACTAMENTE solo números (10 a 20 dígitos, ej. 1332834883256423). No es tu número telefónico con +52.'
    },
    WHATSAPP_TOKEN: {
        label: 'Meta WhatsApp Access Token',
        required: false,
        minLen: 80,
        maxLen: 500,
        pattern: /^EAA[0-9A-Za-z_-]{77,497}$/,
        hint: 'Token permanente del sistema de Meta: inicia con "EAA", solo letras y números (80 a 500 caracteres, sin espacios).'
    },
    META_VERIFY_TOKEN: {
        label: 'Meta Webhook Verify Token',
        required: true,
        minLen: 8,
        maxLen: 128,
        pattern: /^[0-9A-Za-z_-]{8,128}$/,
        hint: 'De 8 a 128 caracteres (letras, números, _ o -, sin espacios). Debe coincidir exactamente en Meta Developers.'
    },
    META_APP_SECRET: {
        label: 'Meta App Secret (Firma HMAC Webhook)',
        required: false,
        minLen: 32,
        maxLen: 64,
        pattern: /^[a-fA-F0-9]{32,64}$/,
        hint: 'Opcional pero recomendado en producción: 32 caracteres hexadecimales (Meta Developers → Configuración → Básica). Activa validación criptográfica X-Hub-Signature-256.'
    },
    JWT_SECRET: {
        label: 'JWT Secret (Sesiones)',
        required: true,
        minLen: 32,
        maxLen: 128,
        pattern: /^[^\s]{32,128}$/,
        hint: 'Mínimo 32 caracteres aleatorios sin espacios. Usa el botón generador para 256 bits.'
    },
    ENCRYPTION_MASTER_KEY: {
        label: 'Llave Maestra AES-256-GCM',
        required: true,
        minLen: 32,
        maxLen: 128,
        pattern: /^[^\s]{32,128}$/,
        hint: 'Mínimo 32 caracteres aleatorios sin espacios para cifrar tokens en MariaDB.'
    },
    DEV_EMAIL: {
        label: 'Correo del Desarrollador / Superadmin',
        required: true,
        minLen: 6,
        maxLen: 180,
        pattern: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
        hint: 'Correo institucional o de administrador (ej. 00774343@red.unid.mx).'
    },
    DEV_NAME: {
        label: 'Nombre del Desarrollador',
        required: true,
        minLen: 3,
        maxLen: 140,
        hint: 'Nombre completo visible en el Centro de Mando.'
    },
    DEV_PASSWORD: {
        label: 'Contraseña del Desarrollador',
        required: true,
        minLen: 12,
        maxLen: 128,
        pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9\s]).{12,128}$/,
        hint: 'Mínimo 12 caracteres: al menos 1 mayúscula, 1 minúscula, 1 número y 1 símbolo (sin espacios).'
    },
    ADMIN_SEDE_EMAIL: {
        label: 'Correo del Administrador de Sede',
        required: false,
        minLen: 6,
        maxLen: 180,
        pattern: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
        hint: 'Correo institucional de la Jefatura de Admisiones (opcional en este paso).'
    },
    ADMIN_SEDE_PASSWORD: {
        label: 'Contraseña del Administrador de Sede',
        required: false,
        minLen: 12,
        maxLen: 128,
        pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9\s]).{12,128}$/,
        hint: 'Mínimo 12 caracteres con mayúscula, minúscula, número y símbolo.'
    },
    SMTP_HOST: {
        label: 'Servidor SMTP',
        required: false,
        minLen: 4,
        maxLen: 253,
        pattern: /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        hint: 'Dominio del servidor de correo saliente (ej. smtp.gmail.com o smtp.office365.com).'
    },
    SMTP_PORT: {
        label: 'Puerto SMTP',
        required: false,
        minLen: 2,
        maxLen: 5,
        pattern: /^\d{2,5}$/,
        hint: 'Puerto SMTP estándar: 587 (STARTTLS) o 465 (SSL).',
        custom: (v) => {
            const n = Number(v);
            if (![25, 465, 587, 2525].includes(n)) return 'Usa un puerto SMTP estándar (587, 465, 2525 o 25).';
            return null;
        }
    },
    SMTP_USER: {
        label: 'Usuario / Correo SMTP',
        required: false,
        minLen: 5,
        maxLen: 180,
        pattern: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
        hint: 'Cuenta emisora de correos (ej. notificaciones.unid@gmail.com).'
    },
    SMTP_PASS: {
        label: 'Contraseña / App Password SMTP',
        required: false,
        minLen: 8,
        maxLen: 128,
        noNewlines: true,
        hint: 'Para Gmail usa una Contraseña de Aplicación de 16 caracteres (sin espacios).'
    },
    ADMISSIONS_NOTIFICATION_EMAIL: {
        label: 'Correo Destino de Admisiones',
        required: false,
        minLen: 6,
        maxLen: 180,
        pattern: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
        hint: 'Buzón donde llegan los avisos de Nuevo Contacto, 11 Datos e Inscrito.'
    },
    ALERT_ADMIN_EMAIL: {
        label: 'Correo de Alertas Críticas (Life Support)',
        required: false,
        minLen: 6,
        maxLen: 180,
        pattern: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
        hint: 'Tu correo personal/TI para recibir alertas inmediatas si falla la IA o MariaDB.'
    }
};

function isPlaceholderValue(val) {
    if (!val || typeof val !== 'string') return false;
    return PLACEHOLDER_REGEX.test(val.trim());
}

function validateField(key, rawValue, opts = {}) {
    const rule = CREDENTIAL_RULES[key];
    if (!rule) return null;

    const val = rawValue === undefined || rawValue === null ? '' : String(rawValue).trim();
    const isRequired = opts.forceRequired !== undefined ? opts.forceRequired : rule.required;

    if (!val) {
        return isRequired ? `El campo "${rule.label}" es obligatorio.` : null;
    }

    if (isPlaceholderValue(val)) {
        return `"${rule.label}" contiene texto de ejemplo/placeholder. Ingresa tu valor real.`;
    }

    if (/[\r\n]/.test(String(rawValue))) {
        return `"${rule.label}" no puede contener saltos de línea.`;
    }

    if (rule.minLen && val.length < rule.minLen) {
        return `"${rule.label}" es demasiado corto (${val.length} caracteres; mínimo ${rule.minLen}). ${rule.hint}`;
    }

    if (rule.maxLen && val.length > rule.maxLen) {
        return `"${rule.label}" excede la longitud máxima (${val.length} caracteres; máximo ${rule.maxLen}).`;
    }

    if (rule.pattern && !rule.pattern.test(val)) {
        return `Formato inválido para "${rule.label}". ${rule.hint}`;
    }

    if (rule.custom) {
        const customErr = rule.custom(val);
        if (customErr) return customErr;
    }

    return null;
}

function validateSetupPayload(payload = {}) {
    const errors = {};
    const p = payload || {};

    const check = (key, forceRequired) => {
        const err = validateField(key, p[key], forceRequired !== undefined ? { forceRequired } : {});
        if (err) errors[key] = err;
    };

    // 1. Servidor y MariaDB
    check('PORT', true);
    check('DB_HOST', true);
    check('DB_PORT', true);
    check('DB_USER', true);
    check('DB_PASSWORD', false);
    check('DB_NAME', true);

    // 2. Motores IA (en nube + Ollama opcional)
    check('GEMINI_API_KEY', false);
    check('ANTHROPIC_API_KEY', false);
    check('OPENAI_API_KEY', false);
    check('DEEPSEEK_API_KEY', false);
    check('GROQ_API_KEY', false);

    const ollamaEnabled = Boolean(p.OLLAMA_ENABLED === true || p.OLLAMA_ENABLED === 'true');
    if (ollamaEnabled) {
        check('OLLAMA_BASE_URL', true);
        check('OLLAMA_MODEL', true);
        check('OLLAMA_API_KEY', false);
        check('OLLAMA_TIMEOUT_MS', true);
    }

    const hasCloudAI = ['GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'GROQ_API_KEY']
        .some(k => Boolean(p[k] && String(p[k]).trim() && !errors[k]));

    if (!hasCloudAI && !ollamaEnabled) {
        errors.AI_PROVIDERS = 'Debes configurar al menos un motor de IA válido (se recomienda Google Gemini) o habilitar Ollama local.';
    }

    // 3. Meta WhatsApp Cloud API (puede omitirse en modo simulador LAN)
    const skipWhatsApp = Boolean(p.SKIP_WHATSAPP === true || p.SKIP_WHATSAPP === 'true');
    check('META_VERIFY_TOKEN', true);
    check('META_APP_SECRET', false);
    if (!skipWhatsApp) {
        const hasPhone = Boolean(p.WHATSAPP_PHONE_NUMBER_ID && String(p.WHATSAPP_PHONE_NUMBER_ID).trim());
        const hasToken = Boolean(p.WHATSAPP_TOKEN && String(p.WHATSAPP_TOKEN).trim());
        if (hasPhone || hasToken) {
            check('WHATSAPP_PHONE_NUMBER_ID', true);
            check('WHATSAPP_TOKEN', true);
        } else {
            // Si no marcó omitir y dejó ambos vacíos, requerirlos o pedir que marque modo simulador
            errors.WHATSAPP_PHONE_NUMBER_ID = 'Ingresa tu Phone Number ID numérico o marca "Configurar WhatsApp después".';
            errors.WHATSAPP_TOKEN = 'Ingresa tu Access Token de Meta (EAA...) o marca "Configurar WhatsApp después".';
        }
    }

    // 4. Seguridad y Cuentas RBAC (si es reconfiguración de dev existente, la contraseña puede omitirse para conservar la actual)
    const isReconfigure = Boolean(p.IS_RECONFIGURE === true);
    check('JWT_SECRET', true);
    check('ENCRYPTION_MASTER_KEY', true);
    if (!isReconfigure) {
        check('DEV_EMAIL', true);
        check('DEV_NAME', true);
        check('DEV_PASSWORD', true);
    } else if (p.DEV_PASSWORD && String(p.DEV_PASSWORD).trim()) {
        check('DEV_PASSWORD', true);
    }

    if (p.ADMIN_SEDE_EMAIL && String(p.ADMIN_SEDE_EMAIL).trim()) {
        check('ADMIN_SEDE_EMAIL', true);
        check('ADMIN_SEDE_PASSWORD', true);
    }

    // 5. Correo SMTP y Alertas Life Support (opcional, pero consistente si se activa)
    check('ADMISSIONS_NOTIFICATION_EMAIL', false);
    check('ALERT_ADMIN_EMAIL', false);
    const anySmtp = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'].some(k => Boolean(p[k] && String(p[k]).trim()));
    if (anySmtp) {
        check('SMTP_HOST', true);
        check('SMTP_PORT', true);
        check('SMTP_USER', true);
        check('SMTP_PASS', true);
    }

    return {
        valid: Object.keys(errors).length === 0,
        errors
    };
}

function generateStrongHex(bytes = 32) {
    return crypto.randomBytes(bytes).toString('hex');
}

function generateStrongPassword(length = 20) {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghijkmnopqrstuvwxyz';
    const digits = '23456789';
    const symbols = '!@#$%&*+-=?';
    const all = upper + lower + digits + symbols;

    const pick = (charset) => charset[crypto.randomInt(0, charset.length)];
    const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
    for (let i = chars.length; i < Math.max(12, length); i++) {
        chars.push(pick(all));
    }
    // Fisher-Yates shuffle con crypto.randomInt
    for (let i = chars.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
}

function sanitizeEnvValue(val) {
    if (val === undefined || val === null) return '';
    return String(val).replace(/[\r\n]/g, '').trim();
}

function buildEnvFileContent(cfg = {}) {
    const v = (key, fallback = '') => sanitizeEnvValue(cfg[key] !== undefined && cfg[key] !== null ? cfg[key] : fallback);
    const ollamaOn = (cfg.OLLAMA_ENABLED === true || cfg.OLLAMA_ENABLED === 'true') ? 'true' : 'false';

    return [
        '# ==========================================================',
        '# :UNID • Metal-Uriel Admissions Bot (Configuración Activa)',
        `# Generado por el Asistente de Instalación: ${new Date().toISOString()}`,
        '# CRÍTICO: Este archivo contiene secretos reales. NUNCA subir a GitHub.',
        '# ==========================================================',
        '',
        '# Estado de Instalación Plug & Play',
        'SETUP_COMPLETED=true',
        `NODE_ENV=${v('NODE_ENV', 'production')}`,
        `HOST=${v('HOST', '0.0.0.0')}`,
        `PORT=${v('PORT', '3000')}`,
        `PRIMARY_CAMPUS=${v('PRIMARY_CAMPUS', 'campeche')}`,
        '',
        '# ==========================================================',
        '# Base de Datos MariaDB',
        '# ==========================================================',
        `DB_HOST=${v('DB_HOST', 'localhost')}`,
        `DB_PORT=${v('DB_PORT', '3306')}`,
        `DB_USER=${v('DB_USER', 'root')}`,
        `DB_PASSWORD=${v('DB_PASSWORD', '')}`,
        `DB_NAME=${v('DB_NAME', 'unid_admisiones')}`,
        '',
        '# ==========================================================',
        '# Motores de Inteligencia Artificial (Cascada Multi-Proveedor)',
        '# ==========================================================',
        `DEFAULT_AI_MODEL=${v('DEFAULT_AI_MODEL', 'auto-fallback')}`,
        `GEMINI_API_KEY=${v('GEMINI_API_KEY', '')}`,
        `ANTHROPIC_API_KEY=${v('ANTHROPIC_API_KEY', '')}`,
        `OPENAI_API_KEY=${v('OPENAI_API_KEY', '')}`,
        `DEEPSEEK_API_KEY=${v('DEEPSEEK_API_KEY', '')}`,
        `GROQ_API_KEY=${v('GROQ_API_KEY', '')}`,
        '',
        '# ==========================================================',
        '# Ollama Local (Último Recurso Opcional en Cascada)',
        '# Recomendado SOLO si la PC tiene >= 8 GB RAM libre suficiente',
        '# ==========================================================',
        `OLLAMA_ENABLED=${ollamaOn}`,
        `OLLAMA_BASE_URL=${v('OLLAMA_BASE_URL', 'http://127.0.0.1:11434')}`,
        `OLLAMA_MODEL=${v('OLLAMA_MODEL', 'qwen2.5:3b')}`,
        `OLLAMA_API_KEY=${v('OLLAMA_API_KEY', '')}`,
        `OLLAMA_TIMEOUT_MS=${v('OLLAMA_TIMEOUT_MS', '15000')}`,
        '',
        '# ==========================================================',
        '# Meta WhatsApp Cloud API (Meta Developers)',
        '# ==========================================================',
        `META_VERIFY_TOKEN=${v('META_VERIFY_TOKEN', '')}`,
        `META_APP_SECRET=${v('META_APP_SECRET', '')}`,
        `WHATSAPP_PHONE_NUMBER_ID=${v('WHATSAPP_PHONE_NUMBER_ID', '')}`,
        `WHATSAPP_TOKEN=${v('WHATSAPP_TOKEN', '')}`,
        '',
        '# ==========================================================',
        '# Criptografía, Sesiones JWT y Bóveda AES-256-GCM',
        '# ==========================================================',
        `JWT_SECRET=${v('JWT_SECRET', generateStrongHex(32))}`,
        `ENCRYPTION_MASTER_KEY=${v('ENCRYPTION_MASTER_KEY', generateStrongHex(32))}`,
        '',
        '# ==========================================================',
        '# Correo SMTP y Alertas Críticas ("Life Support")',
        '# ==========================================================',
        `ADMISSIONS_NOTIFICATION_EMAIL=${v('ADMISSIONS_NOTIFICATION_EMAIL', '')}`,
        `ALERT_ADMIN_EMAIL=${v('ALERT_ADMIN_EMAIL', v('ADMISSIONS_NOTIFICATION_EMAIL', ''))}`,
        `SMTP_HOST=${v('SMTP_HOST', '')}`,
        `SMTP_PORT=${v('SMTP_PORT', '587')}`,
        `SMTP_USER=${v('SMTP_USER', '')}`,
        `SMTP_PASS=${v('SMTP_PASS', '')}`,
        ''
    ].join('\n');
}

function getSystemHardwareReport(port = 3000) {
    const totalMemGB = +(os.totalmem() / (1024 ** 3)).toFixed(2);
    const freeMemGB = +(os.freemem() / (1024 ** 3)).toFixed(2);
    const cpus = os.cpus() || [];
    const cpuModel = cpus[0]?.model || 'Desconocido';
    const cpuCores = cpus.length || 1;

    const lanUrls = [];
    const nets = os.networkInterfaces();
    for (const ifaceName of Object.keys(nets)) {
        for (const net of nets[ifaceName] || []) {
            if (net.family === 'IPv4' && !net.internal) {
                lanUrls.push(`http://${net.address}:${port}`);
            }
        }
    }

    let ollamaRecommendation = 'not_recommended';
    let ollamaNote = `Hardware detectado: ${totalMemGB} GB RAM total (${freeMemGB} GB libre). Menos de 7.5 GB totales: NO se recomienda activar Ollama en este equipo; usa Gemini 3.8 Flash + respaldo en nube.`;
    if (totalMemGB >= 14) {
        ollamaRecommendation = 'ok_medium';
        ollamaNote = `Hardware detectado: ${totalMemGB} GB RAM total (${freeMemGB} GB libre). Puedes habilitar Ollama como último recurso con modelos 3B–7B (ej. qwen2.5:3b o llama3.2:3b).`;
    } else if (totalMemGB >= 7.5) {
        ollamaRecommendation = 'caution_tiny';
        ollamaNote = `Hardware detectado: ${totalMemGB} GB RAM total (${freeMemGB} GB libre). Equipo modesto: si pruebas Ollama, usa SOLO modelos ligeros <= 3B (qwen2.5:3b o llama3.2:3b) como último recurso con timeout <= 15s y monitorea RAM.`;
    }

    return {
        platform: `${os.type()} ${os.release()} (${os.arch()})`,
        hostname: os.hostname(),
        cpuModel,
        cpuCores,
        totalMemGB,
        freeMemGB,
        lanUrls,
        ollamaRecommendation,
        ollamaNote
    };
}

module.exports = {
    CREDENTIAL_RULES,
    isPlaceholderValue,
    validateField,
    validateSetupPayload,
    generateStrongHex,
    generateStrongPassword,
    buildEnvFileContent,
    getSystemHardwareReport
};
