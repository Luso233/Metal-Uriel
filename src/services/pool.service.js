const fs = require('fs');
const path = require('path');
const { ROOT_DIR } = require('../config/env');
const { getPool } = require('../db/pool');
const { conversationMemory, userSessionState, activeSchoolCyclesMemory } = require('../state/memory');
const { normalizeForMatch } = require('../utils/curp');

const BROCHURES_FILE_PATH = path.join(ROOT_DIR, 'brochures.json');
const UPLOADS_DIR = path.join(ROOT_DIR, 'public', 'uploads', 'recursos');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

let UNID_BROCHURES = [];

function loadBrochuresFromDisk() {
    try {
        if (fs.existsSync(BROCHURES_FILE_PATH)) {
            UNID_BROCHURES = JSON.parse(fs.readFileSync(BROCHURES_FILE_PATH, 'utf-8'));
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

async function getActiveCicloEscolar(sedeId = 'campeche') {
    const cleanSede = sedeId || 'campeche';
    try {
        const [rows] = await getPool().query('SELECT ciclo_activo FROM ciclos_escolares_sede WHERE sede_id = ? LIMIT 1', [cleanSede]);
        if (rows.length > 0 && rows[0].ciclo_activo) {
            activeSchoolCyclesMemory.set(cleanSede, rows[0].ciclo_activo);
            return rows[0].ciclo_activo;
        }
    } catch (_) {}
    return activeSchoolCyclesMemory.get(cleanSede) || '2026-3 Septiembre';
}

function generateOfficialPdfBuffer(resource = {}) {
    const cleanPdfText = (str) => String(str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[()\\]/g, '')
        .replace(/[^\x20-\x7E]/g, ' ')
        .trim();

    const title = cleanPdfText(resource.titulo || resource.carrera || resource.title || 'Plan de Estudios Oficial UNID');
    const mod = cleanPdfText(resource.modalidad || 'Presencial Campus Campeche & Online');
    const dur = cleanPdfText(resource.duracion || '3 anos - 9 cuatrimestres');
    const rvoe = cleanPdfText(resource.rvoe || 'SEP-RVOE-OFICIAL');
    const desc = cleanPdfText(resource.descripcion_ia || 'Programa academico oficial de la Universidad Interamericana para el Desarrollo (UNID).');

    const wrapLines = (text, maxChars = 76) => {
        const words = text.split(/\s+/).filter(Boolean);
        const lines = [];
        let current = '';
        for (const w of words) {
            if ((current + ' ' + w).trim().length > maxChars) {
                if (current) lines.push(current);
                current = w;
            } else {
                current = (current + ' ' + w).trim();
            }
        }
        if (current) lines.push(current);
        return lines.slice(0, 6);
    };

    const descLines = wrapLines(desc, 74);
    const streamOps = [
        'q',
        '0.04 0.10 0.18 rg',
        '0 700 612 92 re f',
        '1.00 0.78 0.17 rg',
        '0 694 612 6 re f',
        'BT',
        '/F1 20 Tf',
        '1 1 1 rg',
        '48 750 Td',
        '(:UNID - UNIVERSIDAD INTERAMERICANA PARA EL DESARROLLO) Tj',
        '/F2 11 Tf',
        '1.00 0.78 0.17 rg',
        '0 -22 Td',
        '(CAMPUS SAN FRANCISCO DE CAMPECHE | FICHA Y PLAN DE ESTUDIOS OFICIAL 2026) Tj',
        '0 -64 Td',
        '/F1 16 Tf',
        '0.04 0.10 0.18 rg',
        `(${title.substring(0, 62)}) Tj`,
        '0 -26 Td',
        '/F2 11 Tf',
        '0.18 0.24 0.34 rg',
        `(Modalidad: ${mod}) Tj`,
        '0 -18 Td',
        `(Duracion: ${dur}) Tj`,
        '0 -18 Td',
        `(Validez Oficial SEP: ${rvoe}) Tj`,
        '0 -28 Td',
        '/F1 12 Tf',
        '0.04 0.10 0.18 rg',
        '(DESCRIPCION ACADEMICA Y MODELO DUAL UNID:) Tj',
        '0 -18 Td',
        '/F2 10.5 Tf',
        '0.15 0.20 0.28 rg'
    ];
    for (const line of descLines) {
        streamOps.push(`(${line}) Tj`);
        streamOps.push('0 -16 Td');
    }
    streamOps.push(
        '0 -16 Td',
        '/F1 12 Tf',
        '0.04 0.10 0.18 rg',
        '(BENEFICIOS Y REQUISITOS DE ADMISION:) Tj',
        '0 -18 Td',
        '/F2 10.5 Tf',
        '0.15 0.20 0.28 rg',
        '(1. Acta de Nacimiento original y copia certificada.) Tj',
        '0 -18 Td',
        '(2. Certificado Total de Bachillerato o Constancia de Estudios.) Tj',
        '0 -18 Td',
        '(3. Clave Unica de Registro de Poblacion - CURP actualizada.) Tj',
        '0 -28 Td',
        '/F1 11 Tf',
        '0.04 0.36 0.29 rg',
        '(Atencion Oficial WhatsApp UNID Campeche: Metal-Uriel • Admisiones 2026) Tj',
        'ET',
        'Q'
    );

    const streamContent = streamOps.join('\n');
    const streamByteLen = Buffer.byteLength(streamContent, 'utf8');
    const objects = [
        `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`,
        `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`,
        `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n`,
        `4 0 obj\n<< /Length ${streamByteLen} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
        `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`,
        `6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`
    ];

    let pdfBody = '%PDF-1.4\n';
    const offsets = [];
    for (const objStr of objects) {
        offsets.push(Buffer.byteLength(pdfBody, 'utf8'));
        pdfBody += objStr;
    }
    const xrefStart = Buffer.byteLength(pdfBody, 'utf8');
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) xref += `${String(off).padStart(10, '0')} 00000 n \n`;
    xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
    return Buffer.from(pdfBody + xref, 'utf8');
}

async function seedInitialPoolResources(connection) {
    for (const b of UNID_BROCHURES) {
        const cat = b.id === 'becas' ? 'becas_costos' : 'plan_estudios';
        const tagsStr = Array.isArray(b.tags) ? b.tags.join(', ') : String(b.tags || b.id);
        const descIa = b.id === 'becas'
            ? `Guía oficial de becas académicas (hasta 50%), descuentos de inscripción (90%) y financiamiento educativo UNID.`
            : `Plan de estudios oficial de ${b.carrera}. Modalidad: ${b.modalidad}. Duración: ${b.duracion}. Reconocimiento SEP: ${b.rvoe}. Incluye mapa curricular por cuatrimestre y Estadía Empresarial.`;

        await connection.execute(`
            INSERT IGNORE INTO pool_recursos_multimedia (
                codigo_recurso, sede_id, ciclo_escolar, categoria, titulo, descripcion_ia,
                tags, tipo_archivo, url_recurso, file_name, modalidad, duracion, rvoe, tamano, activo, updated_by
            ) VALUES (?, 'campeche', '2026-3 Septiembre', ?, ?, ?, ?, 'pdf', ?, ?, ?, ?, ?, ?, 1, 'Sistema UNID')
        `, [
            b.id, cat, b.carrera, descIa, tagsStr,
            b.pdfUrl || `/api/brochures/${b.id}/download`,
            b.fileName || `Plan_${b.id}.pdf`,
            b.modalidad || 'Presencial & Online',
            b.duracion || '3 años (9 cuatrimestres)',
            b.rvoe || 'SEP-RVOE-OFICIAL',
            b.size || '1.3 MB'
        ]);
    }
}

async function materializeAllPoolPdfsOnDisk(connection = null) {
    try {
        for (const b of UNID_BROCHURES) {
            const safeFile = b.fileName || `Plan_${b.id}.pdf`;
            const diskPath = path.join(UPLOADS_DIR, safeFile);
            if (!fs.existsSync(diskPath)) {
                fs.writeFileSync(diskPath, generateOfficialPdfBuffer(b));
            }
        }
        const queryTarget = connection || getPool();
        const [rows] = await queryTarget.query('SELECT * FROM pool_recursos_multimedia WHERE tipo_archivo = "pdf"');
        for (const r of rows) {
            const safeFile = r.file_name || `Recurso_${r.codigo_recurso}.pdf`;
            const diskPath = path.join(UPLOADS_DIR, safeFile);
            if (!fs.existsSync(diskPath)) {
                fs.writeFileSync(diskPath, generateOfficialPdfBuffer(r));
            }
        }
    } catch (err) {
        console.warn('⚠️ Advertencia materializando PDFs en disco:', err.message);
    }
}

async function getActivePoolItems(sedeId = null) {
    try {
        let query = 'SELECT * FROM pool_recursos_multimedia WHERE activo = 1';
        const params = [];
        if (sedeId && sedeId !== 'all' && sedeId !== 'todas') {
            query += ' AND (sede_id = ? OR sede_id = "global" OR sede_id IS NULL)';
            params.push(sedeId);
        }
        query += ' ORDER BY id ASC';
        const [rows] = await getPool().query(query, params);
        if (rows && rows.length > 0) {
            return rows.map(r => {
                let parsedTags = [];
                try {
                    parsedTags = typeof r.tags === 'string' ? JSON.parse(r.tags) : (Array.isArray(r.tags) ? r.tags : []);
                } catch (_) {
                    parsedTags = String(r.tags || '').split(',').map(t => t.trim()).filter(Boolean);
                }
                return {
                    id: r.codigo_recurso || String(r.id),
                    dbId: r.id,
                    codigo_recurso: r.codigo_recurso || String(r.id),
                    sede_id: r.sede_id || 'campeche',
                    ciclo_escolar: r.ciclo_escolar || '2026-3 Septiembre',
                    categoria: r.categoria || 'plan_estudios',
                    titulo: r.titulo,
                    carrera: r.titulo,
                    descripcion_ia: r.descripcion_ia || '',
                    scope: r.scope || 'campus_campeche',
                    scopeLabel: r.scope_label || '🏛️ Campus Campeche',
                    modalidad: r.modalidad || 'Presencial',
                    duracion: r.duracion || '3 años (9 cuatrimestres)',
                    rvoe: r.rvoe || 'SEP-RVOE-OFICIAL',
                    tipo_archivo: r.tipo_archivo || 'pdf',
                    fileName: r.file_name || `${r.codigo_recurso}.pdf`,
                    pdfUrl: r.url_recurso || `/api/brochures/${r.codigo_recurso}/download`,
                    url_recurso: r.url_recurso || `/api/brochures/${r.codigo_recurso}/download`,
                    size: r.tamano || '1.2 MB',
                    tags: parsedTags
                };
            });
        }
    } catch (_) {}

    return UNID_BROCHURES.map(b => ({
        ...b,
        codigo_recurso: b.id,
        categoria: b.id === 'becas' ? 'becas_costos' : 'plan_estudios',
        titulo: b.carrera,
        descripcion_ia: `${b.carrera} (${b.modalidad}). Duración: ${b.duracion}. RVOE: ${b.rvoe}.`,
        tipo_archivo: 'pdf',
        url_recurso: b.pdfUrl
    }));
}

function detectBrochureRequest(userMessage, senderPhone = null, llmReply = '', poolItems = null) {
    const catalog = Array.isArray(poolItems) && poolItems.length > 0 ? poolItems : UNID_BROCHURES.map(b => ({
        ...b,
        codigo_recurso: b.id,
        categoria: b.id === 'becas' ? 'becas_costos' : 'plan_estudios',
        titulo: b.carrera
    }));

    const explicitResourceMatch = (llmReply || '').match(/\[ADJUNTAR_RECURSO\s*:\s*([a-zA-Z0-9_\-\s]+)\]/i);
    if (explicitResourceMatch && explicitResourceMatch[1]) {
        const targetCode = normalizeForMatch(explicitResourceMatch[1]);
        const exactFound = catalog.find(item =>
            normalizeForMatch(item.codigo_recurso || item.id) === targetCode ||
            normalizeForMatch(item.titulo || item.carrera).includes(targetCode)
        );
        if (exactFound) return exactFound;
    }

    const userNorm = normalizeForMatch(userMessage);
    const replyNorm = normalizeForMatch(llmReply);
    const hasGenericAiTag = /\[(?:ENVIAR_PDF|ADJUNTAR_RECURSO)/i.test(llmReply || '');

    let userConfirmedPreviousOffer = false;
    let lastAssistantMessageNorm = '';
    if (senderPhone) {
        const history = conversationMemory.get(senderPhone) || [];
        const assistantMsgs = history.filter(h => h.role === 'assistant');
        if (assistantMsgs.length >= 2) lastAssistantMessageNorm = normalizeForMatch(assistantMsgs[assistantMsgs.length - 2].content || '');
        else if (assistantMsgs.length === 1) lastAssistantMessageNorm = normalizeForMatch(assistantMsgs[0].content || '');

        const botOfferedFile = /(?:te gustaria que te envie|quieres que te envie|te comparto el pdf|enviarte el plan|mandarte el pdf|enviarte la imagen|te envio el archivo|te mando el plan)/i.test(lastAssistantMessageNorm);
        const userSaidYes = /\b(?:si|sii+|claro|por favor|porfa|mandamelo|enviamelo|pasamelo|adelante|va|ok|dale|me gustaria|si quiero)\b/i.test(userNorm);
        if (botOfferedFile && userSaidYes) userConfirmedPreviousOffer = true;
    }

    const isAiJustAskingConfirmation = /\?\s*$/.test((llmReply || '').trim()) &&
        /(?:te gustaria que te envie|quieres que te envie|te gustaria recibir el pdf|quieres que te mande)/i.test(replyNorm) &&
        !hasGenericAiTag;

    if (isAiJustAskingConfirmation && !userConfirmedPreviousOffer) return null;

    const isUserAskingForDocDirectly = /\b(?:plan de estudios?|temario|malla curricular|folleto|pdf|brochure|horarios?|instalaciones|fotos?|oferta educativa|guia de becas)\b/i.test(userNorm) &&
        /\b(?:mand\w*|envi\w*|pas\w*|descarg\w*|compart\w*|adjunt\w*)\b/i.test(userNorm);

    if (!hasGenericAiTag && !userConfirmedPreviousOffer && !isUserAskingForDocDirectly) return null;

    const findMatchInText = (normText) => {
        if (!normText) return null;
        for (const item of catalog) {
            const tags = Array.isArray(item.tags) ? item.tags : [];
            if (tags.some(t => {
                const cleanTag = normalizeForMatch(t);
                return cleanTag.length >= 3 && normText.includes(cleanTag);
            })) return item;
        }
        return null;
    };

    const m1 = findMatchInText(userNorm);
    if (m1) return m1;
    if (lastAssistantMessageNorm) {
        const m2 = findMatchInText(lastAssistantMessageNorm);
        if (m2) return m2;
    }
    const m3 = findMatchInText(replyNorm);
    if (m3) return m3;

    if (senderPhone) {
        const session = userSessionState.get(senderPhone);
        if (session?.leadData?.carrera_interes) {
            const m4 = findMatchInText(normalizeForMatch(session.leadData.carrera_interes));
            if (m4) return m4;
        }
        const history = conversationMemory.get(senderPhone) || [];
        for (let i = history.length - 1; i >= 0; i--) {
            const m5 = findMatchInText(normalizeForMatch(history[i].content || ''));
            if (m5) return m5;
        }
    }

    if (/\bhorario/i.test(userNorm)) return catalog.find(i => i.categoria === 'horarios') || null;
    if (/\binstalacion|\bfoto|\bcampus|\blaboratorio/i.test(userNorm)) return catalog.find(i => i.categoria === 'instalaciones') || null;
    if (/\boferta educativa|\bcarreras disponibles|\btodas las carreras/i.test(userNorm)) return catalog.find(i => i.categoria === 'oferta_educativa') || null;
    if (/\bbecas?\b|\bcostos?\b|\bfinanciamiento\b|\bprecios?\b/i.test(userNorm)) return catalog.find(i => i.categoria === 'becas_costos' || i.id === 'becas') || null;

    return null;
}

function buildAttachmentObject(resourceItem) {
    if (!resourceItem) return null;
    const isImage = resourceItem.tipo_archivo === 'imagen';
    const resourceId = resourceItem.codigo_recurso || resourceItem.id;
    let rawUrl = resourceItem.url_recurso || resourceItem.pdfUrl || `/api/brochures/${resourceId}/download`;
    if (String(rawUrl).includes('digitalmedia.talisis.com')) {
        rawUrl = `/api/brochures/${resourceId}/download`;
    }
    const categoryTitles = {
        plan_estudios: 'Plan de Estudios',
        oferta_educativa: 'Oferta Educativa',
        horarios: 'Horario Oficial',
        instalaciones: 'Instalaciones UNID',
        becas_costos: 'Guía de Becas y Costos'
    };
    const prefix = categoryTitles[resourceItem.categoria] || 'Recurso Oficial';
    return {
        id: resourceId,
        codigo_recurso: resourceId,
        categoria: resourceItem.categoria || 'plan_estudios',
        tipo_archivo: resourceItem.tipo_archivo || 'pdf',
        title: `${prefix}: ${resourceItem.titulo || resourceItem.carrera}`,
        titulo: resourceItem.titulo || resourceItem.carrera,
        descripcion_ia: resourceItem.descripcion_ia || '',
        duracion: resourceItem.duracion || '3 años (9 cuatrimestres)',
        fileName: resourceItem.fileName || resourceItem.file_name || `${resourceId}.${isImage ? 'png' : 'pdf'}`,
        size: resourceItem.size || resourceItem.tamano || '1.2 MB',
        rvoe: resourceItem.rvoe || 'Oficial UNID',
        modalidad: resourceItem.modalidad || 'Presencial',
        pdfUrl: rawUrl,
        url_recurso: rawUrl,
        downloadUrl: rawUrl.startsWith('/uploads/') || rawUrl.startsWith('http') ? rawUrl : `/api/brochures/${resourceId}/download`
    };
}

function saveUploadedBase64File(fileData, originalFileName, prefixCode = 'recurso') {
    if (!fileData || typeof fileData !== 'string' || !fileData.startsWith('data:')) return null;
    const matches = fileData.match(/^data:([A-Za-z0-9-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) return null;

    const mimeType = matches[1].toLowerCase();
    const buffer = Buffer.from(matches[2], 'base64');

    let ext = '.pdf';
    if (mimeType.includes('png')) ext = '.png';
    else if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = '.jpg';
    else if (mimeType.includes('webp')) ext = '.webp';
    else if (originalFileName && path.extname(originalFileName)) ext = path.extname(originalFileName).toLowerCase();

    const safeBase = (originalFileName ? path.basename(originalFileName, path.extname(originalFileName)) : prefixCode)
        .replace(/[^a-zA-Z0-9_\-]/g, '_')
        .substring(0, 50);
    const finalFileName = `${Date.now()}_${safeBase}${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, finalFileName), buffer);

    const sizeKB = Math.round(buffer.length / 1024);
    return {
        url_recurso: `/uploads/recursos/${finalFileName}`,
        file_name: originalFileName || finalFileName,
        tamano: sizeKB >= 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`,
        tipo_archivo: ['.png', '.jpg', '.jpeg', '.webp'].includes(ext) ? 'imagen' : 'pdf'
    };
}

module.exports = {
    UPLOADS_DIR,
    getBrochures: () => UNID_BROCHURES,
    loadBrochuresFromDisk,
    saveBrochuresToDisk,
    getActiveCicloEscolar,
    generateOfficialPdfBuffer,
    seedInitialPoolResources,
    materializeAllPoolPdfsOnDisk,
    getActivePoolItems,
    detectBrochureRequest,
    buildAttachmentObject,
    saveUploadedBase64File
};
