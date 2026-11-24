const crypto = require('crypto');
const axios = require('axios');
const nodemailer = require('nodemailer');
const { config } = require('../config/env');
const { getPool, isDatabaseReady } = require('../db/pool');
const { emailNotificationHistory, systemAlertCooldowns, llmTelemetryBuffer } = require('../state/memory');
const setupUtils = require('../../lib/setup-utils');
const securityUtils = require('../../lib/security-utils');

async function getMailTransporter() {
    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (smtpHost && smtpUser && smtpPass && !setupUtils.isPlaceholderValue(smtpPass)) {
        return {
            transporter: nodemailer.createTransport({
                host: smtpHost,
                port: Number(process.env.SMTP_PORT) || 587,
                secure: Number(process.env.SMTP_PORT) === 465,
                auth: { user: smtpUser, pass: smtpPass }
            }),
            from: `"UNID Admisiones • Metal-Uriel" <${smtpUser}>`,
            mode: 'smtp_live'
        };
    }

    try {
        const testAccount = await nodemailer.createTestAccount();
        return {
            transporter: nodemailer.createTransport({
                host: 'smtp.ethereal.email',
                port: 587,
                secure: false,
                auth: { user: testAccount.user, pass: testAccount.pass }
            }),
            from: `"UNID Admisiones • Metal-Uriel" <${testAccount.user}>`,
            mode: 'ethereal_test'
        };
    } catch (_) {
        return { transporter: null, from: 'noreply@unid.mx', mode: 'console_only' };
    }
}

async function dispararNotificacionCorreo(eventoTipo, payload = {}) {
    const isSystemAlert = eventoTipo === 'ALERTA_SISTEMA';
    const destinatario = (
        payload.to ||
        (isSystemAlert
            ? (process.env.ALERT_ADMIN_EMAIL || process.env.ADMISSIONS_NOTIFICATION_EMAIL)
            : (process.env.ADMISSIONS_NOTIFICATION_EMAIL || process.env.ALERT_ADMIN_EMAIL)) ||
        'admisiones.campeche@unid.mx'
    ).trim();
    let subject = '';
    let htmlContent = '';

    const fechaHora = new Date().toLocaleString('es-MX', { timeZone: 'America/Merida' });

    if (eventoTipo === 'NUEVO_CONTACTO') {
        subject = 'Nuevo prospecto en WhatsApp';
        const phone = payload.telefono_celular || payload.phone || 'Desconocido';
        const msg = payload.mensaje_inicial || 'Inició conversación';
        const sede = payload.sede_id || 'campeche';

        htmlContent = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; background: #0B192C; padding: 24px; color: #f8fafc;">
            <div style="max-width: 600px; margin: 0 auto; background: #1E293B; border-radius: 16px; overflow: hidden; border: 1px solid #334155; border-top: 6px solid #38bdf8;">
                <div style="padding: 20px 24px; background: #0F172A; border-bottom: 1px solid #334155;">
                    <h2 style="margin: 0; font-size: 18px; color: #38bdf8;">💬 Evento A: Nuevo prospecto en WhatsApp</h2>
                    <p style="margin: 4px 0 0 0; font-size: 12px; color: #94a3b8;">Captado por Webhook Metal-Uriel • ${fechaHora}</p>
                </div>
                <div style="padding: 24px;">
                    <p style="font-size: 14px; color: #e2e8f0; margin-top: 0;">Se ha detectado un nuevo número iniciando conversación con el asistente de admisiones:</p>
                    <div style="background: #0F172A; border-radius: 12px; padding: 16px; border: 1px solid #334155; margin: 16px 0;">
                        <p style="margin: 6px 0; font-size: 14px; color: #f8fafc;">📱 <strong>Teléfono WhatsApp:</strong> <span style="color: #38bdf8;">${phone}</span></p>
                        <p style="margin: 6px 0; font-size: 14px; color: #f8fafc;">🏛️ <strong>Sede Asignada:</strong> <span style="color: #FFC72C; text-transform: uppercase;">${sede}</span></p>
                        <p style="margin: 6px 0; font-size: 14px; color: #f8fafc;">🆔 <strong>ID Lead Inicial en BD:</strong> #${payload.insertId || 'En proceso'}</p>
                        <p style="margin: 10px 0 0 0; padding-top: 10px; border-top: 1px solid #1E293B; font-size: 13px; color: #cbd5e1;">💬 <strong>Primer Mensaje:</strong> <em>"${msg}"</em></p>
                    </div>
                    <p style="font-size: 12px; color: #94a3b8;">Metal-Uriel ya se encuentra atendiendo al prospecto en tiempo real para recopilar sus 11 datos oficiales.</p>
                </div>
            </div>
        </div>`;
    } else if (eventoTipo === 'DATOS_COMPLETOS') {
        const d = payload.datos || payload;
        const nombre = d.nombre_completo || 'Aspirante UNID';
        subject = `Ficha de aspirante completada - ${nombre}`;
        const jsonPretty = JSON.stringify(d, null, 2);

        htmlContent = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; background: #0B192C; padding: 24px; color: #f8fafc;">
            <div style="max-width: 640px; margin: 0 auto; background: #1E293B; border-radius: 16px; overflow: hidden; border: 1px solid #334155; border-top: 6px solid #FFC72C;">
                <div style="padding: 20px 24px; background: #0F172A; border-bottom: 1px solid #334155;">
                    <h2 style="margin: 0; font-size: 19px; color: #FFC72C;">📋 Evento B: Ficha de aspirante completada - ${nombre}</h2>
                    <p style="margin: 4px 0 0 0; font-size: 12px; color: #94a3b8;">11 Datos Oficiales Recopilados por IA • Ficha ID #${payload.insertId || 'N/A'}</p>
                </div>
                <div style="padding: 24px;">
                    <div style="background: #0F172A; border-radius: 12px; padding: 16px; margin-bottom: 18px; border: 1px solid #334155;">
                        <h3 style="margin: 0 0 8px 0; font-size: 17px; color: #ffffff;">${nombre}</h3>
                        <p style="margin: 4px 0; font-size: 14px; color: #FFC72C; font-weight: bold;">🎓 ${d.carrera_interes || 'Sin especificar'}</p>
                        <p style="margin: 4px 0; font-size: 13px; color: #38bdf8; font-family: monospace;">🆔 CURP Calculada (RENAPO): <strong>${d.curp || 'Calculada en sistema'}</strong></p>
                        <p style="margin: 4px 0; font-size: 13px; color: #cbd5e1;">📍 Campus: <strong>${d.campus_interes || 'Campeche'}</strong> • Modalidad: <strong>${d.modalidad_estudios || 'Presencial'}</strong></p>
                    </div>
                    <pre style="background: #090D16; color: #38bdf8; padding: 14px; border-radius: 10px; border: 1px solid #334155; font-size: 11px; overflow-x: auto; font-family: Consolas, monospace;">${jsonPretty}</pre>
                </div>
            </div>
        </div>`;
    } else if (eventoTipo === 'CIERRE_INSCRITO') {
        const lead = payload.lead || payload;
        const nombre = lead.nombre_completo || 'Alumno UNID';
        subject = `¡Nuevo Alumno Inscrito! - ${nombre}`;

        htmlContent = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; background: #0B192C; padding: 24px; color: #f8fafc;">
            <div style="max-width: 600px; margin: 0 auto; background: #1E293B; border-radius: 16px; overflow: hidden; border: 1px solid #059669; border-top: 6px solid #10B981;">
                <div style="padding: 20px 24px; background: #064E3B; border-bottom: 1px solid #059669;">
                    <h2 style="margin: 0; font-size: 20px; color: #A7F3D0;">🎉 Evento C: ¡Nuevo Alumno Inscrito! - ${nombre}</h2>
                    <p style="margin: 4px 0 0 0; font-size: 12px; color: #6EE7B7;">Cierre confirmado en Tablero Kanban • ${fechaHora}</p>
                </div>
                <div style="padding: 24px;">
                    <h3 style="margin: 0 0 8px 0; font-size: 18px; color: #ffffff;">${nombre}</h3>
                    <p style="margin: 5px 0; font-size: 14px; color: #10B981; font-weight: bold;">🎓 Carrera: ${lead.carrera_interes || 'Confirmada'}</p>
                    <p style="margin: 5px 0; font-size: 13px; color: #38bdf8; font-family: monospace;">🆔 CURP: ${lead.curp || 'N/A'}</p>
                    <p style="margin: 5px 0; font-size: 13px; color: #cbd5e1;">📱 Teléfono: ${lead.telefono_celular || 'N/A'} • ✉️ Correo: ${lead.correo_electronico || 'N/A'}</p>
                    <p style="margin: 8px 0 0 0; font-size: 12px; color: #94a3b8;">👤 Procesado por: ${payload.asesor || 'Asesor de Admisiones'}</p>
                </div>
            </div>
        </div>`;
    } else if (eventoTipo === 'ALERTA_SISTEMA') {
        const titulo = payload.titulo || 'Incidente Crítico en Servidor Metal-Uriel';
        const detalle = String(payload.detalle || 'Sin detalle técnico.').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const hw = setupUtils.getSystemHardwareReport(config.PORT);
        subject = `🚨 [ALERTA SERVIDOR METAL-URIEL] ${titulo}`;
        htmlContent = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; background: #0B192C; padding: 24px; color: #f8fafc;">
            <div style="max-width: 620px; margin: 0 auto; background: #1E293B; border-radius: 16px; overflow: hidden; border: 1px solid #7f1d1d; border-top: 6px solid #ef4444;">
                <div style="padding: 20px 24px; background: #450a0a; border-bottom: 1px solid #7f1d1d;">
                    <h2 style="margin: 0; font-size: 18px; color: #fecaca;">🚨 Alerta Crítica de Life Support — Metal-Uriel</h2>
                    <p style="margin: 4px 0 0 0; font-size: 12px; color: #fca5a5;">Host: ${hw.hostname} • ${fechaHora}</p>
                </div>
                <div style="padding: 24px;">
                    <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #fbbf24;">${titulo}</h3>
                    <pre style="background: #0F172A; border-radius: 10px; padding: 14px; border: 1px solid #334155; font-size: 12px; color: #f8fafc; white-space: pre-wrap; word-break: break-word;">${detalle}</pre>
                    <p style="margin: 14px 0 0 0; font-size: 12px; color: #94a3b8;">
                        💻 RAM Libre: ${hw.freeMemGB} GB / ${hw.totalMemGB} GB • URLs LAN: ${hw.lanUrls.join(', ') || 'localhost'}
                    </p>
                </div>
            </div>
        </div>`;
    }

    const nowIso = new Date().toISOString();
    const logItem = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        evento: eventoTipo,
        eventoTipo,
        destinatario,
        to: destinatario,
        asunto: subject,
        subject,
        fecha: nowIso,
        timestamp: nowIso,
        estado: 'enviando',
        status: 'ENVIANDO',
        transport: 'SMTP/Ethereal',
        previewUrl: null
    };
    emailNotificationHistory.unshift(logItem);
    if (emailNotificationHistory.length > 50) emailNotificationHistory.pop();

    try {
        const { transporter, from, mode } = await getMailTransporter();
        if (!transporter) {
            logItem.estado = 'simulado_consola';
            logItem.status = 'ENVIADO';
            logItem.transport = 'Consola';
            console.log(`📧 [EMAIL TRIGGER - ${eventoTipo}] Para: ${destinatario} | Asunto: "${subject}" (Modo consola)`);
            return logItem;
        }

        const info = await transporter.sendMail({ from, to: destinatario, subject, html: htmlContent });
        const previewUrl = mode === 'ethereal_test' ? nodemailer.getTestMessageUrl(info) : null;
        logItem.estado = mode === 'smtp_live' ? 'enviado_smtp' : 'enviado_ethereal';
        logItem.status = 'ENVIADO';
        logItem.transport = mode === 'smtp_live' ? 'SMTP Live' : 'Ethereal Test';
        logItem.previewUrl = previewUrl || null;

        if (isDatabaseReady()) {
            getPool().execute(
                'INSERT INTO bitacora_notificaciones_correo (evento_tipo, destinatario, asunto, estado, transporte, detalle) VALUES (?, ?, ?, ?, ?, ?)',
                [eventoTipo, destinatario, subject, logItem.estado, logItem.transport, previewUrl || null]
            ).catch(() => {});
        }
        return logItem;
    } catch (err) {
        logItem.estado = 'error: ' + err.message;
        logItem.status = 'ERROR';
        if (isDatabaseReady()) {
            getPool().execute(
                'INSERT INTO bitacora_notificaciones_correo (evento_tipo, destinatario, asunto, estado, transporte, detalle) VALUES (?, ?, ?, ?, ?, ?)',
                [eventoTipo, destinatario, subject, 'ERROR', 'SMTP', err.message]
            ).catch(() => {});
        }
        return logItem;
    }
}

async function enviarAlertaSistema(alertKey, titulo, detalle, force = false) {
    const adminEmail = (process.env.ALERT_ADMIN_EMAIL || process.env.ADMISSIONS_NOTIFICATION_EMAIL || '').trim();
    if (!adminEmail || setupUtils.isPlaceholderValue(adminEmail)) return null;
    const now = Date.now();
    const lastSent = systemAlertCooldowns.get(alertKey) || 0;
    if (!force && (now - lastSent) < (15 * 60 * 1000)) return null;
    systemAlertCooldowns.set(alertKey, now);
    return dispararNotificacionCorreo('ALERTA_SISTEMA', { to: adminEmail, titulo, detalle });
}

async function notificarEquipoAdmisiones(datos, insertId) {
    return dispararNotificacionCorreo('DATOS_COMPLETOS', { datos, insertId });
}

function recordLlmTelemetry(entry) {
    const tokensIn = entry.tokensIn || 0;
    const tokensOut = entry.tokensOut || 0;
    const costoMxn = securityUtils.estimateCostMxn(entry.provider, entry.model, tokensIn, tokensOut);
    const record = {
        sede_id: entry.sedeId || 'campeche',
        telefono_celular: entry.phone || null,
        proveedor: String(entry.provider || 'unknown').slice(0, 60),
        modelo: String(entry.model || 'unknown').slice(0, 100),
        latencia_ms: Math.max(0, Math.round(entry.latencyMs || 0)),
        tokens_est_in: tokensIn,
        tokens_est_out: tokensOut,
        costo_est_mxn: costoMxn,
        fue_fallback: entry.isFallback ? 1 : 0,
        exito: entry.success ? 1 : 0,
        error_detalle: entry.errorDetail ? String(entry.errorDetail).slice(0, 250) : null,
        created_at: new Date().toISOString()
    };

    llmTelemetryBuffer.unshift(record);
    if (llmTelemetryBuffer.length > 200) llmTelemetryBuffer.pop();

    if (isDatabaseReady() && process.env.NODE_ENV !== 'test') {
        getPool().execute(
            `INSERT INTO llm_telemetria (sede_id, telefono_celular, proveedor, modelo, latencia_ms, tokens_est_in, tokens_est_out, costo_est_mxn, fue_fallback, exito, error_detalle)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                record.sede_id, record.telefono_celular, record.proveedor, record.modelo,
                record.latencia_ms, record.tokens_est_in, record.tokens_est_out,
                record.costo_est_mxn, record.fue_fallback, record.exito, record.error_detalle
            ]
        ).catch(() => {});
    }

    const lfHost = (process.env.LANGFUSE_HOST || '').trim().replace(/\/+$/, '');
    const lfPub = (process.env.LANGFUSE_PUBLIC_KEY || '').trim();
    const lfSec = (process.env.LANGFUSE_SECRET_KEY || '').trim();
    if (lfHost && lfPub && lfSec && process.env.NODE_ENV !== 'test') {
        const authBasic = Buffer.from(`${lfPub}:${lfSec}`).toString('base64');
        const traceId = crypto.randomUUID ? crypto.randomUUID() : `trace_${Date.now()}`;
        axios.post(`${lfHost}/api/public/ingestion`, {
            batch: [{
                id: `${traceId}_gen`,
                type: 'generation-create',
                timestamp: record.created_at,
                body: {
                    id: traceId,
                    name: 'metal-uriel-chat',
                    model: record.modelo,
                    metadata: {
                        provider: record.proveedor,
                        sede_id: record.sede_id,
                        fue_fallback: Boolean(record.fue_fallback),
                        latency_ms: record.latencia_ms,
                        costo_est_mxn: record.costo_est_mxn
                    },
                    usage: { input: record.tokens_est_in, output: record.tokens_est_out, unit: 'TOKENS' },
                    level: record.exito ? 'DEFAULT' : 'ERROR',
                    statusMessage: record.error_detalle || 'OK'
                }
            }]
        }, {
            headers: { Authorization: `Basic ${authBasic}`, 'Content-Type': 'application/json' },
            timeout: 3000
        }).catch(() => {});
    }
}

module.exports = {
    getMailTransporter,
    dispararNotificacionCorreo,
    enviarAlertaSistema,
    notificarEquipoAdmisiones,
    recordLlmTelemetry
};
