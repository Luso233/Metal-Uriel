const zlib = require('zlib');
const { formatSenderAudit } = require('./chat-audit-utils');

// =========================================================================
// Metal-Uriel — Exportador ZIP Nativo (Zero-Deps PKZIP + DEFLATE + UTF-8)
// Exporta conversaciones auditadas estilo WhatsApp (.txt + .json + .md + adjuntos)
// =========================================================================

// Tabla precalculada CRC-32 (IEEE 802.3)
const CRC32_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c >>> 0;
    }
    return table;
})();

function crc32(buffer) {
    let crc = 0xffffffff;
    for (let i = 0; i < buffer.length; i++) {
        crc = CRC32_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function dateToDos(date = new Date()) {
    const d = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
    const year = Math.max(1980, d.getFullYear()) - 1980;
    const dosTime = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() >> 1) & 0x1f);
    const dosDate = ((year & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f);
    return { dosTime, dosDate };
}

/**
 * Crea un archivo .zip válido en memoria a partir de [{ name: string, data: Buffer|string, date?: Date }]
 */
function createZipBuffer(entries = []) {
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const entry of entries) {
        const cleanName = String(entry.name || 'file.txt').replace(/\\/g, '/').replace(/^\/+/, '');
        const nameBuf = Buffer.from(cleanName, 'utf8');
        const rawBuf = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data ?? ''), 'utf8');
        const compressedBuf = zlib.deflateRawSync(rawBuf, { level: 6 });
        const useDeflate = compressedBuf.length < rawBuf.length;
        const payload = useDeflate ? compressedBuf : rawBuf;
        const method = useDeflate ? 8 : 0; // 8 = DEFLATE, 0 = STORE
        const checksum = crc32(rawBuf);
        const { dosTime, dosDate } = dateToDos(entry.date);

        // Local file header (30 bytes + filename)
        const localHeader = Buffer.alloc(30);
        localHeader.writeUInt32LE(0x04034b50, 0);
        localHeader.writeUInt16LE(20, 4);         // Version needed (2.0)
        localHeader.writeUInt16LE(0x0800, 6);     // UTF-8 filename flag
        localHeader.writeUInt16LE(method, 8);
        localHeader.writeUInt16LE(dosTime, 10);
        localHeader.writeUInt16LE(dosDate, 12);
        localHeader.writeUInt32LE(checksum, 14);
        localHeader.writeUInt32LE(payload.length, 18);
        localHeader.writeUInt32LE(rawBuf.length, 22);
        localHeader.writeUInt16LE(nameBuf.length, 26);
        localHeader.writeUInt16LE(0, 28);         // Extra field length

        localParts.push(localHeader, nameBuf, payload);

        // Central directory header (46 bytes + filename)
        const centralHeader = Buffer.alloc(46);
        centralHeader.writeUInt32LE(0x02014b50, 0);
        centralHeader.writeUInt16LE(20, 4);       // Version made by
        centralHeader.writeUInt16LE(20, 6);       // Version needed
        centralHeader.writeUInt16LE(0x0800, 8);   // UTF-8 flag
        centralHeader.writeUInt16LE(method, 10);
        centralHeader.writeUInt16LE(dosTime, 12);
        centralHeader.writeUInt16LE(dosDate, 14);
        centralHeader.writeUInt32LE(checksum, 16);
        centralHeader.writeUInt32LE(payload.length, 20);
        centralHeader.writeUInt32LE(rawBuf.length, 24);
        centralHeader.writeUInt16LE(nameBuf.length, 28);
        centralHeader.writeUInt16LE(0, 30);       // Extra length
        centralHeader.writeUInt16LE(0, 32);       // Comment length
        centralHeader.writeUInt16LE(0, 34);       // Disk number start
        centralHeader.writeUInt16LE(0, 36);       // Internal attrs
        centralHeader.writeUInt32LE(0, 38);       // External attrs
        centralHeader.writeUInt32LE(offset, 42);  // Relative offset of local header

        centralParts.push(centralHeader, nameBuf);
        offset += localHeader.length + nameBuf.length + payload.length;
    }

    const centralDirBuf = Buffer.concat(centralParts);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(centralDirBuf.length, 12);
    eocd.writeUInt32LE(offset, 16);
    eocd.writeUInt16LE(0, 20);

    return Buffer.concat([...localParts, centralDirBuf, eocd]);
}

function sanitizeFileSlug(text) {
    return String(text || 'aspirante')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 48) || 'aspirante';
}

function formatDateTimeEsMx(ts) {
    const d = ts ? new Date(ts) : new Date();
    if (isNaN(d.getTime())) return 'Sin fecha';
    return d.toLocaleString('es-MX', {
        timeZone: 'America/Merida',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
}

/**
 * Construye el paquete ZIP estilo WhatsApp para auditoría, respaldo y estudio de cierres exitosos.
 */
function buildWhatsAppConversationZip({ aspirante = {}, canonicalPhone = '', dialPhone = '', messages = [], completeness = {}, attachmentFiles = [] }) {
    const nombre = aspirante.nombre_completo || `Aspirante_${canonicalPhone || dialPhone}`;
    const safeSlug = sanitizeFileSlug(nombre);
    const exportDate = new Date();
    const isGolden = aspirante.estado_prospecto === 'inscrito' || Boolean(aspirante.conversacion_destacada);

    // 1. Archivo estilo WhatsApp (.txt) con auditoría completa (Fecha, Hora, Rol, Remitente, Modelo)
    const txtHeader = [
        '========================================================================',
        `HISTORIAL AUDITADO DE CONVERSACIÓN — METAL-URIEL UNID`,
        `Aspirante: ${nombre}`,
        `Teléfono WhatsApp: ${dialPhone || aspirante.telefono_celular || canonicalPhone}`,
        `Clave Canónica: ${canonicalPhone}`,
        `Estado de Postulación: ${(aspirante.estado_prospecto || 'nuevo').toUpperCase()}${isGolden ? ' 🏆 (CASO DE ÉXITO / ESTUDIO)' : ''}`,
        `Carrera de Interés: ${aspirante.carrera_interes || 'Por definir'}`,
        `Campus / Modalidad: ${aspirante.campus_interes || 'Campeche'} (${aspirante.modalidad_estudios || 'Presencial'})`,
        `CURP (RENAPO): ${aspirante.curp || 'Pendiente'}`,
        `Completitud de Ficha: ${completeness.completedCount ?? 0}/${completeness.totalFields ?? 11} datos (${completeness.percent ?? 0}%)`,
        `Total de Mensajes Resguardados: ${messages.length}`,
        `Exportado el: ${formatDateTimeEsMx(exportDate)}`,
        '========================================================================',
        ''
    ];

    const txtLines = messages.map((m) => {
        const audit = formatSenderAudit(m.rol || m.role || m.sender, m.remitente_nombre || m.senderName, m.modelo_ia || m.modelUsed, nombre);
        const dt = formatDateTimeEsMx(m.timestamp);
        const content = String(m.mensaje ?? m.content ?? m.text ?? '').trim();
        let line = `[${dt}] [${audit.roleLabel.toUpperCase()}] ${audit.displayAuthor}: ${content}`;
        const att = m.documentAttachment || m.adjunto;
        if (att && (att.fileName || att.title)) {
            line += `\n    ↳ <Adjunto enviado: ${att.fileName || att.title}>`;
        }
        return line;
    });

    const chatTxt = [...txtHeader, ...txtLines, ''].join('\r\n');

    // 2. Archivo JSON forense completo
    const auditJson = JSON.stringify({
        schema: 'metal-uriel-conversation-audit/v1',
        exportedAt: exportDate.toISOString(),
        isGoldenStudyCase: isGolden,
        canonicalPhone,
        dialPhone: dialPhone || aspirante.telefono_celular || canonicalPhone,
        aspirante: {
            id: aspirante.id || null,
            sede_id: aspirante.sede_id || 'campeche',
            ciclo_escolar: aspirante.ciclo_escolar || '2026-3 Septiembre',
            estado_prospecto: aspirante.estado_prospecto || 'nuevo',
            archivado: Boolean(aspirante.archivado),
            conversacion_destacada: isGolden,
            cerrado_manualmente: Boolean(aspirante.cerrado_manualmente),
            cerrado_por: aspirante.cerrado_por || null,
            fecha_inscripcion: aspirante.fecha_inscripcion || null,
            notas_asesor: aspirante.notas_asesor || null,
            nombre_completo: aspirante.nombre_completo || null,
            curp: aspirante.curp || null,
            fecha_nacimiento: aspirante.fecha_nacimiento || null,
            sexo: aspirante.sexo || null,
            estado_nacimiento: aspirante.estado_nacimiento || null,
            telefono_celular: aspirante.telefono_celular || dialPhone || null,
            correo_electronico: aspirante.correo_electronico || null,
            bachillerato_procedencia: aspirante.bachillerato_procedencia || null,
            carrera_interes: aspirante.carrera_interes || null,
            direccion: aspirante.direccion || null,
            codigo_postal: aspirante.codigo_postal || null,
            campus_interes: aspirante.campus_interes || null,
            modalidad_estudios: aspirante.modalidad_estudios || null,
            nivel_interes: aspirante.nivel_interes || 'Alto',
            resumen_ia: aspirante.resumen_ia || null
        },
        completeness,
        totalMessages: messages.length,
        messages: messages.map((m, idx) => {
            const audit = formatSenderAudit(m.rol || m.role || m.sender, m.remitente_nombre || m.senderName, m.modelo_ia || m.modelUsed, nombre);
            return {
                seq: idx + 1,
                id: m.id || null,
                timestamp: m.timestamp ? new Date(m.timestamp).toISOString() : null,
                role: audit.roleCode,
                roleLabel: audit.roleLabel,
                author: audit.displayAuthor,
                modelUsed: m.modelo_ia || m.modelUsed || null,
                whatsappMessageId: m.whatsapp_message_id || null,
                text: String(m.mensaje ?? m.content ?? m.text ?? ''),
                attachment: m.documentAttachment || m.adjunto || null
            };
        })
    }, null, 2);

    // 3. Resumen Ejecutivo Markdown (listo para imprimir o estudiar cierres)
    const summaryMd = [
        `# ${isGolden ? '🏆 Caso de Éxito (Inscrito)' : '📋 Expediente de Admisión'} — ${nombre}`,
        '',
        `> **Situación Actual (IA):** ${completeness.aiSituationPreview || aspirante.resumen_ia || 'Sin resumen.'}`,
        '',
        '## Datos del Postulante',
        `- **Estado:** \`${aspirante.estado_prospecto || 'nuevo'}\`${aspirante.cerrado_manualmente ? ` (Cerrado manualmente por ${aspirante.cerrado_por || 'Asesor'})` : ''}`,
        `- **Teléfono:** ${dialPhone || aspirante.telefono_celular || canonicalPhone}`,
        `- **Correo:** ${aspirante.correo_electronico || 'Pendiente'}`,
        `- **CURP:** \`${aspirante.curp || 'Pendiente'}\``,
        `- **Carrera:** ${aspirante.carrera_interes || 'Por definir'}`,
        `- **Campus / Modalidad:** ${aspirante.campus_interes || 'Campeche'} • ${aspirante.modalidad_estudios || 'Presencial'}`,
        `- **Bachillerato:** ${aspirante.bachillerato_procedencia || 'Pendiente'}`,
        `- **Avance de Ficha:** ${completeness.completedCount ?? 0}/${completeness.totalFields ?? 11} datos (${completeness.percent ?? 0}%)`,
        completeness.missingFields?.length ? `- **Datos Faltantes:** ${completeness.missingFields.join(', ')}` : '- **Datos Faltantes:** Ninguno (Expediente completo)',
        aspirante.notas_asesor ? `- **Notas del Asesor:** ${aspirante.notas_asesor}` : '',
        '',
        '## Estadísticas de Auditoría de Conversación',
        `- **Total de mensajes:** ${messages.length}`,
        `- **Mensajes del Aspirante:** ${messages.filter(m => (m.rol || m.role || m.sender) === 'user').length}`,
        `- **Mensajes del Robot IA:** ${messages.filter(m => ['assistant', 'bot'].includes(m.rol || m.role || m.sender)).length}`,
        `- **Mensajes de Asesor Humano:** ${messages.filter(m => ['human_advisor', 'advisor'].includes(m.rol || m.role || m.sender)).length}`,
        ''
    ].filter(Boolean).join('\n');

    const entries = [
        { name: `Chat_WhatsApp_${safeSlug}.txt`, data: '\uFEFF' + chatTxt, date: exportDate },
        { name: 'expediente_auditoria.json', data: auditJson, date: exportDate },
        { name: 'resumen_ejecutivo.md', data: summaryMd, date: exportDate }
    ];

    const seenAttachments = new Set();
    for (const att of attachmentFiles) {
        if (!att || !att.fileName || !att.buffer) continue;
        const safeAtt = sanitizeFileSlug(att.fileName.replace(/\.[^.]+$/, '')) + (att.fileName.match(/\.[^.]+$/)?.[0] || '.bin');
        if (seenAttachments.has(safeAtt)) continue;
        seenAttachments.add(safeAtt);
        entries.push({ name: `adjuntos/${safeAtt}`, data: att.buffer, date: exportDate });
    }

    const zipBuffer = createZipBuffer(entries);
    const fileName = `MetalUriel_Chat_${safeSlug}_${exportDate.toISOString().slice(0, 10)}.zip`;
    return { zipBuffer, fileName };
}

module.exports = {
    crc32,
    createZipBuffer,
    buildWhatsAppConversationZip
};
