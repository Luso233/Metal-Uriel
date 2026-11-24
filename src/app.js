const express = require('express');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const { ROOT_DIR } = require('./config/env');

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

app.use(helmet({
    contentSecurityPolicy: hasCompiledFrontend ? {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
            imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
            frameSrc: ["'self'", 'https://www.youtube.com'],
            connectSrc: ["'self'"]
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

// Servir archivos subidos (/uploads/recursos/*) siempre desde public/uploads
app.use('/uploads', express.static(path.join(PUBLIC_DIR, 'uploads')));

// Priorizar el bundle Vite compilado (public/dist/) para operación 100% offline en LAN
if (hasCompiledFrontend) {
    app.use(express.static(DIST_DIR));
}
app.use(express.static(PUBLIC_DIR));

// Montar routers modulares
app.use(authRoutes);
app.use(poolRoutes);
app.use(aspirantesRoutes);
app.use(chatRoutes);
app.use(tenantsRoutes);
app.use(webhookRoutes);
app.use(setupRoutes);

module.exports = { app, DIST_DIR, PUBLIC_DIR };
