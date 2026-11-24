const express = require('express');
const { config } = require('../config/env');
const {
    conversationMemory,
    userSessionState,
    processedMessageIds,
    whatsappMessageStatuses,
    enqueuePhoneTask,
    touchUserSession
} = require('../state/memory');
const { webhookLimiter, verifyMetaWebhookSignature } = require('../middlewares/auth');
const { processChatMessage, guardarMensajeHistorialBD, registrarLeadInicialEnBD } = require('../services/admissions.service');
const { sendWhatsAppMessage, sendWhatsAppReadAndTyping } = require('../services/whatsapp.service');
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
                    if (!value) continue;

                    if (Array.isArray(value.statuses) && value.statuses.length > 0) {
                        for (const st of value.statuses) {
                            if (!st?.id) continue;
                            const firstErr = Array.isArray(st.errors) && st.errors[0]
                                ? `${st.errors[0].code || ''} ${st.errors[0].title || st.errors[0].message || ''}`.trim()
                                : null;
                            whatsappMessageStatuses.set(st.id, {
                                status: st.status || 'unknown',
                                timestamp: st.timestamp ? new Date(Number(st.timestamp) * 1000).toISOString() : new Date().toISOString(),
                                recipientId: st.recipient_id || null,
                                error: firstErr
                            });
                            if (whatsappMessageStatuses.size > 3000) {
                                whatsappMessageStatuses.delete(whatsappMessageStatuses.keys().next().value);
                            }
                            if (st.status === 'failed' && firstErr) {
                                console.error(`❌ [WHATSAPP DELIVERY FAILED] Para ${st.recipient_id || '?'}: ${firstErr}`);
                            }
                        }
                        if (!value.messages || value.messages.length === 0) continue;
                    }
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
                        else if (messageObj.type === 'interactive') {
                            messageText = messageObj.interactive?.button_reply?.title
                                || messageObj.interactive?.list_reply?.title
                                || messageObj.interactive?.nfm_reply?.response_json
                                || '';
                        }
                        if (!messageText) continue;

                        const senderPhone = messageObj.from;
                        const canonical = normalizePhoneCanonical(senderPhone);

                        // Marcar leído (✓✓ azules) + indicador nativo "escribiendo..." al instante (no bloqueante)
                        if (messageId) {
                            sendWhatsAppReadAndTyping(messageId).catch(() => {});
                        }

                        enqueuePhoneTask(canonical, async () => {
                            const tStart = Date.now();
                            const session = userSessionState.get(canonical) || userSessionState.get(senderPhone);
                            if (session?.isPaused) {
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
                                await Promise.allSettled([
                                    registrarLeadInicialEnBD(senderPhone, messageText, 'campeche'),
                                    guardarMensajeHistorialBD(senderPhone, 'user', messageText, 'campeche', { whatsappMessageId: messageId || null })
                                ]);
                                return;
                            }

                            const result = await processChatMessage(senderPhone, messageText, null, 'campeche', {
                                whatsappMessageId: messageId || null,
                                deferPersist: true
                            });
                            const [waSendRes] = await Promise.allSettled([
                                sendWhatsAppMessage(senderPhone, result.reply, result.documentAttachment),
                                result.persistPromise
                            ]);
                            const waIds = waSendRes.status === 'fulfilled' ? waSendRes.value : null;
                            if (waIds?.textMessageId) {
                                const memHist = conversationMemory.get(canonical);
                                if (memHist && memHist.length > 0 && memHist[memHist.length - 1].role === 'assistant') {
                                    memHist[memHist.length - 1].whatsappMessageId = waIds.textMessageId;
                                }
                            }
                            console.log(`⚡ [WEBHOOK TURN TOTAL] [${senderPhone}] ${Date.now() - tStart}ms (IA: ${result.latencyMs || '?'}ms, modelo: ${result.modelUsed})`);
                        }).catch((err) => {
                            console.error(`❌ Error procesando cola de [${senderPhone}]:`, err);
                        });
                    }
                }
            }
        }
    } catch (error) {
        console.error('❌ Error procesando el webhook de WhatsApp:', error);
    }
});

module.exports = router;
