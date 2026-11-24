// =========================================================================
// Metal-Uriel v3 — Conector Dinámico de Servidor (Capacitor APK + Headless API)
// Permite apuntar la APK Android (o cliente estático) a cualquier servidor
// Metal-Uriel en Red LAN (http://192.168.x.x:3000) o Túnel HTTPS (Cloudflare).
// =========================================================================

const STORAGE_KEY = 'metal_uriel_server_url';
let interceptorInstalled = false;

export function isNativeCapacitor() {
    if (typeof window === 'undefined') return false;
    try {
        if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function') {
            return Boolean(window.Capacitor.isNativePlatform());
        }
    } catch (_) {}
    return ['capacitor:', 'ionic:'].includes(window.location.protocol);
}

export function normalizeServerUrl(raw) {
    if (!raw || typeof raw !== 'string') return '';
    let cleaned = raw.trim();
    if (!cleaned) return '';
    if (!/^https?:\/\//i.test(cleaned)) {
        cleaned = `http://${cleaned}`;
    }
    cleaned = cleaned.replace(/\/+$/, '');
    return cleaned;
}

export function validateServerUrl(raw) {
    const cleaned = normalizeServerUrl(raw);
    if (!cleaned) return 'Ingresa la URL de tu servidor Metal-Uriel (ej. https://admisiones.tudominio.mx o http://192.168.1.50:3000).';
    try {
        const parsed = new URL(cleaned);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return 'La URL debe iniciar con http:// o https://.';
        }
        if (!parsed.hostname) {
            return 'El host de la URL es inválido.';
        }
        return '';
    } catch (_) {
        return 'Formato de URL inválido. Ejemplo: http://192.168.1.50:3000 o https://tu-tunel.trycloudflare.com';
    }
}

export function getServerUrl() {
    if (typeof window === 'undefined') return '';
    return normalizeServerUrl(localStorage.getItem(STORAGE_KEY) || '');
}

export function saveServerUrl(rawUrl) {
    const cleaned = normalizeServerUrl(rawUrl);
    if (cleaned) {
        localStorage.setItem(STORAGE_KEY, cleaned);
    } else {
        localStorage.removeItem(STORAGE_KEY);
    }
    return cleaned;
}

export function clearServerUrl() {
    localStorage.removeItem(STORAGE_KEY);
}

export function resolveApiUrl(inputUrl) {
    if (!inputUrl || typeof inputUrl !== 'string') return inputUrl;
    const base = getServerUrl();
    if (!base) return inputUrl;
    if (inputUrl.startsWith('/api/') || inputUrl.startsWith('/uploads/') || inputUrl.startsWith('/webhook')) {
        return `${base}${inputUrl}`;
    }
    return inputUrl;
}

/**
 * Intercepta globalmente window.fetch para reescribir rutas relativas (/api/*, /uploads/*)
 * hacia la URL del servidor Headless/LAN cuando existe metal_uriel_server_url configurado.
 */
export function installApiFetchInterceptor() {
    if (typeof window === 'undefined' || interceptorInstalled) return;
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
        if (typeof input === 'string') {
            return originalFetch(resolveApiUrl(input), init);
        }
        if (input instanceof Request) {
            const url = input.url || '';
            const origin = window.location.origin;
            if (url.startsWith(`${origin}/api/`) || url.startsWith(`${origin}/uploads/`)) {
                const relative = url.slice(origin.length);
                const resolved = resolveApiUrl(relative);
                if (resolved !== relative) {
                    return originalFetch(new Request(resolved, input), init);
                }
            }
        }
        return originalFetch(input, init);
    };
    interceptorInstalled = true;
}

export async function testServerConnection(rawUrl) {
    const err = validateServerUrl(rawUrl);
    if (err) return { ok: false, error: err };
    const cleanUrl = normalizeServerUrl(rawUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const t0 = Date.now();
    try {
        const res = await fetch(`${cleanUrl}/api/health`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: controller.signal
        });
        clearTimeout(timer);
        if (!res.ok) {
            return { ok: false, error: `El servidor respondió HTTP ${res.status}. Verifica que Metal-Uriel esté corriendo.` };
        }
        const data = await res.json();
        return {
            ok: true,
            url: cleanUrl,
            latencyMs: Date.now() - t0,
            botName: data.botName || 'Metal-Uriel',
            mode: data.mode || 'full',
            dbConnected: Boolean(data.dbConnected),
            apiVersion: data.apiVersion || '3.0'
        };
    } catch (e) {
        clearTimeout(timer);
        const msg = e.name === 'AbortError'
            ? 'Tiempo de espera agotado (7s). Revisa tu Wi-Fi/Túnel y firewall del puerto 3000.'
            : `No se pudo conectar (${e.message}). Verifica IP/URL y que el servidor esté encendido.`;
        return { ok: false, error: msg };
    }
}
