const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { config, ROOT_DIR } = require('../config/env');
const { UPLOADS_DIR, generateOfficialPdfBuffer } = require('./pool.service');

async function resolveAttachmentBinary(documentAttachment) {
    const isImage = documentAttachment.tipo_archivo === 'imagen';
    const safeFileName = documentAttachment.fileName || `Recurso_UNID.${isImage ? 'jpg' : 'pdf'}`;
    const rawUrl = documentAttachment.url_recurso || documentAttachment.pdfUrl || '';

    const inferMimeType = (fname, defaultMime) => {
        const ext = path.extname(String(fname || '')).toLowerCase();
        if (ext === '.png') return 'image/png';
        if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
        if (ext === '.webp') return 'image/webp';
        if (ext === '.pdf') return 'application/pdf';
        return defaultMime;
    };

    if (rawUrl.startsWith('/uploads/')) {
        const localPath = path.join(ROOT_DIR, 'public', rawUrl);
        if (fs.existsSync(localPath)) {
            return {
                buffer: fs.readFileSync(localPath),
                mimeType: inferMimeType(localPath, isImage ? 'image/jpeg' : 'application/pdf'),
                fileName: safeFileName
            };
        }
    }

    if ((rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) && !rawUrl.includes('digitalmedia.talisis.com')) {
        try {
            const resp = await axios.get(rawUrl, { responseType: 'arraybuffer', timeout: 8000 });
            const contentType = resp.headers?.['content-type'] || inferMimeType(safeFileName, isImage ? 'image/jpeg' : 'application/pdf');
            return {
                buffer: Buffer.from(resp.data),
                mimeType: contentType.split(';')[0].trim(),
                fileName: safeFileName
            };
        } catch (err) {
            console.warn(`⚠️ No se pudo descargar recurso externo (${rawUrl}):`, err.message);
        }
    }

    const fallbackDiskPath = path.join(UPLOADS_DIR, safeFileName);
    if (fs.existsSync(fallbackDiskPath) && !isImage) {
        return { buffer: fs.readFileSync(fallbackDiskPath), mimeType: 'application/pdf', fileName: safeFileName };
    }

    const generatedPdf = generateOfficialPdfBuffer(documentAttachment);
    try { fs.writeFileSync(fallbackDiskPath, generatedPdf); } catch (_) {}
    return {
        buffer: generatedPdf,
        mimeType: 'application/pdf',
        fileName: safeFileName.endsWith('.pdf') ? safeFileName : `${safeFileName}.pdf`
    };
}

async function uploadMediaToWhatsAppCloud(buffer, mimeType, fileName) {
    const mediaUrl = `https://graph.facebook.com/v20.0/${config.WHATSAPP_PHONE_NUMBER_ID}/media`;
    const formData = new FormData();
    formData.append('messaging_product', 'whatsapp');
    formData.append('type', mimeType);
    formData.append('file', new Blob([buffer], { type: mimeType }), fileName);

    const response = await fetch(mediaUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.WHATSAPP_TOKEN}` },
        body: formData
    });
    const data = await response.json();
    if (!response.ok || !data.id) {
        throw new Error(data.error?.message || `Error subiendo media a Meta (${response.status})`);
    }
    return data.id;
}

async function sendWhatsAppMessage(to, messageText, documentAttachment = null) {
    if (!config.WHATSAPP_TOKEN || !config.WHATSAPP_PHONE_NUMBER_ID) {
        console.log(`[SIMULACIÓN WHATSAPP] Enviando a ${to}: ${messageText}`);
        return;
    }

    const url = `https://graph.facebook.com/v20.0/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    const headers = { Authorization: `Bearer ${config.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' };

    try {
        if (messageText && messageText.trim()) {
            await axios.post(url, {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to,
                type: 'text',
                text: { body: messageText.trim() }
            }, { headers });
        }

        if (documentAttachment) {
            const { buffer, mimeType, fileName } = await resolveAttachmentBinary(documentAttachment);
            const mediaId = await uploadMediaToWhatsAppCloud(buffer, mimeType, fileName);
            const isImage = mimeType.startsWith('image/');
            await axios.post(url, isImage ? {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to,
                type: 'image',
                image: { id: mediaId, caption: `🏛️ ${documentAttachment.title} (${documentAttachment.modalidad || 'UNID'})` }
            } : {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to,
                type: 'document',
                document: { id: mediaId, filename: fileName, caption: `📄 ${documentAttachment.title} (Validez Oficial SEP: ${documentAttachment.rvoe || 'Oficial UNID'})` }
            }, { headers });
        }
    } catch (error) {
        console.error('❌ Error enviando mensaje/documento a WhatsApp API:', error.response?.data || error.message);
    }
}

module.exports = {
    resolveAttachmentBinary,
    uploadMediaToWhatsAppCloud,
    sendWhatsAppMessage
};
