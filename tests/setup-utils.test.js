const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const setupUtils = require('../lib/setup-utils');

describe('lib/setup-utils — Validación estricta de credenciales Plug & Play', () => {
    it('acepta formatos reales de API Keys y rechaza formatos inválidos o placeholders', () => {
        // Google Gemini (AIza..., 35-55 chars)
        assert.equal(setupUtils.validateField('GEMINI_API_KEY', 'AIzaSyD1234567890abcdefGHIJKLMNOPQRSTUV'), null);
        assert.match(setupUtils.validateField('GEMINI_API_KEY', 'sk-proj-not-gemini-key-12345678901234567890'), /Formato inválido/);
        assert.match(setupUtils.validateField('GEMINI_API_KEY', 'AIza_tu_api_key_placeholder_12345678901234'), /placeholder/i);

        // WhatsApp Phone Number ID (EXACTAMENTE solo dígitos, 10-20)
        assert.equal(setupUtils.validateField('WHATSAPP_PHONE_NUMBER_ID', '1332834883256423', { forceRequired: true }), null);
        assert.match(setupUtils.validateField('WHATSAPP_PHONE_NUMBER_ID', '+529811234567', { forceRequired: true }), /Formato inválido/);
        assert.match(setupUtils.validateField('WHATSAPP_PHONE_NUMBER_ID', 'abc1234567890', { forceRequired: true }), /Formato inválido/);
        assert.match(setupUtils.validateField('WHATSAPP_PHONE_NUMBER_ID', '12345', { forceRequired: true }), /demasiado corto/);

        // WhatsApp Access Token (inicia con EAA, 80-500 chars)
        const validWaToken = 'EAA' + 'A1b2C3d4E5'.repeat(10);
        assert.equal(setupUtils.validateField('WHATSAPP_TOKEN', validWaToken, { forceRequired: true }), null);
        assert.match(setupUtils.validateField('WHATSAPP_TOKEN', 'BAD_TOKEN_' + 'a'.repeat(90), { forceRequired: true }), /Formato inválido/);

        // Meta App Secret (32-64 chars hex, opcional)
        assert.equal(setupUtils.validateField('META_APP_SECRET', ''), null);
        assert.equal(setupUtils.validateField('META_APP_SECRET', 'a1b2c3d4e5f60718293a4b5c6d7e8f90'), null);
        assert.match(setupUtils.validateField('META_APP_SECRET', 'not-hex-zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'), /Formato inválido/);
    });

    it('exige complejidad fuerte en contraseñas RBAC y rechaza saltos de línea', () => {
        assert.equal(setupUtils.validateField('DEV_PASSWORD', 'Unid#2026Secure!'), null);
        assert.match(setupUtils.validateField('DEV_PASSWORD', 'admin'), /demasiado corto/);
        assert.match(setupUtils.validateField('DEV_PASSWORD', 'solominusculas123'), /Formato inválido/);
        assert.match(setupUtils.validateField('DB_HOST', 'localhost\nINJECTED=1'), /saltos de línea/);
    });

    it('valida payload completo del wizard (modo simulador y modo producción)', () => {
        const strongSecret = setupUtils.generateStrongHex(32);
        const strongKey = setupUtils.generateStrongHex(32);

        const validPayload = {
            PORT: '3000',
            DB_HOST: 'localhost',
            DB_PORT: '3306',
            DB_USER: 'root',
            DB_PASSWORD: 'MyStrongDbPass#2026',
            DB_NAME: 'unid_admisiones',
            GEMINI_API_KEY: 'AIzaSyD1234567890abcdefGHIJKLMNOPQRSTUV',
            SKIP_WHATSAPP: true,
            META_VERIFY_TOKEN: 'unid_verify_token_2026',
            META_APP_SECRET: '0123456789abcdef0123456789abcdef',
            JWT_SECRET: strongSecret,
            ENCRYPTION_MASTER_KEY: strongKey,
            DEV_EMAIL: '00774343@red.unid.mx',
            DEV_NAME: 'Luis Felipe Quintero',
            DEV_PASSWORD: setupUtils.generateStrongPassword(20)
        };

        const res = setupUtils.validateSetupPayload(validPayload);
        assert.equal(res.valid, true, JSON.stringify(res.errors));

        // Sin ningún proveedor de IA debe fallar
        const noAiRes = setupUtils.validateSetupPayload({ ...validPayload, GEMINI_API_KEY: '' });
        assert.equal(noAiRes.valid, false);
        assert.ok(noAiRes.errors.AI_PROVIDERS);
    });

    it('construye contenido .env limpio sin inyección de saltos de línea', () => {
        const envText = setupUtils.buildEnvFileContent({
            PORT: '3000',
            DB_HOST: 'localhost',
            META_VERIFY_TOKEN: 'verify_12345678',
            META_APP_SECRET: '0123456789abcdef0123456789abcdef',
            GEMINI_API_KEY: 'AIzaSyD1234567890abcdefGHIJKLMNOPQRSTUV\nEVIL=1'
        });
        assert.match(envText, /^SETUP_COMPLETED=true$/m);
        assert.match(envText, /^META_APP_SECRET=0123456789abcdef0123456789abcdef$/m);
        assert.doesNotMatch(envText, /^EVIL=1$/m);
    });
});
