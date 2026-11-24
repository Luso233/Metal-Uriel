process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_for_metal_uriel_ci_suite_2026_64chars_minimum';
process.env.ENCRYPTION_MASTER_KEY = 'test_aes_master_key_for_metal_uriel_ci_suite_2026_64chars_min';
process.env.META_APP_SECRET = '0123456789abcdef0123456789abcdef';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

const securityUtils = require('../lib/security-utils');
const setupUtils = require('../lib/setup-utils');
const chatAuditUtils = require('../lib/chat-audit-utils');
const zipBuilder = require('../lib/zip-builder');
const serverMod = require('../index');

describe('lib/security-utils — HMAC Meta, Guardrails JSON, Geografía y RAM GC', () => {
    it('valida firmas HMAC-SHA256 (X-Hub-Signature-256) correctamente y rechaza alteraciones', () => {
        const secret = '0123456789abcdef0123456789abcdef';
        const rawBody = Buffer.from(JSON.stringify({ object: 'whatsapp_business_account', entry: [] }), 'utf8');
        const validSig = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

        assert.equal(securityUtils.verifyMetaSignature(rawBody, validSig, secret).valid, true);
        assert.equal(securityUtils.verifyMetaSignature(rawBody, 'sha256=' + '0'.repeat(64), secret).valid, false);
        assert.equal(securityUtils.verifyMetaSignature(rawBody, '', secret).valid, false);
        assert.equal(securityUtils.verifyMetaSignature(Buffer.from('{"tampered":true}'), validSig, secret).valid, false);

        // Modo sandbox (sin META_APP_SECRET configurado) permite tráfico local sin romper
        const sandbox = securityUtils.verifyMetaSignature(rawBody, '', '');
        assert.equal(sandbox.valid, true);
        assert.equal(sandbox.enforced, false);
    });

    it('aplica la regla de enrutamiento geográfico Campeche vs UNID Online Nacional', () => {
        const localLead = securityUtils.enforceGeographicRule({
            nombre_completo: 'Carlos Alpuche Canul',
            codigo_postal: '24000',
            direccion: 'Calle 12, Col. Centro, Campeche'
        });
        assert.equal(localLead.es_foraneo, false);
        assert.match(localLead.campus_interes, /Campeche/i);

        const foreignLead = securityUtils.enforceGeographicRule({
            nombre_completo: 'Valeria Méndez Cruz',
            codigo_postal: '86000',
            direccion: 'Villahermosa, Tabasco',
            campus_interes: 'San Francisco de Campeche',
            modalidad_estudios: 'Presencial'
        });
        assert.equal(foreignLead.es_foraneo, true);
        assert.match(foreignLead.modalidad_estudios, /Online/i);
        assert.match(foreignLead.campus_interes, /Online/i);
    });

    it('sanitiza JSON estructurado anti-alucinaciones y normaliza fechas/correos/CP', () => {
        const res = securityUtils.validateStructuredLeadJson({
            completado: true,
            nombre_completo: 'Elvira Rosales Tun',
            fecha_nacimiento: '15/09/2003',
            correo_electronico: 'no-es-correo',
            codigo_postal: '24040',
            bachillerato_procedencia: 'N/A',
            carrera_interes: 'Licenciatura en Derecho',
            nivel_interes: 'muy medio'
        });

        assert.equal(res.valid, true);
        assert.equal(res.data.fecha_nacimiento, '2003-09-15');
        assert.equal(res.data.correo_electronico, null);
        assert.equal(res.data.bachillerato_procedencia, null);
        assert.equal(res.data.nivel_interes, 'Medio');
        assert.equal(res.data.es_foraneo, false);
        assert.ok(res.warnings.length >= 1);
    });

    it('limpia sesiones inactivas > 24h en RAM preservando sesiones en control humano (isPaused)', () => {
        const now = Date.now();
        const oldTs = now - (26 * 60 * 60 * 1000);
        const recentTs = now - (5 * 60 * 1000);

        const conv = new Map([
            ['5219810000001', [{ role: 'user', content: 'hola', timestamp: new Date(oldTs) }]],
            ['5219810000002', [{ role: 'user', content: 'sigo aqui', timestamp: new Date(recentTs) }]],
            ['5219810000003', [{ role: 'user', content: 'asesor humano', timestamp: new Date(oldTs) }]]
        ]);
        const sess = new Map([
            ['5219810000001', { isRegistered: false, isPaused: false, lastActivityAt: oldTs }],
            ['5219810000002', { isRegistered: false, isPaused: false, lastActivityAt: recentTs }],
            ['5219810000003', { isRegistered: false, isPaused: true, lastActivityAt: oldTs }]
        ]);
        const dedup = new Set(['m1', 'm2', 'm3', 'm4', 'm5']);

        const stats = securityUtils.cleanupMemoryMaps(conv, sess, dedup, {
            now,
            ttlMs: 24 * 60 * 60 * 1000,
            maxSessions: 100,
            maxProcessedIds: 3
        });

        assert.equal(conv.has('5219810000001'), false);
        assert.equal(sess.has('5219810000001'), false);
        assert.equal(conv.has('5219810000002'), true);
        assert.equal(sess.has('5219810000003'), true); // preservado por isPaused
        assert.equal(dedup.size, 3);
        assert.equal(stats.evictedMessageIds, 2);
    });

    it('estima tokens y costo MXN (Ollama siempre $0)', () => {
        const tokens = securityUtils.estimateTokens('Hola Metal-Uriel, quiero información sobre becas UNID');
        assert.ok(tokens > 5);
        assert.equal(securityUtils.estimateCostMxn('Ollama Local', 'qwen2.5:3b', 1000, 500), 0);
        assert.ok(securityUtils.estimateCostMxn('Google Gemini', 'gemini-3.8-flash', 1000, 500) > 0);
    });
});

describe('Dominio Metal-Uriel — CURP RENAPO, Criptografía AES/scrypt y Circuit Breaker', () => {
    it('calcula CURP RENAPO de 18 caracteres con filtro de palabras inconvenientes', () => {
        const curpNormal = serverMod.generarCurp({
            nombre_completo: 'Carlos Alpuche Canul',
            fecha_nacimiento: '2004-05-15',
            sexo: 'Masculino',
            estado_nacimiento: 'Campeche'
        });
        assert.equal(curpNormal.length, 18);
        assert.match(curpNormal, /^[A-Z]{4}040515HCC[A-Z]{3}[0-9A-Z]{2}$/);

        const curpCensored = serverMod.generarCurp({
            nombre_completo: 'Ana Baca Castillo',
            fecha_nacimiento: '2002-01-10',
            sexo: 'Femenino',
            estado_nacimiento: 'Yucatán'
        });
        assert.equal(curpCensored.length, 18);
        assert.ok(curpCensored.startsWith('BXCA'), `Esperado inicio BXCA, obtenido ${curpCensored}`);
    });

    it('extrae JSON de respuestas LLM y limpia etiquetas técnicas [ADJUNTAR_RECURSO]', () => {
        const raw = '¡Listo! Aquí va tu plan [ADJUNTAR_RECURSO: derecho]\n```json\n{"completado": true, "nombre_completo": "Juan Pérez", "carrera_interes": "Derecho"}\n```';
        const { cleanReply, jsonData } = serverMod.extractJsonFromLlmReply(raw);
        assert.equal(jsonData.completado, true);
        assert.equal(jsonData.nombre_completo, 'Juan Pérez');
        assert.doesNotMatch(cleanReply, /ADJUNTAR_RECURSO|```/);
    });

    it('cifra y descifra secretos con AES-256-GCM y rechaza payload manipulado', () => {
        const secret = 'EAAG_super_secret_token_unid_2026';
        const enc = serverMod.encryptSecret(secret);
        assert.notEqual(enc, secret);
        assert.equal(serverMod.decryptSecret(enc), secret);
        assert.equal(serverMod.decryptSecret(enc.slice(0, -4) + 'ffff'), null);
    });

    it('hashea y verifica contraseñas con scrypt en tiempo constante', () => {
        const hashed = serverMod.hashPassword('UnidSecure#2026!');
        assert.ok(hashed.startsWith('scrypt:'));
        assert.equal(serverMod.verifyPassword('UnidSecure#2026!', hashed), true);
        assert.equal(serverMod.verifyPassword('wrong-password', hashed), false);
    });

    it('activa y consulta el Circuit Breaker de proveedores IA', () => {
        assert.equal(serverMod.isProviderInCooldown('test-provider'), false);
        serverMod.setProviderCooldown('test-provider', 1, 'HTTP 429 test');
        assert.equal(serverMod.isProviderInCooldown('test-provider'), true);
        assert.ok(serverMod.getProviderCooldownRemaining('test-provider') > 0);
    });
});

describe('Integración HTTP Express — Blindaje RBAC, Helmet y Firma HMAC Webhook', () => {
    let httpServer;
    let baseUrl;

    const signToken = (rol, sedeId = 'campeche') => jwt.sign(
        { id: 99, correo_institucional: `${rol}@red.unid.mx`, rol, role: rol, sede_id: sedeId },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );

    before((_, done) => {
        httpServer = serverMod.app.listen(0, '127.0.0.1', () => {
            const addr = httpServer.address();
            baseUrl = `http://127.0.0.1:${addr.port}`;
            done();
        });
    });

    after(async () => {
        if (httpServer) {
            await new Promise((resolve) => httpServer.close(resolve));
        }
        if (typeof serverMod.closePool === 'function') {
            try { await serverMod.closePool(); } catch (_) {}
        }
    });

    it('expone cabeceras Helmet y /api/health mínimo sin filtrar detalles internos', async () => {
        const res = await fetch(`${baseUrl}/api/health`);
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
        assert.equal(res.headers.get('x-powered-by'), null);
        const body = await res.json();
        assert.equal(body.status, 'online');
        assert.equal(body.webhookSignatureEnabled, true);
        assert.equal(body.dbError, undefined);
    });

    it('bloquea con 401 todos los endpoints críticos cuando falta el token JWT', async () => {
        const protectedCalls = [
            ['GET', '/api/aspirantes'],
            ['GET', '/api/aspirantes/export'],
            ['GET', '/api/tenants'],
            ['GET', '/api/conversations'],
            ['GET', '/api/analytics'],
            ['GET', '/api/health/full'],
            ['GET', '/api/prompt'],
            ['POST', '/api/chat'],
            ['POST', '/api/models/active'],
            ['DELETE', '/api/aspirantes/all']
        ];

        for (const [method, endpoint] of protectedCalls) {
            const res = await fetch(`${baseUrl}${endpoint}`, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: method === 'POST' ? JSON.stringify({}) : undefined
            });
            assert.equal(res.status, 401, `Se esperaba 401 en ${method} ${endpoint}, recibido ${res.status}`);
        }
    });

    it('aplica jerarquía RBAC estricta (usuario < administrador < desarrollador) y aislamiento de sede', async () => {
        const userTok = signToken('usuario', 'campeche');
        const adminTok = signToken('administrador', 'campeche');
        const devTok = signToken('desarrollador', null);

        // Usuario operativo no puede ver tenants, exportar ni borrar DB
        assert.equal((await fetch(`${baseUrl}/api/tenants`, { headers: { Authorization: `Bearer ${userTok}` } })).status, 403);
        assert.equal((await fetch(`${baseUrl}/api/aspirantes/export`, { headers: { Authorization: `Bearer ${userTok}` } })).status, 403);
        assert.equal((await fetch(`${baseUrl}/api/aspirantes/all`, { method: 'DELETE', headers: { Authorization: `Bearer ${userTok}` } })).status, 403);

        // Administrador de sede campeche no puede acceder a otra sede ni cambiar modelo global ni borrar DB
        assert.equal((await fetch(`${baseUrl}/api/tenants/cancun`, { headers: { Authorization: `Bearer ${adminTok}` } })).status, 403);
        assert.equal((await fetch(`${baseUrl}/api/models/active`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${adminTok}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelId: 'auto-fallback' })
        })).status, 403);
        assert.equal((await fetch(`${baseUrl}/api/aspirantes/all`, { method: 'DELETE', headers: { Authorization: `Bearer ${adminTok}` } })).status, 403);

        // Desarrollador tiene acceso total a modelos y prompt
        const modelsRes = await fetch(`${baseUrl}/api/models`, { headers: { Authorization: `Bearer ${devTok}` } });
        assert.equal(modelsRes.status, 200);
        const promptRes = await fetch(`${baseUrl}/api/prompt`, { headers: { Authorization: `Bearer ${devTok}` } });
        assert.equal(promptRes.status, 200);
    });

    it('rechaza POST /webhook sin firma HMAC válida (401) y acepta firma HMAC válida (200)', async () => {
        const payloadStr = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });

        const badRes = await fetch(`${baseUrl}/webhook`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Hub-Signature-256': 'sha256=' + 'f'.repeat(64)
            },
            body: payloadStr
        });
        assert.equal(badRes.status, 401);

        const validSig = 'sha256=' + crypto
            .createHmac('sha256', process.env.META_APP_SECRET)
            .update(Buffer.from(payloadStr, 'utf8'))
            .digest('hex');

        const okRes = await fetch(`${baseUrl}/webhook`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Hub-Signature-256': validSig
            },
            body: payloadStr
        });
        assert.equal(okRes.status, 200);
        assert.equal(await okRes.text(), 'EVENT_RECEIVED');
    });

    it('responde JSON 200 (sin 500 HTML) en /api/settings/smtp y /api/notifications/history y soporta CORS APK + /export-zip', async () => {
        const devTok = signToken('desarrollador', null);

        const smtpRes = await fetch(`${baseUrl}/api/settings/smtp`, { headers: { Authorization: `Bearer ${devTok}` } });
        assert.equal(smtpRes.status, 200);
        const smtpJson = await smtpRes.json();
        assert.equal(smtpJson.success, true);
        assert.ok(smtpJson.smtp.targetEmail);

        const histNotifRes = await fetch(`${baseUrl}/api/notifications/history`, { headers: { Authorization: `Bearer ${devTok}` } });
        assert.equal(histNotifRes.status, 200);
        const histNotifJson = await histNotifRes.json();
        assert.equal(histNotifJson.success, true);

        const preflight = await fetch(`${baseUrl}/api/health`, {
            method: 'OPTIONS',
            headers: { Origin: 'https://localhost', 'Access-Control-Request-Method': 'GET' }
        });
        assert.equal(preflight.status, 204);
        assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://localhost');

        const zipRes = await fetch(`${baseUrl}/api/conversations/5219818194049/export-zip`, {
            headers: { Authorization: `Bearer ${devTok}` }
        });
        assert.equal(zipRes.status, 200);
        assert.match(zipRes.headers.get('content-type') || '', /application\/zip/i);
        const buf = Buffer.from(await zipRes.arrayBuffer());
        assert.equal(buf[0], 0x50);
        assert.equal(buf[1], 0x4b);
    });
});

describe('Auditoría Eterna de Chats, Deduplicación Canónica, ZIP y Filtro VirtualBox', () => {
    it('unifica variantes telefónicas MX/WhatsApp a una clave canónica única', () => {
        const variants = ['5219818194049', '+52 1 981 819 4049', '+52 981 819 4049', '529818194049', '981-819-4049'];
        const normalized = new Set(variants.map(chatAuditUtils.normalizePhoneCanonical));
        assert.equal(normalized.size, 1);
        assert.equal(Array.from(normalized)[0], '9818194049');
    });

    it('detecta conversaciones inconclusas y resguarda Casos de Éxito (Inscritos)', () => {
        const now = Date.now();
        const oldIso = new Date(now - 3 * 60 * 60 * 1000).toISOString();
        const inc = chatAuditUtils.analyzeLeadCompleteness(
            { nombre_completo: 'Prospecto WhatsApp (5219811112233)', carrera_interes: 'Derecho', estado_prospecto: 'nuevo' },
            [{ sender: 'user', text: 'Hola', timestamp: oldIso }],
            { now }
        );
        assert.equal(inc.isIncomplete, true);
        assert.equal(inc.urgency, 'alta');
        assert.match(inc.stalledLabel, /3h/);

        const win = chatAuditUtils.analyzeLeadCompleteness(
            { nombre_completo: 'Carlos Alpuche', carrera_interes: 'Derecho', estado_prospecto: 'inscrito' },
            [{ sender: 'user', text: 'Listo', timestamp: oldIso }],
            { now }
        );
        assert.equal(win.isIncomplete, false);
        assert.match(win.aiSituationPreview, /Caso de Éxito/i);
    });

    it('genera ZIP válido estilo WhatsApp y filtra IPs VirtualBox 192.168.56.x', () => {
        const { zipBuffer, fileName } = zipBuilder.buildWhatsAppConversationZip({
            aspirante: { nombre_completo: 'María López', estado_prospecto: 'inscrito' },
            canonicalPhone: '9818194049',
            dialPhone: '5219818194049',
            messages: [{ rol: 'user', mensaje: 'Hola', timestamp: new Date().toISOString() }],
            completeness: { completedCount: 11, totalFields: 11, percent: 100 }
        });
        assert.match(fileName, /\.zip$/);
        assert.equal(zipBuffer.readUInt32LE(0), 0x04034b50);

        const hw = setupUtils.getSystemHardwareReport(3000);
        for (const u of hw.lanUrls) {
            assert.doesNotMatch(u, /192\.168\.56\./);
        }
    });
});
