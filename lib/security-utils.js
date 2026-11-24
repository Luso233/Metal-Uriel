const crypto = require('crypto');

// =========================================================================
// Metal-Uriel — Utilidades de Seguridad, Guardrails, Costos LLM y RAM TTL
// =========================================================================

// Tarifas aproximadas por millón de tokens (USD) convertidas a MXN (~18.5 MXN/USD)
const USD_TO_MXN = 18.5;
const MODEL_PRICING_USD_PER_1M = {
    'gemini-3.8-flash': { in: 0.15, out: 0.60 },
    'gemini-3.5-flash-lite': { in: 0.075, out: 0.30 },
    'gemini-4-argon': { in: 1.25, out: 5.00 },
    'claude-3-5-haiku-20241022': { in: 0.80, out: 4.00 },
    'claude-3-5-sonnet-20241022': { in: 3.00, out: 15.00 },
    'gpt-4o-mini': { in: 0.15, out: 0.60 },
    'gpt-4o': { in: 2.50, out: 10.00 },
    'deepseek-chat': { in: 0.27, out: 1.10 },
    'llama-3.3-70b-versatile': { in: 0.59, out: 0.79 },
    'ollama-local': { in: 0, out: 0 }
};

/**
 * Verificación criptográfica HMAC-SHA256 de firma Meta Webhook (X-Hub-Signature-256)
 * usando comparación en tiempo constante (crypto.timingSafeEqual).
 */
function verifyMetaSignature(rawBodyBuffer, signatureHeader, appSecret) {
    if (!appSecret || typeof appSecret !== 'string' || !appSecret.trim()) {
        return { valid: true, enforced: false, reason: 'META_APP_SECRET no configurado (modo sandbox)' };
    }
    if (!signatureHeader || typeof signatureHeader !== 'string' || !signatureHeader.startsWith('sha256=')) {
        return { valid: false, enforced: true, reason: 'Cabecera X-Hub-Signature-256 ausente o malformada' };
    }
    if (!rawBodyBuffer || (!Buffer.isBuffer(rawBodyBuffer) && typeof rawBodyBuffer !== 'string')) {
        return { valid: false, enforced: true, reason: 'Raw body no disponible para validar HMAC' };
    }

    const receivedHex = signatureHeader.slice('sha256='.length).trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(receivedHex)) {
        return { valid: false, enforced: true, reason: 'Formato hexadecimal de firma SHA-256 inválido' };
    }

    const expectedHex = crypto
        .createHmac('sha256', appSecret.trim())
        .update(rawBodyBuffer)
        .digest('hex');

    const a = Buffer.from(receivedHex, 'hex');
    const b = Buffer.from(expectedHex, 'hex');
    if (a.length !== b.length) {
        return { valid: false, enforced: true, reason: 'Longitud de digest HMAC incompatible' };
    }

    const match = crypto.timingSafeEqual(a, b);
    return {
        valid: match,
        enforced: true,
        reason: match ? 'Firma HMAC-SHA256 verificada' : 'Firma X-Hub-Signature-256 inválida'
    };
}

/**
 * Estimador ligero de tokens (~4 caracteres por token en español)
 */
function estimateTokens(textOrMessages) {
    if (!textOrMessages) return 0;
    if (Array.isArray(textOrMessages)) {
        const totalChars = textOrMessages.reduce((acc, m) => acc + String(m?.content || m || '').length, 0);
        return Math.max(1, Math.ceil(totalChars / 4));
    }
    const str = String(textOrMessages);
    return Math.max(1, Math.ceil(str.length / 4));
}

/**
 * Estimador de costo en MXN por inferencia LLM
 */
function estimateCostMxn(provider, model, tokensIn = 0, tokensOut = 0) {
    if (String(provider || '').toLowerCase().includes('ollama')) return 0;
    const rate = MODEL_PRICING_USD_PER_1M[model] || { in: 0.25, out: 0.80 };
    const usd = (tokensIn / 1_000_000) * rate.in + (tokensOut / 1_000_000) * rate.out;
    return Number((usd * USD_TO_MXN).toFixed(6));
}

/**
 * Recolector de basura 24/7 para mapas en RAM (conversationMemory, userSessionState, processedMessageIds)
 * Evita fugas de memoria en PCs de 8 GB RAM corriendo de forma ininterrumpida.
 */
function cleanupMemoryMaps(conversationMemory, userSessionState, processedMessageIds, opts = {}) {
    const now = opts.now || Date.now();
    const ttlMs = opts.ttlMs || (24 * 60 * 60 * 1000); // 24 horas por defecto
    const maxSessions = opts.maxSessions || 1000;
    const maxProcessedIds = opts.maxProcessedIds || 2000;

    let evictedConversations = 0;
    let evictedSessions = 0;
    let evictedMessageIds = 0;

    // 1. Evictar conversaciones inactivas > ttlMs
    if (conversationMemory && typeof conversationMemory.entries === 'function') {
        const datedKeys = [];
        for (const [phone, history] of conversationMemory.entries()) {
            const session = userSessionState ? userSessionState.get(phone) : null;
            const lastMsg = Array.isArray(history) && history.length > 0 ? history[history.length - 1] : null;
            const lastTs = Math.max(
                session?.lastActivityAt ? new Date(session.lastActivityAt).getTime() : 0,
                lastMsg?.timestamp ? new Date(lastMsg.timestamp).getTime() : 0
            );
            if (lastTs > 0 && (now - lastTs) > ttlMs) {
                conversationMemory.delete(phone);
                evictedConversations++;
                if (userSessionState && userSessionState.has(phone) && !session?.isPaused) {
                    userSessionState.delete(phone);
                    evictedSessions++;
                }
            } else {
                datedKeys.push({ phone, lastTs: lastTs || now });
            }
        }

        // 2. Si excede el tope máximo de sesiones simultáneas, eliminar las más antiguas (LRU)
        if (datedKeys.length > maxSessions) {
            datedKeys.sort((a, b) => a.lastTs - b.lastTs);
            const excess = datedKeys.length - maxSessions;
            for (let i = 0; i < excess; i++) {
                const target = datedKeys[i].phone;
                conversationMemory.delete(target);
                evictedConversations++;
                if (userSessionState && userSessionState.has(target)) {
                    const s = userSessionState.get(target);
                    if (!s?.isPaused) {
                        userSessionState.delete(target);
                        evictedSessions++;
                    }
                }
            }
        }
    }

    // 3. Limpiar entradas huérfanas viejas de userSessionState (sin borrar sesiones pausadas manualmente)
    if (userSessionState && typeof userSessionState.entries === 'function') {
        for (const [phone, session] of userSessionState.entries()) {
            if (session?.isPaused) continue;
            const lastTs = session?.lastActivityAt
                ? new Date(session.lastActivityAt).getTime()
                : (session?.registeredAt ? new Date(session.registeredAt).getTime() : 0);
            if (lastTs > 0 && (now - lastTs) > ttlMs && (!conversationMemory || !conversationMemory.has(phone))) {
                userSessionState.delete(phone);
                evictedSessions++;
            }
        }
    }

    // 4. Acotar Set de deduplicación de mensajes de WhatsApp
    if (processedMessageIds && typeof processedMessageIds.size === 'number') {
        while (processedMessageIds.size > maxProcessedIds) {
            const first = processedMessageIds.values().next().value;
            processedMessageIds.delete(first);
            evictedMessageIds++;
        }
    }

    return {
        evictedConversations,
        evictedSessions,
        evictedMessageIds,
        remainingConversations: conversationMemory ? conversationMemory.size : 0,
        remainingSessions: userSessionState ? userSessionState.size : 0,
        remainingMessageIds: processedMessageIds ? processedMessageIds.size : 0
    };
}

/**
 * Regla de Enrutamiento Geográfico UNID Campeche vs Online Nacional:
 * - CP 24000–24999 o dirección/estado en Campeche -> Local (es_foraneo: false)
 * - Otro estado o CP fuera de 24xxx (y campus no explícitamente presencial en Campeche) -> Foráneo / UNID Online
 */
function enforceGeographicRule(leadData = {}) {
    if (!leadData || typeof leadData !== 'object') return leadData;
    const out = { ...leadData };

    const cp = String(out.codigo_postal || '').replace(/\D/g, '');
    const dir = String(out.direccion || '').toLowerCase();
    const estado = String(out.estado_nacimiento || '').toLowerCase();
    const modalidad = String(out.modalidad_estudios || '').toLowerCase();
    const campus = String(out.campus_interes || '').toLowerCase();

    const isCampecheCp = cp.length === 5 && cp.startsWith('24');
    const isForeignCp = cp.length === 5 && !cp.startsWith('24');
    const mentionsCampecheAddress = /campeche|lerma|chin[aá]|champot[oó]n|escarcega|esc[aá]rcega|calkin[ií]|hecelchak[aá]n|tenabo|hopelch[eé]n|carmen/i.test(dir);
    const mentionsOtherStateAddress = /m[eé]rida|yucat[aá]n|canc[uú]n|quintana roo|villahermosa|tabasco|cdmx|ciudad de m[eé]xico|guadalajara|jalisco|monterrey|nuevo le[oó]n|puebla|veracruz|oaxaca|chiapas|tijuana|toluca|morelia|quer[eé]taro/i.test(dir);

    if (isForeignCp || (mentionsOtherStateAddress && !mentionsCampecheAddress && !isCampecheCp)) {
        out.es_foraneo = true;
        if (!modalidad.includes('online') && !modalidad.includes('virtual')) {
            out.modalidad_estudios = 'Licenciaturas Online';
        }
        if (!campus || campus.includes('san francisco de campeche') && !campus.includes('virtual') && !campus.includes('online')) {
            out.campus_interes = 'UNID Online Nacional (Virtual)';
        }
    } else if (isCampecheCp || mentionsCampecheAddress) {
        out.es_foraneo = false;
        if (!out.campus_interes) out.campus_interes = 'San Francisco de Campeche';
        if (!out.modalidad_estudios) out.modalidad_estudios = 'Presencial';
    } else if (out.es_foraneo === undefined) {
        out.es_foraneo = Boolean(
            modalidad.includes('online') ||
            modalidad.includes('virtual') ||
            (estado && !estado.includes('campeche') && !campus.includes('campeche'))
        );
    }

    return out;
}

/**
 * Guardrail Anti-Alucinaciones para el JSON estructurado emitido por el LLM.
 * Normaliza formatos, elimina valores basura ("N/A", "null", "desconocido") y aplica reglas geográficas.
 */
function validateStructuredLeadJson(rawJson) {
    if (!rawJson || typeof rawJson !== 'object' || Array.isArray(rawJson)) {
        return { valid: false, data: null, warnings: ['Payload JSON no es un objeto válido'] };
    }

    const warnings = [];
    const JUNK_RE = /^(n\/a|na|null|undefined|ninguno|ninguna|no especificado|no proporcionado|desconocido|pendiente|-+)$/i;

    const cleanStr = (val, maxLen = 255) => {
        if (val === undefined || val === null) return null;
        const s = String(val).trim();
        if (!s || JUNK_RE.test(s)) return null;
        return s.slice(0, maxLen);
    };

    const data = { ...rawJson };
    data.nombre_completo = cleanStr(data.nombre_completo, 255);
    data.fecha_nacimiento = cleanStr(data.fecha_nacimiento, 30);
    data.sexo = cleanStr(data.sexo, 30);
    data.estado_nacimiento = cleanStr(data.estado_nacimiento, 100);
    data.correo_electronico = cleanStr(data.correo_electronico, 255);
    data.bachillerato_procedencia = cleanStr(data.bachillerato_procedencia, 255);
    data.carrera_interes = cleanStr(data.carrera_interes, 255);
    data.direccion = cleanStr(data.direccion, 500);
    data.codigo_postal = cleanStr(data.codigo_postal, 10);
    data.campus_interes = cleanStr(data.campus_interes, 100);
    data.modalidad_estudios = cleanStr(data.modalidad_estudios, 100);
    data.resumen_ia = cleanStr(data.resumen_ia, 1000);

    // Validar correo electrónico si viene presente
    if (data.correo_electronico && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.correo_electronico)) {
        warnings.push(`Correo con formato dudoso descartado: ${data.correo_electronico}`);
        data.correo_electronico = null;
    }

    // Normalizar código postal a 5 dígitos si es posible
    if (data.codigo_postal) {
        const digits = data.codigo_postal.replace(/\D/g, '');
        if (digits.length === 5) {
            data.codigo_postal = digits;
        } else {
            warnings.push(`Código postal inválido descartado: ${data.codigo_postal}`);
            data.codigo_postal = null;
        }
    }

    // Normalizar fecha de nacimiento YYYY-MM-DD si viene DD/MM/YYYY
    if (data.fecha_nacimiento) {
        const dmy = data.fecha_nacimiento.match(/^(\d{1,2})[-/](\d{1,2})[-/]((19|20)\d{2})$/);
        if (dmy) {
            data.fecha_nacimiento = `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
        } else if (!/^\d{4}-\d{2}-\d{2}$/.test(data.fecha_nacimiento)) {
            warnings.push(`Fecha no ISO conservada como null: ${data.fecha_nacimiento}`);
            data.fecha_nacimiento = null;
        }
    }

    // Normalizar nivel de interés
    const rawInt = String(data.nivel_interes || '').toLowerCase();
    if (rawInt.includes('bajo')) data.nivel_interes = 'Bajo';
    else if (rawInt.includes('medio')) data.nivel_interes = 'Medio';
    else data.nivel_interes = 'Alto';

    const routed = enforceGeographicRule(data);
    const hasCoreIdentity = Boolean(routed.nombre_completo && routed.carrera_interes);

    return {
        valid: hasCoreIdentity || Boolean(routed.completado),
        data: routed,
        warnings
    };
}

module.exports = {
    verifyMetaSignature,
    estimateTokens,
    estimateCostMxn,
    cleanupMemoryMaps,
    enforceGeographicRule,
    validateStructuredLeadJson
};
