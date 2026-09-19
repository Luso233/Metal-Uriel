require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const { GoogleGenAI } = require('@google/genai');
const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');

process.on('uncaughtException', (err) => {
    console.error('🔥 Error no capturado (uncaughtException):', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 Promesa no manejada (unhandledRejection):', reason);
});

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'mi_token_secreto_123';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

// Configuración de Autenticación JWT
const JWT_SECRET = process.env.JWT_SECRET || 'unid_metal_uriel_jwt_secret_key_2026';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'unid2026';

// ==========================================
// 1. Configuración del Pool de MariaDB (mysql2/promise)
// ==========================================
const dbPool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'unid_admisiones',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Auto-migraciones para columnas avanzadas (Kanban, Lead Scoring y Resumen IA)
(async () => {
    try {
        const connection = await dbPool.getConnection();
        console.log('✅ Conexión exitosa al pool de MariaDB');
        
        const migrations = [
            `ALTER TABLE aspirantes ADD COLUMN IF NOT EXISTS estado_prospecto VARCHAR(50) DEFAULT 'nuevo'`,
            `ALTER TABLE aspirantes ADD COLUMN IF NOT EXISTS nivel_interes VARCHAR(20) DEFAULT 'Alto'`,
            `ALTER TABLE aspirantes ADD COLUMN IF NOT EXISTS resumen_ia TEXT`,
            `ALTER TABLE aspirantes ADD COLUMN IF NOT EXISTS archivado TINYINT(1) DEFAULT 0`,
            `ALTER TABLE aspirantes ADD COLUMN IF NOT EXISTS ultimo_mensaje_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`
        ];

        for (const sql of migrations) {
            try {
                await connection.query(sql);
            } catch (_) {
                try {
                    const cleanSql = sql.replace('IF NOT EXISTS ', '');
                    await connection.query(cleanSql);
                } catch (_) {}
            }
        }
        
        // Comprobar si hay datos iniciales; si está vacía, sembrar prospectos profesionales
        try {
            const [rows] = await connection.query('SELECT COUNT(*) as count FROM aspirantes');
            if (rows[0].count === 0) {
                console.log('🌱 Sembrando prospectos iniciales de demostración para el Centro de Mando...');
                await seedDemoLeads(connection);
            }
        } catch (_) {}

        connection.release();
    } catch (err) {
        console.warn('⚠️ No se pudo conectar a MariaDB (asegúrate de que el servicio esté corriendo):', err.message);
    }
})();

// ==========================================
// 2. Catálogo Oficial Dinámico de Folletos y Planes de Estudio UNID
// ==========================================
const BROCHURES_FILE_PATH = path.join(__dirname, 'brochures.json');
let UNID_BROCHURES = [];

function loadBrochuresFromDisk() {
    try {
        if (fs.existsSync(BROCHURES_FILE_PATH)) {
            const raw = fs.readFileSync(BROCHURES_FILE_PATH, 'utf-8');
            UNID_BROCHURES = JSON.parse(raw);
            console.log(`📚 [FOLLETOS] ${UNID_BROCHURES.length} planes de estudio cargados desde brochures.json`);
        }
    } catch (e) {
        console.warn('⚠️ Error leyendo brochures.json:', e.message);
    }
}

function saveBrochuresToDisk() {
    try {
        fs.writeFileSync(BROCHURES_FILE_PATH, JSON.stringify(UNID_BROCHURES, null, 2), 'utf-8');
    } catch (e) {
        console.error('Error guardando brochures.json:', e);
    }
}

loadBrochuresFromDisk();

// Función para sembrar prospectos profesionales de demostración
async function seedDemoLeads(connection) {
    const demoLeads = [
        {
            nombre_completo: 'Carlos Alpuche Canul',
            fecha_nacimiento: '2004-05-15',
            sexo: 'Masculino',
            estado_nacimiento: 'Campeche',
            telefono_celular: '9811234567',
            correo_electronico: 'carlos.alpuche@gmail.com',
            bachillerato_procedencia: 'COBACAM Plantel 01 Campeche',
            carrera_interes: 'Licenciatura en Derecho',
            direccion: 'Calle 12 #45 Col. Centro',
            codigo_postal: '24000',
            campus_interes: 'San Francisco de Campeche',
            modalidad_estudios: 'Presencial',
            es_foraneo: 0,
            estado_prospecto: 'inscrito',
            nivel_interes: 'Alto',
            resumen_ia: 'Aspirante local muy entusiasta con promedio destacado en COBACAM; ya agendó entrega de documentos presencial.'
        },
        {
            nombre_completo: 'Valeria Méndez Cruz',
            fecha_nacimiento: '2003-11-20',
            sexo: 'Femenino',
            estado_nacimiento: 'Tabasco',
            telefono_celular: '9931238899',
            correo_electronico: 'valeria.mendez@outlook.com',
            bachillerato_procedencia: 'CBTIS 32 Villahermosa',
            carrera_interes: 'Licenciatura en Diseño Gráfico Digital',
            direccion: 'Calle Juárez 302, Col. Centro',
            codigo_postal: '86000',
            campus_interes: 'San Francisco de Campeche (Virtual)',
            modalidad_estudios: 'Licenciaturas Online',
            es_foraneo: 1,
            estado_prospecto: 'en_proceso',
            nivel_interes: 'Alto',
            resumen_ia: 'Aspirante foránea de Villahermosa; aceptó con entusiasmo la modalidad 100% online por motivos laborales.'
        },
        {
            nombre_completo: 'Roberto Emiliano Gómez Pech',
            fecha_nacimiento: '2004-02-10',
            sexo: 'Masculino',
            estado_nacimiento: 'Yucatán',
            telefono_celular: '9992345678',
            correo_electronico: 'roberto.gomez@gmail.com',
            bachillerato_procedencia: 'Preparatoria Estatal #8 Mérida',
            carrera_interes: 'Ingeniería en Sistemas y Tecnologías de Información',
            direccion: 'Calle 60 #102 Col. Alcalá Martín',
            codigo_postal: '97050',
            campus_interes: 'San Francisco de Campeche (Virtual)',
            modalidad_estudios: 'Licenciaturas Online',
            es_foraneo: 1,
            estado_prospecto: 'contactado',
            nivel_interes: 'Alto',
            resumen_ia: 'Trabaja como técnico de soporte; solicitó plan de estudios de Ingeniería en Software y beca por promedio.'
        },
        {
            nombre_completo: 'Mariana Isabel Castillo Ramos',
            fecha_nacimiento: '2004-08-30',
            sexo: 'Femenino',
            estado_nacimiento: 'Campeche',
            telefono_celular: '9818812233',
            correo_electronico: 'mariana.castillo@hotmail.com',
            bachillerato_procedencia: 'Colegio Cumbres Campeche',
            carrera_interes: 'Licenciatura en Administración y Gestión Empresarial',
            direccion: 'Av. Resurgimiento 204',
            codigo_postal: '24030',
            campus_interes: 'San Francisco de Campeche',
            modalidad_estudios: 'Presencial',
            es_foraneo: 0,
            estado_prospecto: 'nuevo',
            nivel_interes: 'Medio',
            resumen_ia: 'Interesada en turno matutino; está comparando costos con otra universidad local.'
        },
        {
            nombre_completo: 'Alejandro Morales Fuentes',
            fecha_nacimiento: '2003-04-12',
            sexo: 'Masculino',
            estado_nacimiento: 'Veracruz',
            telefono_celular: '2291445566',
            correo_electronico: 'alejandro.morales@gmail.com',
            bachillerato_procedencia: 'COBAEV Plantel 62 Veracruz',
            carrera_interes: 'Licenciatura en Psicología Organizacional',
            direccion: 'Calle Zaragoza 450',
            codigo_postal: '91700',
            campus_interes: 'San Francisco de Campeche (Virtual)',
            modalidad_estudios: 'Licenciaturas Online',
            es_foraneo: 1,
            estado_prospecto: 'nuevo',
            nivel_interes: 'Alto',
            resumen_ia: 'Aspirante foráneo interesado en el área de Recursos Humanos; solicitó plan cuatrimestral flexible.'
        }
    ];

    for (const lead of demoLeads) {
        await connection.execute(`
            INSERT INTO aspirantes (
                nombre_completo, fecha_nacimiento, sexo, estado_nacimiento,
                telefono_celular, correo_electronico, bachillerato_procedencia,
                carrera_interes, direccion, codigo_postal, campus_interes,
                modalidad_estudios, es_foraneo, latitud, longitud, raw_json_data, 
                estado_prospecto, nivel_interes, resumen_ia
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            lead.nombre_completo, lead.fecha_nacimiento, lead.sexo, lead.estado_nacimiento,
            lead.telefono_celular, lead.correo_electronico, lead.bachillerato_procedencia,
            lead.carrera_interes, lead.direccion, lead.codigo_postal, lead.campus_interes,
            lead.modalidad_estudios, lead.es_foraneo, null, null, JSON.stringify(lead),
            lead.estado_prospecto, lead.nivel_interes, lead.resumen_ia
        ]);
    }
}

// ==========================================
// 3. Inicialización Multi-Proveedor y Circuit Breaker (Cooldown)
// ==========================================

// Validación de API Keys configuradas (no vacías y no placeholders)
function isValidApiKey(key) {
    return Boolean(key && key.trim().length > 8 && !key.includes('placeholder') && !key.includes('tu_api_key'));
}

// Clientes de IA
let geminiClient = null;
if (isValidApiKey(process.env.GEMINI_API_KEY)) {
    geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    console.log('✨ [AI PROVIDER] Google Gemini activado.');
}

let anthropicClient = null;
if (isValidApiKey(process.env.ANTHROPIC_API_KEY)) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    console.log('🔮 [AI PROVIDER] Anthropic Claude activado.');
}

let openaiClient = null;
if (isValidApiKey(process.env.OPENAI_API_KEY)) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log('🤖 [AI PROVIDER] OpenAI activado.');
}

let deepseekClient = null;
if (isValidApiKey(process.env.DEEPSEEK_API_KEY)) {
    deepseekClient = new OpenAI({
        apiKey: process.env.DEEPSEEK_API_KEY,
        baseURL: 'https://api.deepseek.com'
    });
    console.log('🐳 [AI PROVIDER] DeepSeek activado.');
}

let groqClient = null;
if (isValidApiKey(process.env.GROQ_API_KEY)) {
    groqClient = new OpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: 'https://api.groq.com/openai/v1'
    });
    console.log('⚡ [AI PROVIDER] Groq Llama activado.');
}

// Catálogo Completo de Modelos Soportados
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
    // Google Gemini
    {
        id: 'gemini-3.5-flash-lite',
        name: 'Google Gemini 3.5 Flash Lite',
        provider: 'google',
        providerName: 'Google Gemini',
        icon: '✨',
        badge: 'Rápido',
        description: 'Ultra rápido y de alta capacidad de cuota para WhatsApp.',
        isConfigured: isValidApiKey(process.env.GEMINI_API_KEY)
    },
    {
        id: 'gemini-3.6-flash',
        name: 'Google Gemini 3.6 Flash',
        provider: 'google',
        providerName: 'Google Gemini',
        icon: '⚡',
        badge: 'Equilibrado',
        description: 'Gran capacidad de comprensión contextual y persuasión.',
        isConfigured: isValidApiKey(process.env.GEMINI_API_KEY)
    },
    {
        id: 'gemini-3.1-pro-preview',
        name: 'Google Gemini 3.1 Pro',
        provider: 'google',
        providerName: 'Google Gemini',
        icon: '🧠',
        badge: 'Avanzado',
        description: 'Máxima capacidad de razonamiento lógico institucional.',
        isConfigured: isValidApiKey(process.env.GEMINI_API_KEY)
    },
    // Anthropic Claude
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
    // OpenAI
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
    // DeepSeek
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
    // Groq
    {
        id: 'llama-3.3-70b-versatile',
        name: 'Groq Llama 3.3 70B',
        provider: 'groq',
        providerName: 'Groq Cloud',
        icon: '⚡',
        badge: 'Ultra Rápido',
        description: 'Inferencia a velocidad ultra rápida en chips LPU.',
        isConfigured: isValidApiKey(process.env.GROQ_API_KEY)
    }
];

let globalActiveModelId = process.env.DEFAULT_AI_MODEL || 'auto-fallback';

// ==========================================
// 4. Mecanismo de Cooldown / Circuit Breaker
// ==========================================
const providerCooldowns = new Map(); // providerKey -> timestamp expiración en ms

function isProviderInCooldown(providerKey) {
    const expiresAt = providerCooldowns.get(providerKey);
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
        providerCooldowns.delete(providerKey);
        console.log(`🟢 [CIRCUIT BREAKER] Cooldown expirado para el proveedor: ${providerKey}. Reactivando.`);
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
    return Math.ceil((expiresAt - Date.now()) / 1000); // en segundos
}

// Memoria conversacional y métricas de sesiones
const conversationMemory = new Map();
let totalConversationsStarted = 0;

// ==========================================
// 5. Gestión Dinámica y Presets del System Prompt
// ==========================================
const PROMPT_FILE_PATH = path.join(__dirname, 'system_prompt.txt');

const PROMPT_PRESETS = [
    {
        id: 'metal_uriel',
        name: '🐺 Metal-Uriel Oficial (Lobo Robótico UNID)',
        description: 'Personalidad oficial con toques cibernéticos amigables (*bip-bop*), empático, institucional y persuasivo.',
        prompt: `Eres Metal-Uriel, la versión cibernética oficial de "El Lobo Rojo Uriel", la mascota y embajador de la Universidad Interamericana para el Desarrollo (UNID). Eres un asesor de admisiones robótico amigable, entusiasta, altamente profesional y persuasivo que representa con orgullo a la UNID Campus San Francisco de Campeche.

🎯 OBJETIVO PRINCIPAL:
Guiar al prospecto de forma natural, cálida y conversacional (paso a paso, pregunta por pregunta, nunca pidas todo en una sola lista abrumadora) para recopilar los 11 datos obligatorios:
1. Nombre completo
2. Fecha de nacimiento (AAAA-MM-DD o comprensible)
3. Sexo (Masculino / Femenino / Otro)
4. Estado de nacimiento
5. Teléfono celular
6. Correo electrónico
7. Bachillerato / Preparatoria de procedencia
8. Carrera o Licenciatura de interés (Derecho, Software/Sistemas, Administración, Diseño Gráfico, Psicología, etc.)
9. Dirección completa con Código Postal (CP)
10. Campus de interés
11. Modalidad de estudios (Presencial, Mixta/Ejecutiva o Licenciaturas Online)

📍 REGLA GEOGRÁFICA CRÍTICA (CAMPUS Y MODALIDAD):
- El campus físico principal que representas con orgullo está en San Francisco de Campeche.
- Tan pronto como el aspirante te proporcione su Código Postal, Estado de residencia o ubicación:
  * Evalúa si reside en Campeche o si es FORÁNEO (cualquier otro estado de México o extranjero).
  * SI ES FORÁNEO: Ofrécele de forma proactiva, persuasiva y cálida la modalidad "Licenciaturas Online (Plataforma Virtual UNID)". Explícale que puede cursar su carrera con validez oficial ante la SEP 100% en línea sin necesidad de mudarse ni incurrir en gastos de traslado.
  * Si insiste en mudarse a Campeche para estudiar presencial, apóyalo y regístralo en Campus Campeche Presencial.

📄 ENVÍO AUTOMATIZADO DE DOCUMENTOS Y PLANES DE ESTUDIO:
- Si el aspirante te pregunta por el plan de estudios, materias, temario, folleto o costos de una carrera (ej. Software, Derecho, Administración, Diseño, etc.) o sobre becas, indícale con entusiasmo que le estás adjuntando el documento oficial en PDF con la información académica correspondiente.

⚙️ REGLA DE FINALIZACIÓN Y LEAD SCORING:
- Mientras conversas, responde en texto conversacional con el estilo de Metal-Uriel (puedes incluir toques sutiles como *bip-bop*, *ajustando procesadores*).
- Cuando verifiques que TIENES LOS 11 DATOS COMPLETOS y el aspirante confirme su interés, TU RESPUESTA FINAL DEBE CONTENER EXCLUSIVAMENTE EL SIGUIENTE BLOQUE JSON PURO:
{
  "completado": true,
  "nombre_completo": "string",
  "fecha_nacimiento": "YYYY-MM-DD",
  "sexo": "string",
  "estado_nacimiento": "string",
  "telefono_celular": "string",
  "correo_electronico": "string",
  "bachillerato_procedencia": "string",
  "carrera_interes": "string",
  "direccion": "string",
  "codigo_postal": "string",
  "campus_interes": "string",
  "modalidad_estudios": "string",
  "es_foraneo": boolean,
  "nivel_interes": "Alto",
  "resumen_ia": "Síntesis ejecutiva de 2 líneas para el equipo de admisiones destacando perfil, motivo y modalidad recomendada.",
  "latitud": null,
  "longitud": null
}`
    },
    {
        id: 'formal_ejecutivo',
        name: '🎓 Asesor Ejecutivo (Formal & Corporativo)',
        description: 'Tono formal, institucional, respetuoso y corporativo de admisiones universitarias sin modismos robóticos.',
        prompt: `Eres un Asesor Ejecutivo de Admisiones de la Universidad Interamericana para el Desarrollo (UNID), Campus San Francisco de Campeche. Tu comunicación es formal, ejecutiva, cálida y altamente profesional.

🎯 OBJETIVO:
Guiar al prospecto con cortesía y eficiencia para recopilar los 11 datos clave de admisión:
1. Nombre completo
2. Fecha de nacimiento (AAAA-MM-DD)
3. Sexo (Masculino / Femenino / Otro)
4. Estado de nacimiento
5. Teléfono celular
6. Correo electrónico
7. Bachillerato de procedencia
8. Carrera de interés
9. Dirección completa y Código Postal (CP)
10. Campus de interés
11. Modalidad (Presencial o Licenciaturas Online)

📍 REGLA GEOGRÁFICA:
- Si el aspirante reside fuera de Campeche, ofrécele formalmente la modalidad "Licenciaturas Online" con validez oficial ante la SEP y horarios flexibles.

⚙️ REGLA DE CIERRE:
- Al completar los 11 datos y obtener confirmación, responde ÚNICAMENTE con el bloque JSON estructurado con: completado, 11 campos, nivel_interes ("Alto", "Medio", "Bajo") y resumen_ia (síntesis de 2 líneas).`
    }
];

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
    activeSystemPrompt = newPrompt.trim();
    try {
        fs.writeFileSync(PROMPT_FILE_PATH, activeSystemPrompt, 'utf-8');
    } catch (e) {
        console.error('Error guardando prompt en archivo:', e);
    }
}

// ==========================================
// 6. Detección de Folletos PDF
// ==========================================
function detectBrochureRequest(userMessage) {
    if (!userMessage || typeof userMessage !== 'string') return null;
    const text = userMessage.toLowerCase();
    const isAskingForDoc = /plan de estudio|plan de estudios|temario|materias|folleto|pdf|brochure|beca|becas|costos|costo|precio|malla curricular|carrera|licenciatura|ingenieria/i.test(text);
    
    if (!isAskingForDoc) return null;

    for (const b of UNID_BROCHURES) {
        if (b.tags && Array.isArray(b.tags)) {
            const matchTag = b.tags.some(t => text.includes(String(t).toLowerCase()));
            if (matchTag) {
                return b;
            }
        }
    }
    return UNID_BROCHURES.length > 0 ? UNID_BROCHURES[0] : null;
}

// ==========================================
// 7. Adaptadores Normalizados para cada Proveedor de IA
// ==========================================

// Adaptador 1: Google Gemini
async function llamarAPI_Gemini(modelId, prompt, history) {
    if (!geminiClient || !isValidApiKey(process.env.GEMINI_API_KEY)) {
        throw new Error('Google Gemini no tiene API Key configurada.');
    }

    const targetModel = modelId && modelId.startsWith('gemini') ? modelId : 'gemini-3.5-flash-lite';
    const geminiContents = history.map(h => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content }]
    }));

    const response = await geminiClient.models.generateContent({
        model: targetModel,
        contents: geminiContents,
        config: {
            systemInstruction: prompt,
            temperature: 0.7
        }
    });

    const replyText = response.text ? response.text.trim() : '';
    if (!replyText) throw new Error('Respuesta vacía de Google Gemini.');
    return { reply: replyText, modelUsed: targetModel, provider: 'Google Gemini' };
}

// Adaptador 2: Anthropic Claude
async function llamarAPI_Claude(modelId, prompt, history) {
    if (!anthropicClient || !isValidApiKey(process.env.ANTHROPIC_API_KEY)) {
        throw new Error('Anthropic Claude no tiene API Key configurada.');
    }

    const targetModel = modelId && modelId.startsWith('claude') ? modelId : 'claude-3-5-haiku-20241022';
    const claudeMessages = history.map(h => ({
        role: h.role === 'assistant' ? 'assistant' : 'user',
        content: h.content
    }));

    const response = await anthropicClient.messages.create({
        model: targetModel,
        max_tokens: 1000,
        system: prompt,
        messages: claudeMessages,
        temperature: 0.7
    });

    const replyText = response.content?.[0]?.type === 'text' ? response.content[0].text.trim() : '';
    if (!replyText) throw new Error('Respuesta vacía de Anthropic Claude.');
    return { reply: replyText, modelUsed: targetModel, provider: 'Anthropic Claude' };
}

// Adaptador 3: OpenAI
async function llamarAPI_OpenAI(modelId, prompt, history) {
    if (!openaiClient || !isValidApiKey(process.env.OPENAI_API_KEY)) {
        throw new Error('OpenAI no tiene API Key configurada.');
    }

    const targetModel = modelId && modelId.startsWith('gpt') ? modelId : 'gpt-4o-mini';
    const openAiMessages = [
        { role: 'system', content: prompt },
        ...history.map(h => ({ role: h.role, content: h.content }))
    ];

    const response = await openaiClient.chat.completions.create({
        model: targetModel,
        messages: openAiMessages,
        temperature: 0.7,
        max_tokens: 800
    });

    const replyText = response.choices[0]?.message?.content?.trim() || '';
    if (!replyText) throw new Error('Respuesta vacía de OpenAI.');
    return { reply: replyText, modelUsed: targetModel, provider: 'OpenAI' };
}

// Adaptador 4: DeepSeek
async function llamarAPI_DeepSeek(modelId, prompt, history) {
    if (!deepseekClient || !isValidApiKey(process.env.DEEPSEEK_API_KEY)) {
        throw new Error('DeepSeek no tiene API Key configurada.');
    }

    const targetModel = 'deepseek-chat';
    const messages = [
        { role: 'system', content: prompt },
        ...history.map(h => ({ role: h.role, content: h.content }))
    ];

    const response = await deepseekClient.chat.completions.create({
        model: targetModel,
        messages: messages,
        temperature: 0.7,
        max_tokens: 800
    });

    const replyText = response.choices[0]?.message?.content?.trim() || '';
    if (!replyText) throw new Error('Respuesta vacía de DeepSeek.');
    return { reply: replyText, modelUsed: targetModel, provider: 'DeepSeek' };
}

// Adaptador 5: Groq
async function llamarAPI_Groq(modelId, prompt, history) {
    if (!groqClient || !isValidApiKey(process.env.GROQ_API_KEY)) {
        throw new Error('Groq no tiene API Key configurada.');
    }

    const targetModel = 'llama-3.3-70b-versatile';
    const messages = [
        { role: 'system', content: prompt },
        ...history.map(h => ({ role: h.role, content: h.content }))
    ];

    const response = await groqClient.chat.completions.create({
        model: targetModel,
        messages: messages,
        temperature: 0.7,
        max_tokens: 800
    });

    const replyText = response.choices[0]?.message?.content?.trim() || '';
    if (!replyText) throw new Error('Respuesta vacía de Groq.');
    return { reply: replyText, modelUsed: targetModel, provider: 'Groq Cloud' };
}

// ==========================================
// 8. Motor de Inferencia en Cascada con Fallback Inteligente y Cooldown
// ==========================================

// Jerarquía de Fallback Predeterminada
const FALLBACK_PROVIDER_PIPELINE = [
    { provider: 'google', fn: llamarAPI_Gemini, defaultModel: 'gemini-3.5-flash-lite', check: () => isValidApiKey(process.env.GEMINI_API_KEY) },
    { provider: 'anthropic', fn: llamarAPI_Claude, defaultModel: 'claude-3-5-haiku-20241022', check: () => isValidApiKey(process.env.ANTHROPIC_API_KEY) },
    { provider: 'openai', fn: llamarAPI_OpenAI, defaultModel: 'gpt-4o-mini', check: () => isValidApiKey(process.env.OPENAI_API_KEY) },
    { provider: 'deepseek', fn: llamarAPI_DeepSeek, defaultModel: 'deepseek-chat', check: () => isValidApiKey(process.env.DEEPSEEK_API_KEY) },
    { provider: 'groq', fn: llamarAPI_Groq, defaultModel: 'llama-3.3-70b-versatile', check: () => isValidApiKey(process.env.GROQ_API_KEY) }
];

async function callMetalUrielLLM(senderPhone, userMessage, requestedModelId = null) {
    if (!conversationMemory.has(senderPhone)) {
        conversationMemory.set(senderPhone, []);
        totalConversationsStarted++;
    }

    const history = conversationMemory.get(senderPhone);
    history.push({ role: 'user', content: userMessage });

    if (history.length > 20) {
        history.splice(0, history.length - 20);
    }

    const currentPrompt = getActivePrompt();
    const modelToUse = requestedModelId || globalActiveModelId;

    // Determinar lista de intentos según el modelo seleccionado o modo auto-fallback
    let providersToTry = [];

    if (modelToUse && modelToUse !== 'auto-fallback') {
        // El usuario seleccionó un modelo específico: intentarlo primero, pero conservar los demás de respaldo
        const selectedMeta = ALL_SUPPORTED_MODELS.find(m => m.id === modelToUse);
        const primaryPipelineEntry = selectedMeta 
            ? FALLBACK_PROVIDER_PIPELINE.find(p => p.provider === selectedMeta.provider)
            : null;

        if (primaryPipelineEntry && primaryPipelineEntry.check()) {
            providersToTry.push({
                ...primaryPipelineEntry,
                specificModel: modelToUse
            });
        }

        // Agregar los restantes como respaldo
        FALLBACK_PROVIDER_PIPELINE.forEach(p => {
            if (p.check() && (!primaryPipelineEntry || p.provider !== primaryPipelineEntry.provider)) {
                providersToTry.push(p);
            }
        });
    } else {
        // Modo Auto-Fallback: Seguir la jerarquía ordenada completa
        providersToTry = FALLBACK_PROVIDER_PIPELINE.filter(p => p.check());
    }

    if (providersToTry.length === 0) {
        console.error('❌ [CRÍTICO] No hay ningún proveedor de IA con API Key configurada en el servidor.');
        return {
            reply: '¡Bip-bop! 🤖 Mis procesadores de lenguaje están en mantenimiento temporal. Por favor configura tu API Key en el servidor.',
            modelUsed: 'none',
            provider: 'none'
        };
    }

    // Ejecución de la Cascada con Intercepción Inteligente y Cooldown
    let lastError = null;

    for (let i = 0; i < providersToTry.length; i++) {
        const currentTarget = providersToTry[i];
        const providerKey = currentTarget.provider;

        // Verificar si el proveedor está en Cooldown (Circuit Breaker)
        if (isProviderInCooldown(providerKey)) {
            const remainingSec = getProviderCooldownRemaining(providerKey);
            console.log(`⏩ [CIRCUIT BREAKER] Saltando proveedor '${providerKey}' (en cooldown, restan ${remainingSec}s)...`);
            continue;
        }

        const modelParam = currentTarget.specificModel || currentTarget.defaultModel;

        // Inyección de Salvaguarda de Continuidad Contextual en caso de Fallback a mitad de conversación
        let promptToUse = currentPrompt;
        if (i > 0) {
            promptToUse = `${currentPrompt}\n\n[🛡️ PROTOCOLO DE CONTINUIDAD CONVERSACIONAL (RECUPERACIÓN POR FALLBACK)]: Esta conversación ha sido transferida de forma transparente a este procesador de IA. Contiene ${history.length} mensajes previos en el historial. NUNCA reinicies el diálogo ni vuelvas a pedir datos que el aspirante ya haya proporcionado (ej. nombre, carrera, fecha, estado o CP). Continúa respondiendo de manera fluida y empática exactamente desde el último mensaje recibido.]`;
            console.log(`🔄 [CONTEXT PRESERVATION] Inyectando salvaguarda de continuidad para ${providerKey.toUpperCase()} (${history.length} mensajes en memoria)...`);
        }

        try {
            console.log(`📡 [AI INFERENCE] Intentando con ${providerKey.toUpperCase()} (${modelParam})...`);
            const result = await currentTarget.fn(modelParam, promptToUse, history);
            
            // Éxito: guardar en historial y retornar
            history.push({ role: 'assistant', content: result.reply });
            result.isFallbackSwitch = (i > 0);
            if (i > 0) {
                result.switchedFrom = providersToTry[0].provider;
            }
            return result;

        } catch (error) {
            lastError = error;
            const status = error.status || error.response?.status || error.statusCode;
            const errorMsg = error.message || '';

            // Detectar Rate Limits (429) o Cuota Agotada (403, 402, 503)
            const isQuotaOrRateLimit = status === 429 || status === 403 || status === 402 || 
                                       /quota|rate limit|too many requests|credits|credit balance|overloaded/i.test(errorMsg);

            if (isQuotaOrRateLimit) {
                console.warn(`🚨 [ALERTA DE CUOTA] ${providerKey.toUpperCase()} retornó error de cuota (${status || errorMsg}). Activando Cooldown de 10 min y pasando al siguiente en cascada sin perder contexto...`);
                setProviderCooldown(providerKey, 10, errorMsg);
            } else {
                console.warn(`⚠️ [FALLBACK] Error con ${providerKey.toUpperCase()} (${errorMsg}). Intentando con siguiente proveedor en la lista manteniendo el contexto íntegro...`);
            }
        }
    }

    // Si todos los proveedores de la jerarquía fallaron
    console.error('🔥 [ERROR TOTAL] Todos los proveedores de IA en la cascada fallaron:', lastError?.message);
    return {
        reply: '¡Bip-bop! 🤖 En este momento mis circuitos están experimentando una alta demanda de aspirantes. Un asesor humano del equipo de Admisiones UNID te atenderá a la brevedad.',
        modelUsed: 'fallback-offline',
        provider: 'Fallback Final',
        isFallbackSwitch: false
    };
}

// ==========================================
// 9. Inserción de Aspirante en MariaDB
// ==========================================
async function guardarAspiranteEnBD(datos) {
    const query = `
        INSERT INTO aspirantes (
            nombre_completo, fecha_nacimiento, sexo, estado_nacimiento,
            telefono_celular, correo_electronico, bachillerato_procedencia,
            carrera_interes, direccion, codigo_postal, campus_interes,
            modalidad_estudios, es_foraneo, latitud, longitud, raw_json_data, 
            estado_prospecto, nivel_interes, resumen_ia
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
        datos.nombre_completo || null,
        datos.fecha_nacimiento || null,
        datos.sexo || null,
        datos.estado_nacimiento || null,
        datos.telefono_celular || null,
        datos.correo_electronico || null,
        datos.bachillerato_procedencia || null,
        datos.carrera_interes || null,
        datos.direccion || null,
        datos.codigo_postal || null,
        datos.campus_interes || null,
        datos.modalidad_estudios || null,
        datos.es_foraneo ? 1 : 0,
        datos.latitud || null,
        datos.longitud || null,
        JSON.stringify(datos),
        datos.estado_prospecto || 'nuevo',
        datos.nivel_interes || 'Alto',
        datos.resumen_ia || `Aspirante registrado para ${datos.carrera_interes} en modalidad ${datos.modalidad_estudios}.`
    ];

    try {
        const [result] = await dbPool.execute(query, values);
        console.log(`🎉 Aspirante insertado en MariaDB con ID: ${result.insertId}`);
        return result.insertId;
    } catch (dbError) {
        console.error('❌ Error al insertar aspirante en MariaDB:', dbError);
        throw dbError;
    }
}

// ==========================================
// 10. Servicio de Notificaciones al Equipo de Admisiones (Email)
// ==========================================
async function notificarEquipoAdmisiones(datos, insertId) {
    const emailDestino = process.env.ADMISSIONS_NOTIFICATION_EMAIL;
    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!emailDestino || !smtpHost || !smtpUser) {
        console.log(`📧 [ALERTA DE ADMISIONES] Nuevo aspirante registrado: ID #${insertId} - ${datos.nombre_completo} (${datos.carrera_interes} - ${datos.modalidad_estudios}) [Prioridad: ${datos.nivel_interes || 'Alta'}]`);
        return;
    }

    try {
        const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: Number(process.env.SMTP_PORT) || 587,
            secure: Number(process.env.SMTP_PORT) === 465,
            auth: {
                user: smtpUser,
                pass: smtpPass
            }
        });

        const htmlContent = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; background: #0B192C; padding: 24px; color: #f8fafc;">
            <div style="max-width: 600px; margin: 0 auto; background: #1E293B; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5); border: 1px solid #334155; border-top: 6px solid #FFC72C;">
                <div style="padding: 24px; background: #0F172A; border-bottom: 1px solid #334155;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <h2 style="margin: 0; font-size: 20px; color: #FFC72C;">:UNID • ¡Nueva Ficha Registrada!</h2>
                    </div>
                    <p style="margin: 6px 0 0 0; font-size: 13px; color: #94a3b8;">Capturada por Metal-Uriel • Ficha Oficial ID #${insertId}</p>
                </div>
                
                <div style="padding: 24px;">
                    <div style="background: #0F172A; border-radius: 12px; padding: 16px; margin-bottom: 20px; border: 1px solid #334155;">
                        <h3 style="margin: 0 0 8px 0; font-size: 18px; color: #ffffff;">${datos.nombre_completo}</h3>
                        <p style="margin: 4px 0; font-size: 14px; color: #FFC72C; font-weight: bold;">🎓 ${datos.carrera_interes}</p>
                        <p style="margin: 4px 0; font-size: 13px; color: #cbd5e1;">📍 Modalidad: <strong>${datos.modalidad_estudios}</strong> (${datos.campus_interes})</p>
                        <p style="margin: 4px 0; font-size: 12px; color: #38bdf8;">${datos.es_foraneo ? '🌍 Aspirante Foráneo (Plataforma Online)' : '🏢 Aspirante Local (Campus Campeche)'}</p>
                        <div style="margin-top: 10px; padding: 8px 12px; background: rgba(255,199,44,0.1); border-left: 3px solid #FFC72C; border-radius: 4px; font-size: 12px; color: #fde68a;">
                            <strong>⚡ Resumen IA:</strong> ${datos.resumen_ia || 'Interés confirmado.'}
                        </div>
                    </div>

                    <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #cbd5e1;">
                        <tr style="border-bottom: 1px solid #334155;"><td style="padding: 8px 0; color: #94a3b8;">📱 Teléfono Celular:</td><td style="padding: 8px 0; font-weight: bold; text-align: right;"><a href="tel:${datos.telefono_celular}" style="color: #38bdf8; text-decoration: none;">${datos.telefono_celular}</a> (<a href="https://wa.me/${datos.telefono_celular?.replace(/\D/g, '')}" target="_blank" style="color: #4ade80; text-decoration: none; font-weight: bold;">WhatsApp</a>)</td></tr>
                        <tr style="border-bottom: 1px solid #334155;"><td style="padding: 8px 0; color: #94a3b8;">✉️ Correo Electrónico:</td><td style="padding: 8px 0; text-align: right;"><a href="mailto:${datos.correo_electronico}" style="color: #38bdf8; text-decoration: none;">${datos.correo_electronico}</a></td></tr>
                        <tr style="border-bottom: 1px solid #334155;"><td style="padding: 8px 0; color: #94a3b8;">🏫 Bachillerato:</td><td style="padding: 8px 0; text-align: right;">${datos.bachillerato_procedencia || 'No especificado'}</td></tr>
                        <tr style="border-bottom: 1px solid #334155;"><td style="padding: 8px 0; color: #94a3b8;">🏠 Dirección y CP:</td><td style="padding: 8px 0; text-align: right;">${datos.direccion} (CP: ${datos.codigo_postal})</td></tr>
                        <tr><td style="padding: 8px 0; color: #94a3b8;">🎂 Fecha de Nacimiento:</td><td style="padding: 8px 0; text-align: right;">${datos.fecha_nacimiento} (${datos.sexo})</td></tr>
                    </table>

                    <div style="margin-top: 24px; padding: 14px; background: #064E3B; border-radius: 10px; border: 1px solid #059669; text-align: center;">
                        <span style="color: #A7F3D0; font-size: 12px; font-weight: bold;">⚡ Acción Recomendada: Contactar al prospecto dentro de los primeros 15 minutos para asegurar su proceso de inscripción.</span>
                    </div>
                </div>

                <div style="padding: 16px 24px; background: #0B192C; text-align: center; font-size: 11px; color: #64748B; border-top: 1px solid #334155;">
                    Metal-Uriel • Sistema de Admisiones UNID Campus San Francisco de Campeche
                </div>
            </div>
        </div>
        `;

        await transporter.sendMail({
            from: `"UNID Admisiones • Metal-Uriel" <${smtpUser}>`,
            to: emailDestino,
            subject: `🐺 Nuevo Prospecto UNID (${datos.nivel_interes || 'Alta Prioridad'}): ${datos.nombre_completo} - ${datos.carrera_interes}`,
            html: htmlContent
        });

        console.log(`📧 Notificación de admisión enviada con éxito a ${emailDestino} para el aspirante #${insertId}`);
    } catch (err) {
        console.error('⚠️ No se pudo enviar el correo de notificación a admisiones:', err.message);
    }
}

// ==========================================
// 11. Procesamiento Central de Mensajes (Webhook + Web Simulator)
// ==========================================
async function processChatMessage(senderPhone, messageText, requestedModelId = null) {
    const { reply: llmReply, modelUsed } = await callMetalUrielLLM(senderPhone, messageText, requestedModelId);
    const brochureDetected = detectBrochureRequest(messageText);

    let potentialJson = llmReply.trim();
    if (potentialJson.startsWith('```json')) {
        potentialJson = potentialJson.replace(/```json|```/g, '').trim();
    } else if (potentialJson.startsWith('```')) {
        potentialJson = potentialJson.replace(/```/g, '').trim();
    }

    try {
        const parsedData = JSON.parse(potentialJson);
        if (parsedData && parsedData.completado) {
            let insertId = null;
            try {
                insertId = await guardarAspiranteEnBD(parsedData);
                notificarEquipoAdmisiones(parsedData, insertId).catch(console.error);
            } catch (dbErr) {
                console.warn('⚠️ No se pudo guardar en BD:', dbErr.message);
            }

            const mensajeExito = `🐺 ¡*Bip-bop*! ¡Registro completado con éxito! 🎉\n\n` +
                `Muchas gracias *${parsedData.nombre_completo}*, he registrado tu ficha para la carrera de *${parsedData.carrera_interes}* en la modalidad *${parsedData.modalidad_estudios}* (Campus: ${parsedData.campus_interes}).\n\n` +
                `Un asesor del equipo humano de la UNID se pondrá en contacto contigo muy pronto a tu número (${parsedData.telefono_celular}) o correo (${parsedData.correo_electronico}).\n\n` +
                `¡Bienvenido a la manada UNID! 🔴🐾`;

            conversationMemory.delete(senderPhone);

            return {
                reply: mensajeExito,
                completed: true,
                leadData: parsedData,
                insertId,
                modelUsed,
                documentAttachment: null
            };
        }
    } catch (e) {
        // Conversación regular
    }

    return {
        reply: llmReply,
        completed: false,
        leadData: null,
        modelUsed,
        documentAttachment: brochureDetected ? {
            id: brochureDetected.id,
            title: `Plan de Estudios: ${brochureDetected.carrera}`,
            fileName: brochureDetected.fileName,
            size: brochureDetected.size,
            rvoe: brochureDetected.rvoe,
            modalidad: brochureDetected.modalidad,
            downloadUrl: `/api/brochures/${brochureDetected.id}/download`
        } : null
    };
}

// ==========================================
// 12. Enviar mensaje de vuelta a WhatsApp Cloud API
// ==========================================
async function sendWhatsAppMessage(to, messageText, documentAttachment = null) {
    if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
        console.log(`[SIMULACIÓN WHATSAPP] Enviando a ${to}: ${messageText}`);
        return;
    }

    const url = `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

    try {
        await axios.post(
            url,
            {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: to,
                type: 'text',
                text: { body: messageText }
            },
            {
                headers: {
                    'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (documentAttachment) {
            const docUrl = `https://mascot-say-breeching.ngrok-free.dev${documentAttachment.downloadUrl}`;
            await axios.post(
                url,
                {
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: to,
                    type: 'document',
                    document: {
                        link: docUrl,
                        filename: documentAttachment.fileName,
                        caption: `📄 ${documentAttachment.title} (Validez Oficial SEP: ${documentAttachment.rvoe})`
                    }
                },
                {
                    headers: {
                        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            console.log(`📄 Documento enviado vía WhatsApp a ${to}: ${documentAttachment.fileName}`);
        }
    } catch (error) {
        console.error('Error enviando mensaje a WhatsApp API:', error.response?.data || error.message);
    }
}

// ==========================================
// 13. Middleware de Autenticación JWT
// ==========================================
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Acceso no autorizado. Se requiere token JWT.' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Token inválido o expirado.' });
    }
}

// ==========================================
// 14. Endpoints API: Centro de Mando, Folletos, Modelos Filtrados & Seed
// ==========================================

// ==========================================
// 14. Endpoints API: Gestión de Planes de Estudio & Folletos (CRUD)
// ==========================================

// 1. Obtener catálogo completo de folletos
app.get('/api/brochures', (req, res) => {
    res.json({ success: true, count: UNID_BROCHURES.length, brochures: UNID_BROCHURES });
});

// 2. Crear nuevo folleto / programa
app.post('/api/brochures', (req, res) => {
    try {
        const { carrera, scope, modalidad, duracion, rvoe, fileName, pdfUrl, size, tags } = req.body;
        if (!carrera || !modalidad) {
            return res.status(400).json({ success: false, error: 'La carrera y modalidad son campos obligatorios.' });
        }

        const id = (req.body.id || carrera.toLowerCase().replace(/[^a-z0-9]/g, '_')).substring(0, 40);
        
        let scopeLabel = '🏛️ Campus Campeche (Presencial)';
        if (scope === 'unid_nacional') scopeLabel = '🌐 UNID Online (Nacional)';
        else if (scope === 'ejecutiva_campeche') scopeLabel = '👔 Campus Campeche (Ejecutiva / Dual)';
        else if (scope === 'todas') scopeLabel = '🎓 Programa Institucional UNID';

        const newBrochure = {
            id,
            carrera: carrera.trim(),
            scope: scope || 'campus_campeche',
            scopeLabel,
            modalidad: modalidad.trim(),
            duracion: duracion ? duracion.trim() : '3 años (9 cuatrimestres)',
            rvoe: rvoe ? rvoe.trim() : 'SEP-RVOE-OFICIAL',
            fileName: fileName ? fileName.trim() : `Plan_Estudios_${id}.pdf`,
            pdfUrl: pdfUrl ? pdfUrl.trim() : `https://digitalmedia.talisis.com/unid/plan-de-estudios/2024/${id}.pdf`,
            size: size ? size.trim() : '1.2 MB',
            tags: Array.isArray(tags) ? tags : (tags ? String(tags).split(',').map(t => t.trim().toLowerCase()) : [id])
        };

        UNID_BROCHURES.push(newBrochure);
        saveBrochuresToDisk();

        console.log(`➕ [FOLLETO CREADO] ${newBrochure.carrera} (${newBrochure.id})`);
        return res.status(201).json({ success: true, brochure: newBrochure });
    } catch (err) {
        console.error('Error creando folleto:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// 3. Modificar / Actualizar folleto existente
app.put('/api/brochures/:id', (req, res) => {
    try {
        const { id } = req.params;
        const index = UNID_BROCHURES.findIndex(b => b.id === id);
        if (index === -1) {
            return res.status(404).json({ success: false, error: 'Folleto / Carrera no encontrada.' });
        }

        const current = UNID_BROCHURES[index];
        const { carrera, scope, modalidad, duracion, rvoe, fileName, pdfUrl, size, tags } = req.body;

        let scopeLabel = current.scopeLabel;
        if (scope === 'unid_nacional') scopeLabel = '🌐 UNID Online (Nacional)';
        else if (scope === 'ejecutiva_campeche') scopeLabel = '👔 Campus Campeche (Ejecutiva / Dual)';
        else if (scope === 'campus_campeche') scopeLabel = '🏛️ Campus Campeche (Presencial)';
        else if (scope === 'todas') scopeLabel = '🎓 Programa Institucional UNID';

        UNID_BROCHURES[index] = {
            ...current,
            carrera: carrera ? carrera.trim() : current.carrera,
            scope: scope || current.scope,
            scopeLabel: scopeLabel || current.scopeLabel,
            modalidad: modalidad ? modalidad.trim() : current.modalidad,
            duracion: duracion ? duracion.trim() : current.duracion,
            rvoe: rvoe ? rvoe.trim() : current.rvoe,
            fileName: fileName ? fileName.trim() : current.fileName,
            pdfUrl: pdfUrl !== undefined ? pdfUrl.trim() : current.pdfUrl,
            size: size ? size.trim() : current.size,
            tags: Array.isArray(tags) ? tags : (tags ? String(tags).split(',').map(t => t.trim().toLowerCase()) : current.tags)
        };

        saveBrochuresToDisk();
        console.log(`✏️ [FOLLETO ACTUALIZADO] ${UNID_BROCHURES[index].carrera} (${id})`);
        return res.json({ success: true, brochure: UNID_BROCHURES[index] });
    } catch (err) {
        console.error('Error actualizando folleto:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// 4. Eliminar folleto
app.delete('/api/brochures/:id', (req, res) => {
    try {
        const { id } = req.params;
        const index = UNID_BROCHURES.findIndex(b => b.id === id);
        if (index === -1) {
            return res.status(404).json({ success: false, error: 'Folleto / Carrera no encontrada.' });
        }

        const deleted = UNID_BROCHURES.splice(index, 1);
        saveBrochuresToDisk();
        console.log(`🗑️ [FOLLETO ELIMINADO] ${deleted[0].carrera} (${id})`);
        return res.json({ success: true, message: 'Folleto eliminado exitosamente.' });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

// 5. Descarga o redirección de Folleto Oficial UNID (PDF)
app.get('/api/brochures/:id/download', (req, res) => {
    const brochure = UNID_BROCHURES.find(b => b.id === req.params.id) || UNID_BROCHURES[0];
    
    // Si tiene una URL externa válida configurada por el usuario (ej. digitalmedia.talisis.com), redirigir
    if (brochure && brochure.pdfUrl && (brochure.pdfUrl.startsWith('http://') || brochure.pdfUrl.startsWith('https://'))) {
        return res.redirect(brochure.pdfUrl);
    }

    // Si no, generar plantilla PDF institucional estilizada con membrete UNID
    const pdfContent = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 420 >> stream
BT
/F1 20 Tf
50 720 Td
(:UNID TALISIS - CAMPUS SAN FRANCISCO DE CAMPECHE) Tj
0 -30 Td
/F1 14 Tf
(PLAN DE ESTUDIOS OFICIAL 2026) Tj
0 -25 Td
/F1 12 Tf
(Programa: ${brochure.carrera}) Tj
0 -20 Td
(Modalidad: ${brochure.modalidad} | Duracion: ${brochure.duracion}) Tj
0 -20 Td
(Validez Oficial: ${brochure.rvoe}) Tj
0 -40 Td
(1er Cuatrimestre: Fundamentos Universitarios, Metodologia y Comunicacion) Tj
0 -20 Td
(2do Cuatrimestre: Especialidad y Formacion Profesional UNID) Tj
0 -20 Td
(Estadia Empresarial en Empresa Lider en 6to Cuatrimestre) Tj
ET
endstream
endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000234 00000 n 
0000000705 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
785
%%EOF`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${brochure.fileName || 'plan_estudios_unid.pdf'}"`);
    res.status(200).send(Buffer.from(pdfContent));
});

// Sembrar datos de demostración
app.post('/api/aspirantes/seed', async (req, res) => {
    try {
        const connection = await dbPool.getConnection();
        await connection.query('DELETE FROM aspirantes');
        await seedDemoLeads(connection);
        connection.release();
        res.json({ success: true, message: 'Datos demo de alta fidelidad cargados con éxito.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Login con JWT Local (Admin / TI)
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        const token = jwt.sign({ username: ADMIN_USERNAME, role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
        return res.json({ success: true, token, user: { username: ADMIN_USERNAME, displayName: 'Director de Admisiones UNID', role: 'Administrador UNID', isInstitutional: false } });
    }
    return res.status(401).json({ success: false, error: 'Usuario o contraseña incorrectos.' });
});

// Login Institucional con Office 365 (@red.unid.mx / @unid.mx / Microsoft Entra ID)
app.post('/api/auth/microsoft', (req, res) => {
    try {
        const { email, displayName, matricula } = req.body;
        
        if (!email || typeof email !== 'string') {
            return res.status(400).json({ success: false, error: 'Debe proporcionar un correo electrónico institucional.' });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const isUnidDomain = normalizedEmail.endsWith('@red.unid.mx') || 
                             normalizedEmail.endsWith('@unid.mx') || 
                             normalizedEmail.endsWith('@talisis.com');

        if (!isUnidDomain) {
            return res.status(403).json({
                success: false,
                error: 'Dominio no autorizado. Solo se permite el acceso con cuentas institucionales @red.unid.mx o @unid.mx.'
            });
        }

        const userMatricula = matricula || normalizedEmail.split('@')[0];
        const userDisplayName = displayName || `Personal UNID (${userMatricula})`;

        const institutionalUser = {
            username: normalizedEmail,
            displayName: userDisplayName,
            matricula: userMatricula,
            role: 'Personal Administrativo y Admisiones UNID',
            domain: normalizedEmail.split('@')[1],
            isInstitutional: true,
            tenant: 'UNID Talisis Educación Superior'
        };

        const token = jwt.sign(institutionalUser, JWT_SECRET, { expiresIn: '7d' });

        console.log(`🔐 [AUTH O365] Sesión institucional iniciada exitosamente para ${normalizedEmail}`);

        return res.json({
            success: true,
            token,
            user: institutionalUser
        });
    } catch (err) {
        console.error('Error en /api/auth/microsoft:', err);
        return res.status(500).json({ success: false, error: 'Error procesando autenticación de Office 365.' });
    }
});

// Verificar token JWT
app.get('/api/auth/me', authMiddleware, (req, res) => {
    res.json({ success: true, user: req.user });
});

// Chat interactivo desde el simulador web
app.post('/api/chat', async (req, res) => {
    try {
        const { phone, message, model } = req.body;
        if (!message) {
            return res.status(400).json({ error: 'El mensaje no puede estar vacío.' });
        }
        const senderPhone = phone || '+529811234567';
        const result = await processChatMessage(senderPhone, message, model);
        res.json(result);
    } catch (error) {
        console.error('Error en /api/chat:', error);
        res.status(500).json({ error: error.message });
    }
});

// Catálogo de modelos con filtrado estricto por API Key configurada
app.get('/api/models', (req, res) => {
    // Filtrar solo los modelos que TIENEN API Key válida configurada (o el Auto-Fallback)
    const configuredModels = ALL_SUPPORTED_MODELS.map(m => {
        let isReady = false;
        let inCooldown = false;
        let cooldownSec = 0;

        if (m.id === 'auto-fallback') {
            isReady = true;
        } else if (m.provider === 'google') {
            isReady = isValidApiKey(process.env.GEMINI_API_KEY);
            inCooldown = isProviderInCooldown('google');
            cooldownSec = getProviderCooldownRemaining('google');
        } else if (m.provider === 'anthropic') {
            isReady = isValidApiKey(process.env.ANTHROPIC_API_KEY);
            inCooldown = isProviderInCooldown('anthropic');
            cooldownSec = getProviderCooldownRemaining('anthropic');
        } else if (m.provider === 'openai') {
            isReady = isValidApiKey(process.env.OPENAI_API_KEY);
            inCooldown = isProviderInCooldown('openai');
            cooldownSec = getProviderCooldownRemaining('openai');
        } else if (m.provider === 'deepseek') {
            isReady = isValidApiKey(process.env.DEEPSEEK_API_KEY);
            inCooldown = isProviderInCooldown('deepseek');
            cooldownSec = getProviderCooldownRemaining('deepseek');
        } else if (m.provider === 'groq') {
            isReady = isValidApiKey(process.env.GROQ_API_KEY);
            inCooldown = isProviderInCooldown('groq');
            cooldownSec = getProviderCooldownRemaining('groq');
        }

        return {
            ...m,
            isConfigured: isReady,
            inCooldown,
            cooldownSec
        };
    }).filter(m => m.isConfigured); // Ocultar los que no tienen API Key

    res.json({
        activeModel: globalActiveModelId,
        models: configuredModels,
        allProvidersStatus: {
            google: { configured: isValidApiKey(process.env.GEMINI_API_KEY), inCooldown: isProviderInCooldown('google'), cooldownSec: getProviderCooldownRemaining('google') },
            anthropic: { configured: isValidApiKey(process.env.ANTHROPIC_API_KEY), inCooldown: isProviderInCooldown('anthropic'), cooldownSec: getProviderCooldownRemaining('anthropic') },
            openai: { configured: isValidApiKey(process.env.OPENAI_API_KEY), inCooldown: isProviderInCooldown('openai'), cooldownSec: getProviderCooldownRemaining('openai') },
            deepseek: { configured: isValidApiKey(process.env.DEEPSEEK_API_KEY), inCooldown: isProviderInCooldown('deepseek'), cooldownSec: getProviderCooldownRemaining('deepseek') },
            groq: { configured: isValidApiKey(process.env.GROQ_API_KEY), inCooldown: isProviderInCooldown('groq'), cooldownSec: getProviderCooldownRemaining('groq') }
        }
    });
});

// Cambiar modelo activo global
app.post('/api/models/active', (req, res) => {
    const { modelId } = req.body;
    const found = ALL_SUPPORTED_MODELS.find(m => m.id === modelId);
    if (!found) {
        return res.status(400).json({ error: 'Modelo no reconocido.' });
    }
    globalActiveModelId = modelId;
    console.log(`🤖 Modelo de IA activo actualizado globalmente a: ${modelId}`);
    res.json({ success: true, activeModel: globalActiveModelId });
});

// Obtener prompt actual
app.get('/api/prompt', (req, res) => {
    res.json({
        prompt: getActivePrompt(),
        presets: PROMPT_PRESETS
    });
});

// Guardar nuevo System Prompt
app.post('/api/prompt', (req, res) => {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        return res.status(400).json({ error: 'El prompt no puede estar vacío.' });
    }
    setActivePrompt(prompt);
    console.log('🔄 System Prompt actualizado dinámicamente desde el frontend.');
    res.json({ success: true, message: 'Personalidad y prompt actualizados con éxito.', prompt: getActivePrompt() });
});

// Restaurar prompt original
app.post('/api/prompt/reset', (req, res) => {
    setActivePrompt(PROMPT_PRESETS[0].prompt);
    console.log('🔄 System Prompt restaurado a Metal-Uriel Oficial.');
    res.json({ success: true, message: 'Prompt restaurado al original.', prompt: getActivePrompt() });
});

// ==========================================
// Catálogo de Sedes Oficiales UNID (Nacional)
// ==========================================
const UNID_CAMPUSES = [
    { id: 'campeche', name: 'Campus San Francisco de Campeche', estado: 'Campeche', region: 'Sureste' },
    { id: 'cancun', name: 'Campus Cancún', estado: 'Quintana Roo', region: 'Sureste' },
    { id: 'chetumal', name: 'Campus Chetumal', estado: 'Quintana Roo', region: 'Sureste' },
    { id: 'playa_del_carmen', name: 'Campus Playa del Carmen', estado: 'Quintana Roo', region: 'Sureste' },
    { id: 'cozumel', name: 'Campus Cozumel', estado: 'Quintana Roo', region: 'Sureste' },
    { id: 'merida', name: 'Campus Mérida', estado: 'Yucatán', region: 'Sureste' },
    { id: 'villahermosa', name: 'Campus Villahermosa', estado: 'Tabasco', region: 'Sureste' },
    { id: 'tijuana', name: 'Campus Tijuana', estado: 'Baja California', region: 'Noroeste' },
    { id: 'ensenada', name: 'Campus Ensenada', estado: 'Baja California', region: 'Noroeste' },
    { id: 'guadalajara', name: 'Campus Guadalajara', estado: 'Jalisco', region: 'Occidente' },
    { id: 'zapopan', name: 'Campus Zapopan', estado: 'Jalisco', region: 'Occidente' },
    { id: 'aguascalientes', name: 'Campus Aguascalientes', estado: 'Aguascalientes', region: 'Bajío' },
    { id: 'zacatecas', name: 'Campus Zacatecas', estado: 'Zacatecas', region: 'Norte' },
    { id: 'slp', name: 'Campus San Luis Potosí', estado: 'San Luis Potosí', region: 'Bajío' },
    { id: 'toluca', name: 'Campus Toluca', estado: 'Estado de México', region: 'Centro' },
    { id: 'tlalnepantla', name: 'Campus Tlalnepantla', estado: 'Estado de México', region: 'Centro' },
    { id: 'tejupilco', name: 'Campus Tejupilco', estado: 'Estado de México', region: 'Centro' },
    { id: 'morelia', name: 'Campus Morelia', estado: 'Michoacán', region: 'Occidente' },
    { id: 'uruapan', name: 'Campus Uruapan', estado: 'Michoacán', region: 'Occidente' },
    { id: 'pachuca', name: 'Campus Pachuca', estado: 'Hidalgo', region: 'Centro' },
    { id: 'tampico', name: 'Campus Tampico', estado: 'Tamaulipas', region: 'Noreste' },
    { id: 'durango', name: 'Campus Durango', estado: 'Durango', region: 'Norte' },
    { id: 'online_nacional', name: 'UNID Online (Nacional 100% Virtual)', estado: 'Nacional', region: 'Virtual' }
];

// Obtener catálogo de sedes UNID
app.get('/api/campuses', (req, res) => {
    res.json({ success: true, count: UNID_CAMPUSES.length, campuses: UNID_CAMPUSES });
});

// Obtener lista de aspirantes con estados y filtros
app.get('/api/aspirantes', async (req, res) => {
    try {
        const { campus } = req.query;
        let query = 'SELECT * FROM aspirantes';
        const params = [];

        if (campus && campus !== 'all' && campus !== 'todas') {
            query += ' WHERE campus_interes LIKE ?';
            params.push(`%${campus}%`);
        }

        query += ' ORDER BY COALESCE(ultimo_mensaje_at, updated_at, created_at) DESC LIMIT 200';
        const [rows] = await dbPool.query(query, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.json({ success: false, error: err.message, data: [] });
    }
});

// Actualizar estado del prospecto para el Kanban
app.patch('/api/aspirantes/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;
        const validStates = ['nuevo', 'contactado', 'en_proceso', 'inscrito', 'no_interesado'];
        if (!validStates.includes(estado)) {
            return res.status(400).json({ error: 'Estado de prospecto no válido.' });
        }
        await dbPool.execute('UPDATE aspirantes SET estado_prospecto = ? WHERE id = ?', [estado, id]);
        console.log(`📌 Prospecto #${id} actualizado al estado: ${estado}`);
        res.json({ success: true, id: Number(id), estado });
    } catch (err) {
        res.status(500).json({ error: 'Error actualizando estado: ' + err.message });
    }
});

// Archivar o Desarchivar un prospecto
app.patch('/api/aspirantes/:id/archive', async (req, res) => {
    try {
        const { id } = req.params;
        const { archivado } = req.body;
        const archVal = (archivado === true || archivado === 1 || archivado === '1') ? 1 : 0;
        await dbPool.execute('UPDATE aspirantes SET archivado = ? WHERE id = ?', [archVal, id]);
        console.log(`🗄️ Prospecto #${id} ${archVal ? 'archivado' : 'desarchivado'}.`);
        res.json({ success: true, id: Number(id), archivado: Boolean(archVal) });
    } catch (err) {
        res.status(500).json({ error: 'Error archivando prospecto: ' + err.message });
    }
});

// Eliminar definitivamente un prospecto
app.delete('/api/aspirantes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await dbPool.execute('DELETE FROM aspirantes WHERE id = ?', [id]);
        console.log(`🗑️ Prospecto #${id} eliminado.`);
        res.json({ success: true, id: Number(id) });
    } catch (err) {
        res.status(500).json({ error: 'Error eliminando prospecto: ' + err.message });
    }
});

// Analytics y métricas para el Dashboard blindado con catálogo oficial UNID
app.get('/api/analytics', async (req, res) => {
    try {
        let rows = [];
        try {
            const [dbRows] = await dbPool.query('SELECT * FROM aspirantes');
            rows = dbRows;
        } catch (e) {
            console.warn('MariaDB offline para analytics:', e.message);
        }

        const totalLeads = rows.length;
        const activos = rows.filter(r => !r.archivado).length;
        const archivados = rows.filter(r => Boolean(r.archivado)).length;
        const locales = rows.filter(r => !r.es_foraneo).length;
        const foraneos = rows.filter(r => Boolean(r.es_foraneo)).length;

        // Catálogo oficial de carreras (Anti-Alucinaciones)
        const officialDegrees = UNID_BROCHURES.filter(b => b.scope !== 'todas').map(b => b.carrera);

        // Conteo validado por carrera oficial
        const careerMap = {};
        officialDegrees.forEach(deg => {
            careerMap[deg] = 0;
        });

        rows.forEach(r => {
            const raw = (r.carrera_interes || '').trim();
            if (!raw) return;

            // Encontrar coincidencia exacta o difusa con catálogo oficial
            const match = officialDegrees.find(deg => 
                deg.toLowerCase() === raw.toLowerCase() ||
                raw.toLowerCase().includes(deg.toLowerCase().substring(0, 15)) ||
                deg.toLowerCase().includes(raw.toLowerCase().substring(0, 15))
            );

            if (match) {
                careerMap[match] = (careerMap[match] || 0) + 1;
            } else {
                careerMap['Otros Programas UNID'] = (careerMap['Otros Programas UNID'] || 0) + 1;
            }
        });

        const byCareer = Object.entries(careerMap)
            .map(([career, count]) => ({ career, count }))
            .filter(c => c.count > 0 || officialDegrees.includes(c.career))
            .sort((a, b) => b.count - a.count);

        // Conteo por estado Kanban (solo prospectos activos para el embudo operativo)
        const activeRows = rows.filter(r => !r.archivado);
        const byStatus = {
            nuevo: activeRows.filter(r => (r.estado_prospecto || 'nuevo') === 'nuevo').length,
            contactado: activeRows.filter(r => r.estado_prospecto === 'contactado').length,
            en_proceso: activeRows.filter(r => r.estado_prospecto === 'en_proceso').length,
            inscrito: activeRows.filter(r => r.estado_prospecto === 'inscrito').length,
            no_interesado: activeRows.filter(r => r.estado_prospecto === 'no_interesado').length
        };

        // Conteo por Lead Scoring (Nivel de Interés)
        const byInterest = {
            alto: rows.filter(r => (r.nivel_interes || 'Alto') === 'Alto').length,
            medio: rows.filter(r => r.nivel_interes === 'Medio').length,
            bajo: rows.filter(r => r.nivel_interes === 'Bajo').length
        };

        // Conteo por modalidad
        const modalityMap = {};
        rows.forEach(r => {
            const m = r.modalidad_estudios || 'No especificada';
            modalityMap[m] = (modalityMap[m] || 0) + 1;
        });
        const byModality = Object.entries(modalityMap).map(([modality, count]) => ({ modality, count }));

        // Efectividad del bot
        const totalConversations = totalConversationsStarted || (totalLeads + conversationMemory.size) || 1;
        const conversionRate = totalConversations > 0 ? ((totalLeads / totalConversations) * 100).toFixed(1) : '100.0';

        res.json({
            success: true,
            totalLeads,
            activos,
            archivados,
            locales,
            foraneos,
            byCareer,
            byStatus,
            byInterest,
            byModality,
            totalConversations,
            conversionRate: Number(conversionRate)
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Monitor de Salud Semáforo Completo Multi-Proveedor
app.get('/api/health/full', async (req, res) => {
    let dbStatus = false;
    let dbLatencyMs = null;
    let dbCount = 0;
    const t0 = Date.now();
    try {
        const connection = await dbPool.getConnection();
        const [c] = await connection.query('SELECT COUNT(*) as count FROM aspirantes');
        connection.release();
        dbLatencyMs = Date.now() - t0;
        dbStatus = true;
        dbCount = c[0]?.count || 0;
    } catch (e) {
        dbLatencyMs = Date.now() - t0;
    }

    const hasMeta = Boolean(WHATSAPP_TOKEN && WHATSAPP_PHONE_NUMBER_ID);
    const hasGemini = isValidApiKey(process.env.GEMINI_API_KEY);
    const hasClaude = isValidApiKey(process.env.ANTHROPIC_API_KEY);
    const hasOpenAi = isValidApiKey(process.env.OPENAI_API_KEY);
    const hasDeepSeek = isValidApiKey(process.env.DEEPSEEK_API_KEY);
    const hasGroq = isValidApiKey(process.env.GROQ_API_KEY);
    const hasSmtp = Boolean(process.env.ADMISSIONS_NOTIFICATION_EMAIL && process.env.SMTP_HOST);

    const atLeastOneAI = hasGemini || hasClaude || hasOpenAi || hasDeepSeek || hasGroq;

    res.json({
        timestamp: new Date().toISOString(),
        overall: (dbStatus && atLeastOneAI) ? 'healthy' : 'warning',
        circuitBreaker: {
            cooldownsActive: providerCooldowns.size > 0,
            activeCooldownProviders: Array.from(providerCooldowns.entries()).map(([k, v]) => ({
                provider: k,
                remainingSec: Math.max(0, Math.ceil((v - Date.now()) / 1000))
            }))
        },
        services: {
            mariadb: {
                status: dbStatus ? 'online' : 'offline',
                latencyMs: dbLatencyMs,
                totalRecords: dbCount,
                host: process.env.DB_HOST || 'localhost',
                database: process.env.DB_NAME || 'unid_admisiones'
            },
            aiEngines: {
                activeModel: globalActiveModelId,
                gemini: {
                    status: hasGemini ? (isProviderInCooldown('google') ? 'cooldown' : 'online') : 'not_configured',
                    cooldownSec: getProviderCooldownRemaining('google')
                },
                claude: {
                    status: hasClaude ? (isProviderInCooldown('anthropic') ? 'cooldown' : 'online') : 'not_configured',
                    cooldownSec: getProviderCooldownRemaining('anthropic')
                },
                openai: {
                    status: hasOpenAi ? (isProviderInCooldown('openai') ? 'cooldown' : 'online') : 'not_configured',
                    cooldownSec: getProviderCooldownRemaining('openai')
                },
                deepseek: {
                    status: hasDeepSeek ? (isProviderInCooldown('deepseek') ? 'cooldown' : 'online') : 'not_configured',
                    cooldownSec: getProviderCooldownRemaining('deepseek')
                },
                groq: {
                    status: hasGroq ? (isProviderInCooldown('groq') ? 'cooldown' : 'online') : 'not_configured',
                    cooldownSec: getProviderCooldownRemaining('groq')
                }
            },
            metaWhatsApp: {
                status: hasMeta ? 'configured' : 'sandbox_local',
                tokenPresent: Boolean(WHATSAPP_TOKEN),
                phoneNumberIdPresent: Boolean(WHATSAPP_PHONE_NUMBER_ID),
                verifyTokenPresent: Boolean(VERIFY_TOKEN)
            },
            notifications: {
                status: hasSmtp ? 'configured' : 'simulated_console',
                smtpHost: process.env.SMTP_HOST || 'No configurado',
                destination: process.env.ADMISSIONS_NOTIFICATION_EMAIL || 'Consola local'
            }
        }
    });
});

// Diagnóstico simple de Salud
app.get('/api/health', async (req, res) => {
    let dbStatus = false;
    let dbError = null;
    try {
        const connection = await dbPool.getConnection();
        connection.release();
        dbStatus = true;
    } catch (e) {
        dbError = e.message;
    }

    res.json({
        status: 'online',
        botName: 'Metal-Uriel',
        hasGeminiKey: isValidApiKey(process.env.GEMINI_API_KEY),
        hasClaudeKey: isValidApiKey(process.env.ANTHROPIC_API_KEY),
        hasOpenAiKey: isValidApiKey(process.env.OPENAI_API_KEY),
        hasDeepSeekKey: isValidApiKey(process.env.DEEPSEEK_API_KEY),
        hasGroqKey: isValidApiKey(process.env.GROQ_API_KEY),
        activeModel: globalActiveModelId,
        hasSmtpConfigured: Boolean(process.env.ADMISSIONS_NOTIFICATION_EMAIL && process.env.SMTP_HOST),
        dbConnected: dbStatus,
        dbError: dbError,
        activeSessions: conversationMemory.size
    });
});

// Exportar aspirantes en formato CSV con Lead Scoring y Resumen
app.get('/api/aspirantes/export', async (req, res) => {
    try {
        let rows = [];
        try {
            const [dbRows] = await dbPool.query('SELECT * FROM aspirantes ORDER BY created_at DESC');
            rows = dbRows;
        } catch (dbErr) {
            console.warn('⚠️ No se pudo consultar MariaDB para exportar CSV:', dbErr.message);
        }
        
        const headers = [
            'ID', 'Fecha de Registro', 'Estado de Seguimiento', 'Lead Scoring (Interes)', 'Resumen IA',
            'Nombre Completo', 'Fecha de Nacimiento', 'Sexo', 
            'Estado de Nacimiento', 'Telefono Celular', 'Correo Electronico', 
            'Bachillerato de Procedencia', 'Carrera de Interes', 'Direccion', 
            'Codigo Postal', 'Campus de Interes', 'Modalidad de Estudios', 'Es Foraneo'
        ];

        const escapeCsv = (val) => {
            if (val === null || val === undefined) return '""';
            const str = String(val).replace(/"/g, '""');
            return `"${str}"`;
        };

        const csvRows = [headers.map(escapeCsv).join(',')];

        for (const r of rows) {
            const rowValues = [
                r.id,
                r.created_at ? new Date(r.created_at).toLocaleString('es-MX') : '',
                r.estado_prospecto || 'nuevo',
                r.nivel_interes || 'Alto',
                r.resumen_ia || '',
                r.nombre_completo,
                r.fecha_nacimiento ? String(r.fecha_nacimiento).split('T')[0] : '',
                r.sexo,
                r.estado_nacimiento,
                r.telefono_celular,
                r.correo_electronico,
                r.bachillerato_procedencia,
                r.carrera_interes,
                r.direccion,
                r.codigo_postal,
                r.campus_interes,
                r.modalidad_estudios,
                r.es_foraneo ? 'SI (Online)' : 'NO (Campeche)'
            ];
            csvRows.push(rowValues.map(escapeCsv).join(','));
        }

        const csvString = '\uFEFF' + csvRows.join('\r\n');
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=aspirantes_unid_${new Date().toISOString().slice(0,10)}.csv`);
        res.status(200).send(csvString);
    } catch (err) {
        res.status(500).send('Error exportando datos: ' + err.message);
    }
});

// Reiniciar sesión
app.post('/api/session/reset', (req, res) => {
    const { phone } = req.body;
    if (phone) {
        conversationMemory.delete(phone);
    } else {
        conversationMemory.clear();
    }
    res.json({ success: true, message: 'Sesión reiniciada con éxito.' });
});

// ==========================================
// 15. Endpoints Webhook de Meta WhatsApp
// ==========================================

// Endpoint GET: Verificación del Webhook de Meta
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log(`🔍 Intento de verificación de Webhook: mode=${mode}, token=${token}`);

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('✅ Webhook verificado exitosamente con Meta.');
            return res.status(200).send(challenge);
        } else {
            console.warn(`❌ Token de verificación inválido. Esperado: "${VERIFY_TOKEN}", Recibido: "${token}"`);
            return res.sendStatus(403);
        }
    }

    return res.sendStatus(400);
});

// Endpoint POST: Recepción de Mensajes de WhatsApp
app.post('/webhook', async (req, res) => {
    res.status(200).send('EVENT_RECEIVED');

    try {
        const body = req.body;

        if (body.object === 'whatsapp_business_account') {
            const entry = body.entry?.[0];
            const changes = entry?.changes?.[0];
            const value = changes?.value;
            const messageObj = value?.messages?.[0];

            if (messageObj && messageObj.type === 'text') {
                const senderPhone = messageObj.from;
                const messageText = messageObj.text.body;

                console.log(`📩 Webhook recibido de [${senderPhone}]: "${messageText}"`);

                const result = await processChatMessage(senderPhone, messageText);
                await sendWhatsAppMessage(senderPhone, result.reply, result.documentAttachment);
            }
        }
    } catch (error) {
        console.error('Error procesando el webhook de WhatsApp:', error);
    }
});

// ==========================================
// 16. Inicialización del Servidor
// ==========================================
app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🐺 :UNID Centro de Mando • Metal-Uriel en Puerto ${PORT}`);
    console.log(`🛡️ Modo de Inferencia: ${globalActiveModelId}`);
    console.log(`🌐 Dashboard Ejecutivo: http://localhost:${PORT}`);
    console.log(`📊 Analytics: http://localhost:${PORT}/api/analytics`);
    console.log(`🚦 Health Monitor: http://localhost:${PORT}/api/health/full`);
    console.log(`🔗 Webhook de WhatsApp: http://localhost:${PORT}/webhook`);
    console.log(`🔑 Token de Verificación: ${VERIFY_TOKEN}`);
    console.log(`====================================================`);
});
