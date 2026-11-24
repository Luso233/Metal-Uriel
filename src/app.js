const express = require('express');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const { config, ROOT_DIR } = require('./config/env');

const authRoutes = require('./routes/auth.routes');
const poolRoutes = require('./routes/pool.routes');
const aspirantesRoutes = require('./routes/aspirantes.routes');
const chatRoutes = require('./routes/chat.routes');
const tenantsRoutes = require('./routes/tenants.routes');
const webhookRoutes = require('./routes/webhook.routes');
const { router: setupRoutes } = require('./routes/setup.routes');

const app = express();
app.set('trust proxy', 1);

const DIST_DIR = path.join(ROOT_DIR, 'public', 'dist');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const hasCompiledFrontend = fs.existsSync(path.join(DIST_DIR, 'index.html'));

// ==========================================
// CORS Inteligente para Capacitor APK, Red LAN UNID y Cloudflare Tunnel
// ==========================================
const DEFAULT_ALLOWED_ORIGIN_PATTERNS = [
    /^capacitor:\/\/localhost$/i,
    /^ionic:\/\/localhost$/i,
    /^https?:\/\/localhost(:\d+)?$/i,
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/i,
    /^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/i,
    /^https:\/\/[a-z0-9-]+\.(trycloudflare\.com|ngrok-free\.app|ngrok\.io)$/i
];

function isAllowedCorsOrigin(origin) {
    if (!origin) return true; // Mismo origen, curl, Meta Webhook o apps nativas sin Origin
    const customOrigins = config.CORS_ORIGINS;
    if (customOrigins.includes('*') || customOrigins.includes(origin)) return true;
    return DEFAULT_ALLOWED_ORIGIN_PATTERNS.some(re => re.test(origin));
}

app.use(cors({
    origin: (origin, callback) => {
        if (isAllowedCorsOrigin(origin)) return callback(null, true);
        return callback(new Error(`Origen CORS no autorizado: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Hub-Signature-256']
}));

app.use(helmet({
    contentSecurityPolicy: hasCompiledFrontend ? {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
            imgSrc: ["'self'", 'data:', 'blob:', 'https:', 'http:'],
            mediaSrc: ["'self'", 'blob:', 'mediastream:'],
            frameSrc: ["'self'", 'https://www.youtube.com'],
            connectSrc: ["'self'", 'https:', 'http:']
        }
    } : false,
    crossOriginEmbedderPolicy: false
}));

app.use(express.json({
    limit: '25mb',
    verify: (req, _res, buf) => {
        req.rawBody = buf;
    }
}));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Servir archivos subidos (/uploads/recursos/*) siempre (necesario para PDFs e imágenes en WhatsApp y APK)
app.use('/uploads', express.static(path.join(PUBLIC_DIR, 'uploads')));

// Modo Headless: omite el servido de UI web y responde JSON de estado en GET /
app.get('/', (req, res, next) => {
    if (config.HEADLESS_MODE) {
        return res.json({
            service: 'Metal-Uriel Admissions Bot API',
            version: '3.0.0',
            mode: 'headless',
            uiServed: false,
            endpoints: {
                health: '/api/health',
                setupStatus: '/api/setup/status',
                login: '/api/auth/login',
                webhook: '/webhook'
            },
            message: 'Servidor Metal-Uriel operando en modo Headless (sin UI Web). Conéctate desde la APK Android Capacitor o un cliente externo.'
        });
    }
    return next();
});

const distStatic = express.static(DIST_DIR);
const publicStatic = express.static(PUBLIC_DIR);

app.use((req, res, next) => {
    if (config.HEADLESS_MODE) return next();
    if (hasCompiledFrontend) {
        return distStatic(req, res, () => publicStatic(req, res, next));
    }
    return publicStatic(req, res, next);
});

// Montar routers modulares
app.use(authRoutes);
app.use(poolRoutes);
app.use(aspirantesRoutes);
app.use(chatRoutes);
app.use(tenantsRoutes);
app.use(webhookRoutes);
app.use(setupRoutes);

// En modo Headless, devolver 404 JSON limpio para rutas web no encontradas
app.use((req, res, next) => {
    if (config.HEADLESS_MODE) {
        return res.status(404).json({
            error: 'Ruta no encontrada en servidor Metal-Uriel Headless.',
            mode: 'headless',
            path: req.path
        });
    }
    return next();
});

module.exports = { app, DIST_DIR, PUBLIC_DIR, isAllowedCorsOrigin };
