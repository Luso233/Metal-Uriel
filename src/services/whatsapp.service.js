const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const { config, ROOT_DIR } = require('../config/env');
const { metaMediaIdCache, whatsappMessageStatuses } = require('../state/memory');
const { UPLOADS_DIR, generateOfficialPdfBuffer } = require('./pool.service');

const MEDIA_CACHE_TTL_MS = 20 * 24 * 60 * 60 * 1000;

async function sendWhatsAppReadAndTyping(messageId) {
    if (!messageId || !config.WHATSAPP_TOKEN || !config.WHATSAPP_PHONE_NUMBER_ID) return false;
    const url = `https://graph.facebook.com/${config.META_GRAPH_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    const headers = { Authorization: `Bearer ${config.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' };
    try {
        await axios.post(url, {
            messaging_product: 'whatsapp',
            status: 'read',
            message_id: messageId,
            typing_indicator: { type: 'text' }
        }, { headers, timeout: 5000 });
        return true;
    } catch (_) {
        try {
            await axios.post(url, {
                messaging_product: 'whatsapp',
                status: 'read',
                message_id: messageId
            }, { headers, timeout: 4000 });
            return true;
        } catch (__) {
            return false;
        }
    }
}

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

async function uploadMediaToWhatsAppCloud(buffer, mimeType, fileName, { forceRefresh = false } = {}) {
    const hashPrefix = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16);
    const cacheKey = `${config.WHATSAPP_PHONE_NUMBER_ID}:${fileName}:${buffer.length}:${hashPrefix}`;
    if (!forceRefresh) {
        const cached = metaMediaIdCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            console.log(`⚡ [META MEDIA CACHE HIT] Reutilizando media_id ${cached.mediaId} para "${fileName}"`);
            return cached.mediaId;
        }
    }

    const mediaUrl = `https://graph.facebook.com/${config.META_GRAPH_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}/media`;
    const formData = new FormData();
    formData.append('messaging_product', 'whatsapp');
    formData.append('type', mimeType);
    formData.append('file', new Blob([buffer], { type: mimeType }), fileName);

    const response = await fetch(mediaUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.WHATSAPP_TOKEN}` },
        body: formData,
        signal: AbortSignal.timeout(15000)
    });
    const data = await response.json();
    if (!response.ok || !data.id) {
        throw new Error(data.error?.message || `Error subiendo media a Meta (${response.status})`);
    }
    metaMediaIdCache.set(cacheKey, { mediaId: data.id, expiresAt: Date.now() + MEDIA_CACHE_TTL_MS });
    return data.id;
}

async function sendWhatsAppMessage(to, messageText, documentAttachment = null, opts = {}) {
    if (!config.WHATSAPP_TOKEN || !config.WHATSAPP_PHONE_NUMBER_ID) {
        console.log(`[SIMULACIÓN WHATSAPP] Enviando a ${to}: ${messageText}`);
        return { simulated: true, textMessageId: null, mediaMessageId: null };
    }

    const url = `https://graph.facebook.com/${config.META_GRAPH_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    const headers = { Authorization: `Bearer ${config.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' };
    const resultIds = { simulated: false, textMessageId: null, mediaMessageId: null };

    try {
        if (messageText && messageText.trim()) {
            const quickReplies = Array.isArray(opts.quickReplies) ? opts.quickReplies.filter(Boolean).slice(0, 3) : [];
            const payload = quickReplies.length > 0
                ? {
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to,
                    type: 'interactive',
                    interactive: {
                        type: 'button',
                        body: { text: messageText.trim().slice(0, 1024) },
                        action: {
                            buttons: quickReplies.map((btn, idx) => ({
                                type: 'reply',
                                reply: {
                                    id: String(btn.id || `btn_${idx + 1}`).slice(0, 256),
                                    title: String(btn.title || btn).slice(0, 20)
                                }
                            }))
                        }
                    }
                }
                : {
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to,
                    type: 'text',
                    text: { preview_url: false, body: messageText.trim() }
                };

            const textResp = await axios.post(url, payload, { headers, timeout: 10000 });
            resultIds.textMessageId = textResp.data?.messages?.[0]?.id || null;
            if (resultIds.textMessageId) {
                whatsappMessageStatuses.set(resultIds.textMessageId, {
                    status: 'sent',
                    timestamp: new Date().toISOString(),
                    recipientId: to,
                    error: null
                });
            }
        }

        if (documentAttachment) {
            const { buffer, mimeType, fileName } = await resolveAttachmentBinary(documentAttachment);
            const isImage = mimeType.startsWith('image/');
            const sendMediaWithId = (mediaId) => axios.post(url, isImage ? {
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
            }, { headers, timeout: 12000 });

            let mediaId = await uploadMediaToWhatsAppCloud(buffer, mimeType, fileName);
            try {
                const resp = await sendMediaWithId(mediaId);
                resultIds.mediaMessageId = resp.data?.messages?.[0]?.id || null;
            } catch (mediaErr) {
                console.warn(`⚠️ [META MEDIA RETRY] Refrescando media_id para ${fileName}: ${mediaErr.message}`);
                mediaId = await uploadMediaToWhatsAppCloud(buffer, mimeType, fileName, { forceRefresh: true });
                const resp = await sendMediaWithId(mediaId);
                resultIds.mediaMessageId = resp.data?.messages?.[0]?.id || null;
            }
        }
    } catch (error) {
        console.error('❌ Error enviando mensaje/documento a WhatsApp API:', error.response?.data || error.message);
    }
    return resultIds;
}

module.exports = {
    resolveAttachmentBinary,
    uploadMediaToWhatsAppCloud,
    sendWhatsAppReadAndTyping,
    sendWhatsAppMessage
};
