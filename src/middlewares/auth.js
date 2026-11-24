const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { config } = require('../config/env');
const setupUtils = require('../../lib/setup-utils');
const securityUtils = require('../../lib/security-utils');

function normalizeRole(rawRole) {
    const r = String(rawRole || '').toLowerCase();
    if (r === 'desarrollador' || r === 'superadmin' || r === 'dev') return 'desarrollador';
    if (r === 'administrador' || r === 'admin') return 'administrador';
    return 'usuario';
}

function getRoleTitle(rol) {
    if (rol === 'desarrollador') return 'Desarrollador (Superadmin Global)';
    if (rol === 'administrador') return 'Administrador de Sede';
    return 'Usuario (Asesor de Admisiones)';
}

function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Acceso no autorizado. Se requiere token JWT.' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, config.JWT_SECRET);
        decoded.rol = normalizeRole(decoded.rol || decoded.role);
        req.user = decoded;
        return next();
    } catch (_) {
        return res.status(403).json({ error: 'Token inválido o expirado.' });
    }
}

function optionalAuthMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
            const decoded = jwt.verify(authHeader.split(' ')[1], config.JWT_SECRET);
            decoded.rol = normalizeRole(decoded.rol || decoded.role);
            req.user = decoded;
        } catch (_) {}
    }
    return next();
}

function authorizeRoles(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'No autenticado.' });
        }
        const userRol = normalizeRole(req.user.rol || req.user.role);
        if (!allowedRoles.includes(userRol)) {
            return res.status(403).json({
                error: `Permiso denegado. Tu rol actual (${userRol}) no tiene autorización para esta acción.`
            });
        }
        return next();
    };
}

function verifyMetaWebhookSignature(req, res, next) {
    const activeSecret = (config.META_APP_SECRET && !setupUtils.isPlaceholderValue(config.META_APP_SECRET))
        ? config.META_APP_SECRET
        : '';
    const check = securityUtils.verifyMetaSignature(req.rawBody, req.headers['x-hub-signature-256'], activeSecret);
    if (!check.valid) {
        console.warn(`🛡️ [META HMAC BLOQUEADO] ${check.reason} (IP: ${req.ip})`);
        return res.status(401).json({ error: 'Firma X-Hub-Signature-256 inválida.' });
    }
    return next();
}

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 25,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Demasiados intentos de inicio de sesión. Espera 15 minutos.' }
});

const chatLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Límite de mensajes por minuto alcanzado. Intenta de nuevo en unos segundos.' }
});

const webhookLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false
});

module.exports = {
    normalizeRole,
    getRoleTitle,
    authMiddleware,
    optionalAuthMiddleware,
    authorizeRoles,
    verifyMetaWebhookSignature,
    authLimiter,
    chatLimiter,
    webhookLimiter
};
