const crypto = require('crypto');
const QRCode = require('qrcode');

// =========================================================================
// Metal-Uriel — Vinculación Móvil por Código QR (WhatsApp Web Inverso)
// La PC genera un código QR temporal de un solo uso (120s) con la IP LAN
// y token efímero; el celular lo escanea y entra autenticado sin teclear nada.
// =========================================================================

const DEFAULT_TTL_MS = 120 * 1000; // 2 minutos
const pairingSessions = new Map(); // code -> sessionRecord
const pinIndex = new Map();        // 6-digit pin -> code

function pruneExpiredPairingSessions(now = Date.now()) {
    for (const [code, rec] of pairingSessions.entries()) {
        // Mantener registros reclamados 30s extra solo para que la PC vea el check verde
        const cutoff = rec.claimedAt ? (rec.claimedAt + 30000) : rec.expiresAt;
        if (now > cutoff) {
            pairingSessions.delete(code);
            if (rec.pin && pinIndex.get(rec.pin) === code) {
                pinIndex.delete(rec.pin);
            }
        }
    }
}

function generateSixDigitPin() {
    for (let i = 0; i < 12; i++) {
        const num = crypto.randomInt(100000, 1000000);
        const pin = String(num);
        if (!pinIndex.has(pin)) return pin;
    }
    return String(crypto.randomInt(100000, 1000000));
}

function sanitizeServerUrl(rawUrl) {
    const str = String(rawUrl || '').trim().replace(/\/+$/, '');
    if (!str) return '';
    try {
        const parsed = new URL(str);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
        return `${parsed.protocol}//${parsed.host}`;
    } catch (_) {
        return '';
    }
}

/**
 * Crea una sesión de vinculación móvil temporal (un solo uso) y genera su QR en SVG vectorial offline.
 */
async function createPairingSession({ user, serverUrl, ttlMs = DEFAULT_TTL_MS } = {}) {
    if (!user || (!user.correo_institucional && !user.username && !user.id)) {
        throw new Error('Usuario autenticado requerido para generar QR.');
    }
    const cleanUrl = sanitizeServerUrl(serverUrl);
    if (!cleanUrl) {
        throw new Error('URL de servidor válida requerida para el código QR.');
    }

    const now = Date.now();
    pruneExpiredPairingSessions(now);

    const code = crypto.randomBytes(18).toString('base64url');
    const pin = generateSixDigitPin();
    const expiresAt = now + Math.max(15000, Math.min(300000, Number(ttlMs) || DEFAULT_TTL_MS));
    const pairUrl = `${cleanUrl}/?pair=${encodeURIComponent(code)}`;

    // Snapshot limpio del usuario autenticado (sin campos exp/iat de un JWT previo)
    const userSnapshot = {
        id: user.id,
        correo_institucional: user.correo_institucional || user.username,
        username: user.username || user.correo_institucional,
        displayName: user.displayName || user.nombre_completo || user.correo_institucional,
        matricula: user.matricula || '',
        rol: user.rol || user.role || 'usuario',
        role: user.rol || user.role || 'usuario',
        roleTitle: user.roleTitle || '',
        sede_id: user.sede_id ?? null,
        tenant: user.tenant || '',
        isInstitutional: Boolean(user.isInstitutional ?? true)
    };

    const record = {
        code,
        pin,
        serverUrl: cleanUrl,
        pairUrl,
        user: userSnapshot,
        createdAt: now,
        expiresAt,
        claimedAt: null,
        claimedByDevice: null
    };

    pairingSessions.set(code, record);
    pinIndex.set(pin, code);

    const qrSvg = await QRCode.toString(pairUrl, {
        type: 'svg',
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 280,
        color: {
            dark: '#0B1220',
            light: '#FFFFFF'
        }
    });

    return {
        code,
        pin,
        pinFormatted: `${pin.slice(0, 3)}-${pin.slice(3)}`,
        serverUrl: cleanUrl,
        pairUrl,
        expiresAt: new Date(expiresAt).toISOString(),
        expiresInSec: Math.round((expiresAt - now) / 1000),
        qrSvg
    };
}

/**
 * Consulta el estado del código QR (para que la pantalla de la PC muestre confirmación instantánea).
 */
function getPairingStatus(code, ownerUserId = null) {
    pruneExpiredPairingSessions();
    const rec = pairingSessions.get(String(code || '').trim());
    if (!rec) return { found: false, status: 'expired' };
    if (ownerUserId !== null && ownerUserId !== undefined && Number(rec.user.id) !== Number(ownerUserId)) {
        return { found: false, status: 'forbidden' };
    }
    if (rec.claimedAt) {
        return {
            found: true,
            status: 'claimed',
            claimedAt: new Date(rec.claimedAt).toISOString(),
            claimedByDevice: rec.claimedByDevice || 'Dispositivo móvil'
        };
    }
    const remainingSec = Math.max(0, Math.ceil((rec.expiresAt - Date.now()) / 1000));
    if (remainingSec <= 0) {
        return { found: false, status: 'expired' };
    }
    return {
        found: true,
        status: 'pending',
        remainingSec,
        serverUrl: rec.serverUrl
    };
}

/**
 * Reclama y quema (single-use) un código QR o PIN de 6 dígitos para iniciar sesión en el móvil.
 */
function claimPairingSession({ code, pin, deviceLabel = 'App Móvil Metal-Uriel' } = {}) {
    const now = Date.now();
    pruneExpiredPairingSessions(now);

    let resolvedCode = String(code || '').trim();
    if (!resolvedCode && pin) {
        const cleanPin = String(pin).replace(/\D/g, '');
        resolvedCode = pinIndex.get(cleanPin) || '';
    }
    if (!resolvedCode) {
        return { ok: false, error: 'Código QR o PIN inválido.' };
    }

    const rec = pairingSessions.get(resolvedCode);
    if (!rec) {
        return { ok: false, error: 'El código QR expiró o ya fue utilizado. Genera uno nuevo en la PC.' };
    }
    if (rec.claimedAt) {
        return { ok: false, error: 'Este código QR ya fue utilizado (un solo uso). Genera uno nuevo en la PC.' };
    }
    if (now > rec.expiresAt) {
        pairingSessions.delete(resolvedCode);
        if (rec.pin) pinIndex.delete(rec.pin);
        return { ok: false, error: 'El código QR expiró (2 minutos). Genera uno nuevo en la PC.' };
    }

    // Quemar inmediatamente para evitar reuso / replay
    rec.claimedAt = now;
    rec.claimedByDevice = String(deviceLabel || 'App Móvil').slice(0, 100);
    if (rec.pin && pinIndex.get(rec.pin) === resolvedCode) {
        pinIndex.delete(rec.pin);
    }

    return {
        ok: true,
        user: rec.user,
        serverUrl: rec.serverUrl
    };
}

/**
 * Parsea el contenido escaneado de cualquier QR de Metal-Uriel:
 *   1. URL completa: http://192.168.1.70:3000/?pair=CODE
 *   2. Deep URI: metaluriel://pair?s=http://192.168.1.70:3000&c=CODE
 *   3. JSON: {"s":"http://192.168.1.70:3000","c":"CODE"}
 *   4. URL simple de servidor: http://192.168.1.70:3000
 */
function parsePairingPayload(rawText) {
    const text = String(rawText || '').trim();
    if (!text) return null;

    if (text.startsWith('{')) {
        try {
            const obj = JSON.parse(text);
            const serverUrl = sanitizeServerUrl(obj.s || obj.serverUrl || obj.url);
            const code = String(obj.c || obj.code || obj.pair || '').trim();
            if (serverUrl) return { serverUrl, code };
        } catch (_) {}
    }

    try {
        const u = new URL(text);
        if (u.protocol === 'metaluriel:') {
            const serverUrl = sanitizeServerUrl(u.searchParams.get('s') || u.searchParams.get('server'));
            const code = String(u.searchParams.get('c') || u.searchParams.get('code') || u.searchParams.get('pair') || '').trim();
            if (serverUrl) return { serverUrl, code };
        }
        if (u.protocol === 'http:' || u.protocol === 'https:') {
            const serverUrl = `${u.protocol}//${u.host}`;
            const code = String(u.searchParams.get('pair') || u.searchParams.get('code') || '').trim();
            return { serverUrl, code };
        }
    } catch (_) {}

    return null;
}

module.exports = {
    DEFAULT_TTL_MS,
    createPairingSession,
    getPairingStatus,
    claimPairingSession,
    parsePairingPayload,
    sanitizeServerUrl,
    pruneExpiredPairingSessions
};
