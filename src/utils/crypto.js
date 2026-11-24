const crypto = require('crypto');
const { config } = require('../config/env');

// ==========================================
// Criptografía AES-256-GCM para Secretos Multi-Tenant (SaaS)
// ==========================================
function encryptSecret(plainText) {
    if (!plainText || typeof plainText !== 'string' || !plainText.trim()) return null;
    try {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', config.CRYPTO_KEY, iv);
        let encrypted = cipher.update(plainText, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag().toString('hex');
        return `${iv.toString('hex')}:${authTag}:${encrypted}`;
    } catch (e) {
        console.error('❌ Error cifrando secreto:', e);
        return null;
    }
}

function decryptSecret(encryptedPayload) {
    if (!encryptedPayload || typeof encryptedPayload !== 'string' || !encryptedPayload.includes(':')) return null;
    try {
        const parts = encryptedPayload.split(':');
        if (parts.length !== 3) return null;
        const [ivHex, authTagHex, encryptedHex] = parts;
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-gcm', config.CRYPTO_KEY, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        console.warn('⚠️ Error descifrando secreto (posible cambio de clave o texto corrupto):', e.message);
        return null;
    }
}

function maskSecret(plainText) {
    if (!plainText || typeof plainText !== 'string') return '';
    if (plainText.length <= 8) return '••••••••';
    return plainText.substring(0, 4) + '••••••••' + plainText.substring(plainText.length - 4);
}

// ==========================================
// Criptografía de Contraseñas para RBAC (scrypt + salt + timingSafeEqual)
// ==========================================
function hashPassword(plainPassword) {
    if (!plainPassword) return '';
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = crypto.scryptSync(String(plainPassword), salt, 64).toString('hex');
    return `scrypt:${salt}:${derivedKey}`;
}

function verifyPassword(plainPassword, storedHash) {
    if (!plainPassword || !storedHash) return false;
    if (storedHash.startsWith('scrypt:')) {
        try {
            const parts = storedHash.split(':');
            if (parts.length !== 3) return false;
            const [, salt, keyHex] = parts;
            const derivedKey = crypto.scryptSync(String(plainPassword), salt, 64);
            const keyBuffer = Buffer.from(keyHex, 'hex');
            if (derivedKey.length !== keyBuffer.length) return false;
            return crypto.timingSafeEqual(derivedKey, keyBuffer);
        } catch (_) {
            return false;
        }
    }
    return String(plainPassword) === String(storedHash);
}

module.exports = {
    encryptSecret,
    decryptSecret,
    maskSecret,
    hashPassword,
    verifyPassword
};
