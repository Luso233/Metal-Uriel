const axios = require('axios');
const { GoogleGenAI } = require('@google/genai');
const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const { isValidApiKey, isOllamaConfigured, getActivePrompt } = require('../config/env');
const {
    conversationMemory,
    userSessionState,
    isProviderInCooldown,
    setProviderCooldown,
    getProviderCooldownRemaining,
    touchUserSession,
    incrementTotalConversations
} = require('../state/memory');
const { getActiveCicloEscolar, getActivePoolItems } = require('./pool.service');
const { enviarAlertaSistema, recordLlmTelemetry } = require('./mail.service');
const securityUtils = require('../../lib/security-utils');

let geminiClient = null;
let anthropicClient = null;
let openaiClient = null;
let deepseekClient = null;
let groqClient = null;
let globalActiveModelId = process.env.DEFAULT_AI_MODEL || 'auto-fallback';

const ALL_SUPPORTED_MODELS = [
    {
        id: 'auto-fallback',
        name: '🛡️ Cascada Inteligente (Alta Disponibilidad)',
        provider: 'auto',
        providerName: 'Auto-Fallback',
        icon: '🛡️',
        badge: 'Recomendado',
        description: 'Enruta automáticamente al mejor modelo disponible. Si uno agota su cuota (429/403), salta en milisegundos al siguiente sin interrupciones.',
        isConfigured: true
    },
    {
        id: 'gemini-3.8-flash',
        name: 'Google Gemini 3.8 Flash',
        provider: 'google',
        providerName: 'Google Gemini',
        icon: '⚡',
        badge: 'Estándar Oficial',
        description: 'Motor cognitivo principal de última generación, baja latencia y alta comprensión contextual.',
        isConfigured: isValidApiKey(process.env.GEMINI_API_KEY)
    },
    {
        id: 'gemini-3.5-flash-lite',
        name: 'Google Gemini 3.5 Flash Lite',
        provider: 'google',
        providerName: 'Google Gemini',
        icon: '✨',
        badge: 'Ultra Rápido',
        description: 'Ultra rápido y de alta capacidad de cuota para atención masiva en WhatsApp.',
        isConfigured: isValidApiKey(process.env.GEMINI_API_KEY)
    },
    {
        id: 'gemini-4-argon',
        name: 'Google Gemini 4 Argon',
        provider: 'google',
        providerName: 'Google Gemini',
        icon: '🧠',
        badge: 'Avanzado',
        description: 'Máxima capacidad de razonamiento lógico institucional de frontera.',
        isConfigured: isValidApiKey(process.env.GEMINI_API_KEY)
    },
    {
        id: 'claude-3-5-haiku-20241022',
        name: 'Anthropic Claude 3.5 Haiku',
        provider: 'anthropic',
        providerName: 'Anthropic Claude',
        icon: '🔮',
        badge: 'Económico',
        description: 'Modelo veloz de Anthropic con excelente fluidez en español.',
        isConfigured: isValidApiKey(process.env.ANTHROPIC_API_KEY)
    },
    {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Anthropic Claude 3.5 Sonnet',
        provider: 'anthropic',
        providerName: 'Anthropic Claude',
        icon: '💎',
        badge: 'Premium',
        description: 'Líder en razonamiento y generación estructurada de JSON.',
        isConfigured: isValidApiKey(process.env.ANTHROPIC_API_KEY)
    },
    {
        id: 'gpt-4o-mini',
        name: 'OpenAI GPT-4o-mini',
        provider: 'openai',
        providerName: 'OpenAI',
        icon: '🤖',
        badge: 'OpenAI',
        description: 'Modelo eficiente y estructurado de OpenAI.',
        isConfigured: isValidApiKey(process.env.OPENAI_API_KEY)
    },
    {
        id: 'gpt-4o',
        name: 'OpenAI GPT-4o',
        provider: 'openai',
        providerName: 'OpenAI',
        icon: '🎯',
        badge: 'Flagship',
        description: 'Modelo insignia de OpenAI para admisiones.',
        isConfigured: isValidApiKey(process.env.OPENAI_API_KEY)
    },
    {
        id: 'deepseek-chat',
        name: 'DeepSeek V3 (Chat)',
        provider: 'deepseek',
        providerName: 'DeepSeek',
        icon: '🐳',
        badge: 'Ultra Low Cost',
        description: 'Modelo de costo ultra bajo con gran capacidad analítica.',
        isConfigured: isValidApiKey(process.env.DEEPSEEK_API_KEY)
    },
    {
        id: 'llama-3.3-70b-versatile',
        name: 'Groq Llama 3.3 70B',
        provider: 'groq',
        providerName: 'Groq Cloud',
        icon: '⚡',
        badge: 'Ultra Rápido',
        description: 'Inferencia a velocidad ultra rápida en chips LPU.',
        isConfigured: isValidApiKey(process.env.GROQ_API_KEY)
    },
    {
        id: 'ollama-local',
        name: `Ollama Local (${(process.env.OLLAMA_MODEL || 'qwen2.5:3b').trim()})`,
        provider: 'ollama',
        providerName: 'Ollama Local',
        icon: '🦙',
        badge: 'Contingencia Local',
        description: 'Último eslabón local opcional sin consumo de tokens.',
        isConfigured: isOllamaConfigured()
    }
];

function initAiClients() {
    geminiClient = isValidApiKey(process.env.GEMINI_API_KEY) ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY.trim() }) : null;
    anthropicClient = isValidApiKey(process.env.ANTHROPIC_API_KEY) ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY.trim() }) : null;
    openaiClient = isValidApiKey(process.env.OPENAI_API_KEY) ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY.trim() }) : null;
    deepseekClient = isValidApiKey(process.env.DEEPSEEK_API_KEY) ? new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY.trim(), baseURL: 'https://api.deepseek.com' }) : null;
    groqClient = isValidApiKey(process.env.GROQ_API_KEY) ? new OpenAI({ apiKey: process.env.GROQ_API_KEY.trim(), baseURL: 'https://api.groq.com/openai/v1' }) : null;

    if (geminiClient) console.log('✨ [AI PROVIDER] Google Gemini activado.');
    if (anthropicClient) console.log('🧠 [AI PROVIDER] Anthropic Claude activado.');
    if (openaiClient) console.log('🤖 [AI PROVIDER] OpenAI activado.');
    if (deepseekClient) console.log('🐳 [AI PROVIDER] DeepSeek activado.');
    if (groqClient) console.log('⚡ [AI PROVIDER] Groq Llama activado.');
    if (isOllamaConfigured()) {
        console.log(`🦙 [AI PROVIDER] Ollama Local habilitado (${process.env.OLLAMA_BASE_URL} | modelo: ${process.env.OLLAMA_MODEL}).`);
    }

    const ollamaEntry = ALL_SUPPORTED_MODELS.find(m => m.provider === 'ollama');
    if (ollamaEntry) {
        const oModel = (process.env.OLLAMA_MODEL || 'qwen2.5:3b').trim();
        ollamaEntry.name = `Ollama Local (${oModel})`;
        ollamaEntry.isConfigured = isOllamaConfigured();
    }
}

initAiClients();

async function llamarAPI_Gemini(modelId, prompt, history) {
    if (!geminiClient || !isValidApiKey(process.env.GEMINI_API_KEY)) {
        throw new Error('Google Gemini no tiene API Key configurada.');
    }
    const legacyMap = {
        'gemini-2.5-flash': 'gemini-3.8-flash',
        'gemini-2.5-flash-lite': 'gemini-3.5-flash-lite',
        'gemini-2.5-pro': 'gemini-4-argon',
        'gemini-3.5-flash': 'gemini-3.8-flash',
        'gemini-3.6-flash': 'gemini-3.8-flash',
        'gemini-3.1-pro-preview': 'gemini-4-argon'
    };
    const normalizedId = legacyMap[modelId] || modelId;
    const primaryModel = (normalizedId && normalizedId.startsWith('gemini')) ? normalizedId : 'gemini-3.8-flash';
    const candidateModels = Array.from(new Set([primaryModel, 'gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-4-argon']));
    const geminiContents = history.map(h => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.content }] }));

    let lastErr = null;
    for (const targetModel of candidateModels) {
        try {
            const response = await geminiClient.models.generateContent({
                model: targetModel,
                contents: geminiContents,
                config: { systemInstruction: prompt, temperature: 0.7 }
            });
            const replyText = response.text ? response.text.trim() : '';
            if (replyText) return { reply: replyText, modelUsed: targetModel, provider: 'Google Gemini' };
        } catch (err) {
            lastErr = err;
            console.warn(`⚠️ [GEMINI SUB-FALLBACK] Modelo ${targetModel} no disponible (${err.message?.slice(0, 80)})`);
        }
    }
    throw lastErr || new Error('Respuesta vacía de Google Gemini.');
}

async function llamarAPI_Claude(modelId, prompt, history) {
    if (!anthropicClient || !isValidApiKey(process.env.ANTHROPIC_API_KEY)) {
        throw new Error('Anthropic Claude no tiene API Key configurada.');
    }
    const targetModel = modelId && modelId.startsWith('claude') ? modelId : 'claude-3-5-haiku-20241022';
    const response = await anthropicClient.messages.create({
        model: targetModel,
        max_tokens: 1000,
        system: prompt,
        messages: history.map(h => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content })),
        temperature: 0.7
    });
    const replyText = response.content?.[0]?.type === 'text' ? response.content[0].text.trim() : '';
    if (!replyText) throw new Error('Respuesta vacía de Anthropic Claude.');
    return { reply: replyText, modelUsed: targetModel, provider: 'Anthropic Claude' };
}

async function llamarAPI_OpenAI(modelId, prompt, history) {
    if (!openaiClient || !isValidApiKey(process.env.OPENAI_API_KEY)) {
        throw new Error('OpenAI no tiene API Key configurada.');
    }
    const targetModel = modelId && modelId.startsWith('gpt') ? modelId : 'gpt-4o-mini';
    const response = await openaiClient.chat.completions.create({
        model: targetModel,
        messages: [{ role: 'system', content: prompt }, ...history.map(h => ({ role: h.role, content: h.content }))],
        temperature: 0.7,
        max_tokens: 800
    });
    const replyText = response.choices[0]?.message?.content?.trim() || '';
    if (!replyText) throw new Error('Respuesta vacía de OpenAI.');
    return { reply: replyText, modelUsed: targetModel, provider: 'OpenAI' };
}

async function llamarAPI_DeepSeek(_modelId, prompt, history) {
    if (!deepseekClient || !isValidApiKey(process.env.DEEPSEEK_API_KEY)) {
        throw new Error('DeepSeek no tiene API Key configurada.');
    }
    const response = await deepseekClient.chat.completions.create({
        model: 'deepseek-chat',
        messages: [{ role: 'system', content: prompt }, ...history.map(h => ({ role: h.role, content: h.content }))],
        temperature: 0.7,
        max_tokens: 800
    });
    const replyText = response.choices[0]?.message?.content?.trim() || '';
    if (!replyText) throw new Error('Respuesta vacía de DeepSeek.');
    return { reply: replyText, modelUsed: 'deepseek-chat', provider: 'DeepSeek' };
}

async function llamarAPI_Groq(_modelId, prompt, history) {
    if (!groqClient || !isValidApiKey(process.env.GROQ_API_KEY)) {
        throw new Error('Groq no tiene API Key configurada.');
    }
    const response = await groqClient.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: prompt }, ...history.map(h => ({ role: h.role, content: h.content }))],
        temperature: 0.7,
        max_tokens: 800
    });
    const replyText = response.choices[0]?.message?.content?.trim() || '';
    if (!replyText) throw new Error('Respuesta vacía de Groq.');
    return { reply: replyText, modelUsed: 'llama-3.3-70b-versatile', provider: 'Groq Cloud' };
}

async function llamarAPI_Ollama(modelId, prompt, history) {
    if (!isOllamaConfigured()) throw new Error('Ollama Local está deshabilitado o sin configurar.');
    const baseUrl = String(process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
    const targetModel = (modelId && modelId !== 'ollama-local') ? modelId : String(process.env.OLLAMA_MODEL || 'qwen2.5:3b').trim();
    const timeoutMs = Math.min(60000, Math.max(5000, Number(process.env.OLLAMA_TIMEOUT_MS) || 15000));
    const headers = { 'Content-Type': 'application/json' };
    if (process.env.OLLAMA_API_KEY && process.env.OLLAMA_API_KEY.trim()) {
        headers['Authorization'] = `Bearer ${process.env.OLLAMA_API_KEY.trim()}`;
    }
    const response = await axios.post(
        `${baseUrl}/api/chat`,
        {
            model: targetModel,
            messages: [
                { role: 'system', content: prompt },
                ...history.slice(-10).map(h => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content }))
            ],
            stream: false,
            options: { temperature: 0.7, num_predict: 500 }
        },
        { headers, timeout: timeoutMs }
    );
    const replyText = response.data?.message?.content?.trim() || '';
    if (!replyText) throw new Error('Respuesta vacía de Ollama Local.');
    return { reply: replyText, modelUsed: targetModel, provider: 'Ollama Local' };
}

const FALLBACK_PROVIDER_PIPELINE = [
    { provider: 'google', fn: llamarAPI_Gemini, defaultModel: 'gemini-3.8-flash', check: () => isValidApiKey(process.env.GEMINI_API_KEY) },
    { provider: 'anthropic', fn: llamarAPI_Claude, defaultModel: 'claude-3-5-haiku-20241022', check: () => isValidApiKey(process.env.ANTHROPIC_API_KEY) },
    { provider: 'openai', fn: llamarAPI_OpenAI, defaultModel: 'gpt-4o-mini', check: () => isValidApiKey(process.env.OPENAI_API_KEY) },
    { provider: 'deepseek', fn: llamarAPI_DeepSeek, defaultModel: 'deepseek-chat', check: () => isValidApiKey(process.env.DEEPSEEK_API_KEY) },
    { provider: 'groq', fn: llamarAPI_Groq, defaultModel: 'llama-3.3-70b-versatile', check: () => isValidApiKey(process.env.GROQ_API_KEY) },
    { provider: 'ollama', fn: llamarAPI_Ollama, defaultModel: 'ollama-local', check: () => isOllamaConfigured() }
];

async function callMetalUrielLLM(senderPhone, userMessage, requestedModelId = null, sedeId = 'campeche') {
    if (!conversationMemory.has(senderPhone)) {
        conversationMemory.set(senderPhone, []);
        incrementTotalConversations();
    }
    const history = conversationMemory.get(senderPhone);
    history.push({ role: 'user', content: userMessage, timestamp: new Date() });
    touchUserSession(senderPhone);
    if (history.length > 20) history.splice(0, history.length - 20);

    let currentPrompt = getActivePrompt();
    const cicloActivo = await getActiveCicloEscolar(sedeId);
    const poolItems = await getActivePoolItems(sedeId);
    const poolCatalogSummary = poolItems.map(item =>
        `• [Código: ${item.codigo_recurso}] (${item.categoria.toUpperCase()} | ${item.tipo_archivo.toUpperCase()}) "${item.titulo}" — Modalidad: ${item.modalidad || 'Presencial'}. Info: ${item.descripcion_ia || ''}`
    ).join('\n');

    currentPrompt = `${currentPrompt}

[📚 POOL OFICIAL DE RECURSOS MULTIMEDIA, PLANES, HORARIOS E INSTALACIONES (CICLO ACTIVO: ${cicloActivo})]
Tienes acceso a los siguientes documentos oficiales (PDFs) e imágenes de la sede:
${poolCatalogSummary}

REGLA DE ORO PARA ENVÍO DE ARCHIVOS DEL POOL (CONFIRMACIÓN PREVIA):
1. Cuando el aspirante pregunte por información de una carrera, plan de estudios, oferta educativa, horarios de clase o fotos de las instalaciones, respóndele primero de forma clara y cálida usando la información del Pool y **pregúntale primero**: "¿Te gustaría que te envíe por aquí el PDF/imagen oficial de [Nombre del Recurso]?"
2. ÚNICAMENTE cuando el aspirante confirme que sí desea el archivo o solicite envío directo, incluye al final de tu respuesta la etiqueta exacta: [ADJUNTAR_RECURSO: codigo_del_recurso].`;

    const session = userSessionState.get(senderPhone);
    if (session?.isRegistered && session.leadData) {
        currentPrompt = `${currentPrompt}

[📌 ESTADO DEL ASPIRANTE EN SISTEMA: PRE-REGISTRO COMPLETADO EXITOSAMENTE]
- Aspirante: ${session.leadData.nombre_completo || 'Registrado'}
- Carrera: ${session.leadData.carrera_interes || 'Elegida'}
- Modalidad: ${session.leadData.modalidad_estudios || 'Presencial'}
- Campus: ${session.leadData.campus_interes || 'San Francisco de Campeche'}
- Ciclo Escolar: ${cicloActivo}
NUNCA vuelvas a solicitarle los 11 datos ni a reiniciar el cuestionario.`;
    }

    const modelToUse = requestedModelId || globalActiveModelId;
    let providersToTry = [];
    if (modelToUse && modelToUse !== 'auto-fallback') {
        const selectedMeta = ALL_SUPPORTED_MODELS.find(m => m.id === modelToUse);
        const primary = selectedMeta ? FALLBACK_PROVIDER_PIPELINE.find(p => p.provider === selectedMeta.provider) : null;
        if (primary && primary.check()) providersToTry.push({ ...primary, specificModel: modelToUse });
        FALLBACK_PROVIDER_PIPELINE.forEach(p => {
            if (p.check() && (!primary || p.provider !== primary.provider)) providersToTry.push(p);
        });
    } else {
        providersToTry = FALLBACK_PROVIDER_PIPELINE.filter(p => p.check());
    }

    if (providersToTry.length === 0) {
        return {
            reply: '¡Bip-bop! 🤖 Mis procesadores de lenguaje están en mantenimiento temporal. Por favor configura tu API Key en el servidor.',
            modelUsed: 'none',
            provider: 'none'
        };
    }

    let lastError = null;
    for (let i = 0; i < providersToTry.length; i++) {
        const currentTarget = providersToTry[i];
        const providerKey = currentTarget.provider;
        if (isProviderInCooldown(providerKey)) {
            console.log(`⏩ [CIRCUIT BREAKER] Saltando '${providerKey}' (${getProviderCooldownRemaining(providerKey)}s restantes)...`);
            continue;
        }
        const modelParam = currentTarget.specificModel || currentTarget.defaultModel;
        let promptToUse = currentPrompt;
        if (i > 0) {
            promptToUse = `${currentPrompt}\n\n[🛡️ PROTOCOLO DE CONTINUIDAD CONVERSACIONAL (RECUPERACIÓN POR FALLBACK)]: Esta conversación contiene ${history.length} mensajes previos. NUNCA reinicies el diálogo ni vuelvas a pedir datos ya proporcionados.]`;
        }

        const tStart = Date.now();
        const estTokensIn = securityUtils.estimateTokens(promptToUse) + securityUtils.estimateTokens(history);

        try {
            const result = await currentTarget.fn(modelParam, promptToUse, history);
            const latencyMs = Date.now() - tStart;
            recordLlmTelemetry({
                sedeId,
                phone: senderPhone,
                provider: result.provider || providerKey,
                model: result.modelUsed || modelParam,
                latencyMs,
                tokensIn: estTokensIn,
                tokensOut: securityUtils.estimateTokens(result.reply),
                isFallback: i > 0,
                success: true
            });
            history.push({ role: 'assistant', content: result.reply, timestamp: new Date() });
            touchUserSession(senderPhone);
            result.isFallbackSwitch = i > 0;
            result.latencyMs = latencyMs;
            if (i > 0) result.switchedFrom = providersToTry[0].provider;
            return result;
        } catch (error) {
            lastError = error;
            const status = error.status || error.response?.status || error.statusCode;
            const errorMsg = error.message || '';
            recordLlmTelemetry({
                sedeId,
                phone: senderPhone,
                provider: providerKey,
                model: modelParam,
                latencyMs: Date.now() - tStart,
                tokensIn: estTokensIn,
                tokensOut: 0,
                isFallback: i > 0,
                success: false,
                errorDetail: `${status || ''} ${errorMsg}`.trim()
            });
            const isQuotaOrRateLimit = status === 429 || status === 403 || status === 402 || status === 401 ||
                /quota|rate limit|too many requests|credits|credit balance|overloaded|expired|invalid api key/i.test(errorMsg);
            if (isQuotaOrRateLimit) {
                setProviderCooldown(providerKey, 10, errorMsg);
            }
        }
    }

    enviarAlertaSistema(
        'AI_TOTAL_FAILURE',
        'Todos los proveedores de IA en la cascada fallaron',
        `Último error: ${lastError?.message || 'Sin detalle'}\nProspecto: ${senderPhone}\nSede: ${sedeId}`
    ).catch(() => {});

    return {
        reply: '¡Bip-bop! 🤖 En este momento mis circuitos están experimentando una alta demanda de aspirantes. Un asesor humano del equipo de Admisiones UNID te atenderá a la brevedad.',
        modelUsed: 'fallback-offline',
        provider: 'Fallback Final',
        isFallbackSwitch: false
    };
}

module.exports = {
    ALL_SUPPORTED_MODELS,
    FALLBACK_PROVIDER_PIPELINE,
    initAiClients,
    callMetalUrielLLM,
    getActiveModelId: () => globalActiveModelId,
    setActiveModelId: (id) => { globalActiveModelId = id; }
};
