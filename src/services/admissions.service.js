const { getPool } = require('../db/pool');
const { conversationMemory, userSessionState, touchUserSession } = require('../state/memory');
const { generarCurp, resolveSedeId, extractPartialFieldsFromHistory, extractJsonFromLlmReply } = require('../utils/curp');
const { getActiveCicloEscolar, getActivePoolItems, detectBrochureRequest, buildAttachmentObject } = require('./pool.service');
const { callMetalUrielLLM } = require('./llm.service');
const { dispararNotificacionCorreo, notificarEquipoAdmisiones } = require('./mail.service');
const securityUtils = require('../../lib/security-utils');
const { normalizePhoneCanonical, pickBestDialPhone } = require('../../lib/chat-audit-utils');

async function registrarLeadInicialEnBD(senderPhone, primerMensaje, sedeId = 'campeche') {
    const canonical = normalizePhoneCanonical(senderPhone);
    const dialPhone = pickBestDialPhone([senderPhone]);
    try {
        const [existing] = await getPool().query(
            `SELECT id, nombre_completo, estado_prospecto, telefono_celular
             FROM aspirantes
             WHERE telefono_canonico = ?
                OR REPLACE(REPLACE(REPLACE(telefono_celular, '+', ''), ' ', ''), '-', '') LIKE ?
             ORDER BY id DESC LIMIT 1`,
            [canonical, `%${canonical}%`]
        );
        if (existing.length > 0) {
            const bestPhone = pickBestDialPhone([existing[0].telefono_celular, dialPhone]);
            await getPool().execute(
                'UPDATE aspirantes SET ultimo_mensaje_at = CURRENT_TIMESTAMP, telefono_canonico = ?, telefono_celular = ? WHERE id = ?',
                [canonical, bestPhone, existing[0].id]
            );
            return { isNew: false, insertId: existing[0].id, existingLead: existing[0], canonicalPhone: canonical };
        }
        const cicloActivo = await getActiveCicloEscolar(sedeId || 'campeche');
        const [result] = await getPool().execute(`
            INSERT INTO aspirantes (
                sede_id, ciclo_escolar, nombre_completo, telefono_celular, telefono_canonico, carrera_interes,
                campus_interes, modalidad_estudios, estado_prospecto, nivel_interes, resumen_ia
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'nuevo', 'Medio', ?)
        `, [
            sedeId || 'campeche',
            cicloActivo,
            `Prospecto WhatsApp (${dialPhone})`,
            dialPhone,
            canonical,
            'Por definir (En conversación)',
            'San Francisco de Campeche',
            'Presencial',
            `Primer contacto vía WhatsApp (${cicloActivo}): "${String(primerMensaje || '').substring(0, 120)}"`
        ]);
        return { isNew: true, insertId: result.insertId, ciclo_escolar: cicloActivo, canonicalPhone: canonical };
    } catch (err) {
        console.warn('⚠️ Error registrando lead inicial en BD:', err.message);
        return { isNew: true, insertId: null, canonicalPhone: canonical };
    }
}

async function guardarAspiranteEnBD(datos, senderPhone = null) {
    if (!datos.curp && datos.nombre_completo && datos.fecha_nacimiento) {
        datos.curp = generarCurp(datos);
    }
    const phoneToUse = pickBestDialPhone([senderPhone, datos.telefono_celular]);
    const canonical = normalizePhoneCanonical(phoneToUse || datos.telefono_celular || senderPhone);
    const sedeId = datos.sede_id || resolveSedeId(datos.campus_interes);
    const cicloActivo = datos.ciclo_escolar || await getActiveCicloEscolar(sedeId);

    if (canonical && canonical.length >= 8) {
        const [existing] = await getPool().query(
            `SELECT id, telefono_celular FROM aspirantes
             WHERE telefono_canonico = ?
                OR REPLACE(REPLACE(REPLACE(telefono_celular, '+', ''), ' ', ''), '-', '') LIKE ?
             ORDER BY id DESC LIMIT 1`,
            [canonical, `%${canonical}%`]
        );
        if (existing.length > 0) {
            const targetId = existing[0].id;
            const bestPhone = pickBestDialPhone([existing[0].telefono_celular, phoneToUse]);
            await getPool().execute(`
                UPDATE aspirantes SET
                    sede_id = ?, ciclo_escolar = ?, curp = ?, nombre_completo = ?, fecha_nacimiento = ?, sexo = ?,
                    estado_nacimiento = ?, telefono_celular = ?, telefono_canonico = ?, correo_electronico = ?,
                    bachillerato_procedencia = ?, carrera_interes = ?, direccion = ?,
                    codigo_postal = ?, campus_interes = ?, modalidad_estudios = ?,
                    es_foraneo = ?, raw_json_data = ?, nivel_interes = ?, resumen_ia = ?,
                    ultimo_mensaje_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [
                sedeId, cicloActivo, datos.curp || null, datos.nombre_completo || 'Aspirante UNID',
                datos.fecha_nacimiento || null, datos.sexo || null, datos.estado_nacimiento || null,
                bestPhone, canonical, datos.correo_electronico || null, datos.bachillerato_procedencia || null,
                datos.carrera_interes || 'Por definir', datos.direccion || null, datos.codigo_postal || null,
                datos.campus_interes || 'San Francisco de Campeche', datos.modalidad_estudios || 'Presencial',
                datos.es_foraneo ? 1 : 0, JSON.stringify(datos), datos.nivel_interes || 'Alto',
                datos.resumen_ia || `Ficha completada para ${datos.carrera_interes} (${cicloActivo}).`,
                targetId
            ]);
            return targetId;
        }
    }

    const [result] = await getPool().execute(`
        INSERT INTO aspirantes (
            sede_id, ciclo_escolar, curp, nombre_completo, fecha_nacimiento, sexo, estado_nacimiento,
            telefono_celular, telefono_canonico, correo_electronico, bachillerato_procedencia,
            carrera_interes, direccion, codigo_postal, campus_interes,
            modalidad_estudios, es_foraneo, latitud, longitud, raw_json_data,
            estado_prospecto, nivel_interes, resumen_ia
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        sedeId, cicloActivo, datos.curp || null, datos.nombre_completo || 'Aspirante UNID',
        datos.fecha_nacimiento || null, datos.sexo || null, datos.estado_nacimiento || null,
        phoneToUse || null, canonical || null, datos.correo_electronico || null, datos.bachillerato_procedencia || null,
        datos.carrera_interes || 'Por definir', datos.direccion || null, datos.codigo_postal || null,
        datos.campus_interes || 'San Francisco de Campeche', datos.modalidad_estudios || 'Presencial',
        datos.es_foraneo ? 1 : 0, datos.latitud || null, datos.longitud || null, JSON.stringify(datos),
        datos.estado_prospecto || 'nuevo', datos.nivel_interes || 'Alto',
        datos.resumen_ia || `Aspirante registrado para ${datos.carrera_interes} (${cicloActivo}).`
    ]);
    return result.insertId;
}

/**
 * Bóveda Eterna de Mensajes Auditados (CADA mensaje enviado/recibido se resguarda con rol, autor, modelo, timestamp y adjunto).
 */
async function guardarMensajeHistorialBD(senderPhone, rol, mensaje, sedeId = 'campeche', meta = {}) {
    const canonical = normalizePhoneCanonical(senderPhone);
    const dialPhone = pickBestDialPhone([senderPhone]);
    const adjuntoStr = meta.documentAttachment ? JSON.stringify(meta.documentAttachment) : null;
    try {
        const cicloActivo = await getActiveCicloEscolar(sedeId || 'campeche');
        await getPool().execute(
            `INSERT INTO historial_conversaciones
                (sede_id, ciclo_escolar, telefono_celular, telefono_canonico, rol, remitente_nombre, modelo_ia, whatsapp_message_id, adjunto_json, mensaje)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                sedeId || 'campeche',
                cicloActivo,
                dialPhone,
                canonical,
                rol,
                meta.senderName ? String(meta.senderName).slice(0, 150) : null,
                meta.modelUsed ? String(meta.modelUsed).slice(0, 80) : null,
                meta.whatsappMessageId ? String(meta.whatsappMessageId).slice(0, 120) : null,
                adjuntoStr,
                String(mensaje || '')
            ]
        );
        if (canonical) {
            getPool().execute(
                'UPDATE aspirantes SET ultimo_mensaje_at = CURRENT_TIMESTAMP WHERE telefono_canonico = ?',
                [canonical]
            ).catch(() => {});
        }
    } catch (err) {
        // Fallback si alguna columna aún no fue migrada en una instancia previa
        try {
            const cicloActivo = await getActiveCicloEscolar(sedeId || 'campeche');
            await getPool().execute(
                'INSERT INTO historial_conversaciones (sede_id, ciclo_escolar, telefono_celular, rol, mensaje) VALUES (?, ?, ?, ?, ?)',
                [sedeId || 'campeche', cicloActivo, dialPhone, rol, String(mensaje || '')]
            );
        } catch (_) {}
    }
}

/**
 * Hidrata el contexto conversacional desde MariaDB si la memoria RAM se reinició o expiró por TTL 24h.
 */
async function hydrateConversationFromDb(senderPhone) {
    const canonical = normalizePhoneCanonical(senderPhone);
    if (!canonical || conversationMemory.has(canonical)) return;
    try {
        const [rows] = await getPool().query(
            `SELECT rol, mensaje, remitente_nombre, modelo_ia, adjunto_json, timestamp
             FROM historial_conversaciones
             WHERE telefono_canonico = ?
                OR REPLACE(REPLACE(REPLACE(telefono_celular, '+', ''), ' ', ''), '-', '') LIKE ?
             ORDER BY timestamp DESC LIMIT 20`,
            [canonical, `%${canonical}%`]
        );
        if (rows && rows.length > 0) {
            const ordered = rows.reverse().map(r => {
                let att = null;
                if (r.adjunto_json) { try { att = JSON.parse(r.adjunto_json); } catch (_) {} }
                return {
                    role: r.rol,
                    content: r.mensaje,
                    senderName: r.remitente_nombre || null,
                    modelUsed: r.modelo_ia || null,
                    documentAttachment: att,
                    timestamp: r.timestamp
                };
            });
            conversationMemory.set(canonical, ordered);
            touchUserSession(canonical);
        }
    } catch (_) {}
}

async function processChatMessage(senderPhone, messageText, requestedModelId = null, sedeId = 'campeche', meta = {}) {
    const canonical = normalizePhoneCanonical(senderPhone);
    const dialPhone = pickBestDialPhone([senderPhone]);

    // Hidratar desde MariaDB si el servidor se reinició (CERO pérdida de contexto)
    await hydrateConversationFromDb(canonical);

    // Registrar o actualizar timestamp del lead en MariaDB (deduplicado por telefono_canonico)
    const regResult = await registrarLeadInicialEnBD(dialPhone, messageText, sedeId);
    if (regResult.isNew) {
        dispararNotificacionCorreo('NUEVO_CONTACTO', {
            telefono_celular: dialPhone,
            mensaje_inicial: messageText,
            sede_id: sedeId,
            insertId: regResult.insertId
        }).catch(console.error);
    }

    // Guardar SIEMPRE el mensaje entrante en la bóveda SQL antes de llamar a la IA
    await guardarMensajeHistorialBD(dialPhone, 'user', messageText, sedeId, {
        senderName: regResult.existingLead?.nombre_completo || null,
        whatsappMessageId: meta.whatsappMessageId || null
    });

    // Asegurar que la sesión conozca el número marcable real
    const sess = userSessionState.get(canonical) || { isRegistered: false, isPaused: false };
    sess.dialPhone = pickBestDialPhone([sess.dialPhone, dialPhone]);
    sess.lastActivityAt = Date.now();
    userSessionState.set(canonical, sess);

    const { reply: llmReply, modelUsed } = await callMetalUrielLLM(canonical, messageText, requestedModelId, sedeId);
    const { cleanReply, jsonData } = extractJsonFromLlmReply(llmReply);
    const poolItems = await getActivePoolItems(sedeId);
    const brochureDetected = detectBrochureRequest(messageText, canonical, llmReply, poolItems);
    const formattedAttachment = buildAttachmentObject(brochureDetected);

    const currentHistory = conversationMemory.get(canonical) || [];
    if (currentHistory.length > 0 && currentHistory[currentHistory.length - 1].role === 'assistant') {
        currentHistory[currentHistory.length - 1].content = cleanReply || llmReply;
        currentHistory[currentHistory.length - 1].timestamp = new Date();
        currentHistory[currentHistory.length - 1].modelUsed = modelUsed;
        if (formattedAttachment) currentHistory[currentHistory.length - 1].documentAttachment = formattedAttachment;
    }

    const partialFields = extractPartialFieldsFromHistory(currentHistory);

    if (jsonData && (jsonData.completado || (jsonData.nombre_completo && jsonData.carrera_interes))) {
        const guardrail = securityUtils.validateStructuredLeadJson(jsonData);
        const validatedJson = guardrail.data || jsonData;
        let insertId = null;
        try {
            validatedJson.completado = true;
            if (!validatedJson.telefono_celular) validatedJson.telefono_celular = dialPhone;
            if (!validatedJson.curp && validatedJson.nombre_completo && validatedJson.fecha_nacimiento) {
                validatedJson.curp = generarCurp(validatedJson);
            }
            insertId = await guardarAspiranteEnBD(validatedJson, dialPhone);
            notificarEquipoAdmisiones(validatedJson, insertId).catch(console.error);
        } catch (dbErr) {
            console.error('⚠️ Error guardando en MariaDB:', dbErr.message);
        }

        userSessionState.set(canonical, {
            ...sess,
            isRegistered: true,
            leadData: validatedJson,
            insertId,
            registeredAt: new Date(),
            lastActivityAt: Date.now()
        });

        const finalReply = cleanReply && cleanReply.length > 20 ? cleanReply : (
            `¡Muchas gracias *${validatedJson.nombre_completo || 'estimado aspirante'}*! 🎉\n\n` +
            `He registrado exitosamente tu ficha para la carrera de *${validatedJson.carrera_interes || 'tu carrera de interés'}* en la modalidad *${validatedJson.modalidad_estudios || 'Presencial'}* (Campus: ${validatedJson.campus_interes || 'Campeche'}).\n\n` +
            `¡Bienvenido a la familia UNID! 🔴🐾`
        );
        await guardarMensajeHistorialBD(dialPhone, 'assistant', finalReply, sedeId, {
            senderName: 'Metal-Uriel IA',
            modelUsed,
            documentAttachment: formattedAttachment
        });
        return {
            reply: finalReply,
            completed: true,
            leadCompleted: true,
            leadData: validatedJson,
            partialFields: validatedJson,
            insertId,
            modelUsed,
            documentAttachment: formattedAttachment
        };
    }

    const replyToSend = cleanReply || llmReply;
    await guardarMensajeHistorialBD(dialPhone, 'assistant', replyToSend, sedeId, {
        senderName: 'Metal-Uriel IA',
        modelUsed,
        documentAttachment: formattedAttachment
    });
    return {
        reply: replyToSend,
        completed: false,
        leadCompleted: false,
        leadData: null,
        partialFields,
        modelUsed,
        documentAttachment: formattedAttachment
    };
}

async function seedDemoLeads(connection) {
    const cicloActivo = await getActiveCicloEscolar('campeche');
    const demoLeads = [
        {
            nombre_completo: 'Carlos Alpuche Canul', fecha_nacimiento: '2004-05-15', sexo: 'Masculino',
            estado_nacimiento: 'Campeche', telefono_celular: '5219811234567', correo_electronico: 'carlos.alpuche@gmail.com',
            bachillerato_procedencia: 'COBACAM Plantel 01 Campeche', carrera_interes: 'Licenciatura en Derecho',
            direccion: 'Calle 12 #45 Col. Centro', codigo_postal: '24000', campus_interes: 'San Francisco de Campeche',
            modalidad_estudios: 'Presencial', es_foraneo: 0, estado_prospecto: 'inscrito', conversacion_destacada: 1, nivel_interes: 'Alto',
            resumen_ia: 'Aspirante local muy entusiasta; ya agendó entrega de documentos presencial.'
        },
        {
            nombre_completo: 'Valeria Méndez Cruz', fecha_nacimiento: '2003-11-20', sexo: 'Femenino',
            estado_nacimiento: 'Tabasco', telefono_celular: '5219931238899', correo_electronico: 'valeria.mendez@outlook.com',
            bachillerato_procedencia: 'CBTIS 32 Villahermosa', carrera_interes: 'Licenciatura en Diseño Gráfico Digital',
            direccion: 'Calle Juárez 302, Col. Centro', codigo_postal: '86000', campus_interes: 'San Francisco de Campeche (Virtual)',
            modalidad_estudios: 'Licenciaturas Online', es_foraneo: 1, estado_prospecto: 'en_proceso', conversacion_destacada: 0, nivel_interes: 'Alto',
            resumen_ia: 'Aspirante foránea de Villahermosa; aceptó la modalidad 100% online.'
        },
        {
            nombre_completo: 'Roberto Emiliano Gómez Pech', fecha_nacimiento: '2004-02-10', sexo: 'Masculino',
            estado_nacimiento: 'Yucatán', telefono_celular: '5219992345678', correo_electronico: 'roberto.gomez@gmail.com',
            bachillerato_procedencia: 'Preparatoria Estatal #8 Mérida', carrera_interes: 'Ingeniería en Sistemas y Tecnologías de Información',
            direccion: 'Calle 60 #102 Col. Alcalá Martín', codigo_postal: '97050', campus_interes: 'San Francisco de Campeche (Virtual)',
            modalidad_estudios: 'Licenciaturas Online', es_foraneo: 1, estado_prospecto: 'contactado', conversacion_destacada: 0, nivel_interes: 'Alto',
            resumen_ia: 'Solicitó plan de estudios de Ingeniería en Software y beca por promedio.'
        },
        {
            nombre_completo: 'Mariana Isabel Castillo Ramos', fecha_nacimiento: '2004-08-30', sexo: 'Femenino',
            estado_nacimiento: 'Campeche', telefono_celular: '5219818812233', correo_electronico: null,
            bachillerato_procedencia: null, carrera_interes: 'Licenciatura en Administración y Gestión Empresarial',
            direccion: null, codigo_postal: null, campus_interes: 'San Francisco de Campeche',
            modalidad_estudios: 'Presencial', es_foraneo: 0, estado_prospecto: 'nuevo', conversacion_destacada: 0, nivel_interes: 'Medio',
            resumen_ia: 'Interesada en turno matutino; dejó datos inconclusos para seguimiento humano.'
        },
        {
            nombre_completo: 'Alejandro Morales Fuentes', fecha_nacimiento: '2003-04-12', sexo: 'Masculino',
            estado_nacimiento: 'Veracruz', telefono_celular: '5212291445566', correo_electronico: 'alejandro.morales@gmail.com',
            bachillerato_procedencia: 'COBAEV Plantel 62 Veracruz', carrera_interes: 'Licenciatura en Psicología Organizacional',
            direccion: 'Calle Zaragoza 450', codigo_postal: '91700', campus_interes: 'San Francisco de Campeche (Virtual)',
            modalidad_estudios: 'Licenciaturas Online', es_foraneo: 1, estado_prospecto: 'nuevo', conversacion_destacada: 0, nivel_interes: 'Alto',
            resumen_ia: 'Aspirante foráneo interesado en RRHH; plan cuatrimestral flexible.'
        }
    ];

    for (const lead of demoLeads) {
        lead.curp = generarCurp(lead);
        const canon = normalizePhoneCanonical(lead.telefono_celular);
        await connection.execute(`
            INSERT INTO aspirantes (
                sede_id, ciclo_escolar, curp, nombre_completo, fecha_nacimiento, sexo, estado_nacimiento,
                telefono_celular, telefono_canonico, correo_electronico, bachillerato_procedencia, carrera_interes,
                direccion, codigo_postal, campus_interes, modalidad_estudios, es_foraneo,
                estado_prospecto, conversacion_destacada, fecha_inscripcion, nivel_interes, resumen_ia, raw_json_data
            ) VALUES ('campeche', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            cicloActivo, lead.curp, lead.nombre_completo, lead.fecha_nacimiento, lead.sexo, lead.estado_nacimiento,
            lead.telefono_celular, canon, lead.correo_electronico, lead.bachillerato_procedencia, lead.carrera_interes,
            lead.direccion, lead.codigo_postal, lead.campus_interes, lead.modalidad_estudios, lead.es_foraneo,
            lead.estado_prospecto, lead.conversacion_destacada ? 1 : 0, lead.estado_prospecto === 'inscrito' ? new Date() : null,
            lead.nivel_interes, lead.resumen_ia, JSON.stringify(lead)
        ]);
    }
}

module.exports = {
    registrarLeadInicialEnBD,
    guardarAspiranteEnBD,
    guardarMensajeHistorialBD,
    hydrateConversationFromDb,
    processChatMessage,
    seedDemoLeads
};
