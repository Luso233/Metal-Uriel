const express = require('express');
const { config } = require('../config/env');
const { conversationMemory, userSessionState, processedMessageIds, touchUserSession } = require('../state/memory');
const { webhookLimiter, verifyMetaWebhookSignature } = require('../middlewares/auth');
const { processChatMessage, guardarMensajeHistorialBD, registrarLeadInicialEnBD } = require('../services/admissions.service');
const { sendWhatsAppMessage } = require('../services/whatsapp.service');
const { normalizePhoneCanonical, pickBestDialPhone } = require('../../lib/chat-audit-utils');

const router = express.Router();

router.get('/webhook', webhookLimiter, (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode && token) {
        if (mode === 'subscribe' && token === config.VERIFY_TOKEN) {
            return res.status(200).send(challenge);
        }
        return res.sendStatus(403);
    }
    return res.sendStatus(400);
});

router.post('/webhook', webhookLimiter, verifyMetaWebhookSignature, async (req, res) => {
    res.status(200).send('EVENT_RECEIVED');

    try {
        const body = req.body;
        if (body?.object === 'whatsapp_business_account' && Array.isArray(body.entry)) {
            for (const entry of body.entry) {
                if (!Array.isArray(entry.changes)) continue;
                for (const change of entry.changes) {
                    const value = change.value;
                    if (!value || (value.statuses && (!value.messages || value.messages.length === 0))) continue;
                    if (!Array.isArray(value.messages)) continue;

                    for (const messageObj of value.messages) {
                        if (!messageObj) continue;
                        const messageId = messageObj.id;
                        if (messageId) {
                            if (processedMessageIds.has(messageId)) continue;
                            processedMessageIds.add(messageId);
                            if (processedMessageIds.size > 2000) {
                                processedMessageIds.delete(processedMessageIds.values().next().value);
                            }
                        }

                        let messageText = '';
                        if (messageObj.type === 'text' && messageObj.text?.body) messageText = messageObj.text.body.trim();
                        else if (messageObj.type === 'button' && messageObj.button?.text) messageText = messageObj.button.text.trim();
                        else if (messageObj.type === 'interactive') messageText = messageObj.interactive?.button_reply?.title || messageObj.interactive?.list_reply?.title || '';
                        if (!messageText) continue;

                        const senderPhone = messageObj.from;
                        const canonical = normalizePhoneCanonical(senderPhone);
                        const session = userSessionState.get(canonical) || userSessionState.get(senderPhone);

                        if (session?.isPaused) {
                            // CRÍTICO: Aunque la IA esté pausada por un asesor humano, persistir SIEMPRE el mensaje en MariaDB
                            if (!conversationMemory.has(canonical)) conversationMemory.set(canonical, []);
                            conversationMemory.get(canonical).push({
                                role: 'user',
                                content: messageText,
                                timestamp: new Date(),
                                whatsappMessageId: messageId || null
                            });
                            session.dialPhone = pickBestDialPhone([session.dialPhone, senderPhone]);
                            userSessionState.set(canonical, session);
                            touchUserSession(canonical);
                            await registrarLeadInicialEnBD(senderPhone, messageText, 'campeche');
                            await guardarMensajeHistorialBD(senderPhone, 'user', messageText, 'campeche', {
                                whatsappMessageId: messageId || null
                            });
                            continue;
                        }

                        const result = await processChatMessage(senderPhone, messageText, null, 'campeche', {
                            whatsappMessageId: messageId || null
                        });
                        await sendWhatsAppMessage(senderPhone, result.reply, result.documentAttachment);
                    }
                }
            }
        }
    } catch (error) {
        console.error('❌ Error procesando el webhook de WhatsApp:', error);
    }
});

module.exports = router;
